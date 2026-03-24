import { logger } from "./logger";

export interface SearchResult {
  text: string;
  url: string;
}

/**
 * Fetch background context from DuckDuckGo Instant Answer API.
 * Single attempt, 5s timeout. Returns [] on any failure.
 */
export async function searchDuckDuckGo(query: string): Promise<SearchResult[]> {
  const trimmed = query.slice(0, 120).trim();
  if (!trimmed) return [];

  const url =
    `https://api.duckduckgo.com/?q=${encodeURIComponent(trimmed)}&format=json&no_html=1&skip_disambig=1`;

  try {
    const res = await fetch(url, { signal: AbortSignal.timeout(5000) });
    if (!res.ok) {
      logger.warn("search", `DuckDuckGo returned ${res.status} — skipping search context`);
      return [];
    }

    const data = await res.json() as any;
    const results: SearchResult[] = [];

    if (data.AbstractText) {
      results.push({ text: data.AbstractText as string, url: (data.AbstractURL as string) ?? "" });
    }

    for (const topic of ((data.RelatedTopics ?? []) as any[])) {
      if (results.length >= 3) break;
      if (topic.Text && topic.FirstURL) {
        results.push({ text: topic.Text as string, url: topic.FirstURL as string });
      }
    }

    if (results.length > 0) {
      logger.info("search", `DuckDuckGo returned ${results.length} result(s) for: "${trimmed.slice(0, 60)}"`);
    } else {
      logger.info("search", `DuckDuckGo returned no results for: "${trimmed.slice(0, 60)}"`);
    }

    return results;
  } catch (err) {
    logger.warn("search", `DuckDuckGo fetch failed — skipping search context: ${err instanceof Error ? err.message : String(err)}`);
    return [];
  }
}
