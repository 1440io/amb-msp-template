// Server-only 1440 MSP integration. The integration API key and webhook
// signing secret are read here and never leave the server.
import { MspClient, isMspApiError, uuidv7 } from "@1440io/msp-api";
import type {
  Conversation,
  ConversationMessage,
  RichTemplateDetail,
  RichReason,
  WebhookMessageSummary,
} from "@1440io/msp-types";
import { isOptOutMessage, isTextMessage, isInteractiveMessage } from "@1440io/msp-webhooks";
import type { Json } from "@/lib/raw-payloads";
import {
  attachmentSummary,
  summarizeInteractive,
  type MessageContent,
} from "@/lib/message-preview";
import { supabaseAdmin } from "@/integrations/supabase/client.server";

export function getApiKey(): string | undefined {
  return process.env["MSP_API_KEY"] || undefined;
}

export function getWebhookSecret(): string | undefined {
  return process.env["MSP_WEBHOOK_SECRET"] || undefined;
}

// MspClient.fromEnv() reads process.env in Node terms only; be explicit.
export function requireMspClient(): MspClient {
  const apiKey = getApiKey();
  if (!apiKey) throw new Error("MSP_API_KEY is not configured");
  return new MspClient({ apiKey });
}

// Public, stable Lovable hostnames for this project. They never change when the
// project is renamed, so they are safe to paste into the 1440 console.
export const LOVABLE_PROJECT_ID = "28feeade-662c-4c56-be4d-a0a3f929a761";
export const STABLE_PRODUCTION_ORIGIN = `https://project--${LOVABLE_PROJECT_ID}.lovable.app`;
export const STABLE_PREVIEW_ORIGIN = `https://project--${LOVABLE_PROJECT_ID}-dev.lovable.app`;

const WEBHOOK_PATH = "/api/public/msp-webhook";

export type SetupStatus = {
  hasApiKey: boolean;
  hasWebhookSecret: boolean;
  webhookUrls: { production: string; preview: string };
  demoData: boolean;
};

/** Never surface a localhost endpoint — 1440 cannot deliver to it. */
function productionOrigin(origin: string): string {
  try {
    const url = new URL(origin);
    if (url.hostname === "localhost" || url.hostname === "127.0.0.1") {
      return STABLE_PRODUCTION_ORIGIN;
    }
    return url.origin;
  } catch {
    return STABLE_PRODUCTION_ORIGIN;
  }
}

export async function readSetupStatus(origin: string): Promise<SetupStatus> {
  const { count } = await supabaseAdmin
    .from("conversations")
    .select("id", { count: "exact", head: true })
    .eq("is_demo", false);

  return {
    hasApiKey: Boolean(getApiKey()),
    hasWebhookSecret: Boolean(getWebhookSecret()),
    webhookUrls: {
      production: `${productionOrigin(origin)}${WEBHOOK_PATH}`,
      preview: `${STABLE_PREVIEW_ORIGIN}${WEBHOOK_PATH}`,
    },
    demoData: (count ?? 0) === 0,
  };
}


/** One stored attachment shape, whatever the wire shape was. */
export type StoredAttachment = {
  id: string;
  fileName: string | null;
  mimeType: string | null;
  sizeBytes: number | null;
};

export function normalizeAttachments(input: unknown): StoredAttachment[] {
  if (!Array.isArray(input)) return [];
  return input.flatMap((entry) => {
    const item = (entry ?? {}) as Record<string, unknown>;
    const id = typeof item["id"] === "string" ? item["id"] : null;
    if (!id) return [];
    const name = item["originalFileName"] ?? item["fileName"] ?? null;
    const size = item["sizeBytes"] ?? item["byteSize"] ?? item["size"] ?? null;
    return [
      {
        id,
        fileName: typeof name === "string" ? name : null,
        mimeType: typeof item["mimeType"] === "string" ? (item["mimeType"] as string) : null,
        sizeBytes: typeof size === "number" ? size : null,
      },
    ];
  });
}

function previewOf(message: WebhookMessageSummary | ConversationMessage): string {
  if ("senderType" in message) {
    if (message.textBody) return message.textBody.slice(0, 160);
    if (message.attachments.length > 0) return attachmentSummary(message.attachments as never);
    return message.messageType.replace(/_/g, " ");
  }
  if (isTextMessage(message)) return message.content.body.slice(0, 160);
  if (isOptOutMessage(message)) return "Customer opted out of messaging";
  if (isInteractiveMessage(message)) {
    return summarizeInteractive(message.content as MessageContent).slice(0, 160);
  }
  if (message.attachments.length > 0) return attachmentSummary(message.attachments as never);
  return String(message.messageType).replace(/_/g, " ");
}



/** Store an inbound webhook message and keep its conversation row current. */
export async function storeInboundMessage(
  conversationId: string,
  message: WebhookMessageSummary,
): Promise<void> {
  const optedOut = isOptOutMessage(message);
  const occurredAt = new Date().toISOString();
  const preview = previewOf(message);

  const { error: convError } = await supabaseAdmin.from("conversations").upsert(
    {
      id: conversationId,
      channel_platform: message.channelPlatform || "amb",
      status: optedOut ? "opted_out" : "active",
      ...(optedOut ? { opted_out: true } : {}),
      last_message_at: occurredAt,
      last_message_preview: preview,
      is_demo: false,
      updated_at: occurredAt,
    },
    { onConflict: "id" },
  );
  if (convError) throw new Error(`conversation upsert failed: ${convError.message}`);

  const { error: msgError } = await supabaseAdmin.from("messages").upsert(
    {
      id: message.id,
      conversation_id: conversationId,
      direction: "inbound",
      message_type: String(message.messageType),
      content: message.content as never,
      attachments: normalizeAttachments(message.attachments) as never,
      request_identifier:
        isInteractiveMessage(message) ? message.content.requestIdentifier : null,
      occurred_at: occurredAt,
      is_demo: false,
    },
    { onConflict: "id" },
  );
  if (msgError) throw new Error(`message insert failed: ${msgError.message}`);

  const { count: unread } = await supabaseAdmin
    .from("messages")
    .select("id", { count: "exact", head: true })
    .eq("conversation_id", conversationId)
    .eq("direction", "inbound");

  await supabaseAdmin
    .from("conversations")
    .update({ unread_count: unread ?? 0 })
    .eq("id", conversationId);
}


/**
 * Record an `initiation.updated` transition. The status lives on `event.data`
 * (initiationId/status/reasonCode/conversationId), not on a nested
 * `data.initiation` object.
 */
export async function recordInitiationUpdate(payload: unknown): Promise<void> {
  const event = payload as {
    occurredAt?: string;
    data?: {
      initiationId?: string;
      status?: string;
      reasonCode?: string | null;
      conversationId?: string | null;
      channel?: string;
      purpose?: string;
      callerReference?: string | null;
      occurredAt?: string;
    };
  };
  const data = event.data;
  if (!data?.initiationId || !data.status) return;

  const updatedAt = data.occurredAt ?? event.occurredAt ?? new Date().toISOString();
  await supabaseAdmin.from("initiations").upsert(
    {
      id: data.initiationId,
      channel: data.channel ?? "amb",
      purpose: data.purpose ?? "connect",
      status: data.status,
      reason_code: data.reasonCode ?? null,
      caller_reference: data.callerReference ?? null,
      conversation_id: data.conversationId ?? null,
      is_demo: false,
      updated_at: updatedAt,
    },
    { onConflict: "id" },
  );

  if (data.conversationId && (data.status === "accepted" || data.status === "declined")) {
    await supabaseAdmin
      .from("conversations")
      .update({ agent_status: data.status === "accepted" ? "live" : "bot" })
      .eq("id", data.conversationId);
  }
}

export async function recordWebhookEvent(
  id: string,
  eventType: string,
  payload: unknown,
): Promise<void> {
  await supabaseAdmin
    .from("webhook_events")
    .update({ event_type: eventType, payload: payload as never })
    .eq("id", id);
}

function upsertRowFromConversation(conversation: Conversation) {
  return {
    id: conversation.id,
    channel_platform: conversation.channelPlatform,
    channel_address: conversation.channelAddress,
    first_name: conversation.firstName,
    last_name: conversation.lastName,
    status: conversation.status,
    agent_status: conversation.agentStatus,
    opted_out: conversation.optedOut,
    last_message_at: conversation.lastMessageAt,
    unread_count: 0,
    is_demo: false,
    updated_at: conversation.updatedAt,
  };
}

/** Backfill conversations and their recent messages from the 1440 API. */
export async function backfillFromApi(
  maxConversations = 40,
): Promise<{ conversations: number; messages: number }> {
  const client = requireMspClient();
  let conversations = 0;
  let messages = 0;

  for await (const conversation of client.conversations.list({ status: "active" })) {
    const detail = await client.conversations.get(conversation.id, { count: 50 });
    const rows = detail.messages.map((message: ConversationMessage) => ({
      id: message.id,
      conversation_id: conversation.id,
      direction: message.senderType === "customer" ? "inbound" : "outbound",
      message_type: message.messageType,
      content: (message.content ?? { body: message.textBody }) as never,
      attachments: normalizeAttachments(message.attachments) as never,
      request_identifier: null,
      occurred_at: message.createdAt,
      is_demo: false,
    }));

    const latest = detail.messages[detail.messages.length - 1];
    await supabaseAdmin.from("conversations").upsert(
      {
        ...upsertRowFromConversation(conversation),
        last_message_preview: latest ? previewOf(latest) : null,
      },
      { onConflict: "id" },
    );
    if (rows.length > 0) {
      await supabaseAdmin.from("messages").upsert(rows, { onConflict: "id" });
      messages += rows.length;
    }
    conversations += 1;
    if (conversations >= maxConversations) break;
  }

  // Invitations belong to the same backfill pass.
  await backfillInitiations();

  // Real data replaces the seeded demo conversations.
  await supabaseAdmin.from("conversations").delete().eq("is_demo", true);

  return { conversations, messages };
}

/** Everything an agent needs to explain a send, safe to show in the UI. */
export type SendDebug = {
  requestMessageId?: string;
  conversationId: string;
  kind: string;
  messageType?: string;
  endpoint?: string;
  httpStatus?: number;
  errorCode?: string;
  reasons?: RichReason[];
  durationMs?: number;
  problems?: string[];
  /** Why an auto-converted rich link looks the way it does (image, title, source). */
  linkPreview?: {
    url: string;
    outcome?: string | undefined;
    httpStatus?: number | null;
    hasImage: boolean;
    note?: string | null;
  };
  /** The payload we actually sent, echoed back so the JSON can be inspected. */
  sentPayload?: Json;
  at: string;

};

export type SendResult =
  | { ok: true; messageId: string; duplicate: boolean; debug?: SendDebug }
  | {
      ok: false;
      status: number;
      code?: string;
      message: string;
      reasons?: RichReason[];
      debug?: SendDebug;
    };

export type SendInput = {
  conversationId: string;
  body?: string;
  attachmentIds?: string[];
  /** Metadata for freshly uploaded files so the thread renders them at once. */
  attachments?: StoredAttachment[];
  templateId?: string;
  variables?: Record<string, unknown>;
};


/**
 * Text sends automatically become rich link cards when they contain a URL:
 * the surrounding text goes first as a plain message, then one card per link.
 */
export async function sendOutbound(input: SendInput): Promise<SendResult> {
  if (!input.templateId && input.body?.trim()) {
    const { splitTextAndUrls } = await import("@/lib/links");
    const { text, urls } = splitTextAndUrls(input.body);
    if (urls.length > 0) {
      const { fetchLinkMetadata, richLinkPayload } = await import("@/lib/link-preview.server");
      const { RICH_LINK_IMAGE_NOTE } = await import("@/lib/links");
      const hasAttachments =
        (input.attachments?.length ?? 0) > 0 || (input.attachmentIds?.length ?? 0) > 0;

      let last: SendResult | undefined;
      if (text || hasAttachments) {
        const { body: _ignored, ...rest } = input;
        last = await sendPlainOutbound(text ? { ...rest, body: text } : rest);
        if (!last.ok) return last;
      }


      for (const url of urls) {
        const metadata = await fetchLinkMetadata(url);
        const linkPreview = {
          url,
          outcome: metadata.outcome,
          httpStatus: metadata.httpStatus ?? null,
          hasImage: Boolean(metadata.imageUrl),
          note: [metadata.note, metadata.imageUrl ? RICH_LINK_IMAGE_NOTE : null]
            .filter(Boolean)
            .join(" ") || null,
        };
        last = await sendRawPayload({
          conversationId: input.conversationId,
          messageType: "rich_link",
          payload: richLinkPayload(metadata, text || undefined),
        });
        if (last.debug) last.debug.linkPreview = linkPreview;
        if (!last.ok) return last;
      }

      return last ?? sendPlainOutbound(input);
    }
  }
  return sendPlainOutbound(input);
}

async function sendPlainOutbound(input: SendInput): Promise<SendResult> {
  const client = requireMspClient();

  const attachmentIds = input.attachments?.length
    ? input.attachments.map((attachment) => attachment.id)
    : (input.attachmentIds ?? []);

  const { data: conversation } = await supabaseAdmin
    .from("conversations")
    .select("opted_out")
    .eq("id", input.conversationId)
    .maybeSingle();

  if (conversation?.opted_out) {
    return {
      ok: false,
      status: 403,
      code: "opted_out",
      message: "This customer has opted out of messaging.",
    };
  }

  const requestMessageId = uuidv7();
  const kind = input.templateId ? "template" : "text";

  // Written before the send so a retry reuses the key instead of double-sending.
  await supabaseAdmin.from("outbound_log").insert({
    request_message_id: requestMessageId,
    conversation_id: input.conversationId,
    kind,
    status: "pending",
  });

  try {
    const result = input.templateId
      ? await client.messaging.sendTemplate({
          conversationId: input.conversationId,
          templateId: input.templateId,
          variables: (input.variables ?? {}) as never,
          requestMessageId,
        })
      : await client.messaging.sendText({
          conversationId: input.conversationId,
          ...(input.body ? { body: input.body } : {}),
          ...(attachmentIds.length ? { attachmentIds } : {}),
          requestMessageId,
        });

    await supabaseAdmin
      .from("outbound_log")
      .update({ status: result.duplicate ? "duplicate" : "sent" })
      .eq("request_message_id", requestMessageId);

    const occurredAt = new Date().toISOString();
    await supabaseAdmin.from("messages").upsert(
      {
        id: result.messageId,
        conversation_id: input.conversationId,
        direction: "outbound",
        message_type: input.templateId ? "rich_message" : "text",
        content: (input.templateId
          ? { templateId: input.templateId, variables: input.variables ?? {} }
          : { body: input.body ?? "" }) as never,
        attachments: (input.attachments?.length
          ? normalizeAttachments(input.attachments)
          : attachmentIds.map((id) => ({
              id,
              fileName: null,
              mimeType: null,
              sizeBytes: null,
            }))) as never,
        request_identifier: requestMessageId,
        occurred_at: occurredAt,
        is_demo: false,
      },
      { onConflict: "id" },
    );
    await supabaseAdmin
      .from("conversations")
      .update({
        last_message_at: occurredAt,
        last_message_preview:
          input.body ??
          (attachmentIds.length > 0
            ? attachmentSummary((input.attachments ?? attachmentIds.map((id) => ({ id }))) as never)
            : "Rich message"),
        unread_count: 0,
        updated_at: occurredAt,
      })
      .eq("id", input.conversationId);

    return { ok: true, messageId: result.messageId, duplicate: result.duplicate };
  } catch (error) {
    if (isMspApiError(error)) {
      await supabaseAdmin
        .from("outbound_log")
        .update({
          status: "rejected",
          error_code: error.code ?? String(error.status),
          reasons: (error.reasons ?? null) as never,
        })
        .eq("request_message_id", requestMessageId);
      return {
        ok: false,
        status: error.status,
        ...(error.code ? { code: error.code } : {}),
        message: error.message,
        ...(error.reasons ? { reasons: error.reasons } : {}),
      };
    }
    await supabaseAdmin
      .from("outbound_log")
      .update({ status: "failed", error_code: "transport_error" })
      .eq("request_message_id", requestMessageId);
    throw error;
  }
}

export type TemplateView = {
  id: string;
  name: string;
  mode: string;
  status: string;
  nativeChannel: string | null;
  variables: { name: string; type: string; required: boolean }[];
  readiness: { channel: string; status: string; resolvedNativeType: string | null; reasons: RichReason[] }[];
};

export async function listPublishedTemplates(): Promise<TemplateView[]> {
  const client = requireMspClient();
  const page = await client.templates.list({ count: 50 });
  const details = await Promise.all(
    page.templates.map((summary) => client.templates.get(summary.id)),
  );

  return details.map((detail: RichTemplateDetail) => ({
    id: detail.id,
    name: detail.name,
    mode: detail.mode,
    status: detail.status,
    nativeChannel: detail.nativeChannel,
    variables:
      detail.definition.mode === "canonical"
        ? detail.definition.variables.map((variable) => ({
            name: variable.name,
            type: variable.type,
            required: variable.required,
          }))
        : [],
    readiness: detail.readiness.map((entry) => ({
      channel: entry.channel,
      status: entry.status,
      resolvedNativeType: entry.resolvedNativeType,
      reasons: entry.reasons,
    })),
  }));
}

/** Send a channel-native payload straight through, bypassing templates. */
export async function sendRawPayload(input: {
  conversationId: string;
  messageType: string;
  payload: Record<string, unknown>;
}): Promise<SendResult> {
  const startedAt = Date.now();
  const baseDebug: SendDebug = {
    conversationId: input.conversationId,
    kind: "raw",
    messageType: input.messageType,
    endpoint: "POST /messaging/send-raw",
    sentPayload: input.payload as Json,
    at: new Date().toISOString(),
  };
  const client = requireMspClient();

  const { data: conversation } = await supabaseAdmin
    .from("conversations")
    .select("opted_out")
    .eq("id", input.conversationId)
    .maybeSingle();

  if (conversation?.opted_out) {
    return {
      ok: false,
      status: 403,
      code: "opted_out",
      message: "This customer has opted out of messaging.",
      debug: { ...baseDebug, httpStatus: 403, errorCode: "opted_out" },
    };
  }

  const requestMessageId = uuidv7();
  baseDebug.requestMessageId = requestMessageId;
  await supabaseAdmin.from("outbound_log").insert({
    request_message_id: requestMessageId,
    conversation_id: input.conversationId,
    kind: "raw",
    status: "pending",
    payload: input.payload as never,
  });

  try {
    const result = await client.messaging.sendRaw({
      channel: "amb",
      conversationId: input.conversationId,
      messageType: input.messageType as never,
      payload: input.payload,
      requestMessageId,
    });

    await supabaseAdmin
      .from("outbound_log")
      .update({ status: result.duplicate ? "duplicate" : "sent" })
      .eq("request_message_id", requestMessageId);

    const occurredAt = new Date().toISOString();
    const preview =
      typeof input.payload["body"] === "string"
        ? (input.payload["body"] as string).slice(0, 160)
        : `Raw ${input.messageType.replace(/_/g, " ")}`;

    await supabaseAdmin.from("messages").upsert(
      {
        id: result.messageId,
        conversation_id: input.conversationId,
        direction: "outbound",
        message_type: input.messageType,
        content: input.payload as never,
        attachments: [] as never,
        request_identifier: requestMessageId,
        occurred_at: occurredAt,
        is_demo: false,
      },
      { onConflict: "id" },
    );
    await supabaseAdmin
      .from("conversations")
      .update({
        last_message_at: occurredAt,
        last_message_preview: preview,
        unread_count: 0,
        updated_at: occurredAt,
      })
      .eq("id", input.conversationId);

    return {
      ok: true,
      messageId: result.messageId,
      duplicate: result.duplicate,
      debug: { ...baseDebug, httpStatus: 200, durationMs: Date.now() - startedAt },
    };
  } catch (error) {
    const durationMs = Date.now() - startedAt;
    if (isMspApiError(error)) {
      await supabaseAdmin
        .from("outbound_log")
        .update({
          status: "rejected",
          error_code: error.code ?? String(error.status),
          reasons: (error.reasons ?? null) as never,
        })
        .eq("request_message_id", requestMessageId);
      console.error("[send-raw] rejected", {
        requestMessageId,
        status: error.status,
        code: error.code,
        message: error.message,
        reasons: error.reasons,
      });
      return {
        ok: false,
        status: error.status,
        ...(error.code ? { code: error.code } : {}),
        message: error.message,
        ...(error.reasons ? { reasons: error.reasons } : {}),
        debug: {
          ...baseDebug,
          httpStatus: error.status,
          ...(error.code ? { errorCode: error.code } : {}),
          ...(error.reasons ? { reasons: error.reasons } : {}),
          durationMs,
        },
      };
    }
    await supabaseAdmin
      .from("outbound_log")
      .update({ status: "failed", error_code: "transport_error" })
      .eq("request_message_id", requestMessageId);
    const message = error instanceof Error ? error.message : "Transport error";
    console.error("[send-raw] transport error", { requestMessageId, message });
    // Returned rather than thrown so the studio can show the failure detail.
    return {
      ok: false,
      status: 0,
      code: "transport_error",
      message,
      debug: { ...baseDebug, errorCode: "transport_error", durationMs },
    };
  }
}

// --- Template authoring (admin API) -----------------------------------------

export type TemplateAdminView = TemplateView & {
  definition: Json;
  slotBindings: { slotName: string; assetId: string }[];
};

function toAdminView(detail: RichTemplateDetail): TemplateAdminView {
  const base = {
    id: detail.id,
    name: detail.name,
    mode: detail.mode,
    status: detail.status,
    nativeChannel: detail.nativeChannel,
    variables:
      detail.definition.mode === "canonical"
        ? detail.definition.variables.map((variable) => ({
            name: variable.name,
            type: variable.type,
            required: variable.required,
          }))
        : [],
    readiness: detail.readiness.map((entry) => ({
      channel: entry.channel,
      status: entry.status,
      resolvedNativeType: entry.resolvedNativeType,
      reasons: entry.reasons,
    })),
  };
  const bindings = (detail as { slotBindings?: { slotName: string; assetId: string }[] })
    .slotBindings;
  return {
    ...base,
    definition: detail.definition as unknown as Json,
    slotBindings: bindings ?? [],
  };
}

export async function listAllTemplateDetails(): Promise<TemplateAdminView[]> {
  const client = requireMspClient();
  const page = await client.admin.templates.list({ count: 50 });
  const details = await Promise.all(
    page.templates.map((summary) => client.admin.templates.get(summary.id)),
  );
  return details.map(toAdminView);
}

export async function getTemplateDetailById(templateId: string): Promise<TemplateAdminView> {
  const client = requireMspClient();
  return toAdminView(await client.admin.templates.get(templateId));
}

export type TemplateWriteInput = {
  name: string;
  definition: Json;
  slotBindings?: { slotName: string; assetId: string }[];
};

export async function createTemplateDraft(
  input: TemplateWriteInput,
): Promise<TemplateAdminView> {
  const client = requireMspClient();
  const detail = await client.admin.templates.create({
    name: input.name,
    definition: input.definition as never,
    slotBindings: input.slotBindings ?? [],
  });
  return toAdminView(detail);
}

export async function updateTemplateDraft(
  templateId: string,
  input: TemplateWriteInput,
): Promise<TemplateAdminView> {
  const client = requireMspClient();
  const detail = await client.admin.templates.update(templateId, {
    name: input.name,
    definition: input.definition as never,
    slotBindings: input.slotBindings ?? [],
  });
  return toAdminView(detail);
}

export async function publishTemplateDraft(templateId: string): Promise<TemplateAdminView> {
  const client = requireMspClient();
  return toAdminView(await client.admin.templates.publish(templateId));
}

export async function archiveTemplateDraft(templateId: string): Promise<TemplateAdminView> {
  const client = requireMspClient();
  return toAdminView(await client.admin.templates.archive(templateId));
}

export async function deleteTemplateDraft(templateId: string): Promise<void> {
  const client = requireMspClient();
  await client.admin.templates.delete(templateId);
}

export type AssetView = { id: string; displayName: string; channel: string; usage: string };

export async function listTemplateAssets(): Promise<AssetView[]> {
  const client = requireMspClient();
  const page = await client.admin.templates.listAssets({ count: 100 });
  const items = (page as { assets?: unknown[]; items?: unknown[] }).assets ??
    (page as { items?: unknown[] }).items ??
    [];
  return (items as { id: string; displayName: string; channel: string; usage: string }[]).map(
    (asset) => ({
      id: asset.id,
      displayName: asset.displayName,
      channel: asset.channel,
      usage: asset.usage,
    }),
  );
}

// --- Invitations / business-initiated conversations ---------------------------

export type InitiationRow = {
  id: string;
  channel: string;
  purpose: string;
  phoneMasked: string | null;
  firstName: string | null;
  lastName: string | null;
  targetAgentStatus: string | null;
  status: string;
  reasonCode: string | null;
  callerReference: string | null;
  conversationId: string | null;
  isDemo: boolean;
  createdAt: string;
  updatedAt: string;
};

export type InitiationDebug = {
  initiationId?: string;
  channel: string;
  endpoint: string;
  idempotencyKey?: string;
  phoneMasked: string | null;
  httpStatus?: number;
  errorCode?: string;
  status?: string;
  reasonCode?: string | null;
  durationMs?: number;
  problems?: string[];
  at: string;
};

export type InitiationResult =
  | { ok: true; initiation: InitiationRow; debug: InitiationDebug }
  | { ok: false; status: number; code?: string; message: string; debug: InitiationDebug };

/** Only the last four digits are ever persisted. */
function maskPhone(phoneNumber: string): string {
  return `•••• ${phoneNumber.slice(-4)}`;
}

export function isE164(phoneNumber: string): boolean {
  return /^\+[1-9]\d{7,14}$/.test(phoneNumber.trim());
}

type InitiationApiShape = {
  id: string;
  channel: string;
  purpose: string;
  status: string;
  reasonCode: string | null;
  callerReference: string | null;
  conversationId: string | null;
  targetAgentStatus: string | null;
  targetFirstName: string | null;
  targetLastName: string | null;
  createdAt: string;
  updatedAt: string;
};

function rowFromInitiation(initiation: InitiationApiShape, phoneMasked: string | null) {
  return {
    id: initiation.id,
    channel: initiation.channel,
    purpose: initiation.purpose,
    phone_masked: phoneMasked,
    target_first_name: initiation.targetFirstName,
    target_last_name: initiation.targetLastName,
    target_agent_status: initiation.targetAgentStatus,
    status: initiation.status,
    reason_code: initiation.reasonCode,
    caller_reference: initiation.callerReference,
    conversation_id: initiation.conversationId,
    is_demo: false,
    created_at: initiation.createdAt,
    updated_at: initiation.updatedAt,
  };
}

function toInitiationRow(row: {
  id: string;
  channel: string;
  purpose: string;
  phone_masked: string | null;
  target_first_name: string | null;
  target_last_name: string | null;
  target_agent_status: string | null;
  status: string;
  reason_code: string | null;
  caller_reference: string | null;
  conversation_id: string | null;
  is_demo: boolean;
  created_at: string;
  updated_at: string;
}): InitiationRow {
  return {
    id: row.id,
    channel: row.channel,
    purpose: row.purpose,
    phoneMasked: row.phone_masked,
    firstName: row.target_first_name,
    lastName: row.target_last_name,
    targetAgentStatus: row.target_agent_status,
    status: row.status,
    reasonCode: row.reason_code,
    callerReference: row.caller_reference,
    conversationId: row.conversation_id,
    isDemo: row.is_demo,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

/** Read the stored invitation list — Realtime keeps the UI current after this. */
export async function listStoredInitiations(limit = 50): Promise<InitiationRow[]> {
  const { data, error } = await supabaseAdmin
    .from("initiations")
    .select("*")
    .order("created_at", { ascending: false })
    .limit(limit);
  if (error) throw error;
  return (data ?? []).map(toInitiationRow);
}

/** Invite a customer to start a conversation, by phone number. */
export async function createInitiation(input: {
  phoneNumber: string;
  channel?: "amb" | "tiktok";
  firstName?: string;
  lastName?: string;
  targetAgentStatus?: "bot" | "live";
}): Promise<InitiationResult> {
  const startedAt = Date.now();
  const phoneNumber = input.phoneNumber.trim();
  const channel = input.channel ?? "amb";
  const phoneMasked = phoneNumber.length >= 4 ? maskPhone(phoneNumber) : null;
  const baseDebug: InitiationDebug = {
    channel,
    endpoint: "POST /conversations/initiations",
    phoneMasked,
    at: new Date().toISOString(),
  };

  if (!isE164(phoneNumber)) {
    return {
      ok: false,
      status: 0,
      code: "invalid_recipient",
      message: "Enter the number in E.164 form, e.g. +13035551234.",
      debug: {
        ...baseDebug,
        errorCode: "invalid_recipient",
        problems: ["phoneNumber must match +<country><number>, digits only"],
      },
    };
  }

  if (!getApiKey()) {
    return {
      ok: false,
      status: 0,
      code: "not_configured",
      message: "MSP_API_KEY is not configured — add it on Setup first.",
      debug: { ...baseDebug, errorCode: "not_configured" },
    };
  }

  const client = requireMspClient();
  const idempotencyKey = uuidv7();
  baseDebug.idempotencyKey = idempotencyKey;

  try {
    const initiation = (await client.initiations.create({
      channel,
      phoneNumber,
      purpose: "connect",
      idempotencyKey,
      ...(input.firstName ? { targetFirstName: input.firstName } : {}),
      ...(input.lastName ? { targetLastName: input.lastName } : {}),
      ...(input.targetAgentStatus ? { targetAgentStatus: input.targetAgentStatus } : {}),
    })) as unknown as InitiationApiShape;

    const row = rowFromInitiation(initiation, phoneMasked);
    await supabaseAdmin.from("initiations").upsert(row, { onConflict: "id" });

    return {
      ok: true,
      initiation: toInitiationRow(row),
      debug: {
        ...baseDebug,
        initiationId: initiation.id,
        httpStatus: 200,
        status: initiation.status,
        reasonCode: initiation.reasonCode,
        durationMs: Date.now() - startedAt,
      },
    };
  } catch (error) {
    const durationMs = Date.now() - startedAt;
    if (isMspApiError(error)) {
      console.error("[initiation] rejected", {
        status: error.status,
        code: error.code,
        message: error.message,
      });
      return {
        ok: false,
        status: error.status,
        ...(error.code ? { code: error.code } : {}),
        message: error.message,
        debug: {
          ...baseDebug,
          httpStatus: error.status,
          ...(error.code ? { errorCode: error.code } : {}),
          durationMs,
        },
      };
    }
    const message = error instanceof Error ? error.message : "Transport error";
    console.error("[initiation] transport error", { message });
    return {
      ok: false,
      status: 0,
      code: "transport_error",
      message,
      debug: { ...baseDebug, errorCode: "transport_error", durationMs },
    };
  }
}

/** Pull existing invitations from the API into the local table. */
export async function backfillInitiations(max = 100): Promise<number> {
  const client = requireMspClient();
  const rows: ReturnType<typeof rowFromInitiation>[] = [];
  for await (const initiation of client.initiations.list({ count: 50 })) {
    rows.push(rowFromInitiation(initiation as unknown as InitiationApiShape, null));
    if (rows.length >= max) break;
  }
  if (rows.length > 0) {
    await supabaseAdmin.from("initiations").upsert(rows, { onConflict: "id" });
    await supabaseAdmin.from("initiations").delete().eq("is_demo", true);
  }
  return rows.length;
}


/* ------------------------------------------------------------------ media */

export type UploadResult =
  | { ok: true; attachment: StoredAttachment }
  | { ok: false; status: number; code?: string; message: string };

/** Stream bytes to 1440 and return the media asset id to send with. */
export async function uploadAttachment(params: {
  bytes: Uint8Array;
  filename: string;
  contentType?: string;
  targetChannel?: "amb" | "tiktok";
}): Promise<UploadResult> {
  let client: MspClient;
  try {
    client = requireMspClient();
  } catch (error) {
    return {
      ok: false,
      status: 503,
      code: "not_configured",
      message: error instanceof Error ? error.message : "MSP_API_KEY is not configured",
    };
  }

  try {
    const result = await client.media.upload({
      body: params.bytes,
      filename: params.filename,
      contentLength: params.bytes.byteLength,
      ...(params.contentType ? { contentType: params.contentType } : {}),
      ...(params.targetChannel ? { targetChannel: params.targetChannel } : {}),
    });
    return {
      ok: true,
      attachment: {
        id: result.mediaAssetId,
        fileName: params.filename,
        mimeType: params.contentType ?? null,
        sizeBytes: params.bytes.byteLength,
      },
    };
  } catch (error) {
    if (isMspApiError(error)) {
      console.error("[msp-upload] api error", {
        status: error.status,
        code: error.code,
        message: error.message,
        filename: params.filename,
      });
      return {
        ok: false,
        status: error.status,
        ...(error.code ? { code: error.code } : {}),
        message: error.message,
      };
    }
    console.error("[msp-upload] transport error", error);
    return {
      ok: false,
      status: 502,
      code: "transport_error",
      message: error instanceof Error ? error.message : "Upload failed",
    };
  }
}

export const OUTBOUND_ATTACHMENT_BUCKET = "outbound-attachments";

/**
 * Media assets we upload are addressed by `mediaAssetId`, which 1440's
 * access-url endpoint does not resolve (it only serves inbound message
 * attachments). Keep a private copy so outbound images still render.
 */
export async function cacheOutboundAttachment(params: {
  mediaAssetId: string;
  bytes: Uint8Array;
  contentType?: string;
}): Promise<void> {
  try {
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    await supabaseAdmin.storage
      .from(OUTBOUND_ATTACHMENT_BUCKET)
      .upload(params.mediaAssetId, params.bytes, {
        contentType: params.contentType ?? "application/octet-stream",
        upsert: true,
      });
  } catch (error) {
    console.error("[msp-upload] cache failed", error);
  }
}

/**
 * Serve bytes for an attachment: our own cached copy first (outbound sends),
 * then a freshly minted 1440 signed URL (inbound). Signed URLs never leave
 * this process.
 */
export async function proxyAttachment(attachmentId: string): Promise<Response> {
  try {
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { data } = await supabaseAdmin.storage
      .from(OUTBOUND_ATTACHMENT_BUCKET)
      .download(attachmentId);
    if (data) {
      return new Response(await data.arrayBuffer(), {
        status: 200,
        headers: {
          "Content-Type": data.type || "application/octet-stream",
          "Content-Disposition": "inline",
          "Cache-Control": "private, max-age=300",
        },
      });
    }
  } catch {
    // fall through to 1440
  }

  let client: MspClient;
  try {
    client = requireMspClient();
  } catch {
    return new Response("MSP_API_KEY is not configured", { status: 503 });
  }


  try {
    const access = await client.media.getAccessUrl(attachmentId);
    const upstream = await fetch(access.url);
    if (!upstream.ok || !upstream.body) {
      return new Response("Attachment unavailable", { status: 502 });
    }
    const headers = new Headers();
    headers.set("Content-Type", upstream.headers.get("content-type") ?? "application/octet-stream");
    const length = upstream.headers.get("content-length");
    if (length) headers.set("Content-Length", length);
    headers.set("Content-Disposition", "inline");
    headers.set("Cache-Control", "private, max-age=300");
    return new Response(upstream.body, { status: 200, headers });
  } catch (error) {
    if (isMspApiError(error)) {
      console.error("[msp-media] api error", {
        attachmentId,
        status: error.status,
        code: error.code,
      });
      return new Response(error.message, { status: error.status });
    }
    console.error("[msp-media] transport error", error);
    return new Response("Attachment unavailable", { status: 502 });
  }
}
