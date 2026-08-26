// Asset library server functions: import an image from a URL, generate one with
// Lovable AI, or delete one. File uploads go through /api/assets/upload because
// bytes cannot cross the server-function RPC boundary.
import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import type { AssetView, RichAssetUsageValue } from "@/lib/msp.server";

const USAGES = ["rich_link_image", "interactive_image", "imessage_app_icon", "app_clip_image"];

type AssetResult = { ok: boolean; asset?: AssetView; error?: string };

function validateNew(input: { displayName: string; usage: string }) {
  const displayName = (input.displayName ?? "").trim();
  if (!displayName) throw new Error("A display name is required");
  if (displayName.length > 200) throw new Error("Display names are limited to 200 characters");
  if (!USAGES.includes(input.usage)) throw new Error("Unknown asset usage slot");
  return { ...input, displayName };
}

export const importAssetFromUrl = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: { displayName: string; usage: string; url: string }) => {
    if (!input?.url?.trim()) throw new Error("An image URL is required");
    return { ...validateNew(input), url: input.url.trim() } as typeof input;
  })
  .handler(async ({ data }): Promise<AssetResult> => {
    const { getApiKey, fetchRemoteImage, uploadRichAsset } = await import("@/lib/msp.server");
    if (!getApiKey()) return { ok: false, error: "Add MSP_API_KEY in Setup to use the asset library." };
    try {
      const image = await fetchRemoteImage(data.url);
      const asset = await uploadRichAsset({
        displayName: data.displayName,
        usage: data.usage as RichAssetUsageValue,
        bytes: image.bytes,
        contentType: image.contentType,
        filename: image.filename,
      });
      return { ok: true, asset };
    } catch (error) {
      return { ok: false, error: error instanceof Error ? error.message : "Import failed" };
    }
  });

export const generateAsset = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: { displayName: string; usage: string; prompt: string }) => {
    if (!input?.prompt?.trim()) throw new Error("Describe the image you want");
    return { ...validateNew(input), prompt: input.prompt.trim() } as typeof input;
  })
  .handler(async ({ data }): Promise<AssetResult> => {
    const { getApiKey, generateAssetImage, uploadRichAsset } = await import("@/lib/msp.server");
    if (!getApiKey()) return { ok: false, error: "Add MSP_API_KEY in Setup to use the asset library." };
    try {
      const image = await generateAssetImage(data.prompt);
      const asset = await uploadRichAsset({
        displayName: data.displayName,
        usage: data.usage as RichAssetUsageValue,
        bytes: image.bytes,
        contentType: image.contentType,
        filename: `${data.displayName.replace(/[^a-zA-Z0-9]+/g, "-").toLowerCase() || "asset"}.png`,
      });
      return { ok: true, asset };
    } catch (error) {
      return { ok: false, error: error instanceof Error ? error.message : "Generation failed" };
    }
  });

export const deleteAsset = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: { assetId: string }) => {
    if (!input?.assetId) throw new Error("assetId is required");
    return input;
  })
  .handler(async ({ data }): Promise<{ ok: boolean; error?: string }> => {
    const { getApiKey, deleteRichAsset } = await import("@/lib/msp.server");
    if (!getApiKey()) return { ok: false, error: "Add MSP_API_KEY in Setup to use the asset library." };
    try {
      await deleteRichAsset(data.assetId);
      return { ok: true };
    } catch (error) {
      const message = error instanceof Error ? error.message : "Delete failed";
      return {
        ok: false,
        error: /409|conflict/i.test(message)
          ? "A template still binds this image — unbind or delete that template first."
          : message,
      };
    }
  });
