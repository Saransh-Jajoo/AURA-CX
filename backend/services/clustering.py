"""HDBSCAN clustering over real ticket embeddings."""

from __future__ import annotations

from collections import Counter, defaultdict
from datetime import datetime, timedelta, timezone

import numpy as np
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from config import settings
from models import Ticket


async def detect_clusters(session: AsyncSession, tenant_id: str) -> list[dict]:
    since = datetime.now(timezone.utc) - timedelta(hours=72)
    rows = (
        await session.scalars(
            select(Ticket)
            .where(Ticket.tenant_id == tenant_id, Ticket.received_at >= since)
            .order_by(Ticket.received_at.desc())
            .limit(1000)
        )
    ).all()
    tickets = [ticket for ticket in rows if ticket.embedding]
    if len(tickets) < settings.HDBSCAN_MIN_CLUSTER_SIZE:
        return []

    try:
        import hdbscan

        vectors = np.array([ticket.embedding for ticket in tickets], dtype=np.float32)
        clusterer = hdbscan.HDBSCAN(
            min_cluster_size=settings.HDBSCAN_MIN_CLUSTER_SIZE,
            min_samples=settings.HDBSCAN_MIN_SAMPLES,
            metric="euclidean",
        )
        labels = clusterer.fit_predict(vectors)
    except Exception:
        return []

    grouped: dict[int, list[Ticket]] = defaultdict(list)
    for label, ticket in zip(labels, tickets):
        if int(label) >= 0:
            grouped[int(label)].append(ticket)

    clusters: list[dict] = []
    for label, members in grouped.items():
        if not members:
            continue
        severity_counts = Counter(ticket.severity for ticket in members)
        product_counts = Counter(ticket.product for ticket in members)
        channel_counts = Counter(ticket.channel for ticket in members)
        avg_sentiment = sum(ticket.sentiment_score for ticket in members) / len(members)
        newest = max(ticket.received_at for ticket in members)
        oldest = min(ticket.received_at for ticket in members)
        hours = max((newest - oldest).total_seconds() / 3600, 1)
        growth_rate = round(len(members) / hours, 2)
        centroid = np.array([ticket.embedding for ticket in members], dtype=np.float32).mean(axis=0)

        top_product = product_counts.most_common(1)[0][0] if product_counts else "unspecified"
        title = f"{top_product} {severity_counts.most_common(1)[0][0]} cluster"
        is_anomaly = severity_counts.get("critical", 0) > 0 or growth_rate >= 3 or avg_sentiment <= -0.45
        clusters.append(
            {
                "id": f"cluster_{label}",
                "label": title,
                "size": len(members),
                "ticket_count": len(members),
                "severity_distribution": dict(severity_counts),
                "avg_sentiment": round(avg_sentiment, 3),
                "growth_rate": growth_rate,
                "is_anomaly": is_anomaly,
                "first_seen": oldest.isoformat(),
                "channels": list(channel_counts.keys()),
                "affected_product": top_product,
                "x": float(centroid[0]) if len(centroid) > 0 else 0.0,
                "y": float(centroid[1]) if len(centroid) > 1 else 0.0,
                "z": float(centroid[2]) if len(centroid) > 2 else 0.0,
            }
        )
    return sorted(clusters, key=lambda item: (not item["is_anomaly"], -item["size"]))


def shadow_tickets_from_clusters(clusters: list[dict]) -> list[dict]:
    shadows = []
    for cluster in clusters:
        if not cluster.get("is_anomaly"):
            continue
        severity = "critical" if cluster.get("growth_rate", 0) >= 3 or cluster.get("severity_distribution", {}).get("critical") else "high"
        shadows.append(
            {
                "id": f"shadow_{cluster['id']}",
                "cluster_id": cluster["id"],
                "title": f"Anomaly detected: {cluster['label']}",
                "description": (
                    f"HDBSCAN grouped {cluster['size']} real tickets across "
                    f"{', '.join(cluster.get('channels', [])) or 'channels'} for {cluster['affected_product']}."
                ),
                "severity": severity,
                "affected_product": cluster["affected_product"],
                "ticket_count": cluster["size"],
                "growth_rate": cluster["growth_rate"],
                "created_at": datetime.now(timezone.utc).isoformat(),
                "status": "active",
            }
        )
    return shadows

