"use client";

import React, { useState, useEffect } from "react";
import { motion } from "framer-motion";
import { cn } from "@/lib/utils";
import { Check, Zap, Crown, Building2 } from "lucide-react";

const API = process.env.NEXT_PUBLIC_API_URL || "http://localhost:8000";

export default function SubscriptionsPage() {
  const [plans, setPlans] = useState<any[]>([]);
  const [usage, setUsage] = useState<any>(null);

  useEffect(() => {
    fetch(`${API}/api/v1/subscriptions/plans`).then((r) => r.json()).then((d) => setPlans(d.plans || []));
    fetch(`${API}/api/v1/subscriptions/usage`).then((r) => r.json()).then(setUsage);
  }, []);

  const planIcons: Record<string, React.ElementType> = { starter: Zap, pro: Crown, enterprise: Building2 };

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold">Subscription & Billing</h1>
        <p className="text-sm text-[var(--text-muted)]">Manage your plan, view usage metrics, and track API consumption</p>
      </div>

      {/* Plans */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-5">
        {plans.map((plan, i) => {
          const Icon = planIcons[plan.id] || Zap;
          const isCurrent = usage?.plan === plan.id;
          return (
            <motion.div key={plan.id} initial={{ opacity: 0, y: 16 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: i * 0.1 }}
              className={cn("glass-card p-6 relative", isCurrent && "glow-blue border-blue-500/30", plan.popular && !isCurrent && "border-purple-500/20")}>
              {plan.popular && (
                <span className="absolute -top-3 left-1/2 -translate-x-1/2 px-3 py-0.5 rounded-full text-[10px] font-bold bg-purple-500 text-white uppercase tracking-wider">
                  Most Popular
                </span>
              )}
              {isCurrent && (
                <span className="absolute -top-3 right-4 px-3 py-0.5 rounded-full text-[10px] font-bold bg-blue-500 text-white uppercase tracking-wider">
                  Current Plan
                </span>
              )}
              <Icon className={cn("w-8 h-8 mb-3", isCurrent ? "text-blue-400" : "text-[var(--text-muted)]")} />
              <h3 className="text-lg font-bold">{plan.name}</h3>
              <div className="mt-2 mb-4">
                {plan.price_monthly ? (
                  <div className="flex items-baseline gap-1">
                    <span className="text-3xl font-black">${plan.price_monthly}</span>
                    <span className="text-sm text-[var(--text-muted)]">/mo</span>
                  </div>
                ) : (
                  <span className="text-xl font-bold text-[var(--text-muted)]">Contact Sales</span>
                )}
              </div>
              <ul className="space-y-2 mb-6">
                {plan.features.map((f: string) => (
                  <li key={f} className="flex items-start gap-2 text-sm text-[var(--text-secondary)]">
                    <Check className="w-4 h-4 text-emerald-400 shrink-0 mt-0.5" />
                    {f}
                  </li>
                ))}
              </ul>
              <button className={cn("w-full py-2.5 rounded-xl text-sm font-semibold transition-all",
                isCurrent
                  ? "bg-blue-500/10 text-blue-400 border border-blue-500/20 cursor-default"
                  : "bg-gradient-to-r from-blue-600 to-purple-600 text-white hover:from-blue-500 hover:to-purple-500 shadow-lg shadow-blue-500/20"
              )}>
                {isCurrent ? "Current Plan" : plan.price_monthly ? "Upgrade" : "Contact Sales"}
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
                <div key={m.label} className="p-3 rounded-xl bg-[var(--bg-primary)]">
                  <div className="flex items-center justify-between mb-2">
                    <span className="text-xs text-[var(--text-muted)]">{m.label}</span>
                    <span className={cn("text-xs font-bold", pct > 80 ? "text-red-400" : "text-emerald-400")}>
                      {pct.toFixed(0)}%
                    </span>
                  </div>
                  <p className="text-lg font-bold">{m.used.toLocaleString()}<span className="text-xs text-[var(--text-muted)] font-normal"> / {m.limit.toLocaleString()}</span></p>
                  <div className="w-full h-1.5 rounded-full bg-[var(--bg-secondary)] mt-2 overflow-hidden">
                    <motion.div initial={{ width: 0 }} animate={{ width: `${Math.min(pct, 100)}%` }} transition={{ duration: 1 }}
                      className={cn("h-full rounded-full", pct > 80 ? "bg-red-500" : pct > 60 ? "bg-amber-500" : "bg-emerald-500")} />
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
