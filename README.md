# virtualMe

An autonomous X (Twitter) bot with a native desktop dashboard. The bot generates opinionated posts and replies based on RSS/web news feeds and your home timeline, powered by any OpenAI-compatible AI provider — local or cloud.

![virtualMe Dashboard Overview](docs/assets/Screenshot%202026-03-24%20171658.png)

```
virtualMe/
├── service/     # Headless Bun process — runs 24/7, exposes REST + WebSocket
└── dashboard/   # Tauri v2 desktop app — connects to the service
```

---

## Features

- **Autonomous posting** — generates original posts from RSS feeds and web sources on a configurable schedule
- **Autonomous replies** — picks tweets from your cached home timeline and replies to them
- **Thread support** — automatically splits long content into reply chains
- **Source URL injection** — appends the news article link to posts (X t.co-aware, no truncation)
- **DuckDuckGo context** — enriches posts with background info fetched before the AI call
- **AI prompt storage** — every generated post stores the exact system + user prompt used, viewable in the dashboard
- **Budget enforcement** — hard limits on monthly X API calls (free tier: ~500 posts, ~100 reads); 5% reserve kept for manual triggers
- **Fully configurable at runtime** — all settings editable from the dashboard without restarting the service
- **Live dashboard** — real-time logs, post history with expandable prompts, news source management, budget tracking

---

## Requirements

| Dependency | Version | Notes |
|---|---|---|
| [Bun](https://bun.sh) | ≥ 1.1 | Both service and dashboard build tooling |
| [Rust + cargo](https://rustup.rs) | stable | Required by Tauri for the dashboard |
| X Developer Account | — | Free tier is sufficient |
| AI provider | — | LM Studio, Ollama, or any OpenAI-compatible API |

---

## X API Setup

1. Go to [developer.twitter.com](https://developer.twitter.com/en/portal/dashboard) and create a project + app
2. Under **User authentication settings**, enable **OAuth 1.0a** with **Read and Write** permissions
3. Generate **Access Token & Secret** (make sure they have read+write scope)
4. Copy your numeric **User ID** from the app dashboard

Free tier limits: ~**500 posts/month**, ~**100 reads/month**. The default schedule (post every 2.5h, read timeline every 8h) stays well within these limits.

---

## AI Provider Setup

The service uses any OpenAI-compatible API. Set `AI_BASE_URL`, `AI_MODEL`, and `AI_API_KEY` accordingly:

| Provider | `AI_BASE_URL` | `AI_API_KEY` |
|---|---|---|
| [LM Studio](https://lmstudio.ai) (local) | `http://localhost:1234/v1` | `not-needed` |
| [Ollama](https://ollama.com) (local) | `http://localhost:11434/v1` | `not-needed` |
| [OpenRouter](https://openrouter.ai) (cloud) | `https://openrouter.ai/api/v1` | `sk-or-...` |
| OpenAI | `https://api.openai.com/v1` | `sk-...` |

For local models, any instruction-following model works. Reasoning models (DeepSeek-R1, etc.) are supported — the service handles the `reasoning_content` fallback automatically.

---

## Installation

### 1. Clone & install dependencies

```bash
git clone https://github.com/iptoux/virtualMe.git
cd virtualMe
bun install
cd service && bun install
cd ../dashboard && bun install
```

### 2. Configure the service

```bash
cp service/.env.example service/.env
```

Edit `service/.env`:

```env
# X API credentials (OAuth 1.0a)
X_API_KEY=
X_API_SECRET=
X_ACCESS_TOKEN=
X_ACCESS_SECRET=
X_USER_ID=          # Your numeric X user ID

# AI provider
AI_BASE_URL=http://localhost:1234/v1
AI_MODEL=local-model
AI_API_KEY=not-needed

# Service
SERVICE_PORT=3000
SERVICE_HOST=0.0.0.0
```

All other settings (post frequency, active hours, persona, etc.) can be configured at runtime via the dashboard.

---

## Running

### Service (headless bot)

```bash
cd service
bun run src/index.ts          # production
bun --watch src/index.ts      # dev mode with auto-restart
```

The service creates `bot.db` (SQLite) and `bot.lock` on first run. If it crashes without cleanup, delete `bot.lock` before restarting.

### Dashboard (desktop app)

```bash
cd dashboard
bun tauri dev         # development (hot reload)
bun tauri build       # production build
```

The dashboard connects to `http://localhost:3000` by default. The backend URL is configurable from the sidebar (pencil icon next to the connection status) and persists across restarts.

---

## Configuration Reference

All values below are startup defaults set via `service/.env`. Every setting is also editable at runtime via the dashboard's **Config** tab.

| Variable | Default | Description |
|---|---|---|
| `POLL_INTERVAL_MINUTES` | `480` | How often to read the home timeline (8h keeps within free tier) |
| `POST_FREQUENCY_HOURS` | `2.5` | How often to generate an original post |
| `REPLY_PROBABILITY` | `0.4` | Probability (0–1) of actually replying when the reply cycle runs |
| `MAX_POSTS_PER_DAY` | `10` | Daily cap on original posts |
| `MAX_REPLIES_PER_DAY` | `6` | Daily cap on replies |
| `ACTIVE_HOURS_START` | `8` | Posts and replies only happen between these hours (local time) |
| `ACTIVE_HOURS_END` | `23` | |
| `MAX_TWEET_LENGTH` | `280` | 280 standard · 4000 X Premium · 25000 X Premium+ |
| `ENABLE_THREADS` | `true` | Split posts longer than `MAX_TWEET_LENGTH` into reply chains |
| `PERSONA_PROMPT` | *(see below)* | The bot's voice and persona, sent as system prompt to the AI |

### Default persona

The bot ships with an opinionated tech persona: blunt, direct, critical of PR nonsense and hype. Posts in the **same language as the source article** (German or English). Criticises ideas and decisions — never insults people personally. The full prompt is in `service/src/config.ts` and editable at runtime via the dashboard.

![Config tab — AI provider and persona prompt](docs/assets/Screenshot%202026-03-24%20171840.png)

---

## Dashboard Overview

| Tab | What it shows |
|---|---|
| **Overview** | Uptime, posts/replies today, monthly API budget, manual trigger buttons |
| **Live Logs** | Real-time structured log stream with expandable metadata |
| **Posts** | Full post history with status badges; click `▶` to expand the AI prompt used to generate each post |
| **News Sources** | Add/remove/toggle RSS feeds and web URLs |
| **Config** | Edit all runtime settings including the persona prompt |

### Live Logs

Real-time log stream from the service. Click the chevron on any entry to expand metadata.

![Live Logs tab](docs/assets/Screenshot%202026-03-24%20171723.png)

### Posts

Full post history. Click `▶` on any entry to reveal the exact system + user prompt the AI received when generating it.

![Posts tab](docs/assets/Screenshot%202026-03-24%20171824.png)

### News Sources

Add and manage RSS feeds and web URLs. Toggle individual sources on/off without deleting them.

![News Sources tab](docs/assets/Screenshot%202026-03-24%20171835.png)

---

## Tech Stack

**Service**
- [Bun](https://bun.sh) — runtime, SQLite (`bun:sqlite`), HTTP server
- [openai](https://www.npmjs.com/package/openai) — AI client (OpenAI-compatible)
- [rss-parser](https://www.npmjs.com/package/rss-parser) — RSS feed fetching
- OAuth 1.0a signing — implemented manually with built-in `crypto` (no external Twitter SDK)

**Dashboard**
- [Tauri v2](https://tauri.app) — native desktop shell (Rust)
- [React 19](https://react.dev) + [TypeScript](https://www.typescriptlang.org)
- [Tailwind CSS v4](https://tailwindcss.com)
- [Radix UI](https://www.radix-ui.com) primitives + shadcn-compatible components
- [Vite](https://vitejs.dev) — frontend bundler

---

## Project Structure

```
virtualMe/
├── service/
│   └── src/
│       ├── index.ts          # Entry point — Bun.serve()
│       ├── scheduler.ts      # 60s tick loop, task registry
│       ├── bot-engine.ts     # runPostCycle / runReplyCycle / runReadCycle
│       ├── ai-client.ts      # generatePost / generateReply (returns text + stored prompt)
│       ├── x-client.ts       # OAuth 1.0a, createPost, createReply, getHomeTimeline
│       ├── news.ts           # RSS + URL fetching, content dedup
│       ├── search.ts         # DuckDuckGo context enrichment
│       ├── db.ts             # SQLite schema + query helpers
│       ├── config.ts         # Two-layer config (env defaults + DB overrides)
│       ├── routes.ts         # REST API handlers
│       ├── ws.ts             # WebSocket server
│       └── logger.ts         # Structured logger — DB + WebSocket broadcast
├── dashboard/
│   └── src/
│       ├── App.tsx           # Sidebar nav + tab routing
│       ├── lib/
│       │   ├── api-client.ts # Typed REST wrapper + auto-reconnecting WsClient
│       │   └── store.ts      # React hooks (useStats, useLogs, usePosts, …)
│       └── components/       # Feature components + shadcn-style UI primitives
├── shared/
│   └── types.ts              # Shared TypeScript interfaces (Post, LogEntry, BotConfig, …)
└── service/.env.example
```

---

## Troubleshooting

**Service won't start — "lock file exists"**
Delete `service/bot.lock`. It's left behind when the process is killed without a clean shutdown.

**Replies never fire**
The reply cycle only triggers every 4 hours, and the default `REPLY_PROBABILITY` of `0.4` means 60% of those attempts are skipped. Also check that the timeline cache is populated — use the **Read Timeline** button in the dashboard first.

**AI returns empty content**
If `finish_reason` is `length` in the logs, increase `max_tokens` or switch to a non-reasoning model. Reasoning models (DeepSeek-R1, etc.) consume extra tokens for their chain-of-thought.

**Windows: dashboard won't start**
Make sure you're using `bun tauri dev` from inside the `dashboard/` directory. A root-level `bunfig.toml` can break Bun's bin resolution — the Tauri config uses `node_modules\.bin\vite.exe` directly as a workaround.

---

## License

MIT
