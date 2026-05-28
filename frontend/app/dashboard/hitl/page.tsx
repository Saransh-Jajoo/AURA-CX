"use client";

import React, { useState, useEffect } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { cn } from "@/lib/utils";
import {
  fetchHITLQueue, approveTicket, escalateTicket,
  editTicketWithRLHF, sendRLHFSignal, fetchProfile,
  generateAIDraft, handoffToPrivateChannel,
} from "@/lib/api";
import type { HITLItem, GoldenProfile } from "@/lib/types";
import { GoldenProfileStitching } from "@/components/golden-profile-stitching";
import { SentimentGauge } from "@/components/sentiment-gauge";
import {
  CheckCircle, XCircle, Edit3, Send, AlertTriangle, BookOpen,
  Zap, ChevronRight, Sparkles, RotateCcw, MoreHorizontal, Copy, Trash2,
  MessageCircle, Loader2, Lock, Mail, X,
} from "lucide-react";
import { ChannelBadge } from "@/components/channel-icons";

/* ── Confidence Ring ──────────────────────────────────────── */
function ConfidenceRing({ value, size = 40 }: { value: number; size?: number }) {
  const r = size / 2 - 3;
  const c = 2 * Math.PI * r;
  const color = value > 0.85 ? "var(--accent-emerald)" : value > 0.7 ? "var(--accent-amber)" : "var(--accent-rose)";
  return (
    <div className="relative inline-flex items-center justify-center" style={{ width: size, height: size }}>
      <svg width={size} height={size} className="-rotate-90">
        <circle cx={size / 2} cy={size / 2} r={r} fill="none" stroke="var(--border-subtle)" strokeWidth={2.5} />
        <motion.circle
          cx={size / 2} cy={size / 2} r={r} fill="none" stroke={color} strokeWidth={2.5}
          strokeDasharray={c} strokeLinecap="round"
          initial={{ strokeDashoffset: c }}
          animate={{ strokeDashoffset: c - value * c }}
          transition={{ duration: 1, ease: "easeOut" }}
        />
      </svg>
      <span className="absolute text-[10px] font-bold font-mono" style={{ color }}>
        {value.toFixed(2)}
      </span>
    </div>
  );
}

/* ── Private Channel Handoff Modal ────────────────────────── */
function PrivateChannelHandoff({ ticketId, customerName }: { ticketId: string; customerName: string }) {
  const [open, setOpen] = React.useState(false);
  const [channel, setChannel] = React.useState<"email" | "whatsapp">("email");
  const [address, setAddress] = React.useState("");
  const [introMessage, setIntroMessage] = React.useState(
    `Hi ${customerName}, we've received your complaint and are looking into it. For your privacy, we'll continue this conversation securely via this private link.`
  );
  const [loading, setLoading] = React.useState(false);
  const [success, setSuccess] = React.useState<string | null>(null);

  const handleSend = async () => {
    if (!address.trim()) return;
    setLoading(true);
    try {
      const res = await handoffToPrivateChannel(ticketId, {
        channel,
        address: address.trim(),
        customer_name: customerName,
        intro_message: introMessage,
      });
      setSuccess(res.chat_url);
    } catch (e: unknown) {
      alert(e instanceof Error ? e.message : "Failed to send");
    } finally {
      setLoading(false);
    }
  };

  return (
    <>
      <button
        onClick={() => setOpen(true)}
        className="w-full flex items-center justify-center gap-2 px-4 py-2.5 rounded-[var(--radius-md)] text-xs font-semibold border border-[var(--accent-primary)]/30 text-[var(--accent-primary)] bg-[var(--accent-primary)]/8 hover:bg-[var(--accent-primary)]/15 transition-all"
      >
        <Lock className="w-3.5 h-3.5" />
        Move to Private Channel
      </button>

      <AnimatePresence>
        {open && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm p-4"
            onClick={(e) => e.target === e.currentTarget && setOpen(false)}
          >
            <motion.div
              initial={{ scale: 0.95, y: 8 }}
              animate={{ scale: 1, y: 0 }}
              exit={{ scale: 0.95, y: 8 }}
              className="bg-[var(--bg-card)] border border-[var(--border-subtle)] rounded-[var(--radius-lg)] p-6 w-full max-w-md shadow-2xl"
            >
              {success ? (
                <div className="text-center py-4">
                  <div className="w-12 h-12 rounded-full bg-[var(--accent-emerald)]/20 flex items-center justify-center mx-auto mb-4">
                    <Lock className="w-6 h-6 text-[var(--accent-emerald)]" />
                  </div>
                  <h3 className="font-semibold text-lg mb-2">Customer Notified ✅</h3>
                  <p className="text-sm text-[var(--text-muted)] mb-4">
                    {channel === "email" ? "Email sent" : "WhatsApp sent"} to {address}
                  </p>
                  <p className="text-xs text-[var(--text-muted)] bg-[var(--bg-inset)] rounded-lg p-2 font-mono break-all">
                    {success}
                  </p>
                  <button
                    onClick={() => { setOpen(false); setSuccess(null); }}
                    className="mt-4 w-full py-2 rounded-[var(--radius-md)] bg-[var(--accent-primary)]/20 text-[var(--accent-primary)] text-sm font-semibold"
                  >
                    Done
                  </button>
                </div>
              ) : (
                <>
                  <div className="flex items-center justify-between mb-5">
                    <div className="flex items-center gap-2">
                      <Lock className="w-5 h-5 text-[var(--accent-primary)]" />
                      <h3 className="font-semibold text-base">Move to Private Channel</h3>
                    </div>
                    <button onClick={() => setOpen(false)} className="text-[var(--text-muted)] hover:text-[var(--text-primary)]">
                      <X className="w-4 h-4" />
                    </button>
                  </div>
                  <p className="text-xs text-[var(--text-muted)] mb-4">
                    Resolution will continue privately — not on public social media. The customer will receive a secure link.
                  </p>

                  {/* Channel selector */}
                  <div className="grid grid-cols-2 gap-2 mb-4">
                    {(["email", "whatsapp"] as const).map((ch) => (
                      <button
                        key={ch}
                        onClick={() => setChannel(ch)}
                        className={cn(
                          "flex items-center gap-2 px-4 py-2.5 rounded-[var(--radius-md)] border text-sm font-medium transition-all",
                          channel === ch
                            ? "border-[var(--accent-primary)] bg-[var(--accent-primary)]/10 text-[var(--accent-primary)]"
                            : "border-[var(--border-subtle)] text-[var(--text-muted)] hover:text-[var(--text-primary)]"
                        )}
                      >
                        {ch === "email" ? <Mail className="w-4 h-4" /> : <MessageCircle className="w-4 h-4" />}
                        {ch === "email" ? "Email" : "WhatsApp"}
                      </button>
                    ))}
                  </div>

                  {/* Address input */}
                  <label className="text-xs font-semibold text-[var(--text-muted)] mb-1 block">
                    {channel === "email" ? "Customer email address" : "Customer phone (+1234567890)"}
                  </label>
                  <input
                    type={channel === "email" ? "email" : "tel"}
                    value={address}
                    onChange={(e) => setAddress(e.target.value)}
                    placeholder={channel === "email" ? "customer@example.com" : "+1 555 123 4567"}
                    className="w-full bg-[var(--bg-inset)] border border-[var(--border-subtle)] rounded-[var(--radius-md)] px-3 py-2 text-sm mb-3 focus:outline-none focus:border-[var(--accent-primary)] transition-colors"
                  />

                  {/* Opening message */}
                  <label className="text-xs font-semibold text-[var(--text-muted)] mb-1 block">Opening message to customer</label>
                  <textarea
                    value={introMessage}
                    onChange={(e) => setIntroMessage(e.target.value)}
                    rows={3}
                    className="w-full bg-[var(--bg-inset)] border border-[var(--border-subtle)] rounded-[var(--radius-md)] px-3 py-2 text-sm resize-none mb-4 focus:outline-none focus:border-[var(--accent-primary)] transition-colors"
                  />

                  <div className="flex gap-3">
                    <button
                      onClick={() => setOpen(false)}
                      className="flex-1 py-2 rounded-[var(--radius-md)] border border-[var(--border-subtle)] text-sm text-[var(--text-muted)] hover:text-[var(--text-primary)] transition-colors"
                    >
                      Cancel
                    </button>
                    <button
                      onClick={handleSend}
                      disabled={loading || !address.trim()}
                      className="flex-1 py-2 rounded-[var(--radius-md)] bg-[var(--accent-primary)] text-white text-sm font-semibold disabled:opacity-40 transition-all flex items-center justify-center gap-2"
                    >
                      {loading ? <Loader2 className="w-4 h-4 animate-spin" /> : <Lock className="w-4 h-4" />}
                      Send &amp; Move →
                    </button>
                  </div>
                </>
              )}
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>
    </>
  );
}

/* ── HITL Main Page ───────────────────────────────────────── */
export default function HITLPage() {
  const [queue, setQueue] = useState<HITLItem[]>([]);
  const [selected, setSelected] = useState(0);
  const [editDraft, setEditDraft] = useState("");
  const [editing, setEditing] = useState(false);
  const [actionLoading, setActionLoading] = useState<string | null>(null);
  const [profile, setProfile] = useState<GoldenProfile | null>(null);

  useEffect(() => {
    fetchHITLQueue().then((d) => {
      setQueue(d.queue || []);
      if (d.queue?.length) setEditDraft(d.queue[0].ai_draft);
    });
  }, []);

  const item = queue[selected];

  useEffect(() => {
    if (!item) return;
    setProfile(null);
    fetchProfile(item.id).then(setProfile).catch(() => setProfile(null));
    if (!item.ai_draft) {
      generateAIDraft({
        channel: item.channel,
        customer_name: item.customer_name,
        message: item.message,
        product: item.product,
      })
        .then((draft) => setEditDraft(draft.draft))
        .catch(() => setEditDraft(""));
    } else {
      setEditDraft(item.ai_draft);
    }
  }, [item]);

  const handleAction = async (action: "approve" | "edit" | "escalate") => {
    if (!item) return;
    setActionLoading(action);

    try {
      if (action === "approve") {
        await approveTicket(item.id);
        await sendRLHFSignal({
          ticket_id: item.id,
          signal_type: "positive",
          original_draft: editDraft || item.ai_draft,
        });
      } else if (action === "edit") {
        await editTicketWithRLHF(item.id, {
          ticket_id: item.id,
          signal_type: "corrective",
          original_draft: item.ai_draft || editDraft,
          edited_draft: editDraft,
        });
      } else {
        await escalateTicket(item.id);
        await sendRLHFSignal({
          ticket_id: item.id,
          signal_type: "escalated",
          original_draft: editDraft || item.ai_draft,
        });
      }

      setQueue((prev) => prev.filter((_, i) => i !== selected));
      setSelected(0);
      setEditing(false);
      const remaining = queue.filter((_, i) => i !== selected);
      if (remaining.length) setEditDraft(remaining[0].ai_draft);
    } finally {
      setActionLoading(null);
    }
  };

  // Empty state
  if (!queue.length) {
    return (
      <div className="space-y-6">
        <div>
          <h1 className="text-2xl font-bold font-display">HITL Verification Queue</h1>
          <p className="text-sm text-[var(--text-muted)]">All AI drafts reviewed. Queue clear.</p>
        </div>
        <motion.div
          initial={{ opacity: 0, scale: 0.97 }}
          animate={{ opacity: 1, scale: 1 }}
          className="glass-card p-16 text-center"
        >
          <div className="w-16 h-16 rounded-full bg-[var(--accent-emerald)]/10 flex items-center justify-center mx-auto mb-4">
            <CheckCircle className="w-8 h-8 text-[var(--accent-emerald)]" />
          </div>
          <p className="text-lg font-semibold font-display">Queue Clear</p>
          <p className="text-sm text-[var(--text-muted)] mt-1">All AI-generated drafts have been verified.</p>
        </motion.div>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold font-display">HITL Verification Queue</h1>
        <p className="text-sm text-[var(--text-muted)]">
          Review AI-generated drafts before dispatch. Edits feed the RLHF training loop.
        </p>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-12 gap-5">
        {/* ── Queue List ──────────────────────────────────── */}
        <div className="col-span-1 lg:col-span-4 glass-card overflow-hidden">
          <div className="px-4 py-3 border-b border-[var(--border-subtle)] flex items-center justify-between">
            <h3 className="text-[11px] font-semibold text-[var(--text-muted)] uppercase tracking-wider">
              Pending Review
            </h3>
            <span className="text-xs font-bold text-[var(--accent-primary)] font-mono">{queue.length}</span>
          </div>
          <div className="divide-y divide-[var(--border-subtle)] max-h-[700px] overflow-y-auto">
            {queue.map((q, i) => (
              <button
                key={q.id}
                onClick={() => { setSelected(i); setEditDraft(q.ai_draft); setEditing(false); }}
                className={cn(
                  "w-full px-4 py-3.5 text-left hover:bg-[var(--bg-card-hover)] transition-all relative",
                  selected === i && "bg-[var(--accent-primary)]/5"
                )}
              >
                {selected === i && (
                  <motion.div
                    layoutId="hitl-active"
                    className="absolute left-0 top-0 bottom-0 w-[3px] bg-[var(--accent-primary)] rounded-r-full"
                    transition={{ type: "spring", stiffness: 400, damping: 28 }}
                  />
                )}
                <div className="flex items-center gap-2 mb-1">
                  <ChannelBadge channel={q.channel} />
                  <span className="text-sm font-medium truncate">{q.customer_name}</span>
                  {q.auto_approvable && (
                    <span title="Auto-approvable (>85%)">
                      <Sparkles className="w-3 h-3 text-[var(--accent-emerald)] ml-auto" />
                    </span>
                  )}
                </div>
                <p className="text-[11px] text-[var(--text-muted)] truncate">{q.message}</p>
                <div className="flex items-center gap-2 mt-1.5">
                  <span className={cn("px-1.5 py-0.5 rounded-full text-[9px] font-semibold uppercase", `badge-${q.severity}`)}>
                    {q.severity}
                  </span>
                  <span className="text-[10px] text-[var(--text-muted)] font-mono">
                    {(q.confidence * 100).toFixed(0)}%
                  </span>
                  {q.requires_senior_review && (
                    <AlertTriangle className="w-3 h-3 text-[var(--accent-amber)] ml-auto" />
                  )}
                </div>
              </button>
            ))}
          </div>
        </div>

        {/* ── Review Panel ────────────────────────────────── */}
        <div className="col-span-1 lg:col-span-8 space-y-5">
          <AnimatePresence mode="wait">
            {item && (
              <motion.div
                key={item.id}
                initial={{ opacity: 0, y: 8 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: -8 }}
                transition={{ duration: 0.25 }}
                className="space-y-5"
              >
                {/* ── Identity & Analytics + Sentiment Velocity ── */}
                <div className="grid grid-cols-1 lg:grid-cols-2 gap-5">
                  <div className="glass-card p-5">
                    <h3 className="text-[11px] font-semibold text-[var(--text-muted)] uppercase tracking-wider mb-4">
                      Identity & Analytics
                    </h3>
                    {profile ? <GoldenProfileStitching profile={profile} /> : <p className="text-sm text-[var(--text-muted)]">No verified identity match yet.</p>}
                  </div>

                  <div className="glass-card p-5">
                    <h3 className="text-[11px] font-semibold text-[var(--text-muted)] uppercase tracking-wider mb-3">
                      Sentiment Velocity (V_sent)
                    </h3>
                    <SentimentGauge
                      value={profile ? Math.round(profile.churn_risk * 100) : 50}
                      highRisk={profile?.churn_alert}
                      size={240}
                    />
                  </div>
                </div>

                {/* ── HITL Orchestration ────────────────────── */}
                <div className="space-y-4">
                  <h3 className="text-[11px] font-semibold text-[var(--text-muted)] uppercase tracking-wider">
                    Human-in-the-Loop (HITL) Orchestration
                  </h3>

                  {/* AI Draft Response Card */}
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
                        <ConfidenceRing value={item.confidence} />
                        <div className="flex items-center gap-1">
                          <button title="Regenerate draft" className="p-1.5 rounded-[var(--radius-sm)] text-[var(--text-muted)] hover:text-[var(--text-primary)] hover:bg-[var(--bg-card-hover)] transition-all">
                            <RotateCcw className="w-3.5 h-3.5" />
                          </button>
                          <button title="Copy draft" className="p-1.5 rounded-[var(--radius-sm)] text-[var(--text-muted)] hover:text-[var(--text-primary)] hover:bg-[var(--bg-card-hover)] transition-all">
                            <Copy className="w-3.5 h-3.5" />
                          </button>
                          <button title="Delete draft" className="p-1.5 rounded-[var(--radius-sm)] text-[var(--text-muted)] hover:text-[var(--text-primary)] hover:bg-[var(--bg-card-hover)] transition-all">
                            <Trash2 className="w-3.5 h-3.5" />
                          </button>
                          <button title="More actions" className="p-1.5 rounded-[var(--radius-sm)] text-[var(--text-muted)] hover:text-[var(--text-primary)] hover:bg-[var(--bg-card-hover)] transition-all">
                            <MoreHorizontal className="w-3.5 h-3.5" />
                          </button>
                        </div>
                      </div>
                    </div>

                    <div className="hitl-response-body">
                      {editing ? (
                        <textarea
                          value={editDraft}
                          onChange={(e) => setEditDraft(e.target.value)}
                          placeholder="Edit the AI-drafted response..."
                          className="w-full h-44 p-4 rounded-[var(--radius-md)] bg-[var(--bg-primary)] border border-[var(--border-subtle)] text-sm text-[var(--text-primary)] resize-none focus:outline-none focus:ring-2 focus:ring-[var(--accent-primary)]/20 transition-all"
                        />
                      ) : (
                        <div className="space-y-3 text-sm leading-relaxed text-[var(--text-primary)] whitespace-pre-wrap">
                          {editDraft || item.ai_draft || "Draft pending from /api/v1/ai/draft."}
                        </div>
                      )}

                      {/* RAG Sources */}
                      {item.rag_sources?.length > 0 && (
                        <div className="mt-4 pt-4 border-t border-[var(--border-subtle)]">
                          <p className="text-[10px] text-[var(--text-muted)] uppercase tracking-wider mb-2 flex items-center gap-1">
                            <BookOpen className="w-3 h-3" /> RAG Sources
                          </p>
                          <div className="flex flex-wrap gap-1.5">
                            {item.rag_sources.map((s, i) => (
                              <span
                                key={i}
                                className="px-2.5 py-1 rounded-[var(--radius-sm)] text-[10px] bg-[var(--accent-primary)]/8 text-[var(--accent-primary)] border border-[var(--accent-primary)]/15"
                              >
                                {typeof s === "string" ? s : String(s["title"] || s["source"] || s["id"] || `Source ${i + 1}`)}
                              </span>
                            ))}
                          </div>
                        </div>
                      )}
                    </div>
                  </div>

                  {/* ── HITL Action Buttons ──────────────────── */}
                  <div className="flex items-center gap-3">
                    <button
                      onClick={() => handleAction("approve")}
                      disabled={actionLoading !== null}
                      className="hitl-btn-approve flex items-center justify-center gap-2 flex-1"
                    >
                      <Send className="w-4 h-4" />
                      {actionLoading === "approve" ? "Sending…" : "HITL 1-CLICK APPROVE"}
                    </button>

                    {editing ? (
                      <button
                        onClick={() => handleAction("edit")}
                        disabled={actionLoading !== null}
                        className="hitl-btn-edit flex items-center justify-center gap-2 flex-1"
                      >
                        <Edit3 className="w-4 h-4" />
                        {actionLoading === "edit" ? "Sending…" : "SEND EDITED + RLHF"}
                      </button>
                    ) : (
                      <button
                        onClick={() => setEditing(true)}
                        className="hitl-btn-edit flex items-center justify-center gap-2 flex-1"
                      >
                        <Edit3 className="w-4 h-4" />
                        MANUAL EDIT
                      </button>
                    )}

                    <button
                      onClick={() => handleAction("escalate")}
                      disabled={actionLoading !== null}
                      className="hitl-btn-escalate flex items-center justify-center gap-2"
                    >
                      <AlertTriangle className="w-4 h-4" />
                      {actionLoading === "escalate" ? "…" : "Escalate"}
                    </button>
                  </div>

                  {/* ── Move to Private Channel ─────────────── */}
                  <PrivateChannelHandoff ticketId={item.id} customerName={item.customer_name} />
                </div>
              </motion.div>
            )}
          </AnimatePresence>
        </div>
      </div>
    </div>
  );
}
