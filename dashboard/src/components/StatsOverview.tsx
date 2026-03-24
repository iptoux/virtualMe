import { useState } from "react";
import { Play, Square, Zap, Eye } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "./ui/card";
import { Button } from "./ui/button";
import { Badge } from "./ui/badge";
import { formatUptime } from "@/lib/utils";
import { api } from "@/lib/api-client";
import type { StatsSnapshot } from "../../../shared/types";

function StatCard({ label, value, sub }: { label: string; value: string | number; sub?: string }) {
  return (
    <Card>
      <CardContent className="p-4">
        <p className="text-xs text-[var(--muted-foreground)]">{label}</p>
        <p className="mt-1 text-2xl font-bold">{value}</p>
        {sub && <p className="text-xs text-[var(--muted-foreground)] mt-0.5">{sub}</p>}
      </CardContent>
    </Card>
  );
}

function BudgetBar({ used, limit, label }: { used: number; limit: number; label: string }) {
  const pct = limit > 0 ? Math.min(100, Math.round((used / limit) * 100)) : 0;
  const color = pct > 80 ? "bg-red-500" : pct > 60 ? "bg-yellow-500" : "bg-emerald-500";
  return (
    <div className="space-y-1">
      <div className="flex justify-between text-xs text-[var(--muted-foreground)]">
        <span>{label}</span>
        <span>{used} / {limit} ({pct}%)</span>
      </div>
      <div className="h-1.5 rounded-full bg-[var(--muted)]">
        <div className={`h-full rounded-full ${color}`} style={{ width: `${pct}%` }} />
      </div>
    </div>
  );
}

export function StatsOverview({ stats }: { stats: StatsSnapshot | null }) {
  const [posting, setPosting] = useState(false);
  const [reading, setReading] = useState(false);

  const handlePost = async () => {
    setPosting(true);
    try { await api.triggerPost(); } finally { setPosting(false); }
  };
  const handleRead = async () => {
    setReading(true);
    try { await api.triggerRead(); } finally { setReading(false); }
  };

  if (!stats) {
    return (
      <div className="flex items-center justify-center h-32 text-[var(--muted-foreground)]">
        Connecting to service…
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        <StatCard label="Uptime" value={formatUptime(stats.uptime_seconds)} />
        <StatCard label="Posts today" value={stats.posts_today} />
        <StatCard label="Replies today" value={stats.replies_today} />
        <StatCard
          label="Scheduler"
          value={
            <Badge variant={stats.scheduler_running ? "success" : "secondary"}>
              {stats.scheduler_running ? "Running" : "Stopped"}
            </Badge> as any
          }
        />
      </div>

      <Card>
        <CardHeader className="pb-3">
          <CardTitle>Monthly Budget</CardTitle>
        </CardHeader>
        <CardContent className="space-y-3">
          <BudgetBar
            used={stats.posts_this_month}
            limit={stats.posts_limit}
            label="Posts"
          />
          <BudgetBar
            used={stats.reads_this_month}
            limit={stats.reads_limit}
            label="Reads"
          />
        </CardContent>
      </Card>

      <div className="flex gap-2">
        <Button
          size="sm"
          variant={stats.scheduler_running ? "secondary" : "default"}
          onClick={() =>
            stats.scheduler_running ? api.schedulerStop() : api.schedulerStart()
          }
        >
          {stats.scheduler_running ? (
            <><Square size={14} /> Stop Bot</>
          ) : (
            <><Play size={14} /> Start Bot</>
          )}
        </Button>
        <Button size="sm" variant="outline" onClick={handlePost} disabled={posting}>
          <Zap size={14} /> {posting ? "Posting…" : "Post Now"}
        </Button>
        <Button size="sm" variant="outline" onClick={handleRead} disabled={reading}>
          <Eye size={14} /> {reading ? "Reading…" : "Read Timeline"}
        </Button>
      </div>

      {stats.next_scheduled_action && (
        <p className="text-xs text-[var(--muted-foreground)]">
          Next action: {new Date(stats.next_scheduled_action).toLocaleTimeString()}
        </p>
      )}
    </div>
  );
}
