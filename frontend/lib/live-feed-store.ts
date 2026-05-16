"use client";

import { create } from "zustand";
import type { KPIMetrics, Ticket, WSMessage } from "./types";

type ConnectionState = "connecting" | "connected" | "disconnected";

interface LiveFeedState {
  tickets: Ticket[];
  kpis: KPIMetrics | null;
  connectionState: ConnectionState;
  setTickets: (tickets: Ticket[]) => void;
  upsertTicket: (ticket: Ticket) => void;
  setKpis: (kpis: KPIMetrics) => void;
  setConnectionState: (state: ConnectionState) => void;
  applyMessage: (message: WSMessage) => void;
}

export const useLiveFeedStore = create<LiveFeedState>((set) => ({
  tickets: [],
  kpis: null,
  connectionState: "disconnected",
  setTickets: (tickets) => set({ tickets }),
  upsertTicket: (ticket) =>
    set((state) => {
      const withoutCurrent = state.tickets.filter((item) => item.id !== ticket.id);
      return { tickets: [ticket, ...withoutCurrent].slice(0, 250) };
    }),
  setKpis: (kpis) => set({ kpis }),
  setConnectionState: (connectionState) => set({ connectionState }),
  applyMessage: (message) =>
    set((state) => {
      if (message.type === "ticket_batch") return { tickets: message.tickets };
      if (message.type === "new_ticket" || message.type === "ticket_updated") {
        const withoutCurrent = state.tickets.filter((item) => item.id !== message.ticket.id);
        return { tickets: [message.ticket, ...withoutCurrent].slice(0, 250) };
      }
      if (message.type === "kpi_update") return { kpis: message.kpis };
      return state;
    }),
}));

