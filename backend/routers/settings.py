"""Tenant settings, BYOI, and platform connection management."""

from __future__ import annotations

import json
import re
from typing import Annotated, Any

from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel, Field
from sqlalchemy import func, select
from sqlalchemy.ext.asyncio import AsyncSession

from database import get_session
from models import (
    AuditEvent,
    IntegrationSource,
    KnowledgeDocument,
    PlatformAPIConnection,
    SocialMonitorConfig,
    TeamInvitation,
    Tenant,
    TenantConfig,
    User,
)
from security import assert_tenant, require_roles
from services.ai_providers import provider_health, tenant_provider_configs
from services.encryption import encrypt_value, decrypt_value
from services.platform_polling import poll_due_platform_connections

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


class DynamicPlatformConnectionIn(BaseModel):
    platform_name: str = Field(min_length=1, max_length=128)
    account_identifier: str = Field(min_length=1, max_length=512)
    credentials: dict[str, Any] = Field(default_factory=dict)
    active: bool = True
    poll_interval_seconds: int = Field(default=300, ge=60, le=86400)


class DynamicPlatformConnectionPatch(BaseModel):
    platform_name: str | None = Field(default=None, min_length=1, max_length=128)
    account_identifier: str | None = Field(default=None, min_length=1, max_length=512)
    credentials: dict[str, Any] | None = None
    active: bool | None = None
    poll_interval_seconds: int | None = Field(default=None, ge=60, le=86400)


def _mask_credential(value: str | None) -> str:
    """Mask a credential for safe display."""
    if not value:
        return ""
    return f"{'*' * 8}...{value[-4:]}" if len(value) > 12 else "***configured***"


def _config_status(config: TenantConfig | None) -> dict:
    """Return the BYOI configuration status without exposing secrets."""
    if config is None:
        return {"configured": False, "services": {}}
    def status(active: bool, required: list[str], present: dict[str, bool], **extra) -> dict:
        return {
            "active": active,
            "required_fields": required,
            "missing_fields": [label for label, ok in present.items() if not ok],
            **extra,
        }

    smtp_active = bool(config.smtp_host and config.smtp_user_enc and config.smtp_pass_enc)
    twilio_active = bool(config.twilio_sid_enc and config.twilio_token_enc and config.twilio_phone)
    pinecone_active = bool(config.pinecone_api_key_enc and config.pinecone_host)
    storage_active = bool(config.storage_bucket and config.storage_provider)
    return {
        "configured": True,
        "services": {
            "gemini": status(bool(config.gemini_api_key_enc), ["API key"], {"API key": bool(config.gemini_api_key_enc)}, masked_key=_mask_credential(decrypt_value(config.gemini_api_key_enc or ""))),
            "openai": status(bool(config.openai_api_key_enc), ["API key"], {"API key": bool(config.openai_api_key_enc)}, masked_key=_mask_credential(decrypt_value(config.openai_api_key_enc or ""))),
            "anthropic": status(bool(config.anthropic_api_key_enc), ["API key"], {"API key": bool(config.anthropic_api_key_enc)}, masked_key=_mask_credential(decrypt_value(config.anthropic_api_key_enc or ""))),
            "mistral": status(bool(config.mistral_api_key_enc), ["API key"], {"API key": bool(config.mistral_api_key_enc)}, masked_key=_mask_credential(decrypt_value(config.mistral_api_key_enc or ""))),
            "openrouter": status(bool(config.openrouter_api_key_enc), ["API key"], {"API key": bool(config.openrouter_api_key_enc)}, masked_key=_mask_credential(decrypt_value(config.openrouter_api_key_enc or ""))),
            "ollama": status(bool(config.ollama_base_url), ["Base URL"], {"Base URL": bool(config.ollama_base_url)}, host=config.ollama_base_url or ""),
            "self_hosted": status(bool(config.self_hosted_base_url), ["Base URL"], {"Base URL": bool(config.self_hosted_base_url)}, host=config.self_hosted_base_url or ""),
            "pinecone": status(pinecone_active, ["API key", "Host URL"], {"API key": bool(config.pinecone_api_key_enc), "Host URL": bool(config.pinecone_host)}, host=config.pinecone_host or ""),
            "chromadb": status(bool(config.chromadb_host), ["Host"], {"Host": bool(config.chromadb_host)}, host=config.chromadb_host or "", port=config.chromadb_port),
            "smtp": status(smtp_active, ["Host", "Username", "Password"], {"Host": bool(config.smtp_host), "Username": bool(config.smtp_user_enc), "Password": bool(config.smtp_pass_enc)}, host=config.smtp_host or "", port=config.smtp_port, masked_user=_mask_credential(decrypt_value(config.smtp_user_enc or ""))),
            "twilio": status(twilio_active, ["Account SID", "Auth Token", "Phone Number"], {"Account SID": bool(config.twilio_sid_enc), "Auth Token": bool(config.twilio_token_enc), "Phone Number": bool(config.twilio_phone)}, phone=config.twilio_phone or ""),
            "storage": status(storage_active, ["Provider", "Bucket Name"], {"Provider": bool(config.storage_provider), "Bucket Name": bool(config.storage_bucket)}, provider=config.storage_provider or "", bucket=config.storage_bucket or ""),
            "webhooks": status(bool(config.webhook_endpoints), ["Webhook endpoints"], {"Webhook endpoints": bool(config.webhook_endpoints)}, count=len(config.webhook_endpoints or {})),
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


def _platform_slug(name: str) -> str:
    slug = re.sub(r"[^a-z0-9]+", "_", name.lower().strip()).strip("_")
    if not slug:
        raise HTTPException(status_code=400, detail="Platform name must contain letters or numbers")
    return slug[:128]


def _validate_credentials(credentials: dict[str, Any]) -> dict[str, Any]:
    if not credentials:
        raise HTTPException(status_code=400, detail="At least one credential field is required")
    clean: dict[str, Any] = {}
    for key, value in credentials.items():
        clean_key = str(key).strip()
        if not clean_key or len(clean_key) > 128:
            raise HTTPException(status_code=400, detail="Credential keys must be 1-128 characters")
        if isinstance(value, (dict, list)):
            clean[clean_key] = value
        elif value is None:
            clean[clean_key] = None
        else:
            clean[clean_key] = str(value)
    return clean


def _dynamic_platform_to_dict(connection: PlatformAPIConnection) -> dict:
    fields: list[str] = []
    if connection.credentials_enc:
        try:
            credentials = json.loads(decrypt_value(connection.credentials_enc))
            fields = sorted(str(key) for key in credentials.keys())
        except Exception:  # noqa: BLE001
            fields = []
    return {
        "id": connection.id,
        "tenant_id": connection.tenant_id,
        "platform_name": connection.platform_name,
        "platform_slug": connection.platform_slug,
        "account_identifier": connection.account_identifier,
        "credential_fields": fields,
        "credentials_configured": bool(connection.credentials_enc),
        "active": connection.active,
        "poll_interval_seconds": connection.poll_interval_seconds,
        "last_polled_at": connection.last_polled_at.isoformat() if connection.last_polled_at else None,
        "last_error": connection.last_error,
        "created_at": connection.created_at.isoformat(),
        "updated_at": connection.updated_at.isoformat(),
    }


async def _sync_dynamic_platform_runtime_records(
    session: AsyncSession,
    connection: PlatformAPIConnection,
) -> None:
    """Keep legacy listener rows aligned so live polling can reuse ingestion semantics."""
    source = await session.get(IntegrationSource, connection.integration_source_id) if connection.integration_source_id else None
    if source is None:
        source = await session.scalar(
            select(IntegrationSource).where(
                IntegrationSource.tenant_id == connection.tenant_id,
                IntegrationSource.platform == connection.platform_slug,
                IntegrationSource.identifier == connection.account_identifier,
            )
        )
    if source is None:
        source = IntegrationSource(
            tenant_id=connection.tenant_id,
            platform=connection.platform_slug,
            identifier=connection.account_identifier,
            label=f"{connection.platform_name} official account",
            active=connection.active,
            filters={"dynamic_platform_connection_id": connection.id},
        )
        session.add(source)
        await session.flush()
    else:
        source.platform = connection.platform_slug
        source.identifier = connection.account_identifier
        source.label = f"{connection.platform_name} official account"
        source.active = connection.active
        source.filters = {**(source.filters or {}), "dynamic_platform_connection_id": connection.id}
    connection.integration_source_id = source.id

    monitor = await session.get(SocialMonitorConfig, connection.monitor_config_id) if connection.monitor_config_id else None
    if monitor is None:
        monitor = await session.scalar(
            select(SocialMonitorConfig).where(
                SocialMonitorConfig.tenant_id == connection.tenant_id,
                SocialMonitorConfig.platform == connection.platform_slug,
                SocialMonitorConfig.target_type == "account",
                SocialMonitorConfig.target_value == connection.account_identifier,
            )
        )
    if monitor is None:
        monitor = SocialMonitorConfig(
            tenant_id=connection.tenant_id,
            platform=connection.platform_slug,
            target_type="account",
            target_value=connection.account_identifier,
            label=f"{connection.platform_name} live account",
            active=connection.active,
        )
        session.add(monitor)
        await session.flush()
    else:
        monitor.platform = connection.platform_slug
        monitor.target_type = "account"
        monitor.target_value = connection.account_identifier
        monitor.label = f"{connection.platform_name} live account"
        monitor.active = connection.active
    connection.monitor_config_id = monitor.id


@router.get("/settings")
async def get_tenant_settings(
    user: Annotated[User, Depends(require_roles("tenant_admin", "executive"))],
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
        changed_services.append("smtp")
    if body.smtp_port is not None:
        config.smtp_port = body.smtp_port
        changed_services.append("smtp")
    if body.smtp_user is not None:
        config.smtp_user_enc = encrypt_value(body.smtp_user) if body.smtp_user else None
        changed_services.append("smtp")
    if body.smtp_pass is not None:
        config.smtp_pass_enc = encrypt_value(body.smtp_pass) if body.smtp_pass else None
        changed_services.append("smtp")
    if body.twilio_sid is not None:
        config.twilio_sid_enc = encrypt_value(body.twilio_sid) if body.twilio_sid else None
        changed_services.append("twilio")
    if body.twilio_token is not None:
        config.twilio_token_enc = encrypt_value(body.twilio_token) if body.twilio_token else None
        changed_services.append("twilio")
    if body.twilio_phone is not None:
        config.twilio_phone = body.twilio_phone or None
        changed_services.append("twilio")
    if body.storage_bucket is not None:
        config.storage_bucket = body.storage_bucket or None
        changed_services.append("storage")
    if body.storage_provider is not None:
        config.storage_provider = body.storage_provider or None
        changed_services.append("storage")
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
        details={"changed_services": sorted(set(changed_services))},
    ))

    await session.commit()
    return {"status": "updated", "byoi": _config_status(config), "changed_services": sorted(set(changed_services))}


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


@router.get("/settings/platform-api-connections")
async def list_dynamic_platform_connections(
    user: Annotated[User, Depends(require_roles("executive"))],
    session: Annotated[AsyncSession, Depends(get_session)],
):
    """List executive-managed dynamic platform API connections without exposing secrets."""
    tenant_id = assert_tenant(user, None)
    connections = (
        await session.scalars(
            select(PlatformAPIConnection)
            .where(PlatformAPIConnection.tenant_id == tenant_id)
            .order_by(PlatformAPIConnection.created_at.desc())
        )
    ).all()
    return {"connections": [_dynamic_platform_to_dict(item) for item in connections], "total": len(connections)}


@router.post("/settings/platform-api-connections/poll-now")
async def poll_dynamic_platform_connections_now(
    user: Annotated[User, Depends(require_roles("executive"))],
    session: Annotated[AsyncSession, Depends(get_session)],
):
    """Run platform polling immediately so users can verify new inbox/API connections."""
    tenant_id = assert_tenant(user, None)
    connections = (
        await session.scalars(
            select(PlatformAPIConnection).where(
                PlatformAPIConnection.tenant_id == tenant_id,
                PlatformAPIConnection.active.is_(True),
            )
        )
    ).all()
    for connection in connections:
        connection.last_polled_at = None
    await session.flush()
    result = await poll_due_platform_connections(session)
    return {
        "status": "polled",
        **result,
        "connections": [_dynamic_platform_to_dict(item) for item in connections],
    }


@router.post("/settings/platform-api-connections")
async def create_dynamic_platform_connection(
    body: DynamicPlatformConnectionIn,
    user: Annotated[User, Depends(require_roles("executive"))],
    session: Annotated[AsyncSession, Depends(get_session)],
):
    """Create a dynamic live platform connection with encrypted credentials."""
    tenant_id = assert_tenant(user, None)
    credentials = _validate_credentials(body.credentials)
    platform_slug = _platform_slug(body.platform_name)
    account_identifier = body.account_identifier.strip()
    existing = await session.scalar(
        select(PlatformAPIConnection).where(
            PlatformAPIConnection.tenant_id == tenant_id,
            PlatformAPIConnection.platform_slug == platform_slug,
            PlatformAPIConnection.account_identifier == account_identifier,
        )
    )
    if existing:
        raise HTTPException(status_code=409, detail="A connection for this platform account already exists")
    connection = PlatformAPIConnection(
        tenant_id=tenant_id,
        platform_name=body.platform_name.strip(),
        platform_slug=platform_slug,
        account_identifier=account_identifier,
        credentials_enc=encrypt_value(json.dumps(credentials)),
        active=body.active,
        poll_interval_seconds=body.poll_interval_seconds,
    )
    session.add(connection)
    await session.flush()
    await _sync_dynamic_platform_runtime_records(session, connection)
    session.add(AuditEvent(
        tenant_id=tenant_id,
        user_id=user.id,
        action="platform_api_connection.create",
        resource_type="platform_api_connection",
        resource_id=connection.id,
        details={"platform": connection.platform_slug, "account_identifier": connection.account_identifier},
    ))
    await session.commit()
    await session.refresh(connection)
    return {"status": "created", "connection": _dynamic_platform_to_dict(connection)}


@router.patch("/settings/platform-api-connections/{connection_id}")
async def update_dynamic_platform_connection(
    connection_id: str,
    body: DynamicPlatformConnectionPatch,
    user: Annotated[User, Depends(require_roles("executive"))],
    session: Annotated[AsyncSession, Depends(get_session)],
):
    """Update a dynamic live platform connection. Omitted credentials remain unchanged."""
    connection = await session.get(PlatformAPIConnection, connection_id)
    if connection is None:
        raise HTTPException(status_code=404, detail="Platform connection not found")
    assert_tenant(user, connection.tenant_id)

    previous = {
        "platform_name": connection.platform_name,
        "platform_slug": connection.platform_slug,
        "account_identifier": connection.account_identifier,
        "active": connection.active,
    }
    if body.platform_name is not None:
        connection.platform_name = body.platform_name.strip()
        connection.platform_slug = _platform_slug(body.platform_name)
    if body.account_identifier is not None:
        connection.account_identifier = body.account_identifier.strip()
    if body.credentials is not None:
        credentials = _validate_credentials(body.credentials)
        connection.credentials_enc = encrypt_value(json.dumps(credentials))
        connection.poll_cursor = None
        connection.last_error = None
    if body.active is not None:
        connection.active = body.active
    if body.poll_interval_seconds is not None:
        connection.poll_interval_seconds = body.poll_interval_seconds

    duplicate = await session.scalar(
        select(PlatformAPIConnection).where(
            PlatformAPIConnection.tenant_id == connection.tenant_id,
            PlatformAPIConnection.platform_slug == connection.platform_slug,
            PlatformAPIConnection.account_identifier == connection.account_identifier,
            PlatformAPIConnection.id != connection.id,
        )
    )
    if duplicate:
        raise HTTPException(status_code=409, detail="A connection for this platform account already exists")

    await _sync_dynamic_platform_runtime_records(session, connection)
    session.add(AuditEvent(
        tenant_id=connection.tenant_id,
        user_id=user.id,
        action="platform_api_connection.update",
        resource_type="platform_api_connection",
        resource_id=connection.id,
        previous_state=previous,
        new_state={
            "platform_name": connection.platform_name,
            "platform_slug": connection.platform_slug,
            "account_identifier": connection.account_identifier,
            "active": connection.active,
        },
    ))
    await session.commit()
    await session.refresh(connection)
    return {"status": "updated", "connection": _dynamic_platform_to_dict(connection)}


@router.delete("/settings/platform-api-connections/{connection_id}")
async def delete_dynamic_platform_connection(
    connection_id: str,
    user: Annotated[User, Depends(require_roles("executive"))],
    session: Annotated[AsyncSession, Depends(get_session)],
):
    """Remove a dynamic platform from live monitoring."""
    connection = await session.get(PlatformAPIConnection, connection_id)
    if connection is None:
        raise HTTPException(status_code=404, detail="Platform connection not found")
    assert_tenant(user, connection.tenant_id)
    if connection.integration_source_id:
        source = await session.get(IntegrationSource, connection.integration_source_id)
        if source:
            source.active = False
    if connection.monitor_config_id:
        monitor = await session.get(SocialMonitorConfig, connection.monitor_config_id)
        if monitor:
            monitor.active = False
    session.add(AuditEvent(
        tenant_id=connection.tenant_id,
        user_id=user.id,
        action="platform_api_connection.delete",
        resource_type="platform_api_connection",
        resource_id=connection.id,
        details={"platform": connection.platform_slug, "account_identifier": connection.account_identifier},
    ))
    await session.delete(connection)
    await session.commit()
    return {"status": "deleted", "id": connection_id}


@router.get("/settings/ai-providers/health")
async def get_ai_provider_health(
    user: Annotated[User, Depends(require_roles("tenant_admin"))],
    session: Annotated[AsyncSession, Depends(get_session)],
):
    """Return provider readiness without exposing credentials."""
    tenant_id = assert_tenant(user, None)
    config = await session.scalar(select(TenantConfig).where(TenantConfig.tenant_id == tenant_id))
    return {"providers": await provider_health(tenant_provider_configs(config))}


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
