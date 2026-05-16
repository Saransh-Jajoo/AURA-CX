"use client";

import React from "react";
import { motion } from "framer-motion";

/* ═══════════════════════════════════════════════════════════
   Sentiment Velocity Gauge — Speedometer Style
   Shows V_sent percentage with needle, Stable→Extreme arc,
   and HIGH CHURN RISK badge when appropriate.
   ═══════════════════════════════════════════════════════════ */

interface SentimentGaugeProps {
  /** 0-100 percentage */
  value: number;
  /** Show HIGH CHURN RISK badge */
  highRisk?: boolean;
  size?: number;
}

export function SentimentGauge({ value, highRisk = false, size = 260 }: SentimentGaugeProps) {
  const clampedValue = Math.max(0, Math.min(100, value));
  // Gauge arc from 180° (left) to 0° (right) — bottom half hidden
  // Needle rotation: -90° (left/stable) to +90° (right/extreme)
  const needleAngle = -90 + (clampedValue / 100) * 180;

  const cx = size / 2;
  const cy = size * 0.55;
  const r = size * 0.38;

  // Create gradient arc segments
  const arcPath = (startAngle: number, endAngle: number) => {
    const startRad = (startAngle * Math.PI) / 180;
    const endRad = (endAngle * Math.PI) / 180;
    const x1 = cx + r * Math.cos(startRad);
    const y1 = cy + r * Math.sin(startRad);
    const x2 = cx + r * Math.cos(endRad);
    const y2 = cy + r * Math.sin(endRad);
    const large = endAngle - startAngle > 180 ? 1 : 0;
    return `M ${x1} ${y1} A ${r} ${r} 0 ${large} 1 ${x2} ${y2}`;
  };

  return (
    <div className="relative flex flex-col items-center">
      {/* HIGH CHURN RISK Badge */}
      {highRisk && (
        <motion.div
          initial={{ opacity: 0, y: -4 }}
          animate={{ opacity: 1, y: 0 }}
          className="absolute -top-1 right-0 px-2.5 py-1 rounded-[var(--radius-sm)] text-[9px] font-bold uppercase tracking-wider bg-[var(--accent-rose)]/12 text-[var(--accent-rose)] border border-[var(--accent-rose)]/20 z-10"
        >
          HIGH CHURN RISK
        </motion.div>
      )}

      <svg width={size} height={size * 0.6} viewBox={`0 0 ${size} ${size * 0.65}`}>
        {/* Background arc */}
        <path
          d={arcPath(180, 360)}
          fill="none"
          stroke="var(--border-subtle)"
          strokeWidth={size * 0.06}
          strokeLinecap="round"
        />

        {/* Green zone (0-33%) — Stable */}
        <path
          d={arcPath(180, 240)}
          fill="none"
          stroke="var(--accent-emerald)"
          strokeWidth={size * 0.06}
          strokeLinecap="round"
          opacity={0.3}
        />

        {/* Yellow zone (33-66%) — Moderate */}
        <path
          d={arcPath(240, 300)}
          fill="none"
          stroke="var(--accent-amber)"
          strokeWidth={size * 0.06}
          strokeLinecap="round"
          opacity={0.3}
        />

        {/* Red zone (66-100%) — Extreme */}
        <path
          d={arcPath(300, 360)}
          fill="none"
          stroke="var(--accent-rose)"
          strokeWidth={size * 0.06}
          strokeLinecap="round"
          opacity={0.3}
        />

        {/* Active fill arc */}
        <motion.path
          d={arcPath(180, 180 + (clampedValue / 100) * 180)}
          fill="none"
          stroke={clampedValue > 66 ? "var(--accent-rose)" : clampedValue > 33 ? "var(--accent-amber)" : "var(--accent-emerald)"}
          strokeWidth={size * 0.06}
          strokeLinecap="round"
          initial={{ pathLength: 0 }}
          animate={{ pathLength: 1 }}
          transition={{ duration: 1.2, ease: "easeOut" }}
        />

        {/* Needle */}
        <motion.g
          initial={{ rotate: -90 }}
          animate={{ rotate: needleAngle }}
          transition={{ duration: 1.5, ease: "easeOut", type: "spring", stiffness: 60, damping: 15 }}
          style={{ transformOrigin: `${cx}px ${cy}px` }}
        >
          <line
            x1={cx}
            y1={cy}
            x2={cx + r * 0.85}
            y2={cy}
            stroke="var(--text-primary)"
            strokeWidth={2.5}
            strokeLinecap="round"
          />
          {/* Needle tip */}
          <circle cx={cx + r * 0.85} cy={cy} r={3} fill="var(--text-primary)" />
        </motion.g>

        {/* Center dot */}
        <circle cx={cx} cy={cy} r={size * 0.03} fill="var(--text-primary)" />

        {/* Labels */}
        <text x={size * 0.08} y={cy + size * 0.08} fill="var(--text-muted)" fontSize={size * 0.04} fontWeight="600">
          Stable
        </text>
        <text x={size * 0.82} y={cy + size * 0.08} fill="var(--accent-rose)" fontSize={size * 0.04} fontWeight="600">
          Extreme
        </text>
      </svg>

      {/* Value Display */}
      <div className="text-center -mt-3">
        <span className="text-[11px] text-[var(--text-muted)] uppercase tracking-wider font-medium">V_sent: </span>
        <span
          className="text-2xl font-black font-display"
          style={{
            color: clampedValue > 66 ? "var(--accent-rose)" : clampedValue > 33 ? "var(--accent-amber)" : "var(--accent-emerald)",
          }}
        >
          {clampedValue}%
        </span>
      </div>
    </div>
  );
}
