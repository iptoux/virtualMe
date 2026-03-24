import * as crypto from "crypto";
import type { Database } from "bun:sqlite";
import { getCurrentBudget, incrementPostsUsed, incrementReadsUsed, countPostsToday } from "./db";
import { logger } from "./logger";
import { getConfig } from "./config";
import { X_CONFIG } from "./config";

export interface XTweet {
  id: string;
  text: string;
  author_id?: string;
  author_username?: string;
}

export interface XCreateResult {
  id: string;
  text: string;
}

class XApiError extends Error {
  constructor(public status: number, message: string, public detail?: unknown) {
    super(message);
    this.name = "XApiError";
  }
}

function xApiMeta(err: unknown): Record<string, unknown> | undefined {
  if (err instanceof XApiError) {
    return { status: err.status, detail: err.detail };
  }
  return undefined;
}

// OAuth 1.0a signature generation
function buildOAuthHeader(
  method: string,
  url: string,
  params: Record<string, string> = {}
): string {
  const oauthParams: Record<string, string> = {
    oauth_consumer_key: X_CONFIG.apiKey,
    oauth_nonce: crypto.randomBytes(16).toString("hex"),
    oauth_signature_method: "HMAC-SHA1",
    oauth_timestamp: Math.floor(Date.now() / 1000).toString(),
    oauth_token: X_CONFIG.accessToken,
    oauth_version: "1.0",
  };

  const allParams = { ...params, ...oauthParams };
  const sortedParams = Object.keys(allParams)
    .sort()
    .map((k) => `${pct(k)}=${pct(allParams[k])}`)
    .join("&");

  const baseString = [method.toUpperCase(), pct(url), pct(sortedParams)].join("&");
  const signingKey = `${pct(X_CONFIG.apiSecret)}&${pct(X_CONFIG.accessSecret)}`;
  const signature = crypto.createHmac("sha1", signingKey).update(baseString).digest("base64");

  oauthParams.oauth_signature = signature;

  const headerValue = Object.keys(oauthParams)
    .sort()
    .map((k) => `${pct(k)}="${pct(oauthParams[k])}"`)
    .join(", ");

  return `OAuth ${headerValue}`;
}

function pct(str: string): string {
  return encodeURIComponent(str).replace(/!/g, "%21").replace(/'/g, "%27").replace(/\(/g, "%28").replace(/\)/g, "%29").replace(/\*/g, "%2A");
}

async function xFetch(
  method: string,
  url: string,
  queryParams: Record<string, string> = {},
  body?: unknown
): Promise<unknown> {
  const fullUrl = queryParams && Object.keys(queryParams).length > 0
    ? `${url}?${new URLSearchParams(queryParams).toString()}`
    : url;

  const oauthHeader = buildOAuthHeader(method, url, queryParams);

  const headers: Record<string, string> = {
    Authorization: oauthHeader,
    "Content-Type": "application/json",
  };

  const res = await fetch(fullUrl, {
    method,
    headers,
    body: body ? JSON.stringify(body) : undefined,
  });

  if (!res.ok) {
    const text = await res.text();
    let detail: unknown;
    try { detail = JSON.parse(text); } catch { detail = text; }
    throw new XApiError(res.status, `X API error ${res.status}`, detail);
  }

  return res.json();
}

// === Budget checks ===
export function canPost(db: Database): boolean {
  const budget = getCurrentBudget(db);
  const cfg = getConfig();
  const postsToday = countPostsToday(db, "post");
  const repliesToday = countPostsToday(db, "reply");
  const totalToday = postsToday + repliesToday;

  // Reserve 5% of monthly budget
  const reserve = Math.floor(budget.posts_limit * 0.05);
  const usableLimit = budget.posts_limit - reserve;

  return budget.posts_used < usableLimit && totalToday < (cfg.max_posts_per_day + cfg.max_replies_per_day);
}

export function canRead(db: Database): boolean {
  const budget = getCurrentBudget(db);
  const reserve = Math.floor(budget.reads_limit * 0.05);
  const usableLimit = budget.reads_limit - reserve;
  return budget.reads_used < usableLimit;
}

export function getBudgetWarning(db: Database): { posts: number; reads: number } | null {
  const budget = getCurrentBudget(db);
  const postsRemaining = (budget.posts_limit - budget.posts_used) / budget.posts_limit;
  const readsRemaining = (budget.reads_limit - budget.reads_used) / budget.reads_limit;

  if (postsRemaining < 0.2 || readsRemaining < 0.2) {
    return {
      posts: Math.round(postsRemaining * 100),
      reads: Math.round(readsRemaining * 100),
    };
  }
  return null;
}

// === API calls ===
export async function getHomeTimeline(db: Database, maxResults = 100, sinceId?: string): Promise<XTweet[]> {
  if (!canRead(db)) {
    logger.warn("x-api", "Read budget exhausted — skipping timeline fetch");
    return [];
  }
  if (!X_CONFIG.userId) {
    logger.warn("x-api", "X_USER_ID not configured — skipping timeline fetch");
    return [];
  }

  try {
    const url = `https://api.x.com/2/users/${X_CONFIG.userId}/timelines/reverse_chronological`;
    const params: Record<string, string> = {
      max_results: String(Math.min(maxResults, 100)),
      "tweet.fields": "author_id,text",
      "expansions": "author_id",
      "user.fields": "username",
    };
    if (sinceId) params.since_id = sinceId;

    const data = await xFetch("GET", url, params) as any;
    incrementReadsUsed(db);

    const tweets: XTweet[] = (data.data ?? []).map((t: any) => {
      const user = (data.includes?.users ?? []).find((u: any) => u.id === t.author_id);
      return {
        id: t.id,
        text: t.text,
        author_id: t.author_id,
        author_username: user?.username,
      };
    });

    logger.info("x-api", `Fetched ${tweets.length} tweets from timeline`);
    return tweets;
  } catch (err) {
    logger.error("x-api", `Failed to fetch timeline: ${err instanceof Error ? err.message : String(err)}`, xApiMeta(err));
    return [];
  }
}

/** Split long text into tweet-sized chunks at sentence/word boundaries. */
export function splitIntoThread(text: string, maxLength: number): string[] {
  if (text.length <= maxLength) return [text];

  const chunks: string[] = [];
  let remaining = text.trim();

  while (remaining.length > 0) {
    if (remaining.length <= maxLength) {
      chunks.push(remaining);
      break;
    }

    // Try to cut at sentence boundary within the limit
    const window = remaining.slice(0, maxLength);
    const sentenceEnd = Math.max(
      window.lastIndexOf(". "),
      window.lastIndexOf("! "),
      window.lastIndexOf("? "),
      window.lastIndexOf(".\n"),
    );

    let cutAt: number;
    if (sentenceEnd > maxLength * 0.5) {
      cutAt = sentenceEnd + 1; // include the punctuation
    } else {
      // Fall back to last word boundary
      const wordEnd = window.lastIndexOf(" ");
      cutAt = wordEnd > 0 ? wordEnd : maxLength;
    }

    chunks.push(remaining.slice(0, cutAt).trim());
    remaining = remaining.slice(cutAt).trim();
  }

  // Add thread numbering if more than one chunk
  if (chunks.length > 1) {
    return chunks.map((c, i) => `${c} (${i + 1}/${chunks.length})`);
  }
  return chunks;
}

/** Post a thread: first tweet + replies for each subsequent chunk. */
export async function createThread(db: Database, tweets: string[]): Promise<XCreateResult[] | null> {
  if (tweets.length === 0) return null;

  const results: XCreateResult[] = [];

  for (let i = 0; i < tweets.length; i++) {
    if (!canPost(db)) {
      logger.warn("x-api", `Thread cut short at ${i}/${tweets.length} — budget exhausted`);
      break;
    }

    let result: XCreateResult | null;
    if (i === 0) {
      result = await createPost(db, tweets[i]);
    } else {
      result = await createReply(db, tweets[i], results[i - 1].id);
    }

    if (!result) {
      logger.error("x-api", `Thread failed at tweet ${i + 1}/${tweets.length}`);
      return results.length > 0 ? results : null;
    }
    results.push(result);
  }

  return results;
}

export async function createPost(db: Database, text: string): Promise<XCreateResult | null> {
  if (!canPost(db)) {
    logger.warn("x-api", "Post budget exhausted — skipping post creation");
    return null;
  }

  try {
    const data = await xFetch("POST", "https://api.x.com/2/tweets", {}, { text }) as any;
    incrementPostsUsed(db);
    logger.info("x-api", `Created post: ${data.data.id}`);
    return { id: data.data.id, text: data.data.text };
  } catch (err) {
    logger.error("x-api", `Failed to create post: ${err instanceof Error ? err.message : String(err)}`, xApiMeta(err));
    return null;
  }
}

export async function createReply(db: Database, text: string, inReplyToId: string): Promise<XCreateResult | null> {
  if (!canPost(db)) {
    logger.warn("x-api", "Post budget exhausted — skipping reply creation");
    return null;
  }

  try {
    const data = await xFetch("POST", "https://api.x.com/2/tweets", {}, {
      text,
      reply: { in_reply_to_tweet_id: inReplyToId },
    }) as any;
    incrementPostsUsed(db);
    logger.info("x-api", `Created reply to ${inReplyToId}: ${data.data.id}`);
    return { id: data.data.id, text: data.data.text };
  } catch (err) {
    logger.error("x-api", `Failed to create reply: ${err instanceof Error ? err.message : String(err)}`, xApiMeta(err));
    return null;
  }
}
