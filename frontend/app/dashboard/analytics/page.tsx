"use client";

import React, { useState, useEffect, Suspense, lazy, useCallback } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { cn } from "@/lib/utils";
import { useTheme } from "next-themes";
import {
  fetchTrends, fetchClusters, fetchCategories, fetchResolutionTime,
  fetchCSATTrend, fetchSLACompliance, fetchAgentPerformance, fetchRecommendations,
} from "@/lib/api";
import type {
  TrendPoint, ClusterData, CategoryData, ResolutionTimeData,
  CSATTrend, SLACompliance, AgentPerformance, AIRecommendation,
} from "@/lib/types";
import { Cluster2DFallback } from "@/components/cluster-3d";
import {
  TrendingUp, AlertTriangle, Zap, Layers, ToggleLeft, ToggleRight,
  BarChart3, Clock, Star, Users, Shield, Sparkles, ChevronRight,
  ArrowUpRight, ArrowDownRight, Minus, Target, RefreshCw,
} from "lucide-react";
import {
  AreaChart, Area, BarChart, Bar, LineChart, Line, RadialBarChart, RadialBar,
  XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, Cell, PieChart, Pie, Legend,
} from "recharts";

const Cluster3DScene = lazy(() =>
  import("@/components/cluster-3d").then((m) => ({ default: m.Cluster3DScene }))
);

type Period = "24h" | "7d" | "30d";
type Tab = "overview" | "resolution" | "agents" | "insights";

const TABS: Array<{ id: Tab; label: string; icon: React.ComponentType<{ className?: string }> }> = [
  { id: "overview", label: "Overview", icon: TrendingUp },
  { id: "resolution", label: "Resolution Quality", icon: Clock },
  { id: "agents", label: "Agent Performance", icon: Users },
  { id: "insights", label: "AI Insights", icon: Sparkles },
];

const COLORS = [
  "var(--accent-primary)", "var(--accent-secondary)", "var(--accent-teal)",
  "var(--accent-emerald)", "var(--accent-amber)", "var(--accent-rose)",
  "#F472B6", "#6EE7B7", "#A78BFA", "#34D399",
];

const IMPACT_CONFIG = {
  high: { label: "High Impact", color: "var(--accent-rose)", bg: "bg-[var(--accent-rose)]/10", border: "border-[var(--accent-rose)]/20", dot: "🔴" },
  medium: { label: "Medium Impact", color: "var(--accent-amber)", bg: "bg-[var(--accent-amber)]/10", border: "border-[var(--accent-amber)]/20", dot: "🟡" },
  low: { label: "Quick Win", color: "var(--accent-emerald)", bg: "bg-[var(--accent-emerald)]/10", border: "border-[var(--accent-emerald)]/20", dot: "🟢" },
};

function StatCard({ label, value, sub, delta, icon: Icon, color }: {
  label: string; value: string; sub?: string;
  delta?: number; icon: React.ComponentType<{ className?: string; style?: React.CSSProperties }>;
  color?: string;
}) {
  const DeltaIcon = delta == null ? null : delta > 0 ? ArrowUpRight : delta < 0 ? ArrowDownRight : Minus;
  const deltaColor = delta == null ? "" : delta > 0 ? "text-[var(--accent-rose)]" : delta < 0 ? "text-[var(--accent-emerald)]" : "text-[var(--text-muted)]";
  return (
    <motion.div initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }} className="glass-card p-4">
      <Icon className="w-5 h-5 mb-2" style={{ color: color || "var(--accent-primary)" }} />
      <p className="text-2xl font-bold font-display" style={{ color: color || "var(--accent-primary)" }}>{value}</p>
      <p className="text-xs text-[var(--text-muted)] mt-0.5">{label}</p>
      {sub && <p className="text-[10px] text-[var(--text-muted)] mt-1">{sub}</p>}
      {DeltaIcon && delta != null && (
        <div className={`flex items-center gap-1 mt-1 ${deltaColor}`}>
          <DeltaIcon className="w-3 h-3" />
          <span className="text-[10px] font-semibold">{Math.abs(delta)}% vs last period</span>
        </div>
      )}
    </motion.div>
  );
}

function PeriodSelector({ value, onChange, options }: {
  value: string;
  onChange: (v: string) => void;
  options: string[];
}) {
  return (
    <div className="flex gap-1">
      {options.map((opt) => (
        <button
          key={opt}
          onClick={() => onChange(opt)}
          className={cn(
            "px-3 py-1 rounded-[var(--radius-sm)] text-xs font-medium transition-all",
            value === opt
              ? "bg-[var(--accent-primary)]/20 text-[var(--accent-primary)] border border-[var(--accent-primary)]/30"
              : "text-[var(--text-muted)] hover:text-[var(--text-primary)] border border-transparent"
          )}
        >
          {opt}
        </button>
      ))}
    </div>
  );
}

// ── Tab 1: Overview ───────────────────────────────────────────
function OverviewTab({ isDark }: { isDark: boolean }) {
  const [period, setPeriod] = useState<Period>("7d");
  const [trends, setTrends] = useState<TrendPoint[]>([]);
  const [categories, setCategories] = useState<CategoryData[]>([]);
  const [use3D, setUse3D] = useState(true);
  const [clusters, setClusters] = useState<ClusterData[]>([]);

  useEffect(() => {
    fetchTrends(period as "24h" | "7d" | "30d").then((d) => setTrends(d.timeseries || []));
    fetchCategories(period as "24h" | "7d" | "30d" | "90d").then((d) => setCategories(d.categories || []));
    fetchClusters().then((d) => setClusters(d.clusters || []));
  }, [period]);

  const topCategories = categories.slice(0, 6);

  return (
    <div className="space-y-5">
      {/* Period selector + volume chart */}
      <div className="glass-card p-5">
        <div className="flex items-center justify-between mb-4">
          <h3 className="text-sm font-semibold flex items-center gap-2">
            <TrendingUp className="w-4 h-4 text-[var(--accent-primary)]" />
            Omnichannel Volume
          </h3>
          <PeriodSelector value={period} onChange={(v) => setPeriod(v as Period)} options={["24h", "7d", "30d"]} />
        </div>
        <ResponsiveContainer width="100%" height={240}>
          <AreaChart data={trends}>
            <defs>
              {[
                { id: "xg", color: "var(--accent-primary)" },
                { id: "rg", color: "#EA580C" },
                { id: "gg", color: "var(--accent-emerald)" },
                { id: "wg", color: "#25D366" },
                { id: "vg", color: "var(--accent-teal)" },
              ].map(({ id, color }) => (
                <linearGradient key={id} id={id} x1="0" y1="0" x2="0" y2="1">
                  <stop offset="0%" stopColor={color} stopOpacity={0.2} />
                  <stop offset="100%" stopColor={color} stopOpacity={0} />
                </linearGradient>
              ))}
            </defs>
            <CartesianGrid strokeDasharray="3 3" stroke="var(--border-subtle)" />
            <XAxis dataKey="hour" tick={{ fontSize: 10, fill: "var(--text-muted)" }} />
            <YAxis tick={{ fontSize: 10, fill: "var(--text-muted)" }} />
            <Tooltip contentStyle={{ background: "var(--bg-card)", border: "1px solid var(--border-subtle)", borderRadius: 12, fontSize: 11 }} />
            <Area type="monotone" dataKey="x_volume" name="X/Twitter" stroke="var(--accent-primary)" fill="url(#xg)" strokeWidth={2} />
            <Area type="monotone" dataKey="reddit_volume" name="Reddit" stroke="#EA580C" fill="url(#rg)" strokeWidth={2} />
            <Area type="monotone" dataKey="gmail_volume" name="Email" stroke="var(--accent-emerald)" fill="url(#gg)" strokeWidth={2} />
            <Area type="monotone" dataKey="whatsapp_volume" name="WhatsApp" stroke="#25D366" fill="url(#wg)" strokeWidth={2} />
            <Area type="monotone" dataKey="voice_volume" name="Voice" stroke="var(--accent-teal)" fill="url(#vg)" strokeWidth={2} />
          </AreaChart>
        </ResponsiveContainer>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-5">
        {/* Category donut */}
        <div className="glass-card p-5">
          <h3 className="text-sm font-semibold mb-4 flex items-center gap-2">
            <BarChart3 className="w-4 h-4 text-[var(--accent-secondary)]" /> Complaint Categories
          </h3>
          {topCategories.length === 0 ? (
            <div className="h-[220px] flex items-center justify-center text-sm text-[var(--text-muted)]">Collecting data…</div>
          ) : (
            <div className="flex items-center gap-4">
              <ResponsiveContainer width={180} height={180}>
                <PieChart>
                  <Pie data={topCategories} dataKey="count" nameKey="name" cx="50%" cy="50%" outerRadius={80} innerRadius={50}>
                    {topCategories.map((_, i) => (
                      <Cell key={i} fill={COLORS[i % COLORS.length]} />
                    ))}
                  </Pie>
                  <Tooltip contentStyle={{ background: "var(--bg-card)", border: "1px solid var(--border-subtle)", borderRadius: 8, fontSize: 11 }} />
                </PieChart>
              </ResponsiveContainer>
              <div className="flex-1 space-y-2">
                {topCategories.map((cat, i) => (
                  <div key={cat.name} className="flex items-center gap-2">
                    <div className="w-2 h-2 rounded-full shrink-0" style={{ background: COLORS[i % COLORS.length] }} />
                    <span className="text-xs flex-1 truncate text-[var(--text-primary)]">{cat.name}</span>
                    <span className="text-xs font-semibold text-[var(--text-muted)]">{cat.count}</span>
                    <span className={cn("text-[10px] font-semibold", cat.change_pct > 0 ? "text-[var(--accent-rose)]" : "text-[var(--accent-emerald)]")}>
                      {cat.change_pct > 0 ? "+" : ""}{cat.change_pct}%
                    </span>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>

        {/* Critical alerts */}
        <div className="glass-card p-5">
          <h3 className="text-sm font-semibold mb-4 flex items-center gap-2">
            <AlertTriangle className="w-4 h-4 text-[var(--accent-amber)]" /> Critical Alerts
          </h3>
          <ResponsiveContainer width="100%" height={200}>
            <BarChart data={trends}>
              <CartesianGrid strokeDasharray="3 3" stroke="var(--border-subtle)" />
              <XAxis dataKey="hour" tick={{ fontSize: 10, fill: "var(--text-muted)" }} />
              <YAxis tick={{ fontSize: 10, fill: "var(--text-muted)" }} />
              <Tooltip contentStyle={{ background: "var(--bg-card)", border: "1px solid var(--border-subtle)", borderRadius: 12, fontSize: 11 }} />
              <Bar dataKey="critical_count" name="Critical" fill="var(--accent-rose)" radius={[4, 4, 0, 0]} />
            </BarChart>
          </ResponsiveContainer>
        </div>
      </div>

      {/* HDBSCAN Clusters */}
      <div className="glass-card p-5">
        <div className="flex items-center justify-between mb-4">
          <h3 className="text-sm font-semibold flex items-center gap-2">
            <Zap className="w-4 h-4 text-[var(--accent-secondary)]" />
            HDBSCAN Complaint Clusters
            <span className="text-[10px] font-normal text-[var(--text-muted)]">
              · {clusters.length} clusters · {clusters.filter((c) => c.is_anomaly).length} anomalies
            </span>
          </h3>
          <button
            onClick={() => setUse3D(!use3D)}
            className="flex items-center gap-2 px-3 py-1.5 rounded-[var(--radius-sm)] text-xs font-medium text-[var(--text-muted)] hover:text-[var(--text-primary)] bg-[var(--bg-inset)] border border-[var(--border-subtle)] transition-all"
          >
            <Layers className="w-3.5 h-3.5" />
            {use3D ? "3D" : "2D"}
            {use3D ? <ToggleRight className="w-4 h-4 text-[var(--accent-primary)]" /> : <ToggleLeft className="w-4 h-4" />}
          </button>
        </div>
        <div className="grid grid-cols-1 lg:grid-cols-5 gap-5">
          <div className="lg:col-span-3 bg-[var(--bg-inset)] rounded-[var(--radius-md)] overflow-hidden border border-[var(--border-subtle)]">
            {clusters.length === 0 ? (
              <div className="w-full h-[360px] flex items-center justify-center text-sm text-[var(--text-muted)]">
                Waiting for clustered ticket embeddings…
              </div>
            ) : use3D ? (
              <Suspense fallback={<div className="w-full h-[360px] flex items-center justify-center"><div className="w-6 h-6 border-2 border-[var(--accent-primary)] border-t-transparent rounded-full animate-spin" /></div>}>
                <Cluster3DScene clusters={clusters} isDark={isDark} />
              </Suspense>
            ) : (
              <Cluster2DFallback clusters={clusters} />
            )}
          </div>
          <div className="lg:col-span-2 space-y-2 max-h-[360px] overflow-y-auto pr-1">
            {clusters.map((c, i) => (
              <motion.div key={c.id} initial={{ opacity: 0, x: 8 }} animate={{ opacity: 1, x: 0 }} transition={{ delay: i * 0.04 }}
                className={cn("p-3.5 rounded-[var(--radius-md)] border", c.is_anomaly ? "bg-[var(--accent-rose)]/5 border-[var(--accent-rose)]/15" : "bg-[var(--bg-secondary)] border-[var(--border-subtle)]")}>
                <div className="flex items-center gap-2 mb-1">
                  <div className="w-2.5 h-2.5 rounded-full shrink-0" style={{ background: c.is_anomaly ? "var(--accent-rose)" : COLORS[i % COLORS.length] }} />
                  <span className="text-xs font-semibold flex-1 truncate">{c.label}</span>
                  {c.is_anomaly && <span className="text-[9px] font-bold text-[var(--accent-rose)] uppercase tracking-wider">Anomaly</span>}
                </div>
                <div className="flex items-center gap-3 text-[10px] text-[var(--text-muted)]">
                  <span>{c.size} tickets</span>
                  <span className={cn(c.growth_rate > 20 ? "text-[var(--accent-rose)] font-semibold" : "")}>+{c.growth_rate}%/hr</span>
                  <span>{c.affected_product}</span>
                </div>
              </motion.div>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}

// ── Tab 2: Resolution Quality ─────────────────────────────────
function ResolutionTab() {
  const [period, setPeriod] = useState<"7d" | "30d" | "90d">("7d");
  const [ttrData, setTtrData] = useState<ResolutionTimeData | null>(null);
  const [csatData, setCSATData] = useState<CSATTrend | null>(null);
  const [slaData, setSLAData] = useState<SLACompliance | null>(null);

  useEffect(() => {
    fetchResolutionTime(period).then(setTtrData);
    fetchCSATTrend(period === "7d" ? "7d" : period).then(setCSATData);
    fetchSLACompliance(period).then(setSLAData);
  }, [period]);

  const slaColors = { p1: "var(--accent-rose)", p2: "var(--accent-amber)", p3: "var(--accent-primary)", p4: "var(--accent-emerald)" };

  return (
    <div className="space-y-5">
      <div className="flex items-center justify-between">
        <h2 className="text-sm font-semibold text-[var(--text-muted)]">Resolution Quality Metrics</h2>
        <PeriodSelector value={period} onChange={(v) => setPeriod(v as "7d" | "30d" | "90d")} options={["7d", "30d", "90d"]} />
      </div>

      {/* KPI row */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        <StatCard label="Avg Resolution Time" value={ttrData ? `${ttrData.overall_avg_hours}h` : "—"} sub="All channels combined" icon={Clock} color="var(--accent-primary)" />
        <StatCard label="Tickets Resolved" value={ttrData?.total_resolved?.toString() || "—"} sub={`In last ${period}`} icon={Target} color="var(--accent-emerald)" />
        <StatCard label="Avg CSAT Score" value={csatData?.overall_avg != null ? `${csatData.overall_avg}/5` : "—"} sub="Customer satisfaction" icon={Star} color="var(--accent-amber)" />
        <StatCard label="CSAT Response Rate" value={csatData ? `${csatData.response_rate_pct}%` : "—"} sub={`${csatData?.total_responses || 0} responses`} icon={Users} color="var(--accent-secondary)" />
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-5">
        {/* TTR by category */}
        <div className="glass-card p-5">
          <h3 className="text-sm font-semibold mb-4 flex items-center gap-2">
            <Clock className="w-4 h-4 text-[var(--accent-primary)]" /> Avg Resolution Time by Category (hours)
          </h3>
          {!ttrData || ttrData.by_category.length === 0 ? (
            <div className="h-[200px] flex items-center justify-center text-sm text-[var(--text-muted)]">No resolved tickets yet in this period</div>
          ) : (
            <ResponsiveContainer width="100%" height={220}>
              <BarChart data={ttrData.by_category.slice(0, 8)} layout="vertical">
                <CartesianGrid strokeDasharray="3 3" stroke="var(--border-subtle)" horizontal={false} />
                <XAxis type="number" tick={{ fontSize: 10, fill: "var(--text-muted)" }} />
                <YAxis dataKey="name" type="category" tick={{ fontSize: 10, fill: "var(--text-muted)" }} width={90} />
                <Tooltip contentStyle={{ background: "var(--bg-card)", border: "1px solid var(--border-subtle)", borderRadius: 8, fontSize: 11 }} formatter={(v) => [`${v}h`, "Avg Time"]} />
                <Bar dataKey="avg_hours" fill="var(--accent-primary)" radius={[0, 4, 4, 0]}>
                  {ttrData.by_category.slice(0, 8).map((_, i) => (
                    <Cell key={i} fill={COLORS[i % COLORS.length]} />
                  ))}
                </Bar>
              </BarChart>
            </ResponsiveContainer>
          )}
        </div>

        {/* CSAT trend */}
        <div className="glass-card p-5">
          <h3 className="text-sm font-semibold mb-4 flex items-center gap-2">
            <Star className="w-4 h-4 text-[var(--accent-amber)]" /> CSAT Score Trend
          </h3>
          {!csatData || csatData.timeseries.filter(p => p.avg_score != null).length === 0 ? (
            <div className="h-[200px] flex items-center justify-center text-sm text-[var(--text-muted)]">No CSAT responses yet</div>
          ) : (
            <ResponsiveContainer width="100%" height={220}>
              <LineChart data={csatData.timeseries}>
                <CartesianGrid strokeDasharray="3 3" stroke="var(--border-subtle)" />
                <XAxis dataKey="date" tick={{ fontSize: 9, fill: "var(--text-muted)" }} tickFormatter={(v) => v.slice(5)} />
                <YAxis domain={[1, 5]} tick={{ fontSize: 10, fill: "var(--text-muted)" }} />
                <Tooltip contentStyle={{ background: "var(--bg-card)", border: "1px solid var(--border-subtle)", borderRadius: 8, fontSize: 11 }} formatter={(v) => [v ? `${Number(v).toFixed(1)} ⭐` : "—", "CSAT"]} />
                <Line type="monotone" dataKey="avg_score" stroke="var(--accent-amber)" strokeWidth={2.5} dot={{ fill: "var(--accent-amber)", r: 3 }} connectNulls />
              </LineChart>
            </ResponsiveContainer>
          )}
        </div>
      </div>

      {/* SLA compliance */}
      <div className="glass-card p-5">
        <h3 className="text-sm font-semibold mb-4 flex items-center gap-2">
          <Shield className="w-4 h-4 text-[var(--accent-emerald)]" /> SLA Compliance by Priority
        </h3>
        {!slaData ? (
          <div className="h-20 flex items-center justify-center text-sm text-[var(--text-muted)]">Loading…</div>
        ) : (
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
            {(["p1", "p2", "p3", "p4"] as const).map((p) => {
              const data = slaData.by_priority[p];
              if (!data) return null;
              const pct = data.compliance_pct;
              const color = slaColors[p];
              return (
                <div key={p} className="text-center">
                  <p className="text-xs font-semibold mb-2" style={{ color }}>{p.toUpperCase()}</p>
                  <div className="relative w-20 h-20 mx-auto">
                    <svg viewBox="0 0 36 36" className="w-full h-full -rotate-90">
                      <circle cx="18" cy="18" r="15.9" fill="none" stroke="var(--border-subtle)" strokeWidth="2.5" />
                      <motion.circle
                        cx="18" cy="18" r="15.9" fill="none"
                        stroke={color} strokeWidth="2.5"
                        strokeDasharray={`${pct} ${100 - pct}`}
                        strokeLinecap="round"
                        initial={{ strokeDasharray: "0 100" }}
                        animate={{ strokeDasharray: `${pct} ${100 - pct}` }}
                        transition={{ duration: 1, ease: "easeOut" }}
                      />
                    </svg>
                    <div className="absolute inset-0 flex items-center justify-center">
                      <span className="text-sm font-bold" style={{ color }}>{pct}%</span>
                    </div>
                  </div>
                  <p className="text-[10px] text-[var(--text-muted)] mt-2">
                    {data.compliant} / {data.compliant + data.breached} resolved
                  </p>
                  {data.breached > 0 && (
                    <p className="text-[10px] text-[var(--accent-rose)]">{data.breached} breached</p>
                  )}
                </div>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
}

// ── Tab 3: Agent Performance ──────────────────────────────────
function AgentsTab() {
  const [period, setPeriod] = useState<"7d" | "30d" | "90d">("7d");
  const [agents, setAgents] = useState<AgentPerformance[]>([]);

  useEffect(() => {
    fetchAgentPerformance(period).then((d) => setAgents(d.agents || []));
  }, [period]);

  const maxTickets = Math.max(...agents.map(a => a.tickets), 1);

  return (
    <div className="space-y-5">
      <div className="flex items-center justify-between">
        <h2 className="text-sm font-semibold text-[var(--text-muted)]">Agent Performance Leaderboard</h2>
        <PeriodSelector value={period} onChange={(v) => setPeriod(v as "7d" | "30d" | "90d")} options={["7d", "30d", "90d"]} />
      </div>

      {agents.length === 0 ? (
        <div className="glass-card p-10 text-center text-[var(--text-muted)] text-sm">
          <Users className="w-8 h-8 mx-auto mb-3 opacity-40" />
          No resolution data yet. Agents need to resolve tickets to appear here.
        </div>
      ) : (
        <div className="glass-card overflow-hidden">
          <div className="overflow-x-auto no-scrollbar">
            <div className="min-w-[600px]">
              <div className="grid grid-cols-[2fr_1fr_1fr_1fr_1fr] text-[10px] font-semibold uppercase tracking-wider text-[var(--text-muted)] px-5 py-3 border-b border-[var(--border-subtle)] bg-[var(--bg-inset)]">
                <span>Agent</span>
                <span className="text-center">Tickets</span>
                <span className="text-center">Avg Time</span>
                <span className="text-center">CSAT</span>
                <span className="text-center">Escalations</span>
              </div>
              {agents.map((agent, i) => (
                <motion.div
                  key={agent.agent_id}
                  initial={{ opacity: 0, x: -8 }}
                  animate={{ opacity: 1, x: 0 }}
                  transition={{ delay: i * 0.05 }}
                  className="grid grid-cols-[2fr_1fr_1fr_1fr_1fr] px-5 py-3.5 border-b border-[var(--border-subtle)] hover:bg-[var(--bg-inset)] transition-colors items-center"
                >
                  <div className="flex items-center gap-3">
                    <div className="w-7 h-7 rounded-full bg-[var(--accent-primary)]/20 flex items-center justify-center text-xs font-bold text-[var(--accent-primary)]">
                      {i + 1}
                    </div>
                    <div>
                      <p className="text-sm font-medium">{agent.name}</p>
                      <div className="w-24 h-1 mt-1 rounded-full bg-[var(--bg-secondary)] overflow-hidden">
                        <motion.div
                          initial={{ width: 0 }}
                          animate={{ width: `${(agent.tickets / maxTickets) * 100}%` }}
                          transition={{ duration: 0.8, delay: i * 0.05 }}
                          className="h-full rounded-full bg-[var(--accent-primary)]"
                        />
                      </div>
                    </div>
                  </div>
                  <p className="text-sm font-semibold text-center">{agent.tickets}</p>
                  <p className="text-sm text-center">
                    <span className={cn("font-semibold", agent.avg_resolution_hours < 2 ? "text-[var(--accent-emerald)]" : agent.avg_resolution_hours > 8 ? "text-[var(--accent-rose)]" : "")}>
                      {agent.avg_resolution_hours}h
                    </span>
                  </p>
                  <p className="text-sm text-center">
                    {agent.avg_csat != null ? (
                      <span className={cn("font-semibold", agent.avg_csat >= 4 ? "text-[var(--accent-emerald)]" : agent.avg_csat >= 3 ? "text-[var(--accent-amber)]" : "text-[var(--accent-rose)]")}>
                        {agent.avg_csat} ⭐
                      </span>
                    ) : <span className="text-[var(--text-muted)]">—</span>}
                  </p>
                  <p className={cn("text-sm font-semibold text-center", agent.escalations > 0 ? "text-[var(--accent-amber)]" : "text-[var(--accent-emerald)]")}>
                    {agent.escalations}
                  </p>
                </motion.div>
              ))}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

// ── Tab 4: AI Insights ────────────────────────────────────────
function InsightsTab({ isDark }: { isDark: boolean }) {
  const [clusters, setClusters] = useState<ClusterData[]>([]);
  const [recommendations, setRecommendations] = useState<AIRecommendation[]>([]);
  const [recSource, setRecSource] = useState<string>("");
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);

  const load = useCallback(async (silent = false) => {
    if (!silent) setLoading(true);
    else setRefreshing(true);
    try {
      const [clusterRes, recRes] = await Promise.all([fetchClusters(), fetchRecommendations()]);
      setClusters(clusterRes.clusters || []);
      setRecommendations(recRes.recommendations || []);
      setRecSource(recRes.source || "");
    } catch {
      // ignore
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, []);

  useEffect(() => { load(); }, [load]);

  return (
    <div className="space-y-5">
      <div className="flex items-center justify-between">
        <h2 className="text-sm font-semibold text-[var(--text-muted)]">AI-Powered Improvement Insights</h2>
        <button
          onClick={() => load(true)}
          disabled={refreshing}
          className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium text-[var(--text-muted)] hover:text-[var(--text-primary)] bg-[var(--bg-inset)] border border-[var(--border-subtle)] rounded-[var(--radius-sm)] transition-all"
        >
          <RefreshCw className={cn("w-3.5 h-3.5", refreshing && "animate-spin")} />
          Refresh
        </button>
      </div>

      {/* What to Improve */}
      <div className="glass-card p-5">
        <div className="flex items-center gap-2 mb-4">
          <Sparkles className="w-4 h-4 text-[var(--accent-secondary)]" />
          <h3 className="text-sm font-semibold">What to Improve</h3>
          {recSource && (
            <span className="text-[10px] text-[var(--text-muted)] bg-[var(--bg-inset)] px-2 py-0.5 rounded-full border border-[var(--border-subtle)]">
              {recSource === "ai" ? "✨ Gemini AI" : "Rule-based"}
            </span>
          )}
        </div>

        {loading ? (
          <div className="space-y-3">
            {[1, 2, 3].map((i) => (
              <div key={i} className="h-16 rounded-[var(--radius-md)] bg-[var(--bg-inset)] animate-pulse" />
            ))}
          </div>
        ) : recommendations.length === 0 ? (
          <div className="text-center py-8 text-[var(--text-muted)] text-sm">
            <Sparkles className="w-8 h-8 mx-auto mb-3 opacity-30" />
            Not enough data yet. Insights will appear once more tickets are processed.
          </div>
        ) : (
          <div className="space-y-3">
            {recommendations.map((rec, i) => {
              const cfg = IMPACT_CONFIG[rec.impact] || IMPACT_CONFIG.medium;
              return (
                <motion.div
                  key={i}
                  initial={{ opacity: 0, y: 8 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{ delay: i * 0.08 }}
                  className={cn("p-4 rounded-[var(--radius-md)] border", cfg.bg, cfg.border)}
                >
                  <div className="flex items-start gap-3">
                    <span className="text-base mt-0.5">{cfg.dot}</span>
                    <div className="flex-1">
                      <div className="flex items-center gap-2 mb-1">
                        <p className="text-sm font-semibold">{rec.title}</p>
                        <span className="text-[10px] font-medium px-2 py-0.5 rounded-full border" style={{ color: cfg.color, borderColor: cfg.color + "40", background: cfg.color + "10" }}>
                          {cfg.label}
                        </span>
                      </div>
                      <p className="text-xs text-[var(--text-muted)] leading-relaxed">{rec.detail}</p>
                    </div>
                    <ChevronRight className="w-4 h-4 text-[var(--text-muted)] shrink-0 mt-0.5" />
                  </div>
                </motion.div>
              );
            })}
          </div>
        )}
      </div>

      {/* Active cluster anomalies */}
      {clusters.filter(c => c.is_anomaly).length > 0 && (
        <div className="glass-card p-5">
          <h3 className="text-sm font-semibold mb-4 flex items-center gap-2">
            <AlertTriangle className="w-4 h-4 text-[var(--accent-rose)]" /> Active Anomaly Clusters
          </h3>
          <div className="space-y-3">
            {clusters.filter(c => c.is_anomaly).map((c, i) => (
              <div key={c.id} className="flex items-center gap-3 p-3 rounded-[var(--radius-md)] bg-[var(--accent-rose)]/5 border border-[var(--accent-rose)]/15">
                <div className="w-2.5 h-2.5 rounded-full bg-[var(--accent-rose)] animate-pulse shrink-0" />
                <div className="flex-1">
                  <p className="text-sm font-medium">{c.label}</p>
                  <p className="text-[10px] text-[var(--text-muted)]">{c.size} tickets · {c.affected_product}</p>
                </div>
                <span className={cn("text-xs font-bold", c.growth_rate > 20 ? "text-[var(--accent-rose)]" : "text-[var(--accent-amber)]")}>
                  +{c.growth_rate}%/hr
                </span>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Top clusters summary */}
      <div className="glass-card p-5">
        <h3 className="text-sm font-semibold mb-4 flex items-center gap-2">
          <Zap className="w-4 h-4 text-[var(--accent-secondary)]" /> Complaint Cluster Summary
        </h3>
        {clusters.filter(c => !c.is_anomaly).length === 0 ? (
          <p className="text-sm text-[var(--text-muted)]">No clusters detected yet.</p>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
            {clusters.filter(c => !c.is_anomaly).slice(0, 6).map((c, i) => (
              <div key={c.id} className="flex items-center gap-3 p-3 rounded-[var(--radius-md)] bg-[var(--bg-secondary)] border border-[var(--border-subtle)]">
                <div className="w-2.5 h-2.5 rounded-full shrink-0" style={{ background: COLORS[i % COLORS.length] }} />
                <div className="flex-1 min-w-0">
                  <p className="text-xs font-semibold truncate">{c.label}</p>
                  <p className="text-[10px] text-[var(--text-muted)]">{c.size} tickets · {c.affected_product}</p>
                </div>
                <span className={cn("text-xs font-semibold shrink-0", c.growth_rate > 10 ? "text-[var(--accent-amber)]" : "text-[var(--text-muted)]")}>
                  +{c.growth_rate}%
                </span>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

// ── Main Page ─────────────────────────────────────────────────
export default function AnalyticsPage() {
  const { theme } = useTheme();
  const [activeTab, setActiveTab] = useState<Tab>("overview");
  const isDark = theme === "dark";

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold font-display">Analytics & Intelligence</h1>
        <p className="text-sm text-[var(--text-muted)]">
          Complaint patterns, resolution quality, agent performance, and AI-powered improvement recommendations
        </p>
      </div>

      {/* Tab navigation */}
      <div className="flex gap-1 bg-[var(--bg-inset)] p-1 rounded-[var(--radius-md)] border border-[var(--border-subtle)] w-fit">
        {TABS.map(({ id, label, icon: Icon }) => (
          <button
            key={id}
            onClick={() => setActiveTab(id)}
            className={cn(
              "flex items-center gap-2 px-4 py-2 rounded-[var(--radius-sm)] text-sm font-medium transition-all",
              activeTab === id
                ? "bg-[var(--bg-card)] text-[var(--text-primary)] shadow-sm border border-[var(--border-subtle)]"
                : "text-[var(--text-muted)] hover:text-[var(--text-primary)]"
            )}
          >
            <Icon className="w-4 h-4" />
            {label}
          </button>
        ))}
      </div>

      {/* Tab content */}
      <AnimatePresence mode="wait">
        <motion.div
          key={activeTab}
          initial={{ opacity: 0, y: 8 }}
          animate={{ opacity: 1, y: 0 }}
          exit={{ opacity: 0, y: -8 }}
          transition={{ duration: 0.15 }}
        >
          {activeTab === "overview" && <OverviewTab isDark={isDark} />}
          {activeTab === "resolution" && <ResolutionTab />}
          {activeTab === "agents" && <AgentsTab />}
          {activeTab === "insights" && <InsightsTab isDark={isDark} />}
        </motion.div>
      </AnimatePresence>
    </div>
  );
}
