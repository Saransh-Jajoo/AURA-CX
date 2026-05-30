"""Signed live webhooks for X, Reddit, Gmail, WhatsApp, and web forms."""

from __future__ import annotations

import json
import logging
from datetime import datetime, timezone, timedelta
from typing import Annotated

from fastapi import APIRouter, Body, Depends, Header, HTTPException, Request
from pydantic import BaseModel, Field, field_validator
from sqlalchemy import or_, select
from sqlalchemy.ext.asyncio import AsyncSession

from config import settings
from database import get_session
from models import CustomerProfile, EmailVerificationToken, IntegrationSource, TenantConfig, Ticket, User
from routers.integrations import verify_webhook_source
from security import assert_tenant, require_roles, verify_webhook_signature
from services import ai_service
from services.ai_providers import tenant_provider_configs
from services.deduplication import get_dedup_service
from services.realtime import manager, ticket_to_dict
from services.scrubbing import scrub_text
from services.sla_engine import assign_sla

logger = logging.getLogger("aura_cx.ingestion")

router = APIRouter()

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
        if not value or len(value) > 128 or not all(ch.isalnum() or ch in {"_", "-"} for ch in value):
            raise ValueError("channel must be a valid platform slug")
        return value


def _source_matches(source: IntegrationSource, payload: WebhookPayload) -> bool:
    # Direct email matching to bypass search vulnerabilities
    p_chan = (payload.channel or "").lower().strip()
    s_plat = (source.platform or "").lower().strip()
    if p_chan in {"gmail", "email", "imap"} and s_plat in {"gmail", "email", "imap"}:
        target = str(payload.metadata.get("target_account") or "").lower().strip()
        if source.identifier.lower().strip() == target:
            return True

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


def _fallback_ticket_classification(text: str) -> dict:
    lowered = text.lower()
    severity = "medium"
    sentiment = "neutral"
    sentiment_score = 0.0
    intent = "Email Inquiry"
    if any(term in lowered for term in ("fraud", "unauthorized", "deducted", "debited", "charged", "hack", "breach")):
        intent = "Billing Dispute"
        severity = "critical"
        sentiment = "furious"
        sentiment_score = -0.8
    elif any(term in lowered for term in ("refund", "payment", "transaction", "upi", "loan", "emi", "card")):
        intent = "Billing Dispute"
        severity = "high"
        sentiment = "frustrated"
        sentiment_score = -0.55
    elif any(term in lowered for term in ("login", "password", "locked", "account")):
        intent = "Account Issue"
        severity = "high"
        sentiment = "frustrated"
        sentiment_score = -0.45
    elif any(term in lowered for term in ("error", "failed", "bug", "not working", "crash")):
        intent = "Service Failure"
        severity = "medium"
        sentiment = "frustrated"
        sentiment_score = -0.35
    return {
        "intent": intent,
        "severity": severity,
        "sentiment": sentiment,
        "sentiment_score": sentiment_score,
        "confidence": 0.62,
        "product": "Banking Support",
    }


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
    
    import re
    from email.utils import parseaddr
    email_regex = re.compile(r"^[^@\s]+@[^@\s]+\.[^@\s]+$")
    email = None
    clean_handle = handle.strip()
    
    if (channel.lower() in {"gmail", "email", "imap", "web_form"}) and "@" in clean_handle:
        _, parsed_email = parseaddr(clean_handle)
        candidate = (parsed_email or clean_handle).strip().lower()
        if email_regex.match(candidate):
            email = candidate

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
        elif channel == "whatsapp":
            query = query.where(CustomerProfile.whatsapp_id == handle)
        profile = await session.scalar(query)

    if profile is None:
        profile = CustomerProfile(tenant_id=tenant_id, name=name or handle)
        if channel == "x":
            profile.x_handle = handle
        elif channel == "reddit":
            profile.reddit_handle = handle
        elif channel == "whatsapp":
            profile.whatsapp_id = handle
        session.add(profile)
        await session.flush()
    else:
        if channel == "x" and not profile.x_handle:
            profile.x_handle = handle
        if channel == "reddit" and not profile.reddit_handle:
            profile.reddit_handle = handle
        if channel == "whatsapp" and not profile.whatsapp_id:
            profile.whatsapp_id = handle

    vector_key = f"{channel}_vector"
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
    except Exception as exc:  # noqa: BLE001
        classification = _fallback_ticket_classification(scrubbed["cleaned_text"])
        payload.metadata = {
            **(payload.metadata or {}),
            "classification_fallback": str(exc)[:500],
        }
    try:
        embedding = await ai_service.embed_text(scrubbed["cleaned_text"])
    except Exception as exc:  # noqa: BLE001
        embedding = [0.0] * 768
        payload.metadata = {
            **(payload.metadata or {}),
            "embedding_fallback": str(exc)[:500],
        }

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

    # Determine if email verification is required for this email channel
    requires_verification = (
        channel.lower() in {"gmail", "email", "imap", "web_form"}
        and profile.email
        and not profile.email_verified
    )

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
        requires_email_verification=requires_verification,
        email_verified=profile.email_verified,
        event_metadata={
            "external_id": payload.external_id,
            "received_at": datetime.now(timezone.utc).isoformat(),
            "source_match_count": len(sources),
            "identity_resolution": identity,
            "provider_metadata": payload.metadata,
        },
    )
    session.add(ticket)
    await session.flush()
    await assign_sla(session, ticket)
    try:
        config = await session.scalar(select(TenantConfig).where(TenantConfig.tenant_id == tenant_id))
        
        # Build customer context for personalized draft
        customer_context = {
            "customer_segment": profile.customer_segment,
            "ltv": profile.ltv,
            "churn_risk": profile.churn_risk,
            "plan": profile.plan,
            "tags": profile.tags or [],
            "ticket_interaction_history": profile.ticket_interaction_history or [],
        }
        
        draft = await ai_service.generate_draft(
            tenant_id=tenant_id,
            ticket=ticket_to_dict(ticket),
            customer_context=customer_context,
            provider_configs=tenant_provider_configs(config),
            preferred_provider=config.ai_provider if config else None,
            fallback_order=config.ai_fallback_order if config else None,
            brand_tone=config.brand_tone if config else None,
        )
        ticket.ai_draft = draft["draft"]
        ticket.confidence = max(ticket.confidence, float(draft.get("confidence") or 0.0))
        ticket.rag_sources = draft.get("rag_sources") or []
    except Exception as exc:  # noqa: BLE001
        ticket.event_metadata = {
            **(ticket.event_metadata or {}),
            "draft_generation_error": str(exc)[:500],
        }
    await session.commit()
    await session.refresh(ticket)
    
    # Send verification email if this is a new email user
    if ticket.requires_email_verification and profile.email:
        try:
            # Create or get verification token
            existing_token = await session.scalar(
                select(EmailVerificationToken).where(
                    EmailVerificationToken.profile_id == profile.id,
                    EmailVerificationToken.email == profile.email,
                    EmailVerificationToken.verified_at.is_(None),
                )
            )
            
            if existing_token:
                token = existing_token.token
            else:
                now = datetime.now(timezone.utc)
                new_token = EmailVerificationToken(
                    profile_id=profile.id,
                    email=profile.email,
                    expires_at=now + timedelta(hours=24),
                )
                session.add(new_token)
                await session.flush()
                token = new_token.token
            
            # Build verification URL
            verification_url = f"{settings.APP_URL}/verify-email?token={token}"
            
            # Send email (if notification service is configured)
            try:
                from services.notification import send_email
                await send_email(
                    to=profile.email,
                    subject="Verify your email to activate your support ticket",
                    html_body=f"""
                    <h2>Email Verification Required</h2>
                    <p>Hi {profile.name},</p>
                    <p>Thank you for contacting AURA-CX support. We received your message about: <strong>{ticket.intent}</strong></p>
                    <p>To process your ticket and receive updates, please verify your email address:</p>
                    <p><a href="{verification_url}" style="background-color: #007bff; color: white; padding: 10px 20px; text-decoration: none; border-radius: 5px;">Verify Email Address</a></p>
                    <p>Ticket ID: {ticket.id}</p>
                    <p>This link will expire in 24 hours.</p>
                    """,
                )
                ticket.email_verification_sent_at = datetime.now(timezone.utc)
                await session.commit()
            except Exception as exc:
                logger.warning(f"Failed to send verification email for ticket {ticket.id}: {exc}")
        except Exception as exc:
            logger.error(f"Error creating verification token for ticket {ticket.id}: {exc}")
    
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
    if not channel or len(channel) > 128 or not all(ch.isalnum() or ch in {"_", "-"} for ch in channel):
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
    if settings.ENVIRONMENT.lower() == "production":
        raise HTTPException(status_code=403, detail="Development ingestion is disabled in production")

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


# ── Email Verification Endpoints ──────────────────────────────
@router.post("/verify-email/send")
async def send_verification_email(
    profile_id: str,
    user: Annotated[User, Depends(require_roles("tenant_admin", "support_agent"))],
    session: Annotated[AsyncSession, Depends(get_session)],
    tenant_id: str | None = None,
):
    """Send a verification email to a customer profile."""
    scoped_tenant = assert_tenant(user, tenant_id)
    profile = await session.get(CustomerProfile, profile_id)
    
    if not profile or profile.tenant_id != scoped_tenant:
        raise HTTPException(status_code=404, detail="Profile not found")
    
    if not profile.email:
        raise HTTPException(status_code=400, detail="Profile has no email address")
    
    if profile.email_verified:
        return {"status": "already_verified", "email": profile.email}
    
    # Create verification token
    now = datetime.now(timezone.utc)
    token = EmailVerificationToken(
        profile_id=profile_id,
        email=profile.email,
        expires_at=now + timedelta(hours=24),
    )
    session.add(token)
    await session.flush()
    
    # Build verification URL
    verification_url = f"{settings.APP_URL}/verify-email?token={token.token}"
    
    # Send email (if notification service is configured)
    try:
        from services.notification import send_email
        await send_email(
            to=profile.email,
            subject="Verify your email address",
            html_body=f"""
            <h2>Email Verification</h2>
            <p>Hi {profile.name},</p>
            <p>Please verify your email address by clicking the link below:</p>
            <p><a href="{verification_url}">Verify Email</a></p>
            <p>This link will expire in 24 hours.</p>
            """,
        )
    except Exception as exc:
        logger.warning(f"Failed to send verification email: {exc}")
    
    await session.commit()
    return {
        "status": "verification_email_sent",
        "email": profile.email,
        "token": token.token,  # Return token for development/testing
        "expires_in_hours": 24,
    }


@router.post("/verify-email/confirm")
async def confirm_email_verification(
    token: str,
    session: Annotated[AsyncSession, Depends(get_session)],
):
    """Verify an email address using a verification token."""
    now = datetime.now(timezone.utc)
    
    # Find the verification token
    verification = await session.scalar(
        select(EmailVerificationToken).where(
            EmailVerificationToken.token == token,
            EmailVerificationToken.verified_at.is_(None),
            EmailVerificationToken.expires_at > now,
        )
    )
    
    if not verification:
        raise HTTPException(status_code=400, detail="Invalid or expired verification token")
    
    # Mark email as verified
    profile = await session.get(CustomerProfile, verification.profile_id)
    if not profile:
        raise HTTPException(status_code=404, detail="Profile not found")
    
    profile.email_verified = True
    profile.verified_at = now
    verification.verified_at = now
    
    await session.commit()
    await session.refresh(profile)
    
    return {
        "status": "email_verified",
        "profile_id": profile.id,
        "email": profile.email,
        "verified_at": profile.verified_at.isoformat(),
    }


@router.get("/verify-email/status/{profile_id}")
async def get_verification_status(
    profile_id: str,
    user: Annotated[User, Depends(require_roles("tenant_admin", "support_agent"))],
    session: Annotated[AsyncSession, Depends(get_session)],
    tenant_id: str | None = None,
):
    """Get email verification status for a profile."""
    scoped_tenant = assert_tenant(user, tenant_id)
    profile = await session.get(CustomerProfile, profile_id)
    
    if not profile or profile.tenant_id != scoped_tenant:
        raise HTTPException(status_code=404, detail="Profile not found")
    
    return {
        "profile_id": profile.id,
        "email": profile.email,
        "email_verified": profile.email_verified,
        "verified_at": profile.verified_at.isoformat() if profile.verified_at else None,
    }


@router.post("/verify-email/confirm-ticket")
async def confirm_ticket_email_verification(
    token: str,
    session: Annotated[AsyncSession, Depends(get_session)],
):
    """Verify email and activate ticket using a verification token."""
    now = datetime.now(timezone.utc)
    
    # Find the verification token
    verification = await session.scalar(
        select(EmailVerificationToken).where(
            EmailVerificationToken.token == token,
            EmailVerificationToken.verified_at.is_(None),
            EmailVerificationToken.expires_at > now,
        )
    )
    
    if not verification:
        raise HTTPException(status_code=400, detail="Invalid or expired verification token")
    
    # Mark email as verified
    profile = await session.get(CustomerProfile, verification.profile_id)
    if not profile:
        raise HTTPException(status_code=404, detail="Profile not found")
    
    profile.email_verified = True
    profile.verified_at = now
    verification.verified_at = now
    
    # Update all pending tickets for this profile
    pending_tickets = (
        await session.scalars(
            select(Ticket).where(
                Ticket.profile_id == profile.id,
                Ticket.requires_email_verification.is_(True),
                Ticket.email_verified.is_(False),
            )
        )
    ).all()
    
    for ticket in pending_tickets:
        ticket.email_verified = True
        # Re-enable SLA tracking if it was paused
        if not ticket.status or ticket.status == "pending_verification":
            ticket.status = "new"
    
    await session.commit()
    
    return {
        "status": "email_verified",
        "profile_id": profile.id,
        "email": profile.email,
        "verified_at": profile.verified_at.isoformat(),
        "tickets_activated": len(pending_tickets),
        "message": f"Email verified! {len(pending_tickets)} ticket(s) have been activated.",
    }
