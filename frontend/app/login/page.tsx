"use client";

import React, { useState } from "react";
import Image from "next/image";
import { motion } from "framer-motion";
import { useRouter } from "next/navigation";
import { useAuth, ROLE_DEFAULT_ROUTE, type UserRole } from "@/lib/auth-context";
import { AlertTriangle, ArrowRight, Eye, EyeOff, Loader2 } from "lucide-react";

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
      const savedUser = localStorage.getItem("aura_user");
      const user = savedUser ? JSON.parse(savedUser) : null;
      router.push(user?.role ? ROLE_DEFAULT_ROUTE[user.role as UserRole] || "/dashboard" : "/dashboard");
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : "Login failed");
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen flex items-center justify-center bg-[var(--bg-primary)] px-4 py-8 safe-area-top safe-area-bottom">
      <motion.div
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.4, ease: [0.25, 0.1, 0.25, 1] }}
        className="w-full max-w-[420px] sm:max-w-[420px]"
      >
        <div className="text-center mb-6 sm:mb-8">
          <Image src="/logo_w.png" alt="AURA-CX" width={56} height={56} className="logo-adaptive mx-auto mb-3 sm:mb-4 sm:w-[72px] sm:h-[72px]" priority />
          <h1 className="font-display text-lg sm:text-xl font-bold tracking-tight mb-1">AURA-CX</h1>
          <p className="text-xs sm:text-sm text-[var(--text-muted)]">Secure tenant workspace</p>
        </div>

        <div className="glass-card p-5 sm:p-8">
          <h2 className="text-base font-semibold mb-5 sm:mb-6 text-center">Sign in</h2>

          {error && (
            <motion.div
              initial={{ opacity: 0, height: 0 }}
              animate={{ opacity: 1, height: "auto" }}
              className="flex items-center gap-2 text-sm text-[var(--accent-rose)] bg-[var(--accent-rose)]/8 border border-[var(--accent-rose)]/15 rounded-[var(--radius-md)] px-3 sm:px-4 py-2.5 sm:py-3 mb-4"
            >
              <AlertTriangle className="w-4 h-4 shrink-0" />
              {error}
            </motion.div>
          )}

          <form onSubmit={handleSubmit} className="space-y-3 sm:space-y-4">
            <div>
              <label className="block text-[11px] font-medium text-[var(--text-muted)] mb-1.5 uppercase tracking-wider">
                Email
              </label>
              <input
                type="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                required
                autoComplete="email"
                className="w-full px-4 py-3 rounded-[var(--radius-md)] bg-[var(--bg-inset)] border border-[var(--border-subtle)] text-[var(--text-primary)] placeholder:text-[var(--text-muted)] focus:outline-none focus:ring-2 focus:ring-[var(--accent-primary)]/20 focus:border-[var(--accent-primary)]/30 transition-all text-[16px] sm:text-sm"
                placeholder="you@company.com"
              />
            </div>
            <div>
              <label className="block text-[11px] font-medium text-[var(--text-muted)] mb-1.5 uppercase tracking-wider">
                Password
              </label>
              <div className="relative">
                <input
                  type={showPw ? "text" : "password"}
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  required
                  autoComplete="current-password"
                  className="w-full px-4 py-3 pr-11 rounded-[var(--radius-md)] bg-[var(--bg-inset)] border border-[var(--border-subtle)] text-[var(--text-primary)] placeholder:text-[var(--text-muted)] focus:outline-none focus:ring-2 focus:ring-[var(--accent-primary)]/20 focus:border-[var(--accent-primary)]/30 transition-all text-[16px] sm:text-sm"
                  placeholder="Password"
                />
                <button
                  type="button"
                  onClick={() => setShowPw(!showPw)}
                  className="absolute right-3 top-1/2 -translate-y-1/2 text-[var(--text-muted)] hover:text-[var(--text-secondary)] transition-colors p-1"
                  title={showPw ? "Hide password" : "Show password"}
                >
                  {showPw ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                </button>
              </div>
            </div>

            <button
              type="submit"
              disabled={loading}
              className="w-full py-3 sm:py-3 rounded-[var(--radius-md)] font-semibold text-sm text-white bg-[var(--accent-primary)] hover:brightness-110 disabled:opacity-50 disabled:cursor-not-allowed transition-all flex items-center justify-center gap-2 shadow-lg shadow-[var(--accent-primary)]/15 active:scale-[0.98] min-h-[48px]"
            >
              {loading ? <Loader2 className="w-4 h-4 animate-spin" /> : <ArrowRight className="w-4 h-4" />}
              {loading ? "Authenticating..." : "Sign In"}
            </button>
          </form>
        </div>

        <p className="text-center text-[10px] text-[var(--text-muted)] mt-4 sm:mt-6 font-mono">AURA-CX v1.0</p>
      </motion.div>
    </div>
  );
}

