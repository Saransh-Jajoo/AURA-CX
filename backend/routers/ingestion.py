"""Signed live webhooks for X, Reddit, and Gmail."""

from __future__ import annotations

import json
from datetime import datetime, timezone
from typing import Annotated

from fastapi import APIRouter, Body, Depends, Header, HTTPException, Request
from pydantic import BaseModel, Field, field_validator
from sqlalchemy import or_, select
from sqlalchemy.ext.asyncio import AsyncSession

from config import settings
from database import get_session
from models import CustomerProfile, IntegrationSource, Ticket, User
from routers.integrations import verify_webhook_source
from security import assert_tenant, require_roles, verify_webhook_signature
from services import ai_service
from services.deduplication import get_dedup_service
from services.realtime import manager, ticket_to_dict
from services.scrubbing import scrub_text

router = APIRouter()

ALLOWED_CHANNELS = {"x", "reddit", "gmail"}


class WebhookPayload(BaseModel):
    channel: str | None = None
    raw_content: str = Field(min_length=1)
    sender_id: str = Field(min_length=1, max_length=512)
    sender_name: str | None = Field(default=None, max_length=255)
    product: str | None = Field(default=None, max_length=255)
    external_id: str | None = Field(default=None, max_length=512)
    metadata: dict = Field(default_factory=dict)

    @field_validator("channel")
    @classmethod
    def validate_channel(cls, value: str | None) -> str | None:
        if value is None:
            return value
        value = value.lower().strip()
        if value not in ALLOWED_CHANNELS:
            raise ValueError("channel must be x, reddit, or gmail")
        return value


def _source_matches(source: IntegrationSource, payload: WebhookPayload) -> bool:
    haystack = " ".join(
        [
            payload.sender_id or "",
            payload.sender_name or "",
            payload.raw_content or "",
            " ".join(str(value) for value in payload.metadata.values()),
        ]
    ).lower()
    identifier = source.identifier.lower()
    if identifier in haystack:
        return True
    filters = source.filters or {}
    handles = [str(item).lower() for item in filters.get("handles", [])]
    hashtags = [str(item).lower().lstrip("#") for item in filters.get("hashtags", [])]
    subreddits = [str(item).lower().lstrip("r/") for item in filters.get("subreddits", [])]
    if handles and any(handle in haystack for handle in handles):
        return True
    if hashtags and any(f"#{tag}" in haystack or tag in haystack for tag in hashtags):
        return True
    if subreddits and any(subreddit in haystack for subreddit in subreddits):
        return True
    return False


async def _get_or_create_profile(
    session: AsyncSession,
    *,
    tenant_id: str,
    channel: str,
    handle: str,
    name: str,
    embedding: list[float],
) -> tuple[CustomerProfile, dict]:
    identity = {"matched": False, "cosine_similarity": 0.0, "method": "Vector Similarity (Cosine > 0.92)"}
    email = handle.lower() if channel == "gmail" and "@" in handle else None

    if email:
        profile = await session.scalar(select(CustomerProfile).where(CustomerProfile.tenant_id == tenant_id, CustomerProfile.email == email))
        if profile is None:
            profile = CustomerProfile(tenant_id=tenant_id, email=email, name=name or email.split("@")[0])
            session.add(profile)
            await session.flush()
        profile.identity_vectors = {**(profile.identity_vectors or {}), "email_vector": embedding[:8]}
        profile.identity_score = 1.0
        profile.identity_method = "Verified CRM/Gmail email"
        await ai_service.upsert_identity_vector(tenant_id=tenant_id, profile_id=profile.id, channel=channel, handle=email, vector=embedding)
        return profile, {"matched": True, "cosine_similarity": 1.0, "profile_id": profile.id, "method": profile.identity_method}

    identity = await ai_service.resolve_identity(tenant_id=tenant_id, embedding=embedding, channel=channel, handle=handle)
    profile = None
    if identity.get("matched") and identity.get("profile_id"):
        profile = await session.get(CustomerProfile, identity["profile_id"])

    if profile is None:
        query = select(CustomerProfile).where(CustomerProfile.tenant_id == tenant_id)
        if channel == "x":
            query = query.where(CustomerProfile.x_handle == handle)
        elif channel == "reddit":
            query = query.where(CustomerProfile.reddit_handle == handle)
        profile = await session.scalar(query)

    if profile is None:
        profile = CustomerProfile(tenant_id=tenant_id, name=name or handle)
        if channel == "x":
            profile.x_handle = handle
        elif channel == "reddit":
            profile.reddit_handle = handle
        session.add(profile)
        await session.flush()
    else:
        if channel == "x" and not profile.x_handle:
            profile.x_handle = handle
        if channel == "reddit" and not profile.reddit_handle:
            profile.reddit_handle = handle

    vector_key = "x_vector" if channel == "x" else "reddit_vector"
    profile.identity_vectors = {**(profile.identity_vectors or {}), vector_key: embedding[:8]}
    profile.identity_score = max(profile.identity_score or 0, float(identity.get("cosine_similarity") or 0))
    profile.identity_method = identity.get("method")
    await ai_service.upsert_identity_vector(tenant_id=tenant_id, profile_id=profile.id, channel=channel, handle=handle, vector=embedding)
    identity["profile_id"] = profile.id
    return profile, identity


async def process_webhook_payload(
    *,
    session: AsyncSession,
    tenant_id: str,
    channel: str,
    payload: WebhookPayload,
    sources: list[IntegrationSource],
) -> Ticket:
    if not any(_source_matches(source, payload) for source in sources):
        raise HTTPException(status_code=403, detail="Webhook did not match any active tenant listener")

    scrubbed = scrub_text(payload.raw_content)
    try:
        classification = await ai_service.classify_ticket(scrubbed["cleaned_text"], channel)
        embedding = await ai_service.embed_text(scrubbed["cleaned_text"])
    except ai_service.AIConfigurationError as exc:
        raise HTTPException(status_code=503, detail=str(exc)) from exc

    product = str(classification.get("product") or payload.product or "unspecified")[:255]
    profile, identity = await _get_or_create_profile(
        session,
        tenant_id=tenant_id,
        channel=channel,
        handle=payload.sender_id,
        name=payload.sender_name or payload.sender_id,
        embedding=embedding,
    )

    sentiment_score = float(classification.get("sentiment_score") or 0.0)
    profile.churn_risk = max(0.0, min(1.0, (-sentiment_score + 1) / 2))
    profile.tags = sorted(set((profile.tags or []) + [product, str(classification.get("intent") or "unclassified")]))[:12]

    ticket = Ticket(
        tenant_id=tenant_id,
        profile_id=profile.id,
        channel=channel,
        customer_name=profile.name or payload.sender_name or payload.sender_id,
        customer_handle=payload.sender_id,
        message=scrubbed["cleaned_text"],
        product=product,
        intent=str(classification.get("intent") or "unclassified")[:255],
        severity=str(classification.get("severity") or "medium")[:32],
        sentiment=str(classification.get("sentiment") or "unknown")[:64],
        sentiment_score=sentiment_score,
        confidence=float(classification.get("confidence") or 0.0),
        pii_report=scrubbed["pii_report"],
        toxicity_score=scrubbed["toxicity_score"],
        embedding=embedding,
        event_metadata={
            "external_id": payload.external_id,
            "received_at": datetime.now(timezone.utc).isoformat(),
            "source_match_count": len(sources),
            "identity_resolution": identity,
            "provider_metadata": payload.metadata,
        },
    )
    session.add(ticket)
    await session.commit()
    await session.refresh(ticket)
    await manager.broadcast(tenant_id, {"type": "new_ticket", "ticket": ticket_to_dict(ticket)})
    return ticket


@router.post("/webhooks/{tenant_id}/{channel}")
async def ingest_webhook(
    tenant_id: str,
    channel: str,
    request: Request,
    session: Annotated[AsyncSession, Depends(get_session)],
    x_aura_webhook_signature: Annotated[str | None, Header(alias="X-Aura-Webhook-Signature")] = None,
):
    """
    Receive signed webhooks from external providers (X, Reddit, Gmail).
    
    Security: Requires HMAC-SHA256 signature verification on the raw request body.
    The signature must be provided in the X-Aura-Webhook-Signature header.
    
    Deduplication: Uses Redis to detect and reject duplicate messages.
    """
    channel = channel.lower()
    if channel not in ALLOWED_CHANNELS:
        raise HTTPException(status_code=400, detail="Unsupported channel")
    
    # Get raw request body for HMAC verification
    body = await request.body()
    
    # Verify webhook signature (HMAC-SHA256)
    if not settings.WEBHOOK_SIGNING_SECRET:
        raise HTTPException(
            status_code=500,
            detail="Webhook signing not configured on server",
        )
    
    if not x_aura_webhook_signature:
        raise HTTPException(
            status_code=401,
            detail="Missing X-Aura-Webhook-Signature header",
        )
    
    try:
        if not verify_webhook_signature(
            settings.WEBHOOK_SIGNING_SECRET,
            body,
            x_aura_webhook_signature,
        ):
            raise HTTPException(
                status_code=401,
                detail="Invalid webhook signature",
            )
    except ValueError as exc:
        raise HTTPException(status_code=500, detail=str(exc)) from exc
    
    # Parse JSON payload after signature verification
    try:
        payload_dict = json.loads(body.decode("utf-8"))
        payload = WebhookPayload(**payload_dict)
    except (json.JSONDecodeError, ValueError) as exc:
        raise HTTPException(status_code=400, detail=f"Invalid payload: {exc}") from exc
    
    # ── Deduplication Check ───────────────────────────────────────
    dedup_service = get_dedup_service()
    message_id = payload.external_id or payload.sender_id
    is_new_message = dedup_service.check_and_mark_processed(
        tenant_id=tenant_id,
        platform=channel,
        message_id=message_id,
        ttl_seconds=86400,  # 24 hour dedup window
    )
    
    if not is_new_message:
        # Duplicate message detected — return success to avoid webhook retry loop
        return {
            "status": "duplicate_skipped",
            "message_id": message_id,
            "reason": "Message was already processed",
        }
    # ──────────────────────────────────────────────────────────────
    
    # Find matching sources for this tenant/channel
    sources = (
        await session.scalars(
            select(IntegrationSource).where(
                IntegrationSource.tenant_id == tenant_id,
                IntegrationSource.platform == channel,
                IntegrationSource.active.is_(True),
            )
        )
    ).all()
    
    ticket = await process_webhook_payload(
        session=session,
        tenant_id=tenant_id,
        channel=channel,
        payload=payload,
        sources=list(sources),
    )
    return {"status": "ingested", "ticket": ticket_to_dict(ticket)}


@router.post("/ingest/{channel}")
async def ingest_with_jwt(
    channel: str,
    payload: WebhookPayload,
    user: Annotated[User, Depends(require_roles("tenant_admin", "support_agent"))],
    session: Annotated[AsyncSession, Depends(get_session)],
    tenant_id: str | None = None,
):
    scoped_tenant = assert_tenant(user, tenant_id)
    sources = (
        await session.scalars(
            select(IntegrationSource).where(
                IntegrationSource.tenant_id == scoped_tenant,
                IntegrationSource.platform == channel.lower(),
                IntegrationSource.active.is_(True),
            )
        )
    ).all()
    ticket = await process_webhook_payload(
        session=session,
        tenant_id=scoped_tenant,
        channel=channel.lower(),
        payload=payload,
        sources=list(sources),
    )
    return {"status": "ingested", "ticket": ticket_to_dict(ticket)}

