import { createFileRoute } from "@tanstack/react-router";

// Serves our private cached copy of a library image so the console can show a
// thumbnail. The 1440 API exposes no read URL for rich assets.
export const Route = createFileRoute("/api/assets/$assetId")({
  server: {
    handlers: {
      GET: async ({ request, params }) => {
        const { requireApiUser } = await import("@/lib/api-auth.server");
        try {
          await requireApiUser(request);
        } catch (response) {
          if (response instanceof Response) return response;
          throw response;
        }

        const assetId = params.assetId;
        if (!assetId) return new Response("Missing asset id", { status: 400 });

        const { proxyRichAsset } = await import("@/lib/msp.server");
        return proxyRichAsset(assetId);
      },
    },
  },
});
