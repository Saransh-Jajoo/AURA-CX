"use client";

import { useTheme } from "next-themes";
import { useEffect, useState } from "react";
import { Sun, Moon, Monitor } from "lucide-react";
import { cn } from "@/lib/utils";
import { motion } from "framer-motion";

export function ThemeToggle() {
  const { theme, setTheme } = useTheme();
  const [mounted, setMounted] = useState(false);
  useEffect(() => {
    const raf = requestAnimationFrame(() => setMounted(true));
    return () => cancelAnimationFrame(raf);
  }, []);
  if (!mounted) return <div className="h-8" />;

  const options = [
    { value: "light", icon: Sun, label: "Light" },
    { value: "dark", icon: Moon, label: "Dark" },
    { value: "system", icon: Monitor, label: "System" },
  ] as const;

  return (
    <div className="flex items-center gap-0.5 p-1 rounded-[var(--radius-md)] bg-[var(--bg-inset)] border border-[var(--border-subtle)]">
      {options.map(({ value, icon: Icon, label }) => (
        <button
          key={value}
          onClick={() => setTheme(value)}
          className={cn(
            "relative flex-1 flex items-center justify-center gap-1.5 p-1.5 rounded-[var(--radius-sm)] transition-colors text-[11px] font-medium",
            theme === value
              ? "text-[var(--accent-primary)]"
              : "text-[var(--text-muted)] hover:text-[var(--text-secondary)]"
          )}
          title={label}
        >
          {theme === value && (
            <motion.div
              layoutId="theme-toggle-active"
              className="absolute inset-0 bg-[var(--accent-primary)]/8 border border-[var(--accent-primary)]/15 rounded-[var(--radius-sm)]"
              transition={{ type: "spring", stiffness: 400, damping: 28 }}
            />
          )}
          <Icon className="w-3.5 h-3.5 relative z-10" />
        </button>
      ))}
    </div>
  );
}

/** Compact theme toggle for top nav */
export function ThemeToggleCompact() {
  const { theme, setTheme } = useTheme();
  const [mounted, setMounted] = useState(false);
  useEffect(() => {
    const raf = requestAnimationFrame(() => setMounted(true));
    return () => cancelAnimationFrame(raf);
  }, []);
  if (!mounted) return <div className="w-8 h-8" />;

  const isDark = theme === "dark";
  const toggle = () => setTheme(isDark ? "light" : "dark");

  return (
    <button
      onClick={toggle}
      className="relative p-2 rounded-[var(--radius-sm)] text-[var(--text-muted)] hover:text-[var(--text-primary)] hover:bg-[var(--bg-card-hover)] transition-all"
      title={isDark ? "Switch to light mode" : "Switch to dark mode"}
    >
      <motion.div
        key={isDark ? "moon" : "sun"}
        initial={{ rotate: -30, opacity: 0, scale: 0.8 }}
        animate={{ rotate: 0, opacity: 1, scale: 1 }}
        exit={{ rotate: 30, opacity: 0, scale: 0.8 }}
        transition={{ duration: 0.2 }}
      >
        {isDark ? <Moon className="w-4 h-4" /> : <Sun className="w-4 h-4" />}
      </motion.div>
    </button>
  );
}
