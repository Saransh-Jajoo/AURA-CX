/* ═══════════════════════════════════════════════════════════
   AURA-CX — Canonical TypeScript Interfaces
   Eliminates all `any` types across the frontend.
   ═══════════════════════════════════════════════════════════ */

// ── Ticket / Live Feed ───────────────────────────────────────
export type TicketStatus = "new" | "in_progress" | "awaiting_reply" | "resolved" | "escalated";

export interface Ticket {
  id: string;
  tenant_id?: string;
  profile_id?: string | null;
  channel: "x" | "reddit" | "gmail" | "whatsapp";
  customer_name: string;
  customer_handle: string;
  message: string;
  severity: "critical" | "high" | "medium" | "low";
  intent: string;
  sentiment: string;
  sentiment_score: number;
  confidence: number;
  product: string;
  timestamp: string;
  status?: TicketStatus;
  pii_scrubbed?: boolean;
  ai_draft?: string | null;
  ai_tags?: string[];
}

// ── KPI Metrics ──────────────────────────────────────────────
export interface KPIMetrics {
  frt_seconds: number;
  automation_rate: number;
  active_tickets: number;
  resolved_today: number;
  csat_score: number;
  ai_confidence_avg: number;
  escalated?: number;
  channels_active?: number;
  shadow_tickets_active?: number;
  high_risk_churn?: number;
  pipeline_latency_ms?: number;
  throughput_per_min?: number;
}

// ── HITL Queue Item ──────────────────────────────────────────
export interface HITLItem {
  id: string;
  channel: "x" | "reddit" | "gmail" | "whatsapp";
  customer_name: string;
  customer_handle: string;
  message: string;
  severity: "critical" | "high" | "medium" | "low";
  intent: string;
  sentiment: string;
  sentiment_score: number;
  confidence: number;
  product: string;
  ai_draft: string;
  auto_approvable: boolean;
  requires_senior_review: boolean;
  rag_sources: string[];
  timestamp: string;
}

// ── Golden Profile ───────────────────────────────────────────
export interface GoldenProfile {
  id: string;
  name: string;
  email: string | null;
  x_handle: string | null;
  reddit_handle: string | null;
  plan: string | null;
  ltv: number;
  churn_risk: number;
  churn_alert: boolean;
  tags: string[];
  identity_resolution: {
    cosine_similarity: number;
    x_vector: number[];
    email_vector: number[];
    method: string;
  };
  sentiment_velocity: { timestamp: string; score: number }[];
  interactions: ProfileInteraction[];
}

export interface ProfileInteraction {
  channel: "x" | "reddit" | "gmail" | "whatsapp";
  handle: string;
  message: string;
  sentiment: string;
  timestamp: string;
}

export interface ProfileSummary {
  id: string;
  name: string;
  email: string | null;
  x_handle?: string | null;
  reddit_handle?: string | null;
  ltv?: number;
  plan?: string | null;
  tags?: string[];
  total_tickets?: number;
  churn_risk?: number;
  churn_alert: boolean;
}

// ── Analytics / Clusters ─────────────────────────────────────
export interface ClusterData {
  id: string;
  label: string;
  x: number;
  y: number;
  z?: number;
  size: number;
  growth_rate: number;
  affected_product: string;
  is_anomaly: boolean;
  ticket_count?: number;
}

export interface TrendPoint {
  hour: string;
  x_volume: number;
  reddit_volume: number;
  gmail_volume: number;
  critical_count: number;
  avg_sentiment: number;
}

// ── Shadow Tickets ───────────────────────────────────────────
export interface ShadowTicket {
  id: string;
  title: string;
  description: string;
  severity: "critical" | "high" | "medium" | "low";
  status: "active" | "monitoring" | "investigating";
  affected_product: string;
  ticket_count: number;
  growth_rate: number;
}

// ── AI Draft Response ────────────────────────────────────────
export interface AIDraftResponse {
  draft: string;
  confidence: number;
  auto_approvable: boolean;
  rag_sources: string[];
}

// ── RLHF Signal ──────────────────────────────────────────────
export interface RLHFSignal {
  ticket_id: string;
  signal_type: "positive" | "corrective" | "escalated";
  original_draft: string;
  edited_draft?: string;
}

export interface RLHFResponse {
  ticket_id: string;
  signal_type: string;
  recorded: boolean;
  pipeline_stage: string;
  message: string;
}

// ── WebSocket Messages ───────────────────────────────────────
export type WSMessage =
  | { type: "ticket_batch"; tickets: Ticket[] }
  | { type: "new_ticket"; ticket: Ticket }
  | { type: "ticket_updated"; ticket: Ticket }
  | { type: "kpi_update"; kpis: KPIMetrics }
  | { type: "pong" };

// ═══════════════════════════════════════════════════════════
// ENTERPRISE EXTENSION TYPES
// ═══════════════════════════════════════════════════════════

// ── SLA ──────────────────────────────────────────────────────
export interface SLAStatus {
  status: "on_track" | "warning" | "breached" | "no_sla";
  remaining_seconds: number;
  percent_elapsed: number;
  breached: boolean;
  deadline?: string;
  priority: string;
  escalation_level: number;
}

export interface SLAHeatmapItem extends SLAStatus {
  ticket_id: string;
  severity: string;
  channel: string;
  customer: string;
}

// ── Knowledge Base ───────────────────────────────────────────
export interface KBDocument {
  id: string;
  title: string;
  category: string;
  doc_type: string;
  status: "active" | "archived" | "deprecated";
  version: number;
  source_uri?: string | null;
  file_type?: string | null;
  file_size_bytes?: number | null;
  chunk_count: number;
  last_indexed_at?: string | null;
  created_at: string;
  updated_at: string;
  body?: string;
  source_metadata?: Record<string, unknown>;
}

export interface KBGap {
  id: string;
  query: string;
  ai_confidence: number;
  suggested_topic?: string | null;
  resolved: boolean;
  ticket_id?: string | null;
  created_at: string;
}

// ── Team Management ─────────────────────────────────────────
export interface TeamMember {
  id: string;
  email: string;
  name: string;
  role: string;
  active: boolean;
  department?: string | null;
  avatar: string;
  language: string;
  last_login?: string | null;
  created_at: string;
}

export interface TeamInvitation {
  id: string;
  email: string;
  role: string;
  accepted: boolean;
  token?: string | null;
  expires_at: string;
  created_at: string;
}

// ── Voice / Call Recordings ─────────────────────────────────
export interface CallRecording {
  id: string;
  caller_number: string;
  call_sid?: string | null;
  duration_seconds: number;
  status: "active" | "completed" | "failed";
  direction: "inbound" | "outbound";
  detected_language: string;
  sentiment_score: number;
  complaint_registered: boolean;
  resolution_attempted: boolean;
  ticket_id?: string | null;
  profile_id?: string | null;
  ai_summary?: string | null;
  transcript_length: number;
  transcript?: { timestamp: string; speaker: string; text: string }[];
  started_at: string;
  ended_at?: string | null;
}

export interface VoiceAnalytics {
  total_calls: number;
  avg_duration_seconds: number;
  avg_sentiment: number;
  complaints_registered: number;
  complaint_rate: number;
}

// ── BYOI / Settings ─────────────────────────────────────────
export interface BYOIServiceStatus {
  active: boolean;
  masked_key?: string;
  host?: string;
  port?: number;
  phone?: string;
  provider?: string;
  bucket?: string;
  count?: number;
}

export interface BYOIStatus {
  configured: boolean;
  services: Record<string, BYOIServiceStatus>;
  brand_tone_set?: boolean;
  brand_examples_count?: number;
  updated_at?: string;
}

export interface TenantSettings {
  id: string;
  name: string;
  plan: string;
  domain?: string | null;
  industry?: string | null;
  logo_url?: string | null;
  default_language: string;
  sla_config: Record<string, number>;
  onboarding_complete: boolean;
  created_at: string;
}

// ── Compliance / Audit ──────────────────────────────────────
export interface AuditEvent {
  id: string;
  action: string;
  resource_type: string;
  resource_id?: string | null;
  user_id?: string | null;
  details: Record<string, unknown>;
  previous_state?: Record<string, unknown> | null;
  new_state?: Record<string, unknown> | null;
  reason?: string | null;
  ip_address?: string | null;
  timestamp: string;
}

// ── Campaign Triggers ───────────────────────────────────────
export interface CampaignTrigger {
  id: string;
  trigger_type: string;
  action_type: string;
  suggested_action?: string | null;
  status: "pending" | "approved" | "rejected" | "executed";
  ticket_id?: string | null;
  profile_id?: string | null;
  created_at: string;
}
