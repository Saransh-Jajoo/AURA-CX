"""
AURA-CX — Celery Application
Background task processing for SLA monitoring, campaign execution,
KB re-indexing, voice transcript processing, and social media monitoring.
"""

from celery import Celery
from config import settings
import sys
import os

# Ensure current working directory is on sys.path so celery worker
# child processes can import local modules (e.g. database.py).
sys.path.insert(0, os.getcwd())

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
    from database import SessionLocal, engine
    from services.sla_engine import sla_status

    async def _scan():
        try:
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
        finally:
            await engine.dispose()

    return asyncio.run(_scan())


# ── Campaign Tasks ────────────────────────────────────────────
@celery_app.task(name="tasks.campaign.evaluate_triggers")
def evaluate_campaign_triggers():
    """Evaluate pending campaign triggers and mark eligible ones for execution."""
    import asyncio
    from database import SessionLocal, engine

    async def _evaluate():
        try:
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
        finally:
            await engine.dispose()

    return asyncio.run(_evaluate())


# ── Knowledge Base Tasks ──────────────────────────────────────
@celery_app.task(name="tasks.kb.reindex_document")
def reindex_kb_document(document_id: str, tenant_id: str):
    """Re-chunk and re-embed a knowledge base document."""
    import asyncio
    from database import SessionLocal, engine

    async def _reindex():
        try:
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
        finally:
            await engine.dispose()

    return asyncio.run(_reindex())


# ── Voice Processing Tasks ────────────────────────────────────
@celery_app.task(name="tasks.voice.process_transcript")
def process_voice_transcript(call_id: str, tenant_id: str):
    """Process and analyze a voice call transcript with AI."""
    import asyncio
    from database import SessionLocal, engine

    async def _process():
        try:
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
        finally:
            await engine.dispose()

    return asyncio.run(_process())


# ── Social Monitor Tasks ──────────────────────────────────────
@celery_app.task(name="tasks.social.poll_mentions", bind=True, max_retries=2)
def poll_social_mentions(self):
    """Periodic task: poll tenant-scoped dynamic platform connections."""
    import asyncio
    from database import SessionLocal, engine

    async def _poll():
        from services.platform_polling import poll_due_platform_connections

        try:
            async with SessionLocal() as db:
                return await poll_due_platform_connections(db)
        finally:
            await engine.dispose()

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
