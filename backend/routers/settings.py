"""Tenant settings and BYOI (Bring Your Own Infrastructure) management."""

from __future__ import annotations

from typing import Annotated

from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel, Field
from sqlalchemy.ext.asyncio import AsyncSession

from database import get_session
from models import AuditEvent, Tenant, TenantConfig, User
from security import assert_tenant, require_roles
from services.encryption import encrypt_value, decrypt_value

router = APIRouter()


class BYOIConfigUpdate(BaseModel):
    """BYOI credential update. Empty strings clear the value."""
    gemini_api_key: str | None = None
    openai_api_key: str | None = None
    pinecone_api_key: str | None = None
    pinecone_host: str | None = None
    chromadb_host: str | None = None
    chromadb_port: int | None = None
    smtp_host: str | None = None
    smtp_port: int | None = None
    smtp_user: str | None = None
    smtp_pass: str | None = None
    twilio_sid: str | None = None
    twilio_token: str | None = None
    twilio_phone: str | None = None
    storage_bucket: str | None = None
    storage_provider: str | None = None
    storage_credentials: str | None = None
    webhook_endpoints: dict | None = None
    brand_tone: str | None = None
    brand_examples: list[dict] | None = None


class TenantSettingsUpdate(BaseModel):
    name: str | None = None
    domain: str | None = None
    industry: str | None = None
    logo_url: str | None = None
    default_language: str | None = None
    sla_config: dict | None = None


def _mask_credential(value: str | None) -> str:
    """Mask a credential for safe display."""
    if not value:
        return ""
    return f"{'*' * 8}...{value[-4:]}" if len(value) > 12 else "***configured***"


def _config_status(config: TenantConfig | None) -> dict:
    """Return the BYOI configuration status without exposing secrets."""
    if config is None:
        return {"configured": False, "services": {}}
    return {
        "configured": True,
        "services": {
            "gemini": {"active": bool(config.gemini_api_key_enc), "masked_key": _mask_credential(decrypt_value(config.gemini_api_key_enc or ""))},
            "openai": {"active": bool(config.openai_api_key_enc), "masked_key": _mask_credential(decrypt_value(config.openai_api_key_enc or ""))},
            "pinecone": {"active": bool(config.pinecone_api_key_enc), "host": config.pinecone_host or ""},
            "chromadb": {"active": bool(config.chromadb_host), "host": config.chromadb_host or "", "port": config.chromadb_port},
            "smtp": {"active": bool(config.smtp_host), "host": config.smtp_host or ""},
            "twilio": {"active": bool(config.twilio_sid_enc), "phone": config.twilio_phone or ""},
            "storage": {"active": bool(config.storage_bucket), "provider": config.storage_provider or "", "bucket": config.storage_bucket or ""},
            "webhooks": {"active": bool(config.webhook_endpoints), "count": len(config.webhook_endpoints or {})},
        },
        "brand_tone_set": bool(config.brand_tone),
        "brand_examples_count": len(config.brand_examples or []),
        "updated_at": config.updated_at.isoformat(),
    }


@router.get("/settings")
async def get_tenant_settings(
    user: Annotated[User, Depends(require_roles("tenant_admin"))],
    session: Annotated[AsyncSession, Depends(get_session)],
):
    """Get tenant settings and BYOI configuration status."""
    tenant_id = assert_tenant(user, None)
    tenant = await session.get(Tenant, tenant_id)
    if tenant is None:
        raise HTTPException(status_code=404, detail="Tenant not found")

    return {
        "tenant": {
            "id": tenant.id,
            "name": tenant.name,
            "plan": tenant.plan,
            "domain": tenant.domain,
            "industry": tenant.industry,
            "logo_url": tenant.logo_url,
            "default_language": tenant.default_language,
            "sla_config": tenant.sla_config,
            "onboarding_complete": tenant.onboarding_complete,
            "created_at": tenant.created_at.isoformat(),
        },
        "byoi": _config_status(tenant.config),
    }


@router.patch("/settings")
async def update_tenant_settings(
    body: TenantSettingsUpdate,
    user: Annotated[User, Depends(require_roles("tenant_admin"))],
    session: Annotated[AsyncSession, Depends(get_session)],
):
    """Update tenant settings."""
    tenant_id = assert_tenant(user, None)
    tenant = await session.get(Tenant, tenant_id)
    if tenant is None:
        raise HTTPException(status_code=404, detail="Tenant not found")

    previous = {"name": tenant.name, "domain": tenant.domain, "plan": tenant.plan}

    if body.name is not None:
        tenant.name = body.name
    if body.domain is not None:
        tenant.domain = body.domain
    if body.industry is not None:
        tenant.industry = body.industry
    if body.logo_url is not None:
        tenant.logo_url = body.logo_url
    if body.default_language is not None:
        tenant.default_language = body.default_language
    if body.sla_config is not None:
        tenant.sla_config = body.sla_config

    session.add(AuditEvent(
        tenant_id=tenant_id,
        user_id=user.id,
        action="tenant.settings.update",
        resource_type="tenant",
        resource_id=tenant_id,
        previous_state=previous,
        new_state={"name": tenant.name, "domain": tenant.domain},
    ))

    await session.commit()
    return {"status": "updated"}


@router.put("/settings/byoi")
async def update_byoi_config(
    body: BYOIConfigUpdate,
    user: Annotated[User, Depends(require_roles("tenant_admin"))],
    session: Annotated[AsyncSession, Depends(get_session)],
):
    """Update BYOI infrastructure credentials (encrypted at rest)."""
    tenant_id = assert_tenant(user, None)
    tenant = await session.get(Tenant, tenant_id)
    if tenant is None:
        raise HTTPException(status_code=404, detail="Tenant not found")

    # Get or create TenantConfig
    config = tenant.config
    if config is None:
        config = TenantConfig(tenant_id=tenant_id)
        session.add(config)

    # Track which services were changed
    changed_services = []

    # Apply encrypted credential updates
    if body.gemini_api_key is not None:
        config.gemini_api_key_enc = encrypt_value(body.gemini_api_key) if body.gemini_api_key else None
        changed_services.append("gemini")
    if body.openai_api_key is not None:
        config.openai_api_key_enc = encrypt_value(body.openai_api_key) if body.openai_api_key else None
        changed_services.append("openai")
    if body.pinecone_api_key is not None:
        config.pinecone_api_key_enc = encrypt_value(body.pinecone_api_key) if body.pinecone_api_key else None
        changed_services.append("pinecone")
    if body.pinecone_host is not None:
        config.pinecone_host = body.pinecone_host or None
    if body.chromadb_host is not None:
        config.chromadb_host = body.chromadb_host or None
    if body.chromadb_port is not None:
        config.chromadb_port = body.chromadb_port
    if body.smtp_host is not None:
        config.smtp_host = body.smtp_host or None
    if body.smtp_port is not None:
        config.smtp_port = body.smtp_port
    if body.smtp_user is not None:
        config.smtp_user_enc = encrypt_value(body.smtp_user) if body.smtp_user else None
        changed_services.append("smtp")
    if body.smtp_pass is not None:
        config.smtp_pass_enc = encrypt_value(body.smtp_pass) if body.smtp_pass else None
    if body.twilio_sid is not None:
        config.twilio_sid_enc = encrypt_value(body.twilio_sid) if body.twilio_sid else None
        changed_services.append("twilio")
    if body.twilio_token is not None:
        config.twilio_token_enc = encrypt_value(body.twilio_token) if body.twilio_token else None
    if body.twilio_phone is not None:
        config.twilio_phone = body.twilio_phone or None
    if body.storage_bucket is not None:
        config.storage_bucket = body.storage_bucket or None
    if body.storage_provider is not None:
        config.storage_provider = body.storage_provider or None
    if body.storage_credentials is not None:
        config.storage_credentials_enc = encrypt_value(body.storage_credentials) if body.storage_credentials else None
        changed_services.append("storage")
    if body.webhook_endpoints is not None:
        config.webhook_endpoints = body.webhook_endpoints
    if body.brand_tone is not None:
        config.brand_tone = body.brand_tone or None
    if body.brand_examples is not None:
        config.brand_examples = body.brand_examples

    session.add(AuditEvent(
        tenant_id=tenant_id,
        user_id=user.id,
        action="byoi.update",
        resource_type="tenant_config",
        resource_id=config.id,
        details={"changed_services": changed_services},
    ))

    await session.commit()
    return {"status": "updated", "byoi": _config_status(config), "changed_services": changed_services}
