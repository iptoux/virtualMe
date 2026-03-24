import type { ServerWebSocket } from "bun";
import type { WsServerEvent, WsClientCommand, LogEntry, StatsSnapshot, Post } from "../../shared/types";

type Channel = "logs" | "stats" | "posts";

interface WsData {
  channels: Set<Channel>;
}

const _clients = new Set<ServerWebSocket<WsData>>();

export function handleWsOpen(ws: ServerWebSocket<WsData>): void {
  ws.data = { channels: new Set() };
  _clients.add(ws);
}

export function handleWsClose(ws: ServerWebSocket<WsData>): void {
  _clients.delete(ws);
}

export function handleWsMessage(ws: ServerWebSocket<WsData>, message: string | Buffer): void {
  try {
    const cmd = JSON.parse(typeof message === "string" ? message : message.toString()) as WsClientCommand;
    if (cmd.type === "subscribe") {
      ws.data.channels = new Set(cmd.channels);
    } else if (cmd.type === "ping") {
      ws.send(JSON.stringify({ type: "pong" }));
    }
  } catch {
    // ignore malformed messages
  }
}

function broadcast(channel: Channel, event: WsServerEvent): void {
  const payload = JSON.stringify(event);
  for (const client of _clients) {
    if (client.readyState === 1 && client.data.channels.has(channel)) {
      client.send(payload);
    }
  }
}

export function broadcastLog(entry: LogEntry): void {
  broadcast("logs", { type: "log", data: entry });
}

export function broadcastStats(stats: StatsSnapshot): void {
  broadcast("stats", { type: "stats_update", data: stats });
}

export function broadcastPost(post: Post): void {
  broadcast("posts", { type: "post_created", data: post });
}

export function broadcastSchedulerStatus(running: boolean, nextAction: string | null): void {
  // Broadcast to all clients regardless of channel subscription
  const payload = JSON.stringify({ type: "scheduler_status", data: { running, next_action: nextAction } } satisfies WsServerEvent);
  for (const client of _clients) {
    if (client.readyState === 1) client.send(payload);
  }
}

export function broadcastBudgetWarning(resource: "posts" | "reads", remainingPercent: number): void {
  const payload = JSON.stringify({ type: "budget_warning", data: { resource, remaining_percent: remainingPercent } } satisfies WsServerEvent);
  for (const client of _clients) {
    if (client.readyState === 1) client.send(payload);
  }
}

export const wsHandlers = {
  open: handleWsOpen,
  close: handleWsClose,
  message: handleWsMessage,
};
