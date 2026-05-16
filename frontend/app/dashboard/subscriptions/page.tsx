"use client";

import React, { useState, useEffect } from "react";
import { motion } from "framer-motion";
import { cn } from "@/lib/utils";
import { Check, Zap, Crown, Building2, Loader2, ExternalLink } from "lucide-react";

const API = process.env.NEXT_PUBLIC_API_URL || "http://localhost:8000";

interface Plan {
  id: string;
  name: string;
  price_monthly: number | null;
  popular?: boolean;
  features: string[];
}

interface UsageMetric {
  tickets_processed: number;
  tickets_limit: number;
  api_calls_today: number;
  api_calls_limit: number;
  ai_drafts_generated: number;
  ai_drafts_limit: number;
  agent_seats_used: number;
  agent_seats_limit: number;
}

interface UsageData {
  plan: string;
  usage: UsageMetric;
}

export default function SubscriptionsPage() {
  const [plans, setPlans] = useState<Plan[]>([]);
  const [usage, setUsage] = useState<UsageData | null>(null);
  const [checkoutLoading, setCheckoutLoading] = useState<string | null>(null);
  const [statusMsg, setStatusMsg] = useState<{ type: "success" | "cancelled"; text: string } | null>(null);

  useEffect(() => {
    const token = localStorage.getItem("aura_token");
    fetch(`${API}/api/v1/subscriptions/plans`).then((r) => r.json()).then((d) => setPlans(d.plans || []));
    fetch(`${API}/api/v1/subscriptions/usage`, {
      headers: token ? { Authorization: `Bearer ${token}` } : {},
    }).then((r) => r.json()).then(setUsage).catch(() => setUsage(null));

    // Handle return from Stripe checkout
    const params = new URLSearchParams(window.location.search);
    const status = params.get("status");
    if (status === "success") {
      setStatusMsg({ type: "success", text: "Payment successful! Your plan has been upgraded." });
    } else if (status === "cancelled") {
      setStatusMsg({ type: "cancelled", text: "Checkout cancelled. No changes were made." });
    }
  }, []);

  const handleUpgrade = async (planId: string) => {
    setCheckoutLoading(planId);
    try {
      const token = typeof window !== "undefined" ? localStorage.getItem("aura_token") : null;
      const res = await fetch(`${API}/api/v1/subscriptions/checkout`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          ...(token ? { Authorization: `Bearer ${token}` } : {}),
        },
        body: JSON.stringify({ plan_id: planId }),
      });
      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        alert(err.detail || "Checkout failed. Please try again.");
        return;
      }
      const data = await res.json();
      if (data.checkout_url) {
        window.location.href = data.checkout_url;
      }
    } catch {
      alert("Network error. Please try again.");
    } finally {
      setCheckoutLoading(null);
    }
  };

  const planIcons: Record<string, React.ComponentType<{ className?: string }>> = { starter: Zap, pro: Crown, enterprise: Building2 };

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold font-display">Subscription & Billing</h1>
        <p className="text-sm text-[var(--text-muted)]">Manage your plan, view usage metrics, and track API consumption</p>
      </div>

      {/* Checkout Status Banner */}
      {statusMsg && (
        <motion.div initial={{ opacity: 0, y: -8 }} animate={{ opacity: 1, y: 0 }}
          className={cn("p-4 rounded-[var(--radius-md)] text-sm font-medium border",
            statusMsg.type === "success"
              ? "bg-[var(--accent-emerald)]/8 text-[var(--accent-emerald)] border-[var(--accent-emerald)]/20"
              : "bg-[var(--accent-amber)]/8 text-[var(--accent-amber)] border-[var(--accent-amber)]/20"
          )}>
          {statusMsg.text}
        </motion.div>
      )}

      {/* Plans */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-5">
        {plans.map((plan, i) => {
          const Icon = planIcons[plan.id] || Zap;
          const isCurrent = usage?.plan === plan.id;
          return (
            <motion.div key={plan.id} initial={{ opacity: 0, y: 16 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: i * 0.1 }}
              className={cn("glass-card p-6 relative",
                isCurrent && "border-[var(--accent-primary)]/30 glow-primary",
                plan.popular && !isCurrent && "border-[var(--accent-secondary)]/20"
              )}>
              {plan.popular && (
                <span className="absolute -top-3 left-1/2 -translate-x-1/2 px-3 py-0.5 rounded-full text-[10px] font-bold bg-[var(--accent-secondary)] text-white uppercase tracking-wider">
                  Most Popular
                </span>
              )}
              {isCurrent && (
                <span className="absolute -top-3 right-4 px-3 py-0.5 rounded-full text-[10px] font-bold bg-[var(--accent-primary)] text-white uppercase tracking-wider">
                  Current Plan
                </span>
              )}
              <Icon className={cn("w-8 h-8 mb-3", isCurrent ? "text-[var(--accent-primary)]" : "text-[var(--text-muted)]")} />
              <h3 className="text-lg font-bold font-display">{plan.name}</h3>
              <div className="mt-2 mb-4">
                {plan.price_monthly ? (
                  <div className="flex items-baseline gap-1">
                    <span className="text-3xl font-black font-display">${plan.price_monthly}</span>
                    <span className="text-sm text-[var(--text-muted)]">/mo</span>
                  </div>
                ) : (
                  <span className="text-xl font-bold text-[var(--text-muted)] font-display">Contact Sales</span>
                )}
              </div>
              <ul className="space-y-2 mb-6">
                {plan.features.map((f) => (
                  <li key={f} className="flex items-start gap-2 text-sm text-[var(--text-secondary)]">
                    <Check className="w-4 h-4 text-[var(--accent-emerald)] shrink-0 mt-0.5" />
                    {f}
                  </li>
                ))}
              </ul>
              <button
                onClick={() => !isCurrent && plan.price_monthly && handleUpgrade(plan.id)}
                disabled={isCurrent || checkoutLoading === plan.id || !plan.price_monthly}
                className={cn("w-full py-2.5 rounded-[var(--radius-md)] text-sm font-semibold transition-all active:scale-[0.98] disabled:opacity-60",
                isCurrent
                  ? "bg-[var(--accent-primary)]/8 text-[var(--accent-primary)] border border-[var(--accent-primary)]/20 cursor-default"
                  : "text-white bg-[var(--accent-primary)] hover:brightness-110 shadow-lg shadow-[var(--accent-primary)]/15"
              )}
              >
                {checkoutLoading === plan.id ? "Opening Stripe..." : isCurrent ? "Current Plan" : plan.price_monthly ? "Upgrade" : "Contact Sales"}
              </button>
            </motion.div>
          );
        })}
      </div>

      {/* Usage Metrics */}
      {usage && (
        <div className="glass-card p-5">
          <h3 className="text-sm font-semibold mb-4">Current Usage</h3>
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
            {[
              { label: "Tickets Processed", used: usage.usage.tickets_processed, limit: usage.usage.tickets_limit },
              { label: "API Calls Today", used: usage.usage.api_calls_today, limit: usage.usage.api_calls_limit },
              { label: "AI Drafts Generated", used: usage.usage.ai_drafts_generated, limit: usage.usage.ai_drafts_limit },
              { label: "Agent Seats", used: usage.usage.agent_seats_used, limit: usage.usage.agent_seats_limit },
            ].map((m) => {
              const pct = m.limit > 0 ? (m.used / m.limit) * 100 : 0;
              return (
                <div key={m.label} className="p-3 rounded-[var(--radius-md)] bg-[var(--bg-inset)]">
                  <div className="flex items-center justify-between mb-2">
                    <span className="text-xs text-[var(--text-muted)]">{m.label}</span>
                    <span className={cn("text-xs font-bold", pct > 80 ? "text-[var(--accent-rose)]" : "text-[var(--accent-emerald)]")}>
                      {pct.toFixed(0)}%
                    </span>
                  </div>
                  <p className="text-lg font-bold font-display">{m.used.toLocaleString()}<span className="text-xs text-[var(--text-muted)] font-normal"> / {m.limit.toLocaleString()}</span></p>
                  <div className="w-full h-1.5 rounded-full bg-[var(--bg-secondary)] mt-2 overflow-hidden">
                    <motion.div initial={{ width: 0 }} animate={{ width: `${Math.min(pct, 100)}%` }} transition={{ duration: 1 }}
                      className={cn("h-full rounded-full", pct > 80 ? "bg-[var(--accent-rose)]" : pct > 60 ? "bg-[var(--accent-amber)]" : "bg-[var(--accent-emerald)]")} />
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      )}
    </div>
  );
}
