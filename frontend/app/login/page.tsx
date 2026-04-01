"use client";

import React, { useState } from "react";
import { motion } from "framer-motion";
import { useRouter } from "next/navigation";
import { useAuth } from "@/lib/auth-context";
import { ROLE_DEFAULT_ROUTE } from "@/lib/auth-context";
import { AlertTriangle, Eye, EyeOff, Loader2, Zap } from "lucide-react";

const DEMO_ACCOUNTS = [
  { email: "admin@auracx.io", password: "admin123", role: "Super Admin" },
  { email: "ceo@acme.com", password: "chief123", role: "Company Chief" },
  { email: "dev@acme.com", password: "dev123", role: "Senior Developer" },
  { email: "manager@acme.com", password: "manager123", role: "Support Manager" },
  { email: "agent@acme.com", password: "agent123", role: "Support Agent" },
];

export default function LoginPage() {
  const { login } = useAuth();
  const router = useRouter();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);
  const [showPw, setShowPw] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError("");
    setLoading(true);
    try {
      await login(email, password);
      // After login, read back the stored user to determine route
      const savedUser = localStorage.getItem("aura_user");
      if (savedUser) {
        const u = JSON.parse(savedUser);
        router.push(ROLE_DEFAULT_ROUTE[u.role as keyof typeof ROLE_DEFAULT_ROUTE] || "/dashboard");
      } else {
        router.push("/dashboard");
      }
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : "Login failed");
    } finally {
      setLoading(false);
    }
  };

  const quickLogin = (acct: typeof DEMO_ACCOUNTS[number]) => {
    setEmail(acct.email);
    setPassword(acct.password);
  };

  return (
    <div className="min-h-screen flex items-center justify-center relative overflow-hidden bg-[var(--bg-primary)]">
      {/* Animated gradient orbs */}
      <div className="absolute inset-0 overflow-hidden pointer-events-none">
        <div className="absolute -top-40 -left-40 w-96 h-96 rounded-full bg-blue-500/10 dark:bg-blue-500/5 blur-3xl animate-pulse" />
        <div className="absolute -bottom-40 -right-40 w-96 h-96 rounded-full bg-purple-500/10 dark:bg-purple-500/5 blur-3xl animate-pulse" style={{ animationDelay: "1s" }} />
        <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-[600px] h-[600px] rounded-full bg-cyan-500/5 dark:bg-cyan-500/3 blur-3xl" />
      </div>

      <motion.div
        initial={{ opacity: 0, y: 24 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.5, ease: "easeOut" }}
        className="relative z-10 w-full max-w-md mx-4"
      >
        {/* Logo */}
        <div className="text-center mb-8">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src="/logo_w.svg" alt="AURA-CX" className="h-16 mx-auto mb-4 dark:opacity-100 opacity-90" />
          <p className="text-sm text-[var(--text-muted)]">Intelligent Customer Experience Orchestrator</p>
        </div>

        {/* Login Card */}
        <div className="glass-card p-8">
          <h2 className="text-xl font-semibold mb-6 text-center">Sign in to your account</h2>

          {error && (
            <motion.div
              initial={{ opacity: 0, height: 0 }}
              animate={{ opacity: 1, height: "auto" }}
              className="flex items-center gap-2 text-sm text-red-400 bg-red-500/10 border border-red-500/20 rounded-xl px-4 py-3 mb-4"
            >
              <AlertTriangle className="w-4 h-4 shrink-0" />
              {error}
            </motion.div>
          )}

          <form onSubmit={handleSubmit} className="space-y-4">
            <div>
              <label className="block text-xs font-medium text-[var(--text-muted)] mb-1.5 uppercase tracking-wider">Email</label>
              <input
                type="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                required
                className="w-full px-4 py-3 rounded-xl bg-[var(--bg-secondary)] border border-[var(--border-subtle)] text-[var(--text-primary)] placeholder:text-[var(--text-muted)] focus:outline-none focus:ring-2 focus:ring-blue-500/40 focus:border-blue-500/50 transition-all text-sm"
                placeholder="you@company.com"
              />
            </div>
            <div>
              <label className="block text-xs font-medium text-[var(--text-muted)] mb-1.5 uppercase tracking-wider">Password</label>
              <div className="relative">
                <input
                  type={showPw ? "text" : "password"}
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  required
                  className="w-full px-4 py-3 pr-11 rounded-xl bg-[var(--bg-secondary)] border border-[var(--border-subtle)] text-[var(--text-primary)] placeholder:text-[var(--text-muted)] focus:outline-none focus:ring-2 focus:ring-blue-500/40 focus:border-blue-500/50 transition-all text-sm"
                  placeholder="••••••••"
                />
                <button
                  type="button"
                  onClick={() => setShowPw(!showPw)}
                  className="absolute right-3 top-1/2 -translate-y-1/2 text-[var(--text-muted)] hover:text-[var(--text-secondary)] transition-colors"
                >
                  {showPw ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                </button>
              </div>
            </div>

            <button
              type="submit"
              disabled={loading}
              className="w-full py-3 rounded-xl font-semibold text-sm text-white bg-gradient-to-r from-blue-600 via-purple-600 to-cyan-600 hover:from-blue-500 hover:via-purple-500 hover:to-cyan-500 disabled:opacity-50 disabled:cursor-not-allowed transition-all duration-300 flex items-center justify-center gap-2 shadow-lg shadow-blue-500/20"
            >
              {loading ? <Loader2 className="w-4 h-4 animate-spin" /> : <Zap className="w-4 h-4" />}
              {loading ? "Authenticating..." : "Sign In"}
            </button>
          </form>
        </div>

        {/* Demo Accounts */}
        <div className="mt-6 glass-card p-5">
          <p className="text-xs font-medium text-[var(--text-muted)] mb-3 uppercase tracking-wider text-center">Quick Access — Demo Accounts</p>
          <div className="grid gap-2">
            {DEMO_ACCOUNTS.map((acct) => (
              <button
                key={acct.email}
                onClick={() => quickLogin(acct)}
                className="flex items-center justify-between px-3 py-2 rounded-lg bg-[var(--bg-secondary)] hover:bg-[var(--bg-card-hover)] border border-[var(--border-subtle)] transition-all text-left group"
              >
                <div>
                  <span className="text-xs font-medium text-[var(--text-primary)]">{acct.role}</span>
                  <span className="text-[10px] text-[var(--text-muted)] ml-2">{acct.email}</span>
                </div>
                <span className="text-[10px] text-[var(--text-muted)] opacity-0 group-hover:opacity-100 transition-opacity">Click to fill</span>
              </button>
            ))}
          </div>
        </div>

        <p className="text-center text-[10px] text-[var(--text-muted)] mt-6">
          AURA-CX v1.0 — Enterprise CX Intelligence Platform
        </p>
      </motion.div>
    </div>
  );
}
