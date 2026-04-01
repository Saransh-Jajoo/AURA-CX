"use client";

import React, { useState, useEffect } from "react";
import { motion } from "framer-motion";
import { cn } from "@/lib/utils";
import { AlertTriangle, TrendingUp, Eye } from "lucide-react";

const API = process.env.NEXT_PUBLIC_API_URL || "http://localhost:8000";

export default function ShadowTicketsPage() {
  const [shadows, setShadows] = useState<any[]>([]);

  useEffect(() => {
    fetch(`${API}/api/v1/analytics/shadow-tickets`).then((r) => r.json()).then((d) => setShadows(d.shadow_tickets || []));
  }, []);

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold">Shadow Tickets</h1>
        <p className="text-sm text-[var(--text-muted)]">Proactive anomaly detection from HDBSCAN clustering — issues surfaced before customers report them</p>
      </div>

      {shadows.length === 0 ? (
        <div className="glass-card p-12 text-center">
          <Eye className="w-12 h-12 text-purple-400 mx-auto mb-4" />
          <p className="text-lg font-semibold">No Active Shadow Tickets</p>
          <p className="text-sm text-[var(--text-muted)]">HDBSCAN is monitoring — anomalies will appear here automatically.</p>
        </div>
      ) : (
        <div className="grid gap-4">
          {shadows.map((s, i) => (
            <motion.div key={s.id} initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: i * 0.08 }}
              className={cn("glass-card p-5", s.severity === "critical" ? "glow-rose border-red-500/20" : "glow-purple border-purple-500/20")}>
              <div className="flex items-start justify-between gap-4">
                <div className="flex-1">
                  <div className="flex items-center gap-3 mb-2 flex-wrap">
                    <span className={cn("px-2 py-0.5 rounded-full text-[11px] font-semibold uppercase", `badge-${s.severity}`)}>{s.severity}</span>
                    <span className="text-xs text-[var(--text-muted)]">{s.id}</span>
                    <span className="px-2 py-0.5 rounded-full text-[10px] bg-purple-500/10 text-purple-400">{s.affected_product}</span>
                    <span className={cn("px-2 py-0.5 rounded-full text-[10px] font-medium",
                      s.status === "active" ? "bg-red-500/10 text-red-400" : s.status === "monitoring" ? "bg-amber-500/10 text-amber-400" : "bg-blue-500/10 text-blue-400"
                    )}>{s.status}</span>
                  </div>
                  <h3 className="text-base font-semibold mb-1">{s.title}</h3>
                  <p className="text-sm text-[var(--text-secondary)] leading-relaxed">{s.description}</p>
                  <div className="flex items-center gap-4 mt-3 text-xs text-[var(--text-muted)]">
                    <span className="flex items-center gap-1"><AlertTriangle className="w-3 h-3" /> {s.ticket_count} tickets in cluster</span>
                    <span className={cn("flex items-center gap-1 font-semibold", s.growth_rate > 20 ? "text-red-400" : "text-amber-400")}>
                      <TrendingUp className="w-3 h-3" /> {s.growth_rate}%/hr growth
                    </span>
                  </div>
                </div>
                <div className="shrink-0">
                  <div className={cn("w-16 h-16 rounded-2xl flex items-center justify-center",
                    s.severity === "critical" ? "bg-red-500/10 pulse-red" : "bg-purple-500/10")}>
                    <AlertTriangle className={cn("w-7 h-7", s.severity === "critical" ? "text-red-400" : "text-purple-400")} />
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
