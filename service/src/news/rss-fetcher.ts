import Parser from "rss-parser";
import { logger } from "../logger";

const parser = new Parser({ timeout: 10000 });

export interface RssItem {
  title: string;
  content: string;
  url: string;
}

export async function fetchRss(url: string): Promise<RssItem[]> {
  try {
    const feed = await parser.parseURL(url);
    return (feed.items ?? []).slice(0, 20).map((item) => ({
      title: item.title ?? "",
      content: item.contentSnippet ?? item.content ?? item.summary ?? item.title ?? "",
      url: item.link ?? url,
    }));
  } catch (err) {
    logger.error("news", `Failed to fetch RSS feed: ${url}`, { error: String(err) });
    return [];
  }
}
