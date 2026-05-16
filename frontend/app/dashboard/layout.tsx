"use client";

import React, { useState, useEffect } from "react";
import { useRouter, usePathname } from "next/navigation";
import Link from "next/link";
import Image from "next/image";
import { motion, AnimatePresence } from "framer-motion";
import { useAuth, ROLE_ROUTES, type UserRole } from "@/lib/auth-context";
import { Sidebar } from "@/components/sidebar";
import { PipelineTracker } from "@/components/pipeline-tracker";
import { AlertBanner } from "@/components/alert-banner";
import { ThemeToggleCompact } from "@/components/theme-toggle";
import { fetchShadowTickets } from "@/lib/api";
import {
  Search, Bell, Settings, LayoutDashboard, Ticket, BarChart3,
  Brain, Users,
} from "lucide-react";

/* ── Top-level tab nav items matching mockup ─────────────── */
const NAV_TABS = [
  { href: "/dashboard", label: "Dashboard", icon: LayoutDashboard },
  { href: "/dashboard/hitl", label: "Tickets", icon: Ticket },
  { href: "/dashboard/analytics", label: "Analytics", icon: BarChart3 },
  { href: "/dashboard/shadow-tickets", label: "AI Training", icon: Brain },
  { href: "/dashboard/profiles", label: "Team", icon: Users },
];

const BREADCRUMB_MAP: Record<string, string> = {
  "/dashboard": "Command Center",
  "/dashboard/admin": "System Admin",
  "/dashboard/executive": "Executive View",
  "/dashboard/shadow-tickets": "Shadow Tickets",
  "/dashboard/qa-review": "QA Review",
  "/dashboard/profiles": "Golden Profiles",
  "/dashboard/hitl": "HITL Queue",
  "/dashboard/analytics": "Analytics",
  "/dashboard/integrations": "Integrations",
  "/dashboard/subscriptions": "Subscription",
};

export default function DashboardLayout({ children }: { children: React.ReactNode }) {
  const { user, loading } = useAuth();
  const router = useRouter();
  const pathname = usePathname();
  const [collapsed, setCollapsed] = useState(false);
  const [search, setSearch] = useState("");
  const [alertVisible, setAlertVisible] = useState(true);
  const [alertMessage, setAlertMessage] = useState("");
  const [pipelineStage, setPipelineStage] = useState(0);

  // Auth guard
  useEffect(() => {
    if (!loading && !user) {
      router.replace("/login");
    }
  }, [user, loading, router]);

  // RBAC guard
  useEffect(() => {
    if (user) {
      const allowed = ROLE_ROUTES[user.role as UserRole] || [];
      if (!allowed.includes(pathname)) {
        const fallback = allowed[0] || "/dashboard";
        router.replace(fallback);
      }
    }
  }, [user, pathname, router]);

  // Fetch shadow ticket alerts from real API
  useEffect(() => {
    let mounted = true;
    async function loadAlerts() {
      try {
        const data = await fetchShadowTickets();
        if (mounted && data.shadow_tickets?.length > 0) {
          const critical = data.shadow_tickets.find((s) => s.severity === "critical");
          if (critical) {
            setAlertMessage(
              `HDBSCAN Shadow Ticket Detected: ${critical.title} — Urgent Investigation Required.`
            );
            setAlertVisible(true);
          }
        }
      } catch {
        setAlertMessage("");
      }
    }
    loadAlerts();
    return () => { mounted = false; };
  }, []);

  // Cycle pipeline stage based on route context
  useEffect(() => {
    const nextStage = pathname.includes("hitl")
      ? 4
      : pathname.includes("shadow-tickets")
      ? 6
      : pathname.includes("analytics")
      ? 6
      : pathname.includes("profiles")
      ? 2
      : 0;
    const raf = requestAnimationFrame(() => setPipelineStage(nextStage));
    return () => cancelAnimationFrame(raf);
  }, [pathname]);

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-[var(--bg-primary)]">
        <div className="flex flex-col items-center gap-3">
          <div className="w-8 h-8 border-2 border-[var(--accent-primary)] border-t-transparent rounded-full animate-spin" />
          <p className="text-xs text-[var(--text-muted)]">Loading workspace…</p>
        </div>
      </div>
    );
  }

  if (!user) return null;

  return (
    <div className="flex min-h-screen bg-[var(--bg-primary)]">
      <Sidebar collapsed={collapsed} onToggle={() => setCollapsed(!collapsed)} />

      <div className="flex-1 flex flex-col overflow-x-hidden">
        {/* ── HDBSCAN Alert Banner ─────────────────────── */}
        <AlertBanner
          message={alertMessage}
          visible={alertVisible && !!alertMessage}
          onDismiss={() => setAlertVisible(false)}
        />

        {/* ── Top Navigation Bar (Tabbed) ─────────────── */}
        <header className="sticky top-0 z-30 bg-[var(--bg-secondary)]/80 backdrop-blur-xl border-b border-[var(--border-subtle)]">
          <div className="flex items-center justify-between px-6 h-14">
            {/* Logo + Tab Nav (matching mockup) */}
            <div className="flex items-center gap-6">
              <div className="flex items-center gap-2.5 mr-2">
                <Image
                  src="/logo_w.png"
                  alt="AURA-CX"
                  width={28}
                  height={28}
                  className="logo-adaptive object-contain"
                />
                <span className="font-display text-sm font-bold tracking-tight hidden lg:inline">
                  AURA-CX
                </span>
              </div>

              {/* Tabs */}
              <nav className="flex items-center gap-0.5">
                {NAV_TABS.map((tab) => {
                  const isActive = pathname === tab.href ||
                    (tab.href !== "/dashboard" && pathname.startsWith(tab.href));
                  const Icon = tab.icon;
                  return (
                    <Link key={tab.href} href={tab.href}>
                      <div className="relative flex items-center gap-1.5 px-3 py-2 rounded-[var(--radius-sm)] transition-colors">
                        <Icon className={`w-3.5 h-3.5 ${isActive ? "text-[var(--accent-primary)]" : "text-[var(--text-muted)]"}`} />
                        <span className={`text-[12px] font-medium ${isActive ? "text-[var(--accent-primary)]" : "text-[var(--text-secondary)] hover:text-[var(--text-primary)]"}`}>
                          {tab.label}
                        </span>
                        {isActive && (
                          <motion.div
                            layoutId="tab-active"
                            className="absolute bottom-0 left-2 right-2 h-[2px] bg-[var(--accent-primary)] rounded-full"
                            transition={{ type: "spring", stiffness: 400, damping: 28 }}
                          />
                        )}
                      </div>
                    </Link>
                  );
                })}
              </nav>
            </div>

            {/* Right section */}
            <div className="flex items-center gap-2">
              <button className="flex items-center gap-1.5 px-3 py-1.5 rounded-[var(--radius-sm)] text-[var(--text-muted)] hover:text-[var(--text-primary)] hover:bg-[var(--bg-card-hover)] transition-all text-xs font-medium">
                <Settings className="w-3.5 h-3.5" />
                <span className="hidden sm:inline">Settings</span>
              </button>
              <ThemeToggleCompact />
              <button title="Notifications" className="relative p-2 rounded-[var(--radius-sm)] text-[var(--text-muted)] hover:text-[var(--text-primary)] hover:bg-[var(--bg-card-hover)] transition-all">
                <Bell className="w-4 h-4" />
                <span className="absolute top-1.5 right-1.5 w-1.5 h-1.5 bg-[var(--accent-rose)] rounded-full" />
              </button>
            </div>
          </div>

          {/* ── Pipeline Tracker ─────────────────────────── */}
          <div className="border-t border-[var(--border-subtle)]">
            <PipelineTracker
              activeStage={pipelineStage}
              onStageClick={(i) => setPipelineStage(i)}
            />
          </div>
        </header>

        {/* ── Page Content with transitions ───────────── */}
        <main className="flex-1">
          <div className="max-w-[1600px] mx-auto p-6">
            <AnimatePresence mode="wait">
              <motion.div
                key={pathname}
                initial={{ opacity: 0, y: 6 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: -4 }}
                transition={{ duration: 0.25, ease: [0.25, 0.1, 0.25, 1] }}
              >
                {children}
              </motion.div>
            </AnimatePresence>
          </div>
        </main>
      </div>
    </div>
  );
}
