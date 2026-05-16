"""Analytics, HDBSCAN clusters, and shadow tickets from real data."""

from __future__ import annotations

from collections import defaultdict
from datetime import datetime, timedelta, timezone
from typing import Annotated

from fastapi import APIRouter, Depends
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from database import get_session
from models import Ticket, User
from security import assert_tenant, require_roles
from services.clustering import detect_clusters, shadow_tickets_from_clusters

router = APIRouter()


@router.get("/analytics/clusters")
async def get_clusters(
    user: Annotated[User, Depends(require_roles("tenant_admin", "executive", "qa_reviewer"))],
    session: Annotated[AsyncSession, Depends(get_session)],
    tenant_id: str | None = None,
):
    scoped_tenant = assert_tenant(user, tenant_id)
    clusters = await detect_clusters(session, scoped_tenant)
    return {"clusters": clusters, "total": len(clusters), "anomalies": sum(1 for item in clusters if item["is_anomaly"])}


@router.get("/analytics/shadow-tickets")
async def get_shadow_tickets(
    user: Annotated[User, Depends(require_roles("tenant_admin", "executive", "qa_reviewer"))],
    session: Annotated[AsyncSession, Depends(get_session)],
    tenant_id: str | None = None,
):
    scoped_tenant = assert_tenant(user, tenant_id)
    clusters = await detect_clusters(session, scoped_tenant)
    shadows = shadow_tickets_from_clusters(clusters)
    return {"shadow_tickets": shadows, "total": len(shadows)}


@router.get("/analytics/trends")
async def get_trends(
    user: Annotated[User, Depends(require_roles("tenant_admin", "executive", "qa_reviewer", "support_agent"))],
    session: Annotated[AsyncSession, Depends(get_session)],
    tenant_id: str | None = None,
):
    scoped_tenant = assert_tenant(user, tenant_id)
    since = datetime.now(timezone.utc) - timedelta(hours=24)
    tickets = (
        await session.scalars(
            select(Ticket)
            .where(Ticket.tenant_id == scoped_tenant, Ticket.received_at >= since)
            .order_by(Ticket.received_at.asc())
        )
    ).all()
    buckets: dict[str, dict] = defaultdict(
        lambda: {
            "x_volume": 0,
            "reddit_volume": 0,
            "gmail_volume": 0,
            "total": 0,
            "critical_count": 0,
            "scores": [],
        }
    )
    for ticket in tickets:
        hour_dt = ticket.received_at.replace(minute=0, second=0, microsecond=0)
        hour = hour_dt.isoformat()
        key = f"{ticket.channel}_volume"
        if key in buckets[hour]:
            buckets[hour][key] += 1
        buckets[hour]["total"] += 1
        buckets[hour]["critical_count"] += 1 if ticket.severity == "critical" else 0
        buckets[hour]["scores"].append(ticket.sentiment_score)

    series = []
    for i in range(24):
        hour_dt = (since + timedelta(hours=i + 1)).replace(minute=0, second=0, microsecond=0)
        key = hour_dt.isoformat()
        bucket = buckets[key]
        scores = bucket.pop("scores")
        series.append(
            {
                "timestamp": key,
                "hour": hour_dt.strftime("%H:%M"),
                **bucket,
                "avg_sentiment": round(sum(scores) / len(scores), 3) if scores else 0,
            }
        )
    return {"timeseries": series}

