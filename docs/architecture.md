# Architecture

## Overview

virtualMe is split into two independent packages that communicate over HTTP and WebSocket:

```
┌──────────────────────────────────────────────────────────────────┐
│  service/  (Bun process, headless, runs 24/7)                    │
│                                                                  │
│  ┌─────────────┐   ┌──────────────┐   ┌──────────────────────┐  │
│  │ Scheduler   │   │  BotEngine   │   │  REST + WebSocket    │  │
│  │ 60s tick    │──►│  runPost()   │   │  API (port 3000)     │  │
│  │ 5 tasks     │   │  runReply()  │   │                      │  │
│  └─────────────┘   │  runRead()   │   └──────────┬───────────┘  │
│                    └──────┬───────┘              │              │
│                           │                      │              │
│              ┌────────────┼──────────────┐        │              │
│              ▼            ▼              ▼        │              │
│         ┌────────┐  ┌──────────┐  ┌──────────┐   │              │
│         │X Client│  │AI Client │  │  SQLite  │◄──┘              │
│         │OAuth1a │  │OpenAI SDK│  │  bot.db  │                  │
│         └────┬───┘  └────┬─────┘  └──────────┘                  │
│              │            │                                      │
└──────────────┼────────────┼──────────────────────────────────────┘
               │            │
               ▼            ▼
           X API          AI Provider
         (Twitter)      (LM Studio /
                         Ollama /
                         OpenRouter)

┌──────────────────────────────────────────────────────────────────┐
│  dashboard/  (Tauri desktop app, optional, can run anywhere)     │
│                                                                  │
│  React UI ──► api-client.ts ──► HTTP / WebSocket ──► service    │
│  store.ts (hooks)                                                │
└──────────────────────────────────────────────────────────────────┘
```

---

## Hosting Split

The service and dashboard are **completely independent**. This is a deliberate design choice.

### Service

The service is a plain Bun process. It has no GUI and no dependency on the dashboard. It exposes:
- `GET|POST|PATCH|DELETE /api/*` — REST API
- `GET /ws` — WebSocket for live event streaming
- `GET /health` — health check endpoint

It can run:
- On your local machine alongside the dashboard
- On a headless Linux/Windows server
- In a Docker container
- On any machine that can reach the X API and your AI provider

The service is the **only** component that needs X API credentials and AI API keys.

### Dashboard

The dashboard is a Tauri (WebView + Rust shell) desktop app. It is nothing more than a remote control for the service. It:
- Stores the service URL in `localStorage` (configurable in the sidebar)
- Makes HTTP requests to `{serviceUrl}/api/*`
- Opens a WebSocket to `ws://{serviceUrl}/ws` for live updates
- Contains **no bot logic** — all decisions happen in the service

The dashboard can run:
- On the same machine as the service (default, connects to `localhost:3000`)
- On a different machine connected via LAN or VPN
- You can have multiple dashboard instances open against the same service simultaneously

### Consequence: you can control the bot from anywhere

```
Home Server (Linux)              Laptop (Windows)
┌──────────────────┐             ┌──────────────────────┐
│  service/        │   LAN/VPN   │  dashboard/          │
│  port 3000       │◄───────────►│  service URL:        │
│  runs 24/7       │             │  http://192.168.1.5  │
└──────────────────┘             │  :3000               │
                                 └──────────────────────┘
```

If the dashboard is closed, the service continues posting normally. The dashboard is **never in the critical path**.

---

## Data Flow — Post Cycle

```
Scheduler tick (60s)
  └─► is it time to post? (post_frequency_hours elapsed, inside active window)
        └─► canPost()? (budget check: monthly quota + daily limit)
              └─► getNewsContext() — pick 3 unused news items from DB
                    └─► searchDuckDuckGo(first item title) — enrich context
                          └─► generatePost(context) — call AI, 3 retries
                                └─► quality gate (length, similarity check)
                                      └─► split into thread if enabled
                                            └─► append t.co URL (24-char reserve)
                                                  └─► createPost() / createThread()
                                                        └─► increment posts_used
                                                              └─► broadcastPost() → WS
```

---

## Data Flow — Reply Cycle

```
Scheduler tick
  └─► is it time to reply? (every 4h, active window)
        └─► random() < reply_probability?
              └─► canPost()? (budget check)
                    └─► pick random tweet from timeline_cache
                          └─► generateReply(tweet) — call AI, 3 retries
                                └─► quality gate
                                      └─► createReply()
                                            └─► increment posts_used → broadcastPost()
```

---

## Data Flow — WebSocket

```
service (Bun WebSocket)              dashboard (WsClient)
        │                                     │
        │◄──── connect ───────────────────────┤
        │◄──── subscribe {channels:[...]} ────┤
        │                                     │
        │──── log event ─────────────────────►│ → store.ts useLogs()
        │──── stats_update ──────────────────►│ → store.ts useStats()
        │──── post_created ──────────────────►│ → store.ts usePosts()
        │──── scheduler_status ──────────────►│ → store.ts useServiceConnection()
        │──── budget_warning ────────────────►│ → StatsOverview
```

The WsClient in the dashboard auto-reconnects with exponential backoff (2s → 30s max). If the service restarts, the dashboard reconnects automatically.

---

## Database Schema

SQLite file at `service/bot.db`. Opened in WAL mode for concurrent reads.

```
config           key/value runtime config (overrides .env defaults)
logs             structured log entries (level, category, message, metadata JSON)
posts            all post/reply attempts with status and stored AI prompt
api_budget       monthly posts_used/reads_used vs limits (one row per YYYY-MM)
news_sources     RSS feeds and web URLs (enabled/disabled)
news_items       fetched content, SHA256-deduplicated, used flag
timeline_cache   last fetched timeline tweets (pruned to 200 rows)
```

### Budget table

The `api_budget` table is the single source of truth for X API usage. One row per calendar month (`YYYY-MM`). Every call to `createPost()` or `createReply()` increments `posts_used`; every call to `getHomeTimeline()` increments `reads_used`. A 5% reserve is kept so there is always budget for manual dashboard-triggered actions.

### Posts table

Every planned post gets a row with `status=pending` before the X API call. The row is updated to `posted` or `failed` afterwards. The `ai_prompt` column stores the full `[SYSTEM]...[USER]...` prompt that was used, visible in the dashboard's Posts tab.

---

## Two-Layer Configuration

```
┌─────────────────────────────────────────────────────┐
│  Priority 2 (high): DB-persisted runtime values     │  ◄── changed via dashboard or PATCH /api/config
│  Priority 1 (low):  .env defaults                   │  ◄── set at startup, never mutated at runtime
└─────────────────────────────────────────────────────┘
         └──► getConfig() merges both → BotConfig
```

When you change a setting in the dashboard, it calls `PATCH /api/config`, which writes the new value to the `config` table and immediately notifies all internal listeners (scheduler, AI client, etc.). No restart needed.

The `.env` file is only read once at startup. It provides the floor values. If you delete a key from the DB, the `.env` value takes over again.

---

## AI Client Abstraction

The service uses the `openai` npm SDK but points `baseURL` at whatever endpoint is configured. Any OpenAI-compatible server works:

```
AI_BASE_URL=http://localhost:1234/v1   →  LM Studio
AI_BASE_URL=http://localhost:11434/v1  →  Ollama
AI_BASE_URL=https://openrouter.ai/api/v1  →  OpenRouter
AI_BASE_URL=https://api.openai.com/v1     →  OpenAI
```

The client is recreated whenever `AI_BASE_URL` changes (config change listener). No restart required when switching providers.

---

## X API Client

The service implements OAuth 1.0a signing manually (~50 lines, `service/src/x-client.ts`). There is no `twitter-api-v2` package. Only three X API endpoints are used:

| Endpoint | Used for | Budget cost |
|---|---|---|
| `GET /2/users/:id/timelines/reverse_chronological` | Fetch home timeline | 1 read |
| `POST /2/tweets` | Post a tweet | 1 post |
| `POST /2/tweets` (with `reply.in_reply_to_tweet_id`) | Reply to a tweet | 1 post |

### Free Tier Limits (X API v2)

| Resource | Monthly limit | Default config |
|---|---|---|
| Posts (write) | ~500/month | 5/day max, 2.5h frequency |
| Reads (timeline) | ~100/month | 8h interval |

The service enforces a **5% reserve** on both limits so manual dashboard actions always have budget.

---

## Thread Splitting

If `enable_threads = true`, the service splits long AI-generated posts at sentence and word boundaries, numbering each chunk `(1/N)`. The AI is never told about threading — it writes naturally, and the splitting happens in `splitIntoThread()`.

The source URL (if any) is appended to the **last** chunk. Since X shortens all URLs to ~23 characters via `t.co`, only 24 characters are reserved (1 space + 23 chars) — not the full raw URL length.
