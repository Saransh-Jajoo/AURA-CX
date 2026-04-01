"use client";

import React, { useState, useEffect } from "react";
import { motion } from "framer-motion";
import { cn } from "@/lib/utils";
import { Shield, Server, Activity, Globe, Users, Zap, AlertTriangle, CheckCircle } from "lucide-react";

const API = process.env.NEXT_PUBLIC_API_URL || "http://localhost:8000";

export default function AdminPage() {
  const [health, setHealth] = useState<any>(null);

  useEffect(() => {
    fetch(`${API}/health`).then((r) => r.json()).then(setHealth);
  }, []);

  const tenants = [
    { id: "TENANT-ACME", name: "Acme Corp", plan: "Enterprise", agents: 18, status: "active" },
    { id: "TENANT-GLOBEX", name: "Globex Industries", plan: "Professional", agents: 8, status: "active" },
    { id: "TENANT-INITECH", name: "Initech", plan: "Starter", agents: 3, status: "trial" },
  ];

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold">System Administration</h1>
        <p className="text-sm text-[var(--text-muted)]">Global system health, multi-tenant management, and API status</p>
      </div>

      {/* System Health */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        <motion.div initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }} className="glass-card p-4 text-center glow-emerald">
          <Server className="w-6 h-6 text-emerald-400 mx-auto mb-2" />
          <p className="text-lg font-bold text-emerald-400">{health?.status === "operational" ? "Healthy" : "…"}</p>
          <p className="text-[10px] text-[var(--text-muted)]">System Status</p>
        </motion.div>
        <motion.div initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.05 }} className="glass-card p-4 text-center">
          <Globe className="w-6 h-6 text-blue-400 mx-auto mb-2" />
          <p className="text-lg font-bold">{tenants.length}</p>
          <p className="text-[10px] text-[var(--text-muted)]">Active Tenants</p>
        </motion.div>
        <motion.div initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.1 }} className="glass-card p-4 text-center">
          <Users className="w-6 h-6 text-purple-400 mx-auto mb-2" />
          <p className="text-lg font-bold">{tenants.reduce((a, t) => a + t.agents, 0)}</p>
          <p className="text-[10px] text-[var(--text-muted)]">Total Agents</p>
        </motion.div>
        <motion.div initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.15 }} className="glass-card p-4 text-center">
          <Zap className="w-6 h-6 text-cyan-400 mx-auto mb-2" />
          <p className="text-lg font-bold">v{health?.version || "…"}</p>
          <p className="text-[10px] text-[var(--text-muted)]">API Version</p>
        </motion.div>
      </div>

      {/* Pipeline Status */}
      {health?.pipeline_stages && (
        <div className="glass-card p-5">
          <h3 className="text-sm font-semibold mb-4 flex items-center gap-2">
            <Activity className="w-4 h-4 text-blue-400" /> 4-Stage Pipeline Status
          </h3>
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
            {Object.entries(health.pipeline_stages).map(([stage, status]) => (
              <div key={stage} className={cn("p-3 rounded-xl border text-center",
                status === "active" ? "bg-emerald-500/5 border-emerald-500/20" : "bg-amber-500/5 border-amber-500/20")}>
                <div className="flex items-center justify-center gap-2 mb-1">
                  {status === "active" ? <CheckCircle className="w-4 h-4 text-emerald-400" /> : <AlertTriangle className="w-4 h-4 text-amber-400" />}
                  <span className={cn("text-xs font-semibold uppercase", status === "active" ? "text-emerald-400" : "text-amber-400")}>{status as string}</span>
                </div>
                <p className="text-[10px] text-[var(--text-muted)]">{stage.replace(/_/g, " ")}</p>
              </div>
            ))}
          </div>
          {health.use_mock_data && (
            <div className="mt-3 px-3 py-2 rounded-lg bg-amber-500/10 border border-amber-500/20 text-xs text-amber-400">
              ⚠ USE_MOCK_DATA=True — Switch to False and provide API keys to activate real AI pipeline.
            </div>
          )}
        </div>
      )}

      {/* Tenants */}
      <div className="glass-card overflow-hidden">
        <div className="px-5 py-4 border-b border-[var(--border-subtle)] flex items-center justify-between">
          <h3 className="text-sm font-semibold flex items-center gap-2">
            <Shield className="w-4 h-4 text-blue-400" /> Multi-Tenant Directory
          </h3>
          <button className="px-3 py-1.5 rounded-lg text-xs font-medium text-blue-400 bg-blue-500/10 border border-blue-500/20 hover:bg-blue-500/20 transition-all">
            + Add Tenant
          </button>
        </div>
        <div className="divide-y divide-[var(--border-subtle)]">
          {tenants.map((t) => (
            <div key={t.id} className="px-5 py-4 flex items-center gap-4 hover:bg-[var(--bg-card-hover)] transition-colors">
              <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-blue-500 to-purple-500 flex items-center justify-center text-white text-sm font-bold">
                {t.name.charAt(0)}
              </div>
              <div className="flex-1 min-w-0">
                <p className="text-sm font-semibold">{t.name}</p>
                <p className="text-[11px] text-[var(--text-muted)]">{t.id}</p>
              </div>
              <span className="px-2.5 py-0.5 rounded-full text-[10px] font-semibold bg-blue-500/15 text-blue-400">{t.plan}</span>
              <span className="text-xs text-[var(--text-muted)]">{t.agents} agents</span>
              <span className={cn("px-2 py-0.5 rounded-full text-[10px] font-semibold",
                t.status === "active" ? "bg-emerald-500/15 text-emerald-400" : "bg-amber-500/15 text-amber-400"
              )}>{t.status}</span>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
