"""AURA-CX FastAPI application."""

from __future__ import annotations

from contextlib import asynccontextmanager
from datetime import datetime, timezone

from fastapi import FastAPI, HTTPException, WebSocket, WebSocketDisconnect
from fastapi.middleware.cors import CORSMiddleware
from sqlalchemy import select

from config import settings
from database import SessionLocal, init_db
from middleware.rate_limiter import RateLimiterMiddleware
from middleware.security_headers import SecurityHeadersMiddleware
from models import Ticket, User
from routers import ai as ai_router
from routers import (
    analytics, auth, compliance, ingestion, integrations, knowledge,
    profiles, resolution, settings as settings_router, social_monitor,
    subscriptions, team, tenants, tickets, voice,
)
from security import decode_token
from services.realtime import manager, ticket_to_dict


@asynccontextmanager
async def lifespan(_: FastAPI):
    import logging
    logger = logging.getLogger("aura_cx.startup")
    try:
        await init_db()
        logger.info("✅ Database initialized successfully.")
    except Exception as exc:  # noqa: BLE001
        logger.warning(
            "⚠️  Database connection failed at startup (%s: %s). "
            "The API will start but DB-dependent endpoints will return errors. "
            "Set DATABASE_URL to a reachable PostgreSQL instance.",
            type(exc).__name__,
            exc,
        )
    yield


app = FastAPI(
    title="AURA-CX API",
    description="Autonomous Universal Resolution and Analytics for Customer Experience",
    version=settings.API_VERSION,
    lifespan=lifespan,
)

app.add_middleware(
    CORSMiddleware,
    allow_origins=[
        "http://localhost:3000",
        "http://127.0.0.1:3000",
        settings.FRONTEND_URL,
    ],
    allow_credentials=True,
    allow_methods=["GET", "POST", "PUT", "DELETE", "PATCH", "OPTIONS"],
    allow_headers=["Authorization", "Content-Type", "X-AURA-WEBHOOK-SECRET"],
)

# ── Security middleware (order matters: first added = outermost) ──────────────
app.add_middleware(SecurityHeadersMiddleware)
app.add_middleware(RateLimiterMiddleware)

app.include_router(auth.router, prefix="/api/v1", tags=["Auth"])
app.include_router(tenants.router, prefix="/api/v1", tags=["Tenants"])
app.include_router(integrations.router, prefix="/api/v1", tags=["Integrations"])
app.include_router(ingestion.router, prefix="/api/v1", tags=["Ingestion"])
app.include_router(tickets.router, prefix="/api/v1", tags=["Tickets"])
app.include_router(profiles.router, prefix="/api/v1", tags=["Profiles"])
app.include_router(analytics.router, prefix="/api/v1", tags=["Analytics"])
app.include_router(subscriptions.router, prefix="/api/v1", tags=["Subscriptions"])
app.include_router(ai_router.router, prefix="/api/v1", tags=["AI"])
app.include_router(team.router, prefix="/api/v1", tags=["Team"])
app.include_router(knowledge.router, prefix="/api/v1", tags=["Knowledge"])
app.include_router(settings_router.router, prefix="/api/v1", tags=["Settings"])
app.include_router(voice.router, prefix="/api/v1", tags=["Voice"])
app.include_router(compliance.router, prefix="/api/v1", tags=["Compliance"])
app.include_router(social_monitor.router, prefix="/api/v1", tags=["Social Monitor"])
app.include_router(resolution.router, prefix="/api/v1", tags=["Resolution"])


@app.get("/health")
async def health_check():
    return {
        "status": "operational",
        "service": "AURA-CX",
        "version": settings.API_VERSION,
        "timestamp": datetime.now(timezone.utc).isoformat(),
        "use_mock_data": settings.USE_MOCK_DATA,
        "pipeline_stages": {
            "scrubbing_gateway": "active",
            "live_ingestion": "active",
            "identity_resolution": "active" if settings.GEMINI_API_KEY else "needs_configuration",
            "hybrid_rag": "active" if settings.GEMINI_API_KEY else "needs_configuration",
            "hitl_gateway": "active",
            "routing_handoff": "active",
            "shadow_ticket_clustering": "active",
            "rlhf_feedback": "active",
            "sla_engine": "active",
            "voice_agent": "active" if settings.TWILIO_ACCOUNT_SID else "needs_configuration",
            "kb_management": "active",
            "compliance_audit": "active",
            "campaign_engine": "active",
            "multilingual": "active",
            "social_monitor": "active" if settings.X_BEARER_TOKEN or settings.IMAP_HOST else "needs_configuration",
        },
        "providers": {
            "gemini": bool(settings.GEMINI_API_KEY),
            "vector_provider": settings.VECTOR_PROVIDER,
            "pinecone": bool(settings.PINECONE_API_KEY and settings.PINECONE_HOST),
            "stripe": bool(settings.STRIPE_SECRET_KEY),
            "redis": bool(settings.REDIS_URL),
            "twilio": bool(settings.TWILIO_ACCOUNT_SID),
            "encryption": bool(settings.ENCRYPTION_KEY or settings.SECRET_KEY),
            "x_api": bool(settings.X_BEARER_TOKEN),
            "threads": bool(settings.THREADS_ACCESS_TOKEN),
            "email_monitor": bool(settings.IMAP_HOST and settings.IMAP_USER),
        },
    }


@app.websocket("/ws/live-feed")
async def websocket_endpoint(websocket: WebSocket):
    token = websocket.query_params.get("token")
    if not token:
        await websocket.close(code=4401)
        return
    try:
        payload = decode_token(token)
    except HTTPException:
        await websocket.close(code=4401)
        return

    tenant_id = payload.get("tenant")
    user_email = payload.get("sub")
    if not tenant_id or not user_email:
        await websocket.close(code=4401)
        return

    async with SessionLocal() as session:
        user = await session.scalar(select(User).where(User.email == user_email, User.active.is_(True)))
        if user is None or user.tenant_id != tenant_id:
            await websocket.close(code=4401)
            return

        await manager.connect(tenant_id, websocket)
        snapshot = (
            await session.scalars(
                select(Ticket)
                .where(Ticket.tenant_id == tenant_id)
                .order_by(Ticket.received_at.desc())
                .limit(100)
            )
        ).all()
        await websocket.send_json({"type": "ticket_batch", "tickets": [ticket_to_dict(ticket) for ticket in snapshot]})
        try:
            while True:
                data = await websocket.receive_text()
                if data == "ping":
                    await websocket.send_json({"type": "pong"})
        except WebSocketDisconnect:
            manager.disconnect(tenant_id, websocket)

