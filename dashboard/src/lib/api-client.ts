import type {
  BotConfig,
  StatsSnapshot,
  LogEntry,
  Post,
  NewsSource,
  WsServerEvent,
} from "../../../shared/types";

const BASE = "http://localhost:3000";

function buildQuery(params?: Record<string, string | number | undefined | null>): string {
  if (!params) return "";
  const entries = Object.entries(params).filter(([, v]) => v !== undefined && v !== null);
  if (!entries.length) return "";
  return "?" + new URLSearchParams(entries.map(([k, v]) => [k, String(v)])).toString();
}

async function apiFetch<T>(path: string, init?: RequestInit): Promise<T> {
  const res = await fetch(`${BASE}${path}`, {
    ...init,
    headers: { "Content-Type": "application/json", ...init?.headers },
  });
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  const json = await res.json();
  if (json.error) throw new Error(json.error.message);
  return json.data as T;
}

export const api = {
  getStats: () => apiFetch<StatsSnapshot>("/api/stats"),
  getConfig: () => apiFetch<BotConfig>("/api/config"),
  patchConfig: (patch: Partial<BotConfig>) =>
    apiFetch<BotConfig>("/api/config", { method: "PATCH", body: JSON.stringify(patch) }),
  getPosts: (params?: { type?: string; limit?: number; offset?: number }) => {
    const qs = buildQuery(params);
    return apiFetch<Post[]>(`/api/posts${qs}`);
  },
  getLogs: (params?: { level?: string; limit?: number; offset?: number }) => {
    const qs = buildQuery(params);
    return apiFetch<LogEntry[]>(`/api/logs${qs}`);
  },
  clearLogs: () => apiFetch<void>("/api/logs", { method: "DELETE" }),
  clearPosts: () => apiFetch<void>("/api/posts", { method: "DELETE" }),
  getNewsSources: () => apiFetch<NewsSource[]>("/api/news-sources"),
  addNewsSource: (src: Omit<NewsSource, "id" | "last_fetch" | "created_at">) =>
    apiFetch<NewsSource>("/api/news-sources", { method: "POST", body: JSON.stringify(src) }),
  updateNewsSource: (id: number, patch: Partial<NewsSource>) =>
    apiFetch<NewsSource>(`/api/news-sources/${id}`, { method: "PATCH", body: JSON.stringify(patch) }),
  deleteNewsSource: (id: number) =>
    apiFetch<void>(`/api/news-sources/${id}`, { method: "DELETE" }),
  schedulerStart: () => apiFetch<void>("/api/scheduler/start", { method: "POST" }),
  schedulerStop: () => apiFetch<void>("/api/scheduler/stop", { method: "POST" }),
  triggerPost: () => apiFetch<void>("/api/actions/post", { method: "POST" }),
  triggerRead: () => apiFetch<void>("/api/actions/read-timeline", { method: "POST" }),
};

type WsCallback = (event: WsServerEvent) => void;

class WsClient {
  private ws: WebSocket | null = null;
  private listeners: WsCallback[] = [];
  private retryTimer: ReturnType<typeof setTimeout> | null = null;
  private retryDelay = 2000;
  connected = false;

  connect() {
    if (this.ws) return;
    try {
      this.ws = new WebSocket("ws://localhost:3000/ws");
      this.ws.onopen = () => {
        this.connected = true;
        this.retryDelay = 2000;
        this.ws!.send(JSON.stringify({ type: "subscribe", channels: ["logs", "stats", "posts"] }));
        this.notifyListeners({ type: "scheduler_status", data: { connected: true } } as any);
      };
      this.ws.onmessage = (e) => {
        try {
          const event = JSON.parse(e.data) as WsServerEvent;
          this.notifyListeners(event);
        } catch {}
      };
      this.ws.onclose = () => {
        this.connected = false;
        this.ws = null;
        this.notifyListeners({ type: "scheduler_status", data: { connected: false } } as any);
        this.scheduleRetry();
      };
      this.ws.onerror = () => {
        this.ws?.close();
      };
    } catch {
      this.scheduleRetry();
    }
  }

  disconnect() {
    if (this.retryTimer) clearTimeout(this.retryTimer);
    this.ws?.close();
    this.ws = null;
  }

  private scheduleRetry() {
    this.retryTimer = setTimeout(() => {
      this.retryDelay = Math.min(this.retryDelay * 1.5, 30000);
      this.connect();
    }, this.retryDelay);
  }

  private notifyListeners(event: WsServerEvent) {
    this.listeners.forEach((cb) => cb(event));
  }

  subscribe(cb: WsCallback) {
    this.listeners.push(cb);
    return () => {
      this.listeners = this.listeners.filter((l) => l !== cb);
    };
  }
}

export const wsClient = new WsClient();
