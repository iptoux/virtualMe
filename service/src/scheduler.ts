import type { Database } from "bun:sqlite";
import { getConfig } from "./config";
import { logger } from "./logger";
import { runReadCycle, runPostCycle, runReplyCycle } from "./bot-engine";
import { fetchAllNewsSources } from "./news";
import { pruneOldLogs, getCurrentBudget } from "./db";
import { getBudgetWarning } from "./x-client";

interface ScheduledTask {
  id: string;
  name: string;
  intervalMs: number;
  lastRun: number | null;
  nextRun: number;
  handler: () => Promise<void>;
  activeWindowOnly: boolean; // only run during active hours
}

let _tasks: ScheduledTask[] = [];
let _tickInterval: ReturnType<typeof setInterval> | null = null;
let _db: Database | null = null;
let _running = false;
let _budgetWarnListener: ((resource: "posts" | "reads", pct: number) => void) | null = null;

const TICK_MS = 60_000; // 1 minute

function isInActiveWindow(): boolean {
  const cfg = getConfig();
  const now = new Date();
  const hour = now.getHours();
  return hour >= cfg.active_hours_start && hour < cfg.active_hours_end;
}

function nextRunTime(intervalMs: number): number {
  return Date.now() + intervalMs;
}

function buildTasks(db: Database): ScheduledTask[] {
  const cfg = getConfig();

  return [
    {
      id: "fetch-news",
      name: "Fetch News Sources",
      intervalMs: 60 * 60 * 1000, // 1 hour
      lastRun: null,
      nextRun: Date.now() + 5000, // first run 5s after start
      activeWindowOnly: false,
      handler: async () => {
        await fetchAllNewsSources(db);
      },
    },
    {
      id: "read-timeline",
      name: "Read Timeline",
      intervalMs: cfg.poll_interval_minutes * 60 * 1000,
      lastRun: null,
      nextRun: Date.now() + 30_000, // 30s after start
      activeWindowOnly: false,
      handler: async () => {
        await runReadCycle(db);
      },
    },
    {
      id: "generate-post",
      name: "Generate Post",
      intervalMs: cfg.post_frequency_hours * 60 * 60 * 1000,
      lastRun: null,
      nextRun: Date.now() + 2 * 60 * 1000, // 2 min after start
      activeWindowOnly: true,
      handler: async () => {
        await runPostCycle(db);
      },
    },
    {
      id: "generate-reply",
      name: "Generate Reply",
      intervalMs: 4 * 60 * 60 * 1000, // every 4 hours
      lastRun: null,
      nextRun: Date.now() + 5 * 60 * 1000, // 5 min after start
      activeWindowOnly: true,
      handler: async () => {
        const cfg = getConfig();
        if (Math.random() > cfg.reply_probability) {
          logger.info("scheduler", "Reply cycle skipped (probability check)");
          return;
        }
        await runReplyCycle(db);
      },
    },
    {
      id: "cleanup-logs",
      name: "Cleanup Old Logs",
      intervalMs: 24 * 60 * 60 * 1000, // daily
      lastRun: null,
      nextRun: Date.now() + 24 * 60 * 60 * 1000,
      activeWindowOnly: false,
      handler: async () => {
        pruneOldLogs(db, 30);
        logger.info("scheduler", "Pruned logs older than 30 days");
      },
    },
  ];
}

async function tick(): Promise<void> {
  const now = Date.now();

  for (const task of _tasks) {
    if (now < task.nextRun) continue;
    if (task.activeWindowOnly && !isInActiveWindow()) {
      // Push to next interval rather than spamming
      task.nextRun = now + task.intervalMs;
      continue;
    }

    task.lastRun = now;
    task.nextRun = nextRunTime(task.intervalMs);

    try {
      logger.info("scheduler", `Running task: ${task.name}`);
      await task.handler();
    } catch (err) {
      logger.error("scheduler", `Task failed: ${task.name}`, { error: String(err) });
    }
  }

  // Check budget warnings
  if (_db && _budgetWarnListener) {
    const warn = getBudgetWarning(_db);
    if (warn) {
      if (warn.posts < 20) _budgetWarnListener("posts", warn.posts);
      if (warn.reads < 20) _budgetWarnListener("reads", warn.reads);
    }
  }
}

export function startScheduler(db: Database, onBudgetWarning?: (resource: "posts" | "reads", pct: number) => void): void {
  if (_running) {
    logger.warn("scheduler", "Scheduler already running");
    return;
  }

  _db = db;
  _budgetWarnListener = onBudgetWarning ?? null;
  _tasks = buildTasks(db);
  _running = true;
  _tickInterval = setInterval(tick, TICK_MS);

  // Run first tick immediately
  tick().catch((err) => logger.error("scheduler", "Initial tick failed", { error: String(err) }));

  logger.info("scheduler", "Scheduler started", { tasks: _tasks.map((t) => t.id) });
}

export function stopScheduler(): void {
  if (!_running) return;
  if (_tickInterval) {
    clearInterval(_tickInterval);
    _tickInterval = null;
  }
  _running = false;
  logger.info("scheduler", "Scheduler stopped");
}

export function isSchedulerRunning(): boolean {
  return _running;
}

export function getNextScheduledAction(): string | null {
  if (!_running || _tasks.length === 0) return null;
  const next = _tasks.reduce((a, b) => (a.nextRun < b.nextRun ? a : b));
  return new Date(next.nextRun).toISOString();
}

// Manual triggers (bypass probability checks, not budget checks)
export async function triggerReadTimeline(): Promise<number> {
  if (!_db) throw new Error("Scheduler not initialized");
  return runReadCycle(_db);
}

export async function triggerPost(): Promise<boolean> {
  if (!_db) throw new Error("Scheduler not initialized");
  return runPostCycle(_db);
}
