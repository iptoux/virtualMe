import { useState, useEffect, useCallback } from "react";
import { api, wsClient } from "./api-client";
import type { StatsSnapshot, LogEntry, Post, BotConfig, NewsSource, WsServerEvent } from "../../../shared/types";

export function useServiceConnection() {
  const [connected, setConnected] = useState(false);

  useEffect(() => {
    wsClient.connect();
    const unsub = wsClient.subscribe((event: WsServerEvent) => {
      if (event.type === "scheduler_status" && "connected" in event.data) {
        setConnected((event.data as { connected: boolean }).connected);
      }
    });
    return () => {
      unsub();
    };
  }, []);

  return connected;
}

export function useStats() {
  const [stats, setStats] = useState<StatsSnapshot | null>(null);

  useEffect(() => {
    const fetch = () => api.getStats().then(setStats).catch(() => {});
    fetch();
    const interval = setInterval(fetch, 10_000);
    const unsub = wsClient.subscribe((event) => {
      if (event.type === "stats_update") setStats(event.data as StatsSnapshot);
    });
    return () => { clearInterval(interval); unsub(); };
  }, []);

  return stats;
}

export function useLogs(limit = 100) {
  const [logs, setLogs] = useState<LogEntry[]>([]);

  const refresh = useCallback(() => {
    api.getLogs({ limit }).then((logs) => setLogs([...logs].reverse())).catch(() => {});
  }, [limit]);

  useEffect(() => {
    refresh();
    const unsub = wsClient.subscribe((event) => {
      if (event.type === "log") {
        setLogs((prev) => [...prev, event.data as LogEntry].slice(-limit));
      }
    });
    return unsub;
  }, [limit, refresh]);

  const clear = useCallback(() => setLogs([]), []);

  return { logs, clear };
}

export function usePosts(type?: string, limit = 100) {
  const [posts, setPosts] = useState<Post[]>([]);

  const refresh = useCallback(() => {
    api.getPosts({ type, limit }).then((p) => setPosts([...p].reverse())).catch(() => {});
  }, [type, limit]);

  useEffect(() => {
    refresh();
    const unsub = wsClient.subscribe((event) => {
      if (event.type === "post_created") {
        setPosts((prev) => [...prev, event.data as Post].slice(-limit));
      }
    });
    return unsub;
  }, [limit, refresh]);

  const clear = useCallback(() => setPosts([]), []);

  return { posts, refresh, clear };
}

export function useConfig() {
  const [config, setConfig] = useState<BotConfig | null>(null);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    api.getConfig().then(setConfig).catch(() => {});
  }, []);

  const save = useCallback(async (patch: Partial<BotConfig>) => {
    setSaving(true);
    try {
      const updated = await api.patchConfig(patch);
      setConfig(updated);
    } finally {
      setSaving(false);
    }
  }, []);

  return { config, save, saving };
}

export function useNewsSources() {
  const [sources, setSources] = useState<NewsSource[]>([]);

  const refresh = useCallback(() => {
    api.getNewsSources().then(setSources).catch(() => {});
  }, []);

  useEffect(() => { refresh(); }, [refresh]);

  return { sources, refresh };
}
