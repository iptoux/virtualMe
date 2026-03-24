// === Config ===
export interface BotConfig {
  poll_interval_minutes: number;
  ai_base_url: string;
  ai_model: string;
  ai_api_key: string;
  post_frequency_hours: number;
  reply_probability: number;
  max_posts_per_day: number;
  max_replies_per_day: number;
  active_hours_start: number; // 0-23
  active_hours_end: number; // 0-23
  max_tweet_length: number; // 280 standard, 4000 X Premium, 25000 X Premium+
  enable_threads: boolean; // split long posts into reply chains
  persona_prompt: string;
}

// === Stats ===
export interface StatsSnapshot {
  uptime_seconds: number;
  posts_today: number;
  replies_today: number;
  posts_this_month: number;
  reads_this_month: number;
  posts_limit: number;
  reads_limit: number;
  scheduler_running: boolean;
  next_scheduled_action: string | null; // ISO timestamp
}

// === Log Entry ===
export interface LogEntry {
  id: number;
  level: "info" | "warning" | "error";
  category: string;
  message: string;
  metadata?: Record<string, unknown>;
  created_at: string;
}

// === Post ===
export interface Post {
  id: number;
  x_tweet_id: string | null;
  type: "post" | "reply";
  content: string;
  in_reply_to: string | null;
  ai_prompt: string | null;
  status: "pending" | "posted" | "failed";
  error: string | null;
  created_at: string;
}

// === News Source ===
export interface NewsSource {
  id: number;
  type: "rss" | "url";
  name: string;
  url: string;
  enabled: boolean;
  last_fetch: string | null;
  created_at: string;
}

// === News Item ===
export interface NewsItem {
  id: number;
  source_id: number;
  title: string | null;
  content: string;
  url: string | null;
  hash: string;
  fetched_at: string;
  used: boolean;
}

// === Timeline Tweet ===
export interface TimelineTweet {
  id: number;
  x_tweet_id: string;
  author: string | null;
  content: string;
  fetched_at: string;
}

// === API Budget ===
export interface ApiBudget {
  id: number;
  month: string; // 'YYYY-MM'
  posts_used: number;
  posts_limit: number;
  reads_used: number;
  reads_limit: number;
}

// === WebSocket Events (Server → Client) ===
export type WsServerEvent =
  | { type: "log"; data: LogEntry }
  | { type: "stats_update"; data: StatsSnapshot }
  | { type: "post_created"; data: Post }
  | { type: "scheduler_status"; data: { running: boolean; next_action: string | null } }
  | { type: "budget_warning"; data: { resource: "posts" | "reads"; remaining_percent: number } }
  | { type: "error"; data: { message: string } };

// === WebSocket Commands (Client → Server) ===
export type WsClientCommand =
  | { type: "subscribe"; channels: ("logs" | "stats" | "posts")[] }
  | { type: "ping" };

// === API Response Wrapper ===
export interface ApiResponse<T> {
  data?: T;
  error?: { code: string; message: string };
}
