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

