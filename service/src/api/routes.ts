import type { Database } from "bun:sqlite";
import type { ApiResponse, BotConfig, StatsSnapshot } from "../../../shared/types";
import {
  getPosts,
  getLogs,
  getNewsSources,
  insertNewsSource,
  updateNewsSource,
  deleteNewsSource,
  getCurrentBudget,
  countPostsToday,
} from "../db";
import { getConfig, setConfig, SERVICE_SECRET } from "../config";
import {
  startScheduler,
  stopScheduler,
  isSchedulerRunning,
  getNextScheduledAction,
  triggerPost,
  triggerReadTimeline,
} from "../scheduler";
import { fetchAllNewsSources } from "../news";
import { logger } from "../logger";
import { broadcastStats } from "../ws";

const START_TIME = Date.now();

function ok<T>(data: T): Response {
  return Response.json({ data } satisfies ApiResponse<T>);
}

function err(code: string, message: string, status = 400): Response {
  return Response.json({ error: { code, message } } satisfies ApiResponse<never>, { status });
}

function getStats(db: Database): StatsSnapshot {
  const budget = getCurrentBudget(db);
  return {
    uptime_seconds: Math.floor((Date.now() - START_TIME) / 1000),
    posts_today: countPostsToday(db, "post"),
    replies_today: countPostsToday(db, "reply"),
    posts_this_month: budget.posts_used,
    reads_this_month: budget.reads_used,
    posts_limit: budget.posts_limit,
    reads_limit: budget.reads_limit,
    scheduler_running: isSchedulerRunning(),
    next_scheduled_action: getNextScheduledAction(),
  };
}

export function handleRequest(req: Request, db: Database): Response {
  const url = new URL(req.url);
  const path = url.pathname;
  const method = req.method;

  // CORS for dashboard dev
  const corsHeaders = {
    "Access-Control-Allow-Origin": "*",
    "Access-Control-Allow-Methods": "GET, POST, PATCH, DELETE, OPTIONS",
    "Access-Control-Allow-Headers": "Content-Type, Authorization",
  };

  if (method === "OPTIONS") {
    return new Response(null, { status: 204, headers: corsHeaders });
  }

  async function handle(): Promise<Response> {
    // === Auth guard ===
    if (SERVICE_SECRET) {
      const auth = req.headers.get("Authorization") ?? "";
      if (auth !== `Bearer ${SERVICE_SECRET}`) {
        return Response.json(
          { error: { code: "UNAUTHORIZED", message: "Invalid or missing secret" } },
          { status: 401, headers: corsHeaders }
        );
      }
    }
    // === Stats ===
    if (path === "/api/stats" && method === "GET") {
      return ok(getStats(db));
    }

    // === Config ===
    if (path === "/api/config" && method === "GET") {
      return ok(getConfig());
    }
    if (path === "/api/config" && method === "PATCH") {
      const body = (await req.json()) as Partial<BotConfig>;
      const updated = setConfig(body);
      logger.info("system", "Config updated", { keys: Object.keys(body) });
      return ok(updated);
    }

    // === Posts ===
    if (path === "/api/posts" && method === "DELETE") {
      db.run("DELETE FROM posts");
      return ok({ cleared: true });
    }
    if (path === "/api/posts" && method === "GET") {
      const type = url.searchParams.get("type") ?? undefined;
      const limit = Number(url.searchParams.get("limit") ?? 50);
      const offset = Number(url.searchParams.get("offset") ?? 0);
      return ok(getPosts(db, { type, limit, offset }));
    }

    // === Logs ===
    if (path === "/api/logs" && method === "DELETE") {
      db.run("DELETE FROM logs");
      return ok({ cleared: true });
    }
    if (path === "/api/logs" && method === "GET") {
      const level = url.searchParams.get("level") ?? undefined;
      const limit = Number(url.searchParams.get("limit") ?? 100);
      const offset = Number(url.searchParams.get("offset") ?? 0);
      return ok(getLogs(db, { level, limit, offset }));
    }

    // === News Sources ===
    if (path === "/api/news-sources" && method === "GET") {
      return ok(getNewsSources(db));
    }
    if (path === "/api/news-sources" && method === "POST") {
      const body = (await req.json()) as { type: "rss" | "url"; name: string; url: string };
      if (!body.type || !body.name || !body.url) return err("INVALID_BODY", "type, name, url required");
      const source = insertNewsSource(db, body.type, body.name, body.url);
      return ok(source);
    }
    if (path.match(/^\/api\/news-sources\/\d+$/) && method === "PATCH") {
      const id = Number(path.split("/").pop());
      const body = (await req.json()) as Partial<{ name: string; url: string; enabled: boolean }>;
      updateNewsSource(db, id, body);
      return ok(null);
    }
    if (path.match(/^\/api\/news-sources\/\d+$/) && method === "DELETE") {
      const id = Number(path.split("/").pop());
      deleteNewsSource(db, id);
      return ok(null);
    }
    if (path.match(/^\/api\/news-sources\/\d+\/fetch$/) && method === "POST") {
      fetchAllNewsSources(db).catch((e) => logger.error("news", "Manual fetch failed", { error: String(e) }));
      return ok({ message: "Fetch triggered" });
    }

    // === Scheduler Control ===
    if (path === "/api/scheduler/start" && method === "POST") {
      if (!isSchedulerRunning()) startScheduler(db);
      broadcastStats(getStats(db));
      return ok({ running: true });
    }
    if (path === "/api/scheduler/stop" && method === "POST") {
      stopScheduler();
      broadcastStats(getStats(db));
      return ok({ running: false });
    }

    // === Manual Triggers ===
    if (path === "/api/actions/post" && method === "POST") {
      const success = await triggerPost();
      broadcastStats(getStats(db));
      return ok({ success });
    }
    if (path === "/api/actions/read-timeline" && method === "POST") {
      const count = await triggerReadTimeline();
      broadcastStats(getStats(db));
      return ok({ tweets_fetched: count });
    }

    return err("NOT_FOUND", "Endpoint not found", 404);
  }

  return handle().then((res) => {
    // Attach CORS headers to all responses
    Object.entries(corsHeaders).forEach(([k, v]) => res.headers.set(k, v));
    return res;
  }).catch((e) => {
    logger.error("system", "Request handler error", { error: String(e), path, method });
    return Response.json({ error: { code: "SERVER_ERROR", message: "Internal server error" } }, { status: 500, headers: corsHeaders });
  });
}
