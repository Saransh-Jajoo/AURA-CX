"use client";

import React, { createContext, useCallback, useContext, useEffect, useState, type ReactNode } from "react";

export type UserRole = "super_admin" | "tenant_admin" | "executive" | "qa_reviewer" | "support_agent";

export interface User {
  id: string;
  email: string;
  name: string;
  role: UserRole;
  tenant_id: string | null;
  avatar: string;
  role_info?: {
    label: string;
    permissions: string[];
    description: string;
  };
}

interface AuthState {
  user: User | null;
  token: string | null;
  loading: boolean;
  login: (email: string, password: string) => Promise<void>;
  logout: () => void;
}

const API_BASE = typeof window !== "undefined"
  ? (window.location.hostname === "localhost" || window.location.hostname === "127.0.0.1" ? "http://localhost:8000" : "")
  : "http://backend:8000";
const AuthContext = createContext<AuthState | undefined>(undefined);

export function AuthProvider({ children }: { children: ReactNode }) {
  const readStoredAuth = () => {
    if (typeof window === "undefined") {
      return { user: null as User | null, token: null as string | null, loading: true };
    }
    const saved = localStorage.getItem("aura_token");
    const savedUser = localStorage.getItem("aura_user");
    if (saved && savedUser) {
      try {
        return { user: JSON.parse(savedUser) as User, token: saved, loading: false };
      } catch {
        localStorage.removeItem("aura_token");
        localStorage.removeItem("aura_user");
      }
    }
    return { user: null as User | null, token: null as string | null, loading: false };
  };
  const [auth, setAuth] = useState<{ user: User | null; token: string | null; loading: boolean }>({
    user: null,
    token: null,
    loading: true,
  });
  const { user, token, loading } = auth;

  useEffect(() => {
    const raf = requestAnimationFrame(() => setAuth(readStoredAuth()));
    return () => cancelAnimationFrame(raf);
  }, []);

  const login = useCallback(async (email: string, password: string) => {
    const form = new URLSearchParams();
    form.append("username", email);
    form.append("password", password);

    const res = await fetch(`${API_BASE}/api/v1/auth/login`, {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: form.toString(),
    });
    if (!res.ok) {
      const err = await res.json().catch(() => ({}));
      throw new Error(err.detail || "Login failed");
    }

    const data = await res.json();
    setAuth({ user: data.user, token: data.access_token, loading: false });
    localStorage.setItem("aura_token", data.access_token);
    localStorage.setItem("aura_user", JSON.stringify(data.user));
    document.cookie = `aura_token=${data.access_token}; path=/; max-age=${8 * 3600}; SameSite=Lax`;
  }, []);

  const logout = useCallback(() => {
    setAuth({ user: null, token: null, loading: false });
    localStorage.removeItem("aura_token");
    localStorage.removeItem("aura_user");
    document.cookie = "aura_token=; path=/; max-age=0; SameSite=Lax";
  }, []);

  return <AuthContext.Provider value={{ user, token, loading, login, logout }}>{children}</AuthContext.Provider>;
}

export function useAuth() {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error("useAuth must be used within AuthProvider");
  return ctx;
}

export const ROLE_ROUTES: Record<UserRole, string[]> = {
  super_admin: [
    "/dashboard",
    "/dashboard/admin",
    "/dashboard/analytics",
    "/dashboard/profiles",
    "/dashboard/hitl",
    "/dashboard/shadow-tickets",
    "/dashboard/qa-review",
    "/dashboard/integrations",
    "/dashboard/subscriptions",
    "/dashboard/executive",
    "/dashboard/knowledge",
    "/dashboard/team",
    "/dashboard/settings",
    "/dashboard/voice",
    "/dashboard/compliance",
  ],
  tenant_admin: [
    "/dashboard",
    "/dashboard/admin",
    "/dashboard/analytics",
    "/dashboard/profiles",
    "/dashboard/hitl",
    "/dashboard/shadow-tickets",
    "/dashboard/qa-review",
    "/dashboard/integrations",
    "/dashboard/subscriptions",
    "/dashboard/executive",
    "/dashboard/knowledge",
    "/dashboard/team",
    "/dashboard/settings",
    "/dashboard/voice",
    "/dashboard/compliance",
  ],
  executive: ["/dashboard", "/dashboard/executive", "/dashboard/analytics", "/dashboard/subscriptions", "/dashboard/profiles", "/dashboard/compliance"],
  qa_reviewer: ["/dashboard", "/dashboard/qa-review", "/dashboard/hitl", "/dashboard/analytics", "/dashboard/profiles", "/dashboard/knowledge", "/dashboard/voice"],
  support_agent: ["/dashboard", "/dashboard/profiles", "/dashboard/hitl", "/dashboard/knowledge", "/dashboard/voice"],
};

export const ROLE_DEFAULT_ROUTE: Record<UserRole, string> = {
  super_admin: "/dashboard/admin",
  tenant_admin: "/dashboard/admin",
  executive: "/dashboard/executive",
  qa_reviewer: "/dashboard/qa-review",
  support_agent: "/dashboard",
};
