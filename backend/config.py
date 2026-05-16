"""Environment-driven configuration for the AURA-CX API.

Enterprise extension: adds Redis/Celery, encryption, multilingual,
voice, campaign, and compliance settings.
"""

from __future__ import annotations

from pydantic import field_validator
from pydantic_settings import BaseSettings, SettingsConfigDict


class Settings(BaseSettings):
    model_config = SettingsConfigDict(env_file=".env", env_file_encoding="utf-8", extra="ignore")

    USE_MOCK_DATA: bool = False
    ENVIRONMENT: str = "production"
    API_VERSION: str = "2.0.0"
    FRONTEND_URL: str = "http://localhost:3000"

    DATABASE_URL: str = "postgresql+asyncpg://aura:aura@postgres:5432/aura_cx"

    SECRET_KEY: str = ""
    ALGORITHM: str = "HS256"
    ACCESS_TOKEN_EXPIRE_MINUTES: int = 480
    BOOTSTRAP_TENANT_ID: str = "tenant-default"
    BOOTSTRAP_TENANT_NAME: str = "AURA-CX Workspace"
    BOOTSTRAP_ADMIN_EMAIL: str = ""
    BOOTSTRAP_ADMIN_PASSWORD: str = ""

    WEBHOOK_SIGNING_SECRET: str = ""
    WEBHOOK_MAX_BYTES: int = 200_000

    # ── AI Providers ─────────────────────────────────────────
    GEMINI_API_KEY: str = ""
    GEMINI_MODEL: str = "gemini-1.5-pro-latest"
    GEMINI_EMBEDDING_MODEL: str = "text-embedding-004"

    # ── Vector Store ─────────────────────────────────────────
    VECTOR_PROVIDER: str = "pinecone"
    PINECONE_API_KEY: str = ""
    PINECONE_INDEX: str = "aura-cx"
    PINECONE_HOST: str = ""
    CHROMA_HOST: str = "chroma"
    CHROMA_PORT: int = 8000
    CHROMA_COLLECTION: str = "aura_cx"
    COSINE_THRESHOLD: float = 0.92

    # ── AI Thresholds ────────────────────────────────────────
    DRAFT_CONFIDENCE_THRESHOLD: float = 0.85
    KB_GAP_THRESHOLD: float = 0.60  # below this → flag KB deficiency
    HDBSCAN_MIN_CLUSTER_SIZE: int = 5
    HDBSCAN_MIN_SAMPLES: int = 3

    # ── Stripe ───────────────────────────────────────────────
    STRIPE_SECRET_KEY: str = ""
    STRIPE_PRICE_STARTER: str = ""
    STRIPE_PRICE_PRO: str = ""
    STRIPE_PRICE_ENTERPRISE: str = ""

    # ── Redis / Celery ───────────────────────────────────────
    REDIS_URL: str = "redis://redis:6379/0"
    CELERY_BROKER_URL: str = "redis://redis:6379/1"
    CELERY_RESULT_BACKEND: str = "redis://redis:6379/2"

    # ── Encryption ───────────────────────────────────────────
    ENCRYPTION_KEY: str = ""  # Fernet key for BYOI credential encryption

    # ── SLA Defaults (minutes) ───────────────────────────────
    SLA_P1_MINUTES: int = 30
    SLA_P2_MINUTES: int = 120
    SLA_P3_MINUTES: int = 1440
    SLA_P4_MINUTES: int = 4320
    SLA_WARNING_PERCENT: float = 0.75  # warn at 75% of SLA time

    # ── Multilingual ─────────────────────────────────────────
    DEFAULT_LANGUAGE: str = "en"
    SUPPORTED_LANGUAGES: str = "en,hi,mr,ta,bn,gu,te,kn,ml"

    # ── Voice / Twilio ───────────────────────────────────────
    TWILIO_ACCOUNT_SID: str = ""
    TWILIO_AUTH_TOKEN: str = ""
    TWILIO_PHONE_NUMBER: str = ""

    # ── Campaign Engine ──────────────────────────────────────
    SENTIMENT_DROP_THRESHOLD: float = -0.40
    CHURN_RISK_THRESHOLD: float = 0.65

    @field_validator("VECTOR_PROVIDER")
    @classmethod
    def validate_vector_provider(cls, value: str) -> str:
        value = value.lower().strip()
        if value not in {"pinecone", "chroma"}:
            raise ValueError("VECTOR_PROVIDER must be 'pinecone' or 'chroma'")
        return value

    @property
    def supported_languages_list(self) -> list[str]:
        return [lang.strip() for lang in self.SUPPORTED_LANGUAGES.split(",") if lang.strip()]


settings = Settings()
