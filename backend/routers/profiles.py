"""Golden Profile and identity resolution endpoints."""

from __future__ import annotations

from collections import defaultdict
from datetime import datetime, timedelta, timezone
from typing import Annotated

from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy import func, select
from sqlalchemy.ext.asyncio import AsyncSession

from database import get_session
from models import CustomerProfile, Ticket, User
from security import assert_tenant, require_roles

router = APIRouter()


def _profile_summary(profile: CustomerProfile, total_tickets: int = 0) -> dict:
    return {
        "id": profile.id,
        "name": profile.name,
        "email": profile.email,
        "x_handle": profile.x_handle,
        "reddit_handle": profile.reddit_handle,
        "avatar_url": None,
        "ltv": profile.ltv,
        "churn_risk": profile.churn_risk,
        "churn_alert": profile.churn_risk > 0.55,
        "plan": profile.plan,
        "tags": profile.tags,
        "total_tickets": total_tickets,
    }


async def _profile_detail(session: AsyncSession, tenant_id: str, profile: CustomerProfile) -> dict:
    tickets = (
        await session.scalars(
            select(Ticket)
            .where(Ticket.tenant_id == tenant_id, Ticket.profile_id == profile.id)
            .order_by(Ticket.received_at.desc())
            .limit(200)
        )
    ).all()
    buckets: dict[str, list[float]] = defaultdict(list)
    for ticket in tickets:
        hour = ticket.received_at.replace(minute=0, second=0, microsecond=0).isoformat()
        buckets[hour].append(ticket.sentiment_score)
    velocity = [
        {"timestamp": hour, "score": round(sum(values) / len(values), 3)}
        for hour, values in sorted(buckets.items())[-24:]
    ]
    vectors = profile.identity_vectors or {}
    return {
        **_profile_summary(profile, len(tickets)),
        "identity_resolution": {
            "cosine_similarity": profile.identity_score,
            "x_vector": vectors.get("x_vector") or [],
            "email_vector": vectors.get("email_vector") or [],
            "reddit_vector": vectors.get("reddit_vector") or [],
            "match_confidence": "verified" if profile.identity_score >= 0.95 else "high" if profile.identity_score >= 0.92 else "unverified",
            "method": profile.identity_method or "Vector Similarity (Cosine > 0.92)",
        },
        "avg_resolution_hours": 0,
        "satisfaction_score": 0,
        "interactions": [
            {
                "channel": ticket.channel,
                "handle": ticket.customer_handle,
                "message": ticket.message,
                "sentiment": ticket.sentiment,
                "timestamp": ticket.received_at.isoformat(),
            }
            for ticket in tickets
        ],
        "sentiment_velocity": velocity,
    }


@router.get("/profiles")
async def get_all_profiles(
    user: Annotated[User, Depends(require_roles("tenant_admin", "manager", "executive", "qa_reviewer", "support_agent", "read_only_analyst"))],
    session: Annotated[AsyncSession, Depends(get_session)],
    tenant_id: str | None = None,
):
    scoped_tenant = assert_tenant(user, tenant_id)
    profiles = (
        await session.scalars(
            select(CustomerProfile)
            .where(CustomerProfile.tenant_id == scoped_tenant)
            .order_by(CustomerProfile.updated_at.desc())
            .limit(250)
        )
    ).all()
    summaries = []
    for profile in profiles:
        count = await session.scalar(select(func.count(Ticket.id)).where(Ticket.tenant_id == scoped_tenant, Ticket.profile_id == profile.id))
        summaries.append(_profile_summary(profile, count or 0))
    return {"profiles": summaries, "total": len(summaries)}


@router.get("/profiles/{profile_id}")
async def get_profile(
    profile_id: str,
    user: Annotated[User, Depends(require_roles("tenant_admin", "manager", "executive", "qa_reviewer", "support_agent", "read_only_analyst"))],
    session: Annotated[AsyncSession, Depends(get_session)],
):
    profile = await session.get(CustomerProfile, profile_id)
    if profile is None:
        ticket = await session.get(Ticket, profile_id)
        if ticket is None or not ticket.profile_id:
            raise HTTPException(status_code=404, detail="Profile not found")
        assert_tenant(user, ticket.tenant_id)
        profile = await session.get(CustomerProfile, ticket.profile_id)
    if profile is None:
        raise HTTPException(status_code=404, detail="Profile not found")
    scoped_tenant = assert_tenant(user, profile.tenant_id)
    return await _profile_detail(session, scoped_tenant, profile)
