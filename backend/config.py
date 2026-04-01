"""
AURA-CX Configuration — Environment-driven toggles for mock vs real AI backend.
"""
import os
from pydantic_settings import BaseSettings


class Settings(BaseSettings):
    # ── AI Backend Toggle ──────────────────────────────────────────
    USE_MOCK_DATA: bool = True  # Set False + provide keys to activate real AI

    # ── Gemini 1.5 Pro  ───────────────────────────────────────────
    GEMINI_API_KEY: str = ""
    GEMINI_MODEL: str = "gemini-1.5-pro-latest"

    # ── Pinecone Vector DB ─────────────────────────────────────────
    PINECONE_API_KEY: str = ""
    PINECONE_ENVIRONMENT: str = "us-east-1"
    PINECONE_INDEX: str = "aura-cx-identities"

    # ── Identity Resolution ────────────────────────────────────────
    COSINE_THRESHOLD: float = 0.92

    # ── Auto-Approve Confidence Gate ───────────────────────────────
    DRAFT_CONFIDENCE_THRESHOLD: float = 0.85

    # ── Auth / JWT ─────────────────────────────────────────────────
    SECRET_KEY: str = "aura-cx-dev-secret-change-in-production"
    ALGORITHM: str = "HS256"
    ACCESS_TOKEN_EXPIRE_MINUTES: int = 480

    model_config = {"env_file": ".env", "env_file_encoding": "utf-8"}


settings = Settings()
