"use client";

import React, { useState, useEffect } from "react";
import { motion } from "framer-motion";
import { cn } from "@/lib/utils";
import { Shield, Users, TrendingDown, DollarSign, Mail } from "lucide-react";
import {
  RadarChart, Radar, PolarGrid, PolarAngleAxis, PolarRadiusAxis, ResponsiveContainer,
  AreaChart, Area, XAxis, YAxis, CartesianGrid, Tooltip,
} from "recharts";

const API = process.env.NEXT_PUBLIC_API_URL || "http://localhost:8000";
const CHANNEL_ICONS: Record<string, string> = { x: "𝕏", reddit: "🔴", gmail: "📧" };

export default function ProfilesPage() {
  const [profiles, setProfiles] = useState<any[]>([]);
  const [selected, setSelected] = useState(0);
  const [detail, setDetail] = useState<any>(null);

  useEffect(() => {
    fetch(`${API}/api/v1/profiles`).then((r) => r.json()).then((d) => setProfiles(d.profiles || []));
  }, []);

  useEffect(() => {
    if (profiles.length) {
      const p = profiles[selected];
      fetch(`${API}/api/v1/profiles/${p.id}`).then((r) => r.json()).then(setDetail);
    }
  }, [profiles, selected]);

  const dims = ["Style", "Tone", "Domain", "Urgency", "Tech", "Product", "Emotion", "Freq"];

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold">Golden Profiles</h1>
        <p className="text-sm text-[var(--text-muted)]">Unified identity resolution across X, Reddit, and Email channels</p>
      </div>

      <div className="grid grid-cols-12 gap-5">
        {/* Profile List */}
        <div className="col-span-3 glass-card overflow-hidden">
          <div className="px-4 py-3 border-b border-[var(--border-subtle)]">
            <h3 className="text-xs font-semibold text-[var(--text-muted)] uppercase tracking-wider">Customer Directory</h3>
          </div>
          <div className="divide-y divide-[var(--border-subtle)] max-h-[720px] overflow-y-auto">
            {profiles.map((p, i) => (
              <button key={p.id} onClick={() => setSelected(i)}
                className={cn("w-full px-4 py-3 text-left hover:bg-[var(--bg-card-hover)] transition-colors flex items-center gap-3",
                  selected === i && "bg-blue-500/10 border-l-2 border-blue-500")}>
                <div className="w-8 h-8 rounded-lg bg-gradient-to-br from-blue-500 to-purple-500 flex items-center justify-center text-white text-xs font-bold shrink-0">
                  {p.name?.split(" ").map((n: string) => n[0]).join("")}
                </div>
                <div className="min-w-0">
                  <p className="text-sm font-medium truncate">{p.name}</p>
                  <p className="text-[11px] text-[var(--text-muted)] truncate">{p.email}</p>
                </div>
                {p.churn_alert && <TrendingDown className="w-3.5 h-3.5 text-red-400 ml-auto shrink-0" />}
              </button>
            ))}
          </div>
        </div>

        {/* Profile Detail */}
        {detail && (
          <div className="col-span-9 space-y-5">
            {/* Identity Card */}
            <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} className="glass-card p-6 glow-blue">
              <div className="flex items-start gap-6">
                <div className="w-20 h-20 rounded-2xl bg-gradient-to-br from-blue-500 via-purple-500 to-cyan-500 flex items-center justify-center text-white text-2xl font-bold shrink-0">
                  {detail.name?.split(" ").map((n: string) => n[0]).join("")}
                </div>
                <div className="flex-1">
                  <div className="flex items-center gap-3 mb-1 flex-wrap">
                    <h2 className="text-xl font-bold">{detail.name}</h2>
                    <span className="px-2.5 py-0.5 rounded-full text-[11px] font-semibold bg-blue-500/15 text-blue-400 border border-blue-500/30">{detail.plan}</span>
                    {detail.tags?.map((tag: string) => (
                      <span key={tag} className="px-2 py-0.5 rounded-full text-[10px] bg-[var(--bg-card-hover)] text-[var(--text-muted)]">{tag}</span>
                    ))}
                  </div>
                  <div className="flex items-center gap-4 text-sm text-[var(--text-muted)] mb-4 flex-wrap">
                    <span>📧 {detail.email}</span>
                    <span>𝕏 {detail.x_handle}</span>
                    <span>🔴 {detail.reddit_handle}</span>
                  </div>
                  <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                    <div className="text-center p-3 rounded-xl bg-[var(--bg-primary)]">
                      <p className="text-xl font-bold text-emerald-400">${Number(detail.ltv).toLocaleString()}</p>
                      <p className="text-[10px] text-[var(--text-muted)] mt-1">Lifetime Value</p>
                    </div>
                    <div className="text-center p-3 rounded-xl bg-[var(--bg-primary)]">
                      <p className={cn("text-xl font-bold", detail.churn_risk > 0.45 ? "text-red-400" : "text-emerald-400")}>
                        {(detail.churn_risk * 100).toFixed(0)}%
                      </p>
                      <p className="text-[10px] text-[var(--text-muted)] mt-1">Churn Risk</p>
                    </div>
                    <div className="text-center p-3 rounded-xl bg-[var(--bg-primary)]">
                      <p className="text-xl font-bold text-blue-400">{detail.identity_resolution?.cosine_similarity}</p>
                      <p className="text-[10px] text-[var(--text-muted)] mt-1">Cosine Similarity</p>
                    </div>
                    <div className="text-center p-3 rounded-xl bg-[var(--bg-primary)]">
                      <p className={cn("text-xl font-bold", detail.churn_alert ? "text-red-400" : "text-emerald-400")}>
                        {detail.churn_alert ? "⚠ At Risk" : "✓ Safe"}
                      </p>
                      <p className="text-[10px] text-[var(--text-muted)] mt-1">
                        {detail.churn_alert ? "V↓sent Warning" : "GDPR Compliant"}
                      </p>
                    </div>
                  </div>
                </div>
              </div>
            </motion.div>

            <div className="grid grid-cols-2 gap-5">
              {/* Vector Radar */}
              <div className="glass-card p-5">
                <h3 className="text-sm font-semibold mb-3 flex items-center gap-2">
                  <Shield className="w-4 h-4 text-purple-400" /> Identity Resolution — Vector Math
                </h3>
                <ResponsiveContainer width="100%" height={220}>
                  <RadarChart data={dims.map((d, i) => ({
                    dim: d,
                    X: Math.abs(detail.identity_resolution?.x_vector?.[i] ?? 0),
                    Email: Math.abs(detail.identity_resolution?.email_vector?.[i] ?? 0),
                  }))}>
                    <PolarGrid stroke="var(--border-subtle)" />
                    <PolarAngleAxis dataKey="dim" tick={{ fill: "var(--text-muted)", fontSize: 10 }} />
                    <PolarRadiusAxis tick={false} axisLine={false} />
                    <Radar name="X Handle" dataKey="X" stroke="#3b82f6" fill="#3b82f6" fillOpacity={0.15} />
                    <Radar name="Email" dataKey="Email" stroke="#8b5cf6" fill="#8b5cf6" fillOpacity={0.15} />
                  </RadarChart>
                </ResponsiveContainer>
              </div>

              {/* Sentiment Velocity */}
              <div className="glass-card p-5">
                <h3 className="text-sm font-semibold mb-3 flex items-center gap-2">
                  <TrendingDown className="w-4 h-4 text-red-400" /> Sentiment Velocity (V↓sent)
                </h3>
                <ResponsiveContainer width="100%" height={220}>
                  <AreaChart data={detail.sentiment_velocity || []}>
                    <defs>
                      <linearGradient id="svGrad" x1="0" y1="0" x2="0" y2="1">
                        <stop offset="0%" stopColor="#f43f5e" stopOpacity={0.3} />
                        <stop offset="100%" stopColor="#f43f5e" stopOpacity={0} />
                      </linearGradient>
                    </defs>
                    <CartesianGrid strokeDasharray="3 3" stroke="var(--border-subtle)" />
                    <XAxis dataKey="timestamp" tickFormatter={(v) => new Date(v).toLocaleTimeString("en", { hour: "2-digit" })} tick={{ fontSize: 10, fill: "var(--text-muted)" }} />
                    <YAxis domain={[-1, 0.5]} tick={{ fontSize: 10, fill: "var(--text-muted)" }} />
                    <Tooltip contentStyle={{ background: "var(--bg-card)", border: "1px solid var(--border-subtle)", borderRadius: 12, fontSize: 11 }} />
                    <Area type="monotone" dataKey="score" stroke="#f43f5e" fill="url(#svGrad)" strokeWidth={2} />
                  </AreaChart>
                </ResponsiveContainer>
              </div>
            </div>

            {/* Interaction History */}
            <div className="glass-card overflow-hidden">
              <div className="px-5 py-3 border-b border-[var(--border-subtle)]">
                <h3 className="text-sm font-semibold">Cross-Channel Interaction History</h3>
              </div>
              <div className="divide-y divide-[var(--border-subtle)] max-h-[300px] overflow-y-auto">
                {(detail.interactions || []).map((int: any, i: number) => (
                  <div key={i} className="px-5 py-3 hover:bg-[var(--bg-card-hover)] transition-colors">
                    <div className="flex items-center gap-2 mb-1">
                      <span className="text-xs">{CHANNEL_ICONS[int.channel]}</span>
                      <span className="text-xs text-[var(--text-muted)]">{int.handle}</span>
                      <span className={cn("px-1.5 py-0.5 rounded text-[9px] font-medium",
                        int.sentiment === "furious" || int.sentiment === "frustrated" ? "bg-red-500/10 text-red-400" : "bg-emerald-500/10 text-emerald-400"
                      )}>{int.sentiment}</span>
                      <span className="text-[10px] text-[var(--text-muted)] ml-auto">{new Date(int.timestamp).toLocaleDateString()}</span>
                    </div>
                    <p className="text-xs text-[var(--text-secondary)] line-clamp-1">{int.message}</p>
                  </div>
                ))}
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
