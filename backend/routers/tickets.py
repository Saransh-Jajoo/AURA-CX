"""Tickets Router â€” Ticket CRUD & AI processing endpoints."""
from fastapi import APIRouter
from services.mock_data import generate_ticket_batch, generate_kpi_metrics, generate_hitl_queue

router = APIRouter()


@router.get("/tickets")
async def get_tickets():
    """Get all tickets with AI-generated tags."""
    return {
        "tickets": generate_ticket_batch(25),
        "total": 25,
    }


@router.get("/tickets/kpi")
async def get_kpi_metrics():
    """Get real-time KPI metrics for the dashboard."""
    return generate_kpi_metrics()


@router.get("/tickets/hitl")
async def get_hitl_queue():
    """Get HITL verification queue for agent review."""
    return {"queue": generate_hitl_queue(), "total": 12}


@router.post("/tickets/{ticket_id}/approve")
async def approve_ticket(ticket_id: str):
    """Approve an AI-drafted response (HITL Gateway)."""
    return {
        "ticket_id": ticket_id,
        "status": "approved",
        "action": "dispatched",
        "rlhf_signal": "positive",
        "message": "Response approved and dispatched. RLHF signal recorded.",
    }


@router.post("/tickets/{ticket_id}/edit")
async def edit_ticket(ticket_id: str):
    """Record agent edit and feed to RLHF pipeline."""
    return {
        "ticket_id": ticket_id,
        "status": "edited",
        "action": "dispatched_with_edits",
        "rlhf_signal": "corrective",
        "message": "Edited response dispatched. Agent corrections fed to RLHF loop.",
    }


@router.post("/tickets/{ticket_id}/escalate")
async def escalate_ticket(ticket_id: str):
    """Escalate ticket for senior manual review."""
    return {
        "ticket_id": ticket_id,
        "status": "escalated",
        "action": "routed_to_senior",
        "message": "Ticket escalated to Senior Review queue.",
    }
