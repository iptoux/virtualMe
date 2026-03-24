import { useState, useEffect, useRef } from "react";
import { ChevronDown, ChevronRight, Trash2 } from "lucide-react";
import * as ScrollAreaPrimitive from "@radix-ui/react-scroll-area";
import { Badge } from "./ui/badge";
import { Button } from "./ui/button";
import { cn } from "@/lib/utils";
import { api } from "@/lib/api-client";
import { formatDate } from "@/lib/utils";
import type { Post } from "../../../shared/types";

const statusVariant: Record<string, "success" | "warning" | "destructive" | "secondary"> = {
  posted: "success",
  pending: "warning",
  failed: "destructive",
};

function PostRow({ post }: { post: Post }) {
  const [expanded, setExpanded] = useState(false);
  const hasPrompt = !!post.ai_prompt;

  return (
    <div className="rounded px-2 py-2 hover:bg-[var(--muted)]/40 text-sm border-b border-[var(--border)]/40 last:border-0">
      <div className="flex items-center gap-2 flex-wrap mb-1">
        <Badge variant={post.type === "post" ? "default" : "secondary"} className="uppercase text-[10px]">
          {post.type}
        </Badge>
        <Badge variant={statusVariant[post.status] ?? "secondary"} className="uppercase text-[10px]">
          {post.status}
        </Badge>
        <span className="text-xs text-[var(--muted-foreground)] ml-auto shrink-0">
          {formatDate(post.created_at)}
        </span>
        {hasPrompt && (
          <button
            onClick={() => setExpanded((v) => !v)}
            className="shrink-0 text-[var(--muted-foreground)] hover:text-[var(--foreground)] ml-1"
            title="Show prompt"
          >
            {expanded ? <ChevronDown size={13} /> : <ChevronRight size={13} />}
          </button>
        )}
      </div>
      <p className="text-[var(--foreground)] break-words leading-snug">{post.content}</p>
      {post.error && (
        <p className="text-xs text-[var(--destructive)] mt-0.5">{post.error}</p>
      )}
      {post.x_tweet_id && (
        <p className="text-xs text-[var(--muted-foreground)] mt-0.5 font-mono">ID: {post.x_tweet_id}</p>
      )}
      {expanded && hasPrompt && (
        <div className="mt-2 text-xs text-[var(--muted-foreground)] bg-[var(--muted)]/60 rounded p-2 whitespace-pre-wrap break-words font-mono leading-relaxed">
          {post.ai_prompt}
        </div>
      )}
    </div>
  );
}

export function PostHistory({
  posts,
  onClear,
}: {
  posts: Post[];
  onClear: () => void;
}) {
  const viewportRef = useRef<HTMLDivElement>(null);
  const [autoScroll, setAutoScroll] = useState(true);

  useEffect(() => {
    if (!autoScroll) return;
    const el = viewportRef.current;
    if (el) el.scrollTop = el.scrollHeight;
  }, [posts, autoScroll]);

  const handleScroll = () => {
    const el = viewportRef.current;
    if (!el) return;
    const atBottom = el.scrollHeight - el.scrollTop - el.clientHeight < 40;
    setAutoScroll(atBottom);
  };

  const handleClear = async () => {
    try {
      await api.clearPosts();
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
          {posts.length} posts
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

      {/* Scrollable post list */}
      <ScrollAreaPrimitive.Root className="flex-1 overflow-hidden">
        <ScrollAreaPrimitive.Viewport
          ref={viewportRef}
          className="h-full w-full rounded-[inherit]"
          onScroll={handleScroll}
        >
          <div className="pr-3">
            {posts.length === 0 && (
              <p className="text-[var(--muted-foreground)] py-4 text-center text-sm">No posts yet</p>
            )}
            {posts.map((post) => (
              <PostRow key={post.id} post={post} />
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
