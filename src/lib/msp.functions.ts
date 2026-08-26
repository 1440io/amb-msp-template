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

export const sendRaw = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator(
    (input: { conversationId: string; messageType: string; payload: Record<string, unknown> }) => {
      if (!input?.conversationId) throw new Error("conversationId is required");
      if (!isRawMessageType(input.messageType ?? "")) throw new Error("Unknown message type");
      return input;
    },
  )
  .handler(async ({ data }): Promise<SendResult> => {
    if (!isRawMessageType(data.messageType)) {
      return { ok: false, status: 400, code: "bad_type", message: "Unknown message type" };
    }
    const problems = validateRawPayload(data.messageType, data.payload);
    if (problems.length > 0) {
      return {
        ok: false,
        status: 400,
        code: "invalid_payload",
        message: problems[0] ?? "Invalid payload",
      };
    }
    const { getApiKey, sendRawPayload } = await import("@/lib/msp.server");
    if (!getApiKey()) {
      return { ok: false, status: 503, code: "not_configured", message: NOT_CONFIGURED };
    }
    return sendRawPayload(data);
  });

export const listAllTemplates = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(
    async (): Promise<{ configured: boolean; templates: TemplateAdminView[]; error?: string }> => {
      const { getApiKey, listAllTemplateDetails } = await import("@/lib/msp.server");
      if (!getApiKey()) return { configured: false, templates: [] };
      try {
        return { configured: true, templates: await listAllTemplateDetails() };
      } catch (error) {
        return {
          configured: true,
          templates: [],
          error: error instanceof Error ? error.message : "Could not load templates",
        };
      }
    },
  );

type TemplateWriteResult = { ok: boolean; template?: TemplateAdminView; error?: string };

function validateWrite(input: { name: string; definition: unknown }) {
  if (!input?.name?.trim()) throw new Error("A template name is required");
  if (!input.definition || typeof input.definition !== "object") {
    throw new Error("A template definition object is required");
  }
  return input;
}

export const createTemplate = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator(
    (input: {
      name: string;
      definition: unknown;
      slotBindings?: { slotName: string; assetId: string }[];
    }) => validateWrite(input) as typeof input,
  )
  .handler(async ({ data }): Promise<TemplateWriteResult> => {
    const { getApiKey, createTemplateDraft } = await import("@/lib/msp.server");
    if (!getApiKey()) return { ok: false, error: NOT_CONFIGURED };
    try {
      return { ok: true, template: await createTemplateDraft(data) };
    } catch (error) {
      return { ok: false, error: error instanceof Error ? error.message : "Create failed" };
    }
  });

export const updateTemplate = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator(
    (input: {
      templateId: string;
      name: string;
      definition: unknown;
      slotBindings?: { slotName: string; assetId: string }[];
    }) => {
      if (!input?.templateId) throw new Error("templateId is required");
      return validateWrite(input) as typeof input;
    },
  )
  .handler(async ({ data }): Promise<TemplateWriteResult> => {
    const { getApiKey, updateTemplateDraft } = await import("@/lib/msp.server");
    if (!getApiKey()) return { ok: false, error: NOT_CONFIGURED };
    try {
      const { templateId, ...body } = data;
      return { ok: true, template: await updateTemplateDraft(templateId, body) };
    } catch (error) {
      return { ok: false, error: error instanceof Error ? error.message : "Update failed" };
    }
  });

export const templateLifecycle = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: { templateId: string; action: "publish" | "archive" | "delete" }) => {
    if (!input?.templateId) throw new Error("templateId is required");
    if (!["publish", "archive", "delete"].includes(input.action)) {
      throw new Error("Unknown action");
    }
    return input;
  })
  .handler(async ({ data }): Promise<TemplateWriteResult> => {
    const {
      getApiKey,
      publishTemplateDraft,
      archiveTemplateDraft,
      deleteTemplateDraft,
    } = await import("@/lib/msp.server");
    if (!getApiKey()) return { ok: false, error: NOT_CONFIGURED };
    try {
      if (data.action === "delete") {
        await deleteTemplateDraft(data.templateId);
        return { ok: true };
      }
      const template =
        data.action === "publish"
          ? await publishTemplateDraft(data.templateId)
          : await archiveTemplateDraft(data.templateId);
      return { ok: true, template };
    } catch (error) {
      return { ok: false, error: error instanceof Error ? error.message : `${data.action} failed` };
    }
  });

export const listAssets = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async (): Promise<{ assets: AssetView[]; error?: string }> => {
    const { getApiKey, listTemplateAssets } = await import("@/lib/msp.server");
    if (!getApiKey()) return { assets: [] };
    try {
      return { assets: await listTemplateAssets() };
    } catch (error) {
      return { assets: [], error: error instanceof Error ? error.message : "Could not load assets" };
    }
  });
