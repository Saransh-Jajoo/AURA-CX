"""Analytics, HDBSCAN clusters, shadow tickets, and intelligence endpoints."""

from __future__ import annotations

from collections import defaultdict
from datetime import datetime, timedelta, timezone
from typing import Annotated

from fastapi import APIRouter, Depends, Query
from sqlalchemy import func, select
from sqlalchemy.ext.asyncio import AsyncSession

from database import get_session
from models import Ticket, TicketMessage, User
from security import assert_tenant, require_roles
from services.clustering import detect_clusters, shadow_tickets_from_clusters

router = APIRouter()

_ALLOWED_ROLES = ("tenant_admin", "manager", "executive", "qa_reviewer", "support_agent", "read_only_analyst")
_ADMIN_ROLES = ("tenant_admin", "manager", "executive", "qa_reviewer", "read_only_analyst")


def _utcnow() -> datetime:
    return datetime.now(timezone.utc)


# ── Existing Endpoints (preserved + improved) ─────────────────

@router.get("/analytics/clusters")
async def get_clusters(
    user: Annotated[User, Depends(require_roles(*_ADMIN_ROLES))],
    session: Annotated[AsyncSession, Depends(get_session)],
    tenant_id: str | None = None,
):
    scoped_tenant = assert_tenant(user, tenant_id)
    clusters = await detect_clusters(session, scoped_tenant)
    return {"clusters": clusters, "total": len(clusters), "anomalies": sum(1 for item in clusters if item["is_anomaly"])}


@router.get("/analytics/shadow-tickets")
async def get_shadow_tickets(
    user: Annotated[User, Depends(require_roles(*_ADMIN_ROLES))],
    session: Annotated[AsyncSession, Depends(get_session)],
    tenant_id: str | None = None,
):
    scoped_tenant = assert_tenant(user, tenant_id)
    clusters = await detect_clusters(session, scoped_tenant)
    shadows = shadow_tickets_from_clusters(clusters)
    return {"shadow_tickets": shadows, "total": len(shadows)}


@router.get("/analytics/trends")
async def get_trends(
    user: Annotated[User, Depends(require_roles(*_ALLOWED_ROLES))],
    session: Annotated[AsyncSession, Depends(get_session)],
    tenant_id: str | None = None,
    period: str = Query(default="24h", pattern="^(24h|7d|30d)$"),
):
    """Volume trends by channel. Extended to include WhatsApp + Voice, with 7d/30d period support."""
    scoped_tenant = assert_tenant(user, tenant_id)
    hours = {"24h": 24, "7d": 168, "30d": 720}[period]
    since = _utcnow() - timedelta(hours=hours)

    tickets = (
        await session.scalars(
            select(Ticket)
            .where(Ticket.tenant_id == scoped_tenant, Ticket.received_at >= since)
            .order_by(Ticket.received_at.asc())
        )
    ).all()

    bucket_hours = 1 if period == "24h" else (6 if period == "7d" else 24)
    buckets: dict[str, dict] = defaultdict(
        lambda: {
            "x_volume": 0, "reddit_volume": 0, "gmail_volume": 0,
            "whatsapp_volume": 0, "voice_volume": 0,
            "total": 0, "critical_count": 0, "scores": [],
        }
    )

    for ticket in tickets:
        # Round to nearest bucket
        rounded = ticket.received_at.replace(minute=0, second=0, microsecond=0)
        if bucket_hours > 1:
            h = (rounded.hour // bucket_hours) * bucket_hours
            rounded = rounded.replace(hour=h)
        key = rounded.isoformat()
        channel_key = f"{ticket.channel}_volume"
        if channel_key in buckets[key]:
            buckets[key][channel_key] += 1
        buckets[key]["total"] += 1
        buckets[key]["critical_count"] += 1 if ticket.severity == "critical" else 0
        buckets[key]["scores"].append(ticket.sentiment_score)

    series = []
    for i in range(0, hours, bucket_hours):
        bucket_dt = (since + timedelta(hours=i + bucket_hours)).replace(minute=0, second=0, microsecond=0)
        if bucket_hours > 1:
            h = (bucket_dt.hour // bucket_hours) * bucket_hours
            bucket_dt = bucket_dt.replace(hour=h)
        key = bucket_dt.isoformat()
        bucket = dict(buckets[key])
        scores = bucket.pop("scores")
        label = bucket_dt.strftime("%H:%M") if period == "24h" else bucket_dt.strftime("%b %d")
        series.append({
            "timestamp": key,
            "hour": label,
            **bucket,
            "avg_sentiment": round(sum(scores) / len(scores), 3) if scores else 0,
        })

    return {"timeseries": series, "period": period}


# ── New Intelligence Endpoints ────────────────────────────────

@router.get("/analytics/categories")
async def get_complaint_categories(
    user: Annotated[User, Depends(require_roles(*_ALLOWED_ROLES))],
    session: Annotated[AsyncSession, Depends(get_session)],
    tenant_id: str | None = None,
    period: str = Query(default="7d", pattern="^(24h|7d|30d|90d)$"),
):
    """Complaint counts grouped by product/category with trend vs previous period."""
    scoped_tenant = assert_tenant(user, tenant_id)
    hours = {"24h": 24, "7d": 168, "30d": 720, "90d": 2160}[period]
    since = _utcnow() - timedelta(hours=hours)
    prev_since = since - timedelta(hours=hours)

    current = (
        await session.scalars(
            select(Ticket).where(Ticket.tenant_id == scoped_tenant, Ticket.received_at >= since)
        )
    ).all()
    previous = (
        await session.scalars(
            select(Ticket).where(
                Ticket.tenant_id == scoped_tenant,
                Ticket.received_at >= prev_since,
                Ticket.received_at < since,
            )
        )
    ).all()

    def _group(tickets: list[Ticket]) -> dict[str, dict]:
        cats: dict[str, dict] = defaultdict(lambda: {"count": 0, "sentiment_sum": 0.0})
        for t in tickets:
            cat = t.product or "unspecified"
            cats[cat]["count"] += 1
            cats[cat]["sentiment_sum"] += t.sentiment_score
        return cats

    cur = _group(current)
    prev = _group(previous)

    categories = []
    all_cats = set(cur.keys()) | set(prev.keys())
    for cat in sorted(all_cats, key=lambda c: cur.get(c, {}).get("count", 0), reverse=True):
        cur_count = cur.get(cat, {}).get("count", 0)
        prev_count = prev.get(cat, {}).get("count", 0)
        change_pct = round(((cur_count - prev_count) / max(prev_count, 1)) * 100, 1)
        avg_sentiment = round(cur.get(cat, {}).get("sentiment_sum", 0) / max(cur_count, 1), 3)
        categories.append({
            "name": cat,
            "count": cur_count,
            "prev_count": prev_count,
            "change_pct": change_pct,
            "avg_sentiment": avg_sentiment,
        })

    return {"categories": categories, "total": len(current), "period": period}


@router.get("/analytics/resolution-time")
async def get_resolution_time(
    user: Annotated[User, Depends(require_roles(*_ALLOWED_ROLES))],
    session: Annotated[AsyncSession, Depends(get_session)],
    tenant_id: str | None = None,
    period: str = Query(default="7d", pattern="^(7d|30d|90d)$"),
):
    """Avg resolution time in hours by category and channel."""
    scoped_tenant = assert_tenant(user, tenant_id)
    hours = {"7d": 168, "30d": 720, "90d": 2160}[period]
    since = _utcnow() - timedelta(hours=hours)

    resolved = (
        await session.scalars(
            select(Ticket).where(
                Ticket.tenant_id == scoped_tenant,
                Ticket.status == "resolved",
                Ticket.resolved_at.is_not(None),
                Ticket.received_at >= since,
            )
        )
    ).all()

    def _avg_hours(tickets: list[Ticket]) -> float:
        if not tickets:
            return 0.0
        diffs = [
            (t.resolved_at - t.received_at).total_seconds() / 3600
            for t in tickets
            if t.resolved_at and t.received_at
        ]
        return round(sum(diffs) / len(diffs), 2) if diffs else 0.0

    by_category: dict[str, list] = defaultdict(list)
    by_channel: dict[str, list] = defaultdict(list)
    by_priority: dict[str, list] = defaultdict(list)

    for t in resolved:
        by_category[t.product or "unspecified"].append(t)
        by_channel[t.channel].append(t)
        by_priority[t.sla_priority].append(t)

    return {
        "overall_avg_hours": _avg_hours(resolved),
        "total_resolved": len(resolved),
        "by_category": [
            {"name": k, "avg_hours": _avg_hours(v), "count": len(v)}
            for k, v in sorted(by_category.items(), key=lambda x: _avg_hours(x[1]), reverse=True)
        ],
        "by_channel": [
            {"name": k, "avg_hours": _avg_hours(v), "count": len(v)}
            for k, v in sorted(by_channel.items(), key=lambda x: _avg_hours(x[1]))
        ],
        "by_priority": {k: _avg_hours(v) for k, v in by_priority.items()},
        "period": period,
    }


@router.get("/analytics/csat-trend")
async def get_csat_trend(
    user: Annotated[User, Depends(require_roles(*_ALLOWED_ROLES))],
    session: Annotated[AsyncSession, Depends(get_session)],
    tenant_id: str | None = None,
    period: str = Query(default="30d", pattern="^(7d|30d|90d)$"),
):
    """CSAT score trend over time."""
    scoped_tenant = assert_tenant(user, tenant_id)
    days = {"7d": 7, "30d": 30, "90d": 90}[period]
    since = _utcnow() - timedelta(days=days)

    tickets_with_csat = (
        await session.scalars(
            select(Ticket).where(
                Ticket.tenant_id == scoped_tenant,
                Ticket.csat_score.is_not(None),
                Ticket.csat_collected_at >= since,
            ).order_by(Ticket.csat_collected_at.asc())
        )
    ).all()

    all_resolved = await session.scalar(
        select(func.count(Ticket.id)).where(
            Ticket.tenant_id == scoped_tenant,
            Ticket.status == "resolved",
            Ticket.resolved_at >= since,
        )
    ) or 0

    # Daily buckets
    daily: dict[str, list[int]] = defaultdict(list)
    for t in tickets_with_csat:
        day_key = t.csat_collected_at.strftime("%Y-%m-%d")
        daily[day_key].append(t.csat_score)

    timeseries = []
    for i in range(days):
        day = (since + timedelta(days=i + 1)).strftime("%Y-%m-%d")
        scores = daily.get(day, [])
        timeseries.append({
            "date": day,
            "avg_score": round(sum(scores) / len(scores), 2) if scores else None,
            "count": len(scores),
        })

    all_scores = [t.csat_score for t in tickets_with_csat]
    return {
        "timeseries": timeseries,
        "overall_avg": round(sum(all_scores) / len(all_scores), 2) if all_scores else None,
        "total_responses": len(all_scores),
        "response_rate_pct": round((len(all_scores) / max(all_resolved, 1)) * 100, 1),
        "period": period,
    }


@router.get("/analytics/sla")
async def get_sla_compliance(
    user: Annotated[User, Depends(require_roles(*_ADMIN_ROLES))],
    session: Annotated[AsyncSession, Depends(get_session)],
    tenant_id: str | None = None,
    period: str = Query(default="7d", pattern="^(7d|30d|90d)$"),
):
    """SLA compliance rate per priority tier."""
    scoped_tenant = assert_tenant(user, tenant_id)
    hours = {"7d": 168, "30d": 720, "90d": 2160}[period]
    since = _utcnow() - timedelta(hours=hours)

    tickets = (
        await session.scalars(
            select(Ticket).where(Ticket.tenant_id == scoped_tenant, Ticket.received_at >= since)
        )
    ).all()

    by_priority: dict[str, dict] = {p: {"compliant": 0, "breached": 0, "open": 0} for p in ["p1", "p2", "p3", "p4"]}
    for t in tickets:
        p = t.sla_priority or "p3"
        if p not in by_priority:
            by_priority[p] = {"compliant": 0, "breached": 0, "open": 0}
        if t.status == "resolved":
            if t.sla_breached:
                by_priority[p]["breached"] += 1
            else:
                by_priority[p]["compliant"] += 1
        else:
            if t.sla_breached:
                by_priority[p]["breached"] += 1
            else:
                by_priority[p]["open"] += 1

    result = {}
    for p, counts in by_priority.items():
        total = counts["compliant"] + counts["breached"]
        result[p] = {
            **counts,
            "compliance_pct": round((counts["compliant"] / max(total, 1)) * 100, 1),
        }

    return {"by_priority": result, "period": period}


@router.get("/analytics/agents")
async def get_agent_performance(
    user: Annotated[User, Depends(require_roles(*_ADMIN_ROLES))],
    session: Annotated[AsyncSession, Depends(get_session)],
    tenant_id: str | None = None,
    period: str = Query(default="7d", pattern="^(7d|30d|90d)$"),
):
    """Per-agent performance: tickets handled, avg resolution time, CSAT, escalations."""
    scoped_tenant = assert_tenant(user, tenant_id)
    hours = {"7d": 168, "30d": 720, "90d": 2160}[period]
    since = _utcnow() - timedelta(hours=hours)

    resolved_tickets = (
        await session.scalars(
            select(Ticket).where(
                Ticket.tenant_id == scoped_tenant,
                Ticket.resolved_by.is_not(None),
                Ticket.resolved_at >= since,
            )
        )
    ).all()

    escalated_tickets = (
        await session.scalars(
            select(Ticket).where(
                Ticket.tenant_id == scoped_tenant,
                Ticket.status == "escalated",
                Ticket.received_at >= since,
                Ticket.assigned_to.is_not(None),
            )
        )
    ).all()

    agent_stats: dict[str, dict] = defaultdict(
        lambda: {"tickets": 0, "resolution_hours_sum": 0.0, "csat_scores": [], "escalations": 0, "name": ""}
    )

    for t in resolved_tickets:
        aid = t.resolved_by
        agent_stats[aid]["tickets"] += 1
        if t.resolved_at and t.received_at:
            agent_stats[aid]["resolution_hours_sum"] += (t.resolved_at - t.received_at).total_seconds() / 3600
        if t.csat_score:
            agent_stats[aid]["csat_scores"].append(t.csat_score)

    for t in escalated_tickets:
        agent_stats[t.assigned_to]["escalations"] += 1

    # Fetch agent names
    agent_ids = list(agent_stats.keys())
    if agent_ids:
        users = (await session.scalars(select(User).where(User.id.in_(agent_ids)))).all()
        for u in users:
            agent_stats[u.id]["name"] = u.name

    agents = []
    for aid, stats in agent_stats.items():
        tickets = stats["tickets"]
        csat_scores = stats["csat_scores"]
        agents.append({
            "agent_id": aid,
            "name": stats["name"] or aid,
            "tickets": tickets,
            "avg_resolution_hours": round(stats["resolution_hours_sum"] / max(tickets, 1), 2),
            "avg_csat": round(sum(csat_scores) / len(csat_scores), 2) if csat_scores else None,
            "escalations": stats["escalations"],
        })

    agents.sort(key=lambda a: a["tickets"], reverse=True)
    return {"agents": agents, "period": period}


@router.get("/analytics/recommendations")
async def get_ai_recommendations(
    user: Annotated[User, Depends(require_roles(*_ADMIN_ROLES))],
    session: Annotated[AsyncSession, Depends(get_session)],
    tenant_id: str | None = None,
):
    """AI-generated actionable improvement recommendations based on complaint patterns."""
    from config import settings as cfg

    scoped_tenant = assert_tenant(user, tenant_id)
    clusters = await detect_clusters(session, scoped_tenant)

    # Build context from real data
    since_7d = _utcnow() - timedelta(days=7)
    recent_tickets = (
        await session.scalars(
            select(Ticket).where(Ticket.tenant_id == scoped_tenant, Ticket.received_at >= since_7d)
        )
    ).all()

    cat_counts: dict[str, int] = defaultdict(int)
    channel_times: dict[str, list[float]] = defaultdict(list)
    for t in recent_tickets:
        cat_counts[t.product or "unspecified"] += 1
        if t.resolved_at:
            channel_times[t.channel].append((t.resolved_at - t.received_at).total_seconds() / 3600)

    top_cats = sorted(cat_counts.items(), key=lambda x: x[1], reverse=True)[:5]
    top_clusters = [c for c in clusters if not c.get("is_anomaly")][:5]
    total = len(recent_tickets)

    # Try Gemini — fall back to rule-based if no key
    if cfg.GEMINI_API_KEY:
        try:
            import google.generativeai as genai
            genai.configure(api_key=cfg.GEMINI_API_KEY)
            model = genai.GenerativeModel(cfg.GEMINI_MODEL)

            prompt = f"""You are a customer experience analyst. Based on this data from the last 7 days:

Total complaints: {total}
Top complaint categories: {[f"{k}: {v} ({round(v/max(total,1)*100)}%)" for k, v in top_cats]}
Complaint clusters: {[c.get("label", "") for c in top_clusters]}
Avg resolution time by channel (hours): {dict((k, round(sum(v)/len(v),1)) for k,v in channel_times.items() if v)}

Generate 4 specific, actionable improvement recommendations to reduce complaints.
Format as JSON array with fields: title (short), detail (1-2 sentences with specific numbers), impact (high/medium/low), category (billing/product/process/communication).
Return ONLY the JSON array, no markdown."""

            response = model.generate_content(prompt)
            import json
            recs = json.loads(response.text.strip())
            return {"recommendations": recs, "source": "ai", "data_points": total}
        except Exception:  # noqa: BLE001
            pass

    # Rule-based fallback
    recommendations = []
    for cat, count in top_cats[:3]:
        pct = round(count / max(total, 1) * 100)
        recommendations.append({
            "title": f"Reduce {cat} complaints ({pct}% of total)",
            "detail": f"{count} complaints about {cat} in the last 7 days. Review your {cat} process and add proactive communications.",
            "impact": "high" if pct > 25 else "medium",
            "category": "process",
        })

    slow_channels = sorted(channel_times.items(), key=lambda x: sum(x[1]) / len(x[1]) if x[1] else 0, reverse=True)
    if slow_channels:
        ch, times = slow_channels[0]
        avg = round(sum(times) / len(times), 1)
        recommendations.append({
            "title": f"Speed up {ch} response time",
            "detail": f"{ch} tickets take an average of {avg}h to resolve. Consider dedicated queue or auto-drafts.",
            "impact": "medium",
            "category": "process",
        })

    return {"recommendations": recommendations, "source": "rule_based", "data_points": total}
