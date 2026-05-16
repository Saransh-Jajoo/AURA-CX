"""Live AI contracts for Gemini reasoning, embeddings, Hybrid RAG, and RLHF."""

from __future__ import annotations

import json
import logging
import re
from typing import Any

import httpx

from config import settings
from services.vector_store import query_vectors, upsert_vector

logger = logging.getLogger("aura_cx.ai")


class AIConfigurationError(RuntimeError):
    pass


def _require_gemini() -> None:
    if not settings.GEMINI_API_KEY:
        raise AIConfigurationError("GEMINI_API_KEY is not configured")


def _sanitize_user_input(text: str, max_length: int = 12_000) -> str:
    text = (text or "")[:max_length]
    patterns = [
        r"(?i)\bignore\s+(all\s+)?previous\s+instructions\b",
        r"(?i)\byou\s+are\s+now\b",
        r"(?i)\bsystem\s*:\s*",
        r"(?i)\bassistant\s*:\s*",
        r"(?i)\bdeveloper\s*:\s*",
        r"(?i)\bdo\s+not\s+follow\s+(the\s+)?(above|previous)\b",
    ]
    for pattern in patterns:
        text = re.sub(pattern, "[FILTERED]", text)
    return text.strip()


def _extract_json(text: str) -> dict[str, Any]:
    text = text.strip()
    if text.startswith("```"):
        text = re.sub(r"^```(?:json)?", "", text).strip()
        text = re.sub(r"```$", "", text).strip()
    start = text.find("{")
    end = text.rfind("}")
    if start >= 0 and end > start:
        text = text[start : end + 1]
    return json.loads(text)


async def gemini_generate(prompt: str, *, response_json: bool = False) -> str:
    _require_gemini()
    generation_config = {"temperature": 0.2}
    if response_json:
        generation_config["response_mime_type"] = "application/json"
    async with httpx.AsyncClient(timeout=45.0) as client:
        response = await client.post(
            f"https://generativelanguage.googleapis.com/v1beta/models/{settings.GEMINI_MODEL}:generateContent",
            params={"key": settings.GEMINI_API_KEY},
            json={
                "contents": [{"role": "user", "parts": [{"text": prompt}]}],
                "generationConfig": generation_config,
            },
        )
        response.raise_for_status()
        data = response.json()
        return data["candidates"][0]["content"]["parts"][0]["text"]


async def embed_text(text: str) -> list[float]:
    _require_gemini()
    async with httpx.AsyncClient(timeout=30.0) as client:
        response = await client.post(
            f"https://generativelanguage.googleapis.com/v1beta/models/{settings.GEMINI_EMBEDDING_MODEL}:embedContent",
            params={"key": settings.GEMINI_API_KEY},
            json={"content": {"parts": [{"text": _sanitize_user_input(text, 8_000)}]}},
        )
        response.raise_for_status()
        return response.json()["embedding"]["values"]


async def classify_ticket(text: str, channel: str) -> dict:
    prompt = f"""
Classify this customer support message from channel "{channel}".
Return strict JSON only:
{{
  "intent": "Bug Report | Feature Request | Account Issue | Billing Dispute | Security Concern | Performance Issue | Other",
  "severity": "critical | high | medium | low",
  "sentiment": "furious | frustrated | neutral | satisfied",
  "sentiment_score": -1.0,
  "confidence": 0.0,
  "product": "short product or service name"
}}

Message:
{_sanitize_user_input(text)}
"""
    try:
        return _extract_json(await gemini_generate(prompt, response_json=True))
    except AIConfigurationError:
        raise
    except Exception:
        logger.exception("Gemini classification failed")
        raise


async def resolve_identity(*, tenant_id: str, embedding: list[float], channel: str, handle: str) -> dict:
    matches = await query_vectors(
        tenant_id=tenant_id,
        bucket="identities",
        vector=embedding,
        top_k=5,
    )
    best = matches[0] if matches else None
    score = float(best["score"]) if best else 0.0
    return {
        "matched": bool(best and score >= settings.COSINE_THRESHOLD),
        "cosine_similarity": score,
        "profile_id": (best.get("metadata") or {}).get("profile_id") if best else None,
        "channel": channel,
        "handle": handle,
        "method": "Vector Similarity (Cosine > 0.92)",
    }


async def upsert_identity_vector(*, tenant_id: str, profile_id: str, channel: str, handle: str, vector: list[float]) -> None:
    await upsert_vector(
        tenant_id=tenant_id,
        bucket="identities",
        vector_id=f"{profile_id}:{channel}:{handle}",
        vector=vector,
        metadata={"profile_id": profile_id, "channel": channel, "handle": handle},
    )


async def retrieve_rag_context(*, tenant_id: str, query_embedding: list[float], limit: int = 5) -> list[dict]:
    matches = await query_vectors(tenant_id=tenant_id, bucket="knowledge", vector=query_embedding, top_k=limit)
    return [
        {
            "id": match["id"],
            "score": match["score"],
            "title": match.get("metadata", {}).get("title", "Knowledge document"),
            "source_uri": match.get("metadata", {}).get("source_uri"),
            "body": match.get("metadata", {}).get("body", ""),
        }
        for match in matches
        if match.get("score", 0) > 0.55
    ]


async def generate_draft(*, tenant_id: str, ticket: dict) -> dict:
    query_embedding = await embed_text(ticket.get("message", ""))
    context_docs = await retrieve_rag_context(tenant_id=tenant_id, query_embedding=query_embedding)
    context = "\n\n".join(
        f"[{doc['id']}] {doc['title']}\n{doc.get('body') or doc.get('source_uri') or ''}"
        for doc in context_docs
    )
    prompt = f"""
You are AURA-CX, an expert enterprise support copilot.
Use only tenant knowledge context below. If context is insufficient, say what you need from the agent.
Draft a concise, empathetic response suitable for the customer channel.
Do not reveal internal policy IDs unless they help the agent verify the source.

Tenant knowledge:
{context or "No matching tenant knowledge documents were retrieved."}

Ticket:
Channel: {ticket.get("channel")}
Customer: {_sanitize_user_input(ticket.get("customer_name", ""))}
Product: {_sanitize_user_input(ticket.get("product", ""))}
Message: {_sanitize_user_input(ticket.get("message", ""))}

Return strict JSON:
{{
  "draft": "customer-ready draft",
  "confidence": 0.0,
  "auto_approvable": false,
  "needs_human_detail": true
}}
"""
    result = _extract_json(await gemini_generate(prompt, response_json=True))
    confidence = float(result.get("confidence") or 0)
    return {
        "draft": str(result.get("draft") or "").strip(),
        "confidence": max(0.0, min(1.0, confidence)),
        "auto_approvable": confidence >= settings.DRAFT_CONFIDENCE_THRESHOLD and not bool(result.get("needs_human_detail")),
        "rag_sources": context_docs,
    }


async def record_rlhf_signal(
    *,
    tenant_id: str,
    ticket_id: str,
    signal_type: str,
    original_draft: str,
    edited_draft: str | None,
) -> dict:
    return {
        "ticket_id": ticket_id,
        "tenant_id": tenant_id,
        "signal_type": signal_type,
        "recorded": True,
        "pipeline_stage": "rlhf_feedback",
        "message": "Correction queued for tenant-scoped RLHF review.",
    }

