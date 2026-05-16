"use client";

import React from "react";
import Link from "next/link";
import Image from "next/image";
import { usePathname } from "next/navigation";
import { motion } from "framer-motion";
import { cn } from "@/lib/utils";
import { useAuth, ROLE_ROUTES, type UserRole } from "@/lib/auth-context";
import { ThemeToggle } from "@/components/theme-toggle";
import {
  LayoutDashboard, Users, CheckSquare, TrendingUp, AlertTriangle,
  ClipboardCheck, CreditCard, Link2, LogOut, Shield,
  BarChart3, ChevronLeft, ChevronRight,
} from "lucide-react";

interface NavItem {
  href: string;
  label: string;
  icon: React.ComponentType<{ className?: string }>;
  badge?: string;
  badgeVariant?: "live" | "ai" | "count";
}

const ALL_NAV_ITEMS: NavItem[] = [
  { href: "/dashboard", label: "Command Center", icon: LayoutDashboard },
  { href: "/dashboard/admin", label: "System Admin", icon: Shield },
  { href: "/dashboard/executive", label: "Executive View", icon: BarChart3 },
  { href: "/dashboard/shadow-tickets", label: "Shadow Tickets", icon: AlertTriangle, badge: "AI", badgeVariant: "ai" },
  { href: "/dashboard/qa-review", label: "QA Review", icon: ClipboardCheck },
  { href: "/dashboard/profiles", label: "Golden Profiles", icon: Users },
  { href: "/dashboard/hitl", label: "HITL Queue", icon: CheckSquare, badge: "LIVE", badgeVariant: "live" },
  { href: "/dashboard/analytics", label: "Analytics", icon: TrendingUp },
  { href: "/dashboard/integrations", label: "Integrations", icon: Link2 },
  { href: "/dashboard/subscriptions", label: "Subscription", icon: CreditCard },
];

const BADGE_STYLES: Record<string, string> = {
  live: "bg-[var(--accent-emerald)]/15 text-[var(--accent-emerald)] border border-[var(--accent-emerald)]/25",
  ai: "bg-[var(--accent-secondary)]/15 text-[var(--accent-secondary)] border border-[var(--accent-secondary)]/25",
  count: "bg-[var(--accent-primary)]/15 text-[var(--accent-primary)]",
};

export function Sidebar({ collapsed, onToggle }: { collapsed: boolean; onToggle: () => void }) {
  const pathname = usePathname();
  const { user, logout } = useAuth();
  const role = user?.role as UserRole;

  const allowedPaths = role ? ROLE_ROUTES[role] : [];
  const navItems = ALL_NAV_ITEMS.filter((item) => allowedPaths.includes(item.href));

  return (
    <motion.aside
      initial={false}
      animate={{ width: collapsed ? 72 : 264 }}
      transition={{ duration: 0.25, ease: [0.25, 0.1, 0.25, 1] }}
      className="h-screen sticky top-0 flex flex-col bg-[var(--bg-secondary)] border-r border-[var(--border-subtle)] z-40 overflow-hidden"
    >
      {/* ── Logo ────────────────────────────────────────── */}
      <div className="flex items-center px-5 py-5 border-b border-[var(--border-subtle)]">
        {collapsed ? (
          <Image
            src="/logo_w.png"
            alt="AURA-CX"
            width={32}
            height={32}
            className="logo-adaptive object-contain mx-auto"
          />
        ) : (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            transition={{ delay: 0.1 }}
            className="flex items-center gap-3"
          >
            <Image
              src="/logo_w.png"
              alt="AURA-CX"
              width={36}
              height={36}
              className="logo-adaptive object-contain"
            />
            <div>
              <h1 className="font-display text-base font-bold tracking-tight leading-none">
                AURA-CX
              </h1>
              <p className="text-[10px] text-[var(--text-muted)] tracking-wide mt-0.5">
                CX Intelligence
              </p>
            </div>
          </motion.div>
        )}
      </div>

      {/* ── Navigation ──────────────────────────────────── */}
      <nav className="flex-1 overflow-y-auto py-4 px-3 space-y-0.5">
        {navItems.map((item) => {
          const active = pathname === item.href;
          return (
            <Link key={item.href} href={item.href}>
              <div
                className={cn(
                  "flex items-center gap-3 px-3 py-2.5 rounded-[var(--radius-md)] transition-all duration-200 relative group",
                  active
                    ? "bg-[var(--accent-primary)]/8 text-[var(--accent-primary)]"
                    : "text-[var(--text-secondary)] hover:bg-[var(--bg-card-hover)] hover:text-[var(--text-primary)]"
                )}
              >
                {/* Active indicator bar */}
                {active && (
                  <motion.div
                    layoutId="nav-active-indicator"
                    className="absolute left-0 top-1/2 -translate-y-1/2 w-[3px] h-5 rounded-r-full bg-[var(--accent-primary)]"
                    transition={{ type: "spring", stiffness: 400, damping: 28 }}
                  />
                )}

                <item.icon
                  className={cn(
                    "w-[18px] h-[18px] shrink-0 transition-colors",
                    active && "text-[var(--accent-primary)]"
                  )}
                />

                {!collapsed && (
                  <span className="text-[13px] font-medium truncate">{item.label}</span>
                )}

                {!collapsed && item.badge && (
                  <span
                    className={cn(
                      "ml-auto text-[9px] font-bold px-1.5 py-0.5 rounded-md uppercase tracking-wider",
                      BADGE_STYLES[item.badgeVariant || "count"]
                    )}
                  >
                    {item.badge}
                  </span>
                )}
              </div>
            </Link>
          );
        })}
      </nav>

      {/* ── Footer ──────────────────────────────────────── */}
      <div className="border-t border-[var(--border-subtle)] p-3 space-y-3">
        {!collapsed && <ThemeToggle />}

        {/* User card */}
        {user && (
          <div className={cn("flex items-center gap-3", collapsed && "justify-center")}>
            <div className="w-8 h-8 rounded-[var(--radius-sm)] bg-gradient-to-br from-[var(--accent-primary)] to-[var(--accent-secondary)] flex items-center justify-center text-white text-[11px] font-bold shrink-0 shadow-sm">
              {user.avatar}
            </div>
            {!collapsed && (
              <div className="flex-1 min-w-0">
                <p className="text-xs font-medium truncate">{user.name}</p>
                <p className="text-[10px] text-[var(--text-muted)] truncate capitalize">
                  {user.role.replace(/_/g, " ")}
                </p>
              </div>
            )}
            {!collapsed && (
              <button
                onClick={logout}
                className="text-[var(--text-muted)] hover:text-[var(--accent-rose)] transition-colors p-1.5 rounded-[var(--radius-sm)] hover:bg-[var(--accent-rose)]/8"
                title="Sign out"
              >
                <LogOut className="w-4 h-4" />
              </button>
            )}
          </div>
        )}

        {/* Collapse toggle */}
        <button
          onClick={onToggle}
          className="w-full flex items-center justify-center p-2 rounded-[var(--radius-sm)] text-[var(--text-muted)] hover:text-[var(--text-secondary)] hover:bg-[var(--bg-card-hover)] transition-all"
        >
          {collapsed ? <ChevronRight className="w-4 h-4" /> : <ChevronLeft className="w-4 h-4" />}
        </button>
      </div>
    </motion.aside>
  );
}
