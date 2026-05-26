"""SQLAlchemy models for tenant-isolated AURA-CX metadata.

Enterprise extension: adds TenantConfig (BYOI), TeamInvitation, SLA tracking,
call recordings, CSAT collection, campaign triggers, and compliance fields.
All original tables preserved with backward-compatible column additions.
"""

from __future__ import annotations

import secrets
from datetime import datetime, timezone

from sqlalchemy import Boolean, DateTime, Float, ForeignKey, Integer, JSON, String, Text, UniqueConstraint
from sqlalchemy.orm import DeclarativeBase, Mapped, mapped_column, relationship


def utcnow() -> datetime:
    return datetime.now(timezone.utc)


def new_id(prefix: str) -> str:
    return f"{prefix}_{secrets.token_urlsafe(12).replace('-', '').replace('_', '')[:18]}"


class Base(DeclarativeBase):
    pass


# ── Tenant ────────────────────────────────────────────────────
class Tenant(Base):
    __tablename__ = "tenants"

    id: Mapped[str] = mapped_column(String(64), primary_key=True)
    name: Mapped[str] = mapped_column(String(255), nullable=False)
    plan: Mapped[str] = mapped_column(String(64), default="starter", nullable=False)
    stripe_customer_id: Mapped[str | None] = mapped_column(String(255))
    # Enterprise fields
    domain: Mapped[str | None] = mapped_column(String(255), index=True)
    industry: Mapped[str | None] = mapped_column(String(128))
    logo_url: Mapped[str | None] = mapped_column(String(1024))
    onboarding_complete: Mapped[bool] = mapped_column(Boolean, default=False, nullable=False)
    default_language: Mapped[str] = mapped_column(String(8), default="en", nullable=False)
    sla_config: Mapped[dict] = mapped_column(JSON, default=lambda: {
        "p1_minutes": 30, "p2_minutes": 120, "p3_minutes": 1440, "p4_minutes": 4320
    }, nullable=False)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=utcnow, nullable=False)

    users: Mapped[list["User"]] = relationship(back_populates="tenant")
    config: Mapped["TenantConfig | None"] = relationship(back_populates="tenant", uselist=False)


# ── Tenant Configuration (BYOI — Bring Your Own Infrastructure) ──
class TenantConfig(Base):
    """Encrypted tenant-specific API keys and infrastructure credentials."""
    __tablename__ = "tenant_configs"

    id: Mapped[str] = mapped_column(String(64), primary_key=True, default=lambda: new_id("tcfg"))
    tenant_id: Mapped[str] = mapped_column(ForeignKey("tenants.id", ondelete="CASCADE"), unique=True, nullable=False)
    # AI Provider keys (stored encrypted)
    gemini_api_key_enc: Mapped[str | None] = mapped_column(Text)
    openai_api_key_enc: Mapped[str | None] = mapped_column(Text)
    # Vector DB
    pinecone_api_key_enc: Mapped[str | None] = mapped_column(Text)
    pinecone_host: Mapped[str | None] = mapped_column(String(512))
    chromadb_host: Mapped[str | None] = mapped_column(String(512))
    chromadb_port: Mapped[int | None] = mapped_column(Integer)
    # Communication
    smtp_host: Mapped[str | None] = mapped_column(String(512))
    smtp_port: Mapped[int | None] = mapped_column(Integer)
    smtp_user_enc: Mapped[str | None] = mapped_column(Text)
    smtp_pass_enc: Mapped[str | None] = mapped_column(Text)
    twilio_sid_enc: Mapped[str | None] = mapped_column(Text)
    twilio_token_enc: Mapped[str | None] = mapped_column(Text)
    twilio_phone: Mapped[str | None] = mapped_column(String(32))
    # Storage
    storage_bucket: Mapped[str | None] = mapped_column(String(512))
    storage_provider: Mapped[str | None] = mapped_column(String(32))  # s3, gcs, azure
    storage_credentials_enc: Mapped[str | None] = mapped_column(Text)
    # Webhooks
    webhook_endpoints: Mapped[dict] = mapped_column(JSON, default=dict, nullable=False)
    # Brand voice
    brand_tone: Mapped[str | None] = mapped_column(Text)  # markdown brand guidelines
    brand_examples: Mapped[list[dict]] = mapped_column(JSON, default=list, nullable=False)
    # ── Platform Connections (user-configurable, encrypted) ───
    # X / Twitter
    x_bearer_token_enc: Mapped[str | None] = mapped_column(Text)
    x_api_key_enc: Mapped[str | None] = mapped_column(Text)
    x_api_secret_enc: Mapped[str | None] = mapped_column(Text)
    x_access_token_enc: Mapped[str | None] = mapped_column(Text)
    x_access_secret_enc: Mapped[str | None] = mapped_column(Text)
    # Reddit
    reddit_client_id_enc: Mapped[str | None] = mapped_column(Text)
    reddit_client_secret_enc: Mapped[str | None] = mapped_column(Text)
    reddit_user_agent: Mapped[str | None] = mapped_column(String(512))
    reddit_username_enc: Mapped[str | None] = mapped_column(Text)
    reddit_password_enc: Mapped[str | None] = mapped_column(Text)
    # Gmail / IMAP
    gmail_imap_host: Mapped[str | None] = mapped_column(String(512))
    gmail_imap_port: Mapped[int | None] = mapped_column(Integer)
    gmail_imap_user_enc: Mapped[str | None] = mapped_column(Text)
    gmail_imap_pass_enc: Mapped[str | None] = mapped_column(Text)
    # Threads
    threads_access_token_enc: Mapped[str | None] = mapped_column(Text)
    updated_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=utcnow, onupdate=utcnow, nullable=False)

    tenant: Mapped[Tenant] = relationship(back_populates="config")


# ── User ──────────────────────────────────────────────────────
class User(Base):
    __tablename__ = "users"

    id: Mapped[str] = mapped_column(String(64), primary_key=True, default=lambda: new_id("usr"))
    tenant_id: Mapped[str | None] = mapped_column(ForeignKey("tenants.id", ondelete="CASCADE"), index=True)
    email: Mapped[str] = mapped_column(String(320), unique=True, index=True, nullable=False)
    name: Mapped[str] = mapped_column(String(255), nullable=False)
    hashed_password: Mapped[str] = mapped_column(String(255), nullable=False)
    role: Mapped[str] = mapped_column(String(64), index=True, nullable=False)
    avatar: Mapped[str] = mapped_column(String(16), default="AU", nullable=False)
    active: Mapped[bool] = mapped_column(Boolean, default=True, nullable=False)
    # Enterprise fields
    phone: Mapped[str | None] = mapped_column(String(32))
    department: Mapped[str | None] = mapped_column(String(128))
    language: Mapped[str] = mapped_column(String(8), default="en", nullable=False)
    last_login: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=utcnow, nullable=False)

    tenant: Mapped[Tenant | None] = relationship(back_populates="users")


# ── Team Invitation ───────────────────────────────────────────
class TeamInvitation(Base):
    """Secure invite links for team member onboarding."""
    __tablename__ = "team_invitations"

    id: Mapped[str] = mapped_column(String(64), primary_key=True, default=lambda: new_id("inv"))
    tenant_id: Mapped[str] = mapped_column(ForeignKey("tenants.id", ondelete="CASCADE"), index=True, nullable=False)
    email: Mapped[str] = mapped_column(String(320), nullable=False)
    role: Mapped[str] = mapped_column(String(64), nullable=False)
    token: Mapped[str] = mapped_column(String(128), unique=True, nullable=False, default=lambda: secrets.token_urlsafe(48))
    invited_by: Mapped[str | None] = mapped_column(ForeignKey("users.id", ondelete="SET NULL"))
    accepted: Mapped[bool] = mapped_column(Boolean, default=False, nullable=False)
    expires_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), nullable=False)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=utcnow, nullable=False)


# ── Integration Source ────────────────────────────────────────
class IntegrationSource(Base):
    __tablename__ = "integration_sources"
    __table_args__ = (UniqueConstraint("tenant_id", "platform", "identifier", name="uq_tenant_platform_identifier"),)

    id: Mapped[str] = mapped_column(String(64), primary_key=True, default=lambda: new_id("src"))
    tenant_id: Mapped[str] = mapped_column(ForeignKey("tenants.id", ondelete="CASCADE"), index=True, nullable=False)
    platform: Mapped[str] = mapped_column(String(32), index=True, nullable=False)
    identifier: Mapped[str] = mapped_column(String(512), nullable=False)
    label: Mapped[str | None] = mapped_column(String(255))
    filters: Mapped[dict] = mapped_column(JSON, default=dict, nullable=False)
    active: Mapped[bool] = mapped_column(Boolean, default=True, nullable=False)
    webhook_secret_hash: Mapped[str | None] = mapped_column(String(255))
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=utcnow, nullable=False)


# ── Customer Profile ─────────────────────────────────────────
class CustomerProfile(Base):
    __tablename__ = "customer_profiles"

    id: Mapped[str] = mapped_column(String(64), primary_key=True, default=lambda: new_id("cus"))
    tenant_id: Mapped[str] = mapped_column(ForeignKey("tenants.id", ondelete="CASCADE"), index=True, nullable=False)
    name: Mapped[str] = mapped_column(String(255), default="Unknown Customer", nullable=False)
    email: Mapped[str | None] = mapped_column(String(320), index=True)
    x_handle: Mapped[str | None] = mapped_column(String(255), index=True)
    reddit_handle: Mapped[str | None] = mapped_column(String(255), index=True)
    whatsapp_id: Mapped[str | None] = mapped_column(String(255), index=True)
    # Extended identity fields
    phone: Mapped[str | None] = mapped_column(String(32), index=True)
    secondary_emails: Mapped[list[str]] = mapped_column(JSON, default=list, nullable=False)
    social_accounts: Mapped[dict] = mapped_column(JSON, default=dict, nullable=False)  # {"twitter": ..., "linkedin": ...}
    crm_reference: Mapped[str | None] = mapped_column(String(255))
    plan: Mapped[str | None] = mapped_column(String(64))
    ltv: Mapped[float] = mapped_column(Float, default=0.0, nullable=False)
    churn_risk: Mapped[float] = mapped_column(Float, default=0.0, nullable=False)
    tags: Mapped[list[str]] = mapped_column(JSON, default=list, nullable=False)
    identity_score: Mapped[float] = mapped_column(Float, default=0.0, nullable=False)
    identity_method: Mapped[str | None] = mapped_column(String(255))
    identity_vectors: Mapped[dict] = mapped_column(JSON, default=dict, nullable=False)
    # Language preference
    preferred_language: Mapped[str] = mapped_column(String(8), default="en", nullable=False)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=utcnow, nullable=False)
    updated_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=utcnow, onupdate=utcnow, nullable=False)


# ── Ticket ────────────────────────────────────────────────────
class Ticket(Base):
    __tablename__ = "tickets"

    id: Mapped[str] = mapped_column(String(64), primary_key=True, default=lambda: new_id("tkt"))
    tenant_id: Mapped[str] = mapped_column(ForeignKey("tenants.id", ondelete="CASCADE"), index=True, nullable=False)
    profile_id: Mapped[str | None] = mapped_column(ForeignKey("customer_profiles.id", ondelete="SET NULL"), index=True)
    channel: Mapped[str] = mapped_column(String(32), index=True, nullable=False)
    customer_name: Mapped[str] = mapped_column(String(255), default="Unknown Customer", nullable=False)
    customer_handle: Mapped[str] = mapped_column(String(512), nullable=False)
    message: Mapped[str] = mapped_column(Text, nullable=False)
    product: Mapped[str] = mapped_column(String(255), default="unspecified", nullable=False)
    intent: Mapped[str] = mapped_column(String(255), default="unclassified", nullable=False)
    severity: Mapped[str] = mapped_column(String(32), default="medium", nullable=False)
    sentiment: Mapped[str] = mapped_column(String(64), default="unknown", nullable=False)
    sentiment_score: Mapped[float] = mapped_column(Float, default=0.0, nullable=False)
    confidence: Mapped[float] = mapped_column(Float, default=0.0, nullable=False)
    status: Mapped[str] = mapped_column(String(64), default="new", index=True, nullable=False)
    pii_report: Mapped[list[dict]] = mapped_column(JSON, default=list, nullable=False)
    toxicity_score: Mapped[float] = mapped_column(Float, default=0.0, nullable=False)
    ai_draft: Mapped[str | None] = mapped_column(Text)
    rag_sources: Mapped[list[dict]] = mapped_column(JSON, default=list, nullable=False)
    embedding: Mapped[list[float]] = mapped_column(JSON, default=list, nullable=False)
    event_metadata: Mapped[dict] = mapped_column(JSON, default=dict, nullable=False)
    # SLA tracking
    sla_priority: Mapped[str] = mapped_column(String(8), default="p3", nullable=False)
    sla_deadline: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))
    sla_breached: Mapped[bool] = mapped_column(Boolean, default=False, nullable=False)
    sla_escalation_level: Mapped[int] = mapped_column(Integer, default=0, nullable=False)
    # Resolution loop
    assigned_to: Mapped[str | None] = mapped_column(ForeignKey("users.id", ondelete="SET NULL"))
    resolved_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))
    resolution_note: Mapped[str | None] = mapped_column(Text)
    resolved_by: Mapped[str | None] = mapped_column(ForeignKey("users.id", ondelete="SET NULL"))
    csat_score: Mapped[int | None] = mapped_column(Integer)  # 1-5
    csat_comment: Mapped[str | None] = mapped_column(Text)
    csat_collected_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))
    # Private channel resolution
    private_channel: Mapped[str | None] = mapped_column(String(32))  # "email" | "whatsapp" | "chat"
    private_channel_token: Mapped[str | None] = mapped_column(String(256), unique=True, index=True)
    private_channel_address: Mapped[str | None] = mapped_column(String(512))  # email or phone
    handoff_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))
    # Call recording reference
    call_recording_id: Mapped[str | None] = mapped_column(String(64))
    # Language
    detected_language: Mapped[str] = mapped_column(String(8), default="en", nullable=False)
    # Cluster/shadow linkage
    cluster_id: Mapped[str | None] = mapped_column(String(64), index=True)
    parent_ticket_id: Mapped[str | None] = mapped_column(String(64), index=True)
    received_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=utcnow, index=True, nullable=False)
    updated_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=utcnow, onupdate=utcnow, nullable=False)


# ── Knowledge Document ────────────────────────────────────────
class KnowledgeDocument(Base):
    __tablename__ = "knowledge_documents"

    id: Mapped[str] = mapped_column(String(64), primary_key=True, default=lambda: new_id("kb"))
    tenant_id: Mapped[str] = mapped_column(ForeignKey("tenants.id", ondelete="CASCADE"), index=True, nullable=False)
    title: Mapped[str] = mapped_column(String(512), nullable=False)
    source_uri: Mapped[str | None] = mapped_column(String(1024))
    body: Mapped[str] = mapped_column(Text, nullable=False)
    embedding: Mapped[list[float]] = mapped_column(JSON, default=list, nullable=False)
    source_metadata: Mapped[dict] = mapped_column(JSON, default=dict, nullable=False)
    # Versioning & lifecycle
    version: Mapped[int] = mapped_column(Integer, default=1, nullable=False)
    status: Mapped[str] = mapped_column(String(32), default="active", nullable=False)  # active, archived, deprecated
    category: Mapped[str] = mapped_column(String(128), default="general", nullable=False)
    doc_type: Mapped[str] = mapped_column(String(64), default="article", nullable=False)  # article, faq, sop, policy, api_doc
    file_type: Mapped[str | None] = mapped_column(String(32))  # pdf, docx, txt, md
    file_size_bytes: Mapped[int | None] = mapped_column(Integer)
    chunk_count: Mapped[int] = mapped_column(Integer, default=1, nullable=False)
    last_indexed_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))
    created_by: Mapped[str | None] = mapped_column(ForeignKey("users.id", ondelete="SET NULL"))
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=utcnow, nullable=False)
    updated_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=utcnow, onupdate=utcnow, nullable=False)


# ── KB Gap Log ────────────────────────────────────────────────
class KBGapLog(Base):
    """Tracks queries where AI confidence was below threshold, indicating KB deficiency."""
    __tablename__ = "kb_gap_logs"

    id: Mapped[str] = mapped_column(String(64), primary_key=True, default=lambda: new_id("gap"))
    tenant_id: Mapped[str] = mapped_column(ForeignKey("tenants.id", ondelete="CASCADE"), index=True, nullable=False)
    ticket_id: Mapped[str | None] = mapped_column(ForeignKey("tickets.id", ondelete="SET NULL"))
    query: Mapped[str] = mapped_column(Text, nullable=False)
    ai_confidence: Mapped[float] = mapped_column(Float, nullable=False)
    suggested_topic: Mapped[str | None] = mapped_column(String(512))
    resolved: Mapped[bool] = mapped_column(Boolean, default=False, nullable=False)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=utcnow, nullable=False)


# ── RLHF Signal ──────────────────────────────────────────────
class RLHFSignal(Base):
    __tablename__ = "rlhf_signals"

    id: Mapped[str] = mapped_column(String(64), primary_key=True, default=lambda: new_id("rlhf"))
    tenant_id: Mapped[str] = mapped_column(ForeignKey("tenants.id", ondelete="CASCADE"), index=True, nullable=False)
    ticket_id: Mapped[str] = mapped_column(ForeignKey("tickets.id", ondelete="CASCADE"), index=True, nullable=False)
    user_id: Mapped[str | None] = mapped_column(ForeignKey("users.id", ondelete="SET NULL"))
    signal_type: Mapped[str] = mapped_column(String(32), nullable=False)
    original_draft: Mapped[str] = mapped_column(Text, nullable=False)
    edited_draft: Mapped[str | None] = mapped_column(Text)
    # Extended RLHF metrics
    correction_category: Mapped[str | None] = mapped_column(String(128))  # tone, accuracy, completeness, policy
    confidence_before: Mapped[float | None] = mapped_column(Float)
    confidence_after: Mapped[float | None] = mapped_column(Float)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=utcnow, nullable=False)


# ── Call Recording ────────────────────────────────────────────
class CallRecording(Base):
    """Encrypted call recordings with timestamped transcripts."""
    __tablename__ = "call_recordings"

    id: Mapped[str] = mapped_column(String(64), primary_key=True, default=lambda: new_id("call"))
    tenant_id: Mapped[str] = mapped_column(ForeignKey("tenants.id", ondelete="CASCADE"), index=True, nullable=False)
    ticket_id: Mapped[str | None] = mapped_column(ForeignKey("tickets.id", ondelete="SET NULL"), index=True)
    profile_id: Mapped[str | None] = mapped_column(ForeignKey("customer_profiles.id", ondelete="SET NULL"))
    # Call metadata
    caller_number: Mapped[str | None] = mapped_column(String(32))
    call_sid: Mapped[str | None] = mapped_column(String(128), unique=True)
    duration_seconds: Mapped[int] = mapped_column(Integer, default=0, nullable=False)
    status: Mapped[str] = mapped_column(String(32), default="active", nullable=False)  # active, completed, failed
    direction: Mapped[str] = mapped_column(String(16), default="inbound", nullable=False)
    # Storage
    recording_url_enc: Mapped[str | None] = mapped_column(Text)  # encrypted storage URL
    recording_size_bytes: Mapped[int | None] = mapped_column(Integer)
    # Transcript
    transcript: Mapped[list[dict]] = mapped_column(JSON, default=list, nullable=False)  # [{timestamp, speaker, text}]
    ai_summary: Mapped[str | None] = mapped_column(Text)
    sentiment_score: Mapped[float] = mapped_column(Float, default=0.0, nullable=False)
    detected_language: Mapped[str] = mapped_column(String(8), default="en", nullable=False)
    # Resolution
    complaint_registered: Mapped[bool] = mapped_column(Boolean, default=False, nullable=False)
    resolution_attempted: Mapped[bool] = mapped_column(Boolean, default=False, nullable=False)
    started_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=utcnow, nullable=False)
    ended_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))


# ── SLA Event ─────────────────────────────────────────────────
class SLAEvent(Base):
    """SLA state transitions and escalation history."""
    __tablename__ = "sla_events"

    id: Mapped[str] = mapped_column(String(64), primary_key=True, default=lambda: new_id("sla"))
    tenant_id: Mapped[str] = mapped_column(ForeignKey("tenants.id", ondelete="CASCADE"), index=True, nullable=False)
    ticket_id: Mapped[str] = mapped_column(ForeignKey("tickets.id", ondelete="CASCADE"), index=True, nullable=False)
    event_type: Mapped[str] = mapped_column(String(64), nullable=False)  # warning, breach, escalation, resolved
    escalation_level: Mapped[int] = mapped_column(Integer, default=0, nullable=False)
    details: Mapped[dict] = mapped_column(JSON, default=dict, nullable=False)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=utcnow, nullable=False)


# ── Campaign Trigger ──────────────────────────────────────────
class CampaignTrigger(Base):
    """Proactive retention/recovery workflow triggers."""
    __tablename__ = "campaign_triggers"

    id: Mapped[str] = mapped_column(String(64), primary_key=True, default=lambda: new_id("cmp"))
    tenant_id: Mapped[str] = mapped_column(ForeignKey("tenants.id", ondelete="CASCADE"), index=True, nullable=False)
    ticket_id: Mapped[str | None] = mapped_column(ForeignKey("tickets.id", ondelete="SET NULL"))
    profile_id: Mapped[str | None] = mapped_column(ForeignKey("customer_profiles.id", ondelete="SET NULL"))
    trigger_type: Mapped[str] = mapped_column(String(64), nullable=False)  # sentiment_drop, churn_risk, sla_breach
    action_type: Mapped[str] = mapped_column(String(64), nullable=False)  # recovery_ticket, compensation, callback, retention_offer
    suggested_action: Mapped[str | None] = mapped_column(Text)
    status: Mapped[str] = mapped_column(String(32), default="pending", nullable=False)  # pending, approved, rejected, executed
    approved_by: Mapped[str | None] = mapped_column(ForeignKey("users.id", ondelete="SET NULL"))
    executed_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=utcnow, nullable=False)


# ── Audit Event ──────────────────────────────────────────────
class AuditEvent(Base):
    __tablename__ = "audit_events"

    id: Mapped[str] = mapped_column(String(64), primary_key=True, default=lambda: new_id("aud"))
    tenant_id: Mapped[str | None] = mapped_column(String(64), index=True)
    user_id: Mapped[str | None] = mapped_column(String(64), index=True)
    action: Mapped[str] = mapped_column(String(255), nullable=False)
    resource_type: Mapped[str] = mapped_column(String(128), nullable=False)
    resource_id: Mapped[str | None] = mapped_column(String(128))
    details: Mapped[dict] = mapped_column(JSON, default=dict, nullable=False)
    # Extended compliance fields
    previous_state: Mapped[dict | None] = mapped_column(JSON)
    new_state: Mapped[dict | None] = mapped_column(JSON)
    reason: Mapped[str | None] = mapped_column(Text)
    ip_address: Mapped[str | None] = mapped_column(String(64))
    user_agent: Mapped[str | None] = mapped_column(String(512))
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=utcnow, nullable=False)


# ── Social Monitor Configuration ──────────────────────────────
class SocialMonitorConfig(Base):
    """Per-tenant social monitoring configuration."""
    __tablename__ = "social_monitor_configs"
    __table_args__ = (UniqueConstraint("tenant_id", "platform", "target_type", "target_value", name="uq_monitor_target"),)

    id: Mapped[str] = mapped_column(String(64), primary_key=True, default=lambda: new_id("smc"))
    tenant_id: Mapped[str] = mapped_column(ForeignKey("tenants.id", ondelete="CASCADE"), index=True, nullable=False)
    platform: Mapped[str] = mapped_column(String(32), index=True, nullable=False)  # x, email, threads
    target_type: Mapped[str] = mapped_column(String(32), nullable=False)  # mention, hashtag, keyword, inbox
    target_value: Mapped[str] = mapped_column(String(512), nullable=False)  # @handle, #tag, keyword, email
    label: Mapped[str | None] = mapped_column(String(255))
    active: Mapped[bool] = mapped_column(Boolean, default=True, nullable=False)
    last_polled_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))
    poll_cursor: Mapped[str | None] = mapped_column(String(512))  # platform-specific pagination cursor
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=utcnow, nullable=False)


# ── Social Mention ────────────────────────────────────────────
class SocialMention(Base):
    """Raw social media mentions with NLP complaint classification."""
    __tablename__ = "social_mentions"

    id: Mapped[str] = mapped_column(String(64), primary_key=True, default=lambda: new_id("sm"))
    tenant_id: Mapped[str] = mapped_column(ForeignKey("tenants.id", ondelete="CASCADE"), index=True, nullable=False)
    monitor_config_id: Mapped[str] = mapped_column(ForeignKey("social_monitor_configs.id", ondelete="CASCADE"), index=True, nullable=False)
    platform: Mapped[str] = mapped_column(String(32), index=True, nullable=False)
    external_id: Mapped[str] = mapped_column(String(512), index=True, nullable=False)
    author_handle: Mapped[str] = mapped_column(String(512), nullable=False)
    author_name: Mapped[str | None] = mapped_column(String(255))
    content: Mapped[str] = mapped_column(Text, nullable=False)
    content_url: Mapped[str | None] = mapped_column(String(1024))
    # NLP Classification
    is_complaint: Mapped[bool] = mapped_column(Boolean, default=False, nullable=False)
    complaint_confidence: Mapped[float] = mapped_column(Float, default=0.0, nullable=False)
    complaint_category: Mapped[str | None] = mapped_column(String(128))
    sentiment: Mapped[str] = mapped_column(String(64), default="neutral", nullable=False)
    sentiment_score: Mapped[float] = mapped_column(Float, default=0.0, nullable=False)
    nlp_summary: Mapped[str | None] = mapped_column(Text)
    detected_language: Mapped[str] = mapped_column(String(8), default="en", nullable=False)
    # Ticket promotion
    promoted_to_ticket_id: Mapped[str | None] = mapped_column(ForeignKey("tickets.id", ondelete="SET NULL"), index=True)
    promoted_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))
    promoted_by: Mapped[str | None] = mapped_column(ForeignKey("users.id", ondelete="SET NULL"))
    # Metadata
    raw_metadata: Mapped[dict] = mapped_column(JSON, default=dict, nullable=False)
    captured_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=utcnow, index=True, nullable=False)


# ── Ticket Message (private resolution thread) ──────────────────
class TicketMessage(Base):
    """Private threaded messages between agent and customer for a single ticket."""
    __tablename__ = "ticket_messages"

    id: Mapped[str] = mapped_column(String(64), primary_key=True, default=lambda: new_id("msg"))
    ticket_id: Mapped[str] = mapped_column(ForeignKey("tickets.id", ondelete="CASCADE"), index=True, nullable=False)
    tenant_id: Mapped[str] = mapped_column(String(64), index=True, nullable=False)
    # sender_role: "agent" | "customer" | "system"
    sender_role: Mapped[str] = mapped_column(String(16), nullable=False)
    sender_name: Mapped[str] = mapped_column(String(255), default="Unknown", nullable=False)
    content: Mapped[str] = mapped_column(Text, nullable=False)
    # is_internal: True = only agents see it (internal note)
    is_internal: Mapped[bool] = mapped_column(Boolean, default=False, nullable=False)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=utcnow, index=True, nullable=False)
