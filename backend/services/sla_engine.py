"""SLA tracking engine with escalation workflows.

Calculates SLA deadlines based on ticket severity-to-priority mapping,
monitors breach states, and generates escalation events.
"""

from __future__ import annotations

import logging
from datetime import datetime, timedelta, timezone

from sqlalchemy import select, and_
from sqlalchemy.ext.asyncio import AsyncSession

from config import settings
from models import SLAEvent, Tenant, Ticket

logger = logging.getLogger("aura_cx.sla")

# Severity → SLA Priority mapping
SEVERITY_PRIORITY_MAP = {
    "critical": "p1",
    "high": "p2",
    "medium": "p3",
    "low": "p4",
}


def get_sla_minutes(tenant: Tenant | None, priority: str) -> int:
    """Get SLA minutes for a priority from tenant config or global defaults."""
    if tenant and tenant.sla_config:
        key = f"{priority}_minutes"
        if key in tenant.sla_config:
            return int(tenant.sla_config[key])
    defaults = {
        "p1": settings.SLA_P1_MINUTES,
        "p2": settings.SLA_P2_MINUTES,
        "p3": settings.SLA_P3_MINUTES,
        "p4": settings.SLA_P4_MINUTES,
    }
    return defaults.get(priority, settings.SLA_P3_MINUTES)


def calculate_sla_deadline(tenant: Tenant | None, severity: str, created_at: datetime) -> tuple[str, datetime]:
    """Calculate the SLA priority and deadline for a ticket."""
    priority = SEVERITY_PRIORITY_MAP.get(severity, "p3")
    minutes = get_sla_minutes(tenant, priority)
    deadline = created_at + timedelta(minutes=minutes)
    return priority, deadline


def sla_status(ticket: Ticket) -> dict:
    """Get the current SLA status for a ticket."""
    now = datetime.now(timezone.utc)
    if not ticket.sla_deadline:
        return {"status": "no_sla", "remaining_seconds": 0, "percent_elapsed": 0, "breached": False}

    deadline = ticket.sla_deadline
    if deadline.tzinfo is None:
        deadline = deadline.replace(tzinfo=timezone.utc)

    remaining = (deadline - now).total_seconds()
    total_seconds = get_sla_minutes(None, ticket.sla_priority) * 60
    elapsed_pct = max(0, min(100, ((total_seconds - remaining) / total_seconds) * 100)) if total_seconds > 0 else 100

    if remaining <= 0:
        status = "breached"
    elif elapsed_pct >= settings.SLA_WARNING_PERCENT * 100:
        status = "warning"
    else:
        status = "on_track"

    return {
        "status": status,
        "remaining_seconds": max(0, int(remaining)),
        "percent_elapsed": round(elapsed_pct, 1),
        "breached": remaining <= 0,
        "deadline": deadline.isoformat(),
        "priority": ticket.sla_priority,
        "escalation_level": ticket.sla_escalation_level,
    }


async def assign_sla(session: AsyncSession, ticket: Ticket) -> None:
    """Assign SLA priority and deadline to a ticket based on its severity."""
    tenant = await session.get(Tenant, ticket.tenant_id)
    priority, deadline = calculate_sla_deadline(tenant, ticket.severity, ticket.received_at)
    ticket.sla_priority = priority
    ticket.sla_deadline = deadline


async def check_sla_breaches(session: AsyncSession, tenant_id: str) -> list[dict]:
    """Check all active tickets for SLA breaches and generate events."""
    now = datetime.now(timezone.utc)
    breached_tickets = (
        await session.scalars(
            select(Ticket).where(
                and_(
                    Ticket.tenant_id == tenant_id,
                    Ticket.status.notin_(["resolved", "closed"]),
                    Ticket.sla_deadline.isnot(None),
                    Ticket.sla_deadline <= now,
                    Ticket.sla_breached.is_(False),
                )
            )
        )
    ).all()

    events = []
    for ticket in breached_tickets:
        ticket.sla_breached = True
        ticket.sla_escalation_level += 1

        event = SLAEvent(
            tenant_id=tenant_id,
            ticket_id=ticket.id,
            event_type="breach",
            escalation_level=ticket.sla_escalation_level,
            details={
                "severity": ticket.severity,
                "priority": ticket.sla_priority,
                "deadline": ticket.sla_deadline.isoformat() if ticket.sla_deadline else None,
                "breached_at": now.isoformat(),
            },
        )
        session.add(event)
        events.append({
            "ticket_id": ticket.id,
            "event_type": "breach",
            "severity": ticket.severity,
            "escalation_level": ticket.sla_escalation_level,
        })
        logger.warning("SLA breach: ticket=%s priority=%s escalation=%d", ticket.id, ticket.sla_priority, ticket.sla_escalation_level)

    if events:
        await session.commit()
    return events


async def get_sla_heatmap(session: AsyncSession, tenant_id: str) -> list[dict]:
    """Generate SLA heatmap data for all active tickets."""
    active_tickets = (
        await session.scalars(
            select(Ticket).where(
                Ticket.tenant_id == tenant_id,
                Ticket.status.notin_(["resolved", "closed"]),
                Ticket.sla_deadline.isnot(None),
            )
        )
    ).all()

    heatmap = []
    for ticket in active_tickets:
        status_info = sla_status(ticket)
        heatmap.append({
            "ticket_id": ticket.id,
            "severity": ticket.severity,
            "channel": ticket.channel,
            "customer": ticket.customer_name,
            **status_info,
        })
    return sorted(heatmap, key=lambda x: x["remaining_seconds"])
