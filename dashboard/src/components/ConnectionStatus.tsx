import { useState, useRef, useEffect } from "react";
import { Wifi, WifiOff, Pencil, Check } from "lucide-react";
import { Badge } from "./ui/badge";
import { getServiceUrl, setServiceUrl, wsClient } from "@/lib/api-client";

export function ConnectionStatus({ connected }: { connected: boolean }) {
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState(getServiceUrl());
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (editing) inputRef.current?.select();
  }, [editing]);

  const commit = () => {
    const url = draft.trim();
    if (url && url !== getServiceUrl()) {
      setServiceUrl(url);
      wsClient.reconnect();
    }
    setEditing(false);
  };

  const onKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === "Enter") commit();
    if (e.key === "Escape") { setDraft(getServiceUrl()); setEditing(false); }
  };

  return (
    <div className="flex flex-col gap-1.5">
      <div className="flex items-center gap-2">
        <Badge variant={connected ? "success" : "destructive"} className="gap-1.5 flex-1 justify-start">
          {connected ? <Wifi size={12} /> : <WifiOff size={12} />}
          {connected ? "Connected" : "Disconnected"}
        </Badge>
        {!editing && (
          <button
            onClick={() => { setDraft(getServiceUrl()); setEditing(true); }}
            className="text-[var(--muted-foreground)] hover:text-[var(--foreground)] transition-colors"
            title="Change backend URL"
          >
            <Pencil size={12} />
          </button>
        )}
        {editing && (
          <button
            onClick={commit}
            className="text-[var(--primary)] hover:text-[var(--foreground)] transition-colors"
            title="Save"
          >
            <Check size={12} />
          </button>
        )}
      </div>

      {editing ? (
        <input
          ref={inputRef}
          value={draft}
          onChange={(e) => setDraft(e.target.value)}
          onKeyDown={onKeyDown}
          onBlur={commit}
          className="w-full rounded px-2 py-1 text-[10px] font-mono bg-[var(--muted)] border border-[var(--border)] text-[var(--foreground)] outline-none focus:border-[var(--primary)]"
          spellCheck={false}
        />
      ) : (
        <span
          className="text-[10px] font-mono text-[var(--muted-foreground)] truncate cursor-pointer hover:text-[var(--foreground)] transition-colors"
          onClick={() => { setDraft(getServiceUrl()); setEditing(true); }}
          title={getServiceUrl()}
        >
          {getServiceUrl()}
        </span>
      )}
    </div>
  );
}
