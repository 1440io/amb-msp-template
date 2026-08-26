import { createFileRoute } from "@tanstack/react-router";

// Multipart image upload into the 1440 rich-asset library. Bytes cannot cross
// the server-function RPC boundary, so this is a route; it verifies the caller's
// bearer token before the server-only 1440 client is touched.
export const Route = createFileRoute("/api/assets/upload")({
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
        const displayName = String(form.get("displayName") ?? "").trim();
        const usage = String(form.get("usage") ?? "");

        if (!(file instanceof File) || file.size === 0) {
          return Response.json({ ok: false, message: "No image received" }, { status: 400 });
        }
        if (!displayName) {
          return Response.json({ ok: false, message: "A display name is required" }, { status: 400 });
        }
        if (
          !["rich_link_image", "interactive_image", "imessage_app_icon", "app_clip_image"].includes(
            usage,
          )
        ) {
          return Response.json({ ok: false, message: "Unknown asset usage slot" }, { status: 400 });
        }
        if (file.type && !file.type.startsWith("image/")) {
          return Response.json({ ok: false, message: "Only image files are accepted" }, { status: 400 });
        }
        if (file.size > 3 * 1024 * 1024) {
          return Response.json({ ok: false, message: "Images must be under 3 MB" }, { status: 400 });
        }

        const { getApiKey, uploadRichAsset } = await import("@/lib/msp.server");
        if (!getApiKey()) {
          return Response.json(
            { ok: false, message: "Add MSP_API_KEY in Setup to use the asset library." },
            { status: 503 },
          );
        }

        try {
          const asset = await uploadRichAsset({
            displayName,
            usage: usage as "rich_link_image",
            bytes: new Uint8Array(await file.arrayBuffer()),
            contentType: file.type || "image/png",
            filename: file.name || "image.png",
          });
          return Response.json({ ok: true, asset });
        } catch (error) {
          return Response.json(
            { ok: false, message: error instanceof Error ? error.message : "Upload failed" },
            { status: 502 },
          );
        }
      },
    },
  },
});
