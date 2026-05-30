"""Tenant-scoped integration source configuration."""

from __future__ import annotations

import secrets
from datetime import datetime, timezone, timedelta
from typing import Annotated

from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel, Field, field_validator
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from config import settings
from database import get_session
from models import IntegrationSource, PlatformAPIConnection, User
from security import assert_tenant, hash_password, require_roles, verify_password

router = APIRouter()

class IntegrationSourceIn(BaseModel):
    platform: str
    identifier: str = Field(min_length=1, max_length=512)
    label: str | None = Field(default=None, max_length=255)
    active: bool = True
    filters: dict = Field(default_factory=dict)

    @field_validator("platform")
    @classmethod
    def validate_platform(cls, value: str) -> str:
        value = value.lower().strip()
        if not value or len(value) > 128 or not all(ch.isalnum() or ch in {"_", "-"} for ch in value):
            raise ValueError("platform must be a valid platform slug")
        return value


def integration_to_dict(source: IntegrationSource, include_url: bool = True) -> dict:
    webhook_path = f"/api/v1/webhooks/{source.tenant_id}/{source.platform}"
    return {
        "id": source.id,
        "tenant_id": source.tenant_id,
        "platform": source.platform,
        "identifier": source.identifier,
        "label": source.label,
        "active": source.active,
        "filters": source.filters,
        "webhook_path": webhook_path if include_url else None,
        "added_at": source.created_at.isoformat(),
    }


@router.get("/integrations")
async def list_integrations(
    user: Annotated[User, Depends(require_roles("tenant_admin", "support_agent", "qa_reviewer", "executive"))],
    session: Annotated[AsyncSession, Depends(get_session)],
    tenant_id: str | None = None,
):
    scoped_tenant = assert_tenant(user, tenant_id)
    sources = (
        await session.scalars(
            select(IntegrationSource)
            .where(IntegrationSource.tenant_id == scoped_tenant)
            .order_by(IntegrationSource.created_at.desc())
        )
    ).all()
    return {
        "tenant_id": scoped_tenant,
        "sources": [integration_to_dict(source) for source in sources],
        "total": len(sources),
    }


@router.post("/integrations")
async def add_integration(
    body: IntegrationSourceIn,
    user: Annotated[User, Depends(require_roles("tenant_admin", "executive"))],
    session: Annotated[AsyncSession, Depends(get_session)],
):
    tenant_id = assert_tenant(user, None)
    secret = secrets.token_urlsafe(32)
    source = IntegrationSource(
        tenant_id=tenant_id,
        platform=body.platform,
        identifier=body.identifier.strip(),
        label=body.label,
        active=body.active,
        filters=body.filters,
        webhook_secret_hash=hash_password(secret),
    )
    session.add(source)
    await session.commit()
    payload = integration_to_dict(source)
    payload["webhook_secret"] = secret
    return {"status": "added", "source": payload}


@router.patch("/integrations/{source_id}")
async def update_integration(
    source_id: str,
    body: IntegrationSourceIn,
    user: Annotated[User, Depends(require_roles("tenant_admin", "executive"))],
    session: Annotated[AsyncSession, Depends(get_session)],
):
    source = await session.get(IntegrationSource, source_id)
    if source is None:
        raise HTTPException(status_code=404, detail="Integration not found")
    assert_tenant(user, source.tenant_id)
    source.platform = body.platform
    source.identifier = body.identifier.strip()
    source.label = body.label
    source.active = body.active
    source.filters = body.filters
    await session.commit()
    return {"status": "updated", "source": integration_to_dict(source)}


@router.delete("/integrations/{source_id}")
async def remove_integration(
    source_id: str,
    user: Annotated[User, Depends(require_roles("tenant_admin", "executive"))],
    session: Annotated[AsyncSession, Depends(get_session)],
):
    source = await session.get(IntegrationSource, source_id)
    if source is None:
        raise HTTPException(status_code=404, detail="Integration not found")
    assert_tenant(user, source.tenant_id)
    await session.delete(source)
    await session.commit()
    return {"status": "removed", "id": source_id}


@router.get("/integrations/health/{tenant_id}")
async def check_polling_health(
    tenant_id: str,
    user: Annotated[User, Depends(require_roles("tenant_admin", "manager", "executive"))],
    session: Annotated[AsyncSession, Depends(get_session)],
):
    """
    Health check for email polling connections.
    Ensures all email integrations are actively polling for new messages.
    """
    assert_tenant(user, tenant_id)
    
    now = datetime.now(timezone.utc)
    poll_interval = settings.SOCIAL_MONITOR_POLL_INTERVAL
    stale_threshold = poll_interval * 3  # 3 missed poll windows
    
    # Get all email/IMAP platform connections for this tenant
    connections = (
        await session.scalars(
            select(PlatformAPIConnection).where(
                PlatformAPIConnection.tenant_id == tenant_id,
                PlatformAPIConnection.platform_slug.in_({"gmail", "email", "imap"}),
                PlatformAPIConnection.active.is_(True),
            )
        )
    ).all()
    
    health_status = {
        "tenant_id": tenant_id,
        "polling_interval_seconds": poll_interval,
        "check_timestamp": now.isoformat(),
        "connections_monitored": len(connections),
        "connections_healthy": 0,
        "connections_stale": 0,
        "connections": [],
        "issues": [],
    }
    
    for connection in connections:
        last_poll = connection.last_polled_at
        time_since_poll = (now - last_poll).total_seconds() if last_poll else float("inf")
        is_stale = time_since_poll > stale_threshold
        has_error = bool(connection.last_error)
        
        connection_status = {
            "id": connection.id,
            "platform": connection.platform_slug,
            "account": connection.account_identifier,
            "active": connection.active,
            "last_polled_at": last_poll.isoformat() if last_poll else None,
            "seconds_since_poll": time_since_poll,
            "is_stale": is_stale,
            "has_error": has_error,
            "last_error": connection.last_error[:200] if connection.last_error else None,
            "status": "stale" if is_stale else ("error" if has_error else "healthy"),
        }
        
        if not is_stale and not has_error:
            health_status["connections_healthy"] += 1
        elif is_stale:
            health_status["connections_stale"] += 1
            health_status["issues"].append(
                f"Connection {connection.id} ({connection.platform_slug}/{connection.account_identifier}) "
                f"has not been polled for {time_since_poll:.0f}s (threshold: {stale_threshold}s)"
            )
        
        if has_error:
            health_status["issues"].append(
                f"Connection {connection.id} ({connection.platform_slug}) has recent error: {connection.last_error[:100]}"
            )
        
        health_status["connections"].append(connection_status)
    
    # Overall health determination
    health_status["overall_status"] = (
        "healthy" if health_status["connections_healthy"] == len(connections) and len(connections) > 0
        else "degraded" if health_status["connections_healthy"] > 0
        else "unhealthy" if len(connections) > 0
        else "no_connections"
    )
    
    if not connections:
        health_status["issues"].append("No email polling connections configured for this tenant")
    
    return health_status


async def verify_webhook_source(session: AsyncSession, tenant_id: str, platform: str, secret: str | None) -> list[IntegrationSource]:
    sources = (
        await session.scalars(
            select(IntegrationSource).where(
                IntegrationSource.tenant_id == tenant_id,
                IntegrationSource.platform == platform,
                IntegrationSource.active.is_(True),
            )
        )
    ).all()
    if not sources:
        raise HTTPException(status_code=403, detail="No active integration is configured for this tenant/channel")
    if not secret:
        raise HTTPException(status_code=401, detail="Missing webhook secret")
    for source in sources:
        if source.webhook_secret_hash and verify_password(secret, source.webhook_secret_hash):
            return list(sources)
    raise HTTPException(status_code=401, detail="Invalid webhook secret")
