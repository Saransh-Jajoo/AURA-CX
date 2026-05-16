"use client";

import React, { useState, useEffect, useCallback } from "react";
import { motion, AnimatePresence } from "framer-motion";
import {
  Phone, PhoneCall, PhoneOff, Clock, MessageSquare, BarChart3,
  AlertCircle, CheckCircle2, Play, ChevronDown, Languages,
  TrendingDown, TrendingUp, Volume2,
} from "lucide-react";
import { fetchCalls, fetchCallDetail, fetchVoiceAnalytics } from "@/lib/api";
import type { CallRecording, VoiceAnalytics } from "@/lib/types";

function formatDuration(seconds: number): string {
  const m = Math.floor(seconds / 60);
  const s = seconds % 60;
  return `${m}:${s.toString().padStart(2, "0")}`;
}

export default function VoicePage() {
  const [calls, setCalls] = useState<CallRecording[]>([]);
  const [analytics, setAnalytics] = useState<VoiceAnalytics | null>(null);
  const [loading, setLoading] = useState(true);
  const [selectedCall, setSelectedCall] = useState<CallRecording | null>(null);
  const [statusFilter, setStatusFilter] = useState<string>("");

  const loadData = useCallback(async () => {
    setLoading(true);
    try {
      const [callsRes, analyticsRes] = await Promise.all([
        fetchCalls(statusFilter ? { status: statusFilter } : undefined),
        fetchVoiceAnalytics(),
      ]);
      setCalls(callsRes.calls || []);
      setAnalytics(analyticsRes);
    } catch { /* ignore */ }
    setLoading(false);
  }, [statusFilter]);

  useEffect(() => { loadData(); }, [loadData]);

  const handleViewCall = async (callId: string) => {
    try {
      const call = await fetchCallDetail(callId);
      setSelectedCall(call);
    } catch { /* ignore */ }
  };

  return (
    <div className="space-y-6">
      {/* Header */}
      <div>
        <h1 className="text-2xl font-display font-bold tracking-tight">Voice Agent</h1>
        <p className="text-sm text-[var(--text-muted)] mt-1">AI-powered call recordings, transcripts, and voice analytics</p>
      </div>

      {/* Analytics Cards */}
      {analytics && (
        <div className="grid grid-cols-2 md:grid-cols-5 gap-3">
          {[
            { label: "Total Calls", value: analytics.total_calls, icon: Phone, color: "var(--accent-primary)" },
            { label: "Avg Duration", value: formatDuration(Math.round(analytics.avg_duration_seconds)), icon: Clock, color: "var(--accent-teal)" },
            { label: "Avg Sentiment", value: analytics.avg_sentiment >= 0 ? `+${analytics.avg_sentiment.toFixed(2)}` : analytics.avg_sentiment.toFixed(2), icon: analytics.avg_sentiment >= 0 ? TrendingUp : TrendingDown, color: analytics.avg_sentiment >= 0 ? "var(--accent-emerald)" : "var(--accent-rose)" },
            { label: "Complaints", value: analytics.complaints_registered, icon: AlertCircle, color: "var(--accent-amber)" },
            { label: "Complaint Rate", value: `${analytics.complaint_rate}%`, icon: BarChart3, color: "var(--accent-rose)" },
          ].map((s, i) => (
            <div key={i} className="solid-card p-4">
              <div className="flex items-center gap-2 mb-2">
                <s.icon className="w-3.5 h-3.5" style={{ color: s.color }} />
                <span className="text-[10px] text-[var(--text-muted)] font-semibold uppercase tracking-wider">{s.label}</span>
              </div>
              <div className="text-xl font-bold font-display" style={{ color: s.color }}>{s.value}</div>
            </div>
          ))}
        </div>
      )}

      {/* Status Filter */}
      <div className="flex items-center gap-1 p-1 bg-[var(--bg-elevated)] rounded-[var(--radius-md)] border border-[var(--border-subtle)] w-fit">
        {[
          { value: "", label: "All" },
          { value: "active", label: "Active" },
          { value: "completed", label: "Completed" },
          { value: "failed", label: "Failed" },
        ].map(filter => (
          <button key={filter.value} onClick={() => setStatusFilter(filter.value)} className={`px-3 py-1.5 rounded-[var(--radius-sm)] text-xs font-semibold transition-all ${statusFilter === filter.value ? "bg-[var(--accent-primary)] text-white" : "text-[var(--text-muted)]"}`}>
            {filter.label}
          </button>
        ))}
      </div>

      {/* Calls List */}
      <div className="space-y-2">
        {loading ? (
          Array.from({ length: 4 }).map((_, i) => <div key={i} className="skeleton h-20 rounded-[var(--radius-md)]" />)
        ) : calls.length === 0 ? (
          <div className="solid-card p-12 text-center">
            <Phone className="w-10 h-10 mx-auto mb-3 text-[var(--text-muted)]" />
            <p className="text-sm text-[var(--text-muted)]">No call recordings found. Ingest calls via the Voice API.</p>
          </div>
        ) : (
          calls.map((call, i) => (
            <motion.div key={call.id} initial={{ opacity: 0, y: 4 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: i * 0.03 }} onClick={() => handleViewCall(call.id)} className="solid-card p-4 flex items-center gap-4 cursor-pointer hover:border-[var(--border-medium)] transition-all group">
              <div className={`w-10 h-10 rounded-full flex items-center justify-center ${call.status === "active" ? "bg-[var(--accent-emerald)]/10" : call.status === "failed" ? "bg-[var(--accent-rose)]/10" : "bg-[var(--accent-primary)]/10"}`}>
                {call.status === "active" ? (
                  <PhoneCall className="w-4 h-4 text-[var(--accent-emerald)]" />
                ) : call.status === "failed" ? (
                  <PhoneOff className="w-4 h-4 text-[var(--accent-rose)]" />
                ) : (
                  <Phone className="w-4 h-4 text-[var(--accent-primary)]" />
                )}
              </div>
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2">
                  <span className="text-sm font-semibold">{call.caller_number}</span>
                  <span className={`text-[10px] px-1.5 py-0.5 rounded-full font-semibold ${call.direction === "inbound" ? "bg-[var(--accent-sky)]/10 text-[var(--accent-sky)]" : "bg-[var(--accent-secondary)]/10 text-[var(--accent-secondary)]"}`}>
                    {call.direction}
                  </span>
                  {call.complaint_registered && (
                    <span className="text-[10px] px-1.5 py-0.5 bg-[var(--accent-rose)]/10 text-[var(--accent-rose)] rounded-full font-semibold">Complaint</span>
                  )}
                </div>
                <div className="flex items-center gap-3 mt-0.5 text-[10px] text-[var(--text-muted)]">
                  <span className="flex items-center gap-1"><Clock className="w-3 h-3" /> {formatDuration(call.duration_seconds)}</span>
                  <span>•</span>
                  <span className="flex items-center gap-1"><Languages className="w-3 h-3" /> {call.detected_language.toUpperCase()}</span>
                  <span>•</span>
                  <span>{new Date(call.started_at).toLocaleString()}</span>
                  {call.transcript_length > 0 && <><span>•</span><span className="flex items-center gap-1"><MessageSquare className="w-3 h-3" /> {call.transcript_length} segments</span></>}
                </div>
              </div>
              <div className="flex items-center gap-3">
                <div className={`text-sm font-mono font-bold ${call.sentiment_score >= 0 ? "text-[var(--accent-emerald)]" : "text-[var(--accent-rose)]"}`}>
                  {call.sentiment_score >= 0 ? "+" : ""}{call.sentiment_score.toFixed(2)}
                </div>
              </div>
            </motion.div>
          ))
        )}
      </div>

      {/* Call Detail Modal */}
      <AnimatePresence>
        {selectedCall && (
          <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} className="fixed inset-0 z-50 flex items-center justify-center bg-[var(--overlay)]" onClick={() => setSelectedCall(null)}>
            <motion.div initial={{ scale: 0.95, y: 10 }} animate={{ scale: 1, y: 0 }} exit={{ scale: 0.95, y: 10 }} onClick={(e) => e.stopPropagation()} className="w-full max-w-2xl max-h-[80vh] bg-[var(--bg-secondary)] rounded-[var(--radius-xl)] border border-[var(--border-subtle)] shadow-2xl overflow-hidden flex flex-col">
              <div className="p-5 border-b border-[var(--border-subtle)]">
                <div className="flex items-center justify-between">
                  <div>
                    <h2 className="text-lg font-display font-bold flex items-center gap-2">
                      <Volume2 className="w-5 h-5 text-[var(--accent-primary)]" />
                      Call: {selectedCall.caller_number}
                    </h2>
                    <p className="text-xs text-[var(--text-muted)] mt-1">
                      {formatDuration(selectedCall.duration_seconds)} • {new Date(selectedCall.started_at).toLocaleString()} • {selectedCall.detected_language.toUpperCase()}
                    </p>
                  </div>
                  {selectedCall.ticket_id && (
                    <span className="text-[10px] px-2 py-1 bg-[var(--accent-primary)]/10 text-[var(--accent-primary)] rounded-full font-semibold">Ticket: {selectedCall.ticket_id}</span>
                  )}
                </div>
              </div>

              {/* AI Summary */}
              {selectedCall.ai_summary && (
                <div className="px-5 py-3 bg-[var(--accent-primary)]/5 border-b border-[var(--border-subtle)]">
                  <div className="text-xs font-semibold text-[var(--accent-primary)] mb-1">AI Summary</div>
                  <p className="text-sm text-[var(--text-secondary)] leading-relaxed">{selectedCall.ai_summary}</p>
                </div>
              )}

              {/* Transcript */}
              <div className="flex-1 overflow-y-auto p-5">
                <h3 className="text-xs font-semibold text-[var(--text-muted)] uppercase tracking-wider mb-3">Transcript</h3>
                {selectedCall.transcript && selectedCall.transcript.length > 0 ? (
                  <div className="space-y-3">
                    {selectedCall.transcript.map((segment, i) => (
                      <div key={i} className={`flex gap-3 ${segment.speaker === "customer" ? "" : "flex-row-reverse"}`}>
                        <div className={`max-w-[75%] p-3 rounded-[var(--radius-md)] text-sm ${segment.speaker === "customer" ? "bg-[var(--bg-elevated)] text-[var(--text-primary)]" : "bg-[var(--accent-primary)]/10 text-[var(--text-primary)]"}`}>
                          <div className="text-[10px] font-semibold text-[var(--text-muted)] mb-1">{segment.speaker === "customer" ? "Customer" : "AI Agent"}</div>
                          <p>{segment.text}</p>
                        </div>
                      </div>
                    ))}
                  </div>
                ) : (
                  <p className="text-sm text-[var(--text-muted)] text-center py-8">No transcript available</p>
                )}
              </div>

              <div className="p-4 border-t border-[var(--border-subtle)] flex justify-end">
                <button onClick={() => setSelectedCall(null)} className="px-4 py-2 text-xs font-semibold text-[var(--text-secondary)] bg-[var(--bg-elevated)] border border-[var(--border-subtle)] rounded-[var(--radius-md)]">Close</button>
              </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
