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
