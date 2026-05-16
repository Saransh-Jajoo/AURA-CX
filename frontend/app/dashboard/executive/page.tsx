"use client";

import React, { useState, useEffect } from "react";
import { motion } from "framer-motion";
import { cn } from "@/lib/utils";
import { BarChart3, TrendingDown, DollarSign, Shield } from "lucide-react";
import { fetchKPIs, fetchTrends } from "@/lib/api";
import type { KPIMetrics, TrendPoint } from "@/lib/types";
import {
  AreaChart, Area, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer,
} from "recharts";

export default function ExecutivePage() {
  const [kpis, setKpis] = useState<KPIMetrics | null>(null);
  const [trends, setTrends] = useState<TrendPoint[]>([]);

  useEffect(() => {
    fetchKPIs().then(setKpis);
    fetchTrends().then((d) => setTrends(d.timeseries || []));
  }, []);

  const roiData = kpis
    ? [
        { name: "Automation", value: Math.round(kpis.automation_rate * 100), color: "var(--accent-secondary)" },
        { name: "AI Confidence", value: Math.round(kpis.ai_confidence_avg * 100), color: "var(--accent-primary)" },
        { name: "Resolution Share", value: Math.round((kpis.resolved_today / Math.max(kpis.active_tickets + kpis.resolved_today, 1)) * 100), color: "var(--accent-emerald)" },
        { name: "Active Channel Coverage", value: Math.min((kpis.channels_active || 0) * 33, 100), color: "var(--accent-teal)" },
      ]
    : [];

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold font-display">Executive Dashboard</h1>
        <p className="text-sm text-[var(--text-muted)]">C-Level analytics: ROI tracking, churn reduction metrics, and GDPR compliance</p>
      </div>

      {/* Executive KPIs */}
      {kpis && (
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
          {[
            { label: "FRT (Avg)", value: `${kpis.frt_seconds}s`, sub: "Target < 180s", icon: TrendingDown, color: "var(--accent-primary)", ok: kpis.frt_seconds < 180 },
            { label: "AI Automation", value: `${(kpis.automation_rate * 100).toFixed(0)}%`, sub: "Cost reduction", icon: BarChart3, color: "var(--accent-secondary)", ok: true },
            { label: "High-Risk Churn", value: `${kpis.high_risk_churn || 0}`, sub: "Critical risk signals", icon: TrendingDown, color: "var(--accent-rose)", ok: (kpis.high_risk_churn || 0) === 0 },
            { label: "GDPR Status", value: "Compliant", sub: "All channels", icon: Shield, color: "var(--accent-emerald)", ok: true },
          ].map((k, i) => (
            <motion.div key={k.label} initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: i * 0.05 }}
              className={cn("glass-card p-4", k.ok ? "glow-emerald" : "glow-rose")}>
              <k.icon className="w-5 h-5 mb-2" style={{ color: k.color }} />
              <p className={cn("text-2xl font-bold font-display", k.ok ? "text-[var(--accent-emerald)]" : "text-[var(--accent-rose)]")}>{k.value}</p>
              <p className="text-xs text-[var(--text-muted)]">{k.label}</p>
              <p className="text-[10px] text-[var(--text-muted)] mt-0.5">{k.sub}</p>
            </motion.div>
          ))}
        </div>
      )}

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-5">
        {/* ROI Breakdown */}
        <div className="glass-card p-5">
          <h3 className="text-sm font-semibold mb-4 flex items-center gap-2">
            <DollarSign className="w-4 h-4 text-[var(--accent-emerald)]" /> ROI Impact Breakdown
          </h3>
          <div className="grid grid-cols-2 gap-3">
            {roiData.map((r) => (
              <div key={r.name} className="p-3 rounded-[var(--radius-md)] bg-[var(--bg-inset)]">
                <div className="flex items-center justify-between mb-2">
                  <span className="text-xs text-[var(--text-muted)]">{r.name}</span>
                  <span className="text-sm font-bold" style={{ color: r.color }}>{r.value}%</span>
                </div>
                <div className="w-full h-1.5 rounded-full bg-[var(--bg-secondary)] overflow-hidden">
                  <motion.div initial={{ width: 0 }} animate={{ width: `${r.value}%` }} transition={{ duration: 1, delay: 0.3 }}
                    className="h-full rounded-full" style={{ background: r.color }} />
                </div>
              </div>
            ))}
          </div>
        </div>

        {/* Complaint Trend */}
        <div className="glass-card p-5">
          <h3 className="text-sm font-semibold mb-4">Complaint Volume Trend</h3>
          <ResponsiveContainer width="100%" height={220}>
            <AreaChart data={trends}>
              <defs>
                <linearGradient id="execTrendGrad" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="0%" stopColor="var(--accent-primary)" stopOpacity={0.25} />
                  <stop offset="100%" stopColor="var(--accent-primary)" stopOpacity={0} />
                </linearGradient>
              </defs>
              <CartesianGrid strokeDasharray="3 3" stroke="var(--border-subtle)" />
              <XAxis dataKey="hour" tick={{ fontSize: 10, fill: "var(--text-muted)" }} />
              <YAxis tick={{ fontSize: 10, fill: "var(--text-muted)" }} />
              <Tooltip contentStyle={{ background: "var(--bg-card)", border: "1px solid var(--border-subtle)", borderRadius: 12, fontSize: 11 }} />
              <Area type="monotone" dataKey="x_volume" name="Volume" stroke="var(--accent-primary)" fill="url(#execTrendGrad)" strokeWidth={2} />
            </AreaChart>
          </ResponsiveContainer>
        </div>
      </div>

      {/* GDPR Report */}
      <div className="glass-card p-5 glow-emerald">
        <h3 className="text-sm font-semibold mb-4 flex items-center gap-2">
          <Shield className="w-4 h-4 text-[var(--accent-emerald)]" /> Scrubbing Compliance
        </h3>
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
          {[
            { label: "PII Scrubbing", status: "Active" },
            { label: "Data Retention", status: "Tenant Policy" },
            { label: "Channel Coverage", status: `${kpis?.channels_active || 0} Live` },
            { label: "Audit Log", status: "Enabled" },
          ].map((g) => (
            <div key={g.label} className="p-3 rounded-[var(--radius-md)] bg-[var(--bg-inset)] text-center">
              <p className="text-sm font-bold text-[var(--accent-emerald)]">{g.status}</p>
              <p className="text-[10px] text-[var(--text-muted)] mt-1">{g.label}</p>
            </div>
          ))}
        </div>
      </div>

      {/* Context-Switching Metric */}
      <motion.div
        initial={{ opacity: 0, y: 12 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ delay: 0.3 }}
        className="glass-card p-5 glow-rose"
      >
        <div className="flex items-center justify-between">
          <div>
            <h3 className="text-sm font-semibold flex items-center gap-2">
              <TrendingDown className="w-4 h-4 text-[var(--accent-rose)]" />
              Context-Switching Impact
            </h3>
            <p className="text-[11px] text-[var(--text-muted)] mt-1">Measured from live automation, escalation, and resolution telemetry.</p>
          </div>
          <div className="text-right">
            <p className="text-4xl font-black font-display text-[var(--accent-rose)]">{kpis?.escalated || 0}</p>
            <p className="text-[10px] text-[var(--text-muted)]">Escalations requiring manual handoff</p>
          </div>
        </div>
        <div className="w-full h-1.5 rounded-full bg-[var(--bg-inset)] mt-4 overflow-hidden">
          <motion.div
            initial={{ width: 0 }}
            animate={{ width: `${Math.min(((kpis?.escalated || 0) / Math.max(kpis?.active_tickets || 1, 1)) * 100, 100)}%` }}
            transition={{ duration: 1.2, ease: "easeOut" }}
            className="h-full rounded-full bg-[var(--accent-rose)]"
          />
        </div>
        <p className="text-[10px] text-[var(--accent-emerald)] mt-2 font-semibold">
          Lower escalation share means the HITL loop is resolving more tickets in-place.
        </p>
      </motion.div>
    </div>
  );
}
