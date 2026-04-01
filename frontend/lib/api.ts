const API_BASE = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:8000';

export async function fetchTickets() {
  const res = await fetch(`${API_BASE}/api/v1/tickets`);
  return res.json();
}

export async function fetchKPIs() {
  const res = await fetch(`${API_BASE}/api/v1/tickets/kpi`);
  return res.json();
}

export async function fetchHITLQueue() {
  const res = await fetch(`${API_BASE}/api/v1/tickets/hitl`);
  return res.json();
}

export async function fetchProfiles() {
  const res = await fetch(`${API_BASE}/api/v1/profiles`);
  return res.json();
}

export async function fetchProfile(id: string) {
  const res = await fetch(`${API_BASE}/api/v1/profiles/${id}`);
  return res.json();
}

export async function fetchClusters() {
  const res = await fetch(`${API_BASE}/api/v1/analytics/clusters`);
  return res.json();
}

export async function fetchShadowTickets() {
  const res = await fetch(`${API_BASE}/api/v1/analytics/shadow-tickets`);
  return res.json();
}

export async function fetchTrends() {
  const res = await fetch(`${API_BASE}/api/v1/analytics/trends`);
  return res.json();
}

export async function approveTicket(id: string) {
  const res = await fetch(`${API_BASE}/api/v1/tickets/${id}/approve`, { method: 'POST' });
  return res.json();
}

export async function escalateTicket(id: string) {
  const res = await fetch(`${API_BASE}/api/v1/tickets/${id}/escalate`, { method: 'POST' });
  return res.json();
}

export function getWSUrl() {
  const wsBase = API_BASE.replace('http', 'ws');
  return `${wsBase}/ws/live-feed`;
}
