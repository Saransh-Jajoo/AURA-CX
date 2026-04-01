"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";
import { useAuth, ROLE_DEFAULT_ROUTE, type UserRole } from "@/lib/auth-context";

export default function HomePage() {
  const { user, loading } = useAuth();
  const router = useRouter();

  useEffect(() => {
    if (!loading) {
      if (user) {
        const route = ROLE_DEFAULT_ROUTE[user.role as UserRole] || "/dashboard";
        router.replace(route);
      } else {
        router.replace("/login");
      }
    }
  }, [user, loading, router]);

  return (
    <div className="min-h-screen flex items-center justify-center bg-[var(--bg-primary)]">
      <div className="w-8 h-8 border-2 border-blue-500 border-t-transparent rounded-full animate-spin" />
    </div>
  );
}