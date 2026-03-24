import { useState, useEffect, useRef } from "react";
import { ChevronDown, ChevronRight, Trash2 } from "lucide-react";
import * as ScrollAreaPrimitive from "@radix-ui/react-scroll-area";
import { Badge } from "./ui/badge";
import { Button } from "./ui/button";
import { cn } from "@/lib/utils";
import { api } from "@/lib/api-client";
import { formatDate } from "@/lib/utils";
import type { LogEntry } from "../../../shared/types";

const levelVariant: Record<string, "success" | "warning" | "destructive" | "secondary"> = {
  info: "success",
  warning: "warning",
  error: "destructive",
};

function LogRow({ log }: { log: LogEntry }) {
  const [expanded, setExpanded] = useState(false);
  const hasMetadata = log.metadata && Object.keys(log.metadata).length > 0;

  return (
    <div className="rounded px-2 py-1.5 hover:bg-[var(--muted)]/40 font-mono text-xs">
      <div className="flex items-start gap-2 min-w-0">
        <span className="shrink-0 text-[var(--muted-foreground)] w-[130px]">
          {formatDate(log.created_at)}
        </span>
        <Badge variant={levelVariant[log.level] ?? "secondary"} className="shrink-0 uppercase w-14 justify-center">
          {log.level}
        </Badge>
        <span className="shrink-0 text-[var(--muted-foreground)] w-16 truncate">
          {log.category}
        </span>
        <span className="flex-1 text-[var(--foreground)] break-words min-w-0">
          {log.message}
        </span>
        {hasMetadata && (
          <button
            onClick={() => setExpanded((v) => !v)}
            className="shrink-0 text-[var(--muted-foreground)] hover:text-[var(--foreground)] ml-1"
          >
            {expanded ? <ChevronDown size={12} /> : <ChevronRight size={12} />}
          </button>
        )}
      </div>
      {expanded && hasMetadata && (
        <div className="mt-1 ml-[calc(130px+56px+64px+12px)] text-[var(--muted-foreground)] bg-[var(--muted)]/60 rounded p-2 whitespace-pre-wrap break-words">
          {JSON.stringify(log.metadata, null, 2)}
        </div>
      )}
    </div>
  );
}

export function LiveLogs({
  logs,
  onClear,
}: {
  logs: LogEntry[];
  onClear: () => void;
}) {
  const viewportRef = useRef<HTMLDivElement>(null);
  const [autoScroll, setAutoScroll] = useState(true);

  // Auto-scroll to bottom when new logs arrive
  useEffect(() => {
    if (!autoScroll) return;
    const el = viewportRef.current;
    if (el) el.scrollTop = el.scrollHeight;
  }, [logs, autoScroll]);

  // Detect manual scroll up → disable auto-scroll; at bottom → re-enable
  const handleScroll = () => {
    const el = viewportRef.current;
    if (!el) return;
    const atBottom = el.scrollHeight - el.scrollTop - el.clientHeight < 40;
    setAutoScroll(atBottom);
  };

  const handleClear = async () => {
    try {
      await api.clearLogs();
    } catch {
      // ignore — clear UI anyway
    }
    onClear();
  };

  return (
    <div className="h-full flex flex-col gap-2">
      {/* Toolbar */}
      <div className="flex items-center justify-between shrink-0 sticky top-0 z-10 bg-[var(--background)] py-1">
        <span className="text-xs text-[var(--muted-foreground)]">
          {logs.length} entries
          {!autoScroll && (
            <button
              className="ml-3 text-[var(--primary)] hover:underline"
              onClick={() => {
                setAutoScroll(true);
                const el = viewportRef.current;
                if (el) el.scrollTop = el.scrollHeight;
              }}
            >
              ↓ scroll to latest
            </button>
          )}
        </span>
        <Button size="sm" variant="ghost" onClick={handleClear} className="h-7 gap-1 text-xs text-[var(--muted-foreground)] hover:text-[var(--destructive)]">
          <Trash2 size={13} /> Clear
        </Button>
      </div>

      {/* Scrollable log list */}
      <ScrollAreaPrimitive.Root className="flex-1 overflow-hidden">
        <ScrollAreaPrimitive.Viewport
          ref={viewportRef}
          className="h-full w-full rounded-[inherit]"
          onScroll={handleScroll}
        >
          <div className="space-y-0.5 pr-3">
            {logs.length === 0 && (
              <p className="text-[var(--muted-foreground)] py-4 text-center text-sm">No logs yet</p>
            )}
            {logs.map((log) => (
              <LogRow key={log.id} log={log} />
            ))}
          </div>
        </ScrollAreaPrimitive.Viewport>
        <ScrollAreaPrimitive.Scrollbar
          orientation="vertical"
          className={cn("flex touch-none select-none transition-colors h-full w-2 border-l border-l-transparent p-px")}
        >
          <ScrollAreaPrimitive.Thumb className="relative flex-1 rounded-full bg-[var(--border)] hover:bg-[var(--muted-foreground)] transition-colors" />
        </ScrollAreaPrimitive.Scrollbar>
        <ScrollAreaPrimitive.Corner />
      </ScrollAreaPrimitive.Root>
    </div>
  );
}
