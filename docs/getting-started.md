# Getting Started

## Prerequisites

| Tool | Version | Purpose |
|---|---|---|
| [Bun](https://bun.sh) | ≥ 1.1 | Runtime for the service (and dashboard build tooling) |
| [Rust + cargo](https://rustup.rs) | stable | Required by Tauri to build the dashboard |
| An X Developer account | — | OAuth 1.0a credentials |
| An AI provider | — | LM Studio, Ollama, OpenRouter, or any OpenAI-compatible endpoint |

---

## 1 — Clone and install dependencies

```bash
git clone <repo-url> virtualMe
cd virtualMe
bun install          # root workspace deps
cd service && bun install
cd ../dashboard && bun install
```

---

## 2 — Generate a service secret

The service requires a shared secret to authenticate the dashboard. Generate one now:

```bash
cd service
bun scripts/generate-secret.ts
```

Output:

```
  Generated SERVICE_SECRET:

  SERVICE_SECRET=4b9a1f3e8c2d7a6b0e5f1c3d9b2a4e7f...

  Add this line to your service/.env file.
```

Copy the printed line — you will need it in the next step and again when setting up the dashboard.

---

## 3 — Configure the service

```bash
cp service/.env.example service/.env
```

Open `service/.env` and fill in every value:

```env
# ── X (Twitter) OAuth 1.0a ───────────────────────────────
X_API_KEY=...            # "API Key" from developer.twitter.com
X_API_SECRET=...         # "API Key Secret"
X_ACCESS_TOKEN=...       # "Access Token"  (your own account)
X_ACCESS_SECRET=...      # "Access Token Secret"
X_USER_ID=...            # Numeric user ID (not @handle)

# ── AI provider ──────────────────────────────────────────
AI_BASE_URL=http://localhost:1234/v1   # LM Studio default
AI_MODEL=lmstudio-community/Meta-Llama-3.1-8B-Instruct-GGUF
AI_API_KEY=lm-studio                  # arbitrary for local models

# ── Service ──────────────────────────────────────────────
SERVICE_PORT=3000
SERVICE_HOST=0.0.0.0     # 127.0.0.1 to restrict to localhost only
SERVICE_SECRET=4b9a1f3e8c2d7a...    # paste your generated secret here

# ── Bot defaults (can be changed at runtime in the dashboard) ──
POLL_INTERVAL_MINUTES=480   # 8 h — safe for X free tier (~100 reads/month)
POST_FREQUENCY_HOURS=2
MAX_POSTS_PER_DAY=5
MAX_REPLIES_PER_DAY=3
```

### Getting X credentials

1. Go to [developer.twitter.com](https://developer.twitter.com/en/portal/dashboard)
2. Create a project and an app
3. Under *User authentication settings*, enable **OAuth 1.0a** with **Read and Write** permissions
4. Generate *Access Token and Secret* — these are bound to your own account
5. Copy all four keys plus your numeric User ID

Your numeric User ID can be found at `https://tweeterid.com` or via the API.

### AI provider options

| Provider | AI_BASE_URL | Notes |
|---|---|---|
| LM Studio | `http://localhost:1234/v1` | Local, free, requires GPU/CPU |
| Ollama | `http://localhost:11434/v1` | Local, free |
| OpenRouter | `https://openrouter.ai/api/v1` | Cloud, pay-per-token |
| OpenAI | `https://api.openai.com/v1` | Cloud, pay-per-token |

For local models, any model that follows instruction format works. 7B–14B models are sufficient.

---

## 4 — Run the service

```bash
cd service
bun run src/index.ts
```

You should see log output like:

```
[info] service  Starting virtualMe service on port 3000
[info] db       Database initialised at bot.db
[info] scheduler Scheduler started (tick every 60s)
```

The service is now running. It will:
- Immediately begin the first news fetch
- Post on the schedule defined in config
- Never post more than the budget allows

### Development mode (auto-restart on file change)

```bash
bun --watch src/index.ts
```

### Lock file

The service writes a `bot.lock` file with its PID on start and deletes it on clean exit. If the process crashes, the stale lock file prevents a second instance from starting. Delete it manually:

```bash
rm service/bot.lock
```

---

## 5 — Open the dashboard

```bash
cd dashboard
bun tauri dev
```

On first launch a **Connection Settings** dialog appears — the dashboard cannot be used until it is filled in:

| Field | Value |
|---|---|
| **Service URL** | `http://localhost:3000` (or wherever the service is running) |
| **Service Secret** | The value of `SERVICE_SECRET` from your `.env` |

Click **Connect**. The dashboard stores both values in `localStorage` and will use them for every subsequent launch.

**Changing connection settings later:**
Click the **pencil icon** next to the connection status badge in the sidebar to reopen the dialog.

---

## 6 — Add your first news source

1. Open the **News Sources** tab
2. Select type: **RSS** or **URL**
3. Enter a name and the feed/page URL
4. Click **Add**

Good RSS sources: tech blogs, Hacker News (`https://news.ycombinator.com/rss`), The Verge, etc.

The service fetches all enabled sources every hour and stores new items in the database. Fetched items are used at most once for post generation.

---

## 7 — Trigger your first post

Go to the **Overview** tab and click **Post Now**. This bypasses the schedule timer (but still respects the monthly/daily budget). Watch the **Live Logs** tab to see what happens in real time.

---

## Running the service as a background process

### systemd (Linux)

```ini
[Unit]
Description=virtualMe bot service
After=network.target

[Service]
WorkingDirectory=/opt/virtualMe/service
ExecStart=/usr/local/bin/bun run src/index.ts
Restart=on-failure
EnvironmentFile=/opt/virtualMe/service/.env

[Install]
WantedBy=multi-user.target
```

```bash
sudo systemctl enable --now virtualme
```

### Windows (Task Scheduler or NSSM)

Use [NSSM](https://nssm.cc) to wrap `bun run src/index.ts` as a Windows service, with `service/` as the working directory.

### PM2

```bash
pm2 start "bun run src/index.ts" --name virtualme --cwd service
pm2 save
```

---

## Connecting the dashboard to a remote service

The dashboard is a desktop app that talks to the service over HTTP and WebSocket. They do not need to run on the same machine.

If the service runs on a server:
- Make sure port 3000 is reachable (firewall, VPN, reverse proxy)
- In the dashboard sidebar, change the service URL to the server's address

See [Architecture — Hosting Split](architecture.md#hosting-split) for more detail.
