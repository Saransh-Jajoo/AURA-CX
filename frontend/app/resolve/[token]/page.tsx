"use client";

import React, { useState, useEffect, useRef, useCallback } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { Send, Shield, CheckCircle2, Star, MessageCircle, AlertCircle, Loader2 } from "lucide-react";
import { fetchCustomerThread, customerSendMessage, submitCSAT } from "@/lib/api";
import type { CustomerThreadState, TicketMessage } from "@/lib/types";

const POLL_INTERVAL = 5000;

function MessageBubble({ msg }: { msg: TicketMessage }) {
  const isCustomer = msg.sender_role === "customer";
  const isSystem = msg.sender_role === "system";
  const time = new Date(msg.created_at).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });

  if (isSystem) {
    return (
      <div className="flex justify-center my-3">
        <span className="text-xs text-slate-400 bg-slate-800/50 px-3 py-1 rounded-full border border-slate-700/50">
          {msg.content}
        </span>
      </div>
    );
  }

  return (
    <motion.div
      initial={{ opacity: 0, y: 8 }}
      animate={{ opacity: 1, y: 0 }}
      className={`flex ${isCustomer ? "justify-end" : "justify-start"} mb-3`}
    >
      {!isCustomer && (
        <div className="w-7 h-7 rounded-full bg-indigo-600 flex items-center justify-center text-white text-xs font-bold mr-2 mt-1 shrink-0">
          S
        </div>
      )}
      <div className={`max-w-[78%]`}>
        <div
          className={`px-4 py-2.5 rounded-2xl text-sm leading-relaxed ${
            isCustomer
              ? "bg-indigo-600 text-white rounded-br-sm"
              : "bg-slate-800 text-slate-100 rounded-bl-sm border border-slate-700/50"
          }`}
        >
          {msg.content}
        </div>
        <p className={`text-[10px] text-slate-500 mt-1 ${isCustomer ? "text-right" : "text-left"}`}>
          {isCustomer ? "You" : msg.sender_name} · {time}
        </p>
      </div>
    </motion.div>
  );
}

function CSATPanel({ token, onDone }: { token: string; onDone: () => void }) {
  const [hovered, setHovered] = useState(0);
  const [selected, setSelected] = useState(0);
  const [comment, setComment] = useState("");
  const [submitted, setSubmitted] = useState(false);
  const [loading, setLoading] = useState(false);

  const handleSubmit = async () => {
    if (!selected) return;
    setLoading(true);
    try {
      await submitCSAT(token, selected, comment);
      setSubmitted(true);
      setTimeout(onDone, 2000);
    } catch {
      setLoading(false);
    }
  };

  if (submitted) {
    return (
      <motion.div initial={{ scale: 0.9, opacity: 0 }} animate={{ scale: 1, opacity: 1 }} className="text-center py-6">
        <div className="text-4xl mb-3">🎉</div>
        <p className="text-white font-semibold">Thank you for your feedback!</p>
        <p className="text-slate-400 text-sm mt-1">Your rating helps us improve.</p>
      </motion.div>
    );
  }

  return (
    <div className="border-t border-slate-700/50 p-5 bg-slate-900/50">
      <p className="text-center text-sm font-medium text-slate-200 mb-4">How would you rate our support?</p>
      <div className="flex justify-center gap-2 mb-4">
        {[1, 2, 3, 4, 5].map((n) => (
          <button
            key={n}
            onMouseEnter={() => setHovered(n)}
            onMouseLeave={() => setHovered(0)}
            onClick={() => setSelected(n)}
            className="text-3xl transition-transform hover:scale-125 focus:outline-none"
          >
            <Star
              className={`w-8 h-8 transition-colors ${
                n <= (hovered || selected)
                  ? "fill-amber-400 text-amber-400"
                  : "text-slate-600"
              }`}
            />
          </button>
        ))}
      </div>
      {selected > 0 && (
        <motion.div initial={{ opacity: 0, height: 0 }} animate={{ opacity: 1, height: "auto" }}>
          <textarea
            value={comment}
            onChange={(e) => setComment(e.target.value)}
            placeholder="Any additional comments? (optional)"
            rows={2}
            className="w-full bg-slate-800 border border-slate-700 rounded-xl px-4 py-2.5 text-sm text-white placeholder-slate-500 resize-none focus:outline-none focus:border-indigo-500 mb-3"
          />
          <button
            onClick={handleSubmit}
            disabled={loading}
            className="w-full bg-indigo-600 hover:bg-indigo-500 text-white rounded-xl py-2.5 text-sm font-semibold transition-colors disabled:opacity-50 flex items-center justify-center gap-2"
          >
            {loading ? <Loader2 className="w-4 h-4 animate-spin" /> : null}
            Submit Rating
          </button>
        </motion.div>
      )}
    </div>
  );
}

export default function CustomerResolvePage({ params }: { params: { token: string } }) {
  const { token } = params;
  const [thread, setThread] = useState<CustomerThreadState | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [input, setInput] = useState("");
  const [sending, setSending] = useState(false);
  const [csatDone, setCsatDone] = useState(false);
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const lastMsgCount = useRef(0);

  const load = useCallback(async () => {
    try {
      const data = await fetchCustomerThread(token);
      setThread(data);
      if (data.messages.length !== lastMsgCount.current) {
        lastMsgCount.current = data.messages.length;
        setTimeout(() => messagesEndRef.current?.scrollIntoView({ behavior: "smooth" }), 100);
      }
    } catch {
      setError("This support thread was not found or has expired.");
    }
  }, [token]);

  useEffect(() => {
    load();
    const interval = setInterval(load, POLL_INTERVAL);
    return () => clearInterval(interval);
  }, [load]);

  const handleSend = async () => {
    if (!input.trim() || sending || !thread) return;
    const content = input.trim();
    setInput("");
    setSending(true);
    try {
      await customerSendMessage(token, content, thread.customer_name);
      await load();
    } catch {
      setInput(content);
    } finally {
      setSending(false);
    }
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      handleSend();
    }
  };

  if (error) {
    return (
      <div className="min-h-screen bg-slate-950 flex items-center justify-center p-4">
        <div className="text-center max-w-sm">
          <AlertCircle className="w-12 h-12 text-red-400 mx-auto mb-4" />
          <h1 className="text-white text-xl font-semibold mb-2">Thread Not Found</h1>
          <p className="text-slate-400 text-sm">{error}</p>
        </div>
      </div>
    );
  }

  if (!thread) {
    return (
      <div className="min-h-screen bg-slate-950 flex items-center justify-center">
        <Loader2 className="w-8 h-8 text-indigo-400 animate-spin" />
      </div>
    );
  }

  const showCSAT = thread.resolved && !thread.csat_collected && !csatDone;
  const isResolved = thread.resolved;

  return (
    <div className="min-h-screen bg-slate-950 flex flex-col" style={{ fontFamily: "'Inter', -apple-system, sans-serif" }}>
      {/* Header */}
      <div className="bg-slate-900 border-b border-slate-800 px-4 py-4">
        <div className="max-w-lg mx-auto flex items-center gap-3">
          <div className="w-9 h-9 rounded-xl bg-indigo-600/20 border border-indigo-500/30 flex items-center justify-center">
            <Shield className="w-5 h-5 text-indigo-400" />
          </div>
          <div>
            <h1 className="text-white font-semibold text-sm">Secure Support Thread</h1>
            <p className="text-slate-500 text-xs">Private conversation · Not visible on social media</p>
          </div>
          {isResolved && (
            <div className="ml-auto flex items-center gap-1.5 bg-emerald-500/10 border border-emerald-500/20 rounded-full px-3 py-1">
              <CheckCircle2 className="w-3.5 h-3.5 text-emerald-400" />
              <span className="text-emerald-400 text-xs font-medium">Resolved</span>
            </div>
          )}
        </div>
      </div>

      {/* Complaint summary */}
      <div className="max-w-lg mx-auto w-full px-4 pt-4">
        <div className="bg-slate-800/50 border border-slate-700/50 rounded-2xl p-4">
          <div className="flex items-center gap-2 mb-2">
            <MessageCircle className="w-4 h-4 text-slate-400" />
            <span className="text-xs text-slate-400 font-medium uppercase tracking-wide">Your complaint</span>
          </div>
          <p className="text-slate-200 text-sm leading-relaxed">{thread.complaint_summary}</p>
        </div>

        {/* Resolution banner */}
        <AnimatePresence>
          {isResolved && thread.resolution_note && (
            <motion.div
              initial={{ opacity: 0, y: -8 }}
              animate={{ opacity: 1, y: 0 }}
              className="mt-3 bg-emerald-500/10 border border-emerald-500/20 rounded-2xl p-4"
            >
              <div className="flex items-center gap-2 mb-1.5">
                <CheckCircle2 className="w-4 h-4 text-emerald-400" />
                <span className="text-emerald-400 text-xs font-semibold uppercase tracking-wide">Issue Resolved</span>
              </div>
              <p className="text-slate-200 text-sm leading-relaxed">{thread.resolution_note}</p>
            </motion.div>
          )}
        </AnimatePresence>
      </div>

      {/* Chat messages */}
      <div className="flex-1 overflow-y-auto px-4 py-4 max-w-lg mx-auto w-full">
        {thread.messages.length === 0 ? (
          <div className="text-center text-slate-500 text-sm mt-8">
            <Shield className="w-8 h-8 mx-auto mb-3 text-slate-700" />
            Our support team will reply here shortly.
          </div>
        ) : (
          thread.messages.map((msg) => <MessageBubble key={msg.id} msg={msg} />)
        )}
        <div ref={messagesEndRef} />
      </div>

      {/* CSAT */}
      {showCSAT && (
        <div className="max-w-lg mx-auto w-full">
          <CSATPanel token={token} onDone={() => setCsatDone(true)} />
        </div>
      )}

      {/* Input */}
      {!isResolved && (
        <div className="border-t border-slate-800 bg-slate-900 px-4 py-3">
          <div className="max-w-lg mx-auto flex items-end gap-3">
            <textarea
              value={input}
              onChange={(e) => setInput(e.target.value)}
              onKeyDown={handleKeyDown}
              placeholder="Reply to your support agent…"
              rows={2}
              className="flex-1 bg-slate-800 border border-slate-700 rounded-xl px-4 py-2.5 text-sm text-white placeholder-slate-500 resize-none focus:outline-none focus:border-indigo-500 transition-colors"
            />
            <button
              onClick={handleSend}
              disabled={!input.trim() || sending}
              className="w-10 h-10 bg-indigo-600 hover:bg-indigo-500 disabled:opacity-40 text-white rounded-xl flex items-center justify-center transition-colors shrink-0"
            >
              {sending ? <Loader2 className="w-4 h-4 animate-spin" /> : <Send className="w-4 h-4" />}
            </button>
          </div>
          <p className="text-center text-[10px] text-slate-600 mt-2">
            🔒 This conversation is private and encrypted
          </p>
        </div>
      )}

      {isResolved && !showCSAT && (
        <div className="border-t border-slate-800 bg-slate-900 px-4 py-4 text-center">
          <p className="text-slate-500 text-sm">This conversation is closed. Thank you!</p>
        </div>
      )}
    </div>
  );
}
