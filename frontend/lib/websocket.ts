import { getWSUrl } from "./api";
import type { WSMessage } from "./types";

type ConnectionState = "connecting" | "connected" | "disconnected";
type MessageHandler = (msg: WSMessage) => void;
type StateHandler = (state: ConnectionState) => void;

export class AuraWebSocket {
  private ws: WebSocket | null = null;
  private reconnectAttempts = 0;
  private readonly maxReconnectAttempts = 12;
  private readonly baseDelay = 1000;
  private readonly maxDelay = 30000;
  private pingInterval: ReturnType<typeof setInterval> | null = null;
  private reconnectTimeout: ReturnType<typeof setTimeout> | null = null;
  private messageHandlers: Set<MessageHandler> = new Set();
  private stateHandlers: Set<StateHandler> = new Set();
  private destroyed = false;
  private _state: ConnectionState = "disconnected";

  get state(): ConnectionState {
    return this._state;
  }

  private setState(state: ConnectionState) {
    this._state = state;
    this.stateHandlers.forEach((handler) => handler(state));
  }

  connect() {
    if (this.destroyed) return;
    this.setState("connecting");

    try {
      this.ws = new WebSocket(getWSUrl());
    } catch {
      this.scheduleReconnect();
      return;
    }

    this.ws.onopen = () => {
      this.setState("connected");
      this.reconnectAttempts = 0;
      this.startPing();
    };

    this.ws.onmessage = (evt) => {
      try {
        const data = JSON.parse(evt.data) as WSMessage;
        if (data.type === "pong") return;
        this.messageHandlers.forEach((handler) => handler(data));
      } catch {
        // Drop malformed frames.
      }
    };

    this.ws.onclose = () => {
      this.stopPing();
      this.setState("disconnected");
      if (!this.destroyed) this.scheduleReconnect();
    };

    this.ws.onerror = () => {
      this.ws?.close();
    };
  }

  private scheduleReconnect() {
    if (this.destroyed || this.reconnectAttempts >= this.maxReconnectAttempts) return;
    const jitter = Math.floor(Math.random() * 300);
    const delay = Math.min(this.baseDelay * 2 ** this.reconnectAttempts + jitter, this.maxDelay);
    this.reconnectAttempts += 1;
    this.reconnectTimeout = setTimeout(() => this.connect(), delay);
  }

  private startPing() {
    this.stopPing();
    this.pingInterval = setInterval(() => {
      if (this.ws?.readyState === WebSocket.OPEN) {
        this.ws.send("ping");
      }
    }, 25000);
  }

  private stopPing() {
    if (this.pingInterval) {
      clearInterval(this.pingInterval);
      this.pingInterval = null;
    }
  }

  onMessage(handler: MessageHandler) {
    this.messageHandlers.add(handler);
    return () => this.messageHandlers.delete(handler);
  }

  onStateChange(handler: StateHandler) {
    this.stateHandlers.add(handler);
    return () => this.stateHandlers.delete(handler);
  }

  destroy() {
    this.destroyed = true;
    this.stopPing();
    if (this.reconnectTimeout) clearTimeout(this.reconnectTimeout);
    this.ws?.close();
    this.messageHandlers.clear();
    this.stateHandlers.clear();
  }
}

