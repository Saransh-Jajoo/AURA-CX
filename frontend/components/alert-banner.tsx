"use client";

import React from "react";
import { motion, AnimatePresence } from "framer-motion";
import { AlertTriangle, X } from "lucide-react";

/* ═══════════════════════════════════════════════════════════
   HDBSCAN Alert Banner
   Dismissible alert banner for shadow ticket anomalies.
   Exactly matches the mockup: red/coral banner at top of layout.
   ═══════════════════════════════════════════════════════════ */

interface AlertBannerProps {
  message: string;
  visible: boolean;
  onDismiss: () => void;
  severity?: "critical" | "warning" | "info";
}

export function AlertBanner({ message, visible, onDismiss, severity = "critical" }: AlertBannerProps) {
  return (
    <AnimatePresence>
      {visible && (
        <motion.div
          className={`alert-banner ${severity === "critical" ? "alert-banner-critical" : ""}`}
          initial={{ height: 0, opacity: 0 }}
          animate={{ height: "auto", opacity: 1 }}
          exit={{ height: 0, opacity: 0 }}
          transition={{ duration: 0.3, ease: [0.25, 0.1, 0.25, 1] }}
        >
          <AlertTriangle className="w-4 h-4 shrink-0" />
          <span>{message}</span>
          <button
            className="dismiss-btn"
            onClick={onDismiss}
            aria-label="Dismiss alert"
          >
            <X className="w-4 h-4" />
          </button>
        </motion.div>
      )}
    </AnimatePresence>
  );
}
