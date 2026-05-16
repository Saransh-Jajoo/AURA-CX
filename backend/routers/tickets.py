"""Tenant-isolated ticket and HITL endpoints."""

from __future__ import annotations

import hmac
import secrets
from datetime import datetime, timedelta, timezone
from typing import Annotated

from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel, Field, field_validator
from sqlalchemy import func, select
from sqlalchemy.ext.asyncio import AsyncSession

from config import settings
from database import get_session
from models import RLHFSignal, Ticket, User
from security import assert_tenant, require_roles
from services import ai_service
from services.realtime import manager, ticket_to_dict

router = APIRouter()


class EditRequest(BaseModel):
    ticket_id: str | None = None
    signal_type: str = "corrective"
    original_draft: str = ""
    edited_draft: str = Field(min_length=1)


class HandoffRequest(BaseModel):
    channel: str

    @field_validator("channel")
    @classmethod
    def validate_channel(cls, value: str) -> str:
        value = value.lower()
        if value not in {"whatsapp", "chatbot"}:
            raise ValueError("channel must be whatsapp or chatbot")
        return value


async def _get_scoped_ticket(session: AsyncSession, user: User, ticket_id: str) -> Ticket:
    ticket = await session.get(Ticket, ticket_id)
    if ticket is None:
        raise HTTPException(status_code=404, detail="Ticket not found")
    assert_tenant(user, ticket.tenant_id)
    return ticket


@router.get("/tickets")
async def get_tickets(
    user: Annotated[User, Depends(require_roles("tenant_admin", "executive", "qa_reviewer", "support_agent"))],
    session: Annotated[AsyncSession, Depends(get_session)],
    tenant_id: str | None = None,
    limit: int = 100,
):
    scoped_tenant = assert_tenant(user, tenant_id)
    rows = (
        await session.scalars(
            select(Ticket)
            .where(Ticket.tenant_id == scoped_tenant)
            .order_by(Ticket.received_at.desc())
            .limit(min(max(limit, 1), 250))
        )
    ).all()
    total = await session.scalar(select(func.count(Ticket.id)).where(Ticket.tenant_id == scoped_tenant))
    return {"tickets": [ticket_to_dict(ticket) for ticket in rows], "total": total or 0}


@router.get("/tickets/kpi")
async def get_kpi_metrics(
    user: Annotated[User, Depends(require_roles("tenant_admin", "executive", "qa_reviewer", "support_agent"))],
    session: Annotated[AsyncSession, Depends(get_session)],
    tenant_id: str | None = None,
):
    scoped_tenant = assert_tenant(user, tenant_id)
    now = datetime.now(timezone.utc)
    today = now.replace(hour=0, minute=0, second=0, microsecond=0)
    active = await session.scalar(
        select(func.count(Ticket.id)).where(Ticket.tenant_id == scoped_tenant, Ticket.status.notin_(["resolved", "closed"]))
    )
    resolved = await session.scalar(
        select(func.count(Ticket.id)).where(Ticket.tenant_id == scoped_tenant, Ticket.status == "resolved", Ticket.updated_at >= today)
    )
    total = await session.scalar(select(func.count(Ticket.id)).where(Ticket.tenant_id == scoped_tenant))
    drafted = await session.scalar(select(func.count(Ticket.id)).where(Ticket.tenant_id == scoped_tenant, Ticket.ai_draft.is_not(None)))
    confidence = await session.scalar(select(func.avg(Ticket.confidence)).where(Ticket.tenant_id == scoped_tenant))
    critical = await session.scalar(select(func.count(Ticket.id)).where(Ticket.tenant_id == scoped_tenant, Ticket.severity == "critical"))
    return {
        "frt_seconds": 0,
        "automation_rate": float((drafted or 0) / total) if total else 0.0,
        "active_tickets": active or 0,
        "resolved_today": resolved or 0,
        "escalated": await session.scalar(select(func.count(Ticket.id)).where(Ticket.tenant_id == scoped_tenant, Ticket.status == "escalated")) or 0,
        "csat_score": 0.0,
        "channels_active": await session.scalar(select(func.count(func.distinct(Ticket.channel))).where(Ticket.tenant_id == scoped_tenant)) or 0,
        "ai_confidence_avg": float(confidence or 0.0),
        "shadow_tickets_active": 0,
        "high_risk_churn": critical or 0,
        "pipeline_latency_ms": 0,
        "throughput_per_min": 0.0,
    }


@router.get("/tickets/hitl")
async def get_hitl_queue(
    user: Annotated[User, Depends(require_roles("tenant_admin", "qa_reviewer", "support_agent"))],
    session: Annotated[AsyncSession, Depends(get_session)],
    tenant_id: str | None = None,
):
    scoped_tenant = assert_tenant(user, tenant_id)
    tickets = (
        await session.scalars(
            select(Ticket)
            .where(Ticket.tenant_id == scoped_tenant, Ticket.status.in_(["new", "in_progress", "awaiting_reply"]))
            .order_by(Ticket.received_at.desc())
            .limit(100)
        )
    ).all()
    queue = []
    for ticket in tickets:
        item = ticket_to_dict(ticket)
        item.update(
            {
                "ai_draft": ticket.ai_draft or "",
                "auto_approvable": bool(ticket.ai_draft and ticket.confidence >= settings.DRAFT_CONFIDENCE_THRESHOLD and ticket.severity != "critical"),
                "requires_senior_review": ticket.severity == "critical" or ticket.confidence < 0.7,
            }
        )
        queue.append(item)
    return {"queue": queue, "total": len(queue)}


@router.post("/tickets/{ticket_id}/draft")
async def draft_for_ticket(
    ticket_id: str,
    user: Annotated[User, Depends(require_roles("tenant_admin", "support_agent", "qa_reviewer"))],
    session: Annotated[AsyncSession, Depends(get_session)],
):
    ticket = await _get_scoped_ticket(session, user, ticket_id)
    result = await ai_service.generate_draft(tenant_id=ticket.tenant_id, ticket=ticket_to_dict(ticket))
    ticket.ai_draft = result["draft"]
    ticket.confidence = max(ticket.confidence, result["confidence"])
    ticket.rag_sources = result["rag_sources"]
    await session.commit()
    await manager.broadcast(ticket.tenant_id, {"type": "ticket_updated", "ticket": ticket_to_dict(ticket)})
    return result


@router.post("/tickets/{ticket_id}/approve")
async def approve_ticket(
    ticket_id: str,
    user: Annotated[User, Depends(require_roles("tenant_admin", "support_agent", "qa_reviewer"))],
    session: Annotated[AsyncSession, Depends(get_session)],
):
    ticket = await _get_scoped_ticket(session, user, ticket_id)
    ticket.status = "resolved"
    if ticket.ai_draft:
        session.add(
            RLHFSignal(
                tenant_id=ticket.tenant_id,
                ticket_id=ticket.id,
                user_id=user.id,
                signal_type="positive",
                original_draft=ticket.ai_draft,
            )
        )
    await session.commit()
    await manager.broadcast(ticket.tenant_id, {"type": "ticket_updated", "ticket": ticket_to_dict(ticket)})
    return {"ticket_id": ticket.id, "status": "approved", "action": "dispatched", "rlhf_signal": "positive"}


@router.post("/tickets/{ticket_id}/edit")
async def edit_ticket(
    ticket_id: str,
    body: EditRequest,
    user: Annotated[User, Depends(require_roles("tenant_admin", "support_agent", "qa_reviewer"))],
    session: Annotated[AsyncSession, Depends(get_session)],
):
    ticket = await _get_scoped_ticket(session, user, ticket_id)
    original = body.original_draft or ticket.ai_draft or ""
    ticket.ai_draft = body.edited_draft
    ticket.status = "resolved"
    session.add(
        RLHFSignal(
            tenant_id=ticket.tenant_id,
            ticket_id=ticket.id,
            user_id=user.id,
            signal_type="corrective",
            original_draft=original,
            edited_draft=body.edited_draft,
        )
    )
    await session.commit()
    await manager.broadcast(ticket.tenant_id, {"type": "ticket_updated", "ticket": ticket_to_dict(ticket)})
    return await ai_service.record_rlhf_signal(
        tenant_id=ticket.tenant_id,
        ticket_id=ticket.id,
        signal_type="corrective",
        original_draft=original,
        edited_draft=body.edited_draft,
    )


@router.post("/tickets/{ticket_id}/escalate")
async def escalate_ticket(
    ticket_id: str,
    user: Annotated[User, Depends(require_roles("tenant_admin", "support_agent", "qa_reviewer"))],
    session: Annotated[AsyncSession, Depends(get_session)],
):
    ticket = await _get_scoped_ticket(session, user, ticket_id)
    ticket.status = "escalated"
    await session.commit()
    await manager.broadcast(ticket.tenant_id, {"type": "ticket_updated", "ticket": ticket_to_dict(ticket)})
    return {"ticket_id": ticket.id, "status": "escalated", "action": "routed_to_senior"}


@router.post("/tickets/{ticket_id}/handoff")
async def create_handoff_link(
    ticket_id: str,
    body: HandoffRequest,
    user: Annotated[User, Depends(require_roles("tenant_admin", "support_agent", "qa_reviewer"))],
    session: Annotated[AsyncSession, Depends(get_session)],
):
    ticket = await _get_scoped_ticket(session, user, ticket_id)
    nonce = secrets.token_urlsafe(16)
    expires = int((datetime.now(timezone.utc) + timedelta(hours=2)).timestamp())
    payload = f"{ticket.tenant_id}:{ticket.id}:{body.channel}:{expires}:{nonce}"
    signature = hmac.new(settings.SECRET_KEY.encode("utf-8"), payload.encode("utf-8"), "sha256").hexdigest()
    token = f"{expires}.{nonce}.{signature}"
    if body.channel == "whatsapp":
        link = f"https://wa.me/?text=AURA-CX%20handoff%20{ticket.id}%20{token}"
    else:
        link = f"{settings.FRONTEND_URL.rstrip('/')}/chat/{ticket.id}?handoff={token}"
    return {"ticket_id": ticket.id, "channel": body.channel, "expires_at": expires, "deep_link": link}

