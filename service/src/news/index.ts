import * as crypto from "crypto";
import type { Database } from "bun:sqlite";
import { getNewsSources, insertNewsItem, markNewsSourceFetched, getUnusedNewsItems } from "../db";
import { logger } from "../logger";
import { fetchRss } from "./rss-fetcher";
import { fetchWebContent } from "./web-fetcher";

function hashContent(content: string): string {
  return crypto.createHash("sha256").update(content.trim()).digest("hex").slice(0, 32);
}

export async function fetchAllNewsSources(db: Database): Promise<number> {
  const sources = getNewsSources(db).filter((s) => s.enabled);
  if (sources.length === 0) {
    logger.info("news", "No enabled news sources to fetch");
    return 0;
  }

  let totalNew = 0;

  for (const source of sources) {
    logger.info("news", `Fetching ${source.type} source: ${source.name}`);

    let items: Array<{ title?: string; content: string; url?: string }> = [];

    if (source.type === "rss") {
      const rssItems = await fetchRss(source.url);
      items = rssItems.map((i) => ({ title: i.title, content: i.content, url: i.url }));
    } else {
      const webContent = await fetchWebContent(source.url);
      if (webContent) {
        items = [{ title: webContent.title, content: webContent.content, url: webContent.url }];
      }
    }

    for (const item of items) {
      if (!item.content.trim()) continue;
      const hash = hashContent(item.content);
      const inserted = insertNewsItem(db, source.id, item.content, hash, item.title, item.url);
      if (inserted) totalNew++;
    }

    markNewsSourceFetched(db, source.id);
    logger.info("news", `Fetched ${items.length} items from ${source.name}, ${totalNew} new total`);
  }

  return totalNew;
}

export function getNewsContext(db: Database, count = 3): { id: number; text: string; url: string | null }[] {
  const items = getUnusedNewsItems(db, count);
  return items.map((item) => ({
    id: item.id,
    url: item.url ?? null,
    text: [item.title, item.content.slice(0, 500)].filter(Boolean).join(": "),
  }));
}
