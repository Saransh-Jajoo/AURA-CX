"""Compliance, audit trail, and regulatory export endpoints."""

from __future__ import annotations

from datetime import datetime, timezone
from typing import Annotated

from fastapi import APIRouter, Depends, Query
from pydantic import BaseModel
from sqlalchemy import func, select
from sqlalchemy.ext.asyncio import AsyncSession

from database import get_session
from models import AuditEvent, User
from security import assert_tenant, require_roles

router = APIRouter()


@router.get("/compliance/audit-trail")
async def get_audit_trail(
    user: Annotated[User, Depends(require_roles("tenant_admin", "executive"))],
    session: Annotated[AsyncSession, Depends(get_session)],
    tenant_id: str | None = None,
    resource_type: str | None = None,
    action: str | None = None,
    limit: int = Query(default=100, le=500),
    offset: int = 0,
):
    """Get immutable audit trail for compliance reporting."""
    scoped_tenant = assert_tenant(user, tenant_id)
    query = select(AuditEvent).where(AuditEvent.tenant_id == scoped_tenant)
    if resource_type:
        query = query.where(AuditEvent.resource_type == resource_type)
    if action:
        query = query.where(AuditEvent.action.ilike(f"%{action}%"))
    query = query.order_by(AuditEvent.created_at.desc()).offset(offset).limit(limit)
    events = (await session.scalars(query)).all()
    total = await session.scalar(
        select(func.count(AuditEvent.id)).where(AuditEvent.tenant_id == scoped_tenant)
    )

    return {
        "events": [
            {
                "id": e.id,
                "action": e.action,
                "resource_type": e.resource_type,
                "resource_id": e.resource_id,
                "user_id": e.user_id,
                "details": e.details,
                "previous_state": e.previous_state,
                "new_state": e.new_state,
                "reason": e.reason,
                "ip_address": e.ip_address,
                "timestamp": e.created_at.isoformat(),
            }
            for e in events
        ],
        "total": total or 0,
        "offset": offset,
        "limit": limit,
    }


@router.get("/compliance/summary")
async def get_compliance_summary(
    user: Annotated[User, Depends(require_roles("tenant_admin", "executive"))],
    session: Annotated[AsyncSession, Depends(get_session)],
    tenant_id: str | None = None,
):
    """Get compliance summary for regulatory dashboards."""
    scoped_tenant = assert_tenant(user, tenant_id)

    total_events = await session.scalar(
        select(func.count(AuditEvent.id)).where(AuditEvent.tenant_id == scoped_tenant)
    )

    # Action type breakdown
    action_counts = (
        await session.execute(
            select(AuditEvent.action, func.count(AuditEvent.id))
            .where(AuditEvent.tenant_id == scoped_tenant)
            .group_by(AuditEvent.action)
        )
    ).all()

    # Resource type breakdown
    resource_counts = (
        await session.execute(
            select(AuditEvent.resource_type, func.count(AuditEvent.id))
            .where(AuditEvent.tenant_id == scoped_tenant)
            .group_by(AuditEvent.resource_type)
        )
    ).all()

    return {
        "total_events": total_events or 0,
        "action_breakdown": {action: count for action, count in action_counts},
        "resource_breakdown": {resource: count for resource, count in resource_counts},
        "compliance_standards": ["GDPR", "ISO 27001", "RBI", "SOC 2"],
        "export_formats": ["json", "csv"],
    }


@router.get("/compliance/export")
async def export_audit_data(
    user: Annotated[User, Depends(require_roles("tenant_admin"))],
    session: Annotated[AsyncSession, Depends(get_session)],
    tenant_id: str | None = None,
    format: str = "json",
    limit: int = Query(default=1000, le=10000),
):
    """Export audit data for regulatory compliance."""
    scoped_tenant = assert_tenant(user, tenant_id)
    events = (
        await session.scalars(
            select(AuditEvent)
            .where(AuditEvent.tenant_id == scoped_tenant)
            .order_by(AuditEvent.created_at.desc())
            .limit(limit)
        )
    ).all()

    exported = [
        {
            "event_id": e.id,
            "timestamp": e.created_at.isoformat(),
            "actor": e.user_id,
            "action": e.action,
            "resource_type": e.resource_type,
            "resource_id": e.resource_id,
            "previous_state": e.previous_state,
            "new_state": e.new_state,
            "reason": e.reason,
            "ip_address": e.ip_address,
        }
        for e in events
    ]

    return {
        "format": format,
        "exported_at": datetime.now(timezone.utc).isoformat(),
        "tenant_id": scoped_tenant,
        "record_count": len(exported),
        "records": exported,
    }
