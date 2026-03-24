import { initDb, getDb } from "./db";
import { initConfig } from "./config";
import { initLogger, onLog, logger } from "./logger";
import { SERVICE_PORT, SERVICE_HOST, SERVICE_SECRET } from "./config";
import { startScheduler } from "./scheduler";
import { onPostCreated } from "./bot-engine";
import { handleRequest } from "./api/routes";
import {
  wsHandlers,
  broadcastLog,
  broadcastPost,
  broadcastBudgetWarning,
} from "./ws";

// Check for lock file to prevent duplicate instances
const LOCK_FILE = "bot.lock";
const lockFile = Bun.file(LOCK_FILE);
if (await lockFile.exists()) {
  const pid = await lockFile.text();
  console.error(`Another instance may be running (PID: ${pid}). Delete bot.lock to override.`);
  process.exit(1);
}
await Bun.write(LOCK_FILE, String(process.pid));

// Cleanup lock on exit
import { unlinkSync } from "fs";
function cleanup() {
  try { unlinkSync(LOCK_FILE); } catch {}
  process.exit(0);
}
process.on("SIGINT", cleanup);
process.on("SIGTERM", cleanup);

// === Initialize core services ===
const db = initDb("bot.db");
initConfig(db);
initLogger(db);

// === Wire logger to WebSocket ===
onLog((entry) => broadcastLog(entry));

// === Wire post events to WebSocket ===
onPostCreated((post) => broadcastPost(post));

logger.info("system", `virtualMe X Bot Service starting on ${SERVICE_HOST}:${SERVICE_PORT}`);

// === Start scheduler ===
startScheduler(db, (resource, pct) => {
  logger.warn("scheduler", `Budget warning: ${resource} at ${pct}% remaining`);
  broadcastBudgetWarning(resource, pct);
});

// === Start HTTP + WebSocket server ===
Bun.serve({
  hostname: SERVICE_HOST,
  port: SERVICE_PORT,

  fetch(req, server) {
    const url = new URL(req.url);

    // WebSocket upgrade
    if (url.pathname === "/ws") {
      if (SERVICE_SECRET && url.searchParams.get("secret") !== SERVICE_SECRET) {
        return new Response("Unauthorized", { status: 401 });
      }
      const upgraded = server.upgrade(req, { data: { channels: new Set() } });
      if (!upgraded) return new Response("WebSocket upgrade failed", { status: 400 });
      return undefined;
    }

    // REST API
    if (url.pathname.startsWith("/api/")) {
      return handleRequest(req, db);
    }

    // Health check
    if (url.pathname === "/" || url.pathname === "/health") {
      return Response.json({ status: "ok", pid: process.pid });
    }

    return new Response("Not found", { status: 404 });
  },

  websocket: wsHandlers,
});

logger.info("system", `Service running at http://${SERVICE_HOST}:${SERVICE_PORT}`);
logger.info("system", `WebSocket available at ws://${SERVICE_HOST}:${SERVICE_PORT}/ws`);
