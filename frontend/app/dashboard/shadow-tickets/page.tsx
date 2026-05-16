"use client";

import React, { useState, useEffect } from "react";
import { motion } from "framer-motion";
import { cn } from "@/lib/utils";
import { fetchShadowTickets } from "@/lib/api";
import type { ShadowTicket } from "@/lib/types";
import { AlertTriangle, TrendingUp, Eye, Radar } from "lucide-react";

export default function ShadowTicketsPage() {
  const [shadows, setShadows] = useState<ShadowTicket[]>([]);

  useEffect(() => {
    fetchShadowTickets().then((d) => setShadows(d.shadow_tickets || []));
  }, []);

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold font-display">Shadow Tickets</h1>
        <p className="text-sm text-[var(--text-muted)]">
          Proactive anomaly detection via HDBSCAN clustering — issues surfaced before customers report them
        </p>
      </div>

      {shadows.length === 0 ? (
        <motion.div
          initial={{ opacity: 0, scale: 0.97 }}
          animate={{ opacity: 1, scale: 1 }}
          className="glass-card p-16 text-center"
        >
          <div className="w-16 h-16 rounded-full bg-[var(--accent-secondary)]/10 flex items-center justify-center mx-auto mb-4">
            <Radar className="w-8 h-8 text-[var(--accent-secondary)]" />
          </div>
          <p className="text-lg font-semibold font-display">No Active Shadow Tickets</p>
          <p className="text-sm text-[var(--text-muted)] mt-1">
            HDBSCAN is monitoring — anomalies will appear here automatically.
          </p>
        </motion.div>
      ) : (
        <div className="grid gap-4">
          {shadows.map((s, i) => (
            <motion.div
              key={s.id}
              initial={{ opacity: 0, y: 12 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: i * 0.06, duration: 0.3 }}
              className={cn(
                "glass-card p-5 border transition-all hover:shadow-lg",
                s.severity === "critical"
                  ? "border-[var(--accent-rose)]/15 glow-rose"
                  : "border-[var(--accent-secondary)]/15 glow-violet"
              )}
            >
              <div className="flex items-start justify-between gap-4">
                <div className="flex-1">
                  <div className="flex items-center gap-3 mb-2 flex-wrap">
                    <span className={cn(
                      "px-2 py-0.5 text-[11px] font-semibold uppercase",
                      `badge-${s.severity}`
                    )}>
                      {s.severity}
                    </span>
                    <span className="text-xs text-[var(--text-muted)] font-mono">{s.id}</span>
                    <span className="px-2 py-0.5 rounded-full text-[10px] bg-[var(--accent-secondary)]/8 text-[var(--accent-secondary)]">
                      {s.affected_product}
                    </span>
                    <span className={cn(
                      "px-2 py-0.5 rounded-full text-[10px] font-medium",
                      s.status === "active"
                        ? "bg-[var(--accent-rose)]/8 text-[var(--accent-rose)]"
                        : s.status === "monitoring"
                        ? "bg-[var(--accent-amber)]/8 text-[var(--accent-amber)]"
                        : "bg-[var(--accent-primary)]/8 text-[var(--accent-primary)]"
                    )}>
                      {s.status}
                    </span>
                  </div>
                  <h3 className="text-base font-semibold mb-1 font-display">{s.title}</h3>
                  <p className="text-sm text-[var(--text-secondary)] leading-relaxed">{s.description}</p>
                  <div className="flex items-center gap-4 mt-3 text-xs text-[var(--text-muted)]">
                    <span className="flex items-center gap-1">
                      <AlertTriangle className="w-3 h-3" /> {s.ticket_count} tickets in cluster
                    </span>
                    <span className={cn(
                      "flex items-center gap-1 font-semibold",
                      s.growth_rate > 20 ? "text-[var(--accent-rose)]" : "text-[var(--accent-amber)]"
                    )}>
                      <TrendingUp className="w-3 h-3" /> {s.growth_rate}%/hr growth
                    </span>
                  </div>
                </div>
                <div className="shrink-0">
                  <div className={cn(
                    "w-14 h-14 rounded-[var(--radius-lg)] flex items-center justify-center",
                    s.severity === "critical"
                      ? "bg-[var(--accent-rose)]/8 pulse-alert"
                      : "bg-[var(--accent-secondary)]/8"
                  )}>
                    <AlertTriangle className={cn(
                      "w-6 h-6",
                      s.severity === "critical" ? "text-[var(--accent-rose)]" : "text-[var(--accent-secondary)]"
                    )} />
                  </div>
                </div>
              </div>
            </motion.div>
          ))}
        </div>
      )}
    </div>
  );
}
