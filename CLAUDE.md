# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Commands

### Bot Service (`service/`)
```bash
cd service
bun install              # Install deps (openai, rss-parser)
bun run src/index.ts     # Run service (creates bot.db, bot.lock)
bun --watch src/index.ts # Dev mode with auto-restart
```

### Dashboard (`dashboard/`)
```bash
cd dashboard
bun install              # Install deps (react, tauri, tailwind v4, shadcn/ui)
bun tauri dev            # Launch Tauri desktop app (dev mode)
bun run build            # Vite build only
bun tauri build          # Full release artifact
```

### Type checking
```bash
cd service && bun build src/index.ts --target=bun  # Validates service compiles
```

## Architecture

Two independent packages in a Bun workspace:

```
virtualMe/
├── service/       # Headless bot (runs 24/7, exposes REST + WebSocket)
├── dashboard/     # Electrobun v1 desktop app (connects to service)
├── shared/        # Shared TypeScript types
└── _template/     # Original Bun+React template (archived)
```

### Service (`service/src/`)

Headless Bun process. Core flow:
```
Bun.serve() [index.ts]
  ├── /api/*       → routes.ts (REST: stats, config, posts, logs, news-sources, scheduler)
  └── /ws          → ws.ts (WebSocket: live log/stats/post events)

Scheduler [scheduler.ts] — 60s tick loop
  ├── fetch-news   (every 1h, no X API cost)
  ├── read-timeline (every 8h default, costs 1 read/call)
  ├── generate-post (every 2.5h during active window, costs 1 post/call)
  └── generate-reply (every 4h during active window, costs 1 post/call)

BotEngine [bot-engine.ts]
  ├── runReadCycle()  → XClient.getHomeTimeline() → cache in timeline_cache
  ├── runPostCycle()  → AIClient.generatePost() → quality gate → XClient.createPost()
  └── runReplyCycle() → pick random cached tweet → AIClient.generateReply() → XClient.createReply()
```

**Key constraint**: X API free tier = ~500 posts/month + ~100 reads/month. Every call to `createPost()`, `createReply()`, or `getHomeTimeline()` checks `canPost()`/`canRead()` against `api_budget` table first. 5% reserve kept for manual dashboard triggers.

### Database (`service/src/db.ts`)

SQLite (`bot.db`) via `bun:sqlite`. Tables:
- `config` — key/value runtime config (overrides env)
- `logs` — structured logs (level, category, message, metadata JSON)
- `posts` — post/reply history with status (`pending`/`posted`/`failed`)
- `api_budget` — monthly posts_used/reads_used vs limits
- `news_sources` — RSS feeds and web URLs
- `news_items` — fetched content with content-hash dedup, `used` flag
- `timeline_cache` — last fetched tweets for reply selection across cycles

### Config (`service/src/config.ts`)

Two layers: env vars (defaults) + DB-persisted runtime values (overrides). `getConfig()` merges both. `setConfig()` writes to DB and notifies listeners. The dashboard PATCH `/api/config` calls `setConfig()` which immediately affects the running scheduler.

### AI Client (`service/src/ai-client.ts`)

Single `openai` SDK instance with configurable `baseURL`. Supports LM Studio (`localhost:1234/v1`), Ollama (`localhost:11434/v1`), OpenRouter (`openrouter.ai/api/v1`). Client is recreated when `AI_BASE_URL` changes.

### X Client (`service/src/x-client.ts`)

OAuth 1.0a signing implemented manually (~50 lines using built-in `crypto`). No `twitter-api-v2` package. Three endpoints only: `GET /2/users/:id/timelines/reverse_chronological`, `POST /2/tweets` (post), `POST /2/tweets` (reply with `reply.in_reply_to_tweet_id`).

### Dashboard (`dashboard/src/`)

Tauri v2 desktop app (React 19 + Tailwind v4 + shadcn-style components):
- `src/App.tsx` — sidebar nav + tab routing (Overview | Live Logs | Posts | News Sources | Config)
- `src/lib/api-client.ts` — typed REST wrapper + auto-reconnecting WebSocket client (`wsClient`)
- `src/lib/store.ts` — React hooks (`useStats`, `useLogs`, `usePosts`, `useConfig`, `useNewsSources`, `useServiceConnection`)
- `src/components/ui/` — minimal shadcn-compatible primitives (card, badge, button, input, label, select)
- `src/components/` — feature components (StatsOverview, LiveLogs, PostHistory, NewsSources, BotConfig, ConnectionStatus)
- `src-tauri/src/lib.rs` — minimal Rust shell, no custom commands

**Windows/Bun quirk**: `beforeDevCommand` in `tauri.conf.json` uses `node_modules\.bin\vite.exe` directly instead of `bun run dev` — Bun's bin resolution breaks when a root-level `bunfig.toml` exists in the monorepo.

**Tab layout**: Overview | Live Logs | Posts | News Sources | Config

### Service ↔ Dashboard API

REST base: `http://localhost:3000/api/`
WebSocket: `ws://localhost:3000/ws`

Key endpoints: `GET /api/stats`, `GET|PATCH /api/config`, `GET /api/posts`, `GET /api/logs`, `CRUD /api/news-sources`, `POST /api/scheduler/start|stop`, `POST /api/actions/post|read-timeline`

WS server events: `log`, `stats_update`, `post_created`, `scheduler_status`, `budget_warning`

## Environment Setup

```bash
cp service/.env.example service/.env
# Fill in X_API_KEY, X_API_SECRET, X_ACCESS_TOKEN, X_ACCESS_SECRET, X_USER_ID
# Set AI_BASE_URL/AI_MODEL for your AI provider
```

Get X credentials from [developer.twitter.com](https://developer.twitter.com/en/portal/dashboard). Need OAuth 1.0a User Context keys.

## Important Notes

- Delete `service/bot.lock` if the service crashed without cleanup
- X free tier limits: ~500 posts/month, ~100 reads/month. Default poll is 8h (not the 30min env var name suggests)
- `POLL_INTERVAL_MINUTES=480` is the safe default; the original 30min would exhaust reads in ~2 days
- Dashboard uses Tauri v2 (not Electrobun — abandoned due to CSS/bin issues on Windows)
- Dashboard's `beforeDevCommand` is `node_modules\.bin\vite.exe` (not `bun run dev`) — root `bunfig.toml` breaks Bun bin resolution in nested packages
