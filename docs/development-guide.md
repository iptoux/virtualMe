# Development Guide

This guide is for developers who want to understand the codebase, extend the service, or modify the dashboard.

---

## Repository Layout

```
virtualMe/
├── service/           # Bun bot service (headless)
│   ├── src/
│   │   ├── index.ts       # Entry point, Bun.serve()
│   │   ├── db.ts          # SQLite schema + queries
│   │   ├── config.ts      # Two-layer config system
│   │   ├── logger.ts      # Structured logging
│   │   ├── scheduler.ts   # 60s tick loop, 5 tasks
│   │   ├── bot-engine.ts  # runPostCycle / runReplyCycle / runReadCycle
│   │   ├── ai-client.ts   # OpenAI-compatible generation
│   │   ├── x-client.ts    # X API with manual OAuth 1.0a
│   │   ├── search.ts      # DuckDuckGo enrichment
│   │   ├── news/
│   │   │   ├── index.ts       # Orchestrator
│   │   │   ├── rss-fetcher.ts # rss-parser wrapper
│   │   │   └── web-fetcher.ts # HTML scraper
│   │   ├── api/
│   │   │   └── routes.ts      # REST request router
│   │   └── ws.ts          # WebSocket handlers + broadcasters
│   ├── .env.example
│   └── package.json
│
├── dashboard/         # Tauri desktop app
│   ├── src/
│   │   ├── App.tsx            # Root layout, tab routing
│   │   ├── main.tsx           # React entry
│   │   ├── lib/
│   │   │   ├── api-client.ts  # REST wrapper + WsClient
│   │   │   ├── store.ts       # React hooks (useStats, useLogs, etc.)
│   │   │   └── utils.ts       # cn(), formatUptime(), formatDate()
│   │   └── components/
│   │       ├── StatsOverview.tsx
│   │       ├── LiveLogs.tsx
│   │       ├── PostHistory.tsx
│   │       ├── NewsSources.tsx
│   │       ├── BotConfig.tsx
│   │       ├── ConnectionStatus.tsx
│   │       └── ui/            # Primitive components
│   ├── src-tauri/
│   │   ├── src/lib.rs         # Minimal Rust shell (no custom commands)
│   │   └── tauri.conf.json    # Window config, dev/build commands
│   └── package.json
│
├── shared/
│   └── types.ts       # All shared TypeScript types
│
└── package.json       # Bun workspace root
```

---

## Service: Key Concepts

### How a module gets the database

`db.ts` exports a module-level singleton. Any module calls `getDb()` after `initDb()` has been called in `index.ts`. Functions that need DB access accept a `db: Database` parameter — they never call `getDb()` themselves, keeping them testable.

### How config changes propagate

```
dashboard PATCH /api/config
  → routes.ts → setConfig(patch)
    → writes to DB
    → fires onConfigChange listeners
      → scheduler picks up new intervals
      → ai-client recreates OpenAI instance if base_url changed
```

No polling. Pure event-driven.

### How logs reach the dashboard

```
logger.info("scheduler", "...")
  → inserts into DB
  → calls onLog listeners
    → ws.ts broadcastLog()
      → sends to all WS clients subscribed to "logs"
```

### How posts reach the dashboard

```
bot-engine runPostCycle() posts successfully
  → notifyPost(db, postId)
    → fetches full Post row from DB
    → calls onPostCreated listeners
      → ws.ts broadcastPost(post)
        → sends to all WS clients subscribed to "posts"
```

---

## Adding a New API Endpoint

1. Open `service/src/api/routes.ts`
2. Add a new `if` branch matching your method + pathname
3. Return a `Response` with `JSON.stringify(data)`
4. Add the corresponding typed function to `dashboard/src/lib/api-client.ts`

Example — adding `GET /api/budget`:

```typescript
// routes.ts
if (method === "GET" && path === "/api/budget") {
  const db = getDb();
  const budget = getCurrentBudget(db);
  return json(budget);
}
```

```typescript
// api-client.ts
getBudget: () => apiFetch<ApiBudget>("/api/budget"),
```

---

## Adding a New Scheduler Task

Open `service/src/scheduler.ts`. The tick loop at the bottom checks each task's last-run time. To add a task:

```typescript
// at the top of the tick handler
if (shouldRun(lastMyTask, myIntervalMs)) {
  lastMyTask = now;
  await runMyTask(db);
}
```

`shouldRun(last, interval)` is a simple timestamp comparison — implement it or inline the check. If the task should respect active hours, wrap it in the `isActiveHours(cfg)` guard.

---

## Adding a New Config Field

1. Add the field to `BotConfig` in `shared/types.ts`
2. Add a default value to `DEFAULTS` in `service/src/config.ts`
3. (Optional) Add a corresponding `process.env` read in `initConfig()`
4. Add a `.env.example` entry
5. Expose it in the dashboard's `BotConfig.tsx` form

Type changes in `shared/types.ts` are immediately reflected in both the service and the dashboard via the workspace reference (`../../../shared/types`).

---

## Adding a Dashboard Tab

1. Add the tab name to the `tabs` array in `App.tsx`
2. Create `dashboard/src/components/MyFeature.tsx`
3. Add the render case to the tab switch in `App.tsx`
4. If you need data: add a hook in `store.ts` following the existing `usePosts`, `useLogs` pattern

---

## Dashboard: State Management

There is no global state library. All state lives in React hooks defined in `store.ts`. Each hook:
- Fetches initial data via REST on mount
- Subscribes to relevant WebSocket events for live updates
- Returns the data plus any mutation functions

```typescript
// Pattern
export function useMyData() {
  const [data, setData] = useState<MyType | null>(null);

  useEffect(() => {
    api.getMyData().then(setData);

    const unsub = wsClient.subscribe((event) => {
      if (event.type === "my_event") setData(event.data);
    });
    return unsub;
  }, []);

  return data;
}
```

---

## Dashboard: Styling Conventions

- Tailwind v4 with CSS variables for theming
- All colour tokens are CSS variables: `var(--foreground)`, `var(--background)`, `var(--muted)`, `var(--border)`, `var(--primary)`, `var(--accent)`
- Use `cn()` from `lib/utils.ts` to compose class names conditionally
- UI primitives live in `components/ui/` — prefer those over raw elements for consistency

---

## Type Checking

```bash
# Service
cd service && bun build src/index.ts --target=bun

# Dashboard
cd dashboard && bun run build
```

The service type check compiles the entire source tree without emitting output. The dashboard runs `tsc --noEmit` then Vite build.

---

## Known Platform Quirks

### Windows: dashboard dev command

`tauri.conf.json` uses `node_modules\.bin\vite.exe` as the `beforeDevCommand` instead of `bun run dev`. This is because a root-level `bunfig.toml` breaks Bun's binary resolution for nested packages on Windows. Do not change this without testing on Windows first.

### Active hours use local server time

The scheduler's active hours window uses `new Date().getHours()` — local time of the machine running the service. If the service runs on a server in a different timezone, set `TZ` in the environment:

```env
TZ=Europe/Berlin
```

### Lock file

`bot.lock` is written on startup and deleted on clean exit. If the process crashes, delete it:

```bash
rm service/bot.lock
```

### WAL mode

`bot.db-wal` and `bot.db-shm` are SQLite WAL journal files. They are not meaningful to commit. They disappear after a clean checkpoint (normal SQLite operation).

---

## Shared Types

`shared/types.ts` is imported by both packages via relative paths:

```typescript
// service
import type { BotConfig } from "../../shared/types";

// dashboard
import type { BotConfig } from "../../../shared/types";
```

There is no build step for shared — it is directly consumed as TypeScript source. Keep all cross-boundary types here to avoid drift between the service's API shape and the dashboard's expectations.

---

## Extending the AI Prompt System

The AI generation functions (`generatePost`, `generateReply`) in `ai-client.ts` build their prompts from:

1. `cfg.persona_prompt` — user-defined, stored in DB
2. Hard-coded output rules (appended always)
3. Context variables — news items, recent posts, timeline tweets, search results

To add new context (e.g. trending topics, weather):

1. Add the field to `PostContext` interface in `ai-client.ts`
2. Fetch the data in `bot-engine.ts` `runPostCycle()`
3. Pass it as part of the context object
4. Format it into the `userPrompt` string inside `generatePost()`

The `storedPrompt` variable captures the full `[SYSTEM] + [USER]` text and is saved to the `ai_prompt` column, so any new context automatically shows up in the dashboard's prompt viewer.
