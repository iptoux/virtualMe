import { useState } from "react";
import { Plus, Trash2, ToggleLeft, ToggleRight } from "lucide-react";
import { Card, CardContent } from "./ui/card";
import { Button } from "./ui/button";
import { Input } from "./ui/input";
import { Label } from "./ui/label";
import { Select } from "./ui/select";
import { Badge } from "./ui/badge";
import { api } from "@/lib/api-client";
import type { NewsSource } from "../../../shared/types";

export function NewsSources({
  sources,
  onRefresh,
}: {
  sources: NewsSource[];
  onRefresh: () => void;
}) {
  const [form, setForm] = useState({ type: "rss" as "rss" | "url", name: "", url: "" });
  const [adding, setAdding] = useState(false);

  const handleAdd = async () => {
    if (!form.name.trim() || !form.url.trim()) return;
    setAdding(true);
    try {
      await api.addNewsSource({ ...form, enabled: true });
      setForm({ type: "rss", name: "", url: "" });
      onRefresh();
    } finally {
      setAdding(false);
    }
  };

  const toggle = async (src: NewsSource) => {
    await api.updateNewsSource(src.id, { enabled: !src.enabled });
    onRefresh();
  };

  const remove = async (id: number) => {
    await api.deleteNewsSource(id);
    onRefresh();
  };

  return (
    <div className="space-y-4">
      <Card>
        <CardContent className="p-4 space-y-3">
          <p className="text-sm font-medium">Add Source</p>
          <div className="grid grid-cols-[80px_1fr_1fr_auto] gap-2 items-end">
            <div className="space-y-1">
              <Label>Type</Label>
              <Select
                value={form.type}
                onChange={(e) => setForm((f) => ({ ...f, type: e.target.value as "rss" | "url" }))}
              >
                <option value="rss">RSS</option>
                <option value="url">URL</option>
              </Select>
            </div>
            <div className="space-y-1">
              <Label>Name</Label>
              <Input
                placeholder="e.g. TechCrunch"
                value={form.name}
                onChange={(e) => setForm((f) => ({ ...f, name: e.target.value }))}
              />
            </div>
            <div className="space-y-1">
              <Label>URL</Label>
              <Input
                placeholder="https://..."
                value={form.url}
                onChange={(e) => setForm((f) => ({ ...f, url: e.target.value }))}
              />
            </div>
            <Button onClick={handleAdd} disabled={adding} size="md">
              <Plus size={14} />
            </Button>
          </div>
        </CardContent>
      </Card>

      {sources.length === 0 && (
        <p className="text-center text-sm text-[var(--muted-foreground)] py-4">No sources yet</p>
      )}

      {sources.map((src) => (
        <div
          key={src.id}
          className="flex items-center gap-3 rounded-lg border border-[var(--border)] px-3 py-2"
        >
          <Badge variant="outline">{src.type}</Badge>
          <span className="font-medium text-sm flex-1">{src.name}</span>
          <span className="text-xs text-[var(--muted-foreground)] flex-1 truncate">{src.url}</span>
          <button
            onClick={() => toggle(src)}
            className="text-[var(--muted-foreground)] hover:text-[var(--foreground)]"
          >
            {src.enabled ? <ToggleRight size={20} className="text-emerald-500" /> : <ToggleLeft size={20} />}
          </button>
          <button
            onClick={() => remove(src.id)}
            className="text-[var(--muted-foreground)] hover:text-[var(--destructive)]"
          >
            <Trash2 size={16} />
          </button>
        </div>
      ))}
    </div>
  );
}
