import { Database } from "bun:sqlite";
import type { LogEntry, Post, NewsSource, NewsItem, TimelineTweet, ApiBudget } from "../../shared/types";

let _db: Database | null = null;

export function getDb(): Database {
  if (!_db) throw new Error("DB not initialized");
  return _db;
}

export function initDb(dbPath: string = "bot.db"): Database {
  const db = new Database(dbPath, { create: true });
  db.exec("PRAGMA journal_mode = WAL;");
  db.exec("PRAGMA foreign_keys = ON;");
  createSchema(db);
  _db = db;
  return db;
}

function createSchema(db: Database): void {
  db.exec(`
    CREATE TABLE IF NOT EXISTS config (
      key        TEXT PRIMARY KEY,
      value      TEXT NOT NULL,
      updated_at TEXT NOT NULL DEFAULT (datetime('now'))
    );

    CREATE TABLE IF NOT EXISTS logs (
      id         INTEGER PRIMARY KEY AUTOINCREMENT,
      level      TEXT NOT NULL CHECK(level IN ('info','warning','error')),
      category   TEXT NOT NULL,
      message    TEXT NOT NULL,
      metadata   TEXT,
      created_at TEXT NOT NULL DEFAULT (datetime('now'))
    );
    CREATE INDEX IF NOT EXISTS idx_logs_created ON logs(created_at);
    CREATE INDEX IF NOT EXISTS idx_logs_level ON logs(level);

    CREATE TABLE IF NOT EXISTS posts (
      id           INTEGER PRIMARY KEY AUTOINCREMENT,
      x_tweet_id   TEXT,
      type         TEXT NOT NULL CHECK(type IN ('post','reply')),
      content      TEXT NOT NULL,
      in_reply_to  TEXT,
      ai_prompt    TEXT,
      status       TEXT NOT NULL DEFAULT 'pending' CHECK(status IN ('pending','posted','failed')),
      error        TEXT,
      created_at   TEXT NOT NULL DEFAULT (datetime('now'))
    );
    CREATE INDEX IF NOT EXISTS idx_posts_created ON posts(created_at);
    CREATE INDEX IF NOT EXISTS idx_posts_type ON posts(type);

    CREATE TABLE IF NOT EXISTS api_budget (
      id            INTEGER PRIMARY KEY AUTOINCREMENT,
      month         TEXT NOT NULL UNIQUE,
      posts_used    INTEGER NOT NULL DEFAULT 0,
      posts_limit   INTEGER NOT NULL DEFAULT 500,
      reads_used    INTEGER NOT NULL DEFAULT 0,
      reads_limit   INTEGER NOT NULL DEFAULT 100
    );

    CREATE TABLE IF NOT EXISTS news_sources (
      id         INTEGER PRIMARY KEY AUTOINCREMENT,
      type       TEXT NOT NULL CHECK(type IN ('rss','url')),
      name       TEXT NOT NULL,
      url        TEXT NOT NULL,
      enabled    INTEGER NOT NULL DEFAULT 1,
      last_fetch TEXT,
      created_at TEXT NOT NULL DEFAULT (datetime('now'))
    );

    CREATE TABLE IF NOT EXISTS news_items (
      id         INTEGER PRIMARY KEY AUTOINCREMENT,
      source_id  INTEGER NOT NULL REFERENCES news_sources(id) ON DELETE CASCADE,
      title      TEXT,
      content    TEXT NOT NULL,
      url        TEXT,
      hash       TEXT NOT NULL UNIQUE,
      fetched_at TEXT NOT NULL DEFAULT (datetime('now')),
      used       INTEGER NOT NULL DEFAULT 0
    );
    CREATE INDEX IF NOT EXISTS idx_news_items_source ON news_items(source_id);

    CREATE TABLE IF NOT EXISTS timeline_cache (
      id          INTEGER PRIMARY KEY AUTOINCREMENT,
      x_tweet_id  TEXT NOT NULL UNIQUE,
      author      TEXT,
      content     TEXT NOT NULL,
      fetched_at  TEXT NOT NULL DEFAULT (datetime('now'))
    );
  `);
}

// === Config queries ===
export function configGet(db: Database, key: string): string | null {
  const row = db.query("SELECT value FROM config WHERE key = ?").get(key) as { value: string } | null;
  return row?.value ?? null;
}

export function configSet(db: Database, key: string, value: string): void {
  db.run("INSERT OR REPLACE INTO config (key, value, updated_at) VALUES (?, ?, datetime('now'))", [key, value]);
}

export function configGetAll(db: Database): Record<string, string> {
  const rows = db.query("SELECT key, value FROM config").all() as { key: string; value: string }[];
  return Object.fromEntries(rows.map((r) => [r.key, r.value]));
}

// === Log queries ===
export function insertLog(
  db: Database,
  level: LogEntry["level"],
  category: string,
  message: string,
  metadata?: Record<string, unknown>
): LogEntry {
  const result = db.run(
    "INSERT INTO logs (level, category, message, metadata) VALUES (?, ?, ?, ?)",
    [level, category, message, metadata ? JSON.stringify(metadata) : null]
  );
  return db.query("SELECT * FROM logs WHERE id = ?").get(result.lastInsertRowid) as LogEntry;
}

export function getLogs(
  db: Database,
  opts: { level?: string; limit?: number; offset?: number } = {}
): LogEntry[] {
  const { level, limit = 100, offset = 0 } = opts;
  const where = level ? "WHERE level = ?" : "";
  const params = level ? [level, limit, offset] : [limit, offset];
  const rows = db.query(`SELECT * FROM logs ${where} ORDER BY created_at DESC LIMIT ? OFFSET ?`).all(...params) as any[];
  return rows.map((r) => ({ ...r, metadata: r.metadata ? JSON.parse(r.metadata) : undefined }));
}

export function pruneOldLogs(db: Database, daysToKeep = 30): void {
  db.run("DELETE FROM logs WHERE created_at < datetime('now', ?)", [`-${daysToKeep} days`]);
}

// === Post queries ===
export function insertPost(
  db: Database,
  type: Post["type"],
  content: string,
  aiPrompt?: string,
  inReplyTo?: string
): number {
  const result = db.run(
    "INSERT INTO posts (type, content, ai_prompt, in_reply_to) VALUES (?, ?, ?, ?)",
    [type, content, aiPrompt ?? null, inReplyTo ?? null]
  );
  return Number(result.lastInsertRowid);
}

export function updatePostStatus(
  db: Database,
  id: number,
  status: Post["status"],
  xTweetId?: string,
  error?: string
): void {
  db.run(
    "UPDATE posts SET status = ?, x_tweet_id = ?, error = ? WHERE id = ?",
    [status, xTweetId ?? null, error ?? null, id]
  );
}

export function getPosts(
  db: Database,
  opts: { type?: string; limit?: number; offset?: number } = {}
): Post[] {
  const { type, limit = 50, offset = 0 } = opts;
  const where = type ? "WHERE type = ?" : "";
  const params = type ? [type, limit, offset] : [limit, offset];
  return db.query(`SELECT * FROM posts ${where} ORDER BY created_at DESC LIMIT ? OFFSET ?`).all(...params) as Post[];
}

export function getRecentPostContents(db: Database, count = 20): string[] {
  const rows = db.query("SELECT content FROM posts WHERE status = 'posted' ORDER BY created_at DESC LIMIT ?").all(count) as { content: string }[];
  return rows.map((r) => r.content);
}

export function countPostsToday(db: Database, type: Post["type"]): number {
  const row = db.query(
    "SELECT COUNT(*) as count FROM posts WHERE type = ? AND status = 'posted' AND date(created_at) = date('now')"
  ).get(type) as { count: number };
  return row.count;
}

// === API Budget queries ===
export function getCurrentBudget(db: Database): ApiBudget {
  const month = new Date().toISOString().slice(0, 7); // 'YYYY-MM'
  db.run(
    "INSERT OR IGNORE INTO api_budget (month) VALUES (?)",
    [month]
  );
  return db.query("SELECT * FROM api_budget WHERE month = ?").get(month) as ApiBudget;
}

export function incrementPostsUsed(db: Database): void {
  const month = new Date().toISOString().slice(0, 7);
  db.run("UPDATE api_budget SET posts_used = posts_used + 1 WHERE month = ?", [month]);
}

export function incrementReadsUsed(db: Database): void {
  const month = new Date().toISOString().slice(0, 7);
  db.run("UPDATE api_budget SET reads_used = reads_used + 1 WHERE month = ?", [month]);
}

// === News Source queries ===
export function getNewsSources(db: Database): NewsSource[] {
  return (db.query("SELECT * FROM news_sources ORDER BY created_at ASC").all() as any[]).map((r) => ({
    ...r,
    enabled: r.enabled === 1,
  }));
}

export function insertNewsSource(db: Database, type: "rss" | "url", name: string, url: string): NewsSource {
  const result = db.run("INSERT INTO news_sources (type, name, url) VALUES (?, ?, ?)", [type, name, url]);
  return db.query("SELECT * FROM news_sources WHERE id = ?").get(result.lastInsertRowid) as NewsSource;
}

export function updateNewsSource(db: Database, id: number, updates: Partial<Pick<NewsSource, "name" | "url" | "enabled">>): void {
  if (updates.name !== undefined) db.run("UPDATE news_sources SET name = ? WHERE id = ?", [updates.name, id]);
  if (updates.url !== undefined) db.run("UPDATE news_sources SET url = ? WHERE id = ?", [updates.url, id]);
  if (updates.enabled !== undefined) db.run("UPDATE news_sources SET enabled = ? WHERE id = ?", [updates.enabled ? 1 : 0, id]);
}

export function deleteNewsSource(db: Database, id: number): void {
  db.run("DELETE FROM news_sources WHERE id = ?", [id]);
}

export function markNewsSourceFetched(db: Database, id: number): void {
  db.run("UPDATE news_sources SET last_fetch = datetime('now') WHERE id = ?", [id]);
}

// === News Item queries ===
export function insertNewsItem(
  db: Database,
  sourceId: number,
  content: string,
  hash: string,
  title?: string,
  url?: string
): boolean {
  try {
    db.run(
      "INSERT INTO news_items (source_id, content, hash, title, url) VALUES (?, ?, ?, ?, ?)",
      [sourceId, content, hash, title ?? null, url ?? null]
    );
    return true; // inserted
  } catch {
    return false; // duplicate
  }
}

export function getUnusedNewsItems(db: Database, limit = 10): NewsItem[] {
  return db.query("SELECT * FROM news_items WHERE used = 0 ORDER BY fetched_at DESC LIMIT ?").all(limit) as NewsItem[];
}

export function markNewsItemUsed(db: Database, id: number): void {
  db.run("UPDATE news_items SET used = 1 WHERE id = ?", [id]);
}

// === Timeline Cache queries ===
export function upsertTimelineTweet(db: Database, xTweetId: string, content: string, author?: string): void {
  db.run(
    "INSERT OR IGNORE INTO timeline_cache (x_tweet_id, content, author) VALUES (?, ?, ?)",
    [xTweetId, content, author ?? null]
  );
}

export function getLatestCachedTweetId(db: Database): string | null {
  // X tweet IDs are snowflakes — largest numeric string = most recent
  const row = db.query(
    "SELECT x_tweet_id FROM timeline_cache ORDER BY CAST(x_tweet_id AS INTEGER) DESC LIMIT 1"
  ).get() as { x_tweet_id: string } | null;
  return row?.x_tweet_id ?? null;
}

export function getRandomTimelineTweet(db: Database): TimelineTweet | null {
  return db.query("SELECT * FROM timeline_cache ORDER BY RANDOM() LIMIT 1").get() as TimelineTweet | null;
}

export function getRandomTimelineTweets(db: Database, count = 5): TimelineTweet[] {
  return db.query("SELECT * FROM timeline_cache ORDER BY RANDOM() LIMIT ?").all(count) as TimelineTweet[];
}

export function pruneTimelineCache(db: Database, keepCount = 200): void {
  db.run(
    "DELETE FROM timeline_cache WHERE id NOT IN (SELECT id FROM timeline_cache ORDER BY fetched_at DESC LIMIT ?)",
    [keepCount]
  );
}
