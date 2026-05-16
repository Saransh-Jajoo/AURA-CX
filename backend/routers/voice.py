"""AI Voice Agent endpoints for call recording and transcript management.

Provides call ingestion, transcript retrieval, and voice-to-ticket conversion.
Integrates with the AI service for transcript summarization and sentiment analysis.
"""

from __future__ import annotations

from datetime import datetime, timezone
from typing import Annotated

from fastapi import APIRouter, Depends, HTTPException, Query
from pydantic import BaseModel, Field
from sqlalchemy import func, select
from sqlalchemy.ext.asyncio import AsyncSession

from database import get_session
from models import AuditEvent, CallRecording, Ticket, User
from security import assert_tenant, require_roles
from services.sla_engine import assign_sla

router = APIRouter()


class CallIngestRequest(BaseModel):
    caller_number: str = Field(max_length=32)
    call_sid: str | None = None
    direction: str = Field(default="inbound")
    transcript: list[dict] = Field(default_factory=list)  # [{timestamp, speaker, text}]
    ai_summary: str | None = None
    duration_seconds: int = 0
    detected_language: str = "en"


class CallCompleteRequest(BaseModel):
    call_id: str
    duration_seconds: int
    transcript: list[dict] = Field(default_factory=list)
    ai_summary: str | None = None
    sentiment_score: float = 0.0
    complaint_registered: bool = False
    resolution_attempted: bool = False


def _call_summary(call: CallRecording) -> dict:
    return {
        "id": call.id,
        "caller_number": call.caller_number,
        "call_sid": call.call_sid,
        "duration_seconds": call.duration_seconds,
        "status": call.status,
        "direction": call.direction,
        "detected_language": call.detected_language,
        "sentiment_score": call.sentiment_score,
        "complaint_registered": call.complaint_registered,
        "resolution_attempted": call.resolution_attempted,
        "ticket_id": call.ticket_id,
        "profile_id": call.profile_id,
        "ai_summary": call.ai_summary,
        "transcript_length": len(call.transcript),
        "started_at": call.started_at.isoformat(),
        "ended_at": call.ended_at.isoformat() if call.ended_at else None,
    }


@router.get("/voice/calls")
async def list_calls(
    user: Annotated[User, Depends(require_roles("tenant_admin", "qa_reviewer", "support_agent"))],
    session: Annotated[AsyncSession, Depends(get_session)],
    tenant_id: str | None = None,
    status: str | None = None,
    limit: int = Query(default=50, le=200),
):
    """List all call recordings for the tenant."""
    scoped_tenant = assert_tenant(user, tenant_id)
    query = select(CallRecording).where(CallRecording.tenant_id == scoped_tenant)
    if status:
        query = query.where(CallRecording.status == status)
    query = query.order_by(CallRecording.started_at.desc()).limit(limit)
    calls = (await session.scalars(query)).all()

    total = await session.scalar(
        select(func.count(CallRecording.id)).where(CallRecording.tenant_id == scoped_tenant)
    )

    return {
        "calls": [_call_summary(c) for c in calls],
        "total": total or 0,
    }


@router.post("/voice/ingest")
async def ingest_call(
    body: CallIngestRequest,
    user: Annotated[User, Depends(require_roles("tenant_admin", "support_agent"))],
    session: Annotated[AsyncSession, Depends(get_session)],
):
    """Ingest a new call recording with transcript."""
    tenant_id = assert_tenant(user, None)

    call = CallRecording(
        tenant_id=tenant_id,
        caller_number=body.caller_number,
        call_sid=body.call_sid,
        direction=body.direction,
        transcript=body.transcript,
        ai_summary=body.ai_summary,
        duration_seconds=body.duration_seconds,
        detected_language=body.detected_language,
        status="completed" if body.duration_seconds > 0 else "active",
    )
    if body.duration_seconds > 0:
        call.ended_at = datetime.now(timezone.utc)

    session.add(call)

    # If call had complaint content, auto-create ticket
    ticket = None
    if body.transcript:
        full_transcript = " ".join(t.get("text", "") for t in body.transcript if t.get("speaker") == "customer")
        if full_transcript.strip():
            ticket = Ticket(
                tenant_id=tenant_id,
                channel="voice",
                customer_name=body.caller_number,
                customer_handle=body.caller_number,
                message=full_transcript[:5000],
                call_recording_id=call.id,
                detected_language=body.detected_language,
            )
            session.add(ticket)
            await session.flush()
            call.ticket_id = ticket.id
            call.complaint_registered = True
            await assign_sla(session, ticket)

    session.add(AuditEvent(
        tenant_id=tenant_id,
        user_id=user.id,
        action="voice.ingest",
        resource_type="call_recording",
        resource_id=call.id,
        details={"caller": body.caller_number, "duration": body.duration_seconds, "ticket_created": ticket is not None},
    ))

    await session.commit()
    await session.refresh(call)

    return {
        "status": "ingested",
        "call": _call_summary(call),
        "ticket_id": ticket.id if ticket else None,
    }


@router.get("/voice/calls/{call_id}")
async def get_call(
    call_id: str,
    user: Annotated[User, Depends(require_roles("tenant_admin", "qa_reviewer", "support_agent"))],
    session: Annotated[AsyncSession, Depends(get_session)],
):
    """Get full call recording details including transcript."""
    call = await session.get(CallRecording, call_id)
    if call is None:
        raise HTTPException(status_code=404, detail="Call not found")
    assert_tenant(user, call.tenant_id)

    result = _call_summary(call)
    result["transcript"] = call.transcript
    return result


@router.post("/voice/calls/{call_id}/complete")
async def complete_call(
    call_id: str,
    body: CallCompleteRequest,
    user: Annotated[User, Depends(require_roles("tenant_admin", "support_agent"))],
    session: Annotated[AsyncSession, Depends(get_session)],
):
    """Mark a call as completed and update transcript."""
    call = await session.get(CallRecording, call_id)
    if call is None:
        raise HTTPException(status_code=404, detail="Call not found")
    assert_tenant(user, call.tenant_id)

    call.status = "completed"
    call.duration_seconds = body.duration_seconds
    call.ended_at = datetime.now(timezone.utc)
    call.sentiment_score = body.sentiment_score
    call.complaint_registered = body.complaint_registered
    call.resolution_attempted = body.resolution_attempted
    if body.transcript:
        call.transcript = body.transcript
    if body.ai_summary:
        call.ai_summary = body.ai_summary

    await session.commit()
    return {"status": "completed", "call": _call_summary(call)}


@router.get("/voice/analytics")
async def get_voice_analytics(
    user: Annotated[User, Depends(require_roles("tenant_admin", "executive"))],
    session: Annotated[AsyncSession, Depends(get_session)],
    tenant_id: str | None = None,
):
    """Get voice channel analytics."""
    scoped_tenant = assert_tenant(user, tenant_id)

    total_calls = await session.scalar(
        select(func.count(CallRecording.id)).where(CallRecording.tenant_id == scoped_tenant)
    )
    avg_duration = await session.scalar(
        select(func.avg(CallRecording.duration_seconds)).where(
            CallRecording.tenant_id == scoped_tenant, CallRecording.status == "completed"
        )
    )
    avg_sentiment = await session.scalar(
        select(func.avg(CallRecording.sentiment_score)).where(
            CallRecording.tenant_id == scoped_tenant, CallRecording.status == "completed"
        )
    )
    complaints_registered = await session.scalar(
        select(func.count(CallRecording.id)).where(
            CallRecording.tenant_id == scoped_tenant, CallRecording.complaint_registered.is_(True)
        )
    )

    return {
        "total_calls": total_calls or 0,
        "avg_duration_seconds": round(avg_duration or 0, 1),
        "avg_sentiment": round(avg_sentiment or 0, 2),
        "complaints_registered": complaints_registered or 0,
        "complaint_rate": round((complaints_registered or 0) / max(total_calls or 1, 1) * 100, 1),
    }
