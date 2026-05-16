"use client";

import React, { useState, useEffect, useCallback, useRef } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { cn } from "@/lib/utils";
import type { Ticket, GoldenProfile, TicketStatus } from "@/lib/types";
import { AuraWebSocket } from "@/lib/websocket";
import {
  fetchProfile,
  fetchTickets,
  fetchKPIs,
  generateAIDraft,
  approveTicket,
  editTicketWithRLHF,
  createHandoffLink,
} from "@/lib/api";
import { useLiveFeedStore } from "@/lib/live-feed-store";
import { GoldenProfileStitching } from "@/components/golden-profile-stitching";
import { SentimentGauge } from "@/components/sentiment-gauge";
import { ChannelBadge, getChannelLabel } from "@/components/channel-icons";
import {
  Search, Filter, Plus, MoreHorizontal, X,
  Clock, Zap, Activity, CheckCircle, Users, Shield,
  ArrowUpRight, ArrowDownRight, Wifi, WifiOff,
  Edit3, Send, RotateCcw, Sparkles,
  MessageCircle, Bot, Timer, Phone, Brain, FileCheck,
} from "lucide-react";
import { fetchVoiceAnalytics, fetchKBGaps, fetchComplianceSummary } from "@/lib/api";

/* ── Severity Styles ────────────────────────────────────── */
const SEVERITY_CLASSES: Record<string, string> = {
  critical: "badge-critical",
  high: "badge-high",
  medium: "badge-medium",
  low: "badge-low",
};

/* ── Kanban Columns ────────────────────────────────────────── */
interface KanbanColumn {
  id: TicketStatus;
  label: string;
}

const KANBAN_COLUMNS: KanbanColumn[] = [
  { id: "new", label: "New" },
  { id: "in_progress", label: "In Progress" },
  { id: "awaiting_reply", label: "Awaiting Reply" },
  { id: "resolved", label: "Resolved" },
];

/* ── Confidence Gauge (inline) ─────────────────────────────── */
function ConfidenceRing({ value, size = 36 }: { value: number; size?: number }) {
  const r = size / 2 - 3;
  const c = 2 * Math.PI * r;
  const color =
    value > 0.85 ? "var(--accent-emerald)" :
    value > 0.7  ? "var(--accent-amber)"   :
                    "var(--accent-rose)";
  return (
    <div className="relative inline-flex items-center justify-center" style={{ width: size, height: size }}>
      <svg width={size} height={size} className="-rotate-90">
        <circle cx={size / 2} cy={size / 2} r={r} fill="none" stroke="var(--border-subtle)" strokeWidth={2} />
        <circle
          cx={size / 2} cy={size / 2} r={r} fill="none" stroke={color} strokeWidth={2}
          strokeDasharray={c} strokeDashoffset={c - value * c}
          strokeLinecap="round"
          className="transition-all duration-700"
        />
      </svg>
      <span className="absolute text-[9px] font-bold font-mono" style={{ color }}>
        {(value * 100).toFixed(0)}
      </span>
    </div>
  );
}

/* ── KPI Card ──────────────────────────────────────────────── */
function KPICard({ label, value, target, icon: Icon, color, trend }: {
  label: string; value: string; target?: string;
  icon: React.ComponentType<{ className?: string; style?: React.CSSProperties }>;
  color: string; trend?: "up" | "down";
}) {
  return (
    <motion.div
      initial={{ opacity: 0, y: 8 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.4 }}
      className="glass-card p-4 flex items-center gap-4 group hover:shadow-lg transition-shadow"
    >
      <div
        className="w-10 h-10 rounded-[var(--radius-md)] flex items-center justify-center shrink-0 transition-transform group-hover:scale-105"
        style={{ background: `color-mix(in srgb, ${color} 12%, transparent)` }}
      >
        <Icon className="w-5 h-5" style={{ color }} />
      </div>
      <div className="flex-1 min-w-0">
        <p className="text-[11px] text-[var(--text-muted)] font-medium uppercase tracking-wider">{label}</p>
        <div className="flex items-center gap-2">
          <p className="text-lg font-bold font-display">{value}</p>
          {trend && (
            <span className={cn(
              "flex items-center text-[10px] font-semibold",
              trend === "up" ? "text-[var(--accent-emerald)]" : "text-[var(--accent-rose)]"
            )}>
              {trend === "up" ? <ArrowUpRight className="w-3 h-3" /> : <ArrowDownRight className="w-3 h-3" />}
            </span>
          )}
        </div>
        {target && <p className="text-[10px] text-[var(--text-muted)]">Target: {target}</p>}
      </div>
    </motion.div>
  );
}

/* ── Kanban Card ───────────────────────────────────────────── */
function KanbanCard({ ticket, onClick }: { ticket: Ticket; onClick: () => void }) {
  const channelLabel = getChannelLabel(ticket.channel);
  const timestamp = ticket.timestamp ? new Date(ticket.timestamp).toLocaleString() : "";

  return (
    <motion.div
      layout
      initial={{ opacity: 0, y: 6 }}
      animate={{ opacity: 1, y: 0 }}
      exit={{ opacity: 0, scale: 0.96 }}
      onClick={onClick}
      className="kanban-card"
    >
      {/* Channel Header */}
      <div className="flex items-center gap-2 mb-2.5">
        <ChannelBadge channel={ticket.channel} />
        <button title="More options" className="ml-auto text-[var(--text-muted)] hover:text-[var(--text-primary)] transition-colors p-0.5">
          <MoreHorizontal className="w-3.5 h-3.5" />
        </button>
      </div>

      {/* Message Preview */}
      <p className="text-xs text-[var(--text-secondary)] leading-relaxed line-clamp-2 mb-3">
        {ticket.message}
      </p>

      {/* Tags */}
      <div className="flex flex-wrap gap-1.5 mb-3">
        <span className="tag-badge tag-intent">Intent: {ticket.intent}</span>
        <span className={cn("tag-badge", ticket.sentiment_score < -0.3 ? "tag-sentiment-negative" : "tag-sentiment-positive")}>
          Sentiment: {ticket.sentiment_score < -0.3 ? "Negative" : ticket.sentiment_score > 0.3 ? "Positive" : "Neutral"}
        </span>
        <span className="tag-badge tag-severity">Severity: {ticket.severity?.charAt(0).toUpperCase() + ticket.severity?.slice(1)}</span>
        {ticket.channel !== "gmail" && ticket.channel !== "whatsapp" && (
          <span className="tag-badge tag-platform">Platform: {channelLabel}</span>
        )}
        {ticket.pii_scrubbed !== false && (
          <span className="tag-badge tag-gdpr">GDPR PII Scrubbed</span>
        )}
      </div>

      {/* Footer */}
      <div className="flex items-center justify-between text-[10px] text-[var(--text-muted)]">
        <span className="font-mono">Ticket ID: {ticket.id?.replace("TKT-", "")}</span>
        <div className="flex items-center gap-1.5">
          <span>{ticket.customer_handle}</span>
        </div>
      </div>
      <div className="text-right mt-1">
        <span className="text-[10px] text-[var(--text-muted)]">{timestamp}</span>
      </div>
    </motion.div>
  );
}

/* ═══════════════════════════════════════════════════════════
   COMMAND CENTER — Kanban Board + Detail Panel
   Matches mockup: 4-column Kanban + slide-over HITL view
   ═══════════════════════════════════════════════════════════ */
export default function CommandCenterPage() {
  const tickets = useLiveFeedStore((state) => state.tickets);
  const kpis = useLiveFeedStore((state) => state.kpis);
  const connectionState = useLiveFeedStore((state) => state.connectionState);
  const setTickets = useLiveFeedStore((state) => state.setTickets);
  const setKpis = useLiveFeedStore((state) => state.setKpis);
  const setConnectionState = useLiveFeedStore((state) => state.setConnectionState);
  const applyMessage = useLiveFeedStore((state) => state.applyMessage);
  const connected = connectionState === "connected";
  const [search, setSearch] = useState("");
  const wsRef = useRef<AuraWebSocket | null>(null);

  // Enterprise pulse state
  const [voiceCount, setVoiceCount] = useState<number | null>(null);
  const [kbGapCount, setKbGapCount] = useState<number | null>(null);
  const [auditCount, setAuditCount] = useState<number | null>(null);

  // Detail panel state
  const [selectedTicket, setSelectedTicket] = useState<Ticket | null>(null);
  const [detailProfile, setDetailProfile] = useState<GoldenProfile | null>(null);
  const [detailDraft, setDetailDraft] = useState("");
  const [detailEditing, setDetailEditing] = useState(false);
  const [detailLoading, setDetailLoading] = useState(false);
  const [actionLoading, setActionLoading] = useState<string | null>(null);

  useEffect(() => {
    fetchTickets().then((d) => {
      setTickets(d.tickets || []);
    }).catch(() => {});
    fetchKPIs().then(setKpis).catch(() => {});

    // Enterprise data
    fetchVoiceAnalytics().then(v => setVoiceCount(v.total_calls)).catch(() => {});
    fetchKBGaps(false).then(g => setKbGapCount(g.unresolved_count)).catch(() => {});
    fetchComplianceSummary().then(c => setAuditCount(c.total_events)).catch(() => {});
  }, [setKpis, setTickets]);

  useEffect(() => {
    const ws = new AuraWebSocket();
    wsRef.current = ws;

    ws.onStateChange(setConnectionState);
    ws.onMessage(applyMessage);

    ws.connect();
    return () => ws.destroy();
  }, [applyMessage, setConnectionState]);

  // Open ticket detail panel
  const openTicketDetail = useCallback(async (ticket: Ticket) => {
    setSelectedTicket(ticket);
    setDetailEditing(false);
    setDetailLoading(true);
    setDetailDraft(ticket.ai_draft || "");

    try {
      const profile = await fetchProfile(ticket.id);
      setDetailProfile(profile);
    } catch {
      setDetailProfile(null);
    }

    if (!ticket.ai_draft) {
      try {
        const draft = await generateAIDraft({
          channel: ticket.channel,
          customer_name: ticket.customer_name,
          message: ticket.message,
          product: ticket.product,
        });
        setDetailDraft(draft.draft);
      } catch {
        setDetailDraft("");
      }
    }

    setDetailLoading(false);
  }, []);

  // HITL Actions
  const handleApprove = async () => {
    if (!selectedTicket) return;
    setActionLoading("approve");
    try {
      await approveTicket(selectedTicket.id);
      applyMessage({ type: "ticket_updated", ticket: { ...selectedTicket, status: "resolved" as TicketStatus, ai_draft: detailDraft } });
      setSelectedTicket(null);
    } finally {
      setActionLoading(null);
    }
  };

  const handleEditSend = async () => {
    if (!selectedTicket) return;
    setActionLoading("edit");
    try {
      await editTicketWithRLHF(selectedTicket.id, {
        ticket_id: selectedTicket.id,
        signal_type: "corrective",
        original_draft: selectedTicket.ai_draft || "",
        edited_draft: detailDraft,
      });
      applyMessage({ type: "ticket_updated", ticket: { ...selectedTicket, status: "resolved" as TicketStatus, ai_draft: detailDraft } });
      setSelectedTicket(null);
    } finally {
      setActionLoading(null);
    }
  };

  // Filter tickets
  const filtered = tickets.filter((t) =>
    !search ||
    t.customer_name?.toLowerCase().includes(search.toLowerCase()) ||
    t.message?.toLowerCase().includes(search.toLowerCase()) ||
    t.product?.toLowerCase().includes(search.toLowerCase()) ||
    t.id?.toLowerCase().includes(search.toLowerCase())
  );

  // Group tickets by status for Kanban
  const grouped: Record<TicketStatus, Ticket[]> = {
    new: [],
    in_progress: [],
    awaiting_reply: [],
    resolved: [],
    escalated: [],
  };
  filtered.forEach((t) => {
    const status = (t.status as TicketStatus) || "new";
    if (grouped[status]) grouped[status].push(t);
    else grouped.new.push(t);
  });

  return (
    <div className="space-y-5">
      {/* ── Header ──────────────────────────────────────── */}
      <div className="flex items-center justify-between flex-wrap gap-4">
        <div className="flex items-center gap-3">
          <h1 className="text-xl font-bold font-display">Incoming customer tickets</h1>
          <div className="flex items-center gap-2 px-2.5 py-1 rounded-full bg-[var(--bg-inset)] border border-[var(--border-subtle)]">
            {connected ? (
              <>
                <Wifi className="w-3 h-3 text-[var(--accent-emerald)]" />
                <span className="text-[10px] font-medium text-[var(--accent-emerald)]">Live</span>
              </>
            ) : (
              <>
                <WifiOff className="w-3 h-3 text-[var(--accent-rose)]" />
                <span className="text-[10px] font-medium text-[var(--accent-rose)]">Offline</span>
              </>
            )}
          </div>
        </div>
        <div className="flex items-center gap-2">
          <div className="relative">
            <Search className="w-3.5 h-3.5 absolute left-3 top-1/2 -translate-y-1/2 text-[var(--text-muted)]" />
            <input
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Search"
              className="pl-9 pr-4 py-2 rounded-[var(--radius-md)] bg-[var(--bg-inset)] border border-[var(--border-subtle)] text-sm text-[var(--text-primary)] placeholder:text-[var(--text-muted)] focus:outline-none focus:ring-2 focus:ring-[var(--accent-primary)]/20 w-48 transition-all"
            />
          </div>
          <button className="flex items-center gap-2 px-4 py-2 rounded-[var(--radius-md)] bg-[var(--accent-primary)]/8 border border-[var(--accent-primary)]/20 text-sm font-medium text-[var(--accent-primary)] hover:bg-[var(--accent-primary)]/15 transition-all">
            <Filter className="w-3.5 h-3.5" />
            Filter
          </button>
          <button title="Add ticket" className="p-2 rounded-[var(--radius-md)] bg-[var(--accent-primary)] text-white hover:brightness-110 transition-all shadow-sm">
            <Plus className="w-4 h-4" />
          </button>
        </div>
      </div>

      {/* ── KPI Strip ───────────────────────────────────── */}
      {kpis && (
        <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-3">
          <KPICard label="First Response" value={`${kpis.frt_seconds}s`} target="< 180s" icon={Clock} color="var(--accent-primary)" trend="down" />
          <KPICard label="Automation" value={`${(kpis.automation_rate * 100).toFixed(0)}%`} target="70%" icon={Zap} color="var(--accent-secondary)" trend="up" />
          <KPICard label="Active" value={`${kpis.active_tickets}`} icon={Activity} color="var(--accent-teal)" />
          <KPICard label="Resolved" value={`${kpis.resolved_today}`} icon={CheckCircle} color="var(--accent-emerald)" trend="up" />
          <KPICard label="CSAT" value={`${kpis.csat_score}`} target="4.5" icon={Users} color="var(--accent-amber)" />
          <KPICard label="AI Confidence" value={`${(kpis.ai_confidence_avg * 100).toFixed(0)}%`} icon={Shield} color="var(--accent-secondary)" trend="up" />
        </div>
      )}

      {/* ── Enterprise Pulse Strip ──────────────────────── */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        <motion.div initial={{ opacity: 0, y: 6 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.2 }} className="solid-card p-3 flex items-center gap-3 border-l-2 border-l-[var(--accent-sky)]">
          <Timer className="w-4 h-4 text-[var(--accent-sky)]" />
          <div>
            <p className="text-[10px] text-[var(--text-muted)] font-semibold uppercase">SLA Engine</p>
            <p className="text-sm font-bold text-[var(--accent-sky)]">Active</p>
          </div>
        </motion.div>
        <motion.div initial={{ opacity: 0, y: 6 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.25 }} className="solid-card p-3 flex items-center gap-3 border-l-2 border-l-[var(--accent-secondary)]">
          <Phone className="w-4 h-4 text-[var(--accent-secondary)]" />
          <div>
            <p className="text-[10px] text-[var(--text-muted)] font-semibold uppercase">Voice Calls</p>
            <p className="text-sm font-bold text-[var(--accent-secondary)]">{voiceCount ?? "—"}</p>
          </div>
        </motion.div>
        <motion.div initial={{ opacity: 0, y: 6 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.3 }} className="solid-card p-3 flex items-center gap-3 border-l-2 border-l-[var(--accent-rose)]">
          <Brain className="w-4 h-4 text-[var(--accent-rose)]" />
          <div>
            <p className="text-[10px] text-[var(--text-muted)] font-semibold uppercase">KB Gaps</p>
            <p className="text-sm font-bold text-[var(--accent-rose)]">{kbGapCount ?? "—"}</p>
          </div>
        </motion.div>
        <motion.div initial={{ opacity: 0, y: 6 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.35 }} className="solid-card p-3 flex items-center gap-3 border-l-2 border-l-[var(--accent-emerald)]">
          <FileCheck className="w-4 h-4 text-[var(--accent-emerald)]" />
          <div>
            <p className="text-[10px] text-[var(--text-muted)] font-semibold uppercase">Audit Events</p>
            <p className="text-sm font-bold text-[var(--accent-emerald)]">{auditCount ?? "—"}</p>
          </div>
        </motion.div>
      </div>

      {/* ── Kanban Board ────────────────────────────────── */}
      {tickets.length === 0 ? (
        <div className="glass-card p-12 text-center">
          <p className="text-base font-semibold font-display">Waiting for incoming tickets...</p>
          <p className="text-sm text-[var(--text-muted)] mt-1">Signed X, Reddit, and Gmail webhooks will appear here in real time.</p>
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-4 gap-4 kanban-grid">
          {KANBAN_COLUMNS.map((col) => (
          <div key={col.id} className="kanban-column">
            <div className="kanban-column-header">
              <span>{col.label}</span>
              <div className="flex items-center gap-2">
                <span className="text-[10px] font-mono text-[var(--text-muted)]">
                  {grouped[col.id]?.length || 0}
                </span>
                <button title="Column options" className="text-[var(--text-muted)] hover:text-[var(--text-primary)] transition-colors">
                  <MoreHorizontal className="w-3.5 h-3.5" />
                </button>
              </div>
            </div>
            <div className="flex-1 overflow-y-auto max-h-[600px] pb-2">
              <AnimatePresence>
                {(grouped[col.id] || []).slice(0, 10).map((ticket) => (
                  <KanbanCard
                    key={ticket.id}
                    ticket={ticket}
                    onClick={() => openTicketDetail(ticket)}
                  />
                ))}
              </AnimatePresence>
              {!grouped[col.id]?.length && (
                <p className="text-center text-[11px] text-[var(--text-muted)] py-8">No tickets</p>
              )}
            </div>
          </div>
          ))}
        </div>
      )}

      {/* ── Ticket Detail Slide-Over Panel ─────────────── */}
      <AnimatePresence>
        {selectedTicket && (
          <>
            {/* Backdrop */}
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              className="fixed inset-0 bg-[var(--overlay)] backdrop-blur-sm z-50"
              onClick={() => setSelectedTicket(null)}
            />

            {/* Panel */}
            <motion.div
              initial={{ opacity: 0, x: 60 }}
              animate={{ opacity: 1, x: 0 }}
              exit={{ opacity: 0, x: 60 }}
              transition={{ duration: 0.3, ease: [0.25, 0.1, 0.25, 1] }}
              className="fixed right-0 top-0 bottom-0 w-full max-w-[800px] bg-[var(--bg-secondary)] border-l border-[var(--border-subtle)] z-50 overflow-y-auto shadow-2xl"
            >
              {/* Panel Header */}
              <div className="sticky top-0 z-10 flex items-center justify-between px-6 py-4 border-b border-[var(--border-subtle)] bg-[var(--bg-secondary)]/90 backdrop-blur-xl">
                <div className="flex items-center gap-2">
                  <span className="text-xs font-mono text-[var(--text-muted)]">{selectedTicket.id}</span>
                  <span className={cn("px-2 py-0.5 rounded-full text-[10px] font-semibold uppercase", SEVERITY_CLASSES[selectedTicket.severity])}>
                    {selectedTicket.severity}
                  </span>
                  <ChannelBadge channel={selectedTicket.channel} />
                </div>
                <button
                  onClick={() => setSelectedTicket(null)}
                  title="Close panel"
                  className="p-2 rounded-[var(--radius-sm)] text-[var(--text-muted)] hover:text-[var(--text-primary)] hover:bg-[var(--bg-card-hover)] transition-all"
                >
                  <X className="w-4 h-4" />
                </button>
              </div>

              <div className="p-6 space-y-6">
                {detailLoading ? (
                  <div className="flex flex-col items-center justify-center py-16 gap-3">
                    <div className="w-8 h-8 border-2 border-[var(--accent-primary)] border-t-transparent rounded-full animate-spin" />
                    <p className="text-xs text-[var(--text-muted)]">Loading profile & AI draft…</p>
                  </div>
                ) : (
                  <>
                    {/* ── IDENTITY & ANALYTICS + SENTIMENT ── */}
                    <div className="grid grid-cols-1 lg:grid-cols-2 gap-5">
                      {/* Golden Profile Stitching */}
                      <div className="glass-card p-5">
                        <h3 className="text-[11px] font-semibold text-[var(--text-muted)] uppercase tracking-wider mb-4">
                          Identity & Analytics
                        </h3>
                        {detailProfile ? (
                          <GoldenProfileStitching profile={detailProfile} />
                        ) : (
                          <p className="text-sm text-[var(--text-muted)]">No verified identity match yet.</p>
                        )}
                      </div>

                      {/* Sentiment Velocity Gauge */}
                      <div className="glass-card p-5">
                        <h3 className="text-[11px] font-semibold text-[var(--text-muted)] uppercase tracking-wider mb-3">
                          Sentiment Velocity (V_sent)
                        </h3>
                        <SentimentGauge
                          value={detailProfile ? Math.round(detailProfile.churn_risk * 100) : 50}
                          highRisk={detailProfile?.churn_alert}
                          size={240}
                        />
                      </div>
                    </div>

                    {/* ── HITL ORCHESTRATION ─────────────── */}
                    <div className="space-y-4">
                      <h3 className="text-[11px] font-semibold text-[var(--text-muted)] uppercase tracking-wider">
                        Human-in-the-Loop (HITL) Orchestration
                      </h3>

                      {/* AI Draft Card */}
                      <div className="hitl-response-card">
                        <div className="hitl-response-header">
                          <div className="flex items-center gap-2">
                            <Sparkles className="w-4 h-4 text-[var(--accent-primary)]" />
                            <span>AI-Drafted Hybrid RAG Response</span>
                          </div>
                          <div className="flex items-center gap-3">
                            <span className="text-xs text-[var(--text-muted)] font-normal normal-case tracking-normal">
                              Confidence score:
                            </span>
                            <ConfidenceRing value={selectedTicket.confidence} size={40} />
                            <div className="flex items-center gap-1">
                              <button title="Regenerate draft" className="p-1.5 rounded-[var(--radius-sm)] text-[var(--text-muted)] hover:text-[var(--text-primary)] hover:bg-[var(--bg-card-hover)] transition-all">
                                <RotateCcw className="w-3.5 h-3.5" />
                              </button>
                              <button
                                onClick={() => setDetailEditing(!detailEditing)}
                                title="Edit draft"
                                className="p-1.5 rounded-[var(--radius-sm)] text-[var(--text-muted)] hover:text-[var(--text-primary)] hover:bg-[var(--bg-card-hover)] transition-all"
                              >
                                <Edit3 className="w-3.5 h-3.5" />
                              </button>
                              <button title="More actions" className="p-1.5 rounded-[var(--radius-sm)] text-[var(--text-muted)] hover:text-[var(--text-primary)] hover:bg-[var(--bg-card-hover)] transition-all">
                                <MoreHorizontal className="w-3.5 h-3.5" />
                              </button>
                            </div>
                          </div>
                        </div>

                        <div className="hitl-response-body">
                          {detailEditing ? (
                            <textarea
                              value={detailDraft}
                              onChange={(e) => setDetailDraft(e.target.value)}
                              placeholder="Edit the AI-drafted response..."
                              className="w-full h-40 p-4 rounded-[var(--radius-md)] bg-[var(--bg-primary)] border border-[var(--border-subtle)] text-sm text-[var(--text-primary)] resize-none focus:outline-none focus:ring-2 focus:ring-[var(--accent-primary)]/20 transition-all"
                            />
                          ) : (
                            <div className="space-y-3 text-sm leading-relaxed">
                              <p>Dear Customer response,</p>
                              <p><strong>Problem Acknowledgment:</strong><br />{detailDraft}</p>
                            </div>
                          )}
                        </div>
                      </div>

                      {/* HITL Action Buttons */}
                      <div className="flex items-center gap-3">
                        <button
                          onClick={handleApprove}
                          disabled={actionLoading !== null}
                          className="hitl-btn-approve flex items-center gap-2 flex-1 justify-center"
                        >
                          <Send className="w-4 h-4" />
                          {actionLoading === "approve" ? "Sending…" : "HITL 1-CLICK APPROVE"}
                        </button>
                        {detailEditing ? (
                          <button
                            onClick={handleEditSend}
                            disabled={actionLoading !== null}
                            className="hitl-btn-edit flex items-center gap-2 flex-1 justify-center"
                          >
                            <Edit3 className="w-4 h-4" />
                            {actionLoading === "edit" ? "Sending…" : "SEND EDITED + RLHF"}
                          </button>
                        ) : (
                          <button
                            onClick={() => setDetailEditing(true)}
                            className="hitl-btn-edit flex items-center gap-2 flex-1 justify-center"
                          >
                            <Edit3 className="w-4 h-4" />
                            MANUAL EDIT
                          </button>
                        )}
                      </div>

                      {/* ── Handoff Actions ─────────────────── */}
                      <div className="flex items-center gap-3">
                        <button
                          onClick={async () => {
                            const waLink = (await createHandoffLink(selectedTicket.id, "whatsapp")).deep_link;
                            setDetailDraft(
                              detailDraft + `\n\n---\n📱 Continue on WhatsApp for guided support: ${waLink}`
                            );
                            setDetailEditing(true);
                          }}
                          className="hitl-btn-handoff-wa flex items-center gap-2 flex-1 justify-center"
                        >
                          <MessageCircle className="w-4 h-4" />
                          Handoff to WhatsApp
                        </button>
                        <button
                          onClick={async () => {
                            const chatToken = (await createHandoffLink(selectedTicket.id, "chatbot")).deep_link.replace(/^.*\/chat\//, "");
                            setDetailDraft(
                              detailDraft + `\n\n---\n🤖 Continue with our AI assistant for step-by-step help: ${window.location.origin}/chat/${chatToken}`
                            );
                            setDetailEditing(true);
                          }}
                          className="hitl-btn-handoff-bot flex items-center gap-2 flex-1 justify-center"
                        >
                          <Bot className="w-4 h-4" />
                          Handoff to AI Chatbot
                        </button>
                      </div>
                    </div>
                  </>
                )}
              </div>
            </motion.div>
          </>
        )}
      </AnimatePresence>
    </div>
  );
}
