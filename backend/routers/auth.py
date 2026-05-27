"""Authentication, role discovery, and token refresh."""

from __future__ import annotations

import secrets
from datetime import datetime, timedelta, timezone
from typing import Annotated

from fastapi import APIRouter, Depends, HTTPException, Request
from fastapi.security import OAuth2PasswordRequestForm
from pydantic import BaseModel
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from database import get_session
from config import settings
from models import AuditEvent, PasswordResetToken, RefreshTokenSession, User
from security import (
    ROLES,
    create_access_token,
    create_refresh_token,
    decode_refresh_token,
    get_current_user,
    hash_password,
    hash_token,
    public_user,
    verify_password,
)

router = APIRouter()


class TokenResponse(BaseModel):
    access_token: str
    refresh_token: str
    token_type: str = "bearer"
    user: dict


class RefreshRequest(BaseModel):
    refresh_token: str


class LogoutRequest(BaseModel):
    refresh_token: str | None = None


class PasswordResetRequest(BaseModel):
    email: str


class PasswordResetConfirm(BaseModel):
    token: str
    new_password: str


def _client_context(request: Request) -> tuple[str | None, str | None]:
    user_agent = request.headers.get("user-agent")
    ip = request.client.host if request.client else None
    return user_agent, ip


async def _issue_refresh_session(session: AsyncSession, user: User, request: Request) -> str:
    refresh_token = create_refresh_token(user)
    user_agent, ip_address = _client_context(request)
    session.add(
        RefreshTokenSession(
            user_id=user.id,
            tenant_id=user.tenant_id,
            token_hash=hash_token(refresh_token),
            user_agent=user_agent[:512] if user_agent else None,
            ip_address=ip_address,
            expires_at=datetime.now(timezone.utc) + timedelta(days=settings.REFRESH_TOKEN_EXPIRE_DAYS),
        )
    )
    return refresh_token


@router.post("/auth/login", response_model=TokenResponse)
async def login(
    form_data: Annotated[OAuth2PasswordRequestForm, Depends()],
    session: Annotated[AsyncSession, Depends(get_session)],
    request: Request,
):
    user = await session.scalar(select(User).where(User.email == form_data.username.lower(), User.active.is_(True)))
    if user is None or not verify_password(form_data.password, user.hashed_password):
        raise HTTPException(status_code=401, detail="Incorrect email or password")
    user.last_login = datetime.now(timezone.utc)
    refresh_token = await _issue_refresh_session(session, user, request)
    session.add(AuditEvent(tenant_id=user.tenant_id, user_id=user.id, action="auth.login", resource_type="user", resource_id=user.id))
    await session.commit()
    return TokenResponse(
        access_token=create_access_token(user),
        refresh_token=refresh_token,
        user=public_user(user),
    )


@router.post("/auth/refresh", response_model=TokenResponse)
async def refresh_token(
    body: RefreshRequest,
    session: Annotated[AsyncSession, Depends(get_session)],
    request: Request,
):
    """Exchange a valid refresh token for a new access + refresh token pair."""
    payload = decode_refresh_token(body.refresh_token)
    email = payload.get("sub")
    if not isinstance(email, str):
        raise HTTPException(status_code=401, detail="Invalid refresh token")
    user = await session.scalar(select(User).where(User.email == email.lower(), User.active.is_(True)))
    if user is None:
        raise HTTPException(status_code=401, detail="User not found or inactive")
    if user.tenant_id != payload.get("tenant"):
        raise HTTPException(status_code=401, detail="Tenant mismatch")
    stored = await session.scalar(
        select(RefreshTokenSession).where(
            RefreshTokenSession.user_id == user.id,
            RefreshTokenSession.token_hash == hash_token(body.refresh_token),
        )
    )
    now = datetime.now(timezone.utc)
    if stored is None or stored.revoked_at is not None or stored.expires_at <= now:
        raise HTTPException(status_code=401, detail="Refresh token has expired or was revoked")
    stored.revoked_at = now
    new_refresh_token = await _issue_refresh_session(session, user, request)
    session.add(AuditEvent(tenant_id=user.tenant_id, user_id=user.id, action="auth.refresh", resource_type="refresh_session", resource_id=stored.id))
    await session.commit()
    return TokenResponse(
        access_token=create_access_token(user),
        refresh_token=new_refresh_token,
        user=public_user(user),
    )


@router.post("/auth/logout")
async def logout(
    body: LogoutRequest,
    user: Annotated[User, Depends(get_current_user)],
    session: Annotated[AsyncSession, Depends(get_session)],
):
    if body.refresh_token:
        stored = await session.scalar(
            select(RefreshTokenSession).where(
                RefreshTokenSession.user_id == user.id,
                RefreshTokenSession.token_hash == hash_token(body.refresh_token),
                RefreshTokenSession.revoked_at.is_(None),
            )
        )
        if stored:
            stored.revoked_at = datetime.now(timezone.utc)
    session.add(AuditEvent(tenant_id=user.tenant_id, user_id=user.id, action="auth.logout", resource_type="user", resource_id=user.id))
    await session.commit()
    return {"status": "ok"}


@router.post("/auth/password-reset/request")
async def request_password_reset(
    body: PasswordResetRequest,
    session: Annotated[AsyncSession, Depends(get_session)],
):
    user = await session.scalar(select(User).where(User.email == body.email.lower(), User.active.is_(True)))
    response: dict = {"status": "accepted"}
    if user:
        token = secrets.token_urlsafe(48)
        session.add(
            PasswordResetToken(
                user_id=user.id,
                token_hash=hash_token(token),
                expires_at=datetime.now(timezone.utc) + timedelta(minutes=30),
            )
        )
        session.add(AuditEvent(tenant_id=user.tenant_id, user_id=user.id, action="auth.password_reset.request", resource_type="user", resource_id=user.id))
        await session.commit()
        if settings.ENVIRONMENT != "production":
            response["reset_token"] = token
    return response


@router.post("/auth/password-reset/confirm")
async def confirm_password_reset(
    body: PasswordResetConfirm,
    session: Annotated[AsyncSession, Depends(get_session)],
):
    if len(body.new_password) < 12:
        raise HTTPException(status_code=400, detail="Password must be at least 12 characters")
    reset = await session.scalar(select(PasswordResetToken).where(PasswordResetToken.token_hash == hash_token(body.token)))
    now = datetime.now(timezone.utc)
    if reset is None or reset.used_at is not None or reset.expires_at <= now:
        raise HTTPException(status_code=400, detail="Reset token is invalid or expired")
    user = await session.get(User, reset.user_id)
    if user is None or not user.active:
        raise HTTPException(status_code=400, detail="Reset token is invalid or expired")
    user.hashed_password = hash_password(body.new_password)
    reset.used_at = now
    await session.execute(
        RefreshTokenSession.__table__.update()
        .where(RefreshTokenSession.user_id == user.id, RefreshTokenSession.revoked_at.is_(None))
        .values(revoked_at=now)
    )
    session.add(AuditEvent(tenant_id=user.tenant_id, user_id=user.id, action="auth.password_reset.confirm", resource_type="user", resource_id=user.id))
    await session.commit()
    return {"status": "password_updated"}


@router.get("/auth/me")
async def get_me(user: Annotated[User, Depends(get_current_user)]):
    return public_user(user)


@router.get("/auth/roles")
async def list_roles():
    return {"roles": ROLES}
