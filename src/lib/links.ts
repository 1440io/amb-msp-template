// Client-safe URL detection used by the composer and the template/raw editors.

const URL_PATTERN = /https:\/\/[^\s<>"')]+/g;

/** Trim trailing punctuation that is usually sentence punctuation, not URL. */
function tidy(url: string): string {
  return url.replace(/[.,;:!?)\]}'"]+$/g, "");
}

/** All distinct https URLs in a piece of text, in order of appearance. */
export function extractUrls(text: string): string[] {
  const found = text.match(URL_PATTERN) ?? [];
  const urls: string[] = [];
  for (const raw of found) {
    const url = tidy(raw);
    if (!url) continue;
    try {
      const parsed = new URL(url);
      if (parsed.protocol !== "https:") continue;
    } catch {
      continue;
    }
    if (!urls.includes(url)) urls.push(url);
  }
  return urls;
}

/**
 * Split a composed message into the text that should be sent as a plain text
 * message and the URLs that should become rich link cards.
 */
export function splitTextAndUrls(text: string): { text: string; urls: string[] } {
  const urls = extractUrls(text);
  if (urls.length === 0) return { text: text.trim(), urls: [] };
  let remainder = text;
  for (const url of urls) remainder = remainder.split(url).join(" ");
  return { text: remainder.replace(/\s+/g, " ").trim(), urls };
}

export function hasUrl(text: string): boolean {
  return extractUrls(text).length > 0;
}

export type LinkMetadataLike = {
  url: string;
  title?: string | null;
  description?: string | null;
  imageUrl?: string | null;
  imageMimeType?: string | null;
  siteName?: string | null;
};

/** Apple rich link payload for a URL plus whatever metadata was resolved. */
export function buildRichLinkPayload(
  metadata: LinkMetadataLike,
  fallbackTitle?: string,
): Record<string, unknown> {
  const title = metadata.title || fallbackTitle || metadata.siteName || metadata.url;
  const richLinkData: Record<string, unknown> = { url: metadata.url, title };
  if (metadata.imageUrl) {
    richLinkData["assets"] = {
      image: {
        url: metadata.imageUrl,
        ...(metadata.imageMimeType ? { mimeType: metadata.imageMimeType } : {}),
      },
    };
  }
  return { type: "richLink", richLinkData };
}
