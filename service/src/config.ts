import type { Database } from "bun:sqlite";
import type { BotConfig } from "../../shared/types";
import { configGet, configSet, configGetAll } from "./db";

const DEFAULTS: BotConfig = {
  poll_interval_minutes: Number(process.env.POLL_INTERVAL_MINUTES ?? 480),
  ai_base_url: process.env.AI_BASE_URL ?? "http://localhost:1234/v1",
  ai_model: process.env.AI_MODEL ?? "local-model",
  ai_api_key: process.env.AI_API_KEY ?? "not-needed",
  post_frequency_hours: Number(process.env.POST_FREQUENCY_HOURS ?? 2.5),
  reply_probability: Number(process.env.REPLY_PROBABILITY ?? 0.4),
  max_posts_per_day: Number(process.env.MAX_POSTS_PER_DAY ?? 10),
  max_replies_per_day: Number(process.env.MAX_REPLIES_PER_DAY ?? 6),
  active_hours_start: Number(process.env.ACTIVE_HOURS_START ?? 8),
  active_hours_end: Number(process.env.ACTIVE_HOURS_END ?? 23),
  max_tweet_length: Number(process.env.MAX_TWEET_LENGTH ?? 280),
  enable_threads: (process.env.ENABLE_THREADS ?? "true") === "true",
  persona_prompt:
    process.env.PERSONA_PROMPT ??
    `You are a blunt, opinionated developer/admin writing X posts. Style: direct, dry, sometimes sarcastic. No fluff, no corporate tone, no AI slop.

Voice and tone:
- Confident and critical. Call out bad tech, fake innovation, PR nonsense, and incompetence without softening it.
- Short punchy statements, not explanations or storytelling.
- Natural, slightly informal English. Tech terms used as-is.
- If the angle fits, end with a short punchline.

Topics you care about:
- IT, Linux, Python, server admin, self-hosting, AI, local software, security
- Bad products, bad management, bureaucracy, security theater, hype cycles
- Sharp tech or social commentary with a no-nonsense angle

Never: sound polished, cheerful, or diplomatic. Never use LinkedIn-style wording, generic AI filler phrases, intro labels, or motivational framing.`,
};

let _db: Database | null = null;
const _changeListeners: Array<(config: BotConfig) => void> = [];

export function initConfig(db: Database): void {
  _db = db;
  // Seed env defaults into DB on first start (only for keys not yet stored)
  for (const [key, value] of Object.entries(DEFAULTS)) {
    const existing = configGet(db, key);
    if (existing === null) {
      configSet(db, key, String(value));
    }
  }
}

export function getConfig(): BotConfig {
  if (!_db) return { ...DEFAULTS };
  const stored = configGetAll(_db);
  return {
    ...DEFAULTS,
    ...Object.fromEntries(
      Object.entries(stored).map(([k, v]) => {
        const def = DEFAULTS[k as keyof BotConfig];
        if (typeof def === "number") return [k, Number(v)];
        if (typeof def === "boolean") return [k, v === "true"];
        return [k, v];
      })
    ),
  } as BotConfig;
}

export function setConfig(updates: Partial<BotConfig>): BotConfig {
  if (!_db) throw new Error("Config DB not initialized");
  for (const [key, value] of Object.entries(updates)) {
    configSet(_db, key, String(value));
  }
  const updated = getConfig();
  for (const listener of _changeListeners) listener(updated);
  return updated;
}

export function onConfigChange(listener: (config: BotConfig) => void): () => void {
  _changeListeners.push(listener);
  return () => {
    const idx = _changeListeners.indexOf(listener);
    if (idx !== -1) _changeListeners.splice(idx, 1);
  };
}

export const SERVICE_PORT = Number(process.env.SERVICE_PORT ?? 3000);
export const SERVICE_HOST = process.env.SERVICE_HOST ?? "0.0.0.0";

export const X_CONFIG = {
  apiKey: process.env.X_API_KEY ?? "",
  apiSecret: process.env.X_API_SECRET ?? "",
  accessToken: process.env.X_ACCESS_TOKEN ?? "",
  accessSecret: process.env.X_ACCESS_SECRET ?? "",
  userId: process.env.X_USER_ID ?? "",
};
