import { createServerFn } from "@tanstack/react-start";
import { getRequest } from "@tanstack/react-start/server";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { isRawMessageType, validateRawPayload } from "@/lib/raw-payloads";
import type {
  AssetView,
  SendResult,
  SetupStatus,
  TemplateAdminView,
  TemplateView,
} from "@/lib/msp.server";

const NOT_CONFIGURED = "Demo mode: add MSP_API_KEY in Setup to use the live 1440 API.";

export const getSetupStatus = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async (): Promise<SetupStatus> => {
    const { readSetupStatus } = await import("@/lib/msp.server");
    const origin = new URL(getRequest().url).origin;
    return readSetupStatus(origin);
  });

export const runBackfill = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .handler(async (): Promise<{ ok: boolean; conversations?: number; messages?: number; error?: string }> => {
    const { getApiKey, backfillFromApi } = await import("@/lib/msp.server");
    if (!getApiKey()) {
      return { ok: false, error: "MSP_API_KEY is not configured yet." };
    }
    try {
      const result = await backfillFromApi();
      return { ok: true, ...result };
    } catch (error) {
      return { ok: false, error: error instanceof Error ? error.message : "Backfill failed" };
    }
  });

export const sendMessage = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator(
    (input: {
      conversationId: string;
      body?: string;
      attachmentIds?: string[];
      templateId?: string;
      variables?: Record<string, unknown>;
    }) => {
      if (!input?.conversationId) throw new Error("conversationId is required");
      if (!input.templateId && !input.body?.trim() && !input.attachmentIds?.length) {
        throw new Error("A message needs text, attachments, or a template");
      }
      return input;
    },
  )
  .handler(async ({ data }): Promise<SendResult> => {
    const { getApiKey, sendOutbound } = await import("@/lib/msp.server");
    if (!getApiKey()) {
      return {
        ok: false,
        status: 503,
        code: "not_configured",
        message: "Demo mode: add MSP_API_KEY in Setup to send real messages.",
      };
    }
    return sendOutbound(data);
  });

export const listTemplates = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async (): Promise<{ configured: boolean; templates: TemplateView[]; error?: string }> => {
    const { getApiKey, listPublishedTemplates } = await import("@/lib/msp.server");
    if (!getApiKey()) return { configured: false, templates: [] };
    try {
      return { configured: true, templates: await listPublishedTemplates() };
    } catch (error) {
      return {
        configured: true,
        templates: [],
        error: error instanceof Error ? error.message : "Could not load templates",
      };
    }
  });
