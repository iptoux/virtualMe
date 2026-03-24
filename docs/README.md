# virtualMe — Documentation

**virtualMe** is an autonomous X (Twitter) bot that posts and replies on your behalf, driven by an AI persona you define. It monitors RSS feeds and web pages for news, enriches context with DuckDuckGo search, generates posts using any OpenAI-compatible LLM, and respects X's free-tier API budget automatically.

---

## Documentation Index

| Document | Audience | What it covers |
|---|---|---|
| [Getting Started](getting-started.md) | Users | Install, configure, first run |
| [Architecture](architecture.md) | Both | System design, service/dashboard split, data flow |
| [Service Reference](service-reference.md) | Developers | REST API, WebSocket, internals, all source modules |
| [Configuration](configuration.md) | Both | Every config option with defaults and advice |
| [Dashboard Guide](dashboard-guide.md) | Users | All dashboard tabs, controls, and indicators |
| [Development Guide](development-guide.md) | Developers | Adding features, module layout, conventions |

---

## What is virtualMe?

```
┌─────────────────────────────────────────────────┐
│                  virtualMe                       │
│                                                  │
│  service/  ←── runs 24/7, headless              │
│  dashboard/ ←── optional desktop control panel  │
└─────────────────────────────────────────────────┘
```

The **service** is a headless Bun process that:
- Fetches news from RSS feeds and web pages
- Enriches post context with DuckDuckGo search results
- Generates posts/replies via any OpenAI-compatible AI (local or cloud)
- Posts to X respecting monthly and daily rate limits
- Exposes a REST + WebSocket API for external control

The **dashboard** is a Tauri desktop app that:
- Connects to the running service via HTTP/WebSocket
- Visualises live stats, logs, posts, and API budget
- Lets you edit all config, manage news sources, and trigger actions manually
- Can connect to a service running on a different machine

The two are **fully independent**: the service runs fine without the dashboard open, and the dashboard is just a remote control — it does not contain any bot logic.

---

## Quick Overview

```
Your Machine (or server)          Your Desktop
┌──────────────────────┐         ┌──────────────────┐
│   service/           │   HTTP  │   dashboard/     │
│   Bun process        │◄───────►│   Tauri app      │
│   port 3000          │   WS    │   (React UI)     │
│   bot.db (SQLite)    │         └──────────────────┘
│   X API + AI API     │
└──────────────────────┘
         │
         ▼
    X (Twitter)
```
