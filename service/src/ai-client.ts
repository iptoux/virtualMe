import OpenAI from "openai";
import { getConfig } from "./config";
import { logger } from "./logger";

let _client: OpenAI | null = null;
let _lastBaseUrl = "";
let _lastModel = "";

function getClient(): OpenAI {
  const cfg = getConfig();
  if (!_client || cfg.ai_base_url !== _lastBaseUrl) {
    _client = new OpenAI({
      baseURL: cfg.ai_base_url,
      apiKey: cfg.ai_api_key,
    });
    _lastBaseUrl = cfg.ai_base_url;
    _lastModel = cfg.ai_model;
    logger.info("ai", `AI client configured: ${cfg.ai_base_url}/chat/completions (model: ${cfg.ai_model})`);
  }
  return _client;
}

export interface PostContext {
  newsItems: string[];
  recentTimeline: string[];
  recentPosts: string[];
  sourceUrl?: string; // URL of the news item being referenced
}

export interface ReplyContext {
  tweetText: string;
  authorUsername: string | null;
  recentPosts: string[];
}

const MIN_TWEET_LENGTH = 20;

function isValidTweet(text: string, maxLength: number): boolean {
  const trimmed = text.trim();
  return trimmed.length >= MIN_TWEET_LENGTH && trimmed.length <= maxLength;
}

function isTooSimilar(text: string, recentPosts: string[]): boolean {
  const normalize = (s: string) =>
    s.toLowerCase().replace(/[^a-z0-9\s]/g, "").replace(/\s+/g, " ").trim();
  const stopWords = new Set(["the","a","an","is","it","in","on","of","to","and","or","for","with","that","this","was","are","be","at","by"]);
  const keywords = (s: string) => normalize(s).split(" ").filter((w) => w.length > 3 && !stopWords.has(w));

  const candidateKeys = new Set(keywords(text));
  return recentPosts.some((p) => {
    const existingKeys = keywords(p);
    if (!existingKeys.length) return false;
    const overlap = existingKeys.filter((w) => candidateKeys.has(w)).length;
    return overlap / Math.max(existingKeys.length, 1) > 0.4; // stricter: 40% keyword overlap
  });
}

export async function generatePost(context: PostContext): Promise<string | null> {
  const cfg = getConfig();
  const client = getClient();

  const newsContext = context.newsItems.slice(0, 3).join("\n---\n");
  const timelineContext = context.recentTimeline.slice(0, 5).join("\n");

  const recentTopics = context.recentPosts.slice(0, 5).map((p, i) => `${i + 1}. ${p.slice(0, 80)}`).join("\n");
  // URLs on X are always 23 chars via t.co shortener
  const urlReserve = context.sourceUrl ? 24 : 0;
  // When threads are enabled the AI can write up to 3 tweet-lengths; code handles splitting
  const maxContentLength = cfg.enable_threads
    ? cfg.max_tweet_length * 3 - urlReserve
    : cfg.max_tweet_length - urlReserve;

  const lengthRule = cfg.enable_threads
    ? `- Write up to ${maxContentLength} characters total. Content longer than ${cfg.max_tweet_length} chars will be split into a thread automatically — write naturally, do NOT add numbering like (1/3) yourself.`
    : `- Must be under ${cfg.max_tweet_length} characters total.`;

  const urlNote = context.sourceUrl
    ? `\n\nA source link will be appended automatically at the end. Do NOT include any URL yourself. Write only the commentary text (max ${maxContentLength} chars).`
    : "";

  const userPrompt = newsContext
    ? `Use ONE of these news items as inspiration (pick the most interesting angle, do NOT summarize it directly):\n${newsContext}${urlNote}`
    : timelineContext
    ? `Inspired by this timeline activity, write an original take:\n${timelineContext}`
    : "Write an interesting original thought about technology, software, or AI.";

  for (let attempt = 0; attempt < 3; attempt++) {
    try {
      const response = await client.chat.completions.create({
        model: cfg.ai_model,
        messages: [
          {
            role: "system",
            content: `${cfg.persona_prompt}

Output rules (follow strictly):
- Output ONLY the post text. No labels, no preamble, no "Here's a tweet:", no explanations.
- NO markdown: no *asterisks*, no **bold**, no _underscores_, no backticks
- NO em dashes or hyphens for sentence flow. Use commas or periods instead.
- NO emojis
- Hashtags: 0 to 2, only if they fit naturally. Never force them.
${lengthRule}
- Must NOT cover the same topic as any of these recent posts:
${recentTopics || "  (no recent posts yet)"}`,
          },
          { role: "user", content: userPrompt },
        ],
        // Reasoning models (e.g. DeepSeek-R1, nemotron) need extra tokens to finish
        // their chain-of-thought before writing the actual answer — keep at least 1024
        max_tokens: Math.max(1024, cfg.max_tweet_length * 4),
        temperature: 0.9,
      });

      const msg = response.choices?.[0]?.message as any;
      // Reasoning models put the answer in `content`; fall back to `reasoning_content`
      // only as last resort (it's the scratchpad, so extract the last proposed tweet line)
      let text = msg?.content?.trim() ?? "";
      if (!text && msg?.reasoning_content) {
        // Try to extract the last non-empty line as the tweet candidate
        const lines = (msg.reasoning_content as string).split("\n").map((l: string) => l.trim()).filter(Boolean);
        const candidate = lines[lines.length - 1] ?? "";
        if (candidate.length >= MIN_TWEET_LENGTH) {
          logger.warn("ai", `Model returned empty content — using last reasoning line as fallback`);
          text = candidate;
        }
      }

      if (!text) {
        const finishReason = response.choices?.[0]?.finish_reason;
        logger.warn("ai", `AI returned empty content (attempt ${attempt + 1}, finish_reason: ${finishReason ?? "unknown"}) — if finish_reason is "length", increase max_tokens or use a non-reasoning model`);
        continue;
      }
      // Strip em dashes — model reliably ignores the instruction
      text = text.replace(/\s*—\s*/g, ", ").replace(/,\s*,/g, ",").trim();

      if (text.trim().length < MIN_TWEET_LENGTH) {
        logger.warn("ai", `Generated post too short (attempt ${attempt + 1}): ${text.length} chars`);
        continue;
      }
      if (isTooSimilar(text, context.recentPosts)) {
        logger.warn("ai", `Generated post too similar to recent posts (attempt ${attempt + 1})`);
        continue;
      }

      return text;
    } catch (err) {
      logger.error("ai", `Failed to generate post (attempt ${attempt + 1}): ${err instanceof Error ? err.message : String(err)}`);
      if (attempt === 2) return null;
    }
  }

  return null;
}

export async function generateReply(context: ReplyContext): Promise<string | null> {
  const cfg = getConfig();
  const client = getClient();

  for (let attempt = 0; attempt < 3; attempt++) {
    try {
      const response = await client.chat.completions.create({
        model: cfg.ai_model,
        messages: [
          {
            role: "system",
            content: `${cfg.persona_prompt}

Output rules (follow strictly):
- Output ONLY the reply text. No labels, no preamble, no intro phrases.
- NO markdown: no *asterisks*, no **bold**, no _underscores_, no backticks
- NO em dashes or hyphens for sentence flow. Use commas or periods instead.
- NO emojis
- Hashtags: 0 to 1, only if genuinely fitting. Never force them.
- Must be under ${cfg.max_tweet_length} characters. Replies are always a single tweet, never a thread.
- Be direct and add value. Not sycophantic, not diplomatic.`,
          },
          {
            role: "user",
            content: `Reply to this tweet${context.authorUsername ? ` by @${context.authorUsername}` : ""}:\n"${context.tweetText}"`,
          },
        ],
        max_tokens: Math.max(1024, cfg.max_tweet_length * 4),
        temperature: 0.8,
      });

      const msg = response.choices?.[0]?.message as any;
      let text = msg?.content?.trim() ?? "";
      if (!text && msg?.reasoning_content) {
        const lines = (msg.reasoning_content as string).split("\n").map((l: string) => l.trim()).filter(Boolean);
        const candidate = lines[lines.length - 1] ?? "";
        if (candidate.length >= MIN_TWEET_LENGTH) {
          logger.warn("ai", `Model returned empty content — using last reasoning line as fallback`);
          text = candidate;
        }
      }

      if (!text) {
        const finishReason = response.choices?.[0]?.finish_reason;
        logger.warn("ai", `AI returned empty content (attempt ${attempt + 1}, finish_reason: ${finishReason ?? "unknown"}) — if finish_reason is "length", increase max_tokens or use a non-reasoning model`);
        continue;
      }
      // Strip em dashes — model reliably ignores the instruction
      text = text.replace(/\s*—\s*/g, ", ").replace(/,\s*,/g, ",").trim();

      if (!isValidTweet(text, cfg.max_tweet_length)) {
        logger.warn("ai", `Generated reply failed length check (attempt ${attempt + 1}): ${text.length} chars (max ${cfg.max_tweet_length})`);
        continue;
      }
      if (isTooSimilar(text, context.recentPosts)) {
        logger.warn("ai", `Generated reply too similar to recent posts (attempt ${attempt + 1})`);
        continue;
      }

      return text;
    } catch (err) {
      logger.error("ai", `Failed to generate reply (attempt ${attempt + 1}): ${err instanceof Error ? err.message : String(err)}`);
      if (attempt === 2) return null;
    }
  }

  return null;
}
