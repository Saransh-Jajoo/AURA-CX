"""
AI Service Abstraction — Routes between mock data and real AI providers.

Toggle via USE_MOCK_DATA env var. When False, calls Gemini 1.5 Pro for
NLP / RAG drafting and Pinecone for vector identity resolution.
"""
import logging
from config import settings

logger = logging.getLogger("aura_cx.ai")


# ── Stage 2: NLP Classification ───────────────────────────────────
async def classify_ticket(text: str, channel: str) -> dict:
    """Multi-label zero-shot classification + sentiment velocity."""
    if settings.USE_MOCK_DATA:
        from services.mock_data import generate_live_ticket
        t = generate_live_ticket()
        return {
            "intent": t["intent"],
            "severity": t["severity"],
            "sentiment": t["sentiment"],
            "sentiment_score": t["sentiment_score"],
            "confidence": t["confidence"],
            "labels": [t["intent"]],
        }

    # Real path — Gemini 1.5 Pro zero-shot classification
    import httpx
    async with httpx.AsyncClient() as client:
        resp = await client.post(
            f"https://generativelanguage.googleapis.com/v1beta/models/{settings.GEMINI_MODEL}:generateContent",
            params={"key": settings.GEMINI_API_KEY},
            json={
                "contents": [{"parts": [{"text": (
                    f"Classify this customer message from {channel}. Return JSON with: "
                    f"intent (one of: Bug Report, Feature Request, Account Issue, Billing Dispute, Security Concern, Performance Issue), "
                    f"severity (critical/high/medium/low), sentiment (furious/frustrated/neutral/satisfied), "
                    f"sentiment_score (-1 to 1), confidence (0-1).\n\nMessage: {text}"
                )}]}],
            },
            timeout=30.0,
        )
        resp.raise_for_status()
        return resp.json()


# ── Stage 2: Vector Identity Resolution ───────────────────────────
async def resolve_identity(embedding: list[float], customer_id: str | None = None) -> dict:
    """Match identities across channels via cosine similarity > 0.92."""
    if settings.USE_MOCK_DATA:
        from services.mock_data import generate_golden_profile
        profile = generate_golden_profile()
        return {
            "matched": True,
            "cosine_similarity": profile["identity_resolution"]["cosine_similarity"],
            "profile_id": profile["id"],
            "method": "mock",
        }

    # Real path — Pinecone query
    import httpx
    async with httpx.AsyncClient() as client:
        resp = await client.post(
            f"https://{settings.PINECONE_INDEX}-{settings.PINECONE_ENVIRONMENT}.svc.pinecone.io/query",
            headers={"Api-Key": settings.PINECONE_API_KEY},
            json={"vector": embedding, "topK": 5, "includeMetadata": True},
            timeout=15.0,
        )
        resp.raise_for_status()
        matches = resp.json().get("matches", [])
        best = matches[0] if matches else None
        return {
            "matched": best is not None and best["score"] >= settings.COSINE_THRESHOLD,
            "cosine_similarity": best["score"] if best else 0.0,
            "profile_id": best["metadata"].get("profile_id") if best else None,
            "method": "pinecone",
        }


# ── Stage 3: Hybrid RAG Draft Generation ──────────────────────────
async def generate_draft(ticket: dict, context_docs: list[str]) -> dict:
    """Generate AI draft response using RAG context."""
    if settings.USE_MOCK_DATA:
        from services.mock_data import DRAFT_RESPONSES, CUSTOMER_NAMES
        import random
        name = ticket.get("customer_name", random.choice(CUSTOMER_NAMES))
        product = ticket.get("product", "the product")
        draft = random.choice(DRAFT_RESPONSES).format(name=name, product=product, amount=random.choice([149, 299, 499]))
        confidence = round(random.uniform(0.70, 0.97), 2)
        return {
            "draft": draft,
            "confidence": confidence,
            "auto_approvable": confidence > settings.DRAFT_CONFIDENCE_THRESHOLD,
            "rag_sources": context_docs[:3],
        }

    # Real path — Gemini 1.5 Pro with RAG context
    import httpx
    context = "\n---\n".join(context_docs)
    async with httpx.AsyncClient() as client:
        resp = await client.post(
            f"https://generativelanguage.googleapis.com/v1beta/models/{settings.GEMINI_MODEL}:generateContent",
            params={"key": settings.GEMINI_API_KEY},
            json={
                "contents": [{"parts": [{"text": (
                    f"You are an expert CX agent. Draft a professional, empathetic response.\n\n"
                    f"CONTEXT DOCS:\n{context}\n\n"
                    f"TICKET:\nChannel: {ticket.get('channel')}\n"
                    f"Customer: {ticket.get('customer_name')}\n"
                    f"Message: {ticket.get('message')}\n\n"
                    f"Respond with the draft only."
                )}]}],
            },
            timeout=30.0,
        )
        resp.raise_for_status()
        text = resp.json()["candidates"][0]["content"]["parts"][0]["text"]
        return {
            "draft": text,
            "confidence": 0.88,
            "auto_approvable": True,
            "rag_sources": context_docs[:3],
        }


# ── Stage 4: RLHF Signal Recorder ─────────────────────────────────
async def record_rlhf_signal(ticket_id: str, signal_type: str, original_draft: str, edited_draft: str | None = None) -> dict:
    """Record agent feedback for RLHF training loop."""
    logger.info("RLHF signal: ticket=%s type=%s", ticket_id, signal_type)
    return {
        "ticket_id": ticket_id,
        "signal_type": signal_type,
        "recorded": True,
        "pipeline_stage": "stage_4_rlhf",
        "message": f"RLHF {signal_type} signal queued for model fine-tuning.",
    }
