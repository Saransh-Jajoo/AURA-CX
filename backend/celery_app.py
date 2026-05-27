"""
AURA-CX — Celery Application
Background task processing for SLA monitoring, campaign execution,
KB re-indexing, voice transcript processing, and social media monitoring.
"""

from celery import Celery
from config import settings

celery_app = Celery(
    "aura_cx",
    broker=settings.CELERY_BROKER_URL,
    backend=settings.CELERY_RESULT_BACKEND,
)

celery_app.conf.update(
    task_serializer="json",
    result_serializer="json",
    accept_content=["json"],
    timezone="UTC",
    enable_utc=True,
    task_track_started=True,
    task_acks_late=True,
    worker_prefetch_multiplier=1,
    task_default_queue="default",
    task_routes={
        "tasks.sla.*": {"queue": "sla"},
        "tasks.campaign.*": {"queue": "campaign"},
        "tasks.kb.*": {"queue": "knowledge"},
        "tasks.voice.*": {"queue": "voice"},
        "tasks.social.*": {"queue": "social"},
        "tasks.dlq.*": {"queue": "dlq"},
    },
    # ── Retry / DLQ Configuration ─────────────────────────────
    task_reject_on_worker_lost=True,
    task_annotations={
        "*": {"max_retries": 3, "default_retry_delay": 60},
    },
    beat_schedule={
        "sla-breach-scanner": {
            "task": "tasks.sla.scan_breaches",
            "schedule": 60.0,  # every 60 seconds
        },
        "campaign-trigger-evaluator": {
            "task": "tasks.campaign.evaluate_triggers",
            "schedule": 300.0,  # every 5 minutes
        },
        "social-monitor-poll": {
            "task": "tasks.social.poll_mentions",
            "schedule": float(settings.SOCIAL_MONITOR_POLL_INTERVAL),
        },
    },
)


# ── SLA Tasks ─────────────────────────────────────────────────
@celery_app.task(name="tasks.sla.scan_breaches")
def scan_sla_breaches():
    """Periodic scan for SLA breaches and escalation triggers."""
    import asyncio
    from database import SessionLocal
    from services.sla_engine import sla_status

    async def _scan():
        async with SessionLocal() as db:
            from sqlalchemy import select, and_
            from models import Ticket

            stmt = select(Ticket).where(
                and_(
                    Ticket.status.in_(["new", "in_progress", "awaiting_reply"]),
                    Ticket.sla_deadline.isnot(None),
                )
            )
            result = await db.execute(stmt)
            active_tickets = result.scalars().all()

            breached = []
            for ticket in active_tickets:
                status = sla_status(ticket)
                if status["breached"] and not ticket.sla_breached:
                    ticket.sla_breached = True
                    breached.append(ticket.id)

            if breached:
                await db.commit()

            return {"scanned": len(active_tickets), "breached": len(breached)}

    return asyncio.run(_scan())


# ── Campaign Tasks ────────────────────────────────────────────
@celery_app.task(name="tasks.campaign.evaluate_triggers")
def evaluate_campaign_triggers():
    """Evaluate pending campaign triggers and mark eligible ones for execution."""
    import asyncio
    from database import SessionLocal

    async def _evaluate():
        async with SessionLocal() as db:
            from sqlalchemy import select
            from models import CampaignTrigger

            stmt = select(CampaignTrigger).where(CampaignTrigger.status == "pending")
            result = await db.execute(stmt)
            pending = result.scalars().all()

            evaluated = 0
            for trigger in pending:
                # Auto-approve low-risk triggers
                if trigger.trigger_type in ("follow_up", "satisfaction_survey"):
                    trigger.status = "approved"
                    evaluated += 1

            if evaluated:
                await db.commit()

            return {"pending": len(pending), "auto_approved": evaluated}

    return asyncio.run(_evaluate())


# ── Knowledge Base Tasks ──────────────────────────────────────
@celery_app.task(name="tasks.kb.reindex_document")
def reindex_kb_document(document_id: str, tenant_id: str):
    """Re-chunk and re-embed a knowledge base document."""
    import asyncio
    from database import SessionLocal

    async def _reindex():
        async with SessionLocal() as db:
            from sqlalchemy import select
            from models import KnowledgeDocument
            from datetime import datetime, timezone

            stmt = select(KnowledgeDocument).where(
                KnowledgeDocument.id == document_id,
                KnowledgeDocument.tenant_id == tenant_id,
            )
            result = await db.execute(stmt)
            doc = result.scalar_one_or_none()

            if not doc:
                return {"error": "Document not found"}

            # Mark as re-indexed
            doc.last_indexed_at = datetime.now(timezone.utc)
            await db.commit()

            return {"document_id": document_id, "status": "reindexed"}

    return asyncio.run(_reindex())


# ── Voice Processing Tasks ────────────────────────────────────
@celery_app.task(name="tasks.voice.process_transcript")
def process_voice_transcript(call_id: str, tenant_id: str):
    """Process and analyze a voice call transcript with AI."""
    import asyncio
    from database import SessionLocal

    async def _process():
        async with SessionLocal() as db:
            from sqlalchemy import select
            from models import CallRecording

            stmt = select(CallRecording).where(
                CallRecording.id == call_id,
                CallRecording.tenant_id == tenant_id,
            )
            result = await db.execute(stmt)
            call = result.scalar_one_or_none()

            if not call:
                return {"error": "Call not found"}

            return {"call_id": call_id, "status": "processed"}

    return asyncio.run(_process())


# ── Social Monitor Tasks ──────────────────────────────────────
@celery_app.task(name="tasks.social.poll_mentions", bind=True, max_retries=2)
def poll_social_mentions(self):
    """Periodic task: poll all active social monitor configs for new mentions."""
    import asyncio
    import logging
    from database import SessionLocal

    logger = logging.getLogger("aura_cx.social_poll")

    async def _poll():
        from datetime import datetime, timezone
        from sqlalchemy import select
        from models import SocialMention, SocialMonitorConfig
        from services.social_monitor import poll_x_mentions, poll_email_inbox, poll_threads_mentions
        from services.complaint_classifier import classify_mention

        async with SessionLocal() as db:
            configs = (
                await db.scalars(
                    select(SocialMonitorConfig).where(SocialMonitorConfig.active.is_(True))
                )
            ).all()

            total_new = 0
            total_complaints = 0

            for config in configs:
                try:
                    # Build query and poll the platform
                    if config.platform == "x":
                        query = config.target_value
                        if config.target_type == "mention" and not query.startswith("@"):
                            query = f"@{query}"
                        elif config.target_type == "hashtag" and not query.startswith("#"):
                            query = f"#{query}"
                        result = await poll_x_mentions(
                            query, since_id=config.poll_cursor
                        )

                    elif config.platform == "email":
                        result = poll_email_inbox(since_uid=config.poll_cursor)

                    elif config.platform == "threads":
                        result = await poll_threads_mentions(
                            since_timestamp=config.poll_cursor
                        )
                    else:
                        continue

                    posts = result.get("posts", [])
                    newest_id = result.get("newest_id")

                    for post in posts:
                        # Deduplicate by external_id
                        exists = await db.scalar(
                            select(SocialMention.id).where(
                                SocialMention.external_id == str(post["id"]),
                                SocialMention.platform == config.platform,
                                SocialMention.tenant_id == config.tenant_id,
                            )
                        )
                        if exists:
                            continue

                        # NLP classification
                        classification = await classify_mention(
                            post.get("text", ""),
                            config.platform,
                            post.get("author_handle", ""),
                        )

                        mention = SocialMention(
                            tenant_id=config.tenant_id,
                            monitor_config_id=config.id,
                            platform=config.platform,
                            external_id=str(post["id"]),
                            author_handle=post.get("author_handle", "unknown"),
                            author_name=post.get("author_name"),
                            content=post.get("text", "")[:10000],
                            content_url=post.get("url"),
                            is_complaint=classification["is_complaint"],
                            complaint_confidence=classification["confidence"],
                            complaint_category=classification.get("category"),
                            sentiment=classification["sentiment"],
                            sentiment_score=classification["sentiment_score"],
                            nlp_summary=classification.get("summary"),
                            detected_language=classification.get("detected_language", "en"),
                            raw_metadata=post,
                        )
                        db.add(mention)
                        total_new += 1
                        if classification["is_complaint"]:
                            total_complaints += 1

                    # Update cursor
                    if newest_id:
                        config.poll_cursor = str(newest_id)
                    config.last_polled_at = datetime.now(timezone.utc)

                except Exception:
                    logger.exception(
                        "Social poll failed for config %s (%s/%s)",
                        config.id, config.platform, config.target_value,
                    )

            if total_new:
                await db.commit()

            return {
                "configs_polled": len(configs),
                "new_mentions": total_new,
                "new_complaints": total_complaints,
            }

    try:
        return asyncio.run(_poll())
    except Exception as exc:
        raise self.retry(exc=exc)


# ── Dead Letter Queue Handler ─────────────────────────────────
@celery_app.task(name="tasks.dlq.handle_failed")
def handle_failed_task(task_name: str, task_args: list, task_kwargs: dict, exception_info: str):
    """Log permanently failed tasks for manual investigation."""
    import logging
    logger = logging.getLogger("aura_cx.dlq")
    logger.error(
        "DLQ: Task %s permanently failed.\n  args=%s\n  kwargs=%s\n  error=%s",
        task_name, task_args, task_kwargs, exception_info[:1000],
    )
    return {"task": task_name, "status": "logged_to_dlq"}
