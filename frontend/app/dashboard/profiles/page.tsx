"use client";

import React, { useState, useEffect } from "react";
import { motion } from "framer-motion";
import { cn } from "@/lib/utils";
import { fetchProfiles, fetchProfile } from "@/lib/api";
import type { ProfileSummary, GoldenProfile } from "@/lib/types";
import { GoldenProfileModal } from "@/components/golden-profile-modal";
import { ChannelBadge } from "@/components/channel-icons";
import { Shield, TrendingDown, Search } from "lucide-react";
import {
  RadarChart, Radar, PolarGrid, PolarAngleAxis, PolarRadiusAxis,
  ResponsiveContainer, AreaChart, Area, XAxis, YAxis, CartesianGrid, Tooltip,
} from "recharts";

const DIMS = ["Style", "Tone", "Domain", "Urgency", "Tech", "Product", "Emotion", "Freq"];

export default function ProfilesPage() {
  const [profiles, setProfiles] = useState<ProfileSummary[]>([]);
  const [selected, setSelected] = useState(0);
  const [detail, setDetail] = useState<GoldenProfile | null>(null);
  const [searchFilter, setSearchFilter] = useState("");

  // Modal state
  const [modalOpen, setModalOpen] = useState(false);

  useEffect(() => {
    fetchProfiles().then((d) => setProfiles(d.profiles || []));
  }, []);

  useEffect(() => {
    if (profiles.length) {
      const p = profiles[selected];
      fetchProfile(p.id).then(setDetail);
    }
  }, [profiles, selected]);

  const filteredProfiles = profiles.filter(
    (p) =>
      !searchFilter ||
      p.name.toLowerCase().includes(searchFilter.toLowerCase()) ||
      (p.email || "").toLowerCase().includes(searchFilter.toLowerCase())
  );

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold font-display">Golden Profiles</h1>
          <p className="text-sm text-[var(--text-muted)]">
            Unified identity resolution across X, Reddit, and Email channels
          </p>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-12 gap-5">
        {/* ── Profile List ───────────────────────────────── */}
        <div className="col-span-1 lg:col-span-3 glass-card overflow-hidden">
          <div className="px-4 py-3 border-b border-[var(--border-subtle)] space-y-2">
            <h3 className="text-[11px] font-semibold text-[var(--text-muted)] uppercase tracking-wider">
              Customer Directory
            </h3>
            <div className="relative">
              <Search className="w-3 h-3 absolute left-2.5 top-1/2 -translate-y-1/2 text-[var(--text-muted)]" />
              <input
                value={searchFilter}
                onChange={(e) => setSearchFilter(e.target.value)}
                placeholder="Search…"
                className="w-full pl-8 pr-3 py-1.5 rounded-[var(--radius-sm)] bg-[var(--bg-inset)] border border-[var(--border-subtle)] text-[11px] placeholder:text-[var(--text-muted)] focus:outline-none focus:ring-1 focus:ring-[var(--accent-primary)]/20"
              />
            </div>
          </div>
          <div className="divide-y divide-[var(--border-subtle)] max-h-[720px] overflow-y-auto">
            {filteredProfiles.map((p, i) => (
              <button
                key={p.id}
                onClick={() => setSelected(i)}
                className={cn(
                  "w-full px-4 py-3 text-left hover:bg-[var(--bg-card-hover)] transition-all flex items-center gap-3 relative",
                  selected === i && "bg-[var(--accent-primary)]/5"
                )}
              >
                {selected === i && (
                  <motion.div
                    layoutId="profile-active"
                    className="absolute left-0 top-0 bottom-0 w-[3px] bg-[var(--accent-primary)] rounded-r-full"
                    transition={{ type: "spring", stiffness: 400, damping: 28 }}
                  />
                )}
                <div className="w-8 h-8 rounded-[var(--radius-sm)] bg-gradient-to-br from-[var(--accent-primary)] to-[var(--accent-secondary)] flex items-center justify-center text-white text-[10px] font-bold shrink-0">
                  {p.name?.split(" ").map((n) => n[0]).join("")}
                </div>
                <div className="min-w-0 flex-1">
                  <p className="text-sm font-medium truncate">{p.name}</p>
                  <p className="text-[11px] text-[var(--text-muted)] truncate">{p.email || "Anonymous profile"}</p>
                </div>
                {p.churn_alert && (
                  <TrendingDown className="w-3.5 h-3.5 text-[var(--accent-rose)] shrink-0" />
                )}
              </button>
            ))}
          </div>
        </div>

        {/* ── Profile Detail ─────────────────────────────── */}
        {detail && (
          <div className="col-span-1 lg:col-span-9 space-y-5">
            {/* Identity Card */}
            <motion.div
              key={detail.id}
              initial={{ opacity: 0, y: 8 }}
              animate={{ opacity: 1, y: 0 }}
              className="glass-card p-6 glow-primary"
            >
              <div className="flex items-start gap-6">
                <div
                  className="w-20 h-20 rounded-[var(--radius-lg)] bg-gradient-to-br from-[var(--accent-primary)] via-[var(--accent-secondary)] to-[var(--accent-teal)] p-[2px] shrink-0 cursor-pointer hover:shadow-lg transition-shadow"
                  onClick={() => setModalOpen(true)}
                >
                  <div className="w-full h-full rounded-[14px] bg-[var(--bg-card)] flex items-center justify-center text-2xl font-bold font-display text-[var(--accent-primary)]">
                    {detail.name?.split(" ").map((n) => n[0]).join("")}
                  </div>
                </div>
                <div className="flex-1">
                  <div className="flex items-center gap-3 mb-1 flex-wrap">
                    <h2 className="text-xl font-bold font-display">{detail.name}</h2>
                    <span className="px-2.5 py-0.5 rounded-full text-[11px] font-semibold bg-[var(--accent-primary)]/10 text-[var(--accent-primary)] border border-[var(--accent-primary)]/20">
                      {detail.plan}
                    </span>
                    {detail.tags?.map((tag) => (
                      <span key={tag} className="px-2 py-0.5 rounded-full text-[10px] bg-[var(--bg-inset)] text-[var(--text-muted)]">
                        {tag}
                      </span>
                    ))}
                  </div>
                  <div className="flex items-center gap-4 text-xs text-[var(--text-muted)] mb-4 flex-wrap">
                    {detail.email && <span><ChannelBadge channel="gmail" compact /> {detail.email}</span>}
                    {detail.x_handle && <span><ChannelBadge channel="x" compact /> {detail.x_handle}</span>}
                    {detail.reddit_handle && <span><ChannelBadge channel="reddit" compact /> {detail.reddit_handle}</span>}
                  </div>
                  <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                    <div className="text-center p-3 rounded-[var(--radius-md)] bg-[var(--bg-inset)]">
                      <p className="text-xl font-bold font-display text-[var(--accent-emerald)]">
                        ${Number(detail.ltv).toLocaleString()}
                      </p>
                      <p className="text-[10px] text-[var(--text-muted)] mt-1">Lifetime Value</p>
                    </div>
                    <div className="text-center p-3 rounded-[var(--radius-md)] bg-[var(--bg-inset)]">
                      <p className={cn(
                        "text-xl font-bold font-display",
                        detail.churn_risk > 0.45 ? "text-[var(--accent-rose)]" : "text-[var(--accent-emerald)]"
                      )}>
                        {(detail.churn_risk * 100).toFixed(0)}%
                      </p>
                      <p className="text-[10px] text-[var(--text-muted)] mt-1">Churn Risk</p>
                    </div>
                    <div className="text-center p-3 rounded-[var(--radius-md)] bg-[var(--bg-inset)]">
                      <p className="text-xl font-bold font-display text-[var(--accent-primary)]">
                        {detail.identity_resolution?.cosine_similarity}
                      </p>
                      <p className="text-[10px] text-[var(--text-muted)] mt-1">Cosine Similarity</p>
                    </div>
                    <div className="text-center p-3 rounded-[var(--radius-md)] bg-[var(--bg-inset)]">
                      <p className={cn(
                        "text-lg font-bold",
                        detail.churn_alert ? "text-[var(--accent-rose)]" : "text-[var(--accent-emerald)]"
                      )}>
                        {detail.churn_alert ? "At Risk" : "Safe"}
                      </p>
                      <p className="text-[10px] text-[var(--text-muted)] mt-1">
                        {detail.churn_alert ? "V_sent Warning" : "GDPR Compliant"}
                      </p>
                    </div>
                  </div>
                </div>
              </div>
            </motion.div>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
              {/* Vector Radar */}
              <div className="glass-card p-5">
                <h3 className="text-sm font-semibold mb-3 flex items-center gap-2">
                  <Shield className="w-4 h-4 text-[var(--accent-secondary)]" /> Identity Resolution — Vector Math
                </h3>
                <ResponsiveContainer width="100%" height={220}>
                  <RadarChart data={DIMS.map((d, i) => ({
                    dim: d,
                    X: Math.abs(detail.identity_resolution?.x_vector?.[i] ?? 0),
                    Email: Math.abs(detail.identity_resolution?.email_vector?.[i] ?? 0),
                  }))}>
                    <PolarGrid stroke="var(--border-subtle)" />
                    <PolarAngleAxis dataKey="dim" tick={{ fill: "var(--text-muted)", fontSize: 10 }} />
                    <PolarRadiusAxis tick={false} axisLine={false} />
                    <Radar name="X Handle" dataKey="X" stroke="var(--accent-primary)" fill="var(--accent-primary)" fillOpacity={0.12} strokeWidth={1.5} />
                    <Radar name="Email" dataKey="Email" stroke="var(--accent-secondary)" fill="var(--accent-secondary)" fillOpacity={0.12} strokeWidth={1.5} />
                  </RadarChart>
                </ResponsiveContainer>
              </div>

              {/* Sentiment Velocity */}
              <div className="glass-card p-5">
                <h3 className="text-sm font-semibold mb-3 flex items-center gap-2">
                  <TrendingDown className="w-4 h-4 text-[var(--accent-rose)]" /> Sentiment Velocity (V_sent)
                </h3>
                <ResponsiveContainer width="100%" height={220}>
                  <AreaChart data={detail.sentiment_velocity || []}>
                    <defs>
                      <linearGradient id="svGrad2" x1="0" y1="0" x2="0" y2="1">
                        <stop offset="0%" stopColor="var(--accent-rose)" stopOpacity={0.2} />
                        <stop offset="100%" stopColor="var(--accent-rose)" stopOpacity={0} />
                      </linearGradient>
                    </defs>
                    <CartesianGrid strokeDasharray="3 3" stroke="var(--border-subtle)" />
                    <XAxis dataKey="timestamp" tickFormatter={(v) => new Date(v).toLocaleTimeString("en", { hour: "2-digit" })} tick={{ fontSize: 10, fill: "var(--text-muted)" }} />
                    <YAxis domain={[-1, 0.5]} tick={{ fontSize: 10, fill: "var(--text-muted)" }} />
                    <Tooltip contentStyle={{ background: "var(--bg-card)", border: "1px solid var(--border-subtle)", borderRadius: 12, fontSize: 11 }} />
                    <Area type="monotone" dataKey="score" stroke="var(--accent-rose)" fill="url(#svGrad2)" strokeWidth={2} />
                  </AreaChart>
                </ResponsiveContainer>
              </div>
            </div>

            {/* Interaction History */}
            <div className="glass-card overflow-hidden">
              <div className="px-5 py-3 border-b border-[var(--border-subtle)] flex items-center justify-between">
                <h3 className="text-sm font-semibold">Cross-Channel Interaction History</h3>
                <span className="text-[10px] text-[var(--text-muted)] font-mono">
                  {detail.interactions?.length || 0} interactions
                </span>
              </div>
              <div className="divide-y divide-[var(--border-subtle)] max-h-[300px] overflow-y-auto">
                {(detail.interactions || []).map((int, i) => (
                  <div key={i} className="px-5 py-3 hover:bg-[var(--bg-card-hover)] transition-colors">
                    <div className="flex items-center gap-2 mb-1">
                      <ChannelBadge channel={int.channel} compact />
                      <span className="text-xs text-[var(--text-muted)]">{int.handle}</span>
                      <span className={cn(
                        "px-1.5 py-0.5 rounded-full text-[9px] font-medium",
                        int.sentiment === "furious" || int.sentiment === "frustrated"
                          ? "bg-[var(--accent-rose)]/10 text-[var(--accent-rose)]"
                          : "bg-[var(--accent-emerald)]/10 text-[var(--accent-emerald)]"
                      )}>
                        {int.sentiment}
                      </span>
                      <span className="text-[10px] text-[var(--text-muted)] ml-auto font-mono">
                        {new Date(int.timestamp).toLocaleDateString()}
                      </span>
                    </div>
                    <p className="text-xs text-[var(--text-secondary)] line-clamp-1">{int.message}</p>
                  </div>
                ))}
              </div>
            </div>

            {/* Full Profile Modal */}
            <GoldenProfileModal
              profile={detail}
              open={modalOpen}
              onOpenChange={setModalOpen}
            />
          </div>
        )}
      </div>
    </div>
  );
}
