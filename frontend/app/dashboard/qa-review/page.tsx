"use client";

import React, { useState, useEffect } from "react";
import { motion } from "framer-motion";
import { cn } from "@/lib/utils";
import { fetchHITLQueue, sendRLHFSignal } from "@/lib/api";
import type { HITLItem } from "@/lib/types";
import { ClipboardCheck, CheckCircle, XCircle, Zap, BookOpen } from "lucide-react";

export default function QAReviewPage() {
  const [queue, setQueue] = useState<HITLItem[]>([]);
  const [reviewed, setReviewed] = useState<string[]>([]);

  useEffect(() => {
    fetchHITLQueue().then((d) => setQueue(d.queue || []));
  }, []);

  const handleDecision = async (item: HITLItem, decision: "approve_for_rlhf" | "reject") => {
    if (decision === "approve_for_rlhf") {
      await sendRLHFSignal({
        ticket_id: item.id,
        signal_type: "positive",
        original_draft: item.ai_draft,
      });
    }
    setReviewed((prev) => [...prev, item.id]);
  };

  const pending = queue.filter((q) => !reviewed.includes(q.id));

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold font-display">QA Review Dashboard</h1>
        <p className="text-sm text-[var(--text-muted)]">Review agent edits before they enter the RLHF AI-training loop</p>
      </div>

      {/* Stats */}
      <div className="grid grid-cols-3 gap-4">
        <div className="glass-card p-4 text-center">
          <p className="text-2xl font-bold font-display text-[var(--accent-primary)]">{queue.length}</p>
          <p className="text-xs text-[var(--text-muted)]">Total in Queue</p>
        </div>
        <div className="glass-card p-4 text-center">
          <p className="text-2xl font-bold font-display text-[var(--accent-emerald)]">{reviewed.length}</p>
          <p className="text-xs text-[var(--text-muted)]">Reviewed This Session</p>
        </div>
        <div className="glass-card p-4 text-center">
          <p className="text-2xl font-bold font-display text-[var(--accent-amber)]">{pending.length}</p>
          <p className="text-xs text-[var(--text-muted)]">Pending</p>
        </div>
      </div>

      {pending.length === 0 ? (
        <motion.div
          initial={{ opacity: 0, scale: 0.97 }}
          animate={{ opacity: 1, scale: 1 }}
          className="glass-card p-12 text-center"
        >
          <div className="w-14 h-14 rounded-full bg-[var(--accent-emerald)]/10 flex items-center justify-center mx-auto mb-4">
            <CheckCircle className="w-7 h-7 text-[var(--accent-emerald)]" />
          </div>
          <p className="text-lg font-semibold font-display">All Edits Reviewed</p>
          <p className="text-sm text-[var(--text-muted)]">No pending agent edits for RLHF approval.</p>
        </motion.div>
      ) : (
        <div className="grid gap-4">
          {pending.map((item, i) => (
            <motion.div key={item.id} initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: i * 0.05 }}
              className="glass-card p-5">
              <div className="flex items-start justify-between gap-4 mb-4">
                <div>
                  <div className="flex items-center gap-2 mb-1 flex-wrap">
                    <span className="font-semibold text-sm">{item.customer_name}</span>
                    <span className={cn("px-2 py-0.5 rounded-full text-[10px] font-semibold uppercase", `badge-${item.severity}`)}>{item.severity}</span>
                    <span className="px-2 py-0.5 rounded-full text-[10px] bg-[var(--accent-secondary)]/10 text-[var(--accent-secondary)]">{item.product}</span>
                  </div>
                  <p className="text-sm text-[var(--text-secondary)] leading-relaxed">{item.message}</p>
                </div>
                <span className={cn("px-2 py-0.5 rounded-full text-[10px] font-bold shrink-0 border",
                  item.confidence > 0.85 ? "bg-[var(--accent-emerald)]/10 text-[var(--accent-emerald)] border-[var(--accent-emerald)]/20" : "bg-[var(--accent-amber)]/10 text-[var(--accent-amber)] border-[var(--accent-amber)]/20"
                )}>{(item.confidence * 100).toFixed(0)}%</span>
              </div>

              <div className="p-4 rounded-[var(--radius-md)] bg-[var(--bg-inset)] border border-[var(--border-subtle)] mb-4">
                <p className="text-[10px] text-[var(--text-muted)] uppercase tracking-wider mb-2 flex items-center gap-1">
                  <Zap className="w-3 h-3" /> AI Draft (for RLHF Training)
                </p>
                <p className="text-sm text-[var(--text-secondary)] leading-relaxed">{item.ai_draft}</p>
                {item.rag_sources?.length > 0 && (
                  <div className="flex flex-wrap gap-1.5 mt-3 pt-3 border-t border-[var(--border-subtle)]">
                    <BookOpen className="w-3 h-3 text-[var(--text-muted)]" />
                    {item.rag_sources.map((s, j) => (
                      <span key={j} className="px-2 py-0.5 rounded-[var(--radius-sm)] text-[9px] bg-[var(--accent-primary)]/8 text-[var(--accent-primary)]">{s}</span>
                    ))}
                  </div>
                )}
              </div>

              <div className="flex items-center gap-3">
                <button onClick={() => handleDecision(item, "approve_for_rlhf")}
                  className="flex items-center gap-2 px-4 py-2.5 rounded-[var(--radius-md)] text-sm font-medium text-white bg-[var(--accent-emerald)] hover:brightness-110 shadow-lg shadow-[var(--accent-emerald)]/15 transition-all active:scale-[0.98]">
                  <CheckCircle className="w-4 h-4" /> Approve for RLHF
                </button>
                <button onClick={() => handleDecision(item, "reject")}
                  className="flex items-center gap-2 px-4 py-2.5 rounded-[var(--radius-md)] text-sm font-medium text-[var(--text-secondary)] border border-[var(--border-subtle)] hover:bg-[var(--accent-rose)]/8 hover:text-[var(--accent-rose)] hover:border-[var(--accent-rose)]/25 transition-all active:scale-[0.98]">
                  <XCircle className="w-4 h-4" /> Reject
                </button>
              </div>
            </motion.div>
          ))}
        </div>
      )}
    </div>
  );
}
