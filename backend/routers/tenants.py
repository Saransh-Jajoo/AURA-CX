"""Tenant administration endpoints."""

from __future__ import annotations

import secrets
from typing import Annotated

from fastapi import APIRouter, Depends
from pydantic import BaseModel, EmailStr, Field
from sqlalchemy import func, select
from sqlalchemy.ext.asyncio import AsyncSession

from database import get_session
from models import Tenant, User
from security import hash_password, require_roles

router = APIRouter()


class TenantCreate(BaseModel):
    id: str = Field(min_length=3, max_length=64)
    name: str = Field(min_length=1, max_length=255)
    plan: str = "starter"


class UserCreate(BaseModel):
    email: EmailStr
    name: str = Field(min_length=1, max_length=255)
    role: str
    password: str = Field(min_length=12)
    tenant_id: str | None = None


@router.get("/tenants")
async def list_tenants(
    user: Annotated[User, Depends(require_roles("tenant_admin"))],
    session: Annotated[AsyncSession, Depends(get_session)],
):
    if user.role == "super_admin":
        tenants = (await session.scalars(select(Tenant).order_by(Tenant.created_at.desc()))).all()
    else:
        tenants = [await session.get(Tenant, user.tenant_id)]
    result = []
    for tenant in [item for item in tenants if item is not None]:
        agents = await session.scalar(select(func.count(User.id)).where(User.tenant_id == tenant.id))
        result.append(
            {
                "id": tenant.id,
                "name": tenant.name,
                "plan": tenant.plan,
                "agents": agents or 0,
                "status": "active",
                "stripe_customer_id": tenant.stripe_customer_id,
                "created_at": tenant.created_at.isoformat(),
            }
        )
    return {"tenants": result, "total": len(result)}


@router.post("/tenants")
async def create_tenant(
    body: TenantCreate,
    _: Annotated[User, Depends(require_roles("super_admin"))],
    session: Annotated[AsyncSession, Depends(get_session)],
):
    tenant = Tenant(id=body.id, name=body.name, plan=body.plan)
    session.add(tenant)
    await session.commit()
    return {"tenant": {"id": tenant.id, "name": tenant.name, "plan": tenant.plan}}


@router.post("/tenants/users")
async def create_user(
    body: UserCreate,
    actor: Annotated[User, Depends(require_roles("tenant_admin"))],
    session: Annotated[AsyncSession, Depends(get_session)],
):
    tenant_id = body.tenant_id if actor.role == "super_admin" else actor.tenant_id
    initials = "".join(part[:1].upper() for part in body.name.split()) or "AU"
    new_user = User(
        tenant_id=tenant_id,
        email=body.email.lower(),
        name=body.name,
        role=body.role,
        hashed_password=hash_password(body.password),
        avatar=(initials + secrets.token_hex(1).upper())[:4],
    )
    session.add(new_user)
    await session.commit()
    return {"user": {"id": new_user.id, "email": new_user.email, "role": new_user.role, "tenant_id": new_user.tenant_id}}

