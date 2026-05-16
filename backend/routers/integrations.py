"""Tenant-scoped integration source configuration."""

from __future__ import annotations

import secrets
from typing import Annotated

from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel, Field, field_validator
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from database import get_session
from models import IntegrationSource, User
from security import assert_tenant, hash_password, require_roles, verify_password

router = APIRouter()

ALLOWED_PLATFORMS = {"x", "reddit", "gmail"}


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
        if value not in ALLOWED_PLATFORMS:
            raise ValueError("platform must be x, reddit, or gmail")
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
    user: Annotated[User, Depends(require_roles("tenant_admin"))],
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
    user: Annotated[User, Depends(require_roles("tenant_admin"))],
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
    user: Annotated[User, Depends(require_roles("tenant_admin"))],
    session: Annotated[AsyncSession, Depends(get_session)],
):
    source = await session.get(IntegrationSource, source_id)
    if source is None:
        raise HTTPException(status_code=404, detail="Integration not found")
    assert_tenant(user, source.tenant_id)
    await session.delete(source)
    await session.commit()
    return {"status": "removed", "id": source_id}


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

