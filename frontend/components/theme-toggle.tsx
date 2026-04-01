"use client";

import { useTheme } from "next-themes";
import { useEffect, useState } from "react";
import { Sun, Moon, Monitor } from "lucide-react";
import { cn } from "@/lib/utils";

export function ThemeToggle() {
  const { theme, setTheme } = useTheme();
  const [mounted, setMounted] = useState(false);
  useEffect(() => setMounted(true), []);
  if (!mounted) return <div className="w-8 h-8" />;

  const options = [
    { value: "light", icon: Sun },
    { value: "dark", icon: Moon },
    { value: "system", icon: Monitor },
  ] as const;

  return (
    <div className="flex items-center gap-0.5 p-1 rounded-xl bg-[var(--bg-secondary)] border border-[var(--border-subtle)]">
      {options.map(({ value, icon: Icon }) => (
        <button
          key={value}
          onClick={() => setTheme(value)}
          className={cn(
            "p-1.5 rounded-lg transition-all",
            theme === value
              ? "bg-blue-500/20 text-blue-400"
              : "text-[var(--text-muted)] hover:text-[var(--text-secondary)]"
          )}
          title={value.charAt(0).toUpperCase() + value.slice(1)}
        >
          <Icon className="w-3.5 h-3.5" />
        </button>
      ))}
    </div>
  );
}
