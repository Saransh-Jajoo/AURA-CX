# AURA-CX

AURA-CX is a tenant-isolated AI complaint intelligence and resolution platform for enterprise customer experience teams. It supports human-in-the-loop complaint triage, SLA tracking, grounded AI response drafting, knowledge-base retrieval, omnichannel ingestion, analytics, and auditability.

## Local Setup

1. Copy `.env.example` to `.env`.
2. Generate production-grade secrets:
   - `SECRET_KEY`: 32+ random bytes as hex.
   - `WEBHOOK_SIGNING_SECRET`: independent HMAC secret.
   - `ENCRYPTION_KEY`: Fernet key from `python -c "from cryptography.fernet import Fernet; print(Fernet.generate_key().decode())"`.
   - `REDIS_PASSWORD` and `POSTGRES_PASSWORD`: strong unique passwords.
3. Set `BOOTSTRAP_ADMIN_EMAIL` and a strong `BOOTSTRAP_ADMIN_PASSWORD`.
4. Choose `VECTOR_PROVIDER=chroma` for local Docker, or configure Pinecone with `PINECONE_API_KEY` and `PINECONE_HOST`.
5. Run `docker compose up -d --build`.
6. Open `http://localhost:3000` and sign in with the bootstrap admin account.

## Required Services

- PostgreSQL 16: primary relational store.
- Redis 7: rate limiting, Celery broker/result backend, deduplication.
- ChromaDB or Pinecone: tenant-namespaced vector retrieval.
- FastAPI backend: API, websocket, auth, complaint lifecycle.
- Celery worker and beat: SLA scans, social polling, KB reindexing, background processing.
- Next.js frontend: enterprise dashboard and onboarding.

## AI Provider Setup

Set `AI_PROVIDER` to one of `gemini`, `openai`, `anthropic`, `mistral`, `ollama`, `openrouter`, or `self_hosted`. Configure fallback order with `AI_FALLBACK_ORDER`.

Required credentials by provider:
- Gemini: `GEMINI_API_KEY`, `GEMINI_MODEL`, `GEMINI_EMBEDDING_MODEL`.
- OpenAI: `OPENAI_API_KEY`, `OPENAI_MODEL`.
- Anthropic: `ANTHROPIC_API_KEY`, `ANTHROPIC_MODEL`.
- Mistral: `MISTRAL_API_KEY`, `MISTRAL_MODEL`.
- OpenRouter: `OPENROUTER_API_KEY`, `OPENROUTER_MODEL`.
- Ollama: `OLLAMA_BASE_URL`, `OLLAMA_MODEL`.
- Self-hosted OpenAI-compatible endpoint: `SELF_HOSTED_AI_BASE_URL`, `SELF_HOSTED_AI_API_KEY`, `SELF_HOSTED_AI_MODEL`.

Tenant admins can also store BYOK credentials from the dashboard. Secrets are encrypted at rest with `ENCRYPTION_KEY`.

## Omnichannel Setup

Supported complaint sources are X/Twitter, Reddit, Gmail/IMAP, WhatsApp, and web forms.

For each channel:
1. Add encrypted platform credentials in Dashboard -> Integrations or Settings.
2. Create an integration source with platform, identifier, filters, and active status.
3. Configure provider webhooks to call `/api/v1/webhooks/{tenant_id}/{channel}`.
4. Sign each webhook body with HMAC-SHA256 using `WEBHOOK_SIGNING_SECRET` and send it as `X-Aura-Webhook-Signature`.

Gmail uses IMAP app-password style credentials. X/Twitter uses bearer token for read ingestion, and OAuth credentials can be stored for future reply workflows. WhatsApp can be configured through a webhook gateway such as Twilio or Meta Cloud API.

## Knowledge Base and RAG

Upload PDF, DOCX, TXT, MD, or CSV files from the KB UI/API. The backend extracts text, chunks content, embeds chunks, and stores tenant-scoped vectors with source metadata. AI drafts retrieve only organization-specific context and keep HITL approval as the final gate.

## Security Notes

- JWT access tokens are short lived.
- Refresh tokens are database-backed, rotated, and revocable.
- RBAC roles: Super Admin, Tenant Admin, Executive, Manager, Support Agent, QA Reviewer, Read-Only Analyst.
- Tenant isolation is enforced in API queries and can be strengthened with `scripts/enable_rls.sql`.
- Credentials are encrypted at rest.
- Webhooks require HMAC signatures.
- PII scrubbing, toxicity scoring, rate limiting, secure headers, and audit trails are enabled.

## Production Deployment

Use `docker-compose.yml` as the reference deployment topology. For production, set `ENVIRONMENT=production`, `USE_MOCK_DATA=false`, non-default secrets, reachable PostgreSQL/Redis/vector services, provider credentials, and a real `FRONTEND_URL`. Place TLS and WAF/rate protection at the ingress layer, and run `scripts/enable_rls.sql` after schema creation if database-enforced RLS is required.
