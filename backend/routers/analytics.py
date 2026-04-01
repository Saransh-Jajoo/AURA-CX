"""Analytics Router — Trend Analysis, Clusters, Shadow Tickets."""
from fastapi import APIRouter
from services.mock_data import (
    generate_cluster_data,
    generate_shadow_tickets,
    generate_trend_timeseries,
)

router = APIRouter()


@router.get("/analytics/clusters")
async def get_clusters():
    """Get HDBSCAN cluster data for trend visualization."""
    clusters = generate_cluster_data()
    return {
        "clusters": clusters,
        "total": len(clusters),
        "anomalies": len([c for c in clusters if c["is_anomaly"]]),
    }


@router.get("/analytics/shadow-tickets")
async def get_shadow_tickets():
    """Get proactive shadow tickets from anomaly detection."""
    shadows = generate_shadow_tickets()
    return {"shadow_tickets": shadows, "total": len(shadows)}


@router.get("/analytics/trends")
async def get_trends():
    """Get time-series trend data for complaint volume and sentiment."""
    return {"timeseries": generate_trend_timeseries()}
