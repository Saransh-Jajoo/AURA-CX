"""Authentication, role discovery, and token refresh."""

from __future__ import annotations

from typing import Annotated

from fastapi import APIRouter, Depends, HTTPException
from fastapi.security import OAuth2PasswordRequestForm
from pydantic import BaseModel
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from database import get_session
from models import User
from security import (
    ROLES,
    create_access_token,
    create_refresh_token,
    decode_refresh_token,
    get_current_user,
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


@router.post("/auth/login", response_model=TokenResponse)
async def login(
    form_data: Annotated[OAuth2PasswordRequestForm, Depends()],
    session: Annotated[AsyncSession, Depends(get_session)],
):
    user = await session.scalar(select(User).where(User.email == form_data.username.lower(), User.active.is_(True)))
    if user is None or not verify_password(form_data.password, user.hashed_password):
        raise HTTPException(status_code=401, detail="Incorrect email or password")
    return TokenResponse(
        access_token=create_access_token(user),
        refresh_token=create_refresh_token(user),
        user=public_user(user),
    )


@router.post("/auth/refresh", response_model=TokenResponse)
async def refresh_token(
    body: RefreshRequest,
    session: Annotated[AsyncSession, Depends(get_session)],
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
    return TokenResponse(
        access_token=create_access_token(user),
        refresh_token=create_refresh_token(user),
        user=public_user(user),
    )


@router.get("/auth/me")
async def get_me(user: Annotated[User, Depends(get_current_user)]):
    return public_user(user)


@router.get("/auth/roles")
async def list_roles():
    return {"roles": ROLES}
