// Server-only link metadata fetching. The page fetch never happens in the
// browser, so no customer-facing origin sees the agent's requests.
import { buildRichLinkPayload } from "@/lib/links";


export type LinkMetadataOutcome =
  | "fetched"
  | "fetched_no_image"
  | "registry"
  | "icon_fallback"
  | "blocked"
  | "not_html"
  | "invalid_url"
  | "error";

export type LinkMetadata = {
  url: string;
  title: string | null;
  description: string | null;
  imageUrl: string | null;
  imageMimeType: string | null;
  siteName: string | null;
  /** Why the card looks the way it does — surfaced in send diagnostics. */
  outcome?: LinkMetadataOutcome;
  /** HTTP status of the page fetch, when one happened. */
  httpStatus?: number | null;
  /** Human-readable note, e.g. "npmjs.com returned a bot challenge". */
  note?: string | null;
};

const TIMEOUT_MS = 4000;
const MAX_BYTES = 512 * 1024;
const CACHE_TTL_MS = 5 * 60 * 1000;

const BROWSER_UA =
  "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36";
const NPM_LOGO =
  "https://static-production.npmjs.com/338e4905a2684ca96e08c7780fc68412.png";

const cache = new Map<string, { at: number; value: LinkMetadata }>();

function empty(
  url: string,
  outcome: LinkMetadataOutcome,
  extra?: { httpStatus?: number | null; note?: string | null },
): LinkMetadata {
  return {
    url,
    title: null,
    description: null,
    imageUrl: null,
    imageMimeType: null,
    siteName: null,
    outcome,
    httpStatus: extra?.httpStatus ?? null,
    note: extra?.note ?? null,
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

/** True when a response body is a bot-challenge interstitial rather than the page. */
function isChallenge(html: string): boolean {
  return /Just a moment\.\.\.|cf-browser-verification|Enable JavaScript and cookies to continue|Checking your browser/i.test(
    html,
  );
}

async function timedFetch(
  url: string,
  headers: Record<string, string>,
): Promise<Response> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), TIMEOUT_MS);
  try {
    return await fetch(url, {
      redirect: "follow",
      signal: controller.signal,
      headers,
    });
  } finally {
    clearTimeout(timer);
  }
}

/** Registry lookup for npmjs.com package URLs, which block server-side page fetches. */
async function npmRegistryMetadata(url: URL): Promise<LinkMetadata | null> {
  if (!/(^|\.)npmjs\.com$/i.test(url.hostname)) return null;
  const match = /^\/package\/((?:@[^/]+\/)?[^/]+)/.exec(url.pathname);
  const name = match?.[1];
  if (!name) return null;
  try {
    const response = await timedFetch(
      `https://registry.npmjs.org/${encodeURIComponent(name)}`,
      { accept: "application/json" },
    );
    if (!response.ok) return null;
    const json = (await response.json()) as {
      name?: string;
      description?: string;
      "dist-tags"?: { latest?: string };
      versions?: Record<string, { description?: string }>;
    };
    const latest = json["dist-tags"]?.latest;
    const description =
      json.description ??
      (latest ? json.versions?.[latest]?.description : undefined) ??
      null;
    return {
      url: url.toString(),
      title: json.name ?? name,
      description,
      imageUrl: NPM_LOGO,
      imageMimeType: "image/png",
      siteName: "npm",
      outcome: "registry",
      httpStatus: null,
      note: "npmjs.com blocks server-side page fetches; metadata came from the npm registry.",
    };
  } catch {
    return null;
  }
}

/** Pick an icon declared in <head>, else the origin's /favicon.ico. */
function iconFromHtml(html: string, base: string): string | null {
  const candidates: { href: string; rank: number }[] = [];
  const linkPattern = /<link\b[^>]*>/gi;
  for (const tag of html.match(linkPattern) ?? []) {
    const rel = /rel=["']([^"']+)["']/i.exec(tag)?.[1]?.toLowerCase() ?? "";
    const href = /href=["']([^"']+)["']/i.exec(tag)?.[1];
    if (!href) continue;
    let rank = -1;
    if (rel.includes("apple-touch-icon")) rank = 3;
    else if (rel.includes("mask-icon")) rank = 1;
    else if (rel.includes("icon")) rank = 2;
    if (rank < 0) continue;
    candidates.push({ href: decode(href), rank });
  }
  candidates.sort((a, b) => b.rank - a.rank);
  for (const candidate of candidates) {
    try {
      const absolute = new URL(candidate.href, base);
      if (absolute.protocol === "https:") return absolute.toString();
    } catch {
      // ignore unusable href
    }
  }
  try {
    return new URL("/favicon.ico", base).toString();
  } catch {
    return null;
  }
}

/** Confirm an image URL actually resolves before putting it on an Apple card. */
async function imageResolves(url: string): Promise<boolean> {
  try {
    const response = await timedFetch(url, { accept: "image/*" });
    if (!response.ok) return false;
    const type = response.headers.get("content-type") ?? "";
    await response.body?.cancel().catch(() => undefined);
    return type.startsWith("image/") || /\.(png|jpe?g|gif|webp|ico)$/i.test(url);
  } catch {
    return false;
  }
}

/**
 * Fetch OpenGraph / Twitter / HTML metadata for an https URL, with layered
 * fallbacks (browser-shaped retry, npm registry, site icon). Never throws —
 * failures return an empty record so a send can still go out with the URL.
 */
export async function fetchLinkMetadata(rawUrl: string): Promise<LinkMetadata> {
  let url: URL;
  try {
    url = new URL(rawUrl);
  } catch {
    return empty(rawUrl, "invalid_url");
  }
  if (url.protocol !== "https:") {
    return empty(rawUrl, "invalid_url", { note: "Only https URLs get a preview." });
  }

  const key = url.toString();
  const cached = cache.get(key);
  if (cached && Date.now() - cached.at < CACHE_TTL_MS) return cached.value;

  const finish = (value: LinkMetadata): LinkMetadata => {
    cache.set(key, { at: Date.now(), value });
    return value;
  };

  try {
    const attempts: Record<string, string>[] = [
      {
        "user-agent": "Mozilla/5.0 (compatible; AMBAgentConsole/1.0; +link-preview)",
        accept: "text/html,application/xhtml+xml",
      },
      {
        "user-agent": BROWSER_UA,
        accept: "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
        "accept-language": "en-US,en;q=0.9",
      },
    ];

    let html = "";
    let status: number | null = null;
    let blocked = false;
    let notHtml = false;

    for (const headers of attempts) {
      const response = await timedFetch(key, headers);
      status = response.status;
      if (!response.ok) {
        await response.body?.cancel().catch(() => undefined);
        blocked = true;
        continue;
      }
      const contentType = response.headers.get("content-type") ?? "";
      if (!contentType.includes("html")) {
        await response.body?.cancel().catch(() => undefined);
        notHtml = true;
        break;
      }
      const body = await readCapped(response);
      if (isChallenge(body)) {
        blocked = true;
        continue;
      }
      html = body;
      blocked = false;
      break;
    }

    if (!html) {
      // Site-specific enrichment for pages we cannot read directly.
      const registry = await npmRegistryMetadata(url);
      if (registry) return finish(registry);
      if (notHtml) {
        return finish(
          empty(key, "not_html", {
            httpStatus: status,
            note: "The URL did not return an HTML page.",
          }),
        );
      }
      return finish(
        empty(key, "blocked", {
          httpStatus: status,
          note: blocked
            ? `${url.hostname} blocked the preview request${status ? ` (HTTP ${status})` : ""}.`
            : "No metadata could be read from the page.",
        }),
      );
    }

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

    let imageMimeType = imageUrl
      ? (meta(html, "og:image:type") ?? mimeFromUrl(imageUrl))
      : null;
    let outcome: LinkMetadataOutcome = imageUrl ? "fetched" : "fetched_no_image";
    let note: string | null = null;

    if (!imageUrl) {
      const icon = iconFromHtml(html, key);
      if (icon && (await imageResolves(icon))) {
        imageUrl = icon;
        imageMimeType = mimeFromUrl(icon);
        outcome = "icon_fallback";
        note = "The page had no OpenGraph image, so the site icon is used.";
      } else {
        note = "The page exposed no preview image.";
      }
    }

    return finish({
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
      imageMimeType,
      siteName: meta(html, "og:site_name"),
      outcome,
      httpStatus: status,
      note,
    });
  } catch (error) {
    console.warn("[link-preview] fetch failed", {
      url: key,
      message: error instanceof Error ? error.message : String(error),
    });
    const registry = await npmRegistryMetadata(url).catch(() => null);
    if (registry) return finish(registry);
    return empty(key, "error", {
      note: error instanceof Error ? error.message : String(error),
    });
  }
}


/** Build the Apple rich link payload for a URL plus whatever metadata we got. */
export function richLinkPayload(
  metadata: LinkMetadata,
  fallbackTitle?: string,
): Record<string, unknown> {
  return buildRichLinkPayload(metadata, fallbackTitle);
}

