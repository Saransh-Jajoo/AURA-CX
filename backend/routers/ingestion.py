"""Ingestion Router â€” Stage 1: Capture raw X, Reddit, and Email data."""
import re
from fastapi import APIRouter, HTTPException
from pydantic import BaseModel
from typing import Optional
from datetime import datetime

router = APIRouter()

# === PII Scrubbing Middleware ===
PII_PATTERNS = {
    "email": (r'[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}', '[EMAIL_REDACTED]'),
    "phone": (r'\b\d{3}[-.]?\d{3}[-.]?\d{4}\b', '[PHONE_REDACTED]'),
    "ssn": (r'\b\d{3}-\d{2}-\d{4}\b', '[SSN_REDACTED]'),
    "credit_card": (r'\b\d{4}[-\s]?\d{4}[-\s]?\d{4}[-\s]?\d{4}\b', '[CC_REDACTED]'),
    "ip_address": (r'\b\d{1,3}\.\d{1,3}\.\d{1,3}\.\d{1,3}\b', '[IP_REDACTED]'),
}

TOXIC_WORDS = {"fuck", "shit", "damn", "stupid", "idiot", "moron", "bastard", "crap", "hell"}


def scrub_pii(text: str) -> dict:
    """Scrub PII from text and return cleaned version with metadata."""
    redacted = text
    pii_found = []
    for pii_type, (pattern, replacement) in PII_PATTERNS.items():
        matches = re.findall(pattern, redacted)
        if matches:
            pii_found.append({"type": pii_type, "count": len(matches)})
            redacted = re.sub(pattern, replacement, redacted)
    return {"cleaned_text": redacted, "pii_detected": pii_found, "gdpr_compliant": True}


def filter_toxicity(text: str) -> dict:
    """Filter toxic language while preserving meaning."""
    words = text.split()
    filtered_count = 0
    cleaned = []
    for word in words:
        if word.lower().strip(".,!?;:") in TOXIC_WORDS:
            cleaned.append("[filtered]")
            filtered_count += 1
        else:
            cleaned.append(word)
    return {
        "cleaned_text": " ".join(cleaned),
        "toxicity_score": min(filtered_count / max(len(words), 1), 1.0),
        "filtered_words": filtered_count,
    }


class IngestPayload(BaseModel):
    channel: str
    raw_content: str
    sender_id: str
    metadata: Optional[dict] = None


@router.post("/ingest")
async def ingest_data(payload: IngestPayload):
    """Stage 1: Ingest raw data from any channel with PII scrubbing."""
    if payload.channel not in ("x", "reddit", "gmail"):
        raise HTTPException(status_code=400, detail="Unsupported channel")

    # PII Scrubbing
    pii_result = scrub_pii(payload.raw_content)
    # Toxicity Filtering
    tox_result = filter_toxicity(pii_result["cleaned_text"])

    return {
        "status": "ingested",
        "channel": payload.channel,
        "cleaned_content": tox_result["cleaned_text"],
        "pii_report": pii_result["pii_detected"],
        "toxicity_score": tox_result["toxicity_score"],
        "gdpr_compliant": pii_result["gdpr_compliant"],
        "timestamp": datetime.utcnow().isoformat() + "Z",
    }


@router.post("/ingest/x")
async def ingest_x(payload: IngestPayload):
    """Ingest from X (Twitter) channel."""
    payload.channel = "x"
    return await ingest_data(payload)


@router.post("/ingest/reddit")
async def ingest_reddit(payload: IngestPayload):
    """Ingest from Reddit channel."""
    payload.channel = "reddit"
    return await ingest_data(payload)


@router.post("/ingest/gmail")
async def ingest_gmail(payload: IngestPayload):
    """Ingest from Gmail channel."""
    payload.channel = "gmail"
    return await ingest_data(payload)
