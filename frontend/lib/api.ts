import type {
  AIDraftResponse,
  AgentPerformance,
  AIRecommendation,
  CategoryData,
  ClusterData,
  CSATTrend,
  CustomerThreadState,
  GoldenProfile,
  HITLItem,
  KPIMetrics,
  PrivateChannel,
  ProfileSummary,
  ResolutionTimeData,
  RLHFResponse,
  RLHFSignal,
  ShadowTicket,
  SLACompliance,
  Ticket,
  ThreadState,
  TrendPoint,
} from "./types";

const API_BASE = typeof window !== "undefined"
  ? (window.location.hostname === "localhost" || window.location.hostname === "127.0.0.1" ? "http://localhost:8000" : "")
  : "http://backend:8000";

function getToken(): string | null {
  if (typeof window === "undefined") return null;
  return localStorage.getItem("aura_token");
}

function headers(): HeadersInit {
  const h: HeadersInit = { "Content-Type": "application/json" };
  const token = getToken();
  if (token) h.Authorization = `Bearer ${token}`;
  return h;
}

async function request<T>(path: string, opts?: RequestInit): Promise<T> {
  const res = await fetch(`${API_BASE}${path}`, {
    ...opts,
    headers: { ...headers(), ...(opts?.headers || {}) },
  });
  if (!res.ok) {
    const err = await res.json().catch(() => ({ detail: "Request failed" }));
    throw new Error(err.detail || `HTTP ${res.status}`);
  }
  return res.json();
}

export async function fetchTickets(): Promise<{ tickets: Ticket[]; total: number }> {
  return request("/api/v1/tickets");
}

export async function fetchKPIs(): Promise<KPIMetrics> {
  return request("/api/v1/tickets/kpi");
}

export async function fetchHITLQueue(): Promise<{ queue: HITLItem[]; total: number }> {
  return request("/api/v1/tickets/hitl");
}

export async function approveTicket(id: string) {
  return request(`/api/v1/tickets/${id}/approve`, { method: "POST" });
}

export async function escalateTicket(id: string) {
  return request(`/api/v1/tickets/${id}/escalate`, { method: "POST" });
}

export async function draftTicket(id: string): Promise<AIDraftResponse> {
  return request(`/api/v1/tickets/${id}/draft`, { method: "POST" });
}

export async function editTicketWithRLHF(id: string, signal: RLHFSignal): Promise<RLHFResponse> {
  return request(`/api/v1/tickets/${id}/edit`, {
    method: "POST",
    body: JSON.stringify(signal),
  });
}

export async function createHandoffLink(id: string, channel: "whatsapp" | "chatbot") {
  return request<{ deep_link: string; expires_at: number; channel: string }>(`/api/v1/tickets/${id}/handoff`, {
    method: "POST",
    body: JSON.stringify({ channel }),
  });
}

export async function generateAIDraft(ticketData: {
  channel: string;
  customer_name: string;
  message: string;
  product: string;
}): Promise<AIDraftResponse> {
  return request("/api/v1/ai/draft", {
    method: "POST",
    body: JSON.stringify(ticketData),
  });
}

export async function sendRLHFSignal(signal: RLHFSignal): Promise<RLHFResponse> {
  return request("/api/v1/ai/rlhf", {
    method: "POST",
    body: JSON.stringify(signal),
  });
}

export async function fetchProfiles(): Promise<{ profiles: ProfileSummary[]; total: number }> {
  return request("/api/v1/profiles");
}

export async function fetchProfile(id: string): Promise<GoldenProfile> {
  return request(`/api/v1/profiles/${id}`);
}

export async function fetchClusters(): Promise<{ clusters: ClusterData[]; total: number; anomalies: number }> {
  return request("/api/v1/analytics/clusters");
}

export async function fetchShadowTickets(): Promise<{ shadow_tickets: ShadowTicket[]; total: number }> {
  return request("/api/v1/analytics/shadow-tickets");
}

export async function fetchTrends(
  period: "24h" | "7d" | "30d" = "24h"
): Promise<{ timeseries: TrendPoint[] }> {
  return request(`/api/v1/analytics/trends?period=${period}`);
}

export async function fetchTenants(): Promise<{ tenants: Array<{ id: string; name: string; plan: string; agents: number; status: string }>; total: number }> {
  return request("/api/v1/tenants");
}

export function getWSUrl(): string {
  const token = getToken();
  const wsBase = API_BASE.replace(/^http/, "ws");
  const query = token ? `?token=${encodeURIComponent(token)}` : "";
  return `${wsBase}/ws/live-feed${query}`;
}


// ═══════════════════════════════════════════════════════════
// ENTERPRISE API FUNCTIONS
// ═══════════════════════════════════════════════════════════

// ── Team Management ─────────────────────────────────────────
export async function fetchTeamMembers() {
  return request<{ members: import("./types").TeamMember[]; total: number }>("/api/v1/team/members");
}

export async function inviteTeamMember(data: { email: string; role: string; name?: string }) {
  return request<{ status: string; invitation_id: string; token: string; invite_link: string }>("/api/v1/team/invite", {
    method: "POST",
    body: JSON.stringify(data),
  });
}

export async function fetchTeamInvitations() {
  return request<{ invitations: import("./types").TeamInvitation[]; total: number }>("/api/v1/team/invitations");
}

export async function updateTeamMember(userId: string, data: { name?: string; role?: string; active?: boolean; department?: string }) {
  return request(`/api/v1/team/members/${userId}`, {
    method: "PATCH",
    body: JSON.stringify(data),
  });
}

export async function suspendTeamMember(userId: string) {
  return request(`/api/v1/team/members/${userId}`, { method: "DELETE" });
}

// ── Knowledge Base ──────────────────────────────────────────
export async function fetchKBDocuments(params?: { category?: string; status?: string }) {
  const qs = new URLSearchParams(params as Record<string, string>).toString();
  return request<{ documents: import("./types").KBDocument[]; total: number; categories: Record<string, number> }>(
    `/api/v1/knowledge${qs ? `?${qs}` : ""}`
  );
}

export async function createKBDocument(data: { title: string; body: string; category?: string; doc_type?: string }) {
  return request<{ status: string; document: import("./types").KBDocument }>("/api/v1/knowledge", {
    method: "POST",
    body: JSON.stringify(data),
  });
}

export async function updateKBDocument(docId: string, data: { title?: string; body?: string; category?: string; status?: string }) {
  return request(`/api/v1/knowledge/${docId}`, {
    method: "PATCH",
    body: JSON.stringify(data),
  });
}

export async function archiveKBDocument(docId: string) {
  return request(`/api/v1/knowledge/${docId}`, { method: "DELETE" });
}

export async function fetchKBGaps(resolved?: boolean) {
  const qs = resolved !== undefined ? `?resolved=${resolved}` : "";
  return request<{ gaps: import("./types").KBGap[]; total: number; unresolved_count: number }>(
    `/api/v1/knowledge/gaps/analytics${qs}`
  );
}

// ── Settings / BYOI ─────────────────────────────────────────
export async function fetchTenantSettings() {
  return request<{ tenant: import("./types").TenantSettings; byoi: import("./types").BYOIStatus }>("/api/v1/settings");
}

export async function updateTenantSettings(data: Record<string, unknown>) {
  return request("/api/v1/settings", {
    method: "PATCH",
    body: JSON.stringify(data),
  });
}

export async function updateBYOIConfig(data: Record<string, unknown>) {
  return request("/api/v1/settings/byoi", {
    method: "PUT",
    body: JSON.stringify(data),
  });
}

export async function fetchPlatformConnections() {
  return request<{ platforms: import("./types").PlatformConnections }>("/api/v1/settings/platforms");
}

export async function updatePlatformConnection(data: Record<string, unknown>) {
  return request<{ status: string; platforms: import("./types").PlatformConnections; changed_platforms: string[] }>(
    "/api/v1/settings/platforms",
    { method: "PUT", body: JSON.stringify(data) }
  );
}

// ── Voice / Call Recordings ─────────────────────────────────
export async function fetchCalls(params?: { status?: string }) {
  const qs = params?.status ? `?status=${params.status}` : "";
  return request<{ calls: import("./types").CallRecording[]; total: number }>(`/api/v1/voice/calls${qs}`);
}

export async function fetchCallDetail(callId: string) {
  return request<import("./types").CallRecording>(`/api/v1/voice/calls/${callId}`);
}

export async function fetchVoiceAnalytics() {
  return request<import("./types").VoiceAnalytics>("/api/v1/voice/analytics");
}

// ── Compliance / Audit ──────────────────────────────────────
export async function fetchAuditTrail(params?: { resource_type?: string; action?: string; limit?: number }) {
  const qs = new URLSearchParams(params as Record<string, string>).toString();
  return request<{ events: import("./types").AuditEvent[]; total: number }>(
    `/api/v1/compliance/audit-trail${qs ? `?${qs}` : ""}`
  );
}

export async function fetchComplianceSummary() {
  return request<{
    total_events: number;
    action_breakdown: Record<string, number>;
    resource_breakdown: Record<string, number>;
    compliance_standards: string[];
  }>("/api/v1/compliance/summary");
}

export async function exportAuditData(format: string = "json") {
  return request(`/api/v1/compliance/export?format=${format}`);
}

// ── Private Resolution Thread API ────────────────────────────

export async function handoffToPrivateChannel(
  ticketId: string,
  data: {
    channel: PrivateChannel;
    address: string;
    customer_name?: string;
    intro_message?: string;
  }
) {
  return request<{ status: string; channel: string; chat_url: string; token: string }>(
    `/api/v1/tickets/${ticketId}/handoff-private`,
    { method: "POST", body: JSON.stringify(data) }
  );
}

export async function fetchTicketMessages(ticketId: string): Promise<ThreadState> {
  return request<ThreadState>(`/api/v1/tickets/${ticketId}/messages`);
}

export async function sendAgentMessage(
  ticketId: string,
  content: string,
  isInternal = false
) {
  return request<{ status: string; message: import("./types").TicketMessage }>(
    `/api/v1/tickets/${ticketId}/messages`,
    { method: "POST", body: JSON.stringify({ content, is_internal: isInternal }) }
  );
}

export async function resolveTicketWithNote(
  ticketId: string,
  resolutionNote: string,
  notifyCustomer = true
) {
  return request<{ status: string; resolved_at: string; resolution_note: string }>(
    `/api/v1/tickets/${ticketId}/resolve`,
    { method: "POST", body: JSON.stringify({ resolution_note: resolutionNote, notify_customer: notifyCustomer }) }
  );
}

// Public (no auth) — customer-facing
export async function fetchCustomerThread(token: string): Promise<CustomerThreadState> {
  const res = await fetch(`${API_BASE}/api/v1/resolve/${token}`);
  if (!res.ok) throw new Error("Thread not found");
  return res.json();
}

export async function customerSendMessage(
  token: string,
  content: string,
  senderName?: string
) {
  const res = await fetch(`${API_BASE}/api/v1/resolve/${token}/message`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ content, sender_name: senderName }),
  });
  if (!res.ok) throw new Error("Failed to send message");
  return res.json();
}

export async function submitCSAT(token: string, score: number, comment = "") {
  const res = await fetch(`${API_BASE}/api/v1/resolve/${token}/csat`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ score, comment }),
  });
  if (!res.ok) throw new Error("Failed to submit CSAT");
  return res.json();
}

// ── Analytics Intelligence API ───────────────────────────────

export async function fetchCategories(
  period: "24h" | "7d" | "30d" | "90d" = "7d"
): Promise<{ categories: CategoryData[]; total: number; period: string }> {
  return request(`/api/v1/analytics/categories?period=${period}`);
}

export async function fetchResolutionTime(
  period: "7d" | "30d" | "90d" = "7d"
): Promise<ResolutionTimeData> {
  return request(`/api/v1/analytics/resolution-time?period=${period}`);
}

export async function fetchCSATTrend(
  period: "7d" | "30d" | "90d" = "30d"
): Promise<CSATTrend> {
  return request(`/api/v1/analytics/csat-trend?period=${period}`);
}

export async function fetchSLACompliance(
  period: "7d" | "30d" | "90d" = "7d"
): Promise<SLACompliance> {
  return request(`/api/v1/analytics/sla?period=${period}`);
}

export async function fetchAgentPerformance(
  period: "7d" | "30d" | "90d" = "7d"
): Promise<{ agents: AgentPerformance[]; period: string }> {
  return request(`/api/v1/analytics/agents?period=${period}`);
}

export async function fetchRecommendations(): Promise<{
  recommendations: AIRecommendation[];
  source: string;
  data_points: number;
}> {
  return request("/api/v1/analytics/recommendations");
}

