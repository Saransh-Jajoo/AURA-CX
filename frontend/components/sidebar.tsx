"use client";

import React from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { motion } from "framer-motion";
import { cn } from "@/lib/utils";
import { useAuth, ROLE_ROUTES, type UserRole } from "@/lib/auth-context";
import { ThemeToggle } from "@/components/theme-toggle";
import {
  LayoutDashboard, Users, CheckSquare, TrendingUp, AlertTriangle,
  ClipboardCheck, Settings, CreditCard, Link2, LogOut, Shield,
  BarChart3, ChevronLeft, ChevronRight,
} from "lucide-react";

interface NavItem {
  href: string;
  label: string;
  icon: React.ElementType;
  badge?: string;
  badgeColor?: string;
}

const ALL_NAV_ITEMS: NavItem[] = [
  { href: "/dashboard", label: "Command Center", icon: LayoutDashboard },
  { href: "/dashboard/admin", label: "System Admin", icon: Shield },
  { href: "/dashboard/executive", label: "Executive View", icon: BarChart3 },
  { href: "/dashboard/shadow-tickets", label: "Shadow Tickets", icon: AlertTriangle, badge: "AI", badgeColor: "bg-purple-500/20 text-purple-400" },
  { href: "/dashboard/qa-review", label: "QA Review", icon: ClipboardCheck },
  { href: "/dashboard/profiles", label: "Golden Profiles", icon: Users },
  { href: "/dashboard/hitl", label: "HITL Queue", icon: CheckSquare, badge: "LIVE", badgeColor: "bg-emerald-500/20 text-emerald-400" },
  { href: "/dashboard/analytics", label: "Analytics", icon: TrendingUp },
  { href: "/dashboard/integrations", label: "Integrations", icon: Link2 },
  { href: "/dashboard/subscriptions", label: "Subscription", icon: CreditCard },
];

export function Sidebar({ collapsed, onToggle }: { collapsed: boolean; onToggle: () => void }) {
  const pathname = usePathname();
  const { user, logout } = useAuth();
  const role = user?.role as UserRole;

  const allowedPaths = role ? ROLE_ROUTES[role] : [];
  const navItems = ALL_NAV_ITEMS.filter((item) => allowedPaths.includes(item.href));

  return (
    <motion.aside
      initial={false}
      animate={{ width: collapsed ? 72 : 260 }}
      transition={{ duration: 0.2, ease: "easeInOut" }}
      className="h-screen sticky top-0 flex flex-col bg-[var(--bg-secondary)] border-r border-[var(--border-subtle)] z-40"
    >
      {/* Logo */}
      <div className="flex items-center justify-center px-4 py-5 border-b border-[var(--border-subtle)]">
        {collapsed ? (
          <img src="/logo_w.svg" alt="AURA-CX" className="h-8 w-8 object-contain" />
        ) : (
          <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} transition={{ delay: 0.1 }}>
            <img src="/logo_w.svg" alt="AURA-CX" className="h-10 object-contain" />
          </motion.div>
        )}
      </div>

      {/* Navigation */}
      <nav className="flex-1 overflow-y-auto py-3 px-2 space-y-1">
        {navItems.map((item) => {
          const active = pathname === item.href;
          return (
            <Link key={item.href} href={item.href}>
              <div
                className={cn(
                  "flex items-center gap-3 px-3 py-2.5 rounded-xl transition-all group relative",
                  active
                    ? "bg-blue-500/10 text-blue-400 border border-blue-500/20"
                    : "text-[var(--text-secondary)] hover:bg-[var(--bg-card-hover)] hover:text-[var(--text-primary)]"
                )}
              >
                {active && (
                  <motion.div
                    layoutId="sidebar-active"
                    className="absolute left-0 top-1/2 -translate-y-1/2 w-1 h-6 rounded-r-full bg-blue-500"
                    transition={{ type: "spring", stiffness: 500, damping: 30 }}
                  />
                )}
                <item.icon className={cn("w-[18px] h-[18px] shrink-0", active && "text-blue-400")} />
                {!collapsed && (
                  <span className="text-sm font-medium truncate">{item.label}</span>
                )}
                {!collapsed && item.badge && (
                  <span className={cn("ml-auto text-[9px] font-bold px-1.5 py-0.5 rounded-md uppercase", item.badgeColor)}>
                    {item.badge}
                  </span>
                )}
              </div>
            </Link>
          );
        })}
      </nav>

      {/* Footer */}
      <div className="border-t border-[var(--border-subtle)] p-3 space-y-3">
        {!collapsed && <ThemeToggle />}

        {/* User */}
        {user && (
          <div className={cn("flex items-center gap-3", collapsed && "justify-center")}>
            <div className="w-8 h-8 rounded-lg bg-gradient-to-br from-blue-500 to-purple-500 flex items-center justify-center text-white text-xs font-bold shrink-0">
              {user.avatar}
            </div>
            {!collapsed && (
              <div className="flex-1 min-w-0">
                <p className="text-xs font-medium truncate">{user.name}</p>
                <p className="text-[10px] text-[var(--text-muted)] truncate">{user.role.replace("_", " ")}</p>
              </div>
            )}
            {!collapsed && (
              <button
                onClick={logout}
                className="text-[var(--text-muted)] hover:text-red-400 transition-colors p-1.5 rounded-lg hover:bg-red-500/10"
                title="Sign out"
              >
                <LogOut className="w-4 h-4" />
              </button>
            )}
          </div>
        )}

        {/* Collapse Toggle */}
        <button
          onClick={onToggle}
          className="w-full flex items-center justify-center p-2 rounded-lg text-[var(--text-muted)] hover:text-[var(--text-secondary)] hover:bg-[var(--bg-card-hover)] transition-all"
        >
          {collapsed ? <ChevronRight className="w-4 h-4" /> : <ChevronLeft className="w-4 h-4" />}
        </button>
      </div>
    </motion.aside>
  );
}
