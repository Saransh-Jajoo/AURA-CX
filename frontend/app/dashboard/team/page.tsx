"use client";

import React, { useState, useEffect, useCallback } from "react";
import { motion, AnimatePresence } from "framer-motion";
import {
  Users, UserPlus, Mail, Shield, Clock, MoreHorizontal,
  CheckCircle2, XCircle, RefreshCw, Copy, ExternalLink,
} from "lucide-react";
import { fetchTeamMembers, inviteTeamMember, fetchTeamInvitations, updateTeamMember, suspendTeamMember } from "@/lib/api";
import type { TeamMember, TeamInvitation } from "@/lib/types";

const ROLE_LABELS: Record<string, { label: string; color: string }> = {
  super_admin: { label: "Super Admin", color: "var(--accent-rose)" },
  tenant_admin: { label: "Admin", color: "var(--accent-primary)" },
  executive: { label: "Executive", color: "var(--accent-secondary)" },
  qa_reviewer: { label: "QA Reviewer", color: "var(--accent-teal)" },
  support_agent: { label: "Support Agent", color: "var(--accent-emerald)" },
};

export default function TeamPage() {
  const [members, setMembers] = useState<TeamMember[]>([]);
  const [invitations, setInvitations] = useState<TeamInvitation[]>([]);
  const [loading, setLoading] = useState(true);
  const [showInvite, setShowInvite] = useState(false);
  const [tab, setTab] = useState<"members" | "invitations">("members");

  // Invite form
  const [invEmail, setInvEmail] = useState("");
  const [invRole, setInvRole] = useState("support_agent");
  const [inviting, setInviting] = useState(false);
  const [inviteLink, setInviteLink] = useState("");

  const loadData = useCallback(async () => {
    setLoading(true);
    try {
      const [memberRes, invRes] = await Promise.all([fetchTeamMembers(), fetchTeamInvitations()]);
      setMembers(memberRes.members || []);
      setInvitations(invRes.invitations || []);
    } catch { /* ignore */ }
    setLoading(false);
  }, []);

  useEffect(() => { loadData(); }, [loadData]);

  const handleInvite = async () => {
    if (!invEmail.trim()) return;
    setInviting(true);
    try {
      const result = await inviteTeamMember({ email: invEmail, role: invRole });
      setInviteLink(result.invite_link || "");
      setInvEmail("");
      await loadData();
    } catch { /* ignore */ }
    setInviting(false);
  };

  const handleSuspend = async (userId: string) => {
    try {
      await suspendTeamMember(userId);
      await loadData();
    } catch { /* ignore */ }
  };

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-display font-bold tracking-tight">Team Management</h1>
          <p className="text-sm text-[var(--text-muted)] mt-1">Invite members, manage roles, and control access</p>
        </div>
        <button onClick={() => setShowInvite(true)} className="flex items-center gap-1.5 px-4 py-2 bg-[var(--accent-primary)] text-white rounded-[var(--radius-md)] text-xs font-semibold hover:opacity-90 transition-all">
          <UserPlus className="w-3.5 h-3.5" /> Invite Member
        </button>
      </div>

      {/* Stats */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        {[
          { label: "Total Members", value: members.length, icon: Users, color: "var(--accent-primary)" },
          { label: "Active", value: members.filter(m => m.active).length, icon: CheckCircle2, color: "var(--accent-emerald)" },
          { label: "Pending Invites", value: invitations.filter(i => !i.accepted).length, icon: Mail, color: "var(--accent-amber)" },
          { label: "Roles Used", value: new Set(members.map(m => m.role)).size, icon: Shield, color: "var(--accent-teal)" },
        ].map((s, i) => (
          <div key={i} className="solid-card p-4 flex items-center gap-3">
            <div className="w-9 h-9 rounded-[var(--radius-md)] flex items-center justify-center" style={{ background: `${s.color}15` }}>
              <s.icon className="w-4 h-4" style={{ color: s.color }} />
            </div>
            <div>
              <div className="text-lg font-bold font-display">{s.value}</div>
              <div className="text-[11px] text-[var(--text-muted)]">{s.label}</div>
            </div>
          </div>
        ))}
      </div>

      {/* Tabs */}
      <div className="flex items-center gap-1 p-1 bg-[var(--bg-elevated)] rounded-[var(--radius-md)] border border-[var(--border-subtle)] w-fit">
        <button onClick={() => setTab("members")} className={`px-4 py-2 rounded-[var(--radius-sm)] text-xs font-semibold transition-all ${tab === "members" ? "bg-[var(--accent-primary)] text-white" : "text-[var(--text-muted)]"}`}>
          Members ({members.length})
        </button>
        <button onClick={() => setTab("invitations")} className={`px-4 py-2 rounded-[var(--radius-sm)] text-xs font-semibold transition-all ${tab === "invitations" ? "bg-[var(--accent-primary)] text-white" : "text-[var(--text-muted)]"}`}>
          Invitations ({invitations.length})
        </button>
      </div>

      {/* Members List */}
      {tab === "members" && (
        <div className="space-y-2">
          {loading ? (
            Array.from({ length: 4 }).map((_, i) => <div key={i} className="skeleton h-16 rounded-[var(--radius-md)]" />)
          ) : members.length === 0 ? (
            <div className="solid-card p-12 text-center">
              <Users className="w-10 h-10 mx-auto mb-3 text-[var(--text-muted)]" />
              <p className="text-sm text-[var(--text-muted)]">No team members yet. Invite your first team member.</p>
            </div>
          ) : (
            members.map((member, i) => {
              const role = ROLE_LABELS[member.role] || { label: member.role, color: "var(--text-muted)" };
              return (
                <motion.div key={member.id} initial={{ opacity: 0, y: 4 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: i * 0.03 }} className="solid-card p-4 flex items-center gap-4 group">
                  <div className="w-10 h-10 rounded-full flex items-center justify-center text-sm font-bold" style={{ background: `${role.color}15`, color: role.color }}>
                    {member.avatar?.slice(0, 2) || "AU"}
                  </div>
                  <div className="flex-1">
                    <div className="flex items-center gap-2">
                      <span className="text-sm font-semibold">{member.name}</span>
                      {!member.active && <span className="text-[10px] px-1.5 py-0.5 bg-[var(--accent-rose)]/10 text-[var(--accent-rose)] rounded-full font-semibold">Suspended</span>}
                    </div>
                    <div className="flex items-center gap-3 mt-0.5 text-[11px] text-[var(--text-muted)]">
                      <span>{member.email}</span>
                      <span>•</span>
                      <span style={{ color: role.color }}>{role.label}</span>
                      {member.department && <><span>•</span><span>{member.department}</span></>}
                    </div>
                  </div>
                  <div className="flex items-center gap-2 text-[10px] text-[var(--text-muted)]">
                    {member.last_login && <span className="flex items-center gap-1"><Clock className="w-3 h-3" /> {new Date(member.last_login).toLocaleDateString()}</span>}
                  </div>
                  <div className="flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
                    {member.active && (
                      <button onClick={() => handleSuspend(member.id)} className="p-1.5 rounded-[var(--radius-sm)] text-[var(--text-muted)] hover:text-[var(--accent-rose)] hover:bg-[var(--accent-rose)]/10 text-[10px]">
                        <XCircle className="w-3.5 h-3.5" />
                      </button>
                    )}
                  </div>
                </motion.div>
              );
            })
          )}
        </div>
      )}

      {/* Invitations List */}
      {tab === "invitations" && (
        <div className="space-y-2">
          {invitations.length === 0 ? (
            <div className="solid-card p-12 text-center">
              <Mail className="w-10 h-10 mx-auto mb-3 text-[var(--text-muted)]" />
              <p className="text-sm text-[var(--text-muted)]">No pending invitations.</p>
            </div>
          ) : (
            invitations.map((inv, i) => (
              <motion.div key={inv.id} initial={{ opacity: 0, y: 4 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: i * 0.03 }} className="solid-card p-4 flex items-center gap-4">
                <div className="w-10 h-10 rounded-full bg-[var(--accent-amber)]/10 flex items-center justify-center text-[var(--accent-amber)]">
                  <Mail className="w-4 h-4" />
                </div>
                <div className="flex-1">
                  <div className="text-sm font-semibold">{inv.email}</div>
                  <div className="text-[11px] text-[var(--text-muted)]">
                    Role: {ROLE_LABELS[inv.role]?.label || inv.role} • Expires: {new Date(inv.expires_at).toLocaleDateString()}
                  </div>
                </div>
                <div>
                  {inv.accepted ? (
                    <span className="flex items-center gap-1 text-xs text-[var(--accent-emerald)] font-semibold"><CheckCircle2 className="w-3.5 h-3.5" /> Accepted</span>
                  ) : (
                    <span className="flex items-center gap-1 text-xs text-[var(--accent-amber)] font-semibold"><Clock className="w-3.5 h-3.5" /> Pending</span>
                  )}
                </div>
              </motion.div>
            ))
          )}
        </div>
      )}

      {/* Invite Modal */}
      <AnimatePresence>
        {showInvite && (
          <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} className="fixed inset-0 z-50 flex items-center justify-center bg-[var(--overlay)]" onClick={() => { setShowInvite(false); setInviteLink(""); }}>
            <motion.div initial={{ scale: 0.95, y: 10 }} animate={{ scale: 1, y: 0 }} exit={{ scale: 0.95, y: 10 }} onClick={(e) => e.stopPropagation()} className="w-full max-w-md bg-[var(--bg-secondary)] rounded-[var(--radius-xl)] border border-[var(--border-subtle)] shadow-2xl overflow-hidden">
              <div className="p-5 border-b border-[var(--border-subtle)]">
                <h2 className="text-lg font-display font-bold">Invite Team Member</h2>
                <p className="text-xs text-[var(--text-muted)] mt-1">Send a secure invite link via email</p>
              </div>
              <div className="p-5 space-y-4">
                <div>
                  <label className="text-xs font-semibold text-[var(--text-secondary)] mb-1 block">Email Address</label>
                  <input value={invEmail} onChange={(e) => setInvEmail(e.target.value)} placeholder="colleague@company.com" type="email" className="w-full px-3 py-2 text-sm bg-[var(--bg-elevated)] border border-[var(--border-subtle)] rounded-[var(--radius-md)] text-[var(--text-primary)]" />
                </div>
                <div>
                  <label className="text-xs font-semibold text-[var(--text-secondary)] mb-1 block">Role</label>
                  <select value={invRole} onChange={(e) => setInvRole(e.target.value)} className="w-full px-3 py-2 text-sm bg-[var(--bg-elevated)] border border-[var(--border-subtle)] rounded-[var(--radius-md)] text-[var(--text-primary)]">
                    <option value="support_agent">Support Agent</option>
                    <option value="qa_reviewer">QA Reviewer</option>
                    <option value="executive">Executive</option>
                    <option value="tenant_admin">Admin</option>
                  </select>
                </div>
                {inviteLink && (
                  <div className="p-3 bg-[var(--accent-emerald)]/10 border border-[var(--accent-emerald)]/20 rounded-[var(--radius-md)]">
                    <p className="text-xs font-semibold text-[var(--accent-emerald)] mb-1">Invitation Sent!</p>
                    <div className="flex items-center gap-2">
                      <code className="text-[11px] text-[var(--text-secondary)] truncate flex-1 font-mono">{inviteLink}</code>
                      <button onClick={() => navigator.clipboard.writeText(window.location.origin + inviteLink)} className="p-1 text-[var(--accent-primary)]"><Copy className="w-3.5 h-3.5" /></button>
                    </div>
                  </div>
                )}
              </div>
              <div className="p-5 border-t border-[var(--border-subtle)] flex items-center justify-end gap-2">
                <button onClick={() => { setShowInvite(false); setInviteLink(""); }} className="px-4 py-2 text-xs font-semibold text-[var(--text-secondary)] bg-[var(--bg-elevated)] border border-[var(--border-subtle)] rounded-[var(--radius-md)]">Close</button>
                <button onClick={handleInvite} disabled={inviting || !invEmail.trim()} className="px-4 py-2 text-xs font-semibold text-white bg-[var(--accent-primary)] rounded-[var(--radius-md)] hover:opacity-90 disabled:opacity-50 flex items-center gap-1.5">
                  {inviting ? <RefreshCw className="w-3.5 h-3.5 animate-spin" /> : <UserPlus className="w-3.5 h-3.5" />}
                  {inviting ? "Sending..." : "Send Invite"}
                </button>
              </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
