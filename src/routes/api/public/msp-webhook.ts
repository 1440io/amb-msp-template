import { createFileRoute } from "@tanstack/react-router";

// Public endpoint: 1440 authenticates with its own HMAC signature over the raw
// body, not a session. Nothing here trusts the payload before verification.
export const Route = createFileRoute("/api/public/msp-webhook")({
  server: {
    handlers: {
      POST: async ({ request }) => {
        const { WebhookReceiver } = await import("@1440io/msp-webhooks");

        const {
          getWebhookSecret,
          storeInboundMessage,
          recordInitiationUpdate,
          recordWebhookEvent,
        } = await import("@/lib/msp.server");
        const { supabaseAdmin } = await import("@/integrations/supabase/client.server");

        const secret = getWebhookSecret();
        if (!secret) {
          return Response.json(
            { ok: false, error: "MSP_WEBHOOK_SECRET is not configured" },
            { status: 503 },
          );
        }

        // webhook_events doubles as the replay cache: a retry reuses the
        // Webhook-Id, so a primary-key conflict IS "already handled".
        const replayCache = {
          async seen(id: string) {
            const { error } = await supabaseAdmin
              .from("webhook_events")
              .insert({ id, event_type: "", payload: {} });
            return error?.code === "23505";
          },
        };

        const receiver = new WebhookReceiver({
          secret,
          replayCache,
          on: {
            "message.received": async (event, context) => {
              await recordWebhookEvent(context.id, event.type, event);
              await storeInboundMessage(event.conversationId, event.data.message);
            },
            "initiation.updated": async (event, context) => {
              await recordWebhookEvent(context.id, event.type, event);
              await recordInitiationUpdate(event);
            },
          },
          onEvent: async (event, context) => {
            if (!isMessageReceived(event)) return;
            void context;
          },
          onError: (error) => {
            console.error("[msp-webhook]", error);
          },
        });

        // Raw bytes — the signature covers the exact body, so never parse first.
        const result = await receiver.handle({
          headers: request.headers,
          body: new Uint8Array(await request.arrayBuffer()),
        });

        // Return the receiver's status unchanged: 2xx acknowledges, 500 asks 1440 to retry.
        return Response.json(result.body, { status: result.status });
      },
    },
  },
});
