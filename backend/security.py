"""JWT authentication, password hashing, and RBAC helpers."""

from __future__ import annotations

from datetime import datetime, timedelta, timezone
from typing import Annotated, Callable

import bcrypt
from fastapi import Depends, HTTPException, status
from fastapi.security import OAuth2PasswordBearer
from jose import JWTError, jwt
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from config import settings
from database import get_session
from models import User


Role = str

ROLES: dict[str, dict] = {
    "super_admin": {
        "label": "Super Admin",
        "permissions": ["*"],
        "description": "Global platform owner with tenant creation and system health access.",
    },
    "tenant_admin": {
        "label": "Tenant Admin",
        "permissions": [
            "tenant.read",
            "users.manage",
            "integrations.manage",
            "billing.manage",
            "tickets.read",
            "analytics.read",
            "profiles.read",
        ],
        "description": "Company administrator for users, integrations, billing, and tenant settings.",
    },
    "executive": {
        "label": "Executive",
        "permissions": ["analytics.read", "billing.read", "profiles.read"],
        "description": "Leadership analytics, ROI, risk, and compliance reporting.",
    },
    "qa_reviewer": {
        "label": "QA Reviewer",
        "permissions": ["tickets.read", "qa.review", "rlhf.write", "analytics.read"],
        "description": "Reviews agent edits and approves signals for the RLHF loop.",
    },
    "support_agent": {
        "label": "Support Agent",
        "permissions": ["tickets.read", "tickets.write", "hitl.write", "profiles.read"],
        "description": "Frontline HITL ticket resolution and profile lookup.",
    },
}

oauth2_scheme = OAuth2PasswordBearer(tokenUrl="/api/v1/auth/login")


def hash_password(password: str) -> str:
    return bcrypt.hashpw(password.encode("utf-8"), bcrypt.gensalt()).decode("utf-8")


def verify_password(password: str, hashed_password: str) -> bool:
    return bcrypt.checkpw(password.encode("utf-8"), hashed_password.encode("utf-8"))


def create_access_token(user: User) -> str:
    now = datetime.now(timezone.utc)
    payload = {
        "sub": user.email,
        "uid": user.id,
        "role": user.role,
        "tenant": user.tenant_id,
        "iat": int(now.timestamp()),
        "exp": int((now + timedelta(minutes=settings.ACCESS_TOKEN_EXPIRE_MINUTES)).timestamp()),
    }
    return jwt.encode(payload, settings.SECRET_KEY, algorithm=settings.ALGORITHM)


def decode_token(token: str) -> dict:
    try:
        payload = jwt.decode(token, settings.SECRET_KEY, algorithms=[settings.ALGORITHM])
    except JWTError as exc:
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Invalid credentials") from exc
    if payload.get("role") not in ROLES:
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Invalid role")
    return payload


async def get_current_user(
    token: Annotated[str, Depends(oauth2_scheme)],
    session: Annotated[AsyncSession, Depends(get_session)],
) -> User:
    payload = decode_token(token)
    email = payload.get("sub")
    if not isinstance(email, str):
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Invalid credentials")
    user = await session.scalar(select(User).where(User.email == email.lower(), User.active.is_(True)))
    if user is None:
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Invalid credentials")
    if user.role != payload.get("role") or user.tenant_id != payload.get("tenant"):
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Stale credentials")
    return user


def require_roles(*roles: Role) -> Callable[[User], User]:
    async def checker(user: Annotated[User, Depends(get_current_user)]) -> User:
        if user.role == "super_admin" or user.role in roles:
            return user
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Insufficient role")

    return checker


def assert_tenant(user: User, tenant_id: str | None) -> str:
    if user.role == "super_admin" and tenant_id:
        return tenant_id
    if not user.tenant_id:
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="User is not scoped to a tenant")
    if tenant_id and tenant_id != user.tenant_id and user.role != "super_admin":
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Cross-tenant access denied")
    return user.tenant_id


def public_user(user: User) -> dict:
    return {
        "id": user.id,
        "email": user.email,
        "name": user.name,
        "role": user.role,
        "tenant_id": user.tenant_id,
        "avatar": user.avatar,
        "role_info": ROLES[user.role],
    }

