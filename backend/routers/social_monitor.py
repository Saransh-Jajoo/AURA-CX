"""Social media monitoring endpoints.

CRUD for monitor configurations, list captured mentions,
and promote complaints to support tickets.
"""

from __future__ import annotations

from datetime import datetime, timezone
from typing import Annotated

from fastapi import APIRouter, Depends, HTTPException, Query
from pydantic import BaseModel, Field, field_validator
from sqlalchemy import func, select
from sqlalchemy.ext.asyncio import AsyncSession

from config import settings
from database import get_session
from models import SocialMention, SocialMonitorConfig, Ticket, User
from security import assert_tenant, require_roles

router = APIRouter()

ALLOWED_TARGET_TYPES = {"mention", "hashtag", "keyword", "inbox", "account"}


# ── Schemas ───────────────────────────────────────────────────

class MonitorConfigIn(BaseModel):
    platform: str
    target_type: str
    target_value: str = Field(min_length=1, max_length=512)
    label: str | None = Field(default=None, max_length=255)
    active: bool = True

    @field_validator("platform")
    @classmethod
    def validate_platform(cls, v: str) -> str:
        v = v.lower().strip()
        if not v or len(v) > 128 or not all(ch.isalnum() or ch in {"_", "-"} for ch in v):
            raise ValueError("platform must be a valid platform slug")
        return v

    @field_validator("target_type")
    @classmethod
    def validate_target_type(cls, v: str) -> str:
        v = v.lower().strip()
        if v not in ALLOWED_TARGET_TYPES:
            raise ValueError(f"target_type must be one of: {', '.join(sorted(ALLOWED_TARGET_TYPES))}")
        return v


class PromoteRequest(BaseModel):
    product: str | None = Field(default=None, max_length=255)


# ── Helpers ───────────────────────────────────────────────────

def _config_to_dict(config: SocialMonitorConfig) -> dict:
    return {
        "id": config.id,
        "tenant_id": config.tenant_id,
        "platform": config.platform,
        "target_type": config.target_type,
        "target_value": config.target_value,
        "label": config.label,
        "active": config.active,
        "last_polled_at": config.last_polled_at.isoformat() if config.last_polled_at else None,
        "created_at": config.created_at.isoformat(),
    }


def _mention_to_dict(mention: SocialMention) -> dict:
    return {
        "id": mention.id,
        "platform": mention.platform,
        "external_id": mention.external_id,
        "author_handle": mention.author_handle,
        "author_name": mention.author_name,
        "content": mention.content,
        "content_url": mention.content_url,
        "is_complaint": mention.is_complaint,
        "complaint_confidence": mention.complaint_confidence,
        "complaint_category": mention.complaint_category,
        "sentiment": mention.sentiment,
        "sentiment_score": mention.sentiment_score,
        "nlp_summary": mention.nlp_summary,
        "detected_language": mention.detected_language,
        "promoted_to_ticket_id": mention.promoted_to_ticket_id,
        "promoted_at": mention.promoted_at.isoformat() if mention.promoted_at else None,
        "captured_at": mention.captured_at.isoformat(),
    }


# ── Monitor Config CRUD ──────────────────────────────────────

@router.get("/social-monitor/configs")
async def list_monitor_configs(
    user: Annotated[User, Depends(require_roles("tenant_admin", "support_agent"))],
    session: Annotated[AsyncSession, Depends(get_session)],
    tenant_id: str | None = None,
):
    scoped_tenant = assert_tenant(user, tenant_id)
    configs = (
        await session.scalars(
            select(SocialMonitorConfig)
            .where(SocialMonitorConfig.tenant_id == scoped_tenant)
            .order_by(SocialMonitorConfig.created_at.desc())
        )
    ).all()
    return {
        "configs": [_config_to_dict(c) for c in configs],
        "total": len(configs),
        "providers": {
            "x": bool(settings.X_BEARER_TOKEN),
            "email": bool(settings.IMAP_HOST and settings.IMAP_USER),
            "threads": bool(settings.THREADS_ACCESS_TOKEN),
        },
    }


@router.post("/social-monitor/configs")
async def create_monitor_config(
    body: MonitorConfigIn,
    user: Annotated[User, Depends(require_roles("tenant_admin"))],
    session: Annotated[AsyncSession, Depends(get_session)],
):
    tenant_id = assert_tenant(user, None)
    config = SocialMonitorConfig(
        tenant_id=tenant_id,
        platform=body.platform,
        target_type=body.target_type,
        target_value=body.target_value.strip(),
        label=body.label,
        active=body.active,
    )
    session.add(config)
    await session.commit()
    await session.refresh(config)
    return {"status": "created", "config": _config_to_dict(config)}


@router.patch("/social-monitor/configs/{config_id}")
async def update_monitor_config(
    config_id: str,
    body: MonitorConfigIn,
    user: Annotated[User, Depends(require_roles("tenant_admin"))],
    session: Annotated[AsyncSession, Depends(get_session)],
):
    config = await session.get(SocialMonitorConfig, config_id)
    if config is None:
        raise HTTPException(status_code=404, detail="Monitor config not found")
    assert_tenant(user, config.tenant_id)
    config.platform = body.platform
    config.target_type = body.target_type
    config.target_value = body.target_value.strip()
    config.label = body.label
    config.active = body.active
    await session.commit()
    return {"status": "updated", "config": _config_to_dict(config)}


@router.delete("/social-monitor/configs/{config_id}")
async def delete_monitor_config(
    config_id: str,
    user: Annotated[User, Depends(require_roles("tenant_admin"))],
    session: Annotated[AsyncSession, Depends(get_session)],
):
    config = await session.get(SocialMonitorConfig, config_id)
    if config is None:
        raise HTTPException(status_code=404, detail="Monitor config not found")
    assert_tenant(user, config.tenant_id)
    await session.delete(config)
    await session.commit()
    return {"status": "deleted", "id": config_id}


# ── Mentions ─────────────────────────────────────────────────

@router.get("/social-monitor/mentions")
async def list_mentions(
    user: Annotated[User, Depends(require_roles("tenant_admin", "support_agent", "qa_reviewer"))],
    session: Annotated[AsyncSession, Depends(get_session)],
    tenant_id: str | None = None,
    complaints_only: bool = False,
    platform: str | None = None,
    limit: int = Query(default=50, le=200),
    offset: int = 0,
):
    scoped_tenant = assert_tenant(user, tenant_id)
    query = select(SocialMention).where(SocialMention.tenant_id == scoped_tenant)
    if complaints_only:
        query = query.where(SocialMention.is_complaint.is_(True))
    if platform:
        query = query.where(SocialMention.platform == platform.lower())
    query = query.order_by(SocialMention.captured_at.desc()).offset(offset).limit(limit)
    mentions = (await session.scalars(query)).all()

    total = await session.scalar(
        select(func.count(SocialMention.id)).where(SocialMention.tenant_id == scoped_tenant)
    )
    complaint_count = await session.scalar(
        select(func.count(SocialMention.id)).where(
            SocialMention.tenant_id == scoped_tenant,
            SocialMention.is_complaint.is_(True),
        )
    )

    return {
        "mentions": [_mention_to_dict(m) for m in mentions],
        "total": total or 0,
        "complaint_count": complaint_count or 0,
        "offset": offset,
        "limit": limit,
    }


@router.post("/social-monitor/mentions/{mention_id}/promote")
async def promote_to_ticket(
    mention_id: str,
    user: Annotated[User, Depends(require_roles("tenant_admin", "support_agent"))],
    session: Annotated[AsyncSession, Depends(get_session)],
    body: PromoteRequest | None = None,
):
    """Promote a social mention to a support ticket."""
    mention = await session.get(SocialMention, mention_id)
    if mention is None:
        raise HTTPException(status_code=404, detail="Mention not found")
    assert_tenant(user, mention.tenant_id)

    if mention.promoted_to_ticket_id:
        raise HTTPException(status_code=409, detail="Already promoted to a ticket")

    ticket = Ticket(
        tenant_id=mention.tenant_id,
        channel=mention.platform,
        customer_name=mention.author_name or mention.author_handle,
        customer_handle=mention.author_handle,
        message=mention.content,
        product=(body.product if body else None) or "unspecified",
        intent=mention.complaint_category or "unclassified",
        severity="high" if mention.complaint_confidence > 0.85 else "medium",
        sentiment=mention.sentiment,
        sentiment_score=mention.sentiment_score,
        confidence=mention.complaint_confidence,
        detected_language=mention.detected_language,
        event_metadata={
            "source": "social_monitor",
            "mention_id": mention.id,
            "original_url": mention.content_url,
            "nlp_summary": mention.nlp_summary,
        },
    )
    session.add(ticket)
    await session.flush()

    mention.promoted_to_ticket_id = ticket.id
    mention.promoted_at = datetime.now(timezone.utc)
    mention.promoted_by = user.id

    await session.commit()
    await session.refresh(ticket)

    return {
        "status": "promoted",
        "ticket_id": ticket.id,
        "mention_id": mention.id,
    }


# ── Analytics ────────────────────────────────────────────────

@router.get("/social-monitor/analytics")
async def monitor_analytics(
    user: Annotated[User, Depends(require_roles("tenant_admin", "executive", "qa_reviewer"))],
    session: Annotated[AsyncSession, Depends(get_session)],
    tenant_id: str | None = None,
):
    scoped_tenant = assert_tenant(user, tenant_id)
    total = await session.scalar(
        select(func.count(SocialMention.id)).where(SocialMention.tenant_id == scoped_tenant)
    ) or 0
    complaints = await session.scalar(
        select(func.count(SocialMention.id)).where(
            SocialMention.tenant_id == scoped_tenant,
            SocialMention.is_complaint.is_(True),
        )
    ) or 0
    promoted = await session.scalar(
        select(func.count(SocialMention.id)).where(
            SocialMention.tenant_id == scoped_tenant,
            SocialMention.promoted_to_ticket_id.isnot(None),
        )
    ) or 0

    platform_counts = (
        await session.execute(
            select(SocialMention.platform, func.count(SocialMention.id))
            .where(SocialMention.tenant_id == scoped_tenant)
            .group_by(SocialMention.platform)
        )
    ).all()

    return {
        "total_mentions": total,
        "complaint_count": complaints,
        "complaint_rate": round(complaints / max(total, 1) * 100, 1),
        "promoted_count": promoted,
        "platform_breakdown": {p: c for p, c in platform_counts},
        "active_monitors": await session.scalar(
            select(func.count(SocialMonitorConfig.id)).where(
                SocialMonitorConfig.tenant_id == scoped_tenant,
                SocialMonitorConfig.active.is_(True),
            )
        ) or 0,
    }
