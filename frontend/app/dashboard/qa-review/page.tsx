"use client";

import React, { useState, useEffect } from "react";
import { motion } from "framer-motion";
import { cn } from "@/lib/utils";
import { ClipboardCheck, CheckCircle, XCircle, Edit3, Zap, BookOpen } from "lucide-react";

const API = process.env.NEXT_PUBLIC_API_URL || "http://localhost:8000";

export default function QAReviewPage() {
  const [queue, setQueue] = useState<any[]>([]);
  const [reviewed, setReviewed] = useState<string[]>([]);

  useEffect(() => {
    fetch(`${API}/api/v1/tickets/hitl`).then((r) => r.json()).then((d) => setQueue(d.queue || []));
  }, []);

  const handleDecision = (id: string, decision: "approve_for_rlhf" | "reject") => {
    setReviewed((prev) => [...prev, id]);
  };

  const pending = queue.filter((q) => !reviewed.includes(q.id));

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold">QA Review Dashboard</h1>
        <p className="text-sm text-[var(--text-muted)]">Review agent edits before they enter the RLHF AI-training loop</p>
      </div>

      {/* Stats */}
      <div className="grid grid-cols-3 gap-4">
        <div className="glass-card p-4 text-center">
          <p className="text-2xl font-bold text-blue-400">{queue.length}</p>
          <p className="text-xs text-[var(--text-muted)]">Total in Queue</p>
        </div>
        <div className="glass-card p-4 text-center">
          <p className="text-2xl font-bold text-emerald-400">{reviewed.length}</p>
          <p className="text-xs text-[var(--text-muted)]">Reviewed This Session</p>
        </div>
        <div className="glass-card p-4 text-center">
          <p className="text-2xl font-bold text-amber-400">{pending.length}</p>
          <p className="text-xs text-[var(--text-muted)]">Pending</p>
        </div>
      </div>

      {pending.length === 0 ? (
        <div className="glass-card p-12 text-center">
          <CheckCircle className="w-12 h-12 text-emerald-400 mx-auto mb-4" />
          <p className="text-lg font-semibold">All Edits Reviewed</p>
          <p className="text-sm text-[var(--text-muted)]">No pending agent edits for RLHF approval.</p>
        </div>
      ) : (
        <div className="grid gap-4">
          {pending.map((item, i) => (
            <motion.div key={item.id} initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: i * 0.05 }}
              className="glass-card p-5">
              <div className="flex items-start justify-between gap-4 mb-4">
                <div>
                  <div className="flex items-center gap-2 mb-1">
                    <span className="font-semibold text-sm">{item.customer_name}</span>
                    <span className={cn("px-2 py-0.5 rounded-full text-[10px] font-semibold uppercase", `badge-${item.severity}`)}>{item.severity}</span>
                    <span className="px-2 py-0.5 rounded-full text-[10px] bg-purple-500/10 text-purple-400">{item.product}</span>
                  </div>
                  <p className="text-sm text-[var(--text-secondary)]">{item.message}</p>
                </div>
                <span className={cn("px-2 py-0.5 rounded-full text-[10px] font-bold shrink-0",
                  item.confidence > 0.85 ? "bg-emerald-500/15 text-emerald-400" : "bg-amber-500/15 text-amber-400"
                )}>{(item.confidence * 100).toFixed(0)}%</span>
              </div>

              <div className="p-4 rounded-xl bg-[var(--bg-primary)] border border-[var(--border-subtle)] mb-4">
                <p className="text-[10px] text-[var(--text-muted)] uppercase tracking-wider mb-2 flex items-center gap-1">
                  <Zap className="w-3 h-3" /> AI Draft (for RLHF Training)
                </p>
                <p className="text-sm text-[var(--text-secondary)] leading-relaxed">{item.ai_draft}</p>
                {item.rag_sources?.length > 0 && (
                  <div className="flex flex-wrap gap-1.5 mt-2">
                    {item.rag_sources.map((s: string, j: number) => (
                      <span key={j} className="px-2 py-0.5 rounded-md text-[9px] bg-blue-500/10 text-blue-400">{s}</span>
                    ))}
                  </div>
                )}
              </div>

              <div className="flex items-center gap-3">
                <button onClick={() => handleDecision(item.id, "approve_for_rlhf")}
                  className="flex items-center gap-2 px-4 py-2 rounded-xl text-sm font-medium text-emerald-400 bg-emerald-500/10 border border-emerald-500/20 hover:bg-emerald-500/20 transition-all">
                  <CheckCircle className="w-4 h-4" /> Approve for RLHF
                </button>
                <button onClick={() => handleDecision(item.id, "reject")}
                  className="flex items-center gap-2 px-4 py-2 rounded-xl text-sm font-medium text-red-400 bg-red-500/10 border border-red-500/20 hover:bg-red-500/20 transition-all">
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
