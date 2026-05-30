"""Environment-driven configuration for the AURA-CX API.

Enterprise extension: adds Redis/Celery, encryption, multilingual,
voice, campaign, compliance, rate limiting, and social monitor settings.
"""

from __future__ import annotations

from pydantic import field_validator, model_validator
from pydantic_settings import BaseSettings, SettingsConfigDict


class Settings(BaseSettings):
    model_config = SettingsConfigDict(env_file=".env", env_file_encoding="utf-8", extra="ignore")

    USE_MOCK_DATA: bool = False
    ENVIRONMENT: str = "production"
    API_VERSION: str = "2.0.0"
    FRONTEND_URL: str = "http://localhost:3000"
    APP_URL: str = "http://localhost:3000"  # Used for email verification links

    DATABASE_URL: str = "postgresql+asyncpg://aura:aura@postgres:5432/aura_cx"

    SECRET_KEY: str = ""
    ALGORITHM: str = "HS256"
    ACCESS_TOKEN_EXPIRE_MINUTES: int = 15
    REFRESH_TOKEN_EXPIRE_DAYS: int = 7
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
    OPENAI_API_KEY: str = ""
    OPENAI_MODEL: str = "gpt-4.1-mini"
    ANTHROPIC_API_KEY: str = ""
    ANTHROPIC_MODEL: str = "claude-3-5-sonnet-latest"
    MISTRAL_API_KEY: str = ""
    MISTRAL_MODEL: str = "mistral-large-latest"
    OPENROUTER_API_KEY: str = ""
    OPENROUTER_MODEL: str = "openai/gpt-4.1-mini"
    OLLAMA_BASE_URL: str = "http://ollama:11434"
    OLLAMA_MODEL: str = "llama3.1"
    SELF_HOSTED_AI_BASE_URL: str = ""
    SELF_HOSTED_AI_API_KEY: str = ""
    SELF_HOSTED_AI_MODEL: str = ""
    AI_PROVIDER: str = "gemini"
    AI_FALLBACK_ORDER: str = "gemini,openai,anthropic,openrouter,mistral,ollama,self_hosted"
    AI_TIMEOUT_SECONDS: float = 45.0
    AI_MAX_RETRIES: int = 2

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
    REDIS_PASSWORD: str = ""
    CELERY_BROKER_URL: str = "redis://redis:6379/1"
    CELERY_RESULT_BACKEND: str = "redis://redis:6379/2"

    # ── Encryption ───────────────────────────────────────────
    ENCRYPTION_KEY: str = ""  # Fernet key for BYOI credential encryption

    # ── Rate Limiting ────────────────────────────────────────
    RATE_LIMIT_PER_TENANT: int = 500   # requests per minute per tenant
    RATE_LIMIT_WEBHOOK_PER_IP: int = 20  # webhook POSTs per minute per IP

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

    # Email delivery for HITL approvals / private threads.
    SMTP_HOST: str = ""
    SMTP_PORT: int = 587
    SMTP_USER: str = ""
    SMTP_PASS: str = ""

    # ── Campaign Engine ──────────────────────────────────────
    SENTIMENT_DROP_THRESHOLD: float = -0.40
    CHURN_RISK_THRESHOLD: float = 0.65

    # ── Social Monitor ───────────────────────────────────────
    X_BEARER_TOKEN: str = ""
    THREADS_ACCESS_TOKEN: str = ""
    IMAP_HOST: str = ""
    IMAP_PORT: int = 993
    IMAP_USER: str = ""
    IMAP_PASSWORD: str = ""
    IMAP_USE_SSL: bool = True
    SOCIAL_MONITOR_POLL_INTERVAL: int = 300  # seconds
    COMPLAINT_CONFIDENCE_THRESHOLD: float = 0.70

    @field_validator("VECTOR_PROVIDER")
    @classmethod
    def validate_vector_provider(cls, value: str) -> str:
        value = value.lower().strip()
        if value not in {"pinecone", "chroma"}:
            raise ValueError("VECTOR_PROVIDER must be 'pinecone' or 'chroma'")
        return value

    @field_validator("AI_PROVIDER")
    @classmethod
    def validate_ai_provider(cls, value: str) -> str:
        value = value.lower().strip()
        if value not in {"gemini", "openai", "anthropic", "mistral", "ollama", "openrouter", "self_hosted"}:
            raise ValueError("AI_PROVIDER is not supported")
        return value

    @property
    def supported_languages_list(self) -> list[str]:
        return [lang.strip() for lang in self.SUPPORTED_LANGUAGES.split(",") if lang.strip()]

    @property
    def ai_fallback_order_list(self) -> list[str]:
        return [provider.strip().lower() for provider in self.AI_FALLBACK_ORDER.split(",") if provider.strip()]

    @model_validator(mode="after")
    def validate_production_security(self) -> "Settings":
        if self.ENVIRONMENT.lower() == "production" and not self.USE_MOCK_DATA:
            missing = [
                name for name in ("SECRET_KEY", "WEBHOOK_SIGNING_SECRET", "ENCRYPTION_KEY", "REDIS_PASSWORD")
                if not getattr(self, name)
            ]
            if missing:
                raise ValueError(f"Missing required production security settings: {', '.join(missing)}")
            if len(self.SECRET_KEY) < 32:
                raise ValueError("SECRET_KEY must be at least 32 characters in production")
            if self.BOOTSTRAP_ADMIN_PASSWORD in {"Admin@123", "ChangeMeNow123!", "password"}:
                raise ValueError("BOOTSTRAP_ADMIN_PASSWORD must be changed for production")
        return self


settings = Settings()
