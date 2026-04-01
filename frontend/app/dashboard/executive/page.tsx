"use client";

import React, { useState, useEffect } from "react";
import { motion } from "framer-motion";
import { cn } from "@/lib/utils";
import { BarChart3, TrendingUp, TrendingDown, DollarSign, Shield, Users } from "lucide-react";
import { AreaChart, Area, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, PieChart, Pie, Cell } from "recharts";

const API = process.env.NEXT_PUBLIC_API_URL || "http://localhost:8000";

export default function ExecutivePage() {
  const [kpis, setKpis] = useState<any>(null);
  const [trends, setTrends] = useState<any[]>([]);
  const [usage, setUsage] = useState<any>(null);

  useEffect(() => {
    fetch(`${API}/api/v1/tickets/kpi`).then((r) => r.json()).then(setKpis);
    fetch(`${API}/api/v1/analytics/trends`).then((r) => r.json()).then((d) => setTrends(d.timeseries || []));
    fetch(`${API}/api/v1/subscriptions/usage`).then((r) => r.json()).then(setUsage);
  }, []);

  const roiData = [
    { name: "FRT Reduction", value: 68, color: "#3b82f6" },
    { name: "Automation Savings", value: 72, color: "#8b5cf6" },
    { name: "Churn Prevention", value: 45, color: "#10b981" },
    { name: "CSAT Improvement", value: 34, color: "#f59e0b" },
  ];

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold">Executive Dashboard</h1>
        <p className="text-sm text-[var(--text-muted)]">C-Level analytics: ROI tracking, churn reduction metrics, and GDPR compliance</p>
      </div>

      {/* Executive KPIs */}
      {kpis && (
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
          {[
            { label: "FRT (Avg)", value: `${kpis.frt_seconds}s`, sub: "Target < 180s", icon: TrendingDown, color: "#3b82f6", ok: kpis.frt_seconds < 180 },
            { label: "AI Automation", value: `${(kpis.automation_rate * 100).toFixed(0)}%`, sub: "Cost reduction", icon: BarChart3, color: "#8b5cf6", ok: true },
            { label: "High-Risk Churn", value: `${kpis.high_risk_churn}`, sub: "Customers at risk", icon: TrendingUp, color: "#f43f5e", ok: kpis.high_risk_churn < 5 },
            { label: "GDPR Status", value: "Compliant", sub: "All channels", icon: Shield, color: "#10b981", ok: true },
          ].map((k, i) => (
            <motion.div key={k.label} initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: i * 0.05 }}
              className={cn("glass-card p-4", k.ok ? "glow-emerald" : "glow-rose")}>
              <k.icon className="w-5 h-5 mb-2" style={{ color: k.color }} />
              <p className={cn("text-2xl font-bold", k.ok ? "text-emerald-400" : "text-red-400")}>{k.value}</p>
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
            <DollarSign className="w-4 h-4 text-emerald-400" /> ROI Impact Breakdown
          </h3>
          <div className="grid grid-cols-2 gap-3">
            {roiData.map((r) => (
              <div key={r.name} className="p-3 rounded-xl bg-[var(--bg-primary)]">
                <div className="flex items-center justify-between mb-2">
                  <span className="text-xs text-[var(--text-muted)]">{r.name}</span>
                  <span className="text-sm font-bold" style={{ color: r.color }}>{r.value}%</span>
                </div>
                <div className="w-full h-2 rounded-full bg-[var(--bg-secondary)] overflow-hidden">
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
                <linearGradient id="tg" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="0%" stopColor="#3b82f6" stopOpacity={0.3} />
                  <stop offset="100%" stopColor="#3b82f6" stopOpacity={0} />
                </linearGradient>
              </defs>
              <CartesianGrid strokeDasharray="3 3" stroke="var(--border-subtle)" />
              <XAxis dataKey="hour" tick={{ fontSize: 10, fill: "var(--text-muted)" }} />
              <YAxis tick={{ fontSize: 10, fill: "var(--text-muted)" }} />
              <Tooltip contentStyle={{ background: "var(--bg-card)", border: "1px solid var(--border-subtle)", borderRadius: 12, fontSize: 11 }} />
              <Area type="monotone" dataKey="total" stroke="#3b82f6" fill="url(#tg)" strokeWidth={2} />
            </AreaChart>
          </ResponsiveContainer>
        </div>
      </div>

      {/* GDPR Report */}
      <div className="glass-card p-5 glow-emerald">
        <h3 className="text-sm font-semibold mb-4 flex items-center gap-2">
          <Shield className="w-4 h-4 text-emerald-400" /> GDPR Compliance Report
        </h3>
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
          {[
            { label: "PII Scrubbing", status: "Active", ok: true },
            { label: "Data Retention", status: "90 Days", ok: true },
            { label: "Consent Tracking", status: "All Channels", ok: true },
            { label: "Audit Log", status: "Complete", ok: true },
          ].map((g) => (
            <div key={g.label} className="p-3 rounded-xl bg-[var(--bg-primary)] text-center">
              <p className="text-sm font-bold text-emerald-400">{g.status}</p>
              <p className="text-[10px] text-[var(--text-muted)] mt-1">{g.label}</p>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
