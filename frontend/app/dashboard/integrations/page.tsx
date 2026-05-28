"use client";

import React, { useState, useEffect, useCallback } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { cn } from "@/lib/utils";
import {
  Link2, Plus, X, Check, Globe, AtSign, Mail, ChevronDown, ChevronRight,
  Shield, RefreshCw, Copy, Eye, EyeOff, CheckCircle2, XCircle,
  AlertCircle, ExternalLink, Zap, Hash, Inbox, MessageSquare,
} from "lucide-react";
import { fetchPlatformConnections, updatePlatformConnection } from "@/lib/api";
import type { PlatformConnections, XPlatformStatus, RedditPlatformStatus, GmailPlatformStatus, ThreadsPlatformStatus } from "@/lib/types";

type AnyPlatformStatus = XPlatformStatus | RedditPlatformStatus | GmailPlatformStatus | ThreadsPlatformStatus;

const API = process.env.NEXT_PUBLIC_API_URL || "http://localhost:8000";

// ── Types ─────────────────────────────────────────────────────
interface IntegrationSource {
  id: string;
  platform: string;
  identifier: string;
  label?: string;
  active: boolean;
  webhook_path?: string;
  webhook_secret?: string;
}

interface SourceField {
  name: string;
  label: string;
  type: string;
  placeholder: string;
  hint?: string;
}

interface SetupGuideStep {
  step: number;
  title: string;
  desc: string;
  link?: string;
}

type PlatformKey = "x" | "reddit" | "gmail" | "threads";

type IntegrationTab = {
  id: "connect" | "monitor";
  label: string;
  icon: React.ComponentType<{ className?: string }>;
};

// ── Platform Metadata ─────────────────────────────────────────
const PLATFORM_META: Record<string, {
  icon: React.ComponentType<{ className?: string }>;
  label: string;
  color: string;
  bgColor: string;
  borderColor: string;
  placeholder: string;
  sourceLabel: string;
  sourceFields?: SourceField[];
}> = {
  x: {
    icon: AtSign,
    label: "X / Twitter",
    color: "text-[var(--accent-primary)]",
    bgColor: "bg-[var(--accent-primary)]/10",
    borderColor: "border-[var(--accent-primary)]/25",
    placeholder: "@YourBrand",
    sourceLabel: "X Handle",
    sourceFields: [
      { name: "identifier", label: "X Handle", type: "text", placeholder: "@YourBrand", hint: "The Twitter/X handle to monitor (e.g. @acme_support)" },
    ],
  },
  reddit: {
    icon: Globe,
    label: "Reddit",
    color: "text-[var(--accent-amber)]",
    bgColor: "bg-[var(--accent-amber)]/10",
    borderColor: "border-[var(--accent-amber)]/25",
    placeholder: "r/YourSubreddit",
    sourceLabel: "Subreddit",
    sourceFields: [
      { name: "identifier", label: "Subreddit", type: "text", placeholder: "r/YourSubreddit", hint: "The subreddit to monitor (e.g. r/acme_help)" },
    ],
  },
  gmail: {
    icon: Mail,
    label: "Gmail / Email",
    color: "text-[var(--accent-emerald)]",
    bgColor: "bg-[var(--accent-emerald)]/10",
    borderColor: "border-[var(--accent-emerald)]/25",
    placeholder: "support@company.com",
    sourceLabel: "Inbox",
    sourceFields: [
      { name: "identifier", label: "Email Address", type: "email", placeholder: "support@company.com", hint: "The email inbox to monitor for customer messages" },
    ],
  },
};

// ── Guide Steps ────────────────────────────────────────────────
const SETUP_GUIDES: Record<PlatformKey, SetupGuideStep[]> = {
  x: [
    { step: 1, title: "Go to developer.twitter.com", desc: "Sign in with your X account and open the Developer Portal.", link: "https://developer.twitter.com/en/portal/dashboard" },
    { step: 2, title: "Create a new App", desc: "Click 'Create App', give it a name, and choose 'Read' permissions." },
    { step: 3, title: "Copy Bearer Token", desc: "In your app's 'Keys and Tokens' tab, copy the Bearer Token." },
    { step: 4, title: "Paste it below", desc: "Enter the Bearer Token in the field below and click Save." },
  ],
  reddit: [
    { step: 1, title: "Go to reddit.com/prefs/apps", desc: "Sign in to Reddit and navigate to App Preferences.", link: "https://www.reddit.com/prefs/apps" },
    { step: 2, title: "Create a script app", desc: "Click 'Create App', set type to 'script', and note the redirect URI." },
    { step: 3, title: "Copy Client ID & Secret", desc: "The Client ID is under the app name; click 'edit' to see the Secret." },
    { step: 4, title: "Paste credentials below", desc: "Enter Client ID, Client Secret, and a User-Agent string (e.g. 'myapp/1.0')." },
  ],
  gmail: [
    { step: 1, title: "Enable 2-Step Verification", desc: "Go to your Google Account → Security → 2-Step Verification and turn it on.", link: "https://myaccount.google.com/security" },
    { step: 2, title: "Create an App Password", desc: "In Security settings, go to 'App passwords', choose 'Mail' and your device, then generate." },
    { step: 3, title: "Copy the 16-character password", desc: "Google will show a 16-character password — copy it. You won't see it again." },
    { step: 4, title: "Enter credentials below", desc: "Use your Gmail address + the App Password (not your regular Gmail password)." },
  ],
  threads: [
    { step: 1, title: "Go to developers.facebook.com", desc: "Create a Meta developer account and set up a Threads app.", link: "https://developers.facebook.com/apps/" },
    { step: 2, title: "Add Threads API product", desc: "In your app dashboard, add the Threads API and configure permissions." },
    { step: 3, title: "Generate Access Token", desc: "Use the access token tool to generate a long-lived token for your account." },
    { step: 4, title: "Paste it below", desc: "Enter the Access Token in the field below." },
  ],
};

// ── Connection Form Config ─────────────────────────────────────
interface CredentialField {
  key: string;
  label: string;
  placeholder: string;
  type: "password" | "text" | "email" | "number";
  required?: boolean;
  hint?: string;
  defaultValue?: string;
}

const PLATFORM_CREDENTIALS: Record<string, { title: string; desc: string; fields: CredentialField[] }> = {
  x: {
    title: "X / Twitter API",
    desc: "Connect your X Developer App to enable real-time mention monitoring and automated replies.",
    fields: [
      { key: "x_bearer_token", label: "Bearer Token", placeholder: "AAAA...", type: "password", required: true, hint: "The main token for read access to the X API v2." },
      { key: "x_api_key", label: "API Key (Consumer Key)", placeholder: "xxxxxxxxxxxxxxxxxx", type: "password", hint: "Required only for posting replies via OAuth 1.0a." },
      { key: "x_api_secret", label: "API Secret (Consumer Secret)", placeholder: "xxxxxxxxxxxx", type: "password" },
      { key: "x_access_token", label: "Access Token", placeholder: "000000000-xxxxxxxxx", type: "password", hint: "Your personal user OAuth token for posting as your account." },
      { key: "x_access_secret", label: "Access Token Secret", placeholder: "xxxxxxxxxx", type: "password" },
    ],
  },
  reddit: {
    title: "Reddit API",
    desc: "Connect your Reddit app to monitor subreddits and post replies.",
    fields: [
      { key: "reddit_client_id", label: "Client ID", placeholder: "xxxxxxxxxxxxxxxxxxxx", type: "password", required: true, hint: "Found under your app name in reddit.com/prefs/apps." },
      { key: "reddit_client_secret", label: "Client Secret", placeholder: "xxxxxxxxxxxxxxxxxxxxxxxxxxxx", type: "password", required: true },
      { key: "reddit_user_agent", label: "User Agent", placeholder: "myapp/1.0 by u/myusername", type: "text", required: true, hint: "A unique identifier for your app. Required by Reddit API." },
      { key: "reddit_username", label: "Reddit Username (optional)", placeholder: "u/your_username", type: "text", hint: "Only needed if you want AURA to post replies on your behalf." },
      { key: "reddit_password", label: "Reddit Password (optional)", placeholder: "••••••••", type: "password" },
    ],
  },
  gmail: {
    title: "Gmail / Email (IMAP)",
    desc: "Connect a Gmail inbox to receive and respond to customer emails.",
    fields: [
      { key: "gmail_imap_host", label: "IMAP Host", placeholder: "imap.gmail.com", type: "text", required: true, defaultValue: "imap.gmail.com" },
      { key: "gmail_imap_port", label: "IMAP Port", placeholder: "993", type: "number", defaultValue: "993" },
      { key: "gmail_imap_user", label: "Email Address", placeholder: "support@yourcompany.com", type: "email", required: true },
      { key: "gmail_imap_pass", label: "App Password", placeholder: "xxxx xxxx xxxx xxxx", type: "password", required: true, hint: "Use a Gmail App Password (not your regular password). See the setup guide." },
    ],
  },
  threads: {
    title: "Threads",
    desc: "Connect your Threads account to monitor and respond to mentions.",
    fields: [
      { key: "threads_access_token", label: "Access Token", placeholder: "EAAA...", type: "password", required: true, hint: "Long-lived access token from your Meta developer app." },
    ],
  },
};

// ── Helper Components ─────────────────────────────────────────

function StatusBadge({ connected }: { connected: boolean }) {
  return (
    <span className={cn(
      "inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-[11px] font-semibold",
      connected
        ? "bg-[var(--accent-emerald)]/12 text-[var(--accent-emerald)] border border-[var(--accent-emerald)]/20"
        : "bg-[var(--bg-elevated)] text-[var(--text-muted)] border border-[var(--border-subtle)]"
    )}>
      {connected
        ? <><CheckCircle2 className="w-3 h-3" /> Connected</>
        : <><XCircle className="w-3 h-3" /> Not Connected</>}
    </span>
  );
}

function FieldInput({
  field,
  value,
  onChange,
}: {
  field: CredentialField;
  value: string;
  onChange: (v: string) => void;
}) {
  const [show, setShow] = useState(false);
  const isSecret = field.type === "password";
  return (
    <div>
      <label className="block text-[11px] font-semibold text-[var(--text-secondary)] mb-1.5 uppercase tracking-wider">
        {field.label} {field.required && <span className="text-[var(--accent-rose)] normal-case tracking-normal">*</span>}
      </label>
      <div className="relative">
        <input
          type={isSecret && !show ? "password" : "text"}
          value={value}
          onChange={(e) => onChange(e.target.value)}
          placeholder={value ? "••• (already set — enter to update)" : field.placeholder}
          className="w-full px-3 py-2.5 text-sm bg-[var(--bg-inset)] border border-[var(--border-subtle)] rounded-[var(--radius-md)] text-[var(--text-primary)] placeholder:text-[var(--text-muted)]/60 focus:outline-none focus:ring-2 focus:ring-[var(--accent-primary)]/20 focus:border-[var(--accent-primary)]/40 transition-all pr-10"
        />
        {isSecret && (
          <button
            type="button"
            onClick={() => setShow(!show)}
            className="absolute right-3 top-1/2 -translate-y-1/2 text-[var(--text-muted)] hover:text-[var(--text-primary)] transition-colors"
          >
            {show ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
          </button>
        )}
      </div>
      {field.hint && (
        <p className="mt-1 text-[11px] text-[var(--text-muted)] flex items-start gap-1">
          <AlertCircle className="w-3 h-3 mt-0.5 shrink-0 opacity-70" />
          {field.hint}
        </p>
      )}
    </div>
  );
}

function SetupGuide({ platform }: { platform: string }) {
  const [open, setOpen] = useState(false);
  const steps = SETUP_GUIDES[platform as keyof typeof SETUP_GUIDES] || [];
  return (
    <div className="rounded-[var(--radius-md)] border border-[var(--accent-primary)]/15 bg-[var(--accent-primary)]/5 overflow-hidden">
      <button
        onClick={() => setOpen(!open)}
        className="w-full flex items-center gap-2 px-4 py-3 text-sm font-medium text-[var(--accent-primary)] hover:bg-[var(--accent-primary)]/8 transition-colors"
      >
        <Zap className="w-4 h-4" />
        How to get your credentials
        {open ? <ChevronDown className="w-4 h-4 ml-auto" /> : <ChevronRight className="w-4 h-4 ml-auto" />}
      </button>
      <AnimatePresence>
        {open && (
          <motion.div
            initial={{ height: 0, opacity: 0 }}
            animate={{ height: "auto", opacity: 1 }}
            exit={{ height: 0, opacity: 0 }}
            className="overflow-hidden"
          >
            <div className="px-4 pb-4 space-y-3 border-t border-[var(--accent-primary)]/15">
              {steps.map((s) => (
                <div key={s.step} className="flex gap-3 pt-3">
                  <div className="w-6 h-6 rounded-full bg-[var(--accent-primary)]/15 text-[var(--accent-primary)] text-[11px] font-bold flex items-center justify-center shrink-0 mt-0.5">
                    {s.step}
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-semibold text-[var(--text-primary)]">{s.title}</p>
                    <p className="text-[12px] text-[var(--text-muted)] mt-0.5">{s.desc}</p>
                    {s.link && (
                      <a href={s.link} target="_blank" rel="noopener noreferrer"
                        className="inline-flex items-center gap-1 mt-1 text-[11px] text-[var(--accent-primary)] hover:underline">
                        Open link <ExternalLink className="w-3 h-3" />
                      </a>
                    )}
                  </div>
                </div>
              ))}
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}

// ── Platform Connection Card ───────────────────────────────────

function PlatformCard({
  platformKey,
  status,
  onSave,
  saving,
}: {
  platformKey: string;
  status: AnyPlatformStatus;
  onSave: (key: string, fields: Record<string, string>) => void;
  saving: string | null;
}) {
  const [expanded, setExpanded] = useState(false);
  const [fields, setFields] = useState<Record<string, string>>({});
  const config = PLATFORM_CREDENTIALS[platformKey];
  const meta = PLATFORM_META[platformKey];
  const Icon = meta?.icon || Link2;
  const isSaving = saving === platformKey;

  // pre-fill defaults
  useEffect(() => {
    const defaults: Record<string, string> = {};
    config?.fields.forEach((f) => {
      if (f.defaultValue) defaults[f.key] = f.defaultValue;
    });
    setFields(defaults);
  }, [config]);

  const handleSave = () => {
    const payload: Record<string, string> = {};
    config?.fields.forEach((f) => {
      if (fields[f.key] !== undefined && fields[f.key] !== "") {
        payload[f.key] = fields[f.key];
      }
    });
    onSave(platformKey, payload);
  };

  const hasInput = config?.fields.some((f) => fields[f.key] && fields[f.key] !== (f.defaultValue || ""));

  return (
    <motion.div layout className="glass-card overflow-hidden">
      {/* Header */}
      <div
        onClick={() => setExpanded(!expanded)}
        className="px-5 py-4 flex items-center gap-4 cursor-pointer hover:bg-[var(--bg-card-hover)] transition-colors"
      >
        <div className={cn("w-10 h-10 rounded-[var(--radius-md)] flex items-center justify-center", meta?.bgColor || "bg-[var(--bg-elevated)]")}>
          <Icon className={cn("w-5 h-5", meta?.color || "text-[var(--text-muted)]")} />
        </div>
        <div className="flex-1 min-w-0">
          <h3 className="text-sm font-bold">{config?.title}</h3>
          <p className="text-[11px] text-[var(--text-muted)] mt-0.5 truncate">{config?.desc}</p>
        </div>
        <div className="flex items-center gap-3">
          <StatusBadge connected={status.connected} />
          {expanded
            ? <ChevronDown className="w-4 h-4 text-[var(--text-muted)]" />
            : <ChevronRight className="w-4 h-4 text-[var(--text-muted)]" />}
        </div>
      </div>

      {/* Expanded Form */}
      <AnimatePresence>
        {expanded && (
          <motion.div
            initial={{ height: 0, opacity: 0 }}
            animate={{ height: "auto", opacity: 1 }}
            exit={{ height: 0, opacity: 0 }}
            className="overflow-hidden border-t border-[var(--border-subtle)]"
          >
            <div className="p-5 space-y-5">
              <SetupGuide platform={platformKey} />

              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                {config?.fields.map((field) => (
                  <div key={field.key} className={field.type === "text" && field.key.includes("user_agent") ? "md:col-span-2" : ""}>
                    <FieldInput
                      field={field}
                      value={fields[field.key] || ""}
                      onChange={(v) => setFields((prev) => ({ ...prev, [field.key]: v }))}
                    />
                  </div>
                ))}
              </div>

              {/* Masked current values */}
              {status.connected && (
                <div className="p-3 rounded-[var(--radius-md)] bg-[var(--accent-emerald)]/5 border border-[var(--accent-emerald)]/15 text-[12px] text-[var(--text-muted)]">
                  <span className="font-semibold text-[var(--accent-emerald)]">Currently saved: </span>
                  {platformKey === "x" && `Bearer ${'masked_bearer' in status ? (status as XPlatformStatus).masked_bearer || "•••" : "•••"}`}
                  {platformKey === "reddit" && `Client ID ${'masked_client_id' in status ? (status as RedditPlatformStatus).masked_client_id || "•••" : "•••"}`}
                  {platformKey === "gmail" && `${'masked_user' in status ? (status as GmailPlatformStatus).masked_user || "•••" : "•••"} @ ${'imap_host' in status ? (status as GmailPlatformStatus).imap_host || "imap.gmail.com" : "imap.gmail.com"}`}
                  {platformKey === "threads" && `Token ${'masked_token' in status ? (status as ThreadsPlatformStatus).masked_token || "•••" : "•••"}`}
                </div>
              )}

              <div className="flex justify-between items-center">
                {status.connected && (
                  <button
                    onClick={() => onSave(platformKey, Object.fromEntries(config.fields.map((f) => [f.key, ""])))}
                    className="text-[11px] text-[var(--accent-rose)] hover:underline"
                  >
                    Disconnect / Clear credentials
                  </button>
                )}
                <button
                  onClick={handleSave}
                  disabled={isSaving || !hasInput}
                  className={cn(
                    "ml-auto flex items-center gap-2 px-4 py-2 rounded-[var(--radius-md)] text-sm font-semibold text-white transition-all active:scale-[0.98]",
                    "bg-[var(--accent-primary)] hover:brightness-110 shadow-md shadow-[var(--accent-primary)]/15",
                    "disabled:opacity-40 disabled:cursor-not-allowed disabled:shadow-none"
                  )}
                >
                  {isSaving ? <RefreshCw className="w-4 h-4 animate-spin" /> : <Shield className="w-4 h-4" />}
                  Encrypt & Save
                </button>
              </div>
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </motion.div>
  );
}

// ── Webhook Info Panel ─────────────────────────────────────────

function WebhookInfoPanel({ source }: { source: IntegrationSource & { webhook_secret?: string } }) {
  const [copied, setCopied] = useState<"url" | "secret" | null>(null);
  const apiBase = typeof window !== "undefined" ? window.location.origin.replace(":3000", ":8000") : API;
  const webhookUrl = `${apiBase}${source.webhook_path || `/api/v1/webhooks/${source.id}/${source.platform}`}`;

  const copy = (text: string, key: "url" | "secret") => {
    navigator.clipboard.writeText(text);
    setCopied(key);
    setTimeout(() => setCopied(null), 2000);
  };

  return (
    <div className="mt-2 p-3 rounded-[var(--radius-sm)] bg-[var(--bg-inset)] border border-[var(--border-subtle)] space-y-2">
      <div>
        <p className="text-[10px] font-semibold text-[var(--text-muted)] uppercase tracking-wider mb-1">Webhook URL</p>
        <div className="flex items-center gap-2">
          <code className="text-[11px] font-mono text-[var(--text-secondary)] flex-1 truncate">{webhookUrl}</code>
          <button onClick={() => copy(webhookUrl, "url")} className="text-[var(--text-muted)] hover:text-[var(--text-primary)] transition-colors">
            {copied === "url" ? <Check className="w-3.5 h-3.5 text-[var(--accent-emerald)]" /> : <Copy className="w-3.5 h-3.5" />}
          </button>
        </div>
      </div>
      {source.webhook_secret && (
        <div>
          <p className="text-[10px] font-semibold text-[var(--text-muted)] uppercase tracking-wider mb-1">Webhook Secret (one-time)</p>
          <div className="flex items-center gap-2">
            <code className="text-[11px] font-mono text-[var(--accent-amber)] flex-1 truncate">{source.webhook_secret}</code>
            <button onClick={() => copy(source.webhook_secret!, "secret")} className="text-[var(--text-muted)] hover:text-[var(--text-primary)] transition-colors">
              {copied === "secret" ? <Check className="w-3.5 h-3.5 text-[var(--accent-emerald)]" /> : <Copy className="w-3.5 h-3.5" />}
            </button>
          </div>
          <p className="text-[10px] text-[var(--accent-amber)] mt-1">⚠ Save this now — it won&apos;t be shown again.</p>
        </div>
      )}
    </div>
  );
}

// ── Monitor Sources Tab ────────────────────────────────────────

function MonitorSourcesTab() {
  const [sources, setSources] = useState<IntegrationSource[]>([]);
  const [adding, setAdding] = useState(false);
  const [newSource, setNewSource] = useState<IntegrationSource | null>(null);
  const [form, setForm] = useState({ platform: "x", identifier: "", label: "" });
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  const authHeaders = (): Record<string, string> => {
    const token = typeof window !== "undefined" ? localStorage.getItem("aura_token") : null;
    return token ? { Authorization: `Bearer ${token}`, "Content-Type": "application/json" } : { "Content-Type": "application/json" };
  };

  const load = useCallback(() => {
    setLoading(true);
    fetch(`${API}/api/v1/integrations`, { headers: authHeaders() })
      .then((r) => r.json())
      .then((d) => setSources(d.sources || []))
      .finally(() => setLoading(false));
  }, []);

  useEffect(() => { load(); }, [load]);

  const handleAdd = async () => {
    if (!form.identifier.trim()) {
      setError("Identifier is required.");
      return;
    }
    setError("");
    try {
      const res = await fetch(`${API}/api/v1/integrations`, {
        method: "POST",
        headers: authHeaders(),
        body: JSON.stringify(form),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        throw new Error(data.detail || "Could not add source.");
      }
      setAdding(false);
      setForm({ platform: "x", identifier: "", label: "" });
      if (data.source?.webhook_secret) {
        setNewSource(data.source);
      }
      load();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not add source.");
    }
  };

  const handleRemove = async (id: string) => {
    await fetch(`${API}/api/v1/integrations/${id}`, { method: "DELETE", headers: authHeaders() });
    if (newSource?.id === id) setNewSource(null);
    load();
  };

  return (
    <div className="space-y-5">
      {/* Header row */}
      <div className="flex items-center justify-between">
        <p className="text-sm text-[var(--text-muted)]">
          Define which X handles, subreddits, and email inboxes AURA should monitor for incoming customer messages.
        </p>
        <button
          onClick={() => setAdding(!adding)}
          className="flex items-center gap-2 px-4 py-2 rounded-[var(--radius-md)] text-sm font-semibold text-[var(--accent-primary)] bg-[var(--accent-primary)]/8 border border-[var(--accent-primary)]/20 hover:bg-[var(--accent-primary)]/15 transition-all shrink-0"
        >
          {adding ? <X className="w-4 h-4" /> : <Plus className="w-4 h-4" />}
          {adding ? "Cancel" : "Add Source"}
        </button>
      </div>

      {/* New source notification */}
      {newSource && (
        <motion.div initial={{ opacity: 0, y: -8 }} animate={{ opacity: 1, y: 0 }} className="glass-card p-4 border border-[var(--accent-emerald)]/25">
          <div className="flex items-center gap-2 mb-2">
            <CheckCircle2 className="w-4 h-4 text-[var(--accent-emerald)]" />
            <span className="text-sm font-semibold text-[var(--accent-emerald)]">Source added — your webhook info is below</span>
            <button onClick={() => setNewSource(null)} className="ml-auto text-[var(--text-muted)] hover:text-[var(--text-primary)]"><X className="w-4 h-4" /></button>
          </div>
          <WebhookInfoPanel source={newSource} />
        </motion.div>
      )}

      {/* Add Form */}
      <AnimatePresence>
        {adding && (
          <motion.div initial={{ opacity: 0, height: 0 }} animate={{ opacity: 1, height: "auto" }} exit={{ opacity: 0, height: 0 }} className="glass-card p-5">
            <h3 className="text-sm font-semibold mb-4">Add Monitoring Source</h3>
            {error && <p className="mb-3 text-xs text-[var(--accent-danger)]">{error}</p>}
            <div className="grid grid-cols-1 md:grid-cols-4 gap-4 items-end">
              <div>
                <label className="block text-[10px] text-[var(--text-muted)] mb-1.5 uppercase tracking-wider font-semibold">Platform</label>
                <select
                  title="Platform"
                  value={form.platform}
                  onChange={(e) => setForm({ ...form, platform: e.target.value })}
                  className="w-full px-3 py-2.5 rounded-[var(--radius-md)] bg-[var(--bg-inset)] border border-[var(--border-subtle)] text-sm text-[var(--text-primary)] focus:outline-none focus:ring-2 focus:ring-[var(--accent-primary)]/20"
                >
                  <option value="x">X / Twitter</option>
                  <option value="reddit">Reddit</option>
                  <option value="gmail">Gmail / Email</option>
                </select>
              </div>
              <div className="md:col-span-2">
                <label className="block text-[10px] text-[var(--text-muted)] mb-1.5 uppercase tracking-wider font-semibold">
                  {PLATFORM_META[form.platform]?.sourceLabel || "Identifier"}
                </label>
                <input
                  value={form.identifier}
                  onChange={(e) => setForm({ ...form, identifier: e.target.value })}
                  placeholder={PLATFORM_META[form.platform]?.placeholder}
                  className="w-full px-3 py-2.5 rounded-[var(--radius-md)] bg-[var(--bg-inset)] border border-[var(--border-subtle)] text-sm text-[var(--text-primary)] placeholder:text-[var(--text-muted)] focus:outline-none focus:ring-2 focus:ring-[var(--accent-primary)]/20"
                />
              </div>
              <div>
                <button
                  onClick={handleAdd}
                  className="w-full flex items-center justify-center gap-2 px-4 py-2.5 rounded-[var(--radius-md)] text-sm font-semibold text-white bg-[var(--accent-primary)] hover:brightness-110 shadow-lg shadow-[var(--accent-primary)]/15 transition-all active:scale-[0.98]"
                >
                  <Check className="w-4 h-4" /> Add Source
                </button>
              </div>
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Per-platform source lists */}
      {loading ? (
        Array.from({ length: 3 }).map((_, i) => <div key={i} className="skeleton h-20 rounded-[var(--radius-lg)]" />)
      ) : (
        (["x", "reddit", "gmail"] as const).map((platform) => {
          const meta = PLATFORM_META[platform];
          const items = sources.filter((s) => s.platform === platform);
          const Icon = meta.icon;
          return (
            <div key={platform} className="glass-card overflow-hidden">
              <div className={cn("px-5 py-3.5 flex items-center gap-3 border-b border-[var(--border-subtle)]", meta.bgColor)}>
                <Icon className={cn("w-4 h-4", meta.color)} />
                <h3 className="text-sm font-bold">{meta.label}</h3>
                <span className="ml-auto text-[11px] text-[var(--text-muted)] font-mono bg-[var(--bg-elevated)] px-2 py-0.5 rounded-full">
                  {items.length} {items.length === 1 ? "source" : "sources"}
                </span>
              </div>
              {items.length === 0 ? (
                <div className="px-5 py-6 text-center">
                  <p className="text-sm text-[var(--text-muted)]">No {meta.label} sources added yet</p>
                  <p className="text-[11px] text-[var(--text-muted)] mt-1">Click &quot;Add Source&quot; above to start monitoring</p>
                </div>
              ) : (
                <div className="divide-y divide-[var(--border-subtle)]">
                  {items.map((s, i) => (
                    <motion.div key={s.id + i} initial={{ opacity: 0 }} animate={{ opacity: 1 }}
                      className="px-5 py-3.5 space-y-1">
                      <div className="flex items-center gap-4">
                        <div className="flex-1 min-w-0">
                          <p className="text-sm font-semibold">{s.identifier}</p>
                          {s.label && <p className="text-[11px] text-[var(--text-muted)]">{s.label}</p>}
                        </div>
                        <span className={cn(
                          "px-2 py-0.5 rounded-full text-[10px] font-semibold",
                          s.active ? "bg-[var(--accent-emerald)]/10 text-[var(--accent-emerald)]" : "bg-[var(--bg-card-hover)] text-[var(--text-muted)]"
                        )}>
                          {s.active ? "Active" : "Paused"}
                        </span>
                        <button
                          title="View webhook info"
                          onClick={() => setNewSource(newSource?.id === s.id ? null : s)}
                          className="p-1.5 rounded-[var(--radius-sm)] text-[var(--text-muted)] hover:text-[var(--accent-primary)] hover:bg-[var(--accent-primary)]/8 transition-colors"
                        >
                          <Link2 className="w-3.5 h-3.5" />
                        </button>
                        <button
                          title="Remove source"
                          onClick={() => handleRemove(s.id)}
                          className="p-1.5 rounded-[var(--radius-sm)] text-[var(--text-muted)] hover:text-[var(--accent-rose)] hover:bg-[var(--accent-rose)]/8 transition-colors"
                        >
                          <X className="w-3.5 h-3.5" />
                        </button>
                      </div>
                      {newSource?.id === s.id && s.webhook_path && (
                        <WebhookInfoPanel source={s} />
                      )}
                    </motion.div>
                  ))}
                </div>
              )}
            </div>
          );
        })
      )}
    </div>
  );
}

// ── Main Page ─────────────────────────────────────────────────

export default function IntegrationsPage() {
  const [tab, setTab] = useState<"connect" | "monitor">("connect");
  const [platforms, setPlatforms] = useState<PlatformConnections | null>(null);
  const [saving, setSaving] = useState<string | null>(null);
  const [savedPlatform, setSavedPlatform] = useState<string | null>(null);
  const [loadingPlatforms, setLoadingPlatforms] = useState(true);

  const loadPlatforms = useCallback(async () => {
    try {
      const data = await fetchPlatformConnections();
      setPlatforms(data.platforms);
    } catch { /* silent */ }
    setLoadingPlatforms(false);
  }, []);

  useEffect(() => { loadPlatforms(); }, [loadPlatforms]);

  const handleSavePlatform = async (platformKey: string, fields: Record<string, string>) => {
    setSaving(platformKey);
    try {
      const res = await updatePlatformConnection(fields);
      setPlatforms(res.platforms);
      setSavedPlatform(platformKey);
      setTimeout(() => setSavedPlatform(null), 3000);
    } catch { /* ignore */ }
    setSaving(null);
  };

  const connectedCount = platforms
    ? Object.values(platforms).filter((p) => p.connected).length
    : 0;

  return (
    <div className="space-y-6">
      {/* Page Header */}
      <div>
        <div className="flex items-center gap-3">
          <h1 className="text-2xl font-bold font-display tracking-tight">Platform Integrations</h1>
          {!loadingPlatforms && (
            <span className={cn(
              "px-2.5 py-1 rounded-full text-xs font-semibold",
              connectedCount > 0
                ? "bg-[var(--accent-emerald)]/10 text-[var(--accent-emerald)]"
                : "bg-[var(--bg-elevated)] text-[var(--text-muted)]"
            )}>
              {connectedCount}/4 connected
            </span>
          )}
        </div>
        <p className="text-sm text-[var(--text-muted)] mt-1">
          Connect your social platforms and define which channels AURA should monitor
        </p>
      </div>

      {/* Success toast */}
      <AnimatePresence>
        {savedPlatform && (
          <motion.div
            initial={{ opacity: 0, y: -10 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -10 }}
            className="flex items-center gap-2 px-4 py-3 rounded-[var(--radius-md)] bg-[var(--accent-emerald)]/10 border border-[var(--accent-emerald)]/25 text-sm text-[var(--accent-emerald)] font-medium"
          >
            <CheckCircle2 className="w-4 h-4" />
            {PLATFORM_CREDENTIALS[savedPlatform]?.title} credentials saved and encrypted.
          </motion.div>
        )}
      </AnimatePresence>

      {/* Tabs */}
      <div className="flex gap-1 p-1 rounded-[var(--radius-md)] bg-[var(--bg-elevated)] border border-[var(--border-subtle)] w-fit">
        {([
          { id: "connect", label: "Connect Platforms", icon: Link2 },
          { id: "monitor", label: "Monitor Sources", icon: MessageSquare },
        ] satisfies IntegrationTab[]).map((t) => {
          const TIcon = t.icon;
          return (
            <button
              key={t.id}
              onClick={() => setTab(t.id)}
              className={cn(
                "flex items-center gap-2 px-4 py-2 rounded-[var(--radius-sm)] text-sm font-semibold transition-all",
                tab === t.id
                  ? "bg-[var(--bg-card)] text-[var(--text-primary)] shadow-sm"
                  : "text-[var(--text-muted)] hover:text-[var(--text-primary)]"
              )}
            >
              <TIcon className="w-4 h-4" />
              {t.label}
              {t.id === "connect" && connectedCount > 0 && (
                <span className="w-4 h-4 rounded-full bg-[var(--accent-emerald)] text-white text-[9px] font-bold flex items-center justify-center">
                  {connectedCount}
                </span>
              )}
            </button>
          );
        })}
      </div>

      {/* Tab Content */}
      <AnimatePresence mode="wait">
        {tab === "connect" ? (
          <motion.div
            key="connect"
            initial={{ opacity: 0, x: -8 }}
            animate={{ opacity: 1, x: 0 }}
            exit={{ opacity: 0, x: 8 }}
            className="space-y-4"
          >
            {/* Info banner */}
            <div className="flex items-start gap-3 p-4 rounded-[var(--radius-md)] bg-[var(--accent-primary)]/5 border border-[var(--accent-primary)]/15 text-sm text-[var(--text-secondary)]">
              <Shield className="w-4 h-4 text-[var(--accent-primary)] shrink-0 mt-0.5" />
              <div>
                <span className="font-semibold text-[var(--text-primary)]">All credentials are encrypted at rest</span> using AES-256 and never
                returned in plaintext. Only enter credentials for platforms you want AURA to monitor.
              </div>
            </div>

            {loadingPlatforms ? (
              Array.from({ length: 4 }).map((_, i) => <div key={i} className="skeleton h-16 rounded-[var(--radius-lg)]" />)
            ) : platforms ? (
              <>
                <PlatformCard platformKey="x" status={platforms.x as AnyPlatformStatus} onSave={handleSavePlatform} saving={saving} />
                <PlatformCard platformKey="reddit" status={platforms.reddit as AnyPlatformStatus} onSave={handleSavePlatform} saving={saving} />
                <PlatformCard platformKey="gmail" status={platforms.gmail as AnyPlatformStatus} onSave={handleSavePlatform} saving={saving} />
                <PlatformCard platformKey="threads" status={platforms.threads as AnyPlatformStatus} onSave={handleSavePlatform} saving={saving} />
              </>
            ) : null}
          </motion.div>
        ) : (
          <motion.div
            key="monitor"
            initial={{ opacity: 0, x: 8 }}
            animate={{ opacity: 1, x: 0 }}
            exit={{ opacity: 0, x: -8 }}
          >
            <MonitorSourcesTab />
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
