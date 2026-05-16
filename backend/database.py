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


async def init_db() -> None:
    async with engine.begin() as conn:
        await conn.run_sync(Base.metadata.create_all)

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
