import { useState } from "react";
import { BarChart2, ScrollText, Settings, Rss, FileText, Bot } from "lucide-react";
import { ConnectionSettingsDialog } from "./components/ConnectionSettingsDialog";
import { isConnectionConfigured, setConnectionSettings } from "./lib/connection-settings";
import { wsClient } from "./lib/api-client";
import { ScrollArea } from "./components/ui/scroll-area";
import { ConnectionStatus } from "./components/ConnectionStatus";
import { StatsOverview } from "./components/StatsOverview";
import { LiveLogs } from "./components/LiveLogs";
import { PostHistory } from "./components/PostHistory";
import { NewsSources } from "./components/NewsSources";
import { BotConfig } from "./components/BotConfig";
import { cn } from "./lib/utils";
import {
  useServiceConnection,
  useStats,
  useLogs,
  usePosts,
  useConfig,
  useNewsSources,
} from "./lib/store";

type Tab = "stats" | "logs" | "posts" | "news" | "config";

const tabs: { id: Tab; label: string; icon: React.ElementType }[] = [
  { id: "stats", label: "Overview", icon: BarChart2 },
  { id: "logs", label: "Live Logs", icon: ScrollText },
  { id: "posts", label: "Posts", icon: FileText },
  { id: "news", label: "News Sources", icon: Rss },
  { id: "config", label: "Config", icon: Settings },
];

export default function App() {
  const [activeTab, setActiveTab] = useState<Tab>("stats");
  const [setupOpen, setSetupOpen] = useState(!isConnectionConfigured());

  const handleSetupSave = (url: string, secret: string) => {
    setConnectionSettings(url, secret);
    setSetupOpen(false);
    wsClient.reconnect();
  };
  const connected = useServiceConnection();
  const stats = useStats();
  const { logs, clear: clearLogs } = useLogs(200);
  const { posts, clear: clearPosts } = usePosts(undefined, 100);
  const { config, save, saving } = useConfig();
  const { sources, refresh: refreshSources } = useNewsSources();

  return (
    <div className="dark flex h-screen bg-[var(--background)] text-[var(--foreground)]">
      <ConnectionSettingsDialog
        open={setupOpen}
        onOpenChange={setSetupOpen}
        initialUrl="http://localhost:3000"
        initialSecret=""
        onSave={handleSetupSave}
        required
      />
      {/* Sidebar */}
      <aside className="flex w-56 flex-col border-r border-[var(--border)] bg-[var(--card)]">
        <div className="flex items-center gap-2 px-4 py-5 border-b border-[var(--border)]">
          <Bot size={20} className="text-[var(--primary)]" />
          <span className="font-semibold text-sm">virtualMe</span>
        </div>
        <nav className="flex-1 p-2 space-y-0.5">
          {tabs.map(({ id, label, icon: Icon }) => (
            <button
              key={id}
              onClick={() => setActiveTab(id)}
              className={cn(
                "flex w-full items-center gap-2.5 rounded-md px-3 py-2 text-sm transition-colors",
                activeTab === id
                  ? "bg-[var(--accent)] text-[var(--accent-foreground)] font-medium"
                  : "text-[var(--muted-foreground)] hover:bg-[var(--accent)] hover:text-[var(--accent-foreground)]"
              )}
            >
              <Icon size={16} />
              {label}
            </button>
          ))}
        </nav>
        <div className="p-4 border-t border-[var(--border)]">
          <ConnectionStatus connected={connected} />
        </div>
      </aside>

      {/* Main content */}
      {activeTab === "logs" || activeTab === "posts" ? (
        <main className="flex-1 overflow-hidden p-6 flex flex-col">
          {activeTab === "logs" && <LiveLogs logs={logs} onClear={clearLogs} />}
          {activeTab === "posts" && <PostHistory posts={posts} onClear={clearPosts} />}
        </main>
      ) : (
        <ScrollArea className="flex-1">
          <main className="p-6">
            {activeTab === "stats" && <StatsOverview stats={stats} />}
            {activeTab === "news" && (
              <NewsSources sources={sources} onRefresh={refreshSources} />
            )}
            {activeTab === "config" && (
              <BotConfig config={config} onSave={save} saving={saving} />
            )}
          </main>
        </ScrollArea>
      )}
    </div>
  );
}
