"use client";

import React, { useState, useEffect } from "react";
import { motion } from "framer-motion";
import { cn } from "@/lib/utils";
import { TrendingUp, AlertTriangle, Zap } from "lucide-react";
import {
  AreaChart, Area, BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip,
  ResponsiveContainer, ScatterChart, Scatter, ZAxis, Cell,
} from "recharts";

const API = process.env.NEXT_PUBLIC_API_URL || "http://localhost:8000";

export default function AnalyticsPage() {
  const [trends, setTrends] = useState<any[]>([]);
  const [clusters, setClusters] = useState<any[]>([]);

  useEffect(() => {
    fetch(`${API}/api/v1/analytics/trends`).then((r) => r.json()).then((d) => setTrends(d.timeseries || []));
    fetch(`${API}/api/v1/analytics/clusters`).then((r) => r.json()).then((d) => setClusters(d.clusters || []));
  }, []);

  const COLORS = ["#3b82f6", "#8b5cf6", "#06b6d4", "#10b981", "#f59e0b", "#f43f5e", "#ec4899", "#14b8a6"];

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold">Analytics & Trends</h1>
        <p className="text-sm text-[var(--text-muted)]">Complaint volume, sentiment analysis, and HDBSCAN cluster visualization</p>
      </div>

      {/* Channel Volume */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-5">
        <div className="glass-card p-5">
          <h3 className="text-sm font-semibold mb-4 flex items-center gap-2">
            <TrendingUp className="w-4 h-4 text-blue-400" /> Omnichannel Volume (24h)
          </h3>
          <ResponsiveContainer width="100%" height={280}>
            <AreaChart data={trends}>
              <defs>
                <linearGradient id="xg" x1="0" y1="0" x2="0" y2="1"><stop offset="0%" stopColor="#3b82f6" stopOpacity={0.3} /><stop offset="100%" stopColor="#3b82f6" stopOpacity={0} /></linearGradient>
                <linearGradient id="rg" x1="0" y1="0" x2="0" y2="1"><stop offset="0%" stopColor="#f97316" stopOpacity={0.3} /><stop offset="100%" stopColor="#f97316" stopOpacity={0} /></linearGradient>
                <linearGradient id="gg" x1="0" y1="0" x2="0" y2="1"><stop offset="0%" stopColor="#10b981" stopOpacity={0.3} /><stop offset="100%" stopColor="#10b981" stopOpacity={0} /></linearGradient>
              </defs>
              <CartesianGrid strokeDasharray="3 3" stroke="var(--border-subtle)" />
              <XAxis dataKey="hour" tick={{ fontSize: 10, fill: "var(--text-muted)" }} />
              <YAxis tick={{ fontSize: 10, fill: "var(--text-muted)" }} />
              <Tooltip contentStyle={{ background: "var(--bg-card)", border: "1px solid var(--border-subtle)", borderRadius: 12, fontSize: 11 }} />
              <Area type="monotone" dataKey="x_volume" name="X/Twitter" stroke="#3b82f6" fill="url(#xg)" strokeWidth={2} />
              <Area type="monotone" dataKey="reddit_volume" name="Reddit" stroke="#f97316" fill="url(#rg)" strokeWidth={2} />
              <Area type="monotone" dataKey="gmail_volume" name="Email" stroke="#10b981" fill="url(#gg)" strokeWidth={2} />
            </AreaChart>
          </ResponsiveContainer>
        </div>

        <div className="glass-card p-5">
          <h3 className="text-sm font-semibold mb-4 flex items-center gap-2">
            <AlertTriangle className="w-4 h-4 text-amber-400" /> Critical Alerts vs Sentiment
          </h3>
          <ResponsiveContainer width="100%" height={280}>
            <BarChart data={trends}>
              <CartesianGrid strokeDasharray="3 3" stroke="var(--border-subtle)" />
              <XAxis dataKey="hour" tick={{ fontSize: 10, fill: "var(--text-muted)" }} />
              <YAxis tick={{ fontSize: 10, fill: "var(--text-muted)" }} />
              <Tooltip contentStyle={{ background: "var(--bg-card)", border: "1px solid var(--border-subtle)", borderRadius: 12, fontSize: 11 }} />
              <Bar dataKey="critical_count" name="Critical" fill="#f43f5e" radius={[4, 4, 0, 0]} />
            </BarChart>
          </ResponsiveContainer>
        </div>
      </div>

      {/* HDBSCAN Clusters */}
      <div className="glass-card p-5">
        <h3 className="text-sm font-semibold mb-4 flex items-center gap-2">
          <Zap className="w-4 h-4 text-purple-400" /> HDBSCAN Complaint Clusters
        </h3>
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-5">
          <ResponsiveContainer width="100%" height={320}>
            <ScatterChart>
              <CartesianGrid strokeDasharray="3 3" stroke="var(--border-subtle)" />
              <XAxis type="number" dataKey="x" tick={{ fontSize: 10, fill: "var(--text-muted)" }} name="X" />
              <YAxis type="number" dataKey="y" tick={{ fontSize: 10, fill: "var(--text-muted)" }} name="Y" />
              <ZAxis type="number" dataKey="size" range={[60, 600]} />
              <Tooltip contentStyle={{ background: "var(--bg-card)", border: "1px solid var(--border-subtle)", borderRadius: 12, fontSize: 11 }}
                formatter={(_: any, __: any, props: any) => [props.payload.label, "Cluster"]} />
              <Scatter data={clusters}>
                {clusters.map((c, i) => (
                  <Cell key={c.id} fill={c.is_anomaly ? "#f43f5e" : COLORS[i % COLORS.length]} fillOpacity={0.7} />
                ))}
              </Scatter>
            </ScatterChart>
          </ResponsiveContainer>

          <div className="space-y-2 max-h-[320px] overflow-y-auto">
            {clusters.map((c, i) => (
              <motion.div key={c.id} initial={{ opacity: 0, x: 12 }} animate={{ opacity: 1, x: 0 }} transition={{ delay: i * 0.05 }}
                className={cn("p-3 rounded-xl border transition-colors",
                  c.is_anomaly ? "bg-red-500/5 border-red-500/20" : "bg-[var(--bg-secondary)] border-[var(--border-subtle)]")}>
                <div className="flex items-center gap-2 mb-1">
                  <div className="w-2.5 h-2.5 rounded-full" style={{ background: c.is_anomaly ? "#f43f5e" : COLORS[i % COLORS.length] }} />
                  <span className="text-xs font-semibold flex-1 truncate">{c.label}</span>
                  {c.is_anomaly && <span className="text-[9px] font-bold text-red-400 uppercase">Anomaly</span>}
                </div>
                <div className="flex items-center gap-3 text-[10px] text-[var(--text-muted)]">
                  <span>{c.size} tickets</span>
                  <span className={cn(c.growth_rate > 20 ? "text-red-400 font-semibold" : "")}>+{c.growth_rate}%/hr</span>
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
