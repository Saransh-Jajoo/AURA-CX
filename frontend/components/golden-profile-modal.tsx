"use client";

import React from "react";
import { motion, AnimatePresence } from "framer-motion";
import * as Dialog from "@radix-ui/react-dialog";
import { cn } from "@/lib/utils";
import { X, Shield, TrendingDown, DollarSign, AlertTriangle, ExternalLink } from "lucide-react";
import type { GoldenProfile } from "@/lib/types";
import { ChannelBadge } from "@/components/channel-icons";
import {
  RadarChart, Radar, PolarGrid, PolarAngleAxis, PolarRadiusAxis,
  ResponsiveContainer, AreaChart, Area, XAxis, YAxis, CartesianGrid, Tooltip,
} from "recharts";

const DIMS = ["Style", "Tone", "Domain", "Urgency", "Tech", "Product", "Emotion", "Freq"];

function ConfidenceRing({ value, size = 56 }: { value: number; size?: number }) {
  const r = size / 2 - 4;
  const c = 2 * Math.PI * r;
  const color = value > 0.92 ? "var(--accent-emerald)" : value > 0.8 ? "var(--accent-amber)" : "var(--accent-rose)";
  return (
    <div className="relative inline-flex items-center justify-center" style={{ width: size, height: size }}>
      <svg width={size} height={size} className="-rotate-90">
        <circle cx={size / 2} cy={size / 2} r={r} fill="none" stroke="var(--border-subtle)" strokeWidth={3} />
        <motion.circle
          cx={size / 2} cy={size / 2} r={r} fill="none" stroke={color} strokeWidth={3}
          strokeDasharray={c} strokeLinecap="round"
          initial={{ strokeDashoffset: c }}
          animate={{ strokeDashoffset: c - value * c }}
          transition={{ duration: 1.2, ease: "easeOut" }}
        />
      </svg>
      <span className="absolute text-xs font-bold font-mono" style={{ color }}>
        {(value * 100).toFixed(0)}
      </span>
    </div>
  );
}

function ChurnGauge({ risk }: { risk: number }) {
  const pct = Math.round(risk * 100);
  const isHigh = risk > 0.45;
  return (
    <div className="text-center">
      <div className={cn(
        "text-3xl font-black font-display",
        isHigh ? "text-[var(--accent-rose)]" : "text-[var(--accent-emerald)]"
      )}>
        {pct}%
      </div>
      <div className="w-full h-1.5 rounded-full bg-[var(--bg-inset)] mt-2 overflow-hidden">
        <motion.div
          className={cn("h-full rounded-full", isHigh ? "bg-[var(--accent-rose)]" : "bg-[var(--accent-emerald)]")}
          initial={{ width: 0 }}
          animate={{ width: `${pct}%` }}
          transition={{ duration: 0.8, ease: "easeOut" }}
        />
      </div>
      <p className="text-[10px] text-[var(--text-muted)] mt-1">Churn Risk</p>
    </div>
  );
}

interface Props {
  profile: GoldenProfile | null;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

export function GoldenProfileModal({ profile, open, onOpenChange }: Props) {
  if (!profile) return null;

  const radarData = DIMS.map((d, i) => ({
    dim: d,
    X: Math.abs(profile.identity_resolution?.x_vector?.[i] ?? 0),
    Email: Math.abs(profile.identity_resolution?.email_vector?.[i] ?? 0),
  }));

  return (
    <Dialog.Root open={open} onOpenChange={onOpenChange}>
      <Dialog.Portal>
        <Dialog.Overlay asChild>
          <motion.div
            className="fixed inset-0 bg-[var(--overlay)] backdrop-blur-sm z-50"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
          />
        </Dialog.Overlay>
        <Dialog.Content asChild>
          <motion.div
            className="fixed inset-4 md:inset-8 lg:inset-12 z-50 glass-card overflow-y-auto"
            initial={{ opacity: 0, scale: 0.97, y: 16 }}
            animate={{ opacity: 1, scale: 1, y: 0 }}
            exit={{ opacity: 0, scale: 0.97, y: 8 }}
            transition={{ duration: 0.3, ease: [0.25, 0.1, 0.25, 1] }}
          >
            {/* Header */}
            <div className="sticky top-0 z-10 flex items-center justify-between px-6 py-4 border-b border-[var(--border-subtle)] bg-[var(--glass-bg)] backdrop-blur-xl">
              <div className="flex items-center gap-3">
                <Shield className="w-4 h-4 text-[var(--accent-primary)]" />
                <Dialog.Title className="text-sm font-semibold">Golden Profile</Dialog.Title>
                <span className="px-2 py-0.5 rounded-full text-[10px] font-bold bg-[var(--accent-primary)]/10 text-[var(--accent-primary)] border border-[var(--accent-primary)]/20">
                  Cosine {profile.identity_resolution.cosine_similarity}
                </span>
              </div>
              <Dialog.Close className="p-2 rounded-[var(--radius-sm)] text-[var(--text-muted)] hover:text-[var(--text-primary)] hover:bg-[var(--bg-card-hover)] transition-all">
                <X className="w-4 h-4" />
              </Dialog.Close>
            </div>

            <div className="p-6 space-y-6">
              {/* Identity Card */}
              <div className="flex items-start gap-6">
                <div className="w-20 h-20 rounded-[var(--radius-lg)] bg-gradient-to-br from-[var(--accent-primary)] via-[var(--accent-secondary)] to-[var(--accent-teal)] p-[2px] shrink-0">
                  <div className="w-full h-full rounded-[14px] bg-[var(--bg-card)] flex items-center justify-center text-2xl font-bold font-display text-[var(--accent-primary)]">
                    {profile.name?.split(" ").map((n) => n[0]).join("")}
                  </div>
                </div>
                <div className="flex-1">
                  <div className="flex items-center gap-3 mb-1 flex-wrap">
                    <h2 className="text-xl font-bold font-display">{profile.name}</h2>
                    <span className="px-2.5 py-0.5 rounded-full text-[11px] font-semibold bg-[var(--accent-primary)]/10 text-[var(--accent-primary)] border border-[var(--accent-primary)]/20">
                      {profile.plan}
                    </span>
                    {profile.churn_alert && (
                      <span className="px-2 py-0.5 rounded-full text-[10px] font-bold bg-[var(--accent-rose)]/10 text-[var(--accent-rose)] border border-[var(--accent-rose)]/20 flex items-center gap-1">
                        <AlertTriangle className="w-3 h-3" /> At Risk
                      </span>
                    )}
                    {profile.tags?.map((tag) => (
                      <span key={tag} className="px-2 py-0.5 rounded-full text-[10px] bg-[var(--bg-inset)] text-[var(--text-muted)]">{tag}</span>
                    ))}
                  </div>
                  <div className="flex items-center gap-4 text-xs text-[var(--text-muted)] mt-2">
                    {profile.email && <span><ChannelBadge channel="gmail" compact /> {profile.email}</span>}
                    {profile.x_handle && <span><ChannelBadge channel="x" compact /> {profile.x_handle}</span>}
                    {profile.reddit_handle && <span><ChannelBadge channel="reddit" compact /> {profile.reddit_handle}</span>}
                  </div>
                </div>
              </div>

              {/* Stat Tiles */}
              <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                <div className="solid-card p-4 text-center">
                  <DollarSign className="w-4 h-4 text-[var(--accent-emerald)] mx-auto mb-1" />
                  <p className="text-xl font-bold font-display text-[var(--accent-emerald)]">${Number(profile.ltv).toLocaleString()}</p>
                  <p className="text-[10px] text-[var(--text-muted)] mt-0.5">Lifetime Value</p>
                </div>
                <div className="solid-card p-4">
                  <ChurnGauge risk={profile.churn_risk} />
                </div>
                <div className="solid-card p-4 text-center">
                  <ConfidenceRing value={profile.identity_resolution.cosine_similarity} />
                  <p className="text-[10px] text-[var(--text-muted)] mt-1">Identity Match</p>
                </div>
                <div className="solid-card p-4 text-center">
                  <div className={cn(
                    "text-lg font-bold",
                    profile.churn_alert ? "text-[var(--accent-rose)]" : "text-[var(--accent-emerald)]"
                  )}>
                    {profile.churn_alert ? "Alert" : "Safe"}
                  </div>
                  <p className="text-[10px] text-[var(--text-muted)] mt-1">
                    {profile.churn_alert ? "Velocity Warning" : "GDPR Compliant"}
                  </p>
                </div>
              </div>

              {/* Charts Row */}
              <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
                {/* Vector Radar */}
                <div className="solid-card p-5">
                  <h3 className="text-sm font-semibold mb-3 flex items-center gap-2">
                    <Shield className="w-4 h-4 text-[var(--accent-secondary)]" /> Vector Identity Resolution
                  </h3>
                  <ResponsiveContainer width="100%" height={240}>
                    <RadarChart data={radarData}>
                      <PolarGrid stroke="var(--border-subtle)" />
                      <PolarAngleAxis dataKey="dim" tick={{ fill: "var(--text-muted)", fontSize: 10 }} />
                      <PolarRadiusAxis tick={false} axisLine={false} />
                      <Radar name="X Handle" dataKey="X" stroke="var(--accent-primary)" fill="var(--accent-primary)" fillOpacity={0.12} strokeWidth={1.5} />
                      <Radar name="Email" dataKey="Email" stroke="var(--accent-secondary)" fill="var(--accent-secondary)" fillOpacity={0.12} strokeWidth={1.5} />
                    </RadarChart>
                  </ResponsiveContainer>
                </div>

                {/* Sentiment Velocity */}
                <div className="solid-card p-5">
                  <h3 className="text-sm font-semibold mb-3 flex items-center gap-2">
                    <TrendingDown className="w-4 h-4 text-[var(--accent-rose)]" /> Sentiment Velocity (V_sent)
                  </h3>
                  <ResponsiveContainer width="100%" height={240}>
                    <AreaChart data={profile.sentiment_velocity || []}>
                      <defs>
                        <linearGradient id="svGrad" x1="0" y1="0" x2="0" y2="1">
                          <stop offset="0%" stopColor="var(--accent-rose)" stopOpacity={0.2} />
                          <stop offset="100%" stopColor="var(--accent-rose)" stopOpacity={0} />
                        </linearGradient>
                      </defs>
                      <CartesianGrid strokeDasharray="3 3" stroke="var(--border-subtle)" />
                      <XAxis dataKey="timestamp" tickFormatter={(v) => new Date(v).toLocaleTimeString("en", { hour: "2-digit" })} tick={{ fontSize: 10, fill: "var(--text-muted)" }} />
                      <YAxis domain={[-1, 0.5]} tick={{ fontSize: 10, fill: "var(--text-muted)" }} />
                      <Tooltip contentStyle={{ background: "var(--bg-card)", border: "1px solid var(--border-subtle)", borderRadius: 12, fontSize: 11 }} />
                      <Area type="monotone" dataKey="score" stroke="var(--accent-rose)" fill="url(#svGrad)" strokeWidth={2} />
                    </AreaChart>
                  </ResponsiveContainer>
                </div>
              </div>

              {/* Interaction History */}
              <div className="solid-card overflow-hidden">
                <div className="px-5 py-3 border-b border-[var(--border-subtle)] flex items-center justify-between">
                  <h3 className="text-sm font-semibold">Cross-Channel Interaction History</h3>
                  <span className="text-[10px] text-[var(--text-muted)]">{profile.interactions?.length || 0} interactions</span>
                </div>
                <div className="divide-y divide-[var(--border-subtle)] max-h-[280px] overflow-y-auto">
                  {(profile.interactions || []).map((int, i) => (
                    <div key={i} className="px-5 py-3 hover:bg-[var(--bg-card-hover)] transition-colors">
                      <div className="flex items-center gap-2 mb-1">
                        <ChannelBadge channel={int.channel} compact />
                        <span className="text-xs text-[var(--text-muted)]">{int.handle}</span>
                        <span className={cn(
                          "px-1.5 py-0.5 rounded-full text-[9px] font-medium",
                          int.sentiment === "furious" || int.sentiment === "frustrated"
                            ? "bg-[var(--accent-rose)]/10 text-[var(--accent-rose)]"
                            : "bg-[var(--accent-emerald)]/10 text-[var(--accent-emerald)]"
                        )}>{int.sentiment}</span>
                        <span className="text-[10px] text-[var(--text-muted)] ml-auto">
                          {new Date(int.timestamp).toLocaleDateString()}
                        </span>
                      </div>
                      <p className="text-xs text-[var(--text-secondary)] line-clamp-1">{int.message}</p>
                    </div>
                  ))}
                </div>
              </div>
            </div>
          </motion.div>
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  );
}
