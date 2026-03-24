import { useState } from "react";
import { Wifi, WifiOff, Pencil } from "lucide-react";
import { Badge } from "./ui/badge";
import { ConnectionSettingsDialog } from "./ConnectionSettingsDialog";
import { getServiceUrl, getServiceSecret, setConnectionSettings } from "@/lib/connection-settings";
import { wsClient } from "@/lib/api-client";

export function ConnectionStatus({ connected }: { connected: boolean }) {
  const [open, setOpen] = useState(false);

  const handleSave = (url: string, secret: string) => {
    setConnectionSettings(url, secret);
    wsClient.reconnect();
    setOpen(false);
  };

  return (
    <>
      <div className="flex flex-col gap-1.5">
        <div className="flex items-center gap-2">
          <Badge variant={connected ? "success" : "destructive"} className="gap-1.5 flex-1 justify-start">
            {connected ? <Wifi size={12} /> : <WifiOff size={12} />}
            {connected ? "Connected" : "Disconnected"}
          </Badge>
          <button
            onClick={() => setOpen(true)}
            className="text-[var(--muted-foreground)] hover:text-[var(--foreground)] transition-colors"
            title="Connection settings"
          >
            <Pencil size={12} />
          </button>
        </div>
        <span
          className="text-[10px] font-mono text-[var(--muted-foreground)] truncate cursor-pointer hover:text-[var(--foreground)] transition-colors"
          onClick={() => setOpen(true)}
          title={getServiceUrl()}
        >
          {getServiceUrl()}
        </span>
      </div>

      <ConnectionSettingsDialog
        open={open}
        onOpenChange={setOpen}
        initialUrl={getServiceUrl()}
        initialSecret={getServiceSecret()}
        onSave={handleSave}
      />
    </>
  );
}
