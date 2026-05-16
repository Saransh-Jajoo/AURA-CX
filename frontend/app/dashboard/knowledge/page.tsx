"use client";

import React, { useState, useEffect, useCallback } from "react";
import { motion, AnimatePresence } from "framer-motion";
import {
  Brain, FileText, Plus, Search, Trash2, Edit3, Archive, Eye,
  BookOpen, AlertCircle, CheckCircle2, ChevronDown, Tag, RefreshCw,
} from "lucide-react";
import { fetchKBDocuments, createKBDocument, archiveKBDocument, fetchKBGaps } from "@/lib/api";
import type { KBDocument, KBGap } from "@/lib/types";

const DOC_TYPE_ICONS: Record<string, React.ReactNode> = {
  article: <FileText className="w-4 h-4" />,
  faq: <BookOpen className="w-4 h-4" />,
  sop: <Brain className="w-4 h-4" />,
  policy: <AlertCircle className="w-4 h-4" />,
};

export default function KnowledgeBasePage() {
  const [docs, setDocs] = useState<KBDocument[]>([]);
  const [categories, setCategories] = useState<Record<string, number>>({});
  const [gaps, setGaps] = useState<KBGap[]>([]);
  const [activeCategory, setActiveCategory] = useState<string>("all");
  const [loading, setLoading] = useState(true);
  const [showCreate, setShowCreate] = useState(false);
  const [showGaps, setShowGaps] = useState(false);
  const [search, setSearch] = useState("");
  const [total, setTotal] = useState(0);
  const [unresolvedGaps, setUnresolvedGaps] = useState(0);

  // Form state
  const [formTitle, setFormTitle] = useState("");
  const [formBody, setFormBody] = useState("");
  const [formCategory, setFormCategory] = useState("general");
  const [formType, setFormType] = useState("article");
  const [creating, setCreating] = useState(false);

  const loadDocs = useCallback(async () => {
    setLoading(true);
    try {
      const params: Record<string, string> = {};
      if (activeCategory !== "all") params.category = activeCategory;
      const result = await fetchKBDocuments(params);
      setDocs(result.documents || []);
      setCategories(result.categories || {});
      setTotal(result.total || 0);
    } catch { /* ignore */ }
    setLoading(false);
  }, [activeCategory]);

  const loadGaps = useCallback(async () => {
    try {
      const result = await fetchKBGaps(false);
      setGaps(result.gaps || []);
      setUnresolvedGaps(result.unresolved_count || 0);
    } catch { /* ignore */ }
  }, []);

  useEffect(() => { loadDocs(); loadGaps(); }, [loadDocs, loadGaps]);

  const handleCreate = async () => {
    if (!formTitle.trim() || !formBody.trim()) return;
    setCreating(true);
    try {
      await createKBDocument({ title: formTitle, body: formBody, category: formCategory, doc_type: formType });
      setFormTitle(""); setFormBody(""); setFormCategory("general"); setFormType("article");
      setShowCreate(false);
      await loadDocs();
    } catch { /* ignore */ }
    setCreating(false);
  };

  const handleArchive = async (id: string) => {
    try {
      await archiveKBDocument(id);
      await loadDocs();
    } catch { /* ignore */ }
  };

  const filteredDocs = docs.filter(d =>
    !search || d.title.toLowerCase().includes(search.toLowerCase()) || d.category.toLowerCase().includes(search.toLowerCase())
  );

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-display font-bold tracking-tight">Knowledge Base</h1>
          <p className="text-sm text-[var(--text-muted)] mt-1">Manage, version, and vectorize your support knowledge corpus</p>
        </div>
        <div className="flex items-center gap-2">
          <button onClick={() => setShowGaps(!showGaps)} className={`relative flex items-center gap-1.5 px-3 py-2 rounded-[var(--radius-md)] text-xs font-semibold transition-all ${showGaps ? "bg-[var(--accent-rose)]/10 text-[var(--accent-rose)] border border-[var(--accent-rose)]/20" : "bg-[var(--bg-elevated)] text-[var(--text-secondary)] border border-[var(--border-subtle)] hover:bg-[var(--bg-card-hover)]"}`}>
            <AlertCircle className="w-3.5 h-3.5" />
            KB Gaps
            {unresolvedGaps > 0 && (
              <span className="ml-1 px-1.5 py-0.5 bg-[var(--accent-rose)] text-white text-[10px] font-bold rounded-full">{unresolvedGaps}</span>
            )}
          </button>
          <button onClick={() => setShowCreate(true)} className="flex items-center gap-1.5 px-4 py-2 bg-[var(--accent-primary)] text-white rounded-[var(--radius-md)] text-xs font-semibold hover:opacity-90 transition-all">
            <Plus className="w-3.5 h-3.5" /> New Document
          </button>
        </div>
      </div>

      {/* Stats Bar */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        {[
          { label: "Total Documents", value: total, icon: FileText, color: "var(--accent-primary)" },
          { label: "Categories", value: Object.keys(categories).length, icon: Tag, color: "var(--accent-teal)" },
          { label: "Active Articles", value: docs.filter(d => d.status === "active").length, icon: CheckCircle2, color: "var(--accent-emerald)" },
          { label: "Unresolved Gaps", value: unresolvedGaps, icon: AlertCircle, color: "var(--accent-rose)" },
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

      {/* Category Filter + Search */}
      <div className="flex items-center gap-3 flex-wrap">
        <div className="flex items-center gap-1 p-1 bg-[var(--bg-elevated)] rounded-[var(--radius-md)] border border-[var(--border-subtle)]">
          <button onClick={() => setActiveCategory("all")} className={`px-3 py-1.5 rounded-[var(--radius-sm)] text-xs font-semibold transition-all ${activeCategory === "all" ? "bg-[var(--accent-primary)] text-white" : "text-[var(--text-muted)] hover:text-[var(--text-primary)]"}`}>
            All
          </button>
          {Object.entries(categories).map(([cat, count]) => (
            <button key={cat} onClick={() => setActiveCategory(cat)} className={`px-3 py-1.5 rounded-[var(--radius-sm)] text-xs font-semibold transition-all ${activeCategory === cat ? "bg-[var(--accent-primary)] text-white" : "text-[var(--text-muted)] hover:text-[var(--text-primary)]"}`}>
              {cat} ({count})
            </button>
          ))}
        </div>
        <div className="flex-1 min-w-[200px] relative">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-[var(--text-muted)]" />
          <input value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Search documents..." className="w-full pl-9 pr-3 py-2 text-xs bg-[var(--bg-elevated)] border border-[var(--border-subtle)] rounded-[var(--radius-md)] text-[var(--text-primary)] placeholder:text-[var(--text-muted)] focus:border-[var(--accent-primary)] transition-all" />
        </div>
        <button onClick={loadDocs} className="p-2 rounded-[var(--radius-md)] text-[var(--text-muted)] hover:text-[var(--text-primary)] hover:bg-[var(--bg-card-hover)] transition-all">
          <RefreshCw className={`w-4 h-4 ${loading ? "animate-spin" : ""}`} />
        </button>
      </div>

      {/* KB Gaps Panel */}
      <AnimatePresence>
        {showGaps && gaps.length > 0 && (
          <motion.div initial={{ opacity: 0, height: 0 }} animate={{ opacity: 1, height: "auto" }} exit={{ opacity: 0, height: 0 }} className="overflow-hidden">
            <div className="solid-card p-4 border-l-4 border-l-[var(--accent-rose)]">
              <h3 className="text-sm font-bold mb-3 flex items-center gap-2"><AlertCircle className="w-4 h-4 text-[var(--accent-rose)]" /> Knowledge Gaps Detected</h3>
              <div className="space-y-2 max-h-48 overflow-y-auto">
                {gaps.map(gap => (
                  <div key={gap.id} className="flex items-center justify-between px-3 py-2 rounded-[var(--radius-sm)] bg-[var(--bg-elevated)] text-xs">
                    <div className="flex-1">
                      <span className="text-[var(--text-primary)] font-medium">{gap.query}</span>
                      {gap.suggested_topic && <span className="ml-2 text-[var(--accent-primary)]">→ {gap.suggested_topic}</span>}
                    </div>
                    <div className="flex items-center gap-2">
                      <span className="font-mono text-[var(--accent-rose)]">{(gap.ai_confidence * 100).toFixed(0)}%</span>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Document List */}
      <div className="space-y-2">
        {loading ? (
          <div className="space-y-2">{Array.from({ length: 5 }).map((_, i) => <div key={i} className="skeleton h-16 rounded-[var(--radius-md)]" />)}</div>
        ) : filteredDocs.length === 0 ? (
          <div className="solid-card p-12 text-center">
            <Brain className="w-10 h-10 mx-auto mb-3 text-[var(--text-muted)]" />
            <p className="text-sm text-[var(--text-muted)]">No documents found. Create your first KB article to enhance AI responses.</p>
          </div>
        ) : (
          filteredDocs.map((doc, i) => (
            <motion.div key={doc.id} initial={{ opacity: 0, y: 4 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: i * 0.03 }} className="solid-card p-4 flex items-center gap-4 hover:border-[var(--border-medium)] transition-all group">
              <div className="w-10 h-10 rounded-[var(--radius-md)] bg-[var(--accent-primary)]/10 flex items-center justify-center text-[var(--accent-primary)]">
                {DOC_TYPE_ICONS[doc.doc_type] || <FileText className="w-4 h-4" />}
              </div>
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2">
                  <h3 className="text-sm font-semibold truncate">{doc.title}</h3>
                  <span className="tag-badge tag-intent">{doc.category}</span>
                  <span className="text-[10px] text-[var(--text-muted)] font-mono">v{doc.version}</span>
                </div>
                <div className="flex items-center gap-3 mt-1 text-[10px] text-[var(--text-muted)]">
                  <span>{doc.doc_type}</span>
                  <span>•</span>
                  <span>{doc.chunk_count} chunks</span>
                  <span>•</span>
                  <span>{new Date(doc.updated_at).toLocaleDateString()}</span>
                  {doc.last_indexed_at && <><span>•</span><span className="text-[var(--accent-emerald)]">Indexed</span></>}
                </div>
              </div>
              <div className="flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
                <button className="p-1.5 rounded-[var(--radius-sm)] text-[var(--text-muted)] hover:text-[var(--accent-primary)] hover:bg-[var(--bg-card-hover)]"><Eye className="w-3.5 h-3.5" /></button>
                <button className="p-1.5 rounded-[var(--radius-sm)] text-[var(--text-muted)] hover:text-[var(--accent-primary)] hover:bg-[var(--bg-card-hover)]"><Edit3 className="w-3.5 h-3.5" /></button>
                <button onClick={() => handleArchive(doc.id)} className="p-1.5 rounded-[var(--radius-sm)] text-[var(--text-muted)] hover:text-[var(--accent-rose)] hover:bg-[var(--accent-rose)]/10"><Archive className="w-3.5 h-3.5" /></button>
              </div>
            </motion.div>
          ))
        )}
      </div>

      {/* Create Document Modal */}
      <AnimatePresence>
        {showCreate && (
          <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} className="fixed inset-0 z-50 flex items-center justify-center bg-[var(--overlay)]" onClick={() => setShowCreate(false)}>
            <motion.div initial={{ scale: 0.95, y: 10 }} animate={{ scale: 1, y: 0 }} exit={{ scale: 0.95, y: 10 }} onClick={(e) => e.stopPropagation()} className="w-full max-w-xl bg-[var(--bg-secondary)] rounded-[var(--radius-xl)] border border-[var(--border-subtle)] shadow-2xl overflow-hidden">
              <div className="p-5 border-b border-[var(--border-subtle)]">
                <h2 className="text-lg font-display font-bold">Create Knowledge Document</h2>
                <p className="text-xs text-[var(--text-muted)] mt-1">Add a new article to the AI knowledge corpus</p>
              </div>
              <div className="p-5 space-y-4">
                <div>
                  <label className="text-xs font-semibold text-[var(--text-secondary)] mb-1 block">Title</label>
                  <input value={formTitle} onChange={(e) => setFormTitle(e.target.value)} placeholder="e.g., Refund Policy for Premium Users" className="w-full px-3 py-2 text-sm bg-[var(--bg-elevated)] border border-[var(--border-subtle)] rounded-[var(--radius-md)] text-[var(--text-primary)]" />
                </div>
                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <label className="text-xs font-semibold text-[var(--text-secondary)] mb-1 block">Category</label>
                    <select value={formCategory} onChange={(e) => setFormCategory(e.target.value)} className="w-full px-3 py-2 text-sm bg-[var(--bg-elevated)] border border-[var(--border-subtle)] rounded-[var(--radius-md)] text-[var(--text-primary)]">
                      <option value="general">General</option>
                      <option value="billing">Billing</option>
                      <option value="technical">Technical</option>
                      <option value="shipping">Shipping</option>
                      <option value="product">Product</option>
                      <option value="policy">Policy</option>
                    </select>
                  </div>
                  <div>
                    <label className="text-xs font-semibold text-[var(--text-secondary)] mb-1 block">Type</label>
                    <select value={formType} onChange={(e) => setFormType(e.target.value)} className="w-full px-3 py-2 text-sm bg-[var(--bg-elevated)] border border-[var(--border-subtle)] rounded-[var(--radius-md)] text-[var(--text-primary)]">
                      <option value="article">Article</option>
                      <option value="faq">FAQ</option>
                      <option value="sop">SOP</option>
                      <option value="policy">Policy</option>
                    </select>
                  </div>
                </div>
                <div>
                  <label className="text-xs font-semibold text-[var(--text-secondary)] mb-1 block">Content</label>
                  <textarea value={formBody} onChange={(e) => setFormBody(e.target.value)} rows={8} placeholder="Write the knowledge article content..." className="w-full px-3 py-2 text-sm bg-[var(--bg-elevated)] border border-[var(--border-subtle)] rounded-[var(--radius-md)] text-[var(--text-primary)] resize-none" />
                </div>
              </div>
              <div className="p-5 border-t border-[var(--border-subtle)] flex items-center justify-end gap-2">
                <button onClick={() => setShowCreate(false)} className="px-4 py-2 text-xs font-semibold text-[var(--text-secondary)] hover:text-[var(--text-primary)] bg-[var(--bg-elevated)] border border-[var(--border-subtle)] rounded-[var(--radius-md)]">Cancel</button>
                <button onClick={handleCreate} disabled={creating || !formTitle.trim() || !formBody.trim()} className="px-4 py-2 text-xs font-semibold text-white bg-[var(--accent-primary)] rounded-[var(--radius-md)] hover:opacity-90 disabled:opacity-50 transition-all flex items-center gap-1.5">
                  {creating ? <RefreshCw className="w-3.5 h-3.5 animate-spin" /> : <Plus className="w-3.5 h-3.5" />}
                  {creating ? "Embedding..." : "Create & Embed"}
                </button>
              </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
