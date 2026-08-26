import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { isRawMessageType } from "@/lib/raw-payloads";
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
    (input: {
      prompt: string;
      existingJson?: string;
      channel?: string;
      messageType?: string;
      mode?: string;
    }) => {
      if (!input?.prompt?.trim() && !input?.existingJson?.trim()) {
        throw new Error("Describe the template, or paste a definition to review");
      }
      if (input.messageType && !isRawMessageType(input.messageType)) {
        throw new Error("Unknown message type");
      }
      if (input.mode && !isTemplateMode(input.mode)) throw new Error("Unknown definition mode");
      return input;
    },
  )
  .handler(async ({ data }): Promise<DraftResult> => {
    const { draftTemplateDefinition } = await import("@/lib/ai.server");
    return draftTemplateDefinition({
      prompt: data.prompt ?? "",
      ...(data.existingJson ? { existingJson: data.existingJson } : {}),
      ...(data.channel ? { channel: data.channel } : {}),
      ...(data.messageType && isRawMessageType(data.messageType)
        ? { messageType: data.messageType }
        : {}),
      ...(data.mode && isTemplateMode(data.mode) ? { mode: data.mode } : {}),
    });
  });
