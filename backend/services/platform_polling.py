"""Tenant-scoped live platform polling from encrypted database credentials."""

from __future__ import annotations

import json
import logging
from datetime import datetime, timezone
from typing import Any

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from config import settings
from models import IntegrationSource, PlatformAPIConnection, SocialMention, SocialMonitorConfig, TenantConfig
from routers.ingestion import WebhookPayload, process_webhook_payload
from services.complaint_classifier import classify_mention
from services.encryption import decrypt_value
from services.encryption import encrypt_value
from services.social_monitor import (
    MonitorError,
    poll_email_inbox,
    poll_generic_http_platform,
    poll_reddit_mentions,
    poll_threads_mentions,
    poll_x_mentions,
)

logger = logging.getLogger("aura_cx.platform_polling")


def _banking_complaint_fallback(content: str) -> dict[str, Any] | None:
    lowered = content.lower()
    financial_terms = (
        "amount",
        "balance",
        "bank",
        "card",
        "charged",
        "credited",
        "debit",
        "debited",
        "deducted",
        "emi",
        "loan",
        "money",
        "paid",
        "payment",
        "refund",
        "reversal",
        "transaction",
        "transfer",
        "upi",
        "withdrawal",
    )
    problem_terms = (
        "bug",
        "complaint",
        "compliant",
        "complent",
        "dispute",
        "error",
        "failed",
        "fraud",
        "issue",
        "locked",
        "not credited",
        "not showing",
        "not working",
        "problem",
        "unauthorized",
        "wrong",
    )
    has_financial_context = any(term in lowered for term in financial_terms)
    has_problem_signal = any(term in lowered for term in problem_terms)

    if not (has_financial_context and has_problem_signal):
        return None

    if any(term in lowered for term in ("fraud", "unauthorized", "deducted", "debited", "charged")):
        category = "billing"
        sentiment_score = -0.72
    elif any(term in lowered for term in ("bug", "error", "not working", "not showing", "failed")):
        category = "app_bug"
        sentiment_score = -0.62
    else:
        category = "service_failure"
        sentiment_score = -0.55

    return {
        "is_complaint": True,
        "confidence": 0.86,
        "category": category,
        "sentiment": "frustrated",
        "sentiment_score": sentiment_score,
        "summary": "Banking complaint detected by deterministic fallback",
        "detected_language": "en",
        "suggested_action": "Create a ticket and verify the customer's transaction details.",
    }


def _load_credentials(connection: PlatformAPIConnection) -> dict[str, Any]:
    return json.loads(decrypt_value(connection.credentials_enc))


def _is_email_platform(platform: str) -> bool:
    return platform.lower() in {"gmail", "email", "imap"}


def _poll_due(connection: PlatformAPIConnection, now: datetime) -> bool:
    if not connection.last_polled_at:
        return True
    elapsed = (now - connection.last_polled_at).total_seconds()
    return elapsed >= connection.poll_interval_seconds


async def _poll_connection_api(connection: PlatformAPIConnection, credentials: dict[str, Any]) -> dict[str, Any]:
    platform = connection.platform_slug.lower()
    account = connection.account_identifier
    max_results = int(credentials.get("max_results") or 50)

    if platform in {"x", "twitter"}:
        query = str(credentials.get("query") or account)
        if not query.startswith("@"):
            query = f"@{query}"
        return await poll_x_mentions(
            query,
            bearer_token=str(credentials.get("bearer_token") or credentials.get("access_token") or ""),
            since_id=connection.poll_cursor,
            max_results=max_results,
        )

    if platform in {"gmail", "email", "imap"}:
        folder = str(credentials.get("folder") or "INBOX")
        return poll_email_inbox(
            folder,
            credentials=credentials,
            since_uid=connection.poll_cursor,
            max_results=max_results,
        )

    if platform == "threads":
        return await poll_threads_mentions(
            access_token=str(credentials.get("access_token") or ""),
            since_timestamp=connection.poll_cursor,
            max_results=max_results,
        )

    if platform == "reddit":
        return await poll_reddit_mentions(
            str(credentials.get("query") or account),
            credentials=credentials,
            after=connection.poll_cursor,
            max_results=max_results,
        )

    return await poll_generic_http_platform(
        account_identifier=account,
        credentials=credentials,
        cursor=connection.poll_cursor,
        max_results=max_results,
    )


async def _classify_safely(content: str, platform: str, author_handle: str) -> dict[str, Any]:
    try:
        classification = await classify_mention(content, platform, author_handle)
    except Exception:  # noqa: BLE001
        classification = {
            "is_complaint": False,
            "confidence": 0.0,
            "category": None,
            "sentiment": "neutral",
            "sentiment_score": 0.0,
            "summary": "Classification failed; deterministic fallback checked",
            "detected_language": "en",
            "suggested_action": None,
        }

    fallback = _banking_complaint_fallback(content)
    if fallback and (not classification.get("is_complaint") or float(classification.get("confidence", 0.0)) < 0.5):
        return fallback
    return classification


async def _promote_mention_to_ticket(
    *,
    session: AsyncSession,
    connection: PlatformAPIConnection,
    mention: SocialMention,
    sources: list[IntegrationSource],
    post: dict[str, Any] | None = None,
) -> bool:
    post = post or ((mention.raw_metadata or {}).get("post") if isinstance(mention.raw_metadata, dict) else {}) or {}
    payload = WebhookPayload(
        channel=connection.platform_slug,
        raw_content=mention.content,
        sender_id=mention.author_handle,
        sender_name=mention.author_name or mention.author_handle,
        external_id=mention.external_id,
        metadata={
            "target_account": connection.account_identifier,
            "dynamic_platform_connection_id": connection.id,
            "source_url": post.get("url") or mention.content_url,
            "email": post.get("sender_email") or post.get("reply_to") or mention.author_handle,
            "sender_email": post.get("sender_email") or mention.author_handle,
            "reply_to": post.get("reply_to"),
            "subject": post.get("subject"),
            "imap_uid": post.get("imap_uid"),
        },
    )
    ticket = await process_webhook_payload(
        session=session,
        tenant_id=connection.tenant_id,
        channel=connection.platform_slug,
        payload=payload,
        sources=sources,
    )
    mention.promoted_to_ticket_id = ticket.id
    mention.promoted_at = datetime.now(timezone.utc)
    return True


async def _runtime_rows(
    session: AsyncSession,
    connection: PlatformAPIConnection,
) -> tuple[SocialMonitorConfig | None, list[IntegrationSource]]:
    monitor = await session.get(SocialMonitorConfig, connection.monitor_config_id) if connection.monitor_config_id else None
    sources = (
        await session.scalars(
            select(IntegrationSource).where(
                IntegrationSource.tenant_id == connection.tenant_id,
                IntegrationSource.platform == connection.platform_slug,
                IntegrationSource.active.is_(True),
            )
        )
    ).all()
    return monitor, list(sources)


async def _ensure_runtime_rows(
    session: AsyncSession,
    connection: PlatformAPIConnection,
) -> tuple[SocialMonitorConfig, list[IntegrationSource]]:
    monitor, sources = await _runtime_rows(session, connection)
    if monitor is None:
        monitor = SocialMonitorConfig(
            tenant_id=connection.tenant_id,
            platform=connection.platform_slug,
            target_type="inbox" if _is_email_platform(connection.platform_slug) else "account",
            target_value=connection.account_identifier,
            label=f"{connection.platform_name} live account",
            active=connection.active,
        )
        session.add(monitor)
        await session.flush()
        connection.monitor_config_id = monitor.id

    if not sources:
        source = IntegrationSource(
            tenant_id=connection.tenant_id,
            platform=connection.platform_slug,
            identifier=connection.account_identifier,
            label=f"{connection.platform_name} inbox" if _is_email_platform(connection.platform_slug) else f"{connection.platform_name} official account",
            active=connection.active,
            filters={"dynamic_platform_connection_id": connection.id},
        )
        session.add(source)
        await session.flush()
        connection.integration_source_id = source.id
        sources = [source]

    return monitor, sources


async def _ensure_legacy_gmail_connections(session: AsyncSession) -> None:
    """Mirror tenant Gmail settings into pollable platform connections."""
    configs = (
        await session.scalars(
            select(TenantConfig).where(
                TenantConfig.gmail_imap_host.is_not(None),
                TenantConfig.gmail_imap_user_enc.is_not(None),
                TenantConfig.gmail_imap_pass_enc.is_not(None),
            )
        )
    ).all()
    for config in configs:
        user = decrypt_value(config.gmail_imap_user_enc or "").strip()
        password = decrypt_value(config.gmail_imap_pass_enc or "")
        if not user or not password:
            continue
        credentials = {
            "imap_host": config.gmail_imap_host or "imap.gmail.com",
            "imap_port": config.gmail_imap_port or 993,
            "imap_user": user,
            "imap_password": password,
            "imap_use_ssl": True,
            "folder": "INBOX",
            "max_results": 50,
        }
        connection = await session.scalar(
            select(PlatformAPIConnection).where(
                PlatformAPIConnection.tenant_id == config.tenant_id,
                PlatformAPIConnection.platform_slug == "gmail",
                PlatformAPIConnection.account_identifier == user,
            )
        )
        if connection is None:
            connection = PlatformAPIConnection(
                tenant_id=config.tenant_id,
                platform_name="Gmail",
                platform_slug="gmail",
                account_identifier=user,
                credentials_enc=encrypt_value(json.dumps(credentials)),
                active=True,
                poll_interval_seconds=300,
            )
            session.add(connection)
            await session.flush()
        else:
            connection.active = True
            connection.credentials_enc = encrypt_value(json.dumps(credentials))
        await _ensure_runtime_rows(session, connection)

    env_user = (settings.IMAP_USER or settings.SMTP_USER or "").strip()
    env_pass = (settings.IMAP_PASSWORD or settings.SMTP_PASS or "").strip()
    if env_user and env_pass:
        credentials = {
            "imap_host": settings.IMAP_HOST or "imap.gmail.com",
            "imap_port": settings.IMAP_PORT or 993,
            "imap_user": env_user,
            "imap_password": env_pass,
            "imap_use_ssl": settings.IMAP_USE_SSL,
            "folder": "INBOX",
            "max_results": 50,
        }
        connection = await session.scalar(
            select(PlatformAPIConnection).where(
                PlatformAPIConnection.tenant_id == settings.BOOTSTRAP_TENANT_ID,
                PlatformAPIConnection.platform_slug == "gmail",
                PlatformAPIConnection.account_identifier == env_user,
            )
        )
        if connection is None:
            connection = PlatformAPIConnection(
                tenant_id=settings.BOOTSTRAP_TENANT_ID,
                platform_name="Gmail",
                platform_slug="gmail",
                account_identifier=env_user,
                credentials_enc=encrypt_value(json.dumps(credentials)),
                active=True,
                poll_interval_seconds=settings.SOCIAL_MONITOR_POLL_INTERVAL,
            )
            session.add(connection)
            await session.flush()
        await _ensure_runtime_rows(session, connection)


async def poll_platform_connection(session: AsyncSession, connection: PlatformAPIConnection) -> dict[str, int]:
    """Poll one encrypted connection and promote live complaints to tickets."""
    monitor, sources = await _ensure_runtime_rows(session, connection)

    credentials = _load_credentials(connection)
    result = await _poll_connection_api(connection, credentials)
    posts = result.get("posts", [])
    newest_id = result.get("newest_id")

    new_mentions = 0
    new_complaints = 0
    tickets_created = 0

    for post in posts:
        external_id = str(post.get("id") or "")
        if not external_id:
            continue
        existing_mention = await session.scalar(
            select(SocialMention).where(
                SocialMention.external_id == external_id,
                SocialMention.platform == connection.platform_slug,
                SocialMention.tenant_id == connection.tenant_id,
            )
        )
        if existing_mention:
            if _is_email_platform(connection.platform_slug) and not existing_mention.promoted_to_ticket_id:
                if await _promote_mention_to_ticket(
                    session=session,
                    connection=connection,
                    mention=existing_mention,
                    sources=sources,
                    post=post,
                ):
                    tickets_created += 1
            continue

        content = str(post.get("text") or "")[:10000]
        author_handle = str(post.get("author_handle") or "unknown")
        classification = await _classify_safely(content, connection.platform_slug, author_handle)
        mention = SocialMention(
            tenant_id=connection.tenant_id,
            monitor_config_id=monitor.id,
            platform=connection.platform_slug,
            external_id=external_id,
            author_handle=author_handle,
            author_name=post.get("author_name"),
            content=content,
            content_url=post.get("url"),
            is_complaint=bool(classification["is_complaint"]),
            complaint_confidence=float(classification["confidence"]),
            complaint_category=classification.get("category"),
            sentiment=str(classification["sentiment"]),
            sentiment_score=float(classification["sentiment_score"]),
            nlp_summary=classification.get("summary"),
            detected_language=str(classification.get("detected_language", "en"))[:8],
            raw_metadata={"post": post, "dynamic_platform_connection_id": connection.id},
        )
        session.add(mention)
        await session.flush()
        new_mentions += 1

        should_create_ticket = _is_email_platform(connection.platform_slug) or (
            mention.is_complaint and mention.complaint_confidence >= settings.COMPLAINT_CONFIDENCE_THRESHOLD
        )
        if should_create_ticket:
            new_complaints += 1
            if await _promote_mention_to_ticket(
                session=session,
                connection=connection,
                mention=mention,
                sources=sources,
                post=post,
            ):
                tickets_created += 1

    # Auto-promote any existing email/gmail mentions that do not have a ticket
    if _is_email_platform(connection.platform_slug):
        unpromoted = (
            await session.scalars(
                select(SocialMention).where(
                    SocialMention.platform == connection.platform_slug,
                    SocialMention.tenant_id == connection.tenant_id,
                    SocialMention.promoted_to_ticket_id.is_(None),
                )
            )
        ).all()
        for old_mention in unpromoted:
            try:
                post_data = ((old_mention.raw_metadata or {}).get("post") if isinstance(old_mention.raw_metadata, dict) else {}) or {}
                if await _promote_mention_to_ticket(
                    session=session,
                    connection=connection,
                    mention=old_mention,
                    sources=sources,
                    post=post_data,
                ):
                    tickets_created += 1
            except Exception as exc:
                logger.error("Failed to promote old email mention %s: %s", old_mention.id, exc)

    if newest_id:
        connection.poll_cursor = str(newest_id)
    now = datetime.now(timezone.utc)
    connection.last_polled_at = now
    monitor.last_polled_at = now
    monitor.poll_cursor = connection.poll_cursor
    connection.last_error = None
    await session.commit()
    return {"new_mentions": new_mentions, "new_complaints": new_complaints, "tickets_created": tickets_created}


async def poll_due_platform_connections(session: AsyncSession) -> dict[str, int]:
    now = datetime.now(timezone.utc)
    await _ensure_legacy_gmail_connections(session)
    connections = (
        await session.scalars(
            select(PlatformAPIConnection).where(PlatformAPIConnection.active.is_(True))
        )
    ).all()

    totals = {"connections_seen": len(connections), "connections_polled": 0, "new_mentions": 0, "new_complaints": 0, "tickets_created": 0}
    for connection in connections:
        if not _poll_due(connection, now):
            continue
        try:
            result = await poll_platform_connection(session, connection)
            totals["connections_polled"] += 1
            totals["new_mentions"] += result["new_mentions"]
            totals["new_complaints"] += result["new_complaints"]
            totals["tickets_created"] += result["tickets_created"]
        except MonitorError as exc:
            connection.last_error = str(exc)
            connection.last_polled_at = datetime.now(timezone.utc)
            await session.commit()
        except Exception as exc:  # noqa: BLE001
            logger.exception("Dynamic platform poll failed for %s", connection.id)
            connection.last_error = str(exc)[:1000]
            connection.last_polled_at = datetime.now(timezone.utc)
            await session.commit()
    return totals
