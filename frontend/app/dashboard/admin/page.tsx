"use client";

import React, { useState, useEffect } from "react";
import { motion } from "framer-motion";
import { cn } from "@/lib/utils";
import { fetchTenants } from "@/lib/api";
import { Shield, Server, Activity, Globe, Users, Zap, AlertTriangle, CheckCircle } from "lucide-react";

const API = process.env.NEXT_PUBLIC_API_URL || "http://localhost:8000";

interface HealthData {
  status: string;
  version: string;
  use_mock_data: boolean;
  pipeline_stages: Record<string, string>;
}

interface Tenant {
  id: string;
  name: string;
  plan: string;
  agents: number;
  status: string;
}

export default function AdminPage() {
  const [health, setHealth] = useState<HealthData | null>(null);
  const [tenants, setTenants] = useState<Tenant[]>([]);

  useEffect(() => {
    fetch(`${API}/health`).then((r) => r.json()).then(setHealth);
    fetchTenants().then((data) => setTenants(data.tenants)).catch(() => setTenants([]));
  }, []);

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold font-display">System Administration</h1>
        <p className="text-sm text-[var(--text-muted)]">Global system health, multi-tenant management, and API status</p>
      </div>

      {/* System Health */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        <motion.div initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }} className="glass-card p-4 text-center glow-emerald">
          <Server className="w-6 h-6 text-[var(--accent-emerald)] mx-auto mb-2" />
          <p className="text-lg font-bold font-display text-[var(--accent-emerald)]">{health?.status === "operational" ? "Healthy" : "…"}</p>
          <p className="text-[10px] text-[var(--text-muted)]">System Status</p>
        </motion.div>
        <motion.div initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.05 }} className="glass-card p-4 text-center">
          <Globe className="w-6 h-6 text-[var(--accent-primary)] mx-auto mb-2" />
          <p className="text-lg font-bold font-display">{tenants.length}</p>
          <p className="text-[10px] text-[var(--text-muted)]">Active Tenants</p>
        </motion.div>
        <motion.div initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.1 }} className="glass-card p-4 text-center">
          <Users className="w-6 h-6 text-[var(--accent-secondary)] mx-auto mb-2" />
          <p className="text-lg font-bold font-display">{tenants.reduce((a, t) => a + t.agents, 0)}</p>
          <p className="text-[10px] text-[var(--text-muted)]">Total Agents</p>
        </motion.div>
        <motion.div initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.15 }} className="glass-card p-4 text-center">
          <Zap className="w-6 h-6 text-[var(--accent-teal)] mx-auto mb-2" />
          <p className="text-lg font-bold font-display">v{health?.version || "…"}</p>
          <p className="text-[10px] text-[var(--text-muted)]">API Version</p>
        </motion.div>
      </div>

      {/* Pipeline Status */}
      {health?.pipeline_stages && (
        <div className="glass-card p-5">
          <h3 className="text-sm font-semibold mb-4 flex items-center gap-2">
            <Activity className="w-4 h-4 text-[var(--accent-primary)]" /> 8-Stage Pipeline Status
          </h3>
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
            {Object.entries(health.pipeline_stages).map(([stage, status]) => (
              <div key={stage} className={cn("p-3 rounded-[var(--radius-md)] border text-center",
                status === "active" ? "bg-[var(--accent-emerald)]/5 border-[var(--accent-emerald)]/20" : "bg-[var(--accent-amber)]/5 border-[var(--accent-amber)]/20")}>
                <div className="flex items-center justify-center gap-2 mb-1">
                  {status === "active" ? <CheckCircle className="w-4 h-4 text-[var(--accent-emerald)]" /> : <AlertTriangle className="w-4 h-4 text-[var(--accent-amber)]" />}
                  <span className={cn("text-xs font-semibold uppercase", status === "active" ? "text-[var(--accent-emerald)]" : "text-[var(--accent-amber)]")}>{status}</span>
                </div>
                <p className="text-[10px] text-[var(--text-muted)]">{stage.replace(/_/g, " ")}</p>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Tenants */}
      <div className="glass-card overflow-hidden">
        <div className="px-5 py-4 border-b border-[var(--border-subtle)] flex items-center justify-between">
          <h3 className="text-sm font-semibold flex items-center gap-2">
            <Shield className="w-4 h-4 text-[var(--accent-primary)]" /> Multi-Tenant Directory
          </h3>
          <button className="px-3 py-1.5 rounded-[var(--radius-md)] text-xs font-medium text-[var(--accent-primary)] bg-[var(--accent-primary)]/8 border border-[var(--accent-primary)]/20 hover:bg-[var(--accent-primary)]/15 transition-all">
            + Add Tenant
          </button>
        </div>
        <div className="divide-y divide-[var(--border-subtle)]">
          {tenants.map((t) => (
            <div key={t.id} className="px-5 py-4 flex items-center gap-4 hover:bg-[var(--bg-card-hover)] transition-colors">
              <div className="w-10 h-10 rounded-[var(--radius-md)] bg-gradient-to-br from-[var(--accent-primary)] to-[var(--accent-secondary)] flex items-center justify-center text-white text-sm font-bold">
                {t.name.charAt(0)}
              </div>
              <div className="flex-1 min-w-0">
                <p className="text-sm font-semibold">{t.name}</p>
                <p className="text-[11px] text-[var(--text-muted)] font-mono">{t.id}</p>
              </div>
              <span className="px-2.5 py-0.5 rounded-full text-[10px] font-semibold bg-[var(--accent-primary)]/10 text-[var(--accent-primary)] border border-[var(--accent-primary)]/20">{t.plan}</span>
              <span className="text-xs text-[var(--text-muted)]">{t.agents} agents</span>
              <span className={cn("px-2 py-0.5 rounded-full text-[10px] font-semibold",
                t.status === "active" ? "bg-[var(--accent-emerald)]/10 text-[var(--accent-emerald)]" : "bg-[var(--accent-amber)]/10 text-[var(--accent-amber)]"
              )}>{t.status}</span>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
