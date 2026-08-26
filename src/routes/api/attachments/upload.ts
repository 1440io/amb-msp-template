import { createFileRoute } from "@tanstack/react-router";

// Raw multipart upload: bytes cannot cross the server-function RPC boundary, so
// this is a route. It verifies the caller's Supabase bearer token before the
// server-only 1440 client is touched.
export const Route = createFileRoute("/api/attachments/upload")({
  server: {
    handlers: {
      POST: async ({ request }) => {
        const { requireApiUser } = await import("@/lib/api-auth.server");
        try {
          await requireApiUser(request);
        } catch (response) {
          if (response instanceof Response) return response;
          throw response;
        }

        const form = await request.formData();
        const file = form.get("file");
        const conversationId = form.get("conversationId");

        if (!(file instanceof File) || file.size === 0) {
          return Response.json({ ok: false, message: "No file received" }, { status: 400 });
        }

        const { uploadAttachment } = await import("@/lib/msp.server");
        const { supabaseAdmin } = await import("@/integrations/supabase/client.server");

        let targetChannel: "amb" | "tiktok" | undefined;
        if (typeof conversationId === "string" && conversationId) {
          const { data } = await supabaseAdmin
            .from("conversations")
            .select("channel_platform")
            .eq("id", conversationId)
            .maybeSingle();
          if (data?.channel_platform === "tiktok") targetChannel = "tiktok";
          else if (data?.channel_platform === "amb") targetChannel = "amb";
        }

        const bytes = new Uint8Array(await file.arrayBuffer());
        const result = await uploadAttachment({
          bytes,
          filename: file.name || "upload",
          ...(file.type ? { contentType: file.type } : {}),
          ...(targetChannel ? { targetChannel } : {}),
        });

        if (!result.ok) {
          return Response.json(
            { ok: false, message: result.message, code: result.code },
            { status: result.status },
          );
        }
        return Response.json({ ok: true, attachment: result.attachment });
      },
    },
  },
});
