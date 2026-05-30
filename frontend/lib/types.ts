/* ═══════════════════════════════════════════════════════════
   AURA-CX — Canonical TypeScript Interfaces
   Eliminates all `any` types across the frontend.
   ═══════════════════════════════════════════════════════════ */

// ── Ticket / Live Feed ───────────────────────────────────────
export type TicketStatus = "new" | "in_progress" | "awaiting_reply" | "resolved" | "escalated" | "ignored";
export type KnownChannel = "x" | "reddit" | "gmail" | "whatsapp" | "web_form" | "voice";

export interface Ticket {
  id: string;
  tenant_id?: string;
  profile_id?: string | null;
  channel: KnownChannel | string;
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
  channel: KnownChannel | string;
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
  rag_sources: Array<string | Record<string, unknown>>;
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
  channel: KnownChannel | string;
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
  whatsapp_volume?: number;
  web_form_volume?: number;
  voice_volume?: number;
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
  rag_sources: Array<string | Record<string, unknown>>;
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
  required_fields?: string[];
  missing_fields?: string[];
  masked_key?: string;
  masked_user?: string;
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

// ── Platform Connections ─────────────────────────────────────
export interface XPlatformStatus {
  connected: boolean;
  has_bearer_token: boolean;
  has_oauth: boolean;
  has_user_tokens: boolean;
  masked_bearer: string;
  masked_api_key: string;
}

export interface RedditPlatformStatus {
  connected: boolean;
  has_client_creds: boolean;
  has_account: boolean;
  user_agent: string;
  masked_client_id: string;
}

export interface GmailPlatformStatus {
  connected: boolean;
  imap_host: string;
  imap_port: number;
  masked_user: string;
}

export interface ThreadsPlatformStatus {
  connected: boolean;
  masked_token: string;
}

export interface PlatformConnections {
  x: XPlatformStatus;
  reddit: RedditPlatformStatus;
  gmail: GmailPlatformStatus;
  threads: ThreadsPlatformStatus;
}

export interface DynamicPlatformConnection {
  id: string;
  tenant_id: string;
  platform_name: string;
  platform_slug: string;
  account_identifier: string;
  credential_fields: string[];
  credentials_configured: boolean;
  active: boolean;
  poll_interval_seconds: number;
  last_polled_at?: string | null;
  last_error?: string | null;
  created_at: string;
  updated_at: string;
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

// ── Private Resolution Thread ────────────────────────────────
export type PrivateChannel = "email" | "whatsapp" | "chat";

export interface TicketMessage {
  id: string;
  ticket_id: string;
  sender_role: "agent" | "customer" | "system";
  sender_name: string;
  content: string;
  is_internal: boolean;
  created_at: string;
}

export interface ThreadState {
  ticket_id: string;
  private_channel: PrivateChannel | null;
  private_channel_address: string | null;
  handoff_at: string | null;
  messages: TicketMessage[];
}

export interface CustomerThreadState {
  ticket_id: string;
  status: string;
  channel: PrivateChannel | null;
  complaint_summary: string;
  customer_name: string;
  resolved: boolean;
  resolution_note: string | null;
  csat_collected: boolean;
  messages: TicketMessage[];
}

// ── Analytics Intelligence ───────────────────────────────────
export interface CategoryData {
  name: string;
  count: number;
  prev_count: number;
  change_pct: number;
  avg_sentiment: number;
}

export interface ResolutionTimeData {
  overall_avg_hours: number;
  total_resolved: number;
  by_category: Array<{ name: string; avg_hours: number; count: number }>;
  by_channel: Array<{ name: string; avg_hours: number; count: number }>;
  by_priority: Record<string, number>;
  period: string;
}

export interface CSATTrendPoint {
  date: string;
  avg_score: number | null;
  count: number;
}

export interface CSATTrend {
  timeseries: CSATTrendPoint[];
  overall_avg: number | null;
  total_responses: number;
  response_rate_pct: number;
  period: string;
}

export interface SLAPriority {
  compliant: number;
  breached: number;
  open: number;
  compliance_pct: number;
}

export interface SLACompliance {
  by_priority: Record<string, SLAPriority>;
  period: string;
}

export interface AgentPerformance {
  agent_id: string;
  name: string;
  tickets: number;
  avg_resolution_hours: number;
  avg_csat: number | null;
  escalations: number;
}

export interface AIRecommendation {
  title: string;
  detail: string;
  impact: "high" | "medium" | "low";
  category: string;
}

