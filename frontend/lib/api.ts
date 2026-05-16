import type {
  AIDraftResponse,
  ClusterData,
  GoldenProfile,
  HITLItem,
  KPIMetrics,
  ProfileSummary,
  RLHFResponse,
  RLHFSignal,
  ShadowTicket,
  Ticket,
  TrendPoint,
} from "./types";

const API_BASE = process.env.NEXT_PUBLIC_API_URL || "http://localhost:8000";

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

export async function fetchTrends(): Promise<{ timeseries: TrendPoint[] }> {
  return request("/api/v1/analytics/trends");
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
