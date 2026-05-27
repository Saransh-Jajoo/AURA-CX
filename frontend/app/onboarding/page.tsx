"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { CheckCircle2, Circle, Database, KeyRound, Mail, ShieldCheck, Upload, Users } from "lucide-react";
import { fetchOnboardingStatus } from "@/lib/api";

const STEPS = [
  { key: "organization", label: "Organization", href: "/dashboard/settings", icon: ShieldCheck },
  { key: "workspace", label: "Workspace", href: "/dashboard/settings", icon: Database },
  { key: "ai_provider", label: "AI provider", href: "/dashboard/settings", icon: KeyRound },
  { key: "knowledge_base", label: "Knowledge base", href: "/dashboard/knowledge", icon: Upload },
  { key: "complaint_channels", label: "Complaint channels", href: "/dashboard/integrations", icon: Mail },
  { key: "sla_policies", label: "SLA policies", href: "/dashboard/settings", icon: ShieldCheck },
  { key: "team_members", label: "Team members", href: "/dashboard/team", icon: Users },
];

export default function OnboardingPage() {
  const [status, setStatus] = useState<{ complete: boolean; steps: Record<string, boolean> } | null>(null);

  useEffect(() => {
    fetchOnboardingStatus().then(setStatus).catch(() => setStatus(null));
  }, []);

  return (
    <main className="min-h-screen bg-[var(--bg-primary)] text-[var(--text-primary)]">
      <div className="max-w-5xl mx-auto px-4 py-8 sm:py-12">
        <div className="flex flex-col sm:flex-row sm:items-end sm:justify-between gap-4 mb-6">
          <div>
            <h1 className="text-2xl font-display font-bold">Enterprise Workspace Onboarding</h1>
            <p className="text-sm text-[var(--text-muted)] mt-1">Complete the operational foundations before live complaint ingestion.</p>
          </div>
          <Link href="/dashboard" className="inline-flex items-center justify-center px-4 py-2 text-sm font-semibold text-white bg-[var(--accent-primary)] rounded-[var(--radius-sm)]">
            Open dashboard
          </Link>
        </div>

        <section className="solid-card overflow-hidden">
          {STEPS.map((step) => {
            const done = Boolean(status?.steps?.[step.key]);
            const Icon = step.icon;
            return (
              <Link
                href={step.href}
                key={step.key}
                className="flex items-center gap-3 p-4 border-b border-[var(--border-subtle)] last:border-b-0 hover:bg-[var(--bg-card-hover)] transition-colors"
              >
                <div className="w-10 h-10 rounded-[var(--radius-sm)] bg-[var(--bg-elevated)] flex items-center justify-center">
                  <Icon className="w-5 h-5 text-[var(--accent-primary)]" />
                </div>
                <div className="flex-1 min-w-0">
                  <div className="text-sm font-semibold">{step.label}</div>
                  <div className="text-xs text-[var(--text-muted)]">{done ? "Configured" : "Needs setup"}</div>
                </div>
                {done ? <CheckCircle2 className="w-5 h-5 text-[var(--accent-emerald)]" /> : <Circle className="w-5 h-5 text-[var(--text-muted)]" />}
              </Link>
            );
          })}
        </section>
      </div>
    </main>
  );
}
