import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import type { LinkMetadata } from "@/lib/link-preview.server";

export const getLinkMetadata = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: { url: string }) => {
    if (!input?.url?.trim()) throw new Error("url is required");
    return { url: input.url.trim() };
  })
  .handler(async ({ data }): Promise<LinkMetadata> => {
    const { fetchLinkMetadata } = await import("@/lib/link-preview.server");
    return fetchLinkMetadata(data.url);
  });
