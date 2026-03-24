import { Wifi, WifiOff } from "lucide-react";
import { Badge } from "./ui/badge";

export function ConnectionStatus({ connected }: { connected: boolean }) {
  return (
    <Badge variant={connected ? "success" : "destructive"} className="gap-1.5">
      {connected ? <Wifi size={12} /> : <WifiOff size={12} />}
      {connected ? "Connected" : "Disconnected"}
    </Badge>
  );
}
