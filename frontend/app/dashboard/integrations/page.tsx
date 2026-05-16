"use client";

import React, { useState, useEffect } from "react";
import { motion } from "framer-motion";
import { cn } from "@/lib/utils";
import { Link2, Plus, X, Check, Globe, AtSign, Mail } from "lucide-react";

const API = process.env.NEXT_PUBLIC_API_URL || "http://localhost:8000";

interface IntegrationSource {
  id: string;
  platform: string;
  identifier: string;
  label?: string;
  active: boolean;
}

const PLATFORM_META: Record<string, { icon: React.ComponentType<{ className?: string }>; label: string; color: string; placeholder: string }> = {
  x: { icon: AtSign, label: "X / Twitter", color: "text-[var(--accent-primary)]", placeholder: "@YourBrand" },
  reddit: { icon: Globe, label: "Reddit", color: "text-[var(--accent-amber)]", placeholder: "r/YourSubreddit" },
  gmail: { icon: Mail, label: "Gmail", color: "text-[var(--accent-emerald)]", placeholder: "support@company.com" },
};

export default function IntegrationsPage() {
  const [sources, setSources] = useState<IntegrationSource[]>([]);
  const [adding, setAdding] = useState(false);
  const [form, setForm] = useState({ platform: "x", identifier: "", label: "" });

  const authHeaders = (): Record<string, string> => {
    const token = typeof window !== "undefined" ? localStorage.getItem("aura_token") : null;
    return token ? { Authorization: `Bearer ${token}` } : {};
  };
  const load = () => fetch(`${API}/api/v1/integrations`, { headers: authHeaders() }).then((r) => r.json()).then((d) => setSources(d.sources || []));
  useEffect(() => { load(); }, []);

  const handleAdd = async () => {
    if (!form.identifier.trim()) return;
    await fetch(`${API}/api/v1/integrations`, {
      method: "POST",
      headers: { "Content-Type": "application/json", ...authHeaders() },
      body: JSON.stringify(form),
    });
    setAdding(false);
    setForm({ platform: "x", identifier: "", label: "" });
    load();
  };

  const handleRemove = async (id: string) => {
    await fetch(`${API}/api/v1/integrations/${id}`, { method: "DELETE", headers: authHeaders() });
    load();
  };

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold font-display">Platform Integrations</h1>
          <p className="text-sm text-[var(--text-muted)]">Define tracked X/Twitter handles, Subreddits, and Email inboxes</p>
        </div>
        <button onClick={() => setAdding(!adding)}
          className="flex items-center gap-2 px-4 py-2 rounded-[var(--radius-md)] text-sm font-medium text-[var(--accent-primary)] bg-[var(--accent-primary)]/8 border border-[var(--accent-primary)]/20 hover:bg-[var(--accent-primary)]/15 transition-all">
          {adding ? <X className="w-4 h-4" /> : <Plus className="w-4 h-4" />}
          {adding ? "Cancel" : "Add Source"}
        </button>
      </div>

      {/* Add Form */}
      {adding && (
        <motion.div initial={{ opacity: 0, height: 0 }} animate={{ opacity: 1, height: "auto" }} className="glass-card p-5">
          <h3 className="text-sm font-semibold mb-4">Add New Integration Source</h3>
          <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
            <div>
              <label className="block text-[10px] text-[var(--text-muted)] mb-1.5 uppercase tracking-wider font-medium">Platform</label>
              <select title="Platform" value={form.platform} onChange={(e) => setForm({ ...form, platform: e.target.value })}
                className="w-full px-3 py-2.5 rounded-[var(--radius-md)] bg-[var(--bg-inset)] border border-[var(--border-subtle)] text-sm text-[var(--text-primary)] focus:outline-none focus:ring-2 focus:ring-[var(--accent-primary)]/20">
                <option value="x">X / Twitter</option>
                <option value="reddit">Reddit</option>
                <option value="gmail">Gmail</option>
              </select>
            </div>
            <div className="md:col-span-2">
              <label className="block text-[10px] text-[var(--text-muted)] mb-1.5 uppercase tracking-wider font-medium">Identifier</label>
              <input value={form.identifier} onChange={(e) => setForm({ ...form, identifier: e.target.value })}
                placeholder={PLATFORM_META[form.platform]?.placeholder}
                className="w-full px-3 py-2.5 rounded-[var(--radius-md)] bg-[var(--bg-inset)] border border-[var(--border-subtle)] text-sm text-[var(--text-primary)] placeholder:text-[var(--text-muted)] focus:outline-none focus:ring-2 focus:ring-[var(--accent-primary)]/20" />
            </div>
            <div className="flex items-end">
              <button onClick={handleAdd}
                className="w-full flex items-center justify-center gap-2 px-4 py-2.5 rounded-[var(--radius-md)] text-sm font-semibold text-white bg-[var(--accent-primary)] hover:brightness-110 shadow-lg shadow-[var(--accent-primary)]/15 transition-all active:scale-[0.98]">
                <Check className="w-4 h-4" /> Add
              </button>
            </div>
          </div>
        </motion.div>
      )}

      {/* Platform Sections */}
      {(["x", "reddit", "gmail"] as const).map((platform) => {
        const meta = PLATFORM_META[platform];
        const items = sources.filter((s) => s.platform === platform);
        return (
          <div key={platform} className="glass-card overflow-hidden">
            <div className="px-5 py-4 border-b border-[var(--border-subtle)] flex items-center gap-3">
              <meta.icon className={cn("w-5 h-5", meta.color)} />
              <h3 className="text-sm font-semibold">{meta.label}</h3>
              <span className="ml-auto text-xs text-[var(--text-muted)] font-mono">{items.length} sources</span>
            </div>
            {items.length === 0 ? (
              <div className="px-5 py-6 text-center text-sm text-[var(--text-muted)]">No {meta.label} sources configured</div>
            ) : (
              <div className="divide-y divide-[var(--border-subtle)]">
                {items.map((s, i) => (
                  <motion.div key={s.identifier + i} initial={{ opacity: 0 }} animate={{ opacity: 1 }}
                    className="px-5 py-3 flex items-center gap-4 hover:bg-[var(--bg-card-hover)] transition-colors">
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-medium">{s.identifier}</p>
                      {s.label && <p className="text-[11px] text-[var(--text-muted)]">{s.label}</p>}
                    </div>
                    <span className={cn("px-2 py-0.5 rounded-full text-[10px] font-semibold",
                      s.active ? "bg-[var(--accent-emerald)]/10 text-[var(--accent-emerald)]" : "bg-[var(--bg-card-hover)] text-[var(--text-muted)]"
                    )}>{s.active ? "Active" : "Paused"}</span>
                    <button title="Remove source" onClick={() => handleRemove(s.id)}
                      className="text-[var(--text-muted)] hover:text-[var(--accent-rose)] transition-colors p-1.5 rounded-[var(--radius-sm)] hover:bg-[var(--accent-rose)]/8">
                      <X className="w-4 h-4" />
                    </button>
                  </motion.div>
                ))}
              </div>
            )}
          </div>
        );
      })}
    </div>
  );
}
