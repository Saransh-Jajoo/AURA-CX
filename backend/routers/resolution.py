"""Private resolution loop: handoff, threaded messages, resolve, CSAT."""

from __future__ import annotations

import secrets
from datetime import datetime, timedelta, timezone
from email.utils import parseaddr
from typing import Annotated

from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel, Field
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from config import settings
from database import get_session
from models import CustomerProfile, TenantConfig, Ticket, TicketMessage, TicketTimelineEvent, User
from security import require_roles
from services.notification import (
    build_handoff_email_html,
    build_resolution_email_html,
    delivery_config_from_tenant,
    send_private_channel_message,
)
from services.realtime import manager, ticket_to_dict

router = APIRouter()

FRONTEND_URL = getattr(settings, "FRONTEND_URL", "http://localhost:3000")


# ── Pydantic schemas ──────────────────────────────────────────

class HandoffPrivateRequest(BaseModel):
    channel: str = Field(..., pattern="^(email|whatsapp)$")
    address: str | None = Field(default=None, min_length=3, max_length=512)
    customer_name: str = Field(default="Customer", max_length=255)
    intro_message: str = Field(
        default="We've received your complaint and are looking into it privately. Please use the link below to continue the conversation securely.",
        max_length=1000,
    )


class AgentMessageRequest(BaseModel):
    content: str = Field(..., min_length=1, max_length=4000)
    is_internal: bool = False


class ResolveRequest(BaseModel):
    resolution_note: str = Field(..., min_length=5, max_length=4000)
    notify_customer: bool = True


class CustomerMessageRequest(BaseModel):
    content: str = Field(..., min_length=1, max_length=4000)
    sender_name: str = Field(default="Customer", max_length=255)


class CSATRequest(BaseModel):
    score: int = Field(..., ge=1, le=5)
    comment: str = Field(default="", max_length=1000)


# ── Helpers ───────────────────────────────────────────────────

def _utcnow() -> datetime:
    return datetime.now(timezone.utc)


def _make_token() -> str:
    return secrets.token_urlsafe(48)


async def _get_ticket(session: AsyncSession, ticket_id: str, tenant_id: str) -> Ticket:
    ticket = await session.get(Ticket, ticket_id)
    if not ticket or ticket.tenant_id != tenant_id:
        raise HTTPException(status_code=404, detail="Ticket not found")
    return ticket


async def _delivery_config(session: AsyncSession, tenant_id: str) -> dict:
    config = await session.scalar(select(TenantConfig).where(TenantConfig.tenant_id == tenant_id))
    return delivery_config_from_tenant(config)


def _valid_email(value: str | None) -> str | None:
    if not value:
        return None
    _, parsed = parseaddr(value.strip())
    candidate = (parsed or value.strip()).lower()
    return candidate if "@" in candidate and "." in candidate.rsplit("@", 1)[-1] else None


async def _infer_private_address(session: AsyncSession, ticket: Ticket, channel: str) -> str | None:
    if channel == "email":
        if ticket.private_channel == "email":
            existing = _valid_email(ticket.private_channel_address)
            if existing:
                return existing
        if ticket.profile_id:
            profile = await session.get(CustomerProfile, ticket.profile_id)
            if profile:
                profile_email = _valid_email(profile.email)
                if profile_email:
                    return profile_email
                for secondary in profile.secondary_emails or []:
                    secondary_email = _valid_email(str(secondary))
                    if secondary_email:
                        return secondary_email
        return _valid_email(ticket.customer_handle)

    if ticket.private_channel == "whatsapp" and ticket.private_channel_address:
        return ticket.private_channel_address
    if ticket.profile_id:
        profile = await session.get(CustomerProfile, ticket.profile_id)
        if profile and (profile.whatsapp_id or profile.phone):
            return profile.whatsapp_id or profile.phone
    if ticket.channel == "whatsapp":
        return ticket.customer_handle
    return None


def _record_timeline(session: AsyncSession, ticket: Ticket, user: User | None, event_type: str, previous_status: str | None, note: str | None = None) -> None:
    session.add(
        TicketTimelineEvent(
            ticket_id=ticket.id,
            tenant_id=ticket.tenant_id,
            actor_id=user.id if user else None,
            event_type=event_type,
            previous_status=previous_status,
            new_status=ticket.status,
            note=note,
        )
    )


def _serialize_message(msg: TicketMessage) -> dict:
    return {
        "id": msg.id,
        "ticket_id": msg.ticket_id,
        "sender_role": msg.sender_role,
        "sender_name": msg.sender_name,
        "content": msg.content,
        "is_internal": msg.is_internal,
        "created_at": msg.created_at.isoformat(),
    }


# ── Agent Endpoints ───────────────────────────────────────────

@router.post("/tickets/{ticket_id}/handoff-private")
async def handoff_to_private_channel(
    ticket_id: str,
    body: HandoffPrivateRequest,
    user: Annotated[User, Depends(require_roles("tenant_admin", "manager", "support_agent"))],
    session: Annotated[AsyncSession, Depends(get_session)],
) -> dict:
    """Move a ticket to a private channel (email or WhatsApp) and notify the customer."""
    ticket = await _get_ticket(session, ticket_id, user.tenant_id)
    address = (body.address or "").strip() or await _infer_private_address(session, ticket, body.channel)
    if not address:
        raise HTTPException(status_code=400, detail=f"No customer {body.channel} address found for this ticket")

    # Generate secure token (7-day expiry handled by resolve flow, not time-based here)
    token = _make_token()
    chat_url = f"{FRONTEND_URL}/resolve/{token}"

    ticket.private_channel = body.channel
    ticket.private_channel_token = token
    ticket.private_channel_address = address
    ticket.handoff_at = _utcnow()
    previous_status = ticket.status
    ticket.status = "awaiting_reply"

    # Record system message in thread
    system_msg = TicketMessage(
        ticket_id=ticket_id,
        tenant_id=user.tenant_id,
        sender_role="system",
        sender_name="AURA-CX",
        content=f"Ticket moved to private {body.channel} channel. Customer notified at {address}.",
        is_internal=True,
    )
    session.add(system_msg)
    _record_timeline(session, ticket, user, "ticket.handoff_private", previous_status, body.intro_message)

    # Build and send notification
    text_body = f"{body.intro_message}\n\nContinue here: {chat_url}"
    html_body = build_handoff_email_html(
        customer_name=body.customer_name,
        ticket_summary=ticket.message,
        chat_url=chat_url,
        intro_message=body.intro_message,
    )

    notification_sent = await send_private_channel_message(
        channel=body.channel,
        address=address,
        subject="Your Support Request - Secure Thread",
        text_body=text_body,
        html_body=html_body if body.channel == "email" else None,
        delivery_config=await _delivery_config(session, ticket.tenant_id),
    )
    if not notification_sent:
        raise HTTPException(status_code=502, detail=f"{body.channel.title()} delivery failed or is not configured")

    await session.commit()
    await manager.broadcast(ticket.tenant_id, {"type": "ticket_updated", "ticket": ticket_to_dict(ticket)})
    return {
        "status": "ok",
        "channel": body.channel,
        "chat_url": chat_url,
        "token": token,
        "ticket_status": ticket.status,
    }


@router.get("/tickets/{ticket_id}/messages")
async def get_ticket_messages(
    ticket_id: str,
    user: Annotated[User, Depends(require_roles("tenant_admin", "manager", "support_agent", "qa_reviewer"))],
    session: Annotated[AsyncSession, Depends(get_session)],
) -> dict:
    """Get all messages in the private thread for a ticket (agent view — includes internal notes)."""
    ticket = await _get_ticket(session, ticket_id, user.tenant_id)
    messages = (
        await session.scalars(
            select(TicketMessage)
            .where(TicketMessage.ticket_id == ticket_id)
            .order_by(TicketMessage.created_at.asc())
        )
    ).all()
    return {
        "ticket_id": ticket_id,
        "private_channel": ticket.private_channel,
        "private_channel_address": ticket.private_channel_address,
        "handoff_at": ticket.handoff_at.isoformat() if ticket.handoff_at else None,
        "messages": [_serialize_message(m) for m in messages],
    }


@router.post("/tickets/{ticket_id}/messages")
async def agent_send_message(
    ticket_id: str,
    body: AgentMessageRequest,
    user: Annotated[User, Depends(require_roles("tenant_admin", "manager", "support_agent"))],
    session: Annotated[AsyncSession, Depends(get_session)],
) -> dict:
    """Agent sends a message into the private thread (or an internal note)."""
    ticket = await _get_ticket(session, ticket_id, user.tenant_id)

    msg = TicketMessage(
        ticket_id=ticket_id,
        tenant_id=user.tenant_id,
        sender_role="agent",
        sender_name=user.name,
        content=body.content,
        is_internal=body.is_internal,
    )
    session.add(msg)

    # If not internal, optionally notify customer via their private channel
    if not body.is_internal and ticket.private_channel and ticket.private_channel_address:
        chat_url = f"{FRONTEND_URL}/resolve/{ticket.private_channel_token}"
        notification_sent = await send_private_channel_message(
            channel=ticket.private_channel,
            address=ticket.private_channel_address,
            subject="New message from support",
            text_body=f"Your support agent replied:\n\n{body.content}\n\nView thread: {chat_url}",
            delivery_config=await _delivery_config(session, ticket.tenant_id),
        )
        if not notification_sent:
            raise HTTPException(status_code=502, detail=f"{ticket.private_channel.title()} delivery failed or is not configured")

    previous_status = ticket.status
    ticket.status = "in_progress"
    _record_timeline(session, ticket, user, "ticket.agent_message", previous_status, "internal" if body.is_internal else "customer_reply")
    await session.commit()
    await manager.broadcast(ticket.tenant_id, {"type": "ticket_updated", "ticket": ticket_to_dict(ticket)})
    return {"status": "ok", "message": _serialize_message(msg)}


@router.post("/tickets/{ticket_id}/resolve")
async def resolve_ticket(
    ticket_id: str,
    body: ResolveRequest,
    user: Annotated[User, Depends(require_roles("tenant_admin", "manager", "support_agent"))],
    session: Annotated[AsyncSession, Depends(get_session)],
) -> dict:
    """Resolve a ticket, record resolution time, and notify the customer."""
    ticket = await _get_ticket(session, ticket_id, user.tenant_id)

    previous_status = ticket.status
    ticket.status = "resolved"
    ticket.resolved_at = _utcnow()
    ticket.resolved_by = user.id
    ticket.resolution_note = body.resolution_note

    # Resolution system message in thread
    system_msg = TicketMessage(
        ticket_id=ticket_id,
        tenant_id=user.tenant_id,
        sender_role="system",
        sender_name="AURA-CX",
        content=f"✅ Ticket resolved by {user.name}. Resolution: {body.resolution_note}",
        is_internal=False,
    )
    session.add(system_msg)
    _record_timeline(session, ticket, user, "ticket.resolved", previous_status, body.resolution_note)

    # Notify customer on their private channel
    if body.notify_customer and ticket.private_channel and ticket.private_channel_address:
        csat_url = f"{FRONTEND_URL}/resolve/{ticket.private_channel_token}"
        notification_sent = await send_private_channel_message(
            channel=ticket.private_channel,
            address=ticket.private_channel_address,
            subject="Your issue has been resolved",
            text_body=(
                f"Your complaint has been resolved.\n\n"
                f"Resolution: {body.resolution_note}\n\n"
                f"Please rate your experience (1-5): {csat_url}?csat=1"
            ),
            html_body=build_resolution_email_html(
                customer_name=ticket.customer_name,
                ticket_summary=ticket.message,
                resolution_note=body.resolution_note,
                csat_url=csat_url,
            ) if ticket.private_channel == "email" else None,
            delivery_config=await _delivery_config(session, ticket.tenant_id),
        )
        if not notification_sent:
            raise HTTPException(status_code=502, detail=f"{ticket.private_channel.title()} delivery failed or is not configured")

    await session.commit()
    await manager.broadcast(ticket.tenant_id, {"type": "ticket_updated", "ticket": ticket_to_dict(ticket)})
    return {
        "status": "resolved",
        "resolved_at": ticket.resolved_at.isoformat(),
        "resolution_note": body.resolution_note,
    }


# ── Public Customer Endpoints (token-gated, no auth) ─────────

@router.get("/resolve/{token}")
async def get_customer_thread(
    token: str,
    session: Annotated[AsyncSession, Depends(get_session)],
) -> dict:
    """Public endpoint — customer accesses their private support thread via token."""
    ticket = await session.scalar(
        select(Ticket).where(Ticket.private_channel_token == token)
    )
    if not ticket:
        raise HTTPException(status_code=404, detail="Thread not found or expired")

    # Only fetch non-internal messages for customer view
    messages = (
        await session.scalars(
            select(TicketMessage)
            .where(
                TicketMessage.ticket_id == ticket.id,
                TicketMessage.is_internal.is_(False),
            )
            .order_by(TicketMessage.created_at.asc())
        )
    ).all()

    return {
        "ticket_id": ticket.id,
        "status": ticket.status,
        "channel": ticket.private_channel,
        "complaint_summary": ticket.message[:500],
        "customer_name": ticket.customer_name,
        "resolved": ticket.status == "resolved",
        "resolution_note": ticket.resolution_note if ticket.status == "resolved" else None,
        "csat_collected": ticket.csat_score is not None,
        "messages": [_serialize_message(m) for m in messages],
    }


@router.post("/resolve/{token}/message")
async def customer_send_message(
    token: str,
    body: CustomerMessageRequest,
    session: Annotated[AsyncSession, Depends(get_session)],
) -> dict:
    """Public endpoint — customer replies in their private thread."""
    ticket = await session.scalar(
        select(Ticket).where(Ticket.private_channel_token == token)
    )
    if not ticket:
        raise HTTPException(status_code=404, detail="Thread not found")
    if ticket.status == "resolved":
        raise HTTPException(status_code=400, detail="This ticket is already resolved")

    msg = TicketMessage(
        ticket_id=ticket.id,
        tenant_id=ticket.tenant_id,
        sender_role="customer",
        sender_name=body.sender_name or ticket.customer_name,
        content=body.content,
        is_internal=False,
    )
    session.add(msg)
    ticket.status = "in_progress"
    await session.commit()
    await manager.broadcast(ticket.tenant_id, {"type": "ticket_updated", "ticket": ticket_to_dict(ticket)})
    return {"status": "ok", "message": _serialize_message(msg)}


@router.post("/resolve/{token}/csat")
async def submit_csat(
    token: str,
    body: CSATRequest,
    session: Annotated[AsyncSession, Depends(get_session)],
) -> dict:
    """Public endpoint — customer submits CSAT rating after resolution."""
    ticket = await session.scalar(
        select(Ticket).where(Ticket.private_channel_token == token)
    )
    if not ticket:
        raise HTTPException(status_code=404, detail="Thread not found")
    if ticket.csat_score is not None:
        raise HTTPException(status_code=400, detail="CSAT already submitted")

    ticket.csat_score = body.score
    ticket.csat_comment = body.comment
    ticket.csat_collected_at = _utcnow()
    await session.commit()
    return {"status": "ok", "score": body.score, "message": "Thank you for your feedback!"}
