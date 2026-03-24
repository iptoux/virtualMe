import type { Database } from "bun:sqlite";
import {
  insertPost,
  updatePostStatus,
  getRecentPostContents,
  getRandomTimelineTweet,
  getRandomTimelineTweets,
  getLatestCachedTweetId,
  markNewsItemUsed,
  upsertTimelineTweet,
  pruneTimelineCache,
} from "./db";
import { getHomeTimeline, createPost, createReply, createThread, splitIntoThread, canPost, canRead } from "./x-client";
import { generatePost, generateReply } from "./ai-client";
import { getNewsContext } from "./news";
import { logger } from "./logger";
import type { Post } from "../../shared/types";

type PostListener = (post: Post) => void;
const _postListeners: PostListener[] = [];
let _postCycleRunning = false;

export function onPostCreated(listener: PostListener): () => void {
  _postListeners.push(listener);
  return () => {
    const idx = _postListeners.indexOf(listener);
    if (idx !== -1) _postListeners.splice(idx, 1);
  };
}

function notifyPost(db: Database, id: number): void {
  // Re-fetch full post to notify listeners
  const post = db.query("SELECT * FROM posts WHERE id = ?").get(id) as Post | null;
  if (post) {
    for (const listener of _postListeners) listener(post);
  }
}

export async function runReadCycle(db: Database): Promise<number> {
  if (!canRead(db)) {
    logger.warn("scheduler", "Read budget exhausted — skipping timeline fetch");
    return 0;
  }

  const sinceId = getLatestCachedTweetId(db);
  logger.info("scheduler", `Starting timeline read cycle${sinceId ? ` (since_id: ${sinceId})` : " (full fetch)"}`);
  const tweets = await getHomeTimeline(db, 100, sinceId ?? undefined);

  for (const tweet of tweets) {
    upsertTimelineTweet(db, tweet.id, tweet.text, tweet.author_username);
  }

  pruneTimelineCache(db, 200);
  logger.info("scheduler", `Read cycle complete: cached ${tweets.length} tweets`);
  return tweets.length;
}

export async function runPostCycle(db: Database): Promise<boolean> {
  if (_postCycleRunning) {
    logger.warn("scheduler", "Post cycle already in progress — skipping");
    return false;
  }
  if (!canPost(db)) {
    logger.warn("scheduler", "Post budget exhausted — skipping post cycle");
    return false;
  }
  _postCycleRunning = true;

  logger.info("scheduler", "Starting post generation cycle");

  const newsContextItems = getNewsContext(db, 3);
  const recentPosts = getRecentPostContents(db, 20);
  const timelineTweets = getRandomTimelineTweets(db, 8);
  const recentTimeline = timelineTweets.map((t) => `@${t.author ?? "unknown"}: ${t.content}`);

  const postId = insertPost(db, "post", "", undefined, undefined);

  const sourceUrl = newsContextItems[0]?.url ?? undefined;

  const text = await generatePost({
    newsItems: newsContextItems.map((n) => n.text),
    recentTimeline,
    recentPosts,
    sourceUrl,
  });

  try {
    if (!text) {
      updatePostStatus(db, postId, "failed", undefined, "AI generation failed after 3 attempts");
      logger.warn("scheduler", "Post cycle: AI failed to generate content");
      return false;
    }

    db.run("UPDATE posts SET content = ? WHERE id = ?", [text, postId]);

    const { getConfig } = await import("./config");
    const cfg = getConfig();
    const chunks = cfg.enable_threads ? splitIntoThread(text, cfg.max_tweet_length) : [text.slice(0, 260)];

    // Append source URL to last chunk after slicing, so it's never cut off
    if (sourceUrl) {
      const urlSuffix = " " + sourceUrl;
      const maxLen = cfg.enable_threads ? cfg.max_tweet_length : 260;
      const last = chunks.length - 1;
      chunks[last] = chunks[last].slice(0, maxLen - urlSuffix.length) + urlSuffix;
    }

    if (chunks.length === 1) {
      const result = await createPost(db, chunks[0]);
      if (!result) {
        updatePostStatus(db, postId, "failed", undefined, "X API post failed");
        logger.warn("scheduler", "Post cycle: X API call failed");
        return false;
      }
      for (const item of newsContextItems) markNewsItemUsed(db, item.id);
      updatePostStatus(db, postId, "posted", result.id);
      notifyPost(db, postId);
      logger.info("scheduler", `Post cycle complete: tweet ${result.id}`);
    } else {
      logger.info("scheduler", `Posting thread with ${chunks.length} tweets`);
      const results = await createThread(db, chunks);
      if (!results || results.length === 0) {
        updatePostStatus(db, postId, "failed", undefined, "X API thread failed");
        logger.warn("scheduler", "Post cycle: thread failed");
        return false;
      }
      for (const item of newsContextItems) markNewsItemUsed(db, item.id);
      updatePostStatus(db, postId, "posted", results[0].id);
      notifyPost(db, postId);
      logger.info("scheduler", `Thread complete: ${results.length} tweets, root ${results[0].id}`);
    }
    return true;
  } finally {
    _postCycleRunning = false;
  }
}

export async function runReplyCycle(db: Database): Promise<boolean> {
  if (!canPost(db)) {
    logger.warn("scheduler", "Post budget exhausted — skipping reply cycle");
    return false;
  }

  const targetTweet = getRandomTimelineTweet(db);
  if (!targetTweet) {
    logger.info("scheduler", "Reply cycle: no cached tweets to reply to — run read cycle first");
    return false;
  }

  logger.info("scheduler", `Starting reply cycle for tweet ${targetTweet.x_tweet_id}`);

  const recentPosts = getRecentPostContents(db, 20);
  const postId = insertPost(db, "reply", "", undefined, targetTweet.x_tweet_id);

  const text = await generateReply({
    tweetText: targetTweet.content,
    authorUsername: targetTweet.author ?? null,
    recentPosts,
  });

  if (!text) {
    updatePostStatus(db, postId, "failed", undefined, "AI generation failed after 3 attempts");
    logger.warn("scheduler", "Reply cycle: AI failed to generate content");
    return false;
  }

  db.run("UPDATE posts SET content = ? WHERE id = ?", [text, postId]);

  const result = await createReply(db, text, targetTweet.x_tweet_id);
  if (!result) {
    updatePostStatus(db, postId, "failed", undefined, "X API reply failed");
    logger.warn("scheduler", "Reply cycle: X API call failed");
    return false;
  }

  updatePostStatus(db, postId, "posted", result.id);
  notifyPost(db, postId);
  logger.info("scheduler", `Reply cycle complete: reply ${result.id} to ${targetTweet.x_tweet_id}`);
  return true;
}
