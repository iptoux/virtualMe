# Dashboard Guide

The dashboard is a Tauri desktop app that serves as a remote control for the service. It connects over HTTP and WebSocket — no bot logic lives here.

---

## Starting the Dashboard

```bash
cd dashboard
bun tauri dev      # development mode (hot reload)
bun tauri build    # build a release binary
```

On **first launch**, a Connection Settings dialog appears before anything else. Enter the service URL and your `SERVICE_SECRET` to proceed. These values are stored in `localStorage` and used for all future launches.

---

## Sidebar

The sidebar is always visible. It contains:
- **App title** — virtualMe
- **Navigation tabs** — click to switch views
- **Connection status** — shows whether the dashboard has an active WebSocket connection to the service

### Connection Status & Settings

```
● Connected          ✏
http://localhost:3000
```

- The **coloured badge** (green = connected, red = disconnected) reflects the WebSocket state.
- The **pencil icon** opens the Connection Settings dialog.
- The **URL shown below** is the current service URL stored in `localStorage`.

**Connection Settings dialog** (pencil icon or click the URL):

| Field | Description |
|---|---|
| **Service URL** | HTTP base URL of the service, e.g. `http://localhost:3000` |
| **Service Secret** | Must match `SERVICE_SECRET` in the service `.env`. Use the show/hide toggle to verify. |

Click **Save & Reconnect** to apply. The WebSocket reconnects immediately and all subsequent REST calls include the updated credentials. Both values persist in `localStorage` across restarts.

> **First launch:** the dialog is mandatory and cannot be dismissed until both fields are filled. This ensures the dashboard is always authenticated before making any requests.

---

## Tab: Overview

The main control panel. Shows at a glance whether the bot is healthy and lets you trigger actions.

### Stats cards

| Card | What it shows |
|---|---|
| **Uptime** | Time since the service process started |
| **Posts today** | Posts generated today (resets at midnight local time) |
| **Replies today** | Replies generated today |
| **Scheduler** | Whether the scheduler is running or paused |

### API Budget bars

Two progress bars showing X API usage for the current calendar month:

- **Posts** — posts used vs monthly limit
- **Reads** — timeline fetches used vs monthly limit

Colour thresholds:
- Green: < 60% used
- Yellow: 60–80% used
- Red: > 80% used

### Controls

| Button | Action |
|---|---|
| **Start Bot** / **Stop Bot** | Start or stop the scheduler |
| **Post Now** | Generate and post immediately (ignores schedule, respects budget) |
| **Read Timeline** | Fetch home timeline and populate the reply cache |

Buttons show a loading spinner while the action is in progress.

### Next action

Below the controls, the timestamp of the next scheduled task is shown.

---

## Tab: Live Logs

A real-time scrolling log viewer.

### Log levels

| Level | Colour | Meaning |
|---|---|---|
| `info` | green | Normal operation |
| `warning` | yellow | Non-fatal issues, budget warnings |
| `error` | red | Failures (AI, X API, DB errors) |

### Log row layout

```
12:34:56  INFO   scheduler   Post cycle started
```

- Click any row with metadata to **expand it** and see the raw JSON.

### Toolbar

- **Entry count** — total entries shown
- **Scroll to latest** — jumps to the bottom if you've scrolled up
- **Clear** button — deletes all logs from the DB

Auto-scroll is active by default. It pauses when you scroll up manually, and resumes when you click "scroll to latest".

---

## Tab: Posts

History of all posted and attempted posts, newest first.

### Post row

```
[post] [posted]  Maik Roland Damm   12:34  [▶]
The tech industry's obsession with AI benchmarks...
ID: 1234567890123456789
```

- **Type badge**: `post` or `reply`
- **Status badge**: `posted` (green), `pending` (yellow), `failed` (red)
- **Timestamp** (right-aligned)
- **Expand button** `▶` / `▼` — shown only if an AI prompt was stored

### Expanding the AI prompt

Click the chevron icon (`▶`) on a post row to reveal the full prompt that was sent to the AI:

```
[SYSTEM]
You are a sharp, opinionated commentator...

[USER]
Use ONE of these news items as inspiration...
```

This is useful for debugging why the AI produced a particular output.

### Filters

Currently shows all types. Filter by `type=post` or `type=reply` via the API if needed.

### Toolbar

- **Clear** — deletes all post history from the DB (does not delete posts from X)

---

## Tab: News Sources

Manage the RSS feeds and web pages that provide content for post generation.

### Adding a source

1. Select **Type**: RSS or URL
2. Enter a **Name** (descriptive label)
3. Enter the **URL** (RSS feed URL or webpage URL)
4. Click **Add**

The source is immediately saved. The next hourly fetch cycle will include it.

### Source list

Each source shows:
- **Type badge** — RSS or URL
- **Name** — the label you gave it
- **URL** — the feed or page URL
- **Toggle** (green = enabled, grey = disabled) — click to enable/disable without deleting
- **Delete** button (trash icon)

Disabled sources are skipped during fetch cycles but remain in the database.

### What happens during a fetch?

The service fetches all enabled sources every hour. For each source:
- **RSS**: parses the feed, stores up to 20 new items
- **URL**: fetches the page, strips HTML, stores the first 2000 chars as one item

Items are deduplicated by SHA256 hash — the same content is never stored twice. Each item is marked `used` after it contributes to a generated post.

---

## Tab: Config

Edit all runtime bot settings. Changes are saved to the database immediately and take effect without restarting the service.

### AI Provider card

| Field | Description |
|---|---|
| **Base URL** | OpenAI-compatible endpoint (LM Studio, Ollama, OpenRouter, OpenAI) |
| **Model** | Model identifier string |
| **API Key** | Your API key (use any value for local models) |

### Scheduling card

| Field | Description |
|---|---|
| **Timeline poll interval** | How often to fetch the X home timeline (minutes). Keep ≥ 480 for free tier. |
| **Post frequency** | Minimum hours between generated posts |
| **Reply probability** | Chance (0–1) a reply is attempted when the reply timer fires |
| **Max posts per day** | Hard daily cap for posts |
| **Max replies per day** | Hard daily cap for replies |
| **Active hours start** | Hour (0–23) when the bot wakes up |
| **Active hours end** | Hour (0–23) when the bot goes to sleep |
| **Max tweet length** | Character limit per tweet chunk (≤ 280) |
| **Enable threads** | Allow multi-tweet threads for longer content |

### Persona Prompt card

A large text area containing the full system prompt sent to the AI before every generation.

This is the most impactful setting. The prompt defines the bot's:
- Voice and writing style
- Topics of interest
- Language rules (by default: match the source language)
- What to avoid (personal attacks, AI filler phrases, etc.)

The service appends its own **output rules** (no markdown, no emojis, length limits, topic deduplication) to whatever you write here. You don't need to include those yourself.

### Saving

Click **Save** to write all changes to the service DB. The service acknowledges the change and applies it immediately.
