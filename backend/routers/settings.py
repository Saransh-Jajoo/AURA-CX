"""Tenant settings, BYOI, and platform connection management."""

from __future__ import annotations

from typing import Annotated

from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel, Field
from sqlalchemy import func, select
from sqlalchemy.ext.asyncio import AsyncSession

from database import get_session
from models import AuditEvent, IntegrationSource, KnowledgeDocument, TeamInvitation, Tenant, TenantConfig, User
from security import assert_tenant, require_roles
from services.ai_providers import provider_health
from services.encryption import encrypt_value, decrypt_value

router = APIRouter()


class BYOIConfigUpdate(BaseModel):
    """BYOI credential update. Empty strings clear the value."""
    gemini_api_key: str | None = None
    openai_api_key: str | None = None
    anthropic_api_key: str | None = None
    mistral_api_key: str | None = None
    openrouter_api_key: str | None = None
    ollama_base_url: str | None = None
    self_hosted_base_url: str | None = None
    self_hosted_api_key: str | None = None
    ai_provider: str | None = None
    ai_model: str | None = None
    ai_fallback_order: list[str] | None = None
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


class PlatformConnectionUpdate(BaseModel):
    """User-facing platform credential update. Empty strings clear the value."""
    # X / Twitter
    x_bearer_token: str | None = None
    x_api_key: str | None = None
    x_api_secret: str | None = None
    x_access_token: str | None = None
    x_access_secret: str | None = None
    # Reddit
    reddit_client_id: str | None = None
    reddit_client_secret: str | None = None
    reddit_user_agent: str | None = None
    reddit_username: str | None = None
    reddit_password: str | None = None
    # Gmail / IMAP
    gmail_imap_host: str | None = Field(default=None, max_length=512)
    gmail_imap_port: int | None = None
    gmail_imap_user: str | None = None
    gmail_imap_pass: str | None = None
    # Threads
    threads_access_token: str | None = None


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
            "anthropic": {"active": bool(config.anthropic_api_key_enc), "masked_key": _mask_credential(decrypt_value(config.anthropic_api_key_enc or ""))},
            "mistral": {"active": bool(config.mistral_api_key_enc), "masked_key": _mask_credential(decrypt_value(config.mistral_api_key_enc or ""))},
            "openrouter": {"active": bool(config.openrouter_api_key_enc), "masked_key": _mask_credential(decrypt_value(config.openrouter_api_key_enc or ""))},
            "ollama": {"active": bool(config.ollama_base_url), "host": config.ollama_base_url or ""},
            "self_hosted": {"active": bool(config.self_hosted_base_url), "host": config.self_hosted_base_url or ""},
            "pinecone": {"active": bool(config.pinecone_api_key_enc), "host": config.pinecone_host or ""},
            "chromadb": {"active": bool(config.chromadb_host), "host": config.chromadb_host or "", "port": config.chromadb_port},
            "smtp": {"active": bool(config.smtp_host), "host": config.smtp_host or ""},
            "twilio": {"active": bool(config.twilio_sid_enc), "phone": config.twilio_phone or ""},
            "storage": {"active": bool(config.storage_bucket), "provider": config.storage_provider or "", "bucket": config.storage_bucket or ""},
            "webhooks": {"active": bool(config.webhook_endpoints), "count": len(config.webhook_endpoints or {})},
        },
        "brand_tone_set": bool(config.brand_tone),
        "brand_examples_count": len(config.brand_examples or []),
        "active_ai_provider": config.ai_provider,
        "ai_model": config.ai_model,
        "ai_fallback_order": config.ai_fallback_order or [],
        "updated_at": config.updated_at.isoformat(),
    }


def _platform_status(config: TenantConfig | None) -> dict:
    """Return platform connection status without exposing secrets."""
    if config is None:
        return {
            "x": {"connected": False},
            "reddit": {"connected": False},
            "gmail": {"connected": False},
            "threads": {"connected": False},
        }
    return {
        "x": {
            "connected": bool(config.x_bearer_token_enc),
            "has_bearer_token": bool(config.x_bearer_token_enc),
            "has_oauth": bool(config.x_api_key_enc and config.x_api_secret_enc),
            "has_user_tokens": bool(config.x_access_token_enc and config.x_access_secret_enc),
            "masked_bearer": _mask_credential(decrypt_value(config.x_bearer_token_enc or "")),
            "masked_api_key": _mask_credential(decrypt_value(config.x_api_key_enc or "")),
        },
        "reddit": {
            "connected": bool(config.reddit_client_id_enc and config.reddit_client_secret_enc),
            "has_client_creds": bool(config.reddit_client_id_enc and config.reddit_client_secret_enc),
            "has_account": bool(config.reddit_username_enc),
            "user_agent": config.reddit_user_agent or "",
            "masked_client_id": _mask_credential(decrypt_value(config.reddit_client_id_enc or "")),
        },
        "gmail": {
            "connected": bool(config.gmail_imap_host and config.gmail_imap_user_enc),
            "imap_host": config.gmail_imap_host or "imap.gmail.com",
            "imap_port": config.gmail_imap_port or 993,
            "masked_user": _mask_credential(decrypt_value(config.gmail_imap_user_enc or "")),
        },
        "threads": {
            "connected": bool(config.threads_access_token_enc),
            "masked_token": _mask_credential(decrypt_value(config.threads_access_token_enc or "")),
        },
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
        "platforms": _platform_status(tenant.config),
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


@router.get("/settings/onboarding")
async def get_onboarding_status(
    user: Annotated[User, Depends(require_roles("tenant_admin"))],
    session: Annotated[AsyncSession, Depends(get_session)],
):
    tenant_id = assert_tenant(user, None)
    tenant = await session.get(Tenant, tenant_id)
    if tenant is None:
        raise HTTPException(status_code=404, detail="Tenant not found")
    config = tenant.config
    kb_count = await session.scalar(select(func.count(KnowledgeDocument.id)).where(KnowledgeDocument.tenant_id == tenant_id, KnowledgeDocument.status == "active")) or 0
    channel_count = await session.scalar(select(func.count(IntegrationSource.id)).where(IntegrationSource.tenant_id == tenant_id, IntegrationSource.active.is_(True))) or 0
    invite_count = await session.scalar(select(func.count(TeamInvitation.id)).where(TeamInvitation.tenant_id == tenant_id)) or 0
    team_count = await session.scalar(select(func.count(User.id)).where(User.tenant_id == tenant_id, User.active.is_(True))) or 0
    steps = {
        "organization": bool(tenant.name and tenant.domain),
        "workspace": bool(tenant.industry and tenant.default_language),
        "ai_provider": bool(config and (config.gemini_api_key_enc or config.openai_api_key_enc or config.anthropic_api_key_enc or config.ollama_base_url)),
        "knowledge_base": kb_count > 0,
        "complaint_channels": channel_count > 0,
        "sla_policies": bool(tenant.sla_config),
        "team_members": team_count > 1 or invite_count > 0,
    }
    complete = all(steps.values())
    if tenant.onboarding_complete != complete:
        tenant.onboarding_complete = complete
        await session.commit()
    return {
        "complete": complete,
        "steps": steps,
        "counts": {"knowledge_documents": kb_count, "channels": channel_count, "team_members": team_count, "invitations": invite_count},
    }


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
    if body.anthropic_api_key is not None:
        config.anthropic_api_key_enc = encrypt_value(body.anthropic_api_key) if body.anthropic_api_key else None
        changed_services.append("anthropic")
    if body.mistral_api_key is not None:
        config.mistral_api_key_enc = encrypt_value(body.mistral_api_key) if body.mistral_api_key else None
        changed_services.append("mistral")
    if body.openrouter_api_key is not None:
        config.openrouter_api_key_enc = encrypt_value(body.openrouter_api_key) if body.openrouter_api_key else None
        changed_services.append("openrouter")
    if body.ollama_base_url is not None:
        config.ollama_base_url = body.ollama_base_url or None
        changed_services.append("ollama")
    if body.self_hosted_base_url is not None:
        config.self_hosted_base_url = body.self_hosted_base_url or None
        changed_services.append("self_hosted")
    if body.self_hosted_api_key is not None:
        config.self_hosted_api_key_enc = encrypt_value(body.self_hosted_api_key) if body.self_hosted_api_key else None
    if body.ai_provider is not None:
        provider = body.ai_provider.lower().strip()
        if provider not in {"gemini", "openai", "anthropic", "mistral", "ollama", "openrouter", "self_hosted"}:
            raise HTTPException(status_code=400, detail="Unsupported AI provider")
        config.ai_provider = provider
    if body.ai_model is not None:
        config.ai_model = body.ai_model or None
    if body.ai_fallback_order is not None:
        unsupported = set(body.ai_fallback_order) - {"gemini", "openai", "anthropic", "mistral", "ollama", "openrouter", "self_hosted"}
        if unsupported:
            raise HTTPException(status_code=400, detail=f"Unsupported fallback providers: {sorted(unsupported)}")
        config.ai_fallback_order = body.ai_fallback_order
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


@router.get("/settings/platforms")
async def get_platform_connections(
    user: Annotated[User, Depends(require_roles("tenant_admin"))],
    session: Annotated[AsyncSession, Depends(get_session)],
):
    """Get platform connection status (masked credentials only)."""
    tenant_id = assert_tenant(user, None)
    tenant = await session.get(Tenant, tenant_id)
    if tenant is None:
        raise HTTPException(status_code=404, detail="Tenant not found")
    return {"platforms": _platform_status(tenant.config)}


@router.get("/settings/ai-providers/health")
async def get_ai_provider_health(
    user: Annotated[User, Depends(require_roles("tenant_admin"))],
):
    """Return provider readiness without exposing credentials."""
    assert_tenant(user, None)
    return {"providers": await provider_health()}


@router.put("/settings/platforms")
async def update_platform_connections(
    body: PlatformConnectionUpdate,
    user: Annotated[User, Depends(require_roles("tenant_admin"))],
    session: Annotated[AsyncSession, Depends(get_session)],
):
    """Update platform connection credentials (encrypted at rest)."""
    tenant_id = assert_tenant(user, None)
    tenant = await session.get(Tenant, tenant_id)
    if tenant is None:
        raise HTTPException(status_code=404, detail="Tenant not found")

    config = tenant.config
    if config is None:
        config = TenantConfig(tenant_id=tenant_id)
        session.add(config)

    changed_platforms = []

    # X / Twitter
    if body.x_bearer_token is not None:
        config.x_bearer_token_enc = encrypt_value(body.x_bearer_token) if body.x_bearer_token else None
        changed_platforms.append("x")
    if body.x_api_key is not None:
        config.x_api_key_enc = encrypt_value(body.x_api_key) if body.x_api_key else None
    if body.x_api_secret is not None:
        config.x_api_secret_enc = encrypt_value(body.x_api_secret) if body.x_api_secret else None
    if body.x_access_token is not None:
        config.x_access_token_enc = encrypt_value(body.x_access_token) if body.x_access_token else None
    if body.x_access_secret is not None:
        config.x_access_secret_enc = encrypt_value(body.x_access_secret) if body.x_access_secret else None

    # Reddit
    if body.reddit_client_id is not None:
        config.reddit_client_id_enc = encrypt_value(body.reddit_client_id) if body.reddit_client_id else None
        changed_platforms.append("reddit")
    if body.reddit_client_secret is not None:
        config.reddit_client_secret_enc = encrypt_value(body.reddit_client_secret) if body.reddit_client_secret else None
    if body.reddit_user_agent is not None:
        config.reddit_user_agent = body.reddit_user_agent or None
    if body.reddit_username is not None:
        config.reddit_username_enc = encrypt_value(body.reddit_username) if body.reddit_username else None
    if body.reddit_password is not None:
        config.reddit_password_enc = encrypt_value(body.reddit_password) if body.reddit_password else None

    # Gmail / IMAP
    if body.gmail_imap_host is not None:
        config.gmail_imap_host = body.gmail_imap_host or None
    if body.gmail_imap_port is not None:
        config.gmail_imap_port = body.gmail_imap_port
    if body.gmail_imap_user is not None:
        config.gmail_imap_user_enc = encrypt_value(body.gmail_imap_user) if body.gmail_imap_user else None
        changed_platforms.append("gmail")
    if body.gmail_imap_pass is not None:
        config.gmail_imap_pass_enc = encrypt_value(body.gmail_imap_pass) if body.gmail_imap_pass else None

    # Threads
    if body.threads_access_token is not None:
        config.threads_access_token_enc = encrypt_value(body.threads_access_token) if body.threads_access_token else None
        changed_platforms.append("threads")

    session.add(AuditEvent(
        tenant_id=tenant_id,
        user_id=user.id,
        action="platforms.update",
        resource_type="tenant_config",
        resource_id=config.id,
        details={"changed_platforms": changed_platforms},
    ))

    await session.commit()
    return {
        "status": "updated",
        "platforms": _platform_status(config),
        "changed_platforms": changed_platforms,
    }
