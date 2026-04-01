"use client";

import React, { useState, useEffect, useCallback, useRef } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { cn } from "@/lib/utils";
import {
  Clock, Zap, Activity, CheckCircle, Users, Shield,
  ArrowUpRight, ArrowDownRight, Wifi, WifiOff, Search, Bell,
} from "lucide-react";
import {
  AreaChart, Area, XAxis, YAxis, CartesianGrid, Tooltip,
  ResponsiveContainer,
} from "recharts";

const API = process.env.NEXT_PUBLIC_API_URL || "http://localhost:8000";

function ConfidenceGauge({ value, size = 32 }: { value: number; size?: number }) {
  const r = size / 2 - 3;
  const c = 2 * Math.PI * r;
  const color = value > 0.85 ? "#10b981" : value > 0.7 ? "#f59e0b" : "#f43f5e";
  return (
    <div className="relative inline-flex items-center justify-center" style={{ width: size, height: size }}>
      <svg width={size} height={size} className="-rotate-90">
        <circle cx={size / 2} cy={size / 2} r={r} fill="none" stroke="var(--border-subtle)" strokeWidth={2.5} />
        <circle cx={size / 2} cy={size / 2} r={r} fill="none" stroke={color} strokeWidth={2.5}
          strokeDasharray={c} strokeDashoffset={c - value * c} strokeLinecap="round" className="transition-all duration-700" />
      </svg>
      <span className="absolute text-[9px] font-bold" style={{ color }}>{(value * 100).toFixed(0)}%</span>
    </div>
  );
}

function KPICard({ label, value, target, icon: Icon, color, trend }: {
  label: string; value: string; target?: string; icon: React.ElementType; color: string; trend?: "up" | "down";
}) {
  return (
    <motion.div initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }} className="glass-card p-4 flex items-center gap-4">
      <div className="w-10 h-10 rounded-xl flex items-center justify-center" style={{ background: `${color}20` }}>
        <Icon className="w-5 h-5" style={{ color }} />
      </div>
      <div className="flex-1 min-w-0">
        <p className="text-xs text-[var(--text-muted)] font-medium">{label}</p>
        <div className="flex items-center gap-2">
          <p className="text-lg font-bold">{value}</p>
          {trend && (
            <span className={cn("flex items-center text-[10px] font-semibold", trend === "up" ? "text-emerald-400" : "text-rose-400")}>
              {trend === "up" ? <ArrowUpRight className="w-3 h-3" /> : <ArrowDownRight className="w-3 h-3" />}
            </span>
          )}
        </div>
        {target && <p className="text-[10px] text-[var(--text-muted)]">Target: {target}</p>}
      </div>
    </motion.div>
  );
}

const CHANNEL_ICONS: Record<string, string> = { x: "𝕏", reddit: "🔴", gmail: "📧" };
const SEVERITY_CLASSES: Record<string, string> = {
  critical: "badge-critical",
  high: "badge-high",
  medium: "badge-medium",
  low: "badge-low",
};

export default function CommandCenterPage() {
  const [tickets, setTickets] = useState<any[]>([]);
  const [kpis, setKpis] = useState<any>(null);
  const [connected, setConnected] = useState(false);
  const [search, setSearch] = useState("");
  const wsRef = useRef<WebSocket | null>(null);
  const pingRef = useRef<ReturnType<typeof setInterval> | null>(null);

  const connectWS = useCallback(() => {
    const wsUrl = API.replace("http", "ws") + "/ws/live-feed";
    const ws = new WebSocket(wsUrl);
    wsRef.current = ws;

    ws.onopen = () => {
      setConnected(true);
      pingRef.current = setInterval(() => {
        if (ws.readyState === WebSocket.OPEN) ws.send("ping");
      }, 25000);
    };

    ws.onmessage = (evt) => {
      const data = JSON.parse(evt.data);
      if (data.type === "ticket_batch") setTickets(data.tickets);
      if (data.type === "new_ticket") setTickets((prev) => [data.ticket, ...prev].slice(0, 50));
      if (data.type === "kpi_update") setKpis(data.kpis);
    };

    ws.onclose = () => {
      setConnected(false);
      if (pingRef.current) clearInterval(pingRef.current);
      setTimeout(connectWS, 3000);
    };

    ws.onerror = () => ws.close();
  }, []);

  useEffect(() => {
    connectWS();
    return () => {
      if (pingRef.current) clearInterval(pingRef.current);
      wsRef.current?.close();
    };
  }, [connectWS]);

  const filtered = tickets.filter((t) =>
    !search || t.customer_name?.toLowerCase().includes(search.toLowerCase()) ||
    t.message?.toLowerCase().includes(search.toLowerCase()) ||
    t.product?.toLowerCase().includes(search.toLowerCase())
  );

  // Timeseries for mini chart
  const tsData = tickets.slice(0, 24).map((t, i) => ({
    i,
    sentiment: t.sentiment_score ?? 0,
  })).reverse();

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between flex-wrap gap-4">
        <div>
          <h1 className="text-2xl font-bold">Unified Command Center</h1>
          <p className="text-sm text-[var(--text-muted)]">Real-time omnichannel ticket intelligence</p>
        </div>
        <div className="flex items-center gap-3">
          <div className="flex items-center gap-2 text-xs font-medium">
            {connected ? (
              <><Wifi className="w-3.5 h-3.5 text-emerald-400" /><span className="text-emerald-400">Live</span></>
            ) : (
              <><WifiOff className="w-3.5 h-3.5 text-red-400" /><span className="text-red-400">Reconnecting…</span></>
            )}
          </div>
          <div className="relative">
            <Search className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-[var(--text-muted)]" />
            <input
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Search tickets…"
              className="pl-9 pr-4 py-2 rounded-xl bg-[var(--bg-secondary)] border border-[var(--border-subtle)] text-sm text-[var(--text-primary)] placeholder:text-[var(--text-muted)] focus:outline-none focus:ring-2 focus:ring-blue-500/30 w-56"
            />
          </div>
          <button className="relative p-2.5 rounded-xl bg-[var(--bg-secondary)] border border-[var(--border-subtle)] text-[var(--text-muted)] hover:text-[var(--text-primary)] transition-colors">
            <Bell className="w-4 h-4" />
            <span className="absolute top-1.5 right-1.5 w-2 h-2 bg-red-500 rounded-full" />
          </button>
        </div>
      </div>

      {/* KPI Strip */}
      {kpis && (
        <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-3">
          <KPICard label="First Response Time" value={`${kpis.frt_seconds}s`} target="< 180s" icon={Clock} color="#3b82f6" trend="down" />
          <KPICard label="Automation Rate" value={`${(kpis.automation_rate * 100).toFixed(0)}%`} target="70%" icon={Zap} color="#8b5cf6" trend="up" />
          <KPICard label="Active Tickets" value={`${kpis.active_tickets}`} icon={Activity} color="#06b6d4" />
          <KPICard label="Resolved Today" value={`${kpis.resolved_today}`} icon={CheckCircle} color="#10b981" trend="up" />
          <KPICard label="CSAT Score" value={`${kpis.csat_score}`} target="4.5" icon={Users} color="#f59e0b" />
          <KPICard label="AI Confidence" value={`${(kpis.ai_confidence_avg * 100).toFixed(0)}%`} icon={Shield} color="#8b5cf6" trend="up" />
        </div>
      )}

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-5">
        {/* Live Feed */}
        <div className="lg:col-span-2 glass-card overflow-hidden">
          <div className="px-5 py-4 border-b border-[var(--border-subtle)] flex items-center justify-between">
            <div className="flex items-center gap-3">
              <div className="live-dot" />
              <h2 className="font-semibold text-sm">Live Feed — All Channels</h2>
            </div>
            <span className="text-[11px] text-[var(--text-muted)]">{filtered.length} tickets</span>
          </div>
          <div className="divide-y divide-[var(--border-subtle)] max-h-[600px] overflow-y-auto">
            <AnimatePresence initial={false}>
              {filtered.slice(0, 30).map((t, i) => (
                <motion.div key={t.id + "-" + i} initial={{ opacity: 0, x: 20 }} animate={{ opacity: 1, x: 0 }}
                  transition={{ duration: 0.3, delay: i * 0.02 }}
                  className="px-5 py-4 hover:bg-[var(--bg-card-hover)] transition-colors cursor-pointer">
                  <div className="flex items-start gap-4">
                    <span className={cn("px-2.5 py-1 rounded-lg text-xs font-medium shrink-0", `channel-${t.channel}`)}>
                      {CHANNEL_ICONS[t.channel]} {t.channel?.charAt(0).toUpperCase() + t.channel?.slice(1)}
                    </span>
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2 mb-1 flex-wrap">
                        <span className="font-semibold text-sm">{t.customer_name}</span>
                        <span className="text-xs text-[var(--text-muted)]">{t.customer_handle}</span>
                        <span className="text-[10px] text-[var(--text-muted)] ml-auto">
                          {t.timestamp && new Date(t.timestamp).toLocaleTimeString("en", { hour: "2-digit", minute: "2-digit" })}
                        </span>
                      </div>
                      <p className="text-sm text-[var(--text-secondary)] leading-relaxed line-clamp-2">{t.message}</p>
                      <div className="flex items-center gap-2 mt-2 flex-wrap">
                        <span className={cn("px-2 py-0.5 rounded-full text-[11px] font-semibold uppercase tracking-wider", SEVERITY_CLASSES[t.severity])}>
                          {t.severity}
                        </span>
                        <span className="px-2 py-0.5 rounded-full text-[10px] font-medium bg-[var(--bg-card-hover)] text-[var(--text-secondary)]">{t.intent}</span>
                        <span className="px-2 py-0.5 rounded-full text-[10px] font-medium bg-purple-500/10 text-purple-400">{t.product}</span>
                        {t.sentiment_score < -0.4 && (
                          <span className="px-2 py-0.5 rounded-full text-[10px] font-bold bg-red-500/10 text-red-400 border border-red-500/20 pulse-red">
                            V↓sent {t.sentiment_score.toFixed(1)}
                          </span>
                        )}
                        <span className="ml-auto">
                          <ConfidenceGauge value={t.confidence} />
                        </span>
                      </div>
                    </div>
                  </div>
                </motion.div>
              ))}
            </AnimatePresence>
          </div>
        </div>

        {/* Sidebar Panel */}
        <div className="space-y-5">
          {/* Sentiment Trend Mini Chart */}
          <div className="glass-card p-5">
            <h3 className="text-sm font-semibold mb-3">Sentiment Pulse</h3>
            <ResponsiveContainer width="100%" height={140}>
              <AreaChart data={tsData}>
                <defs>
                  <linearGradient id="sentGrad" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="0%" stopColor="#3b82f6" stopOpacity={0.3} />
                    <stop offset="100%" stopColor="#3b82f6" stopOpacity={0} />
                  </linearGradient>
                </defs>
                <CartesianGrid strokeDasharray="3 3" stroke="var(--border-subtle)" />
                <XAxis dataKey="i" hide />
                <YAxis domain={[-1, 1]} hide />
                <Tooltip
                  contentStyle={{ background: "var(--bg-card)", border: "1px solid var(--border-subtle)", borderRadius: 12, fontSize: 11 }}
                />
                <Area type="monotone" dataKey="sentiment" stroke="#3b82f6" fill="url(#sentGrad)" strokeWidth={2} />
              </AreaChart>
            </ResponsiveContainer>
          </div>

          {/* Pipeline Status */}
          <div className="glass-card p-5">
            <h3 className="text-sm font-semibold mb-3">4-Stage Pipeline</h3>
            <div className="space-y-3">
              {[
                { label: "Stage 1: Ingestion + PII Scrub", status: "active", color: "#3b82f6" },
                { label: "Stage 2: NLP + Identity", status: "active", color: "#8b5cf6" },
                { label: "Stage 3: RAG + Auto-Draft", status: "active", color: "#06b6d4" },
                { label: "Stage 4: RLHF Loop", status: "active", color: "#10b981" },
              ].map((s) => (
                <div key={s.label} className="flex items-center gap-3">
                  <div className="w-2 h-2 rounded-full pulse-green" style={{ background: s.color }} />
                  <span className="text-xs text-[var(--text-secondary)] flex-1">{s.label}</span>
                  <span className="text-[10px] font-medium text-emerald-400 uppercase">{s.status}</span>
                </div>
              ))}
            </div>
          </div>

          {/* FRT Tracker */}
          {kpis && (
            <div className={cn("glass-card p-5", kpis.frt_seconds < 180 ? "glow-emerald" : "glow-rose")}>
              <h3 className="text-sm font-semibold mb-2">⚡ FRT Tracker</h3>
              <div className="text-center">
                <p className={cn("text-4xl font-black", kpis.frt_seconds < 180 ? "text-emerald-400" : "text-rose-400")}>
                  {kpis.frt_seconds}s
                </p>
                <p className="text-[10px] text-[var(--text-muted)] mt-1">Target: &lt; 180s</p>
                <div className="w-full h-2 rounded-full bg-[var(--bg-primary)] mt-3 overflow-hidden">
                  <motion.div
                    initial={{ width: 0 }}
                    animate={{ width: `${Math.min((kpis.frt_seconds / 180) * 100, 100)}%` }}
                    transition={{ duration: 1, ease: "easeOut" }}
                    className={cn("h-full rounded-full", kpis.frt_seconds < 180 ? "bg-emerald-500" : "bg-rose-500")}
                  />
                </div>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
