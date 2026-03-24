# Service Reference

The service is a headless Bun process located in `service/`. It owns all bot logic, the SQLite database, and exposes a REST + WebSocket API for external control.

---

## REST API

Base URL: `http://localhost:3000` (configurable via `PORT` env var)

All JSON responses use `Content-Type: application/json`. All endpoints support CORS from any origin.

---

### Health

#### `GET /health`

Returns service status.

```json
{ "status": "ok", "pid": 12345 }
```

---

### Stats

#### `GET /api/stats`

Returns a live snapshot of bot metrics.

```json
{
  "uptime_seconds": 3600,
  "posts_today": 2,
  "replies_today": 1,
  "posts_this_month": 28,
  "reads_this_month": 10,
  "posts_limit": 450,
  "reads_limit": 90,
  "scheduler_running": true,
  "next_scheduled_action": "2026-03-24T14:30:00.000Z"
}
```

---

### Config

#### `GET /api/config`

Returns the current merged `BotConfig` (env defaults + DB overrides).

#### `PATCH /api/config`

Updates one or more config values at runtime. Changes are persisted to DB and take effect immediately.

**Request body** — any subset of `BotConfig`:

```json
{
  "post_frequency_hours": 3,
  "max_posts_per_day": 8,
  "ai_model": "gpt-4o-mini"
}
```

**Response** — full updated `BotConfig`.

---

### Posts

#### `GET /api/posts`

Query params:
- `type` — `post` | `reply` (optional, returns all if omitted)
- `limit` — integer, default `50`
- `offset` — integer, default `0`

Returns `Post[]`, newest first.

```json
[
  {
    "id": 1,
    "type": "post",
    "content": "Hot take on the latest...",
    "status": "posted",
    "x_tweet_id": "1234567890",
    "in_reply_to": null,
    "ai_prompt": "[SYSTEM]\n...\n[USER]\n...",
    "error": null,
    "created_at": "2026-03-24T12:00:00.000Z"
  }
]
```

#### `DELETE /api/posts`

Clears all post history from the database.

```json
{ "cleared": true }
```

---

### Logs

#### `GET /api/logs`

Query params:
- `level` — `info` | `warning` | `error` (optional)
- `limit` — integer, default `100`
- `offset` — integer, default `0`

Returns `LogEntry[]`, newest first.

```json
[
  {
    "id": 1,
    "level": "info",
    "category": "scheduler",
    "message": "Post cycle complete",
    "metadata": null,
    "created_at": "2026-03-24T12:00:00.000Z"
  }
]
```

#### `DELETE /api/logs`

Clears all log entries from the database.

---

### News Sources

#### `GET /api/news-sources`

Returns all configured news sources.

```json
[
  {
    "id": 1,
    "type": "rss",
    "name": "Hacker News",
    "url": "https://news.ycombinator.com/rss",
    "enabled": true,
    "last_fetch": "2026-03-24T11:00:00.000Z",
    "created_at": "2026-03-01T00:00:00.000Z"
  }
]
```

#### `POST /api/news-sources`

Add a new news source.

```json
{
  "type": "rss",
  "name": "Hacker News",
  "url": "https://news.ycombinator.com/rss"
}
```

#### `PATCH /api/news-sources/:id`

Update name, URL, or enabled state.

```json
{ "enabled": false }
```

#### `DELETE /api/news-sources/:id`

Remove a news source.

#### `POST /api/news-sources/:id/fetch`

Trigger an immediate fetch for one source. Runs asynchronously; returns `{ "triggered": true }` immediately.

---

### Scheduler

#### `POST /api/scheduler/start`

Start the scheduler if stopped. Returns updated `StatsSnapshot`.

#### `POST /api/scheduler/stop`

Stop the scheduler. Any in-progress cycle completes; future ticks are paused. Returns updated `StatsSnapshot`.

---

### Manual Actions

These bypass the schedule timer but still respect the monthly/daily budget.

#### `POST /api/actions/post`

Generate and post immediately.

```json
{ "success": true }
```

Returns `{ "success": false }` if budget is exhausted or AI generation fails.

#### `POST /api/actions/read-timeline`

Fetch the home timeline and populate `timeline_cache`.

```json
{ "tweets_fetched": 12 }
```

---

## WebSocket API

Connect to: `ws://localhost:3000/ws`

### Client → Server commands

After connecting, send a subscribe command to start receiving events:

```json
{
  "type": "subscribe",
  "channels": ["logs", "stats", "posts"]
}
```

Available channels: `logs`, `stats`, `posts`.

Heartbeat:
```json
{ "type": "ping" }
```

### Server → Client events

#### `log`
```json
{
  "type": "log",
  "data": {
    "level": "info",
    "category": "scheduler",
    "message": "Post cycle started",
    "metadata": null,
    "created_at": "2026-03-24T12:00:00.000Z"
  }
}
```

#### `stats_update`
```json
{
  "type": "stats_update",
  "data": { /* StatsSnapshot */ }
}
```

#### `post_created`
```json
{
  "type": "post_created",
  "data": { /* Post */ }
}
```

#### `scheduler_status`

Broadcast to **all connected clients** (no channel subscription needed) whenever the scheduler starts or stops.

```json
{
  "type": "scheduler_status",
  "data": { "running": true }
}
```

#### `budget_warning`

Broadcast to all clients when posts or reads drop below 20% remaining.

```json
{
  "type": "budget_warning",
  "data": {
    "posts_pct": 15,
    "reads_pct": 8,
    "message": "Budget warning: posts at 15%, reads at 8%"
  }
}
```

---

## Source Module Reference

### `src/index.ts` — Entry point

Starts the Bun HTTP/WebSocket server, wires the logger and event system, creates the lock file, and launches the scheduler.

**Lock file**: `service/bot.lock` — contains the PID. Prevents duplicate instances. Delete manually if the process crashed.

### `src/db.ts`

SQLite singleton via `bun:sqlite`. WAL mode enabled. `initDb(path)` creates all tables and indexes on first run. `getDb()` returns the singleton.

### `src/config.ts`

Two-layer config system. `getConfig()` returns the merged `BotConfig`. `setConfig(patch)` writes to DB and fires change listeners. Internal modules (scheduler, AI client) subscribe with `onConfigChange()`.

### `src/logger.ts`

Writes to console, DB, and WebSocket simultaneously. Categories used: `service`, `db`, `config`, `scheduler`, `bot-engine`, `ai`, `x-api`, `news`, `ws`.

### `src/ai-client.ts`

Wraps the `openai` SDK. `generatePost(context)` and `generateReply(context)` both return `{ text, prompt }` where `prompt` is the full `[SYSTEM]...[USER]...` string stored in the DB for inspection.

**Quality gates applied before returning:**
1. Length: must be ≥ 20 characters
2. Length: must not exceed the configured maximum
3. Similarity: rejected if >40% keyword overlap with any of the last 20 posts
4. Reasoning model fallback: if output contains `<think>` tags, extracts the last non-empty line

**Retry**: up to 3 attempts per generation call.

### `src/x-client.ts`

Manual OAuth 1.0a. No external OAuth library. Uses `crypto.createHmac('sha1', ...)` from Node's built-in `crypto` module. Budget is checked before every API call.

### `src/bot-engine.ts`

Orchestrates the three cycle types. Calls `getNewsContext()`, `searchDuckDuckGo()`, `generatePost/Reply()`, `createPost/Reply/Thread()`, and updates the DB.

### `src/scheduler.ts`

60-second tick loop. Five tasks, each with its own interval tracking:

| Task | Interval | Budget cost | Active hours? |
|---|---|---|---|
| `fetch-news` | 1 hour | none | no |
| `read-timeline` | `poll_interval_minutes` | 1 read | no |
| `generate-post` | `post_frequency_hours` | 1 post | yes |
| `generate-reply` | 4 hours | 1 post | yes |
| `cleanup-logs` | 24 hours | none | no |

`triggerPost()` and `triggerReadTimeline()` bypass the interval check (but not the budget check). Called by the REST `actions` endpoints.

### `src/news/index.ts`

`fetchAllNewsSources(db)` iterates enabled sources and calls the appropriate fetcher. Items are deduplicated by SHA256 hash of the content. Returns the count of newly inserted items.

`getNewsContext(db, count)` returns unused items as `{ id, text, url }` objects. The `used` flag is set by `bot-engine.ts` after a post successfully goes out.

### `src/news/rss-fetcher.ts`

Uses `rss-parser`. Fetches up to 20 items. Content falls back through: `content:encodedSnippet → content → summary`. All errors are swallowed and logged; returns `[]` on failure.

### `src/news/web-fetcher.ts`

Plain `fetch` with a 10-second timeout. Strips `<script>`, `<style>`, then all other HTML tags. Returns the first 2000 characters of visible text.

### `src/search.ts`

DuckDuckGo Instant Answer API. No authentication required. Returns up to 3 results: the AbstractText plus up to 2 RelatedTopics. Always silently fails — a missing DDG response just means no enrichment for that cycle.

### `src/api/routes.ts`

Request router for `Bun.serve()`. Parses pathname and method, delegates to handler functions, returns JSON responses. CORS headers are added to every response.

### `src/ws.ts`

WebSocket upgrade handler. Each connection has a `channels: Set<string>` in `ws.data`. Broadcast functions filter by channel membership, except `broadcastSchedulerStatus()` and `broadcastBudgetWarning()` which send to all clients.
