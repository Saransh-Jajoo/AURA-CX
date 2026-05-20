"""JWT authentication, password hashing, RBAC, scopes, and webhook security."""

from __future__ import annotations

import hashlib
import hmac
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
            "social_monitor.manage",
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

# Fine-grained JWT scopes derived from roles
ROLE_SCOPES: dict[str, list[str]] = {
    "super_admin": ["*"],
    "tenant_admin": [
        "tenant:read", "users:manage", "integrations:manage", "billing:manage",
        "tickets:read", "analytics:read", "profiles:read", "social_monitor:manage",
    ],
    "executive": ["analytics:read", "billing:read", "profiles:read"],
    "qa_reviewer": ["tickets:read", "qa:review", "rlhf:write", "analytics:read"],
    "support_agent": ["tickets:read", "tickets:write", "hitl:write", "profiles:read"],
}

oauth2_scheme = OAuth2PasswordBearer(tokenUrl="/api/v1/auth/login")


def hash_password(password: str) -> str:
    return bcrypt.hashpw(password.encode("utf-8"), bcrypt.gensalt()).decode("utf-8")


def verify_password(password: str, hashed_password: str) -> bool:
    return bcrypt.checkpw(password.encode("utf-8"), hashed_password.encode("utf-8"))


def create_access_token(user: User) -> str:
    now = datetime.now(timezone.utc)
    scopes = ROLE_SCOPES.get(user.role, [])
    payload = {
        "sub": user.email,
        "uid": user.id,
        "role": user.role,
        "tenant": user.tenant_id,
        "scopes": scopes,
        "iat": int(now.timestamp()),
        "exp": int((now + timedelta(minutes=settings.ACCESS_TOKEN_EXPIRE_MINUTES)).timestamp()),
        "type": "access",
    }
    return jwt.encode(payload, settings.SECRET_KEY, algorithm=settings.ALGORITHM)


def create_refresh_token(user: User) -> str:
    """Create a long-lived refresh token for token rotation."""
    now = datetime.now(timezone.utc)
    payload = {
        "sub": user.email,
        "uid": user.id,
        "tenant": user.tenant_id,
        "iat": int(now.timestamp()),
        "exp": int((now + timedelta(days=settings.REFRESH_TOKEN_EXPIRE_DAYS)).timestamp()),
        "type": "refresh",
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


def decode_refresh_token(token: str) -> dict:
    """Decode and validate a refresh token."""
    try:
        payload = jwt.decode(token, settings.SECRET_KEY, algorithms=[settings.ALGORITHM])
    except JWTError as exc:
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Invalid refresh token") from exc
    if payload.get("type") != "refresh":
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Not a refresh token")
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


def require_scopes(*required_scopes: str):
    """Require specific fine-grained scopes (e.g. 'tickets:read', 'social_monitor:manage')."""
    async def checker(user: Annotated[User, Depends(get_current_user)]) -> User:
        if user.role == "super_admin":
            return user
        user_scopes = ROLE_SCOPES.get(user.role, [])
        if "*" in user_scopes:
            return user
        for scope in required_scopes:
            if scope not in user_scopes:
                raise HTTPException(
                    status_code=status.HTTP_403_FORBIDDEN,
                    detail=f"Missing required scope: {scope}",
                )
        return user
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


# ── Webhook Security ──────────────────────────────────────────────────
def verify_webhook_signature(secret: str, payload: bytes, signature: str) -> bool:
    """
    Verify webhook HMAC signature (SHA-256).
    
    Args:
        secret: The webhook signing secret (from settings.WEBHOOK_SIGNING_SECRET)
        payload: Raw request body bytes
        signature: The X-Aura-Webhook-Signature header value (hex format)
    
    Returns:
        True if signature is valid, False otherwise
    
    Security: Uses constant-time comparison to prevent timing attacks
    """
    if not secret:
        raise ValueError("WEBHOOK_SIGNING_SECRET is not configured")
    
    expected = hmac.new(
        secret.encode("utf-8"),
        payload,
        hashlib.sha256,
    ).hexdigest()
    
    # Constant-time comparison prevents timing attacks
    return hmac.compare_digest(expected, signature)


async def verify_webhook_request(
    request_body: bytes,
    signature_header: str | None,
) -> bool:
    """
    Dependency to verify webhook signature in FastAPI route.
    
    Raises HTTPException(401) if signature is invalid.
    """
    if not signature_header:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Missing X-Aura-Webhook-Signature header",
        )
    
    try:
        if not verify_webhook_signature(
            settings.WEBHOOK_SIGNING_SECRET,
            request_body,
            signature_header,
        ):
            raise HTTPException(
                status_code=status.HTTP_401_UNAUTHORIZED,
                detail="Invalid webhook signature",
            )
    except ValueError as exc:
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=str(exc),
        ) from exc
    
    return True
