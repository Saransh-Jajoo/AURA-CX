"use client";

import React, { useState, useEffect } from "react";
import { useRouter, usePathname } from "next/navigation";
import { useAuth, ROLE_ROUTES, type UserRole } from "@/lib/auth-context";
import { Sidebar } from "@/components/sidebar";

export default function DashboardLayout({ children }: { children: React.ReactNode }) {
  const { user, loading } = useAuth();
  const router = useRouter();
  const pathname = usePathname();
  const [collapsed, setCollapsed] = useState(false);

  useEffect(() => {
    if (!loading && !user) {
      router.replace("/login");
    }
  }, [user, loading, router]);

  // Gate: check role access for current route
  useEffect(() => {
    if (user) {
      const allowed = ROLE_ROUTES[user.role as UserRole] || [];
      if (!allowed.includes(pathname)) {
        // Redirect to their default allowed page
        const fallback = allowed[0] || "/dashboard";
        router.replace(fallback);
      }
    }
  }, [user, pathname, router]);

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-[var(--bg-primary)]">
        <div className="w-8 h-8 border-2 border-blue-500 border-t-transparent rounded-full animate-spin" />
      </div>
    );
  }

  if (!user) return null;

  return (
    <div className="flex min-h-screen bg-[var(--bg-primary)]">
      <Sidebar collapsed={collapsed} onToggle={() => setCollapsed(!collapsed)} />
      <main className="flex-1 overflow-x-hidden">
        <div className="max-w-[1600px] mx-auto p-6">
          {children}
        </div>
      </main>
    </div>
  );
}
