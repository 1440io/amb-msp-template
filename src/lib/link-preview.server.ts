// Server-only link metadata fetching. The page fetch never happens in the
// browser, so no customer-facing origin sees the agent's requests.

export type LinkMetadata = {
  url: string;
  title: string | null;
  description: string | null;
  imageUrl: string | null;
  imageMimeType: string | null;
  siteName: string | null;
};

const TIMEOUT_MS = 4000;
const MAX_BYTES = 512 * 1024;
const CACHE_TTL_MS = 5 * 60 * 1000;

const cache = new Map<string, { at: number; value: LinkMetadata }>();

function empty(url: string): LinkMetadata {
  return {
    url,
    title: null,
    description: null,
    imageUrl: null,
    imageMimeType: null,
    siteName: null,
  };
}

function decode(text: string): string {
  return text
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/&nbsp;/g, " ")
    .trim();
}

/** Read a `<meta>` value by property/name, whichever attribute order is used. */
function meta(html: string, key: string): string | null {
  const patterns = [
    new RegExp(
      `<meta[^>]+(?:property|name)=["']${key}["'][^>]*content=["']([^"']*)["']`,
      "i",
    ),
    new RegExp(
      `<meta[^>]+content=["']([^"']*)["'][^>]*(?:property|name)=["']${key}["']`,
      "i",
    ),
  ];
  for (const pattern of patterns) {
    const match = pattern.exec(html);
    if (match?.[1]) return decode(match[1]);
  }
  return null;
}

function mimeFromUrl(url: string): string | null {
  const clean = url.split("?")[0] ?? url;
  if (/\.png$/i.test(clean)) return "image/png";
  if (/\.jpe?g$/i.test(clean)) return "image/jpeg";
  if (/\.gif$/i.test(clean)) return "image/gif";
  if (/\.webp$/i.test(clean)) return "image/webp";
  return null;
}

async function readCapped(response: Response): Promise<string> {
  const reader = response.body?.getReader();
  if (!reader) return "";
  const decoder = new TextDecoder();
  let html = "";
  let bytes = 0;
  while (bytes < MAX_BYTES) {
    const { done, value } = await reader.read();
    if (done) break;
    bytes += value.byteLength;
    html += decoder.decode(value, { stream: true });
    // The metadata lives in <head>; stop as soon as it is complete.
    if (/<\/head>/i.test(html)) break;
  }
  await reader.cancel().catch(() => undefined);
  return html;
}

/**
 * Fetch OpenGraph / Twitter / HTML metadata for an https URL. Never throws —
 * failures return an empty record so a send can still go out with the URL.
 */
export async function fetchLinkMetadata(rawUrl: string): Promise<LinkMetadata> {
  let url: URL;
  try {
    url = new URL(rawUrl);
  } catch {
    return empty(rawUrl);
  }
  if (url.protocol !== "https:") return empty(rawUrl);

  const key = url.toString();
  const cached = cache.get(key);
  if (cached && Date.now() - cached.at < CACHE_TTL_MS) return cached.value;

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), TIMEOUT_MS);
  try {
    const response = await fetch(key, {
      redirect: "follow",
      signal: controller.signal,
      headers: {
        "user-agent": "Mozilla/5.0 (compatible; AMBAgentConsole/1.0; +link-preview)",
        accept: "text/html,application/xhtml+xml",
      },
    });
    if (!response.ok) return empty(key);
    const contentType = response.headers.get("content-type") ?? "";
    if (!contentType.includes("html")) return empty(key);

    const html = await readCapped(response);
    const titleTag = /<title[^>]*>([\s\S]*?)<\/title>/i.exec(html)?.[1];
    const image =
      meta(html, "og:image:secure_url") ??
      meta(html, "og:image") ??
      meta(html, "twitter:image") ??
      meta(html, "twitter:image:src");
    let imageUrl: string | null = null;
    if (image) {
      try {
        const absolute = new URL(image, key);
        if (absolute.protocol === "https:") imageUrl = absolute.toString();
      } catch {
        imageUrl = null;
      }
    }

    const value: LinkMetadata = {
      url: key,
      title:
        meta(html, "og:title") ??
        meta(html, "twitter:title") ??
        (titleTag ? decode(titleTag) : null),
      description:
        meta(html, "og:description") ??
        meta(html, "twitter:description") ??
        meta(html, "description"),
      imageUrl,
      imageMimeType: imageUrl
        ? (meta(html, "og:image:type") ?? mimeFromUrl(imageUrl))
        : null,
      siteName: meta(html, "og:site_name"),
    };
    cache.set(key, { at: Date.now(), value });
    return value;
  } catch (error) {
    console.warn("[link-preview] fetch failed", {
      url: key,
      message: error instanceof Error ? error.message : String(error),
    });
    return empty(key);
  } finally {
    clearTimeout(timer);
  }
}

/** Build the Apple rich link payload for a URL plus whatever metadata we got. */
export function richLinkPayload(
  metadata: LinkMetadata,
  fallbackTitle?: string,
): Record<string, unknown> {
  return buildRichLinkPayload(metadata, fallbackTitle);
}

