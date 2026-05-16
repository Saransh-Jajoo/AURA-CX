"""Team management, invitations, and user lifecycle endpoints."""

from __future__ import annotations

import secrets
from datetime import datetime, timedelta, timezone
from typing import Annotated

from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel, EmailStr, Field, field_validator
from sqlalchemy import select, func
from sqlalchemy.ext.asyncio import AsyncSession

from database import get_session
from models import AuditEvent, TeamInvitation, User
from security import ROLES, assert_tenant, hash_password, require_roles

router = APIRouter()


class InviteRequest(BaseModel):
    email: EmailStr
    role: str
    name: str = Field(default="", max_length=255)

    @field_validator("role")
    @classmethod
    def validate_role(cls, value: str) -> str:
        if value not in ROLES or value == "super_admin":
            raise ValueError("Invalid role for invitation")
        return value


class AcceptInviteRequest(BaseModel):
    token: str
    name: str = Field(min_length=1, max_length=255)
    password: str = Field(min_length=12)


class UpdateUserRequest(BaseModel):
    name: str | None = None
    role: str | None = None
    active: bool | None = None
    department: str | None = None

    @field_validator("role")
    @classmethod
    def validate_role(cls, value: str | None) -> str | None:
        if value is not None and (value not in ROLES or value == "super_admin"):
            raise ValueError("Invalid role")
        return value


def _user_summary(user: User) -> dict:
    return {
        "id": user.id,
        "email": user.email,
        "name": user.name,
        "role": user.role,
        "active": user.active,
        "department": user.department,
        "avatar": user.avatar,
        "language": user.language,
        "last_login": user.last_login.isoformat() if user.last_login else None,
        "created_at": user.created_at.isoformat(),
    }


@router.get("/team/members")
async def list_team_members(
    user: Annotated[User, Depends(require_roles("tenant_admin"))],
    session: Annotated[AsyncSession, Depends(get_session)],
    tenant_id: str | None = None,
):
    """List all team members for the tenant."""
    scoped_tenant = assert_tenant(user, tenant_id)
    members = (
        await session.scalars(
            select(User)
            .where(User.tenant_id == scoped_tenant)
            .order_by(User.created_at.desc())
        )
    ).all()
    return {"members": [_user_summary(m) for m in members], "total": len(members)}


@router.post("/team/invite")
async def invite_member(
    body: InviteRequest,
    user: Annotated[User, Depends(require_roles("tenant_admin"))],
    session: Annotated[AsyncSession, Depends(get_session)],
):
    """Send a team invitation."""
    scoped_tenant = assert_tenant(user, None)

    # Check if email already exists in this tenant
    existing = await session.scalar(
        select(User).where(User.email == body.email.lower(), User.tenant_id == scoped_tenant)
    )
    if existing:
        raise HTTPException(status_code=409, detail="User already exists in this tenant")

    # Check for pending invitation
    pending = await session.scalar(
        select(TeamInvitation).where(
            TeamInvitation.tenant_id == scoped_tenant,
            TeamInvitation.email == body.email.lower(),
            TeamInvitation.accepted.is_(False),
        )
    )
    if pending:
        raise HTTPException(status_code=409, detail="Invitation already pending for this email")

    invitation = TeamInvitation(
        tenant_id=scoped_tenant,
        email=body.email.lower(),
        role=body.role,
        invited_by=user.id,
        expires_at=datetime.now(timezone.utc) + timedelta(days=7),
    )
    session.add(invitation)

    # Audit log
    session.add(AuditEvent(
        tenant_id=scoped_tenant,
        user_id=user.id,
        action="team.invite",
        resource_type="invitation",
        resource_id=invitation.id,
        details={"email": body.email.lower(), "role": body.role},
    ))

    await session.commit()
    return {
        "status": "invited",
        "invitation_id": invitation.id,
        "token": invitation.token,
        "expires_at": invitation.expires_at.isoformat(),
        "invite_link": f"/onboarding/accept?token={invitation.token}",
    }


@router.get("/team/invitations")
async def list_invitations(
    user: Annotated[User, Depends(require_roles("tenant_admin"))],
    session: Annotated[AsyncSession, Depends(get_session)],
    tenant_id: str | None = None,
):
    """List all pending invitations."""
    scoped_tenant = assert_tenant(user, tenant_id)
    invitations = (
        await session.scalars(
            select(TeamInvitation)
            .where(TeamInvitation.tenant_id == scoped_tenant)
            .order_by(TeamInvitation.created_at.desc())
        )
    ).all()
    return {
        "invitations": [
            {
                "id": inv.id,
                "email": inv.email,
                "role": inv.role,
                "accepted": inv.accepted,
                "token": inv.token if not inv.accepted else None,
                "expires_at": inv.expires_at.isoformat(),
                "created_at": inv.created_at.isoformat(),
            }
            for inv in invitations
        ],
        "total": len(invitations),
    }


@router.post("/team/accept-invite")
async def accept_invitation(
    body: AcceptInviteRequest,
    session: Annotated[AsyncSession, Depends(get_session)],
):
    """Accept a team invitation and create the user account."""
    invitation = await session.scalar(
        select(TeamInvitation).where(TeamInvitation.token == body.token, TeamInvitation.accepted.is_(False))
    )
    if invitation is None:
        raise HTTPException(status_code=404, detail="Invalid or expired invitation")
    if invitation.expires_at < datetime.now(timezone.utc):
        raise HTTPException(status_code=410, detail="Invitation has expired")

    # Check if user already exists
    existing = await session.scalar(select(User).where(User.email == invitation.email))
    if existing:
        raise HTTPException(status_code=409, detail="User account already exists")

    initials = "".join(part[:1].upper() for part in body.name.split()) or "AU"
    new_user = User(
        tenant_id=invitation.tenant_id,
        email=invitation.email,
        name=body.name,
        role=invitation.role,
        hashed_password=hash_password(body.password),
        avatar=(initials + secrets.token_hex(1).upper())[:4],
    )
    session.add(new_user)
    invitation.accepted = True

    session.add(AuditEvent(
        tenant_id=invitation.tenant_id,
        user_id=new_user.id,
        action="team.join",
        resource_type="user",
        resource_id=new_user.id,
        details={"email": invitation.email, "role": invitation.role},
    ))

    await session.commit()
    return {"status": "accepted", "user_id": new_user.id, "email": new_user.email, "role": new_user.role}


@router.patch("/team/members/{user_id}")
async def update_member(
    user_id: str,
    body: UpdateUserRequest,
    actor: Annotated[User, Depends(require_roles("tenant_admin"))],
    session: Annotated[AsyncSession, Depends(get_session)],
):
    """Update a team member's role, name, or active status."""
    target = await session.get(User, user_id)
    if target is None:
        raise HTTPException(status_code=404, detail="User not found")
    assert_tenant(actor, target.tenant_id)

    previous_state = {"name": target.name, "role": target.role, "active": target.active}

    if body.name is not None:
        target.name = body.name
    if body.role is not None:
        target.role = body.role
    if body.active is not None:
        target.active = body.active
    if body.department is not None:
        target.department = body.department

    session.add(AuditEvent(
        tenant_id=target.tenant_id,
        user_id=actor.id,
        action="team.update",
        resource_type="user",
        resource_id=user_id,
        previous_state=previous_state,
        new_state={"name": target.name, "role": target.role, "active": target.active},
        details={"updated_by": actor.email},
    ))

    await session.commit()
    return {"status": "updated", "user": _user_summary(target)}


@router.delete("/team/members/{user_id}")
async def suspend_member(
    user_id: str,
    actor: Annotated[User, Depends(require_roles("tenant_admin"))],
    session: Annotated[AsyncSession, Depends(get_session)],
):
    """Suspend (deactivate) a team member."""
    target = await session.get(User, user_id)
    if target is None:
        raise HTTPException(status_code=404, detail="User not found")
    assert_tenant(actor, target.tenant_id)
    if target.id == actor.id:
        raise HTTPException(status_code=400, detail="Cannot suspend yourself")

    target.active = False
    session.add(AuditEvent(
        tenant_id=target.tenant_id,
        user_id=actor.id,
        action="team.suspend",
        resource_type="user",
        resource_id=user_id,
        details={"suspended_email": target.email},
    ))
    await session.commit()
    return {"status": "suspended", "user_id": user_id}
