"""AI draft generation, RAG knowledge upload, and RLHF endpoints."""

from __future__ import annotations

from typing import Annotated

from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel, Field, field_validator
from sqlalchemy.ext.asyncio import AsyncSession

from database import get_session
from models import KnowledgeDocument, RLHFSignal, User
from security import assert_tenant, require_roles
from services.ai_service import AIConfigurationError, embed_text, generate_draft, record_rlhf_signal
from services.vector_store import upsert_vector

router = APIRouter()

ALLOWED_CHANNELS = {"x", "reddit", "gmail", "whatsapp"}


class DraftRequest(BaseModel):
    channel: str
    customer_name: str = Field(max_length=255)
    message: str = Field(min_length=1, max_length=20000)
    product: str = Field(max_length=255)
    tenant_id: str | None = None

    @field_validator("channel")
    @classmethod
    def validate_channel(cls, value: str) -> str:
        value = value.lower().strip()
        if value not in ALLOWED_CHANNELS:
            raise ValueError("unsupported channel")
        return value


class RLHFRequest(BaseModel):
    ticket_id: str
    signal_type: str
    original_draft: str
    edited_draft: str | None = None
    tenant_id: str | None = None

    @field_validator("signal_type")
    @classmethod
    def validate_signal_type(cls, value: str) -> str:
        if value not in {"positive", "corrective", "escalated"}:
            raise ValueError("signal_type must be positive, corrective, or escalated")
        return value


class KnowledgeDocumentIn(BaseModel):
    title: str = Field(min_length=1, max_length=512)
    body: str = Field(min_length=1)
    source_uri: str | None = Field(default=None, max_length=1024)
    metadata: dict = Field(default_factory=dict)
    tenant_id: str | None = None


@router.post("/ai/draft")
async def create_ai_draft(
    req: DraftRequest,
    user: Annotated[User, Depends(require_roles("tenant_admin", "support_agent", "qa_reviewer"))],
):
    tenant_id = assert_tenant(user, req.tenant_id)
    try:
        return await generate_draft(
            tenant_id=tenant_id,
            ticket={
                "channel": req.channel,
                "customer_name": req.customer_name,
                "message": req.message,
                "product": req.product,
            },
        )
    except AIConfigurationError as exc:
        raise HTTPException(status_code=503, detail=str(exc)) from exc


@router.post("/ai/rlhf")
async def submit_rlhf_signal(
    req: RLHFRequest,
    user: Annotated[User, Depends(require_roles("tenant_admin", "qa_reviewer", "support_agent"))],
    session: Annotated[AsyncSession, Depends(get_session)],
):
    tenant_id = assert_tenant(user, req.tenant_id)
    session.add(
        RLHFSignal(
            tenant_id=tenant_id,
            ticket_id=req.ticket_id,
            user_id=user.id,
            signal_type=req.signal_type,
            original_draft=req.original_draft,
            edited_draft=req.edited_draft,
        )
    )
    await session.commit()
    return await record_rlhf_signal(
        tenant_id=tenant_id,
        ticket_id=req.ticket_id,
        signal_type=req.signal_type,
        original_draft=req.original_draft,
        edited_draft=req.edited_draft,
    )


@router.post("/ai/knowledge")
async def upsert_knowledge_document(
    body: KnowledgeDocumentIn,
    user: Annotated[User, Depends(require_roles("tenant_admin"))],
    session: Annotated[AsyncSession, Depends(get_session)],
):
    tenant_id = assert_tenant(user, body.tenant_id)
    try:
        embedding = await embed_text(f"{body.title}\n\n{body.body}")
    except AIConfigurationError as exc:
        raise HTTPException(status_code=503, detail=str(exc)) from exc

    doc = KnowledgeDocument(
        tenant_id=tenant_id,
        title=body.title,
        body=body.body,
        source_uri=body.source_uri,
        source_metadata=body.metadata,
        embedding=embedding,
    )
    session.add(doc)
    await session.commit()
    await session.refresh(doc)
    await upsert_vector(
        tenant_id=tenant_id,
        bucket="knowledge",
        vector_id=doc.id,
        vector=embedding,
        metadata={"title": doc.title, "source_uri": doc.source_uri or "", "body": doc.body[:4000]},
    )
    return {"document": {"id": doc.id, "title": doc.title, "source_uri": doc.source_uri}}

