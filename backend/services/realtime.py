"""Tenant-scoped WebSocket fanout."""

from __future__ import annotations

from collections import defaultdict
from datetime import datetime, timezone

from fastapi import WebSocket


class ConnectionManager:
    def __init__(self) -> None:
        self._connections: dict[str, set[WebSocket]] = defaultdict(set)

    async def connect(self, tenant_id: str, websocket: WebSocket) -> None:
        await websocket.accept()
        self._connections[tenant_id].add(websocket)

    def disconnect(self, tenant_id: str, websocket: WebSocket) -> None:
        self._connections[tenant_id].discard(websocket)

    async def broadcast(self, tenant_id: str, event: dict) -> None:
        payload = {"tenant_id": tenant_id, "emitted_at": datetime.now(timezone.utc).isoformat(), **event}
        stale: list[WebSocket] = []
        for connection in list(self._connections.get(tenant_id, set())):
            try:
                await connection.send_json(payload)
            except Exception:
                stale.append(connection)
        for connection in stale:
            self.disconnect(tenant_id, connection)


manager = ConnectionManager()


def ticket_to_dict(ticket) -> dict:
    return {
        "id": ticket.id,
        "tenant_id": ticket.tenant_id,
        "profile_id": ticket.profile_id,
        "channel": ticket.channel,
        "customer_name": ticket.customer_name,
        "customer_handle": ticket.customer_handle,
        "message": ticket.message,
        "product": ticket.product,
        "intent": ticket.intent,
        "severity": ticket.severity,
        "sentiment": ticket.sentiment,
        "sentiment_score": ticket.sentiment_score,
        "confidence": ticket.confidence,
        "timestamp": ticket.received_at.isoformat(),
        "status": ticket.status,
        "pii_scrubbed": True,
        "toxicity_score": ticket.toxicity_score,
        "ai_draft": ticket.ai_draft,
        "rag_sources": ticket.rag_sources,
    }

