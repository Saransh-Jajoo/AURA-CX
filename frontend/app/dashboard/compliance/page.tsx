"use client";

import React, { useState, useEffect, useCallback } from "react";
import { motion } from "framer-motion";
import {
  Shield, FileText, Download, Search, Filter, Clock,
  CheckCircle2, AlertTriangle, Activity, Eye, ChevronDown,
} from "lucide-react";
import { fetchAuditTrail, fetchComplianceSummary, exportAuditData } from "@/lib/api";
import type { AuditEvent } from "@/lib/types";

const ACTION_COLORS: Record<string, string> = {
  "team.invite": "var(--accent-primary)",
  "team.join": "var(--accent-emerald)",
  "team.update": "var(--accent-amber)",
  "team.suspend": "var(--accent-rose)",
  "kb.create": "var(--accent-teal)",
  "kb.update": "var(--accent-sky)",
  "kb.archive": "var(--accent-rose)",
  "byoi.update": "var(--accent-secondary)",
  "tenant.settings.update": "var(--accent-primary)",
  "voice.ingest": "var(--accent-teal)",
};

function getActionColor(action: string): string {
  return ACTION_COLORS[action] || "var(--text-muted)";
}

export default function CompliancePage() {
  const [events, setEvents] = useState<AuditEvent[]>([]);
  const [total, setTotal] = useState(0);
  const [summary, setSummary] = useState<{
    total_events: number;
    action_breakdown: Record<string, number>;
    resource_breakdown: Record<string, number>;
    compliance_standards: string[];
  } | null>(null);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");
  const [resourceFilter, setResourceFilter] = useState("");
  const [expandedEvent, setExpandedEvent] = useState<string | null>(null);

  const loadData = useCallback(async () => {
    setLoading(true);
    try {
      const params: Record<string, string> = {};
      if (resourceFilter) params.resource_type = resourceFilter;
      if (search) params.action = search;
      const [eventsRes, summaryRes] = await Promise.all([
        fetchAuditTrail(params),
        fetchComplianceSummary(),
      ]);
      setEvents(eventsRes.events || []);
      setTotal(eventsRes.total || 0);
      setSummary(summaryRes);
    } catch { /* ignore */ }
    setLoading(false);
  }, [resourceFilter, search]);

  useEffect(() => { loadData(); }, [loadData]);

  const handleExport = async () => {
    try {
      const data = await exportAuditData("json");
      const blob = new Blob([JSON.stringify(data, null, 2)], { type: "application/json" });
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = `aura-cx-audit-${new Date().toISOString().slice(0, 10)}.json`;
      a.click();
      URL.revokeObjectURL(url);
    } catch { /* ignore */ }
  };

  const resourceTypes = summary?.resource_breakdown ? Object.keys(summary.resource_breakdown) : [];

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-display font-bold tracking-tight">Compliance & Audit</h1>
          <p className="text-sm text-[var(--text-muted)] mt-1">Immutable audit trail for regulatory compliance and governance</p>
        </div>
        <button onClick={handleExport} className="flex items-center gap-1.5 px-4 py-2 bg-[var(--bg-elevated)] border border-[var(--border-subtle)] text-[var(--text-secondary)] rounded-[var(--radius-md)] text-xs font-semibold hover:bg-[var(--bg-card-hover)] transition-all">
          <Download className="w-3.5 h-3.5" /> Export Audit Log
        </button>
      </div>

      {/* Compliance Standards + Summary */}
      {summary && (
        <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
          <div className="solid-card p-4">
            <div className="flex items-center gap-2 mb-2">
              <Activity className="w-3.5 h-3.5 text-[var(--accent-primary)]" />
              <span className="text-[10px] text-[var(--text-muted)] font-semibold uppercase tracking-wider">Total Events</span>
            </div>
            <div className="text-2xl font-bold font-display text-[var(--accent-primary)]">{summary.total_events.toLocaleString()}</div>
          </div>
          <div className="solid-card p-4">
            <div className="flex items-center gap-2 mb-2">
              <FileText className="w-3.5 h-3.5 text-[var(--accent-teal)]" />
              <span className="text-[10px] text-[var(--text-muted)] font-semibold uppercase tracking-wider">Action Types</span>
            </div>
            <div className="text-2xl font-bold font-display text-[var(--accent-teal)]">{Object.keys(summary.action_breakdown).length}</div>
          </div>
          <div className="solid-card p-4">
            <div className="flex items-center gap-2 mb-2">
              <Eye className="w-3.5 h-3.5 text-[var(--accent-emerald)]" />
              <span className="text-[10px] text-[var(--text-muted)] font-semibold uppercase tracking-wider">Resource Types</span>
            </div>
            <div className="text-2xl font-bold font-display text-[var(--accent-emerald)]">{Object.keys(summary.resource_breakdown).length}</div>
          </div>
          <div className="solid-card p-4">
            <div className="flex items-center gap-2 mb-2">
              <Shield className="w-3.5 h-3.5 text-[var(--accent-secondary)]" />
              <span className="text-[10px] text-[var(--text-muted)] font-semibold uppercase tracking-wider">Standards</span>
            </div>
            <div className="flex flex-wrap gap-1 mt-1">
              {summary.compliance_standards.map(std => (
                <span key={std} className="text-[10px] px-2 py-0.5 bg-[var(--accent-secondary)]/10 text-[var(--accent-secondary)] rounded-full font-semibold">{std}</span>
              ))}
            </div>
          </div>
        </div>
      )}

      {/* Action Breakdown */}
      {summary && Object.keys(summary.action_breakdown).length > 0 && (
        <div className="solid-card p-4">
          <h3 className="text-xs font-semibold text-[var(--text-muted)] uppercase tracking-wider mb-3">Action Distribution</h3>
          <div className="flex flex-wrap gap-2">
            {Object.entries(summary.action_breakdown)
              .sort((a, b) => b[1] - a[1])
              .map(([action, count]) => (
                <div key={action} className="flex items-center gap-2 px-3 py-1.5 bg-[var(--bg-elevated)] rounded-[var(--radius-md)] border border-[var(--border-subtle)]">
                  <div className="w-2 h-2 rounded-full" style={{ background: getActionColor(action) }} />
                  <span className="text-xs font-medium text-[var(--text-primary)]">{action}</span>
                  <span className="text-[10px] font-mono text-[var(--text-muted)]">{count}</span>
                </div>
              ))}
          </div>
        </div>
      )}

      {/* Filters */}
      <div className="flex items-center gap-3 flex-wrap">
        <div className="flex-1 min-w-[200px] relative">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-[var(--text-muted)]" />
          <input value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Search by action..." className="w-full pl-9 pr-3 py-2 text-xs bg-[var(--bg-elevated)] border border-[var(--border-subtle)] rounded-[var(--radius-md)] text-[var(--text-primary)] placeholder:text-[var(--text-muted)]" />
        </div>
        {resourceTypes.length > 0 && (
          <select value={resourceFilter} onChange={(e) => setResourceFilter(e.target.value)} className="px-3 py-2 text-xs bg-[var(--bg-elevated)] border border-[var(--border-subtle)] rounded-[var(--radius-md)] text-[var(--text-primary)]">
            <option value="">All Resources</option>
            {resourceTypes.map(rt => <option key={rt} value={rt}>{rt}</option>)}
          </select>
        )}
      </div>

      {/* Audit Event Timeline */}
      <div className="space-y-1">
        {loading ? (
          Array.from({ length: 6 }).map((_, i) => <div key={i} className="skeleton h-14 rounded-[var(--radius-md)]" />)
        ) : events.length === 0 ? (
          <div className="solid-card p-12 text-center">
            <Shield className="w-10 h-10 mx-auto mb-3 text-[var(--text-muted)]" />
            <p className="text-sm text-[var(--text-muted)]">No audit events recorded yet. Actions will appear here automatically.</p>
          </div>
        ) : (
          events.map((event, i) => {
            const actionColor = getActionColor(event.action);
            const isExpanded = expandedEvent === event.id;
            return (
              <motion.div key={event.id} initial={{ opacity: 0, y: 3 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: i * 0.02 }}>
                <div onClick={() => setExpandedEvent(isExpanded ? null : event.id)} className="solid-card px-4 py-3 flex items-center gap-3 cursor-pointer hover:border-[var(--border-medium)] transition-all">
                  {/* Timeline dot */}
                  <div className="w-2 h-2 rounded-full flex-shrink-0" style={{ background: actionColor }} />

                  {/* Content */}
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2">
                      <span className="text-xs font-semibold" style={{ color: actionColor }}>{event.action}</span>
                      <span className="text-[10px] px-1.5 py-0.5 bg-[var(--bg-elevated)] rounded text-[var(--text-muted)] font-mono">{event.resource_type}</span>
                      {event.resource_id && <span className="text-[10px] text-[var(--text-muted)] font-mono truncate max-w-[120px]">{event.resource_id}</span>}
                    </div>
                  </div>

                  {/* Metadata */}
                  <div className="flex items-center gap-3 text-[10px] text-[var(--text-muted)]">
                    {event.user_id && <span className="font-mono truncate max-w-[100px]">{event.user_id}</span>}
                    <span className="flex items-center gap-1 flex-shrink-0"><Clock className="w-3 h-3" /> {new Date(event.timestamp).toLocaleString()}</span>
                    <ChevronDown className={`w-3.5 h-3.5 transition-transform ${isExpanded ? "rotate-180" : ""}`} />
                  </div>
                </div>

                {/* Expanded Details */}
                {isExpanded && (
                  <motion.div initial={{ height: 0 }} animate={{ height: "auto" }} className="overflow-hidden">
                    <div className="mx-4 mb-2 p-3 bg-[var(--bg-elevated)] rounded-b-[var(--radius-md)] border border-t-0 border-[var(--border-subtle)]">
                      <div className="grid grid-cols-1 md:grid-cols-2 gap-3 text-xs">
                        {event.details && Object.keys(event.details).length > 0 && (
                          <div>
                            <span className="text-[10px] font-semibold text-[var(--text-muted)] uppercase">Details</span>
                            <pre className="mt-1 text-[11px] font-mono text-[var(--text-secondary)] bg-[var(--bg-inset)] p-2 rounded overflow-x-auto">{JSON.stringify(event.details, null, 2)}</pre>
                          </div>
                        )}
                        {event.previous_state && (
                          <div>
                            <span className="text-[10px] font-semibold text-[var(--accent-rose)] uppercase">Previous State</span>
                            <pre className="mt-1 text-[11px] font-mono text-[var(--text-secondary)] bg-[var(--bg-inset)] p-2 rounded overflow-x-auto">{JSON.stringify(event.previous_state, null, 2)}</pre>
                          </div>
                        )}
                        {event.new_state && (
                          <div>
                            <span className="text-[10px] font-semibold text-[var(--accent-emerald)] uppercase">New State</span>
                            <pre className="mt-1 text-[11px] font-mono text-[var(--text-secondary)] bg-[var(--bg-inset)] p-2 rounded overflow-x-auto">{JSON.stringify(event.new_state, null, 2)}</pre>
                          </div>
                        )}
                        {event.ip_address && <div className="text-[10px] text-[var(--text-muted)]">IP: {event.ip_address}</div>}
                        {event.reason && <div className="text-[10px] text-[var(--text-muted)]">Reason: {event.reason}</div>}
                      </div>
                    </div>
                  </motion.div>
                )}
              </motion.div>
            );
          })
        )}
      </div>

      {/* Pagination info */}
      {total > 0 && (
        <div className="text-center text-[11px] text-[var(--text-muted)]">
          Showing {events.length} of {total.toLocaleString()} events
        </div>
      )}
    </div>
  );
}
