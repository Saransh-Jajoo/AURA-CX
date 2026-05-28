"use client";

import React, { useState, useEffect, useCallback } from "react";
import { motion } from "framer-motion";
import {
  Settings, Key, Server, Mail, Phone, Cloud, Globe, Brain,
  CheckCircle2, XCircle, Shield, RefreshCw, Save, Lock,
  Plus, Trash2, Edit3,
} from "lucide-react";
import {
  createDynamicPlatformConnection,
  deleteDynamicPlatformConnection,
  fetchDynamicPlatformConnections,
  fetchTenantSettings,
  updateBYOIConfig,
  updateDynamicPlatformConnection,
  updateTenantSettings,
} from "@/lib/api";
import { useAuth } from "@/lib/auth-context";
import type { DynamicPlatformConnection, TenantSettings, BYOIStatus } from "@/lib/types";

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

type PlatformField = {
  name: string;
  label: string;
  type?: string;
  placeholder?: string;
  required?: boolean;
};

type PlatformTemplate = {
  key: string;
  label: string;
  platformName: string;
  accountLabel: string;
  accountPlaceholder: string;
  fields: PlatformField[];
  buildCredentials: (values: Record<string, string>, accountIdentifier: string) => Record<string, unknown>;
};

const PLATFORM_TEMPLATES: PlatformTemplate[] = [
  {
    key: "whatsapp",
    label: "WhatsApp",
    platformName: "WhatsApp",
    accountLabel: "Business phone number",
    accountPlaceholder: "+91XXXXXXXXXX",
    fields: [
      { name: "endpoint_url", label: "Incoming messages API endpoint", placeholder: "https://provider.example.com/messages", required: true },
      { name: "bearer_token", label: "API access token", type: "password", required: true },
      { name: "account_param", label: "Phone number parameter", placeholder: "phone" },
      { name: "items_path", label: "Messages list field", placeholder: "data" },
    ],
    buildCredentials: (values) => ({
      endpoint_url: values.endpoint_url,
      bearer_token: values.bearer_token,
      account_param: values.account_param || "phone",
      items_path: values.items_path || "data",
      cursor_param: "after",
      limit_param: "limit",
      field_map: {
        id: "id",
        text: "text",
        author_handle: "from",
        author_name: "profile.name",
        created_at: "timestamp",
      },
    }),
  },
  {
    key: "x",
    label: "X / Twitter",
    platformName: "X",
    accountLabel: "Official handle",
    accountPlaceholder: "@UnionBankOfficial",
    fields: [
      { name: "bearer_token", label: "Bearer token", type: "password", required: true },
      { name: "query", label: "Search query", placeholder: "@UnionBankOfficial" },
    ],
    buildCredentials: (values, accountIdentifier) => ({
      bearer_token: values.bearer_token,
      query: values.query || accountIdentifier,
    }),
  },
  {
    key: "gmail",
    label: "Gmail / Email Inbox",
    platformName: "Gmail",
    accountLabel: "Support email address",
    accountPlaceholder: "support@unionbank.example",
    fields: [
      { name: "imap_host", label: "IMAP host", placeholder: "imap.gmail.com", required: true },
      { name: "imap_port", label: "IMAP port", type: "number", placeholder: "993" },
      { name: "imap_user", label: "Mailbox username", required: true },
      { name: "imap_password", label: "Mailbox app password", type: "password", required: true },
      { name: "folder", label: "Folder", placeholder: "INBOX" },
    ],
    buildCredentials: (values) => ({
      imap_host: values.imap_host,
      imap_port: values.imap_port || "993",
      imap_user: values.imap_user,
      imap_password: values.imap_password,
      folder: values.folder || "INBOX",
      imap_use_ssl: true,
    }),
  },
  {
    key: "reddit",
    label: "Reddit",
    platformName: "Reddit",
    accountLabel: "Subreddit or keyword",
    accountPlaceholder: "r/UnionBank or UnionBank",
    fields: [
      { name: "client_id", label: "Client ID", type: "password", required: true },
      { name: "client_secret", label: "Client secret", type: "password", required: true },
      { name: "user_agent", label: "User agent", placeholder: "UnionBankSupport/1.0", required: true },
      { name: "query", label: "Search query", placeholder: "UnionBank" },
    ],
    buildCredentials: (values, accountIdentifier) => ({
      client_id: values.client_id,
      client_secret: values.client_secret,
      user_agent: values.user_agent,
      query: values.query || accountIdentifier,
    }),
  },
  {
    key: "threads",
    label: "Threads",
    platformName: "Threads",
    accountLabel: "Official handle",
    accountPlaceholder: "@UnionBankOfficial",
    fields: [
      { name: "access_token", label: "Access token", type: "password", required: true },
    ],
    buildCredentials: (values) => ({ access_token: values.access_token }),
  },
  {
    key: "custom",
    label: "Other API",
    platformName: "",
    accountLabel: "Official account ID or handle",
    accountPlaceholder: "@UnionBankOfficial or account ID",
    fields: [
      { name: "endpoint_url", label: "Incoming messages API endpoint", placeholder: "https://api.example.com/messages", required: true },
      { name: "bearer_token", label: "Bearer token", type: "password" },
      { name: "api_key", label: "API key", type: "password" },
      { name: "items_path", label: "Messages list field", placeholder: "data" },
      { name: "text_path", label: "Message text field", placeholder: "text" },
      { name: "sender_path", label: "Sender field", placeholder: "from" },
    ],
    buildCredentials: (values) => ({
      endpoint_url: values.endpoint_url,
      bearer_token: values.bearer_token || undefined,
      api_key: values.api_key || undefined,
      items_path: values.items_path || "data",
      cursor_param: "after",
      limit_param: "limit",
      field_map: {
        id: "id",
        text: values.text_path || "text",
        author_handle: values.sender_path || "from",
        author_name: "name",
        created_at: "timestamp",
      },
    }),
  },
];

const DEFAULT_PLATFORM_TEMPLATE = PLATFORM_TEMPLATES[0];

export default function SettingsPage() {
  const { user } = useAuth();
  const [tenant, setTenant] = useState<TenantSettings | null>(null);
  const [byoi, setByoi] = useState<BYOIStatus | null>(null);
  const [dynamicPlatforms, setDynamicPlatforms] = useState<DynamicPlatformConnection[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [activeService, setActiveService] = useState<string | null>(null);
  const [byoiFields, setByoiFields] = useState<Record<string, string>>({});
  const [editingPlatformId, setEditingPlatformId] = useState<string | null>(null);
  const [platformType, setPlatformType] = useState(DEFAULT_PLATFORM_TEMPLATE.key);
  const [platformFields, setPlatformFields] = useState<Record<string, string>>({});
  const [platformError, setPlatformError] = useState("");
  const [platformForm, setPlatformForm] = useState({
    platform_name: DEFAULT_PLATFORM_TEMPLATE.platformName,
    account_identifier: "",
    active: true,
    poll_interval_seconds: "300",
  });

  // Tenant settings form
  const [tenantName, setTenantName] = useState("");
  const [tenantDomain, setTenantDomain] = useState("");
  const [tenantIndustry, setTenantIndustry] = useState("");
  const [tenantLanguage, setTenantLanguage] = useState("en");

  const canManageTenantSettings = user?.role === "tenant_admin" || user?.role === "super_admin";
  const canManageDynamicPlatforms = user?.role === "executive" || user?.role === "super_admin";
  const selectedPlatformTemplate = PLATFORM_TEMPLATES.find(template => template.key === platformType) || DEFAULT_PLATFORM_TEMPLATE;

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
      if (canManageDynamicPlatforms) {
        const platformResult = await fetchDynamicPlatformConnections();
        setDynamicPlatforms(platformResult.connections);
      }
    } catch { /* ignore */ }
    setLoading(false);
  }, [canManageDynamicPlatforms]);

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

  const resetPlatformForm = () => {
    setEditingPlatformId(null);
    setPlatformType(DEFAULT_PLATFORM_TEMPLATE.key);
    setPlatformFields({});
    setPlatformError("");
    setPlatformForm({ platform_name: DEFAULT_PLATFORM_TEMPLATE.platformName, account_identifier: "", active: true, poll_interval_seconds: "300" });
  };

  const handlePlatformTypeChange = (templateKey: string) => {
    const template = PLATFORM_TEMPLATES.find(item => item.key === templateKey) || DEFAULT_PLATFORM_TEMPLATE;
    setPlatformType(template.key);
    setPlatformFields({});
    setPlatformError("");
    setPlatformForm(prev => ({
      ...prev,
      platform_name: template.key === "custom" ? "" : template.platformName,
    }));
  };

  const handleEditPlatform = (connection: DynamicPlatformConnection) => {
    const template = PLATFORM_TEMPLATES.find(item => item.platformName.toLowerCase() === connection.platform_name.toLowerCase()) || PLATFORM_TEMPLATES.find(item => item.key === connection.platform_slug) || PLATFORM_TEMPLATES.find(item => item.key === "custom") || DEFAULT_PLATFORM_TEMPLATE;
    setEditingPlatformId(connection.id);
    setPlatformType(template.key);
    setPlatformFields({});
    setPlatformError("");
    setPlatformForm({
      platform_name: connection.platform_name,
      account_identifier: connection.account_identifier,
      active: connection.active,
      poll_interval_seconds: String(connection.poll_interval_seconds),
    });
  };

  const handleSaveDynamicPlatform = async () => {
    setPlatformError("");
    if (!platformForm.platform_name.trim()) {
      setPlatformError("Application name is required.");
      return;
    }
    if (!platformForm.account_identifier.trim()) {
      setPlatformError(`${selectedPlatformTemplate.accountLabel} is required.`);
      return;
    }
    const missingField = selectedPlatformTemplate.fields.find(field => field.required && !platformFields[field.name]?.trim() && !editingPlatformId);
    if (missingField) {
      setPlatformError(`${missingField.label} is required.`);
      return;
    }
    setSaving(true);
    try {
      const payload: Record<string, unknown> = {
        platform_name: platformForm.platform_name.trim(),
        account_identifier: platformForm.account_identifier.trim(),
        active: platformForm.active,
        poll_interval_seconds: Number(platformForm.poll_interval_seconds) || 300,
      };
      const hasCredentialUpdates = selectedPlatformTemplate.fields.some(field => field.name !== "platform_name" && platformFields[field.name]?.trim());
      if (!editingPlatformId || hasCredentialUpdates) {
        payload.credentials = selectedPlatformTemplate.buildCredentials(platformFields, platformForm.account_identifier.trim());
      }
      if (editingPlatformId) {
        await updateDynamicPlatformConnection(editingPlatformId, payload);
      } else {
        await createDynamicPlatformConnection(payload);
      }
      resetPlatformForm();
      const result = await fetchDynamicPlatformConnections();
      setDynamicPlatforms(result.connections);
    } catch (error) {
      setPlatformError(error instanceof Error ? error.message : "Could not save platform.");
    }
    setSaving(false);
  };

  const handleDeleteDynamicPlatform = async (connectionId: string) => {
    setSaving(true);
    try {
      await deleteDynamicPlatformConnection(connectionId);
      setDynamicPlatforms(prev => prev.filter(item => item.id !== connectionId));
      if (editingPlatformId === connectionId) resetPlatformForm();
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
      {canManageTenantSettings && (
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
      )}

      {/* BYOI Infrastructure */}
      {canManageTenantSettings && (
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
      )}

      {canManageDynamicPlatforms && (
        <section className="solid-card overflow-hidden">
          <div className="px-5 py-4 border-b border-[var(--border-subtle)] flex items-center gap-2">
            <Globe className="w-4 h-4 text-[var(--accent-teal)]" />
            <h2 className="text-sm font-bold">Live Platform API Management</h2>
            <div className="flex items-center gap-1 ml-2 px-2 py-0.5 bg-[var(--accent-emerald)]/10 text-[var(--accent-emerald)] rounded-full">
              <Lock className="w-3 h-3" />
              <span className="text-[10px] font-semibold">Encrypted Credentials</span>
            </div>
          </div>

          <div className="p-5 grid grid-cols-1 lg:grid-cols-[1fr_1.2fr] gap-5">
            <div className="space-y-3">
              <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                <div>
                  <label className="text-xs font-semibold text-[var(--text-secondary)] mb-1 block">Application</label>
                  <select
                    value={platformType}
                    onChange={(e) => handlePlatformTypeChange(e.target.value)}
                    className="w-full px-3 py-2 text-sm bg-[var(--bg-elevated)] border border-[var(--border-subtle)] rounded-[var(--radius-md)] text-[var(--text-primary)]"
                  >
                    {PLATFORM_TEMPLATES.map(template => (
                      <option key={template.key} value={template.key}>{template.label}</option>
                    ))}
                  </select>
                </div>
                <div>
                  <label className="text-xs font-semibold text-[var(--text-secondary)] mb-1 block">{selectedPlatformTemplate.accountLabel}</label>
                  <input
                    value={platformForm.account_identifier}
                    onChange={(e) => setPlatformForm(prev => ({ ...prev, account_identifier: e.target.value }))}
                    placeholder={selectedPlatformTemplate.accountPlaceholder}
                    className="w-full px-3 py-2 text-sm bg-[var(--bg-elevated)] border border-[var(--border-subtle)] rounded-[var(--radius-md)] text-[var(--text-primary)]"
                  />
                </div>
              </div>
              {selectedPlatformTemplate.key === "custom" && (
                <div>
                  <label className="text-xs font-semibold text-[var(--text-secondary)] mb-1 block">Application name</label>
                  <input
                    value={platformForm.platform_name}
                    onChange={(e) => setPlatformForm(prev => ({ ...prev, platform_name: e.target.value }))}
                    placeholder="Instagram, YouTube, Custom API"
                    className="w-full px-3 py-2 text-sm bg-[var(--bg-elevated)] border border-[var(--border-subtle)] rounded-[var(--radius-md)] text-[var(--text-primary)]"
                  />
                </div>
              )}
              <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                {selectedPlatformTemplate.fields.map(field => (
                  <div key={field.name}>
                    <label className="text-xs font-semibold text-[var(--text-secondary)] mb-1 block">
                      {field.label}{field.required ? " *" : ""}
                    </label>
                    <input
                      type={field.type || "text"}
                      value={platformFields[field.name] || ""}
                      onChange={(e) => setPlatformFields(prev => ({ ...prev, [field.name]: e.target.value }))}
                      placeholder={editingPlatformId && field.type === "password" ? "Already saved" : field.placeholder}
                      className="w-full px-3 py-2 text-sm bg-[var(--bg-elevated)] border border-[var(--border-subtle)] rounded-[var(--radius-md)] text-[var(--text-primary)]"
                    />
                  </div>
                ))}
              </div>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                <div>
                  <label className="text-xs font-semibold text-[var(--text-secondary)] mb-1 block">Poll Interval</label>
                  <input
                    type="number"
                    min={60}
                    max={86400}
                    value={platformForm.poll_interval_seconds}
                    onChange={(e) => setPlatformForm(prev => ({ ...prev, poll_interval_seconds: e.target.value }))}
                    className="w-full px-3 py-2 text-sm bg-[var(--bg-elevated)] border border-[var(--border-subtle)] rounded-[var(--radius-md)] text-[var(--text-primary)]"
                  />
                </div>
                <label className="flex items-end gap-2 text-sm text-[var(--text-secondary)] pb-2">
                  <input
                    type="checkbox"
                    checked={platformForm.active}
                    onChange={(e) => setPlatformForm(prev => ({ ...prev, active: e.target.checked }))}
                    className="w-4 h-4"
                  />
                  Monitor this platform
                </label>
              </div>
              {platformError && <p className="text-xs text-[var(--accent-danger)]">{platformError}</p>}
              <div className="flex justify-end gap-2">
                {editingPlatformId && (
                  <button onClick={resetPlatformForm} className="px-4 py-2 text-xs font-semibold border border-[var(--border-subtle)] rounded-[var(--radius-md)]">
                    Cancel
                  </button>
                )}
                <button onClick={handleSaveDynamicPlatform} disabled={saving} className="flex items-center gap-1.5 px-4 py-2 text-xs font-semibold text-white bg-[var(--accent-primary)] rounded-[var(--radius-md)] hover:opacity-90 disabled:opacity-50">
                  {editingPlatformId ? <Save className="w-3.5 h-3.5" /> : <Plus className="w-3.5 h-3.5" />}
                  {editingPlatformId ? "Save Platform" : "Add Platform"}
                </button>
              </div>
            </div>

            <div className="space-y-3">
              {dynamicPlatforms.length === 0 ? (
                <div className="p-4 bg-[var(--bg-elevated)] border border-[var(--border-subtle)] rounded-[var(--radius-md)] text-sm text-[var(--text-muted)]">
                  No live platform APIs are configured.
                </div>
              ) : dynamicPlatforms.map(connection => (
                <div key={connection.id} className="p-4 bg-[var(--bg-elevated)] border border-[var(--border-subtle)] rounded-[var(--radius-md)]">
                  <div className="flex items-start gap-3">
                    <div className={`w-9 h-9 rounded-[var(--radius-md)] flex items-center justify-center ${connection.active ? "bg-[var(--accent-emerald)]/10" : "bg-[var(--bg-base)]"}`}>
                      <Globe className={`w-4 h-4 ${connection.active ? "text-[var(--accent-emerald)]" : "text-[var(--text-muted)]"}`} />
                    </div>
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2">
                        <h3 className="text-sm font-semibold truncate">{connection.platform_name}</h3>
                        <span className="text-[10px] text-[var(--text-muted)] bg-[var(--bg-base)] px-2 py-0.5 rounded">{connection.platform_slug}</span>
                      </div>
                      <p className="text-xs text-[var(--text-secondary)] truncate">{connection.account_identifier}</p>
                      <p className="text-[10px] text-[var(--text-muted)] mt-1">
                        Fields: {connection.credential_fields.length ? connection.credential_fields.join(", ") : "configured"}
                      </p>
                      {connection.last_error && <p className="text-[10px] text-[var(--accent-danger)] mt-1">{connection.last_error}</p>}
                    </div>
                    <div className="flex gap-1">
                      <button onClick={() => handleEditPlatform(connection)} className="p-2 rounded-[var(--radius-md)] hover:bg-[var(--bg-base)]" aria-label="Edit platform">
                        <Edit3 className="w-3.5 h-3.5" />
                      </button>
                      <button onClick={() => handleDeleteDynamicPlatform(connection.id)} className="p-2 rounded-[var(--radius-md)] hover:bg-[var(--bg-base)] text-[var(--accent-danger)]" aria-label="Delete platform">
                        <Trash2 className="w-3.5 h-3.5" />
                      </button>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          </div>
        </section>
      )}

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
