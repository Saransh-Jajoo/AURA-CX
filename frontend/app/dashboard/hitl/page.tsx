"use client";

import React, { useState, useEffect } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { cn } from "@/lib/utils";
import {
  fetchHITLQueue, approveTicket, escalateTicket,
  editTicketWithRLHF, sendRLHFSignal, fetchProfile,
  generateAIDraft, createHandoffLink,
} from "@/lib/api";
import type { HITLItem, GoldenProfile } from "@/lib/types";
import { GoldenProfileStitching } from "@/components/golden-profile-stitching";
import { SentimentGauge } from "@/components/sentiment-gauge";
import {
  CheckCircle, XCircle, Edit3, Send, AlertTriangle, BookOpen,
  Zap, ChevronRight, Sparkles, RotateCcw, MoreHorizontal, Copy, Trash2,
  MessageCircle, Bot, Loader2,
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

  // Load profile when item changes
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
      if (queue.length > 1) {
        const nextItem = queue.filter((_, i) => i !== selected)[0];
        if (nextItem) setEditDraft(nextItem.ai_draft);
      }
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

      <div className="grid grid-cols-12 gap-5">
        {/* ── Queue List ─────────────────────────────────── */}
        <div className="col-span-4 glass-card overflow-hidden">
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

        {/* ── Review Panel ───────────────────────────────── */}
        <div className="col-span-8 space-y-5">
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
                  {/* Golden Profile Stitching */}
                  <div className="glass-card p-5">
                    <h3 className="text-[11px] font-semibold text-[var(--text-muted)] uppercase tracking-wider mb-4">
                      Identity & Analytics
                    </h3>
                    {profile ? <GoldenProfileStitching profile={profile} /> : <p className="text-sm text-[var(--text-muted)]">No verified identity match yet.</p>}
                  </div>

                  {/* Sentiment Velocity Gauge */}
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

                {/* ── HITL Orchestration ──────────────────── */}
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
                        <div className="space-y-3 text-sm leading-relaxed">
                          <p>Dear Customer response,</p>
                          <p><strong>Problem Acknowledgment:</strong><br />{editDraft || item.ai_draft || "Draft pending from /api/v1/ai/draft."}</p>
                          <p><strong>Resolution Steps:</strong><br />1. Enter the steps, look at for the best services and resolution strategies.</p>
                          <p><strong>Follow-up:</strong> We will take your e-mail customer services and resolve with our resolution.</p>
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
                                {s}
                              </span>
                            ))}
                          </div>
                        </div>
                      )}
                    </div>
                  </div>

                  {/* ── HITL Action Buttons ────────────────── */}
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
                  </div>

                  {/* ── Handoff Actions ─────────────────── */}
                  <div className="flex items-center gap-3">
                    <button
                      onClick={async () => {
                        const waLink = (await createHandoffLink(item.id, "whatsapp")).deep_link;
                        setEditDraft(
                          editDraft + `\n\n---\n📱 Continue on WhatsApp for guided support: ${waLink}`
                        );
                        setEditing(true);
                      }}
                      className="hitl-btn-handoff-wa flex items-center justify-center gap-2 flex-1"
                    >
                      <MessageCircle className="w-4 h-4" />
                      Handoff to WhatsApp
                    </button>
                    <button
                      onClick={async () => {
                        const chatToken = (await createHandoffLink(item.id, "chatbot")).deep_link.replace(/^.*\/chat\//, "");
                        setEditDraft(
                          editDraft + `\n\n---\n🤖 Continue with our AI assistant for step-by-step help: ${window.location.origin}/chat/${chatToken}`
                        );
                        setEditing(true);
                      }}
                      className="hitl-btn-handoff-bot flex items-center justify-center gap-2 flex-1"
                    >
                      <Bot className="w-4 h-4" />
                      Handoff to AI Chatbot
                    </button>
                  </div>
                </div>
              </motion.div>
            )}
          </AnimatePresence>
        </div>
      </div>
    </div>
  );
}
