# Configuration Reference

All settings have two layers:
1. **`.env` defaults** — read once at startup, never mutated at runtime
2. **DB overrides** — set via dashboard or `PATCH /api/config`, persist across restarts

`getConfig()` always returns the merged result. DB values win over `.env`.

---

## AI Provider

| Key | Type | Default | Description |
|---|---|---|---|
| `ai_base_url` | string | `http://localhost:1234/v1` | Base URL of any OpenAI-compatible endpoint |
| `ai_model` | string | `lmstudio-community/Meta-Llama-3.1-8B-Instruct-GGUF` | Model identifier passed to the API |
| `ai_api_key` | string | `lm-studio` | API key (use any string for local models) |

### Provider examples

```
# LM Studio (default)
ai_base_url=http://localhost:1234/v1
ai_model=lmstudio-community/Meta-Llama-3.1-8B-Instruct-GGUF
ai_api_key=lm-studio

# Ollama
ai_base_url=http://localhost:11434/v1
ai_model=llama3.1
ai_api_key=ollama

# OpenRouter
ai_base_url=https://openrouter.ai/api/v1
ai_model=anthropic/claude-haiku
ai_api_key=sk-or-...

# OpenAI
ai_base_url=https://api.openai.com/v1
ai_model=gpt-4o-mini
ai_api_key=sk-...
```

The AI client is recreated live when `ai_base_url` changes. No restart needed.

---

## Scheduling

| Key | Type | Default | Description |
|---|---|---|---|
| `poll_interval_minutes` | number | `480` | How often to fetch the X home timeline (minutes). Default is 8 h. |
| `post_frequency_hours` | number | `2` | Minimum gap between generated posts (hours) |
| `reply_probability` | number | `0.5` | Probability (0–1) that a reply is attempted when the reply timer fires |
| `max_posts_per_day` | number | `5` | Hard cap: posts generated per calendar day |
| `max_replies_per_day` | number | `3` | Hard cap: replies generated per calendar day |
| `active_hours_start` | number | `8` | Hour (0–23) at which the bot becomes active |
| `active_hours_end` | number | `23` | Hour (0–23) at which the bot stops posting |

### Why 480 minutes for poll_interval?

X's free tier allows approximately **100 timeline reads per month** (~3.3/day). At 30-minute intervals that's 48 reads/day — exhausted in 2 days. At 8-hour intervals it's 3/day, within budget. The env var is named `POLL_INTERVAL_MINUTES` for clarity but the safe default is `480`.

### Active hours window

The bot only posts and replies between `active_hours_start` and `active_hours_end` (inclusive, local server time). Tasks scheduled outside this window are silently skipped and retried on the next tick. News fetching and timeline reads are **not** affected by active hours.

---

## Post Content

| Key | Type | Default | Description |
|---|---|---|---|
| `max_tweet_length` | number | `260` | Maximum characters per tweet chunk. Twitter's actual limit is 280, keeping 20 chars spare for safety. |
| `enable_threads` | boolean | `false` | Allow multi-tweet threads when the AI generates long content |

### Thread mode

When `enable_threads = true`:
- Long posts are split at sentence/word boundaries
- Each chunk is labelled `(1/N)`, `(2/N)`, etc.
- The source URL (if any) is appended to the last chunk only

When `false`, output is capped at 260 characters and the rest is discarded.

---

## API Budget

| Key | Type | Default | Description |
|---|---|---|---|
| `posts_limit` | number | `450` | Monthly posts budget (X free tier ≈ 500, keeping 50 spare) |
| `reads_limit` | number | `90` | Monthly reads budget (X free tier ≈ 100, keeping 10 spare) |

These limits are stored in `api_budget` (one row per calendar month). The service tracks usage automatically. A **5% reserve** is kept above these limits so manual dashboard triggers always have headroom.

A budget warning is broadcast over WebSocket when either resource drops below **20% remaining**.

---

## Persona Prompt

| Key | Type | Description |
|---|---|---|
| `persona_prompt` | string | Full system prompt given to the AI before every generation. |

This is the most important setting. It defines the bot's voice, topics, and rules.

### Built-in output rules (appended automatically)

The service always appends the following rules to your persona prompt — you do not need to repeat them:

```
Output rules (follow strictly):
- Output ONLY the post text. No labels, no preamble, no "Here's a tweet:", no explanations.
- No markdown (no **, no *, no backticks, no headers)
- No em-dashes (—). Use a comma, period, or nothing instead.
- No emojis
- Hashtags: 0 to 2, only if they fit naturally. Never force them.
- [length rule based on enable_threads setting]
- Must NOT cover the same topic as any of these recent posts:
  [recent post list]
```

### Default persona (excerpt)

The default persona is a blunt, critical tech commentator. Key rules embedded:

- **Language detection**: detects the language of the source article/tweet and writes in that language (German for German sources, English for English sources)
- **Single-topic focus**: picks one news item and stays on it — never blends two stories
- **Criticism guardrails**: criticises ideas and decisions, never attacks individuals personally

You can fully replace this in the Config tab or via `PATCH /api/config`.

---

## Service Network

These are `.env`-only settings (not runtime-changeable):

| Key | Default | Description |
|---|---|---|
| `PORT` | `3000` | TCP port the service listens on |
| `HOST` | `0.0.0.0` | Bind address. Use `127.0.0.1` to restrict to localhost only. |

---

## Environment Variables Reference

Full `.env.example`:

```env
# X API (OAuth 1.0a) — required
X_API_KEY=
X_API_SECRET=
X_ACCESS_TOKEN=
X_ACCESS_SECRET=
X_USER_ID=

# AI provider
AI_BASE_URL=http://localhost:1234/v1
AI_MODEL=lmstudio-community/Meta-Llama-3.1-8B-Instruct-GGUF
AI_API_KEY=lm-studio

# Service network
PORT=3000
HOST=0.0.0.0

# Bot defaults (overridable at runtime via dashboard)
POLL_INTERVAL_MINUTES=480
POST_FREQUENCY_HOURS=2
MAX_POSTS_PER_DAY=5
MAX_REPLIES_PER_DAY=3
REPLY_PROBABILITY=0.5
ACTIVE_HOURS_START=8
ACTIVE_HOURS_END=23
MAX_TWEET_LENGTH=260
ENABLE_THREADS=false
POSTS_LIMIT=450
READS_LIMIT=90
```

---

## Runtime vs Restart-Required Changes

| Setting category | Runtime change | Requires restart |
|---|---|---|
| AI provider URL / model / key | Yes (dashboard or API) | No |
| All scheduling settings | Yes | No |
| Persona prompt | Yes | No |
| Post content settings | Yes | No |
| X API credentials | No | Yes (in `.env`) |
| Service port / host | No | Yes (in `.env`) |
