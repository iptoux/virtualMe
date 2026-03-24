# virtualMe — X Bot + Electrobun Dashboard

## Context

Build an automated X (Twitter) bot that runs 24/7 as a headless Bun service, paired with an Electrobun v1 desktop dashboard for monitoring and configuration. The bot reads the user's timeline, fetches news sources, generates posts/replies via AI (local or cloud), and posts to X — all within the strict constraints of the X API free tier (~500 posts/month, ~100 reads/month).

---

## Architecture

```
┌─────────────────────┐         HTTP/WS         ┌──────────────────────┐
│   Bot Service       │◄───────────────────────► │  Electrobun Dashboard│
│   (headless Bun)    │   localhost:3000         │  (desktop app)       │
│                     │                          │                      │
│  Scheduler          │                          │  React + shadcn/ui   │
│  X API Client       │                          │  in system webview   │
│  AI Client          │                          │                      │
│  News Fetcher       │                          │  Stats / Logs /      │
│  SQLite DB          │                          │  Config / History    │
│  REST API + WS      │                          │                      │
└─────────────────────┘                          └──────────────────────┘
```

**Two independent packages** in the same repo, connected via REST + WebSocket.

---

## Project Structure

```
virtualMe/
├── service/                    # Headless bot (can run on server)
│   ├── src/
│   │   ├── index.ts            # Entry: Bun.serve() + scheduler boot
│   │   ├── db.ts               # SQLite schema + typed queries
│   │   ├── config.ts           # Env + runtime config (DB-backed)
│   │   ├── x-client.ts         # X API: OAuth 1.0a, timeline, post, reply
│   │   ├── ai-client.ts        # OpenAI-compatible wrapper (configurable baseURL)
│   │   ├── bot-engine.ts       # Core logic: read → AI → post/reply
│   │   ├── scheduler.ts        # Interval-based task runner with budget gating
│   │   ├── ws.ts               # WebSocket handler for live log streaming
│   │   ├── logger.ts           # Structured logger (writes to DB + broadcasts via WS)
│   │   ├── api/
│   │   │   └── routes.ts       # REST endpoints for dashboard
│   │   └── news/
│   │       ├── index.ts        # Unified news interface + dedup
│   │       ├── rss-fetcher.ts  # RSS feed parsing
│   │       └── web-fetcher.ts  # URL content extraction
│   ├── .env.example
│   ├── package.json
│   └── tsconfig.json
├── dashboard/                  # Electrobun v1 desktop app
│   ├── src/
│   │   ├── bun/
│   │   │   └── index.ts        # Main process: BrowserWindow, RPC bridge
│   │   └── mainview/
│   │       ├── index.html
│   │       ├── index.ts        # React app entry
│   │       ├── App.tsx          # Root component with tab navigation
│   │       ├── lib/
│   │       │   ├── api-client.ts   # HTTP + WS client to bot service
│   │       │   ├── store.ts        # Local state + last-known-state cache
│   │       │   └── utils.ts        # cn() utility
│   │       └── components/
│   │           ├── ui/             # shadcn/ui components
│   │           ├── StatsOverview.tsx
│   │           ├── LiveLogs.tsx
│   │           ├── BotConfig.tsx
│   │           ├── NewsSources.tsx
│   │           ├── PostHistory.tsx
│   │           └── ConnectionStatus.tsx
│   ├── electrobun.config.ts
│   └── package.json
├── shared/
│   └── types.ts                # Interfaces shared between service & dashboard
└── package.json                # Workspace root
```

---

## Implementation Phases

### Phase 1: Repo restructure + foundation
1. Create `service/`, `dashboard/`, `shared/` directories
2. Move existing template files to `_template/` (preserve as reference)
3. Set up root `package.json` as Bun workspace (`workspaces: ["service", "dashboard", "shared"]`)
4. Create `shared/types.ts` with all shared interfaces (see "Shared Types" section)
5. Implement `service/src/db.ts` — SQLite schema creation + typed query helpers
6. Implement `service/src/config.ts` — reads `.env`, merges with DB-persisted runtime config
7. Implement `service/src/logger.ts` — structured logger that writes to DB + emits events

### Phase 2: X API + AI clients
8. Implement `service/src/x-client.ts`:
   - OAuth 1.0a signature generation (HMAC-SHA1 via built-in `crypto`)
   - `getHomeTimeline()` — GET /2/users/:id/timelines/reverse_chronological
   - `createPost(text)` — POST /2/tweets
   - `createReply(text, inReplyToId)` — POST /2/tweets with reply field
   - `canPost()` / `canRead()` — budget checks against `api_budget` table
   - Every call increments budget counters and logs via logger
9. Implement `service/src/ai-client.ts`:
   - Wraps `openai` npm package with configurable `baseURL`
   - `generatePost(context: PostContext): Promise<string>` — generates original tweet from news + timeline
   - `generateReply(tweet: Tweet, context: ReplyContext): Promise<string>` — generates reply
   - `reconfigure(config)` — recreates client when settings change at runtime
   - System prompts include configurable persona/tone (stored in DB config)

### Phase 3: News gathering + Bot engine
10. Implement `service/src/news/rss-fetcher.ts` — parse RSS feeds via `rss-parser` package
11. Implement `service/src/news/web-fetcher.ts` — fetch URL, extract text content
12. Implement `service/src/news/index.ts` — unified interface, content hash dedup, stores to `news_items` table
13. Implement `service/src/bot-engine.ts`:
    - `runReadCycle()` — fetch timeline, cache tweets, log results
    - `runPostCycle()` — pick news/timeline context → AI generate → quality gate → post to X
    - `runReplyCycle()` — pick random cached tweet → AI generate reply → quality gate → reply
    - Quality gate: length check (20-280 chars), similarity check vs last 20 posts, up to 2 retries

### Phase 4: Scheduler + API server
14. Implement `service/src/scheduler.ts`:
    - Registered tasks: `read-timeline` (8h), `generate-post` (2.5h), `generate-reply` (4h), `fetch-news` (1h), `cleanup-logs` (24h)
    - 60-second tick loop checks which tasks are due
    - Active window enforcement (default 8am-11pm) for posts/replies
    - Budget gating: each handler checks `canPost()`/`canRead()` before executing
    - Dynamic budgeting: `daily = floor(remaining / days_left_in_month)`
    - 5% emergency reserve (25 posts, 5 reads) — only manual trigger bypasses
15. Implement `service/src/api/routes.ts` — all REST endpoint handlers (see API Contract)
16. Implement `service/src/ws.ts`:
    - Manages connected WebSocket clients
    - Channel-based subscriptions (`logs`, `stats`, `posts`)
    - Broadcasts events from logger and bot engine
17. Implement `service/src/index.ts`:
    - `Bun.serve()` with route matching for REST + WebSocket upgrade
    - Initializes DB, config, scheduler on startup
    - Startup lock file to prevent duplicate instances

### Phase 5: Electrobun dashboard
18. Init dashboard: `cd dashboard && bunx electrobun init`
19. Configure `electrobun.config.ts`:
    - App name: "virtualMe Dashboard"
    - Main process: `src/bun/index.ts`
    - View: `mainview` → `src/mainview/index.ts`
20. Implement `dashboard/src/bun/index.ts`:
    - Create BrowserWindow with `views://mainview/index.html`
    - Typed RPC bridge: expose service URL config, connection status to webview
21. Set up React + Tailwind + shadcn/ui in `dashboard/src/mainview/`:
    - Install: `bun add react react-dom`, add shadcn components
    - `index.ts` — React app mount
    - `App.tsx` — tab layout (Stats | Logs | Config | News | History)
22. Implement `dashboard/src/mainview/lib/api-client.ts`:
    - `ServiceClient` class with HTTP methods for each REST endpoint
    - WebSocket connection with auto-reconnect (exponential backoff: 1s, 2s, 4s, max 30s)
    - Event emitter pattern for WS events
23. Implement `dashboard/src/mainview/lib/store.ts`:
    - Simple state management (React context or zustand)
    - Caches last-known state to localStorage for offline display
24. Build dashboard components:
    - `StatsOverview.tsx` — cards showing posts/replies count, quota bars, uptime, scheduler state
    - `LiveLogs.tsx` — scrolling log viewer with level filter (info/warning/error), auto-scroll
    - `BotConfig.tsx` — form to edit all config values, PATCH on save
    - `NewsSources.tsx` — table of sources with add/edit/delete, enable/disable toggle
    - `PostHistory.tsx` — paginated table of posts/replies with status badges
    - `ConnectionStatus.tsx` — service URL input, connected/disconnected indicator

### Phase 6: Polish + hardening
25. Offline dashboard: show stale data badge, queue config changes for reconnect
26. Low-budget warnings: dashboard alert when < 20% monthly budget remains
27. Graceful degradation: scheduler auto-reduces frequency when budget is low
28. Error resilience: catch/log all API failures, never crash the service

---

## Database Schema (SQLite)

```sql
-- Runtime configuration (key-value, overrides env defaults)
CREATE TABLE config (
  key        TEXT PRIMARY KEY,
  value      TEXT NOT NULL,
  updated_at TEXT NOT NULL DEFAULT (datetime('now'))
);

-- Structured logs
CREATE TABLE logs (
  id         INTEGER PRIMARY KEY AUTOINCREMENT,
  level      TEXT NOT NULL CHECK(level IN ('info','warning','error')),
  category   TEXT NOT NULL,  -- 'x-api', 'ai', 'scheduler', 'news', 'system'
  message    TEXT NOT NULL,
  metadata   TEXT,           -- JSON blob for extra context
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);
CREATE INDEX idx_logs_created ON logs(created_at);
CREATE INDEX idx_logs_level ON logs(level);

-- Post history (original posts and replies)
CREATE TABLE posts (
  id           INTEGER PRIMARY KEY AUTOINCREMENT,
  x_tweet_id   TEXT,          -- X API tweet ID (null if failed)
  type         TEXT NOT NULL CHECK(type IN ('post','reply')),
  content      TEXT NOT NULL,
  in_reply_to  TEXT,          -- tweet ID being replied to
  ai_prompt    TEXT,          -- prompt sent to AI (for debugging)
  status       TEXT NOT NULL DEFAULT 'pending' CHECK(status IN ('pending','posted','failed')),
  error        TEXT,
  created_at   TEXT NOT NULL DEFAULT (datetime('now'))
);
CREATE INDEX idx_posts_created ON posts(created_at);
CREATE INDEX idx_posts_type ON posts(type);

-- Monthly API budget tracking
CREATE TABLE api_budget (
  id            INTEGER PRIMARY KEY AUTOINCREMENT,
  month         TEXT NOT NULL UNIQUE,  -- 'YYYY-MM'
  posts_used    INTEGER NOT NULL DEFAULT 0,
  posts_limit   INTEGER NOT NULL DEFAULT 500,
  reads_used    INTEGER NOT NULL DEFAULT 0,
  reads_limit   INTEGER NOT NULL DEFAULT 100
);

-- News sources (RSS feeds, URLs)
CREATE TABLE news_sources (
  id         INTEGER PRIMARY KEY AUTOINCREMENT,
  type       TEXT NOT NULL CHECK(type IN ('rss','url')),
  name       TEXT NOT NULL,
  url        TEXT NOT NULL,
  enabled    INTEGER NOT NULL DEFAULT 1,
  last_fetch TEXT,
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);

-- Fetched news items (for dedup and content reference)
CREATE TABLE news_items (
  id         INTEGER PRIMARY KEY AUTOINCREMENT,
  source_id  INTEGER NOT NULL REFERENCES news_sources(id) ON DELETE CASCADE,
  title      TEXT,
  content    TEXT NOT NULL,
  url        TEXT,
  hash       TEXT NOT NULL UNIQUE,  -- content hash for dedup
  fetched_at TEXT NOT NULL DEFAULT (datetime('now')),
  used       INTEGER NOT NULL DEFAULT 0
);
CREATE INDEX idx_news_items_source ON news_items(source_id);

-- Cached timeline tweets (for reply selection across cycles)
CREATE TABLE timeline_cache (
  id          INTEGER PRIMARY KEY AUTOINCREMENT,
  x_tweet_id  TEXT NOT NULL UNIQUE,
  author      TEXT,
  content     TEXT NOT NULL,
  fetched_at  TEXT NOT NULL DEFAULT (datetime('now'))
);
```

---

## Shared Types (`shared/types.ts`)

```typescript
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
  active_hours_start: number;  // 0-23
  active_hours_end: number;    // 0-23
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
  next_scheduled_action: string | null;  // ISO timestamp
}

// === Log Entry ===
export interface LogEntry {
  id: number;
  level: 'info' | 'warning' | 'error';
  category: string;
  message: string;
  metadata?: Record<string, unknown>;
  created_at: string;
}

// === Post ===
export interface Post {
  id: number;
  x_tweet_id: string | null;
  type: 'post' | 'reply';
  content: string;
  in_reply_to: string | null;
  ai_prompt: string | null;
  status: 'pending' | 'posted' | 'failed';
  error: string | null;
  created_at: string;
}

// === News Source ===
export interface NewsSource {
  id: number;
  type: 'rss' | 'url';
  name: string;
  url: string;
  enabled: boolean;
  last_fetch: string | null;
  created_at: string;
}

// === WebSocket Events ===
export type WsServerEvent =
  | { type: 'log'; data: LogEntry }
  | { type: 'stats_update'; data: StatsSnapshot }
  | { type: 'post_created'; data: Post }
  | { type: 'scheduler_status'; data: { running: boolean; next_action: string | null } }
  | { type: 'error'; data: { message: string } };

export type WsClientCommand =
  | { type: 'subscribe'; channels: ('logs' | 'stats' | 'posts')[] }
  | { type: 'ping' };

// === API Response Wrapper ===
export interface ApiResponse<T> {
  data?: T;
  error?: { code: string; message: string };
}
```

---

## API Contract (Service ↔ Dashboard)

### REST Endpoints (`/api/*`)

| Method | Endpoint | Request | Response |
|--------|----------|---------|----------|
| GET | `/api/stats` | — | `ApiResponse<StatsSnapshot>` |
| GET | `/api/config` | — | `ApiResponse<BotConfig>` |
| PATCH | `/api/config` | `Partial<BotConfig>` | `ApiResponse<BotConfig>` |
| GET | `/api/posts` | `?type=post\|reply&limit=50&offset=0` | `ApiResponse<Post[]>` |
| GET | `/api/logs` | `?level=info\|warning\|error&limit=100&offset=0` | `ApiResponse<LogEntry[]>` |
| GET | `/api/news-sources` | — | `ApiResponse<NewsSource[]>` |
| POST | `/api/news-sources` | `{ type, name, url }` | `ApiResponse<NewsSource>` |
| PATCH | `/api/news-sources/:id` | `Partial<NewsSource>` | `ApiResponse<NewsSource>` |
| DELETE | `/api/news-sources/:id` | — | `ApiResponse<null>` |
| POST | `/api/scheduler/start` | — | `ApiResponse<null>` |
| POST | `/api/scheduler/stop` | — | `ApiResponse<null>` |
| POST | `/api/actions/post` | — | `ApiResponse<Post>` |
| POST | `/api/actions/read-timeline` | — | `ApiResponse<{ tweets_fetched: number }>` |

### WebSocket (`ws://host:port/ws`)

- **Server → Client**: `WsServerEvent` (log, stats_update, post_created, scheduler_status, error)
- **Client → Server**: `WsClientCommand` (subscribe to channels, ping)

---

## Free-Tier Rate Limit Strategy

| Resource | Monthly limit | Daily budget | Default interval | Strategy |
|----------|--------------|-------------|-----------------|----------|
| Reads | ~100 | ~3/day | Every 8 hours | Each read fetches up to 100 tweets, all cached in DB for multi-cycle use |
| Posts | ~500 | ~16/day | Every 2.5 hours | ~10 original + ~6 replies. Only during active window (8am-11pm) |

**Dynamic budgeting:** `daily = floor(remaining / days_left_in_month)` — adjusts if bot starts mid-month.

**5% emergency reserve:** 25 posts + 5 reads held back. Only usable via manual dashboard trigger, never by scheduler.

**Quality gate:** Before spending a post slot, AI output must pass:
1. Length: 20-280 characters
2. Not too similar to last 20 posts (basic string comparison)
3. Up to 2 retry attempts, then skip the cycle

**Graceful degradation:** When < 20% budget remains → reduce frequency, warn via dashboard, continue news fetching.

---

## AI Provider Config

Single `openai` SDK instance with configurable `baseURL`:

| Provider | `AI_BASE_URL` | `AI_API_KEY` |
|----------|--------------|-------------|
| LM Studio (local) | `http://localhost:1234/v1` | `not-needed` |
| Ollama (local) | `http://localhost:11434/v1` | `not-needed` |
| OpenRouter (cloud) | `https://openrouter.ai/api/v1` | `sk-or-...` |

All overridable at runtime via dashboard config panel.

---

## Key Dependencies

**Service:**
- `openai` — AI client (OpenAI-compatible SDK)
- `rss-parser` — RSS feed parsing
- `bun:sqlite` — built-in, no install needed

**Dashboard:**
- `react@19`, `react-dom@19`
- `electrobun@1`
- `tailwindcss@4`
- shadcn/ui components (locally owned)
- `lucide-react`, `clsx`, `tailwind-merge`, `class-variance-authority`

**No `twitter-api-v2` package** — OAuth 1.0a signing implemented manually (~50 lines using built-in `crypto`). We only need 3 endpoints.

---

## Environment Variables (`.env.example`)

```env
# X API (OAuth 1.0a User Context)
X_API_KEY=
X_API_SECRET=
X_ACCESS_TOKEN=
X_ACCESS_SECRET=
X_USER_ID=               # Your X user ID (needed for timeline endpoint)

# AI Provider
AI_BASE_URL=http://localhost:1234/v1
AI_MODEL=local-model
AI_API_KEY=not-needed

# Service
SERVICE_PORT=3000
SERVICE_HOST=0.0.0.0

# Bot Defaults
POLL_INTERVAL_MINUTES=480
POST_FREQUENCY_HOURS=2.5
REPLY_PROBABILITY=0.4
MAX_POSTS_PER_DAY=10
MAX_REPLIES_PER_DAY=6
ACTIVE_HOURS_START=8
ACTIVE_HOURS_END=23
```

---

## Verification Plan

1. **Service boots**: `cd service && bun run src/index.ts` — starts on port 3000, creates SQLite DB, logs scheduler tasks
2. **REST API works**: `curl localhost:3000/api/stats` — returns JSON stats
3. **WebSocket streams**: Connect to `ws://localhost:3000/ws`, subscribe to `logs`, trigger `POST /api/actions/post` — see log events stream
4. **Dashboard connects**: `cd dashboard && bun dev` — Electrobun window opens, shows stats from service
5. **End-to-end**: Set X API keys → start scheduler from dashboard → bot reads timeline → AI generates post → posts to X → appears in post history

---

## Research Sources

- [Electrobun GitHub](https://github.com/blackboardsh/electrobun)
- [Electrobun Docs](https://blackboard.sh/electrobun/docs/)
- [Electrobun v1 Blog Post](https://blackboard.sh/blog/electrobun-v1/)
- [Electrobun Application Structure (DeepWiki)](https://deepwiki.com/blackboardsh/electrobun/5.1-application-structure)
- [X API v2 Timelines](https://developer.x.com/en/docs/x-api/tweets/timelines/introduction)
- [X API Pricing 2026](https://elfsight.com/blog/how-to-get-x-twitter-api-key-in-2026/)
- [OpenRouter TypeScript SDK](https://openrouter.ai/docs/sdks/typescript)
- [LM Studio OpenAI Compatibility](https://lmstudio.ai/docs/developer/openai-compat)
