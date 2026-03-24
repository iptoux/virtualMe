import type { Database } from "bun:sqlite";
import type { LogEntry } from "../../shared/types";
import { insertLog } from "./db";

type LogLevel = LogEntry["level"];
type LogListener = (entry: LogEntry) => void;

let _db: Database | null = null;
const _listeners: LogListener[] = [];

export function initLogger(db: Database): void {
  _db = db;
}

export function onLog(listener: LogListener): () => void {
  _listeners.push(listener);
  return () => {
    const idx = _listeners.indexOf(listener);
    if (idx !== -1) _listeners.splice(idx, 1);
  };
}

function log(level: LogLevel, category: string, message: string, metadata?: Record<string, unknown>): void {
  const prefix = `[${level.toUpperCase()}][${category}]`;
  if (level === "error") console.error(prefix, message, metadata ?? "");
  else if (level === "warning") console.warn(prefix, message, metadata ?? "");
  else console.log(prefix, message, metadata ?? "");

  if (_db) {
    const entry = insertLog(_db, level, category, message, metadata);
    for (const listener of _listeners) listener(entry);
  }
}

export const logger = {
  info: (category: string, message: string, metadata?: Record<string, unknown>) =>
    log("info", category, message, metadata),
  warn: (category: string, message: string, metadata?: Record<string, unknown>) =>
    log("warning", category, message, metadata),
  error: (category: string, message: string, metadata?: Record<string, unknown>) =>
    log("error", category, message, metadata),
};
