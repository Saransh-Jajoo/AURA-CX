"""Environment-driven configuration for the AURA-CX API."""

from __future__ import annotations

from pydantic import field_validator
from pydantic_settings import BaseSettings, SettingsConfigDict


class Settings(BaseSettings):
    model_config = SettingsConfigDict(env_file=".env", env_file_encoding="utf-8", extra="ignore")

    USE_MOCK_DATA: bool = False
    ENVIRONMENT: str = "production"
    API_VERSION: str = "1.0.0"
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

    GEMINI_API_KEY: str = ""
    GEMINI_MODEL: str = "gemini-1.5-pro-latest"
    GEMINI_EMBEDDING_MODEL: str = "text-embedding-004"

    VECTOR_PROVIDER: str = "pinecone"
    PINECONE_API_KEY: str = ""
    PINECONE_INDEX: str = "aura-cx"
    PINECONE_HOST: str = ""
    CHROMA_HOST: str = "chroma"
    CHROMA_PORT: int = 8000
    CHROMA_COLLECTION: str = "aura_cx"
    COSINE_THRESHOLD: float = 0.92

    DRAFT_CONFIDENCE_THRESHOLD: float = 0.85
    HDBSCAN_MIN_CLUSTER_SIZE: int = 5
    HDBSCAN_MIN_SAMPLES: int = 3

    STRIPE_SECRET_KEY: str = ""
    STRIPE_PRICE_STARTER: str = ""
    STRIPE_PRICE_PRO: str = ""
    STRIPE_PRICE_ENTERPRISE: str = ""

    @field_validator("VECTOR_PROVIDER")
    @classmethod
    def validate_vector_provider(cls, value: str) -> str:
        value = value.lower().strip()
        if value not in {"pinecone", "chroma"}:
            raise ValueError("VECTOR_PROVIDER must be 'pinecone' or 'chroma'")
        return value


settings = Settings()
