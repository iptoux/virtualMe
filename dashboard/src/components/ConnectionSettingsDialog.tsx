import { useState } from "react";
import { Server, KeyRound } from "lucide-react";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from "./ui/dialog";
import { Button } from "./ui/button";
import { Input } from "./ui/input";
import { Label } from "./ui/label";

interface Props {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  initialUrl: string;
  initialSecret: string;
  /** Called when the user saves valid settings. Parent owns persistence + reconnect. */
  onSave: (url: string, secret: string) => void;
  /** When true, the dialog cannot be dismissed without saving (first-launch). */
  required?: boolean;
}

export function ConnectionSettingsDialog({
  open,
  onOpenChange,
  initialUrl,
  initialSecret,
  onSave,
  required = false,
}: Props) {
  const [url, setUrl] = useState(initialUrl);
  const [secret, setSecret] = useState(initialSecret);
  const [showSecret, setShowSecret] = useState(false);

  const canSave = url.trim().length > 0 && secret.trim().length > 0;

  const handleSave = () => {
    if (!canSave) return;
    onSave(url.trim().replace(/\/$/, ""), secret.trim());
  };

  const handleOpenChange = (next: boolean) => {
    if (!next && required) return; // block dismiss on first launch
    onOpenChange(next);
  };

  return (
    <Dialog open={open} onOpenChange={handleOpenChange}>
      <DialogContent
        hideClose={required}
        onInteractOutside={(e) => { if (required) e.preventDefault(); }}
        onEscapeKeyDown={(e) => { if (required) e.preventDefault(); }}
      >
        <DialogHeader>
          <DialogTitle>Connection Settings</DialogTitle>
          <DialogDescription>
            {required
              ? "Enter the service URL and secret to connect. These are stored locally and never sent anywhere else."
              : "Update the service URL and secret. The dashboard will reconnect immediately after saving."}
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4">
          <div className="space-y-1.5">
            <Label htmlFor="conn-url" className="flex items-center gap-1.5">
              <Server size={13} className="text-[var(--muted-foreground)]" />
              Service URL
            </Label>
            <Input
              id="conn-url"
              value={url}
              onChange={(e) => setUrl(e.target.value)}
              placeholder="http://localhost:3000"
              spellCheck={false}
              autoComplete="off"
            />
          </div>

          <div className="space-y-1.5">
            <Label htmlFor="conn-secret" className="flex items-center gap-1.5">
              <KeyRound size={13} className="text-[var(--muted-foreground)]" />
              Service Secret
            </Label>
            <div className="relative">
              <Input
                id="conn-secret"
                type={showSecret ? "text" : "password"}
                value={secret}
                onChange={(e) => setSecret(e.target.value)}
                placeholder="Your SERVICE_SECRET from .env"
                spellCheck={false}
                autoComplete="off"
                className="pr-16"
                onKeyDown={(e) => { if (e.key === "Enter" && canSave) handleSave(); }}
              />
              <button
                type="button"
                onClick={() => setShowSecret((v) => !v)}
                className="absolute right-3 top-1/2 -translate-y-1/2 text-xs text-[var(--muted-foreground)] hover:text-[var(--foreground)] transition-colors"
              >
                {showSecret ? "hide" : "show"}
              </button>
            </div>
          </div>
        </div>

        <DialogFooter>
          {!required && (
            <Button variant="ghost" size="sm" onClick={() => onOpenChange(false)}>
              Cancel
            </Button>
          )}
          <Button size="sm" onClick={handleSave} disabled={!canSave}>
            {required ? "Connect" : "Save & Reconnect"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
