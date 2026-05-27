"""Async database engine, sessions, and startup bootstrap."""

from __future__ import annotations

import bcrypt

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession, async_sessionmaker, create_async_engine

from config import settings
from models import Base, Tenant, User


engine = create_async_engine(settings.DATABASE_URL, pool_pre_ping=True)
SessionLocal = async_sessionmaker(engine, class_=AsyncSession, expire_on_commit=False)


def _hash_password(password: str) -> str:
    return bcrypt.hashpw(password.encode("utf-8"), bcrypt.gensalt()).decode("utf-8")


async def get_session():
    async with SessionLocal() as session:
        yield session


async def set_tenant_context(session: AsyncSession, tenant_id: str) -> None:
    """Set the current tenant for Row-Level Security policies.
    
    Call this at the start of request handlers that need RLS enforcement.
    The tenant_id is parameterized to prevent SQL injection.
    """
    from sqlalchemy import text
    # Use parameterized query to prevent SQL injection
    await session.execute(text("SELECT set_config('app.current_tenant', :tid, true)"), {"tid": tenant_id})


async def init_db() -> None:
    async with engine.begin() as conn:
        await conn.run_sync(Base.metadata.create_all)
        # Incremental column migrations — safe to re-run (IF NOT EXISTS)
        _platform_columns = [
            ("x_bearer_token_enc", "TEXT"),
            ("anthropic_api_key_enc", "TEXT"),
            ("mistral_api_key_enc", "TEXT"),
            ("openrouter_api_key_enc", "TEXT"),
            ("ollama_base_url", "VARCHAR(512)"),
            ("self_hosted_base_url", "VARCHAR(512)"),
            ("self_hosted_api_key_enc", "TEXT"),
            ("ai_provider", "VARCHAR(32) DEFAULT 'gemini' NOT NULL"),
            ("ai_model", "VARCHAR(128)"),
            ("ai_fallback_order", "JSONB DEFAULT '[]'::jsonb NOT NULL"),
            ("x_api_key_enc", "TEXT"),
            ("x_api_secret_enc", "TEXT"),
            ("x_access_token_enc", "TEXT"),
            ("x_access_secret_enc", "TEXT"),
            ("reddit_client_id_enc", "TEXT"),
            ("reddit_client_secret_enc", "TEXT"),
            ("reddit_user_agent", "VARCHAR(512)"),
            ("reddit_username_enc", "TEXT"),
            ("reddit_password_enc", "TEXT"),
            ("gmail_imap_host", "VARCHAR(512)"),
            ("gmail_imap_port", "INTEGER"),
            ("gmail_imap_user_enc", "TEXT"),
            ("gmail_imap_pass_enc", "TEXT"),
            ("threads_access_token_enc", "TEXT"),
        ]
        from sqlalchemy import text as _sql_text
        for col_name, col_type in _platform_columns:
            try:
                await conn.execute(
                    _sql_text(f"ALTER TABLE tenant_configs ADD COLUMN IF NOT EXISTS {col_name} {col_type}")
                )
            except Exception:  # noqa: BLE001
                pass  # column already exists or table doesn't exist yet

        # Ticket: private channel resolution fields
        _ticket_columns = [
            ("resolved_by", "VARCHAR(64)"),
            ("private_channel", "VARCHAR(32)"),
            ("private_channel_token", "VARCHAR(256)"),
            ("private_channel_address", "VARCHAR(512)"),
            ("handoff_at", "TIMESTAMPTZ"),
        ]
        for col_name, col_type in _ticket_columns:
            try:
                await conn.execute(
                    _sql_text(f"ALTER TABLE tickets ADD COLUMN IF NOT EXISTS {col_name} {col_type}")
                )
            except Exception:  # noqa: BLE001
                pass

        # Unique index on private_channel_token for fast lookup
        try:
            await conn.execute(
                _sql_text(
                    "CREATE UNIQUE INDEX IF NOT EXISTS ix_tickets_private_channel_token "
                    "ON tickets(private_channel_token) WHERE private_channel_token IS NOT NULL"
                )
            )
        except Exception:  # noqa: BLE001
            pass

    async with SessionLocal() as session:
        tenant = await session.get(Tenant, settings.BOOTSTRAP_TENANT_ID)
        if tenant is None:
            tenant = Tenant(
                id=settings.BOOTSTRAP_TENANT_ID,
                name=settings.BOOTSTRAP_TENANT_NAME,
                plan="enterprise",
            )
            session.add(tenant)

        if settings.BOOTSTRAP_ADMIN_EMAIL and settings.BOOTSTRAP_ADMIN_PASSWORD:
            existing = await session.scalar(select(User).where(User.email == settings.BOOTSTRAP_ADMIN_EMAIL.lower()))
            if existing is None:
                initials = "".join(part[:1].upper() for part in settings.BOOTSTRAP_ADMIN_EMAIL.split("@")[0].split("."))
                session.add(
                    User(
                        tenant_id=settings.BOOTSTRAP_TENANT_ID,
                        email=settings.BOOTSTRAP_ADMIN_EMAIL.lower(),
                        name="Tenant Administrator",
                        hashed_password=_hash_password(settings.BOOTSTRAP_ADMIN_PASSWORD),
                        role="tenant_admin",
                        avatar=(initials or "TA")[:4],
                    )
                )

        await session.commit()
