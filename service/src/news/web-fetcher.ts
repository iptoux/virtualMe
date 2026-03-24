import { logger } from "../logger";

export interface WebContent {
  title: string;
  content: string;
  url: string;
}

export async function fetchWebContent(url: string): Promise<WebContent | null> {
  try {
    const res = await fetch(url, {
      headers: { "User-Agent": "Mozilla/5.0 (compatible; virtualme-bot/1.0)" },
      signal: AbortSignal.timeout(10000),
    });
    if (!res.ok) {
      logger.warn("news", `Web fetch failed ${res.status}: ${url}`);
      return null;
    }

    const html = await res.text();

    // Extract title
    const titleMatch = html.match(/<title[^>]*>([^<]+)<\/title>/i);
    const title = titleMatch ? titleMatch[1].trim() : "";

    // Strip HTML tags and extract readable text (simple approach)
    const text = html
      .replace(/<script[^>]*>[\s\S]*?<\/script>/gi, "")
      .replace(/<style[^>]*>[\s\S]*?<\/style>/gi, "")
      .replace(/<[^>]+>/g, " ")
      .replace(/\s+/g, " ")
      .trim()
      .slice(0, 2000); // First 2000 chars of content

    return { title, content: text, url };
  } catch (err) {
    logger.error("news", `Web fetch error: ${url}`, { error: String(err) });
    return null;
  }
}
