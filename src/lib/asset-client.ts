// Client-safe helpers for the rich-asset library. Uploads and thumbnails go
// through the app's own authenticated routes; the 1440 key stays server-side.
import { supabase } from "@/integrations/supabase/client";
import type { AssetView } from "@/lib/msp.server";

export const ASSET_USAGES = [
  "rich_link_image",
  "interactive_image",
  "imessage_app_icon",
  "app_clip_image",
] as const;
export type AssetUsage = (typeof ASSET_USAGES)[number];

export const MAX_ASSET_BYTES = 3 * 1024 * 1024;

export function assetUsageLabel(usage: string): string {
  switch (usage) {
    case "rich_link_image":
      return "Rich link image";
    case "interactive_image":
      return "Interactive image";
    case "imessage_app_icon":
      return "iMessage app icon";
    case "app_clip_image":
      return "App Clip image";
    default:
      return usage;
  }
}

/** Prompt guidance that matches what Apple renders for each slot. */
export function assetPromptHint(usage: string): string {
  switch (usage) {
    case "rich_link_image":
      return "Wide hero artwork for a link card — keep text out of the image.";
    case "interactive_image":
      return "Artwork shown on a list picker or quick reply bubble.";
    case "imessage_app_icon":
      return "Square app icon, simple shape, flat background.";
    case "app_clip_image":
      return "Wide App Clip header artwork.";
    default:
      return "Describe the artwork you want.";
  }
}

async function authHeader(): Promise<Record<string, string>> {
  const { data } = await supabase.auth.getSession();
  const token = data.session?.access_token;
  if (!token) throw new Error("Your session expired — sign in again.");
  return { Authorization: `Bearer ${token}` };
}

export async function uploadAssetFile(params: {
  file: File;
  displayName: string;
  usage: AssetUsage;
}): Promise<AssetView> {
  if (params.file.size > MAX_ASSET_BYTES) throw new Error("Images must be under 3 MB");
  const form = new FormData();
  form.append("file", params.file, params.file.name);
  form.append("displayName", params.displayName);
  form.append("usage", params.usage);

  const response = await fetch("/api/assets/upload", {
    method: "POST",
    headers: await authHeader(),
    body: form,
  });
  const payload = (await response.json().catch(() => null)) as
    | { ok?: boolean; asset?: AssetView; message?: string }
    | null;
  if (!response.ok || !payload?.ok || !payload.asset) {
    throw new Error(payload?.message ?? `Upload failed (${response.status})`);
  }
  return payload.asset;
}

/** Fetch the cached thumbnail bytes and return an object URL, or null. */
export async function fetchAssetObjectUrl(assetId: string): Promise<string | null> {
  const response = await fetch(`/api/assets/${assetId}`, { headers: await authHeader() });
  if (!response.ok) return null;
  return URL.createObjectURL(await response.blob());
}
