"use client";

import React from "react";
import { motion } from "framer-motion";
import { cn } from "@/lib/utils";
import {
  Download, ShieldCheck, Fingerprint, Brain, UserCheck, Timer,
} from "lucide-react";

/* ═══════════════════════════════════════════════════════════
   Pipeline Tracker — Horizontal Interactive Stage Bar
   Lights up as a ticket moves through stages:
   Ingestion & Triage → AI Cognition → HITL Gateway → Feedback → Enterprise
   ═══════════════════════════════════════════════════════════ */

export interface PipelineStage {
  id: string;
  label: string;
  shortLabel: string;
  icon: React.ComponentType<{ className?: string }>;
  color: string;
}

const STAGES: PipelineStage[] = [
  { id: "intake", label: "Complaint Intake", shortLabel: "Intake", icon: Download, color: "var(--pipeline-ingestion)" },
  { id: "privacy", label: "PII & Risk Check", shortLabel: "Risk", icon: ShieldCheck, color: "var(--pipeline-cognition)" },
  { id: "customer", label: "Customer Match", shortLabel: "Customer", icon: Fingerprint, color: "var(--pipeline-hitl)" },
  { id: "policy", label: "Policy Lookup", shortLabel: "Policy", icon: Brain, color: "var(--pipeline-feedback)" },
  { id: "review", label: "Worker Review", shortLabel: "Review", icon: UserCheck, color: "var(--accent-teal)" },
  { id: "sla", label: "SLA Tracking", shortLabel: "SLA", icon: Timer, color: "var(--accent-sky)" },
];

interface PipelineTrackerProps {
  /** Current active stage index (0-3). -1 = none active */
  activeStage?: number;
  /** Callback when a stage is clicked */
  onStageClick?: (stageIndex: number) => void;
  /** Compact mode for smaller viewports */
  compact?: boolean;
}

export function PipelineTracker({
  activeStage = 0,
  onStageClick,
  compact = false,
}: PipelineTrackerProps) {
  return (
    <div className="pipeline-tracker">
      {STAGES.map((stage, i) => {
        const isActive = i <= activeStage;
        const isCurrent = i === activeStage;
        const Icon = stage.icon;

        return (
          <React.Fragment key={stage.id}>
            {i > 0 && (
              <motion.div
                className="pipeline-connector"
                initial={{ scaleX: 0 }}
                animate={{
                  scaleX: 1,
                  background: isActive ? stage.color : "var(--border-subtle)",
                }}
                transition={{ duration: 0.5, delay: i * 0.1 }}
                style={{ transformOrigin: "left" }}
              />
            )}
            <motion.button
              onClick={() => onStageClick?.(i)}
              className={cn(
                "pipeline-step",
                isActive && "active"
              )}
              style={{
                background: isActive ? `color-mix(in srgb, ${stage.color} 12%, transparent)` : "transparent",
                color: isActive ? stage.color : "var(--text-muted)",
                border: `1px solid ${isActive ? `color-mix(in srgb, ${stage.color} 25%, transparent)` : "transparent"}`,
              }}
              initial={{ opacity: 0, y: -4 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: i * 0.08 }}
              whileHover={{ scale: 1.02 }}
              whileTap={{ scale: 0.98 }}
            >
              <Icon className="w-3.5 h-3.5" />
              {!compact && (
                <span className="hidden sm:inline">{stage.label}</span>
              )}
              {compact && (
                <span>{stage.shortLabel}</span>
              )}
              {isCurrent && (
                <motion.div
                  className="w-1.5 h-1.5 rounded-full ml-1"
                  style={{ background: stage.color }}
                  animate={{ scale: [1, 1.4, 1], opacity: [1, 0.5, 1] }}
                  transition={{ duration: 2, repeat: Infinity }}
                />
              )}
            </motion.button>
          </React.Fragment>
        );
      })}
    </div>
  );
}
