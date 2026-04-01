"use client";

import React, { createContext, useContext, useState, useEffect, useCallback, type ReactNode } from "react";

export type UserRole = "super_admin" | "company_chief" | "senior_developer" | "support_manager" | "support_agent";

export interface User {
  email: string;
  name: string;
  role: UserRole;
  tenant_id: string;
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

const AuthContext = createContext<AuthState | undefined>(undefined);
const API_BASE = process.env.NEXT_PUBLIC_API_URL || "http://localhost:8000";

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<User | null>(null);
  const [token, setToken] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  // Hydrate from localStorage
  useEffect(() => {
    const saved = localStorage.getItem("aura_token");
    const savedUser = localStorage.getItem("aura_user");
    if (saved && savedUser) {
      setToken(saved);
      try {
        setUser(JSON.parse(savedUser));
      } catch {
        localStorage.removeItem("aura_token");
        localStorage.removeItem("aura_user");
      }
    }
    setLoading(false);
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
    setToken(data.access_token);
    setUser(data.user);
    localStorage.setItem("aura_token", data.access_token);
    localStorage.setItem("aura_user", JSON.stringify(data.user));
  }, []);

  const logout = useCallback(() => {
    setToken(null);
    setUser(null);
    localStorage.removeItem("aura_token");
    localStorage.removeItem("aura_user");
  }, []);

  return (
    <AuthContext.Provider value={{ user, token, loading, login, logout }}>
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error("useAuth must be used within AuthProvider");
  return ctx;
}

/** Role hierarchy check */
const ROLE_HIERARCHY: Record<UserRole, number> = {
  super_admin: 5,
  company_chief: 4,
  senior_developer: 3,
  support_manager: 2,
  support_agent: 1,
};

export function hasAccess(userRole: UserRole, requiredRole: UserRole): boolean {
  return ROLE_HIERARCHY[userRole] >= ROLE_HIERARCHY[requiredRole];
}

/** Allowed dashboard paths per role */
export const ROLE_ROUTES: Record<UserRole, string[]> = {
  super_admin: ["/dashboard", "/dashboard/admin", "/dashboard/analytics", "/dashboard/profiles", "/dashboard/hitl", "/dashboard/shadow-tickets", "/dashboard/qa-review", "/dashboard/integrations", "/dashboard/subscriptions", "/dashboard/executive"],
  company_chief: ["/dashboard", "/dashboard/executive", "/dashboard/analytics", "/dashboard/subscriptions"],
  senior_developer: ["/dashboard", "/dashboard/shadow-tickets", "/dashboard/analytics"],
  support_manager: ["/dashboard", "/dashboard/qa-review", "/dashboard/analytics", "/dashboard/profiles"],
  support_agent: ["/dashboard", "/dashboard/profiles", "/dashboard/hitl"],
};

export const ROLE_DEFAULT_ROUTE: Record<UserRole, string> = {
  super_admin: "/dashboard/admin",
  company_chief: "/dashboard/executive",
  senior_developer: "/dashboard/shadow-tickets",
  support_manager: "/dashboard/qa-review",
  support_agent: "/dashboard",
};
