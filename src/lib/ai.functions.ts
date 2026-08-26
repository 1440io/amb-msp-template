import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { isRawMessageType } from "@/lib/raw-payloads";
import { isTemplateKind } from "@/lib/template-definitions";
import type { DraftResult } from "@/lib/ai.server";

export const draftPayload = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: { messageType: string; prompt: string; existingJson?: string }) => {
    if (!isRawMessageType(input?.messageType ?? "")) throw new Error("Unknown message type");
    if (!input.prompt?.trim() && !input.existingJson?.trim()) {
      throw new Error("Describe what to build, or paste JSON to review");
    }
    return input;
  })
  .handler(async ({ data }): Promise<DraftResult> => {
    const { draftRawPayload } = await import("@/lib/ai.server");
    if (!isRawMessageType(data.messageType)) {
      return { ok: false, notes: [], error: "Unknown message type" };
    }
    return draftRawPayload({
      messageType: data.messageType,
      prompt: data.prompt ?? "",
      ...(data.existingJson ? { existingJson: data.existingJson } : {}),
    });
  });

export const draftTemplate = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator(
    (input: { prompt: string; existingJson?: string; channel?: string; kind?: string }) => {
      if (!input?.prompt?.trim() && !input?.existingJson?.trim()) {
        throw new Error("Describe the template, or paste a definition to review");
      }
      if (input.kind && !isTemplateKind(input.kind)) throw new Error("Unknown template kind");
      return input;
    },
  )
  .handler(async ({ data }): Promise<DraftResult> => {
    const { draftTemplateDefinition } = await import("@/lib/ai.server");
    return draftTemplateDefinition({
      prompt: data.prompt ?? "",
      ...(data.existingJson ? { existingJson: data.existingJson } : {}),
      ...(data.channel ? { channel: data.channel } : {}),
      ...(data.kind && isTemplateKind(data.kind) ? { kind: data.kind } : {}),
    });
  });

export const suggestTemplateVariables = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator(
    (input: {
      conversationId: string;
      templateId: string;
    }) => {
      if (!input?.conversationId) throw new Error("Missing conversation");
      if (!input?.templateId) throw new Error("Missing template");
      return input;
    },
  )
  .handler(
    async ({
      data,
    }): Promise<{
      ok: boolean;
      suggestions: { name: string; value: unknown; reason: string }[];
      error?: string;
    }> => {
      const [{ suggestVariableValues }, { getTemplateDetailById }, { supabaseAdmin }, preview] =
        await Promise.all([
          import("@/lib/ai.server"),
          import("@/lib/msp.server"),
          import("@/integrations/supabase/client.server"),
          import("@/lib/message-preview"),
        ]);

      const template = await getTemplateDetailById(data.templateId);
      if (template.variables.length === 0) return { ok: true, suggestions: [] };

      const { data: rows } = await supabaseAdmin
        .from("messages")
        .select("*")
        .eq("conversation_id", data.conversationId)
        .order("occurred_at", { ascending: false })
        .limit(30);

      const transcript = (rows ?? [])
        .slice()
        .reverse()
        .map((row) => ({
          direction: String((row as { direction?: string }).direction ?? "inbound"),
          text: preview.previewForMessage(row as never),
          at: String((row as { occurred_at?: string }).occurred_at ?? ""),
        }))
        .filter((line) => line.text.trim().length > 0);

      return suggestVariableValues({
        variables: template.variables,
        transcript,
        templateName: template.name,
      });
    },
  );
