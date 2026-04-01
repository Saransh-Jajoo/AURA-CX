"""
AURA-CX Backend â€” FastAPI Application
Autonomous Universal Resolution & Analytics for Customer Experience
"""
import asyncio
import json
import random
import time
from datetime import datetime, timedelta
from contextlib import asynccontextmanager

from fastapi import FastAPI, WebSocket, WebSocketDisconnect
from fastapi.middleware.cors import CORSMiddleware

from config import settings
from routers import ingestion, tickets, profiles, analytics, auth, subscriptions, integrations
from services.mock_data import generate_live_ticket


class ConnectionManager:
    def __init__(self):
        self.active_connections: list[WebSocket] = []

    async def connect(self, websocket: WebSocket):
        await websocket.accept()
        self.active_connections.append(websocket)

    def disconnect(self, websocket: WebSocket):
        self.active_connections.remove(websocket)

    async def broadcast(self, data: dict):
        for connection in list(self.active_connections):
            try:
                await connection.send_json(data)
            except Exception:
                self.active_connections.remove(connection)


manager = ConnectionManager()
feed_task = None


async def live_feed_generator():
    """Simulates incoming tickets from X, Reddit, Gmail every 3-8 seconds."""
    while True:
        await asyncio.sleep(random.uniform(3, 8))
        ticket = generate_live_ticket()
        await manager.broadcast({"type": "new_ticket", "ticket": ticket})


@asynccontextmanager
async def lifespan(app: FastAPI):
    global feed_task
    feed_task = asyncio.create_task(live_feed_generator())
    yield
    feed_task.cancel()


app = FastAPI(
    title="AURA-CX API",
    description="Intelligent Omnichannel Customer Experience Orchestrator",
    version="1.0.0",
    lifespan=lifespan,
)

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

app.include_router(auth.router, prefix="/api/v1", tags=["Auth"])
app.include_router(ingestion.router, prefix="/api/v1", tags=["Ingestion"])
app.include_router(tickets.router, prefix="/api/v1", tags=["Tickets"])
app.include_router(profiles.router, prefix="/api/v1", tags=["Profiles"])
app.include_router(analytics.router, prefix="/api/v1", tags=["Analytics"])
app.include_router(subscriptions.router, prefix="/api/v1", tags=["Subscriptions"])
app.include_router(integrations.router, prefix="/api/v1", tags=["Integrations"])


@app.get("/health")
async def health_check():
    return {
        "status": "operational",
        "service": "AURA-CX",
        "version": "1.0.0",
        "timestamp": datetime.utcnow().isoformat(),
        "use_mock_data": settings.USE_MOCK_DATA,
        "pipeline_stages": {
            "stage_1_ingestion": "active",
            "stage_2_ai_cognition": "active" if not settings.USE_MOCK_DATA else "mock",
            "stage_3_orchestration": "active" if not settings.USE_MOCK_DATA else "mock",
            "stage_4_rlhf": "active" if not settings.USE_MOCK_DATA else "mock",
        },
    }


@app.websocket("/ws/live-feed")
async def websocket_endpoint(websocket: WebSocket):
    from services.mock_data import generate_ticket_batch, generate_kpi_metrics
    await manager.connect(websocket)
    # Send initial snapshot so the client populates immediately
    initial_tickets = generate_ticket_batch(20)
    await websocket.send_json({"type": "ticket_batch", "tickets": initial_tickets})
    kpi_snapshot = generate_kpi_metrics()
    await websocket.send_json({"type": "kpi_update", "kpis": kpi_snapshot})
    try:
        while True:
            data = await websocket.receive_text()
            if data == "ping":
                await websocket.send_json({"type": "pong"})
    except WebSocketDisconnect:
        manager.disconnect(websocket)
