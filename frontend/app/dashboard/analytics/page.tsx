"use client";

import React, { useState, useEffect, Suspense, lazy } from "react";
import { motion } from "framer-motion";
import { cn } from "@/lib/utils";
import { useTheme } from "next-themes";
import { fetchTrends, fetchClusters } from "@/lib/api";
import type { TrendPoint, ClusterData } from "@/lib/types";
import { Cluster2DFallback } from "@/components/cluster-3d";
import { TrendingUp, AlertTriangle, Zap, Layers, ToggleLeft, ToggleRight } from "lucide-react";
import {
  AreaChart, Area, BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip,
  ResponsiveContainer,
} from "recharts";

// Lazy-load 3D scene to avoid SSR issues
const Cluster3DScene = lazy(() =>
  import("@/components/cluster-3d").then((m) => ({ default: m.Cluster3DScene }))
);

export default function AnalyticsPage() {
  const { theme } = useTheme();
  const [trends, setTrends] = useState<TrendPoint[]>([]);
  const [clusters, setClusters] = useState<ClusterData[]>([]);
  const [use3D, setUse3D] = useState(true);
  const isDark = theme === "dark";

  // Auto-detect device capability — fallback to 2D on low-power
  useEffect(() => {
    let raf = 0;
    const disable3D = () => {
      raf = requestAnimationFrame(() => setUse3D(false));
    };
    if (typeof window !== "undefined") {
      const canvas = document.createElement("canvas");
      const gl = canvas.getContext("webgl2") || canvas.getContext("webgl");
      if (!gl) {
        disable3D();
      } else {
        // Check for low-end GPU by renderer string
        const dbg = gl.getExtension("WEBGL_debug_renderer_info");
        if (dbg) {
          const renderer = gl.getParameter(dbg.UNMASKED_RENDERER_WEBGL).toLowerCase();
          if (renderer.includes("swiftshader") || renderer.includes("llvmpipe") || renderer.includes("software")) {
            disable3D();
          }
        }
        // Check for mobile/low memory
        const nav = navigator as Navigator & { deviceMemory?: number };
        if (nav.deviceMemory && nav.deviceMemory < 4) {
          disable3D();
        }
      }
    }
    return () => cancelAnimationFrame(raf);
  }, []);

  useEffect(() => {
    fetchTrends().then((d) => setTrends(d.timeseries || []));
    fetchClusters().then((d) => setClusters(d.clusters || []));
  }, []);

  const COLORS = [
    "var(--accent-primary)", "var(--accent-secondary)", "var(--accent-teal)",
    "var(--accent-emerald)", "var(--accent-amber)", "var(--accent-rose)",
    "#F472B6", "#6EE7B7",
  ];

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold font-display">Analytics & Trends</h1>
        <p className="text-sm text-[var(--text-muted)]">
          Complaint volume, sentiment analysis, and HDBSCAN cluster visualization
        </p>
      </div>

      {/* ── Channel Volume & Alerts ────────────────────── */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-5">
        {/* Omnichannel Volume */}
        <div className="glass-card p-5">
          <h3 className="text-sm font-semibold mb-4 flex items-center gap-2">
            <TrendingUp className="w-4 h-4 text-[var(--accent-primary)]" />
            Omnichannel Volume (24h)
          </h3>
          <ResponsiveContainer width="100%" height={280}>
            <AreaChart data={trends}>
              <defs>
                <linearGradient id="xg" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="0%" stopColor="var(--accent-primary)" stopOpacity={0.2} />
                  <stop offset="100%" stopColor="var(--accent-primary)" stopOpacity={0} />
                </linearGradient>
                <linearGradient id="rg" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="0%" stopColor="#EA580C" stopOpacity={0.2} />
                  <stop offset="100%" stopColor="#EA580C" stopOpacity={0} />
                </linearGradient>
                <linearGradient id="gg" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="0%" stopColor="var(--accent-emerald)" stopOpacity={0.2} />
                  <stop offset="100%" stopColor="var(--accent-emerald)" stopOpacity={0} />
                </linearGradient>
              </defs>
              <CartesianGrid strokeDasharray="3 3" stroke="var(--border-subtle)" />
              <XAxis dataKey="hour" tick={{ fontSize: 10, fill: "var(--text-muted)" }} />
              <YAxis tick={{ fontSize: 10, fill: "var(--text-muted)" }} />
              <Tooltip
                contentStyle={{
                  background: "var(--bg-card)",
                  border: "1px solid var(--border-subtle)",
                  borderRadius: 12,
                  fontSize: 11,
                }}
              />
              <Area type="monotone" dataKey="x_volume" name="X/Twitter" stroke="var(--accent-primary)" fill="url(#xg)" strokeWidth={2} />
              <Area type="monotone" dataKey="reddit_volume" name="Reddit" stroke="#EA580C" fill="url(#rg)" strokeWidth={2} />
              <Area type="monotone" dataKey="gmail_volume" name="Email" stroke="var(--accent-emerald)" fill="url(#gg)" strokeWidth={2} />
            </AreaChart>
          </ResponsiveContainer>
        </div>

        {/* Critical Alerts */}
        <div className="glass-card p-5">
          <h3 className="text-sm font-semibold mb-4 flex items-center gap-2">
            <AlertTriangle className="w-4 h-4 text-[var(--accent-amber)]" />
            Critical Alerts vs Time
          </h3>
          <ResponsiveContainer width="100%" height={280}>
            <BarChart data={trends}>
              <CartesianGrid strokeDasharray="3 3" stroke="var(--border-subtle)" />
              <XAxis dataKey="hour" tick={{ fontSize: 10, fill: "var(--text-muted)" }} />
              <YAxis tick={{ fontSize: 10, fill: "var(--text-muted)" }} />
              <Tooltip
                contentStyle={{
                  background: "var(--bg-card)",
                  border: "1px solid var(--border-subtle)",
                  borderRadius: 12,
                  fontSize: 11,
                }}
              />
              <Bar dataKey="critical_count" name="Critical" fill="var(--accent-rose)" radius={[4, 4, 0, 0]} />
            </BarChart>
          </ResponsiveContainer>
        </div>
      </div>

      {/* ── HDBSCAN Cluster Visualization ─────────────── */}
      <div className="glass-card p-5">
        <div className="flex items-center justify-between mb-4">
          <h3 className="text-sm font-semibold flex items-center gap-2">
            <Zap className="w-4 h-4 text-[var(--accent-secondary)]" />
            HDBSCAN Complaint Clusters
            <span className="text-[10px] font-normal text-[var(--text-muted)]">
              · {clusters.length} clusters · {clusters.filter((c) => c.is_anomaly).length} anomalies
            </span>
          </h3>

          {/* 3D / 2D Toggle */}
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
          {/* Visualization (3 cols) */}
          <div className="lg:col-span-3 bg-[var(--bg-inset)] rounded-[var(--radius-md)] overflow-hidden border border-[var(--border-subtle)]">
            {clusters.length === 0 ? (
              <div className="w-full h-[400px] flex items-center justify-center text-sm text-[var(--text-muted)]">
                Waiting for clustered ticket embeddings...
              </div>
            ) : use3D ? (
              <Suspense
                fallback={
                  <div className="w-full h-[400px] flex items-center justify-center">
                    <div className="flex flex-col items-center gap-2">
                      <div className="w-6 h-6 border-2 border-[var(--accent-primary)] border-t-transparent rounded-full animate-spin" />
                      <span className="text-[10px] text-[var(--text-muted)]">Loading 3D…</span>
                    </div>
                  </div>
                }
              >
                <Cluster3DScene clusters={clusters} isDark={isDark} />
              </Suspense>
            ) : (
              <Cluster2DFallback clusters={clusters} />
            )}
          </div>

          {/* Cluster List (2 cols) */}
          <div className="lg:col-span-2 space-y-2 max-h-[400px] overflow-y-auto pr-1">
            {clusters.map((c, i) => (
              <motion.div
                key={c.id}
                initial={{ opacity: 0, x: 8 }}
                animate={{ opacity: 1, x: 0 }}
                transition={{ delay: i * 0.04 }}
                className={cn(
                  "p-3.5 rounded-[var(--radius-md)] border transition-all hover:shadow-sm",
                  c.is_anomaly
                    ? "bg-[var(--accent-rose)]/5 border-[var(--accent-rose)]/15"
                    : "bg-[var(--bg-secondary)] border-[var(--border-subtle)]"
                )}
              >
                <div className="flex items-center gap-2 mb-1">
                  <div
                    className="w-2.5 h-2.5 rounded-full shrink-0"
                    style={{
                      background: c.is_anomaly ? "var(--accent-rose)" : COLORS[i % COLORS.length],
                    }}
                  />
                  <span className="text-xs font-semibold flex-1 truncate">{c.label}</span>
                  {c.is_anomaly && (
                    <span className="text-[9px] font-bold text-[var(--accent-rose)] uppercase tracking-wider">
                      Anomaly
                    </span>
                  )}
                </div>
                <div className="flex items-center gap-3 text-[10px] text-[var(--text-muted)]">
                  <span>{c.size} tickets</span>
                  <span className={cn(c.growth_rate > 20 ? "text-[var(--accent-rose)] font-semibold" : "")}>
                    +{c.growth_rate}%/hr
                  </span>
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
