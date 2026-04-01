"use client";

import React, { useState, useEffect } from "react";
import { motion } from "framer-motion";
import { cn } from "@/lib/utils";
import { CheckCircle, XCircle, Edit3, Send, AlertTriangle, BookOpen, Zap } from "lucide-react";

const API = process.env.NEXT_PUBLIC_API_URL || "http://localhost:8000";
const CHANNEL_ICONS: Record<string, string> = { x: "𝕏", reddit: "🔴", gmail: "📧" };

export default function HITLPage() {
  const [queue, setQueue] = useState<any[]>([]);
  const [selected, setSelected] = useState<number>(0);
  const [editDraft, setEditDraft] = useState("");
  const [editing, setEditing] = useState(false);

  useEffect(() => {
    fetch(`${API}/api/v1/tickets/hitl`).then((r) => r.json()).then((d) => {
      setQueue(d.queue || []);
      if (d.queue?.length) setEditDraft(d.queue[0].ai_draft);
    });
  }, []);

  const item = queue[selected];

  const handleAction = async (action: "approve" | "edit" | "escalate") => {
    if (!item) return;
    const endpoint = action === "edit" ? "edit" : action;
    await fetch(`${API}/api/v1/tickets/${item.id}/${endpoint}`, { method: "POST" });
    setQueue((prev) => prev.filter((_, i) => i !== selected));
    setSelected(0);
    setEditing(false);
  };

  if (!queue.length) {
    return (
      <div className="space-y-6">
        <h1 className="text-2xl font-bold">HITL Verification Queue</h1>
        <div className="glass-card p-12 text-center">
          <CheckCircle className="w-12 h-12 text-emerald-400 mx-auto mb-4" />
          <p className="text-lg font-semibold">Queue Clear</p>
          <p className="text-sm text-[var(--text-muted)]">All AI drafts have been reviewed.</p>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold">HITL Verification Queue</h1>
        <p className="text-sm text-[var(--text-muted)]">Review AI-generated drafts before dispatch. Edits feed the RLHF training loop.</p>
      </div>

      <div className="grid grid-cols-12 gap-5">
        {/* Queue List */}
        <div className="col-span-4 glass-card overflow-hidden">
          <div className="px-4 py-3 border-b border-[var(--border-subtle)] flex items-center justify-between">
            <h3 className="text-xs font-semibold text-[var(--text-muted)] uppercase tracking-wider">Pending Review</h3>
            <span className="text-xs font-bold text-blue-400">{queue.length}</span>
          </div>
          <div className="divide-y divide-[var(--border-subtle)] max-h-[700px] overflow-y-auto">
            {queue.map((q, i) => (
              <button key={q.id} onClick={() => { setSelected(i); setEditDraft(q.ai_draft); setEditing(false); }}
                className={cn("w-full px-4 py-3 text-left hover:bg-[var(--bg-card-hover)] transition-colors",
                  selected === i && "bg-blue-500/10 border-l-2 border-blue-500")}>
                <div className="flex items-center gap-2 mb-1">
                  <span className="text-xs">{CHANNEL_ICONS[q.channel]}</span>
                  <span className="text-sm font-medium truncate">{q.customer_name}</span>
                  {q.auto_approvable && <span title="Auto-approvable (&gt;85%)"><Zap className="w-3 h-3 text-emerald-400 ml-auto" /></span>}
                </div>
                <p className="text-[11px] text-[var(--text-muted)] truncate">{q.message}</p>
                <div className="flex items-center gap-2 mt-1.5">
                  <span className={cn("px-1.5 py-0.5 rounded text-[9px] font-semibold uppercase", `badge-${q.severity}`)}>{q.severity}</span>
                  <span className="text-[10px] text-[var(--text-muted)]">{(q.confidence * 100).toFixed(0)}%</span>
                  {q.requires_senior_review && <AlertTriangle className="w-3 h-3 text-amber-400 ml-auto" />}
                </div>
              </button>
            ))}
          </div>
        </div>

        {/* Review Panel */}
        <div className="col-span-8 space-y-5">
          {item && (
            <>
              {/* Customer Message */}
              <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} className="glass-card p-5">
                <div className="flex items-center gap-3 mb-3">
                  <span className={cn("px-2.5 py-1 rounded-lg text-xs font-medium", `channel-${item.channel}`)}>
                    {CHANNEL_ICONS[item.channel]} {item.channel}
                  </span>
                  <span className="font-semibold text-sm">{item.customer_name}</span>
                  <span className={cn("px-2 py-0.5 rounded-full text-[10px] font-semibold uppercase", `badge-${item.severity}`)}>{item.severity}</span>
                  <span className="px-2 py-0.5 rounded-full text-[10px] bg-purple-500/10 text-purple-400">{item.product}</span>
                </div>
                <p className="text-sm text-[var(--text-secondary)] leading-relaxed">{item.message}</p>
              </motion.div>

              {/* AI Draft */}
              <div className={cn("glass-card p-5", item.auto_approvable ? "glow-emerald" : item.requires_senior_review ? "glow-rose" : "glow-blue")}>
                <div className="flex items-center justify-between mb-3">
                  <div className="flex items-center gap-2">
                    <Zap className="w-4 h-4 text-blue-400" />
                    <h3 className="text-sm font-semibold">AI Draft Response</h3>
                    <span className={cn("px-2 py-0.5 rounded-full text-[10px] font-bold",
                      item.confidence > 0.85 ? "bg-emerald-500/15 text-emerald-400 border border-emerald-500/30" :
                      item.confidence > 0.7 ? "bg-amber-500/15 text-amber-400 border border-amber-500/30" :
                      "bg-red-500/15 text-red-400 border border-red-500/30"
                    )}>
                      {(item.confidence * 100).toFixed(0)}% confidence
                    </span>
                    {item.auto_approvable && (
                      <span className="px-2 py-0.5 rounded-full text-[10px] font-bold bg-emerald-500/15 text-emerald-400 border border-emerald-500/30">
                        ✓ Auto-Draft Available
                      </span>
                    )}
                  </div>
                  <button onClick={() => setEditing(!editing)}
                    className="flex items-center gap-1.5 text-xs text-[var(--text-muted)] hover:text-blue-400 transition-colors">
                    <Edit3 className="w-3.5 h-3.5" /> {editing ? "Cancel Edit" : "Edit Draft"}
                  </button>
                </div>

                {editing ? (
                  <textarea
                    value={editDraft}
                    onChange={(e) => setEditDraft(e.target.value)}
                    className="w-full h-36 p-3 rounded-xl bg-[var(--bg-primary)] border border-[var(--border-subtle)] text-sm text-[var(--text-primary)] resize-none focus:outline-none focus:ring-2 focus:ring-blue-500/30"
                  />
                ) : (
                  <p className="text-sm text-[var(--text-secondary)] leading-relaxed">{item.ai_draft}</p>
                )}

                {/* RAG Sources */}
                {item.rag_sources?.length > 0 && (
                  <div className="mt-3 pt-3 border-t border-[var(--border-subtle)]">
                    <p className="text-[10px] text-[var(--text-muted)] uppercase tracking-wider mb-1.5 flex items-center gap-1">
                      <BookOpen className="w-3 h-3" /> RAG Sources
                    </p>
                    <div className="flex flex-wrap gap-1.5">
                      {item.rag_sources.map((s: string, i: number) => (
                        <span key={i} className="px-2 py-0.5 rounded-md text-[10px] bg-blue-500/10 text-blue-400 border border-blue-500/20">{s}</span>
                      ))}
                    </div>
                  </div>
                )}
              </div>

              {/* Actions */}
              <div className="flex items-center gap-3">
                <button onClick={() => handleAction("approve")}
                  className="flex-1 flex items-center justify-center gap-2 py-3 rounded-xl font-semibold text-sm text-white bg-gradient-to-r from-emerald-600 to-emerald-500 hover:from-emerald-500 hover:to-emerald-400 transition-all shadow-lg shadow-emerald-500/20">
                  <Send className="w-4 h-4" /> {item.auto_approvable ? "1-Click Approve & Send" : "Approve & Send"}
                </button>
                {editing && (
                  <button onClick={() => handleAction("edit")}
                    className="flex-1 flex items-center justify-center gap-2 py-3 rounded-xl font-semibold text-sm text-white bg-gradient-to-r from-blue-600 to-blue-500 hover:from-blue-500 hover:to-blue-400 transition-all shadow-lg shadow-blue-500/20">
                    <Edit3 className="w-4 h-4" /> Send Edited + RLHF Signal
                  </button>
                )}
                <button onClick={() => handleAction("escalate")}
                  className="px-6 py-3 rounded-xl font-semibold text-sm text-[var(--text-secondary)] border border-[var(--border-subtle)] hover:bg-red-500/10 hover:text-red-400 hover:border-red-500/30 transition-all">
                  <AlertTriangle className="w-4 h-4" />
                </button>
              </div>
            </>
          )}
        </div>
      </div>
    </div>
  );
}
