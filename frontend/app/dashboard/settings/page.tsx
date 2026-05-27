"use client";

import React, { useState, useEffect, useCallback } from "react";
import { motion } from "framer-motion";
import {
  Settings, Key, Server, Mail, Phone, Cloud, Globe, Brain,
  CheckCircle2, XCircle, Shield, RefreshCw, Save, Lock,
} from "lucide-react";
import { fetchTenantSettings, updateTenantSettings, updateBYOIConfig } from "@/lib/api";
import type { TenantSettings, BYOIStatus } from "@/lib/types";

const SERVICE_CONFIG = [
  { key: "gemini", label: "Google Gemini AI", icon: Brain, fields: [{ name: "gemini_api_key", label: "API Key", type: "password" }] },
  { key: "openai", label: "OpenAI", icon: Brain, fields: [{ name: "openai_api_key", label: "API Key", type: "password" }] },
  { key: "anthropic", label: "Anthropic Claude", icon: Brain, fields: [{ name: "anthropic_api_key", label: "API Key", type: "password" }] },
  { key: "mistral", label: "Mistral AI", icon: Brain, fields: [{ name: "mistral_api_key", label: "API Key", type: "password" }] },
  { key: "openrouter", label: "OpenRouter", icon: Brain, fields: [{ name: "openrouter_api_key", label: "API Key", type: "password" }] },
  { key: "ollama", label: "Ollama", icon: Server, fields: [{ name: "ollama_base_url", label: "Base URL", type: "text" }] },
  { key: "self_hosted", label: "Self-hosted AI", icon: Server, fields: [{ name: "self_hosted_base_url", label: "Base URL", type: "text" }, { name: "self_hosted_api_key", label: "API Key", type: "password" }] },
  { key: "pinecone", label: "Pinecone Vector DB", icon: Server, fields: [{ name: "pinecone_api_key", label: "API Key", type: "password" }, { name: "pinecone_host", label: "Host URL", type: "text" }] },
  { key: "smtp", label: "SMTP Email", icon: Mail, fields: [{ name: "smtp_host", label: "Host", type: "text" }, { name: "smtp_port", label: "Port", type: "number" }, { name: "smtp_user", label: "Username", type: "text" }, { name: "smtp_pass", label: "Password", type: "password" }] },
  { key: "twilio", label: "Twilio Voice", icon: Phone, fields: [{ name: "twilio_sid", label: "Account SID", type: "password" }, { name: "twilio_token", label: "Auth Token", type: "password" }, { name: "twilio_phone", label: "Phone Number", type: "text" }] },
  { key: "storage", label: "Cloud Storage", icon: Cloud, fields: [{ name: "storage_provider", label: "Provider (s3/gcs/azure)", type: "text" }, { name: "storage_bucket", label: "Bucket Name", type: "text" }, { name: "storage_credentials", label: "Credentials JSON", type: "password" }] },
];

export default function SettingsPage() {
  const [tenant, setTenant] = useState<TenantSettings | null>(null);
  const [byoi, setByoi] = useState<BYOIStatus | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [activeService, setActiveService] = useState<string | null>(null);
  const [byoiFields, setByoiFields] = useState<Record<string, string>>({});

  // Tenant settings form
  const [tenantName, setTenantName] = useState("");
  const [tenantDomain, setTenantDomain] = useState("");
  const [tenantIndustry, setTenantIndustry] = useState("");
  const [tenantLanguage, setTenantLanguage] = useState("en");

  const loadSettings = useCallback(async () => {
    setLoading(true);
    try {
      const result = await fetchTenantSettings();
      setTenant(result.tenant);
      setByoi(result.byoi);
      setTenantName(result.tenant.name || "");
      setTenantDomain(result.tenant.domain || "");
      setTenantIndustry(result.tenant.industry || "");
      setTenantLanguage(result.tenant.default_language || "en");
    } catch { /* ignore */ }
    setLoading(false);
  }, []);

  useEffect(() => { loadSettings(); }, [loadSettings]);

  const handleSaveTenant = async () => {
    setSaving(true);
    try {
      await updateTenantSettings({ name: tenantName, domain: tenantDomain, industry: tenantIndustry, default_language: tenantLanguage });
      await loadSettings();
    } catch { /* ignore */ }
    setSaving(false);
  };

  const handleSaveBYOI = async () => {
    if (Object.keys(byoiFields).length === 0) return;
    setSaving(true);
    try {
      await updateBYOIConfig(byoiFields);
      setByoiFields({});
      setActiveService(null);
      await loadSettings();
    } catch { /* ignore */ }
    setSaving(false);
  };

  if (loading) {
    return (
      <div className="space-y-4">
        {Array.from({ length: 3 }).map((_, i) => <div key={i} className="skeleton h-24 rounded-[var(--radius-lg)]" />)}
      </div>
    );
  }

  return (
    <div className="space-y-8">
      {/* Header */}
      <div>
        <h1 className="text-2xl font-display font-bold tracking-tight">Settings & Infrastructure</h1>
        <p className="text-sm text-[var(--text-muted)] mt-1">Configure your workspace and bring your own API keys</p>
      </div>

      {/* Workspace Settings */}
      <section className="solid-card overflow-hidden">
        <div className="px-5 py-4 border-b border-[var(--border-subtle)] flex items-center gap-2">
          <Settings className="w-4 h-4 text-[var(--accent-primary)]" />
          <h2 className="text-sm font-bold">Workspace Settings</h2>
        </div>
        <div className="p-5 grid grid-cols-1 md:grid-cols-2 gap-4">
          <div>
            <label className="text-xs font-semibold text-[var(--text-secondary)] mb-1 block">Organization Name</label>
            <input value={tenantName} onChange={(e) => setTenantName(e.target.value)} className="w-full px-3 py-2 text-sm bg-[var(--bg-elevated)] border border-[var(--border-subtle)] rounded-[var(--radius-md)] text-[var(--text-primary)]" />
          </div>
          <div>
            <label className="text-xs font-semibold text-[var(--text-secondary)] mb-1 block">Domain</label>
            <input value={tenantDomain} onChange={(e) => setTenantDomain(e.target.value)} placeholder="company.com" className="w-full px-3 py-2 text-sm bg-[var(--bg-elevated)] border border-[var(--border-subtle)] rounded-[var(--radius-md)] text-[var(--text-primary)]" />
          </div>
          <div>
            <label className="text-xs font-semibold text-[var(--text-secondary)] mb-1 block">Industry</label>
            <select value={tenantIndustry} onChange={(e) => setTenantIndustry(e.target.value)} className="w-full px-3 py-2 text-sm bg-[var(--bg-elevated)] border border-[var(--border-subtle)] rounded-[var(--radius-md)] text-[var(--text-primary)]">
              <option value="">Select Industry</option>
              <option value="ecommerce">E-Commerce</option>
              <option value="saas">SaaS</option>
              <option value="fintech">FinTech</option>
              <option value="healthcare">Healthcare</option>
              <option value="telecom">Telecom</option>
              <option value="logistics">Logistics</option>
              <option value="retail">Retail</option>
            </select>
          </div>
          <div>
            <label className="text-xs font-semibold text-[var(--text-secondary)] mb-1 block">Default Language</label>
            <select value={tenantLanguage} onChange={(e) => setTenantLanguage(e.target.value)} className="w-full px-3 py-2 text-sm bg-[var(--bg-elevated)] border border-[var(--border-subtle)] rounded-[var(--radius-md)] text-[var(--text-primary)]">
              <option value="en">English</option>
              <option value="hi">Hindi</option>
              <option value="mr">Marathi</option>
              <option value="ta">Tamil</option>
              <option value="bn">Bengali</option>
              <option value="gu">Gujarati</option>
              <option value="te">Telugu</option>
              <option value="kn">Kannada</option>
              <option value="ml">Malayalam</option>
            </select>
          </div>
        </div>
        <div className="px-5 py-3 border-t border-[var(--border-subtle)] flex justify-end">
          <button onClick={handleSaveTenant} disabled={saving} className="flex items-center gap-1.5 px-4 py-2 text-xs font-semibold text-white bg-[var(--accent-primary)] rounded-[var(--radius-md)] hover:opacity-90 disabled:opacity-50">
            {saving ? <RefreshCw className="w-3.5 h-3.5 animate-spin" /> : <Save className="w-3.5 h-3.5" />} Save Settings
          </button>
        </div>
      </section>

      {/* BYOI Infrastructure */}
      <section>
        <div className="flex items-center gap-2 mb-4">
          <Key className="w-4 h-4 text-[var(--accent-secondary)]" />
          <h2 className="text-sm font-bold">Bring Your Own Infrastructure (BYOI)</h2>
          <div className="flex items-center gap-1 ml-2 px-2 py-0.5 bg-[var(--accent-emerald)]/10 text-[var(--accent-emerald)] rounded-full">
            <Lock className="w-3 h-3" />
            <span className="text-[10px] font-semibold">Encrypted at Rest</span>
          </div>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3">
          {SERVICE_CONFIG.map((service) => {
            const status = byoi?.services?.[service.key];
            const isActive = status?.active || false;
            const isExpanded = activeService === service.key;
            const Icon = service.icon;

            return (
              <motion.div key={service.key} layout className={`solid-card overflow-hidden cursor-pointer transition-all ${isExpanded ? "md:col-span-2 lg:col-span-3" : ""}`}>
                <div onClick={() => setActiveService(isExpanded ? null : service.key)} className="p-4 flex items-center gap-3">
                  <div className={`w-9 h-9 rounded-[var(--radius-md)] flex items-center justify-center ${isActive ? "bg-[var(--accent-emerald)]/10" : "bg-[var(--bg-elevated)]"}`}>
                    <Icon className={`w-4 h-4 ${isActive ? "text-[var(--accent-emerald)]" : "text-[var(--text-muted)]"}`} />
                  </div>
                  <div className="flex-1">
                    <div className="text-sm font-semibold">{service.label}</div>
                    <div className="text-[10px] text-[var(--text-muted)]">
                      {isActive ? (
                        <span className="flex items-center gap-1 text-[var(--accent-emerald)]"><CheckCircle2 className="w-3 h-3" /> Connected</span>
                      ) : (
                        <span className="flex items-center gap-1"><XCircle className="w-3 h-3" /> Not configured</span>
                      )}
                    </div>
                  </div>
                  {isActive && status?.masked_key && (
                    <code className="text-[10px] font-mono text-[var(--text-muted)] bg-[var(--bg-elevated)] px-2 py-0.5 rounded">{status.masked_key}</code>
                  )}
                </div>

                {isExpanded && (
                  <motion.div initial={{ height: 0 }} animate={{ height: "auto" }} className="border-t border-[var(--border-subtle)] p-4">
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                      {service.fields.map((field) => (
                        <div key={field.name}>
                          <label className="text-xs font-semibold text-[var(--text-secondary)] mb-1 block">{field.label}</label>
                          <input
                            type={field.type}
                            value={byoiFields[field.name] || ""}
                            onChange={(e) => setByoiFields(prev => ({ ...prev, [field.name]: e.target.value }))}
                            placeholder={isActive ? "••• (already set)" : `Enter ${field.label.toLowerCase()}`}
                            className="w-full px-3 py-2 text-sm bg-[var(--bg-elevated)] border border-[var(--border-subtle)] rounded-[var(--radius-md)] text-[var(--text-primary)]"
                          />
                        </div>
                      ))}
                    </div>
                    <div className="mt-4 flex justify-end">
                      <button onClick={handleSaveBYOI} disabled={saving || Object.keys(byoiFields).length === 0} className="flex items-center gap-1.5 px-4 py-2 text-xs font-semibold text-white bg-[var(--accent-primary)] rounded-[var(--radius-md)] hover:opacity-90 disabled:opacity-50">
                        {saving ? <RefreshCw className="w-3.5 h-3.5 animate-spin" /> : <Shield className="w-3.5 h-3.5" />} Encrypt & Save
                      </button>
                    </div>
                  </motion.div>
                )}
              </motion.div>
            );
          })}
        </div>
      </section>

      {/* SLA Configuration */}
      {tenant && (
        <section className="solid-card overflow-hidden">
          <div className="px-5 py-4 border-b border-[var(--border-subtle)] flex items-center gap-2">
            <Globe className="w-4 h-4 text-[var(--accent-teal)]" />
            <h2 className="text-sm font-bold">SLA Configuration</h2>
          </div>
          <div className="p-5 grid grid-cols-2 md:grid-cols-4 gap-4">
            {(["p1", "p2", "p3", "p4"] as const).map(priority => (
              <div key={priority} className="text-center">
                <div className="text-xs font-semibold text-[var(--text-secondary)] mb-1 uppercase">{priority} — {priority === "p1" ? "Critical" : priority === "p2" ? "High" : priority === "p3" ? "Medium" : "Low"}</div>
                <div className="text-2xl font-bold font-display text-[var(--accent-primary)]">
                  {tenant.sla_config?.[`${priority}_minutes`] || 0}
                </div>
                <div className="text-[10px] text-[var(--text-muted)]">minutes</div>
              </div>
            ))}
          </div>
        </section>
      )}
    </div>
  );
}
