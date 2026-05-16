"use client";

import React from "react";
import { motion } from "framer-motion";
import type { GoldenProfile } from "@/lib/types";
import { GmailLogo, XLogo } from "@/components/channel-icons";

/* ═══════════════════════════════════════════════════════════
   Golden Profile Stitching — Identity Resolution Visual
   Shows: User X (@handle) → Cosine Σ → User Email (email)
   With LTV, Last Active, Tier beneath.
   ═══════════════════════════════════════════════════════════ */

interface ProfileStitchingProps {
  profile: GoldenProfile;
}

function IdentityBadge({
  channel,
  label,
  handle,
  color,
}: {
  channel: "x" | "gmail";
  label: string;
  handle: string;
  color: string;
}) {
  return (
    <motion.div
      initial={{ opacity: 0, scale: 0.95 }}
      animate={{ opacity: 1, scale: 1 }}
      className="flex items-center gap-2.5 px-4 py-2.5 rounded-[var(--radius-md)] border border-[var(--border-subtle)] bg-[var(--bg-inset)]"
    >
      {channel === "x" ? <XLogo size={16} /> : <GmailLogo size={16} />}
      <div>
        <p className="text-[10px] text-[var(--text-muted)] uppercase tracking-wider font-medium">{label}</p>
        <p className="text-xs font-semibold" style={{ color }}>{handle}</p>
      </div>
    </motion.div>
  );
}

export function GoldenProfileStitching({ profile }: ProfileStitchingProps) {
  const cosine = profile.identity_resolution?.cosine_similarity ?? 0;
  const lastActive = profile.sentiment_velocity?.length
    ? new Date(profile.sentiment_velocity[profile.sentiment_velocity.length - 1].timestamp).toLocaleDateString()
    : "N/A";

  return (
    <div className="space-y-5">
      <h3 className="text-[11px] font-semibold text-[var(--text-muted)] uppercase tracking-wider">
        Golden Profile Stitching
      </h3>

      {/* Identity Stitching Visual */}
      <div className="flex items-center justify-center gap-3 flex-wrap">
        <IdentityBadge channel="x" label="User X" handle={profile.x_handle || "@unknown"} color="var(--text-primary)" />

        {/* Arrow + Sigma */}
        <div className="flex items-center gap-1">
          <motion.div
            initial={{ width: 0 }}
            animate={{ width: 32 }}
            transition={{ duration: 0.5, delay: 0.2 }}
            className="h-[2px] bg-[var(--accent-primary)]"
          />
          <motion.div
            initial={{ opacity: 0, scale: 0.5 }}
            animate={{ opacity: 1, scale: 1 }}
            transition={{ delay: 0.4 }}
            className="w-9 h-9 rounded-[var(--radius-sm)] bg-[var(--accent-primary)]/10 border border-[var(--accent-primary)]/25 flex items-center justify-center"
          >
            <span className="text-base font-bold text-[var(--accent-primary)]">Σ</span>
          </motion.div>
          <motion.div
            initial={{ width: 0 }}
            animate={{ width: 32 }}
            transition={{ duration: 0.5, delay: 0.6 }}
            className="h-[2px] bg-[var(--accent-primary)]"
          />
        </div>

        <IdentityBadge channel="gmail" label="User Email" handle={profile.email || "unknown"} color="var(--text-primary)" />
      </div>

      {/* Cosine Similarity Label */}
      <motion.p
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        transition={{ delay: 0.8 }}
        className="text-center text-xs font-semibold text-[var(--accent-primary)]"
      >
        Cosine &gt; {cosine.toFixed(2)}
      </motion.p>

      {/* LTV / Last Active / Tier Row */}
      <div className="flex items-center gap-6 justify-center flex-wrap">
        <div>
          <p className="text-2xl font-black font-display">
            ${Number(profile.ltv).toLocaleString()}
          </p>
          <p className="text-[10px] text-[var(--text-muted)]">Customer LTV</p>
        </div>
        <div className="w-px h-10 bg-[var(--border-subtle)]" />
        <div className="text-center">
          <p className="text-sm font-semibold">{lastActive}</p>
          <p className="text-[10px] text-[var(--text-muted)]">Last Active</p>
        </div>
        <div className="w-px h-10 bg-[var(--border-subtle)]" />
        <div className="text-center">
          <span className="inline-flex items-center px-3 py-1 rounded-full text-xs font-semibold bg-[var(--accent-primary)]/10 text-[var(--accent-primary)] border border-[var(--accent-primary)]/20">
            {profile.plan || "N/A"}
          </span>
          <p className="text-[10px] text-[var(--text-muted)] mt-1">Tier</p>
        </div>
      </div>
    </div>
  );
}
