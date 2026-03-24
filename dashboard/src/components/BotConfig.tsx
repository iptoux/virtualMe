import { useState, useEffect } from "react";
import { Save } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "./ui/card";
import { Button } from "./ui/button";
import { Input } from "./ui/input";
import { Label } from "./ui/label";
import type { BotConfig } from "../../../shared/types";

function Field({
  label,
  name,
  value,
  type = "text",
  onChange,
}: {
  label: string;
  name: string;
  value: string | number;
  type?: string;
  onChange: (name: string, value: string) => void;
}) {
  return (
    <div className="space-y-1.5">
      <Label htmlFor={name}>{label}</Label>
      <Input
        id={name}
        type={type}
        value={value}
        onChange={(e) => onChange(name, e.target.value)}
      />
    </div>
  );
}

function Toggle({
  label,
  name,
  checked,
  description,
  onChange,
}: {
  label: string;
  name: string;
  checked: boolean;
  description?: string;
  onChange: (name: string, value: string) => void;
}) {
  return (
    <div className="flex items-center justify-between gap-4 py-1">
      <div>
        <Label htmlFor={name} className="cursor-pointer">{label}</Label>
        {description && <p className="text-xs text-[var(--muted-foreground)] mt-0.5">{description}</p>}
      </div>
      <button
        id={name}
        role="switch"
        aria-checked={checked}
        onClick={() => onChange(name, String(!checked))}
        className={`relative inline-flex h-5 w-9 shrink-0 cursor-pointer rounded-full border-2 border-transparent transition-colors focus:outline-none focus:ring-2 focus:ring-[var(--ring)] focus:ring-offset-2 ${checked ? "bg-[var(--primary)]" : "bg-[var(--muted)]"}`}
      >
        <span
          className={`pointer-events-none inline-block h-4 w-4 rounded-full bg-white shadow-lg transition-transform ${checked ? "translate-x-4" : "translate-x-0"}`}
        />
      </button>
    </div>
  );
}

export function BotConfig({
  config,
  onSave,
  saving,
}: {
  config: BotConfig | null;
  onSave: (patch: Partial<BotConfig>) => Promise<void>;
  saving: boolean;
}) {
  const [local, setLocal] = useState<Partial<BotConfig>>({});

  useEffect(() => {
    if (config) setLocal(config);
  }, [config]);

  const set = (name: string, value: string) => {
    setLocal((prev) => {
      const coerced = value === "true" ? true : value === "false" ? false : value;
      return { ...prev, [name]: coerced };
    });
  };

  if (!config) {
    return <p className="text-[var(--muted-foreground)] text-center py-8">Loading config…</p>;
  }

  return (
    <div className="space-y-4">
      <Card>
        <CardHeader><CardTitle>AI Provider</CardTitle></CardHeader>
        <CardContent className="grid grid-cols-1 gap-3 sm:grid-cols-2">
          <Field label="Base URL" name="ai_base_url" value={local.ai_base_url ?? ""} onChange={set} />
          <Field label="Model" name="ai_model" value={local.ai_model ?? ""} onChange={set} />
          <Field label="API Key" name="ai_api_key" value={local.ai_api_key ?? ""} onChange={set} />
        </CardContent>
      </Card>

      <Card>
        <CardHeader><CardTitle>Scheduling</CardTitle></CardHeader>
        <CardContent className="grid grid-cols-2 gap-3 sm:grid-cols-3">
          <Field label="Poll interval (min)" name="poll_interval_minutes" value={local.poll_interval_minutes ?? ""} type="number" onChange={set} />
          <Field label="Post frequency (h)" name="post_frequency_hours" value={local.post_frequency_hours ?? ""} type="number" onChange={set} />
          <Field label="Reply probability" name="reply_probability" value={local.reply_probability ?? ""} type="number" onChange={set} />
          <Field label="Max posts/day" name="max_posts_per_day" value={local.max_posts_per_day ?? ""} type="number" onChange={set} />
          <Field label="Max replies/day" name="max_replies_per_day" value={local.max_replies_per_day ?? ""} type="number" onChange={set} />
          <Field label="Active hours start" name="active_hours_start" value={local.active_hours_start ?? ""} type="number" onChange={set} />
          <Field label="Active hours end" name="active_hours_end" value={local.active_hours_end ?? ""} type="number" onChange={set} />
          <Field label="Max tweet length" name="max_tweet_length" value={local.max_tweet_length ?? ""} type="number" onChange={set} />
          <div className="col-span-2 sm:col-span-3 pt-1">
            <Toggle
              label="Enable Threads"
              name="enable_threads"
              checked={local.enable_threads ?? true}
              description="Split long posts into reply chains. When off, text is truncated to max tweet length."
              onChange={set}
            />
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader><CardTitle>Persona Prompt</CardTitle></CardHeader>
        <CardContent>
          <textarea
            className="w-full min-h-[120px] rounded-md border border-[var(--input)] bg-transparent px-3 py-2 text-sm resize-y focus:outline-none focus:ring-1 focus:ring-[var(--ring)]"
            value={local.persona_prompt ?? ""}
            onChange={(e) => set("persona_prompt", e.target.value)}
          />
        </CardContent>
      </Card>

      <Button onClick={() => onSave(local)} disabled={saving}>
        <Save size={14} />
        {saving ? "Saving…" : "Save Config"}
      </Button>
    </div>
  );
}
