import { createFileRoute } from "@tanstack/react-router";

// Streams attachment bytes to an authenticated agent. The short-lived signed
// 1440 URL is minted and consumed server-side only.
export const Route = createFileRoute("/api/attachments/$attachmentId")({
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

        const attachmentId = params.attachmentId;
        if (!attachmentId) return new Response("Missing attachment id", { status: 400 });

        const { proxyAttachment } = await import("@/lib/msp.server");
        return proxyAttachment(attachmentId);
      },
    },
  },
});
