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

export type SetupStatus = {
  hasApiKey: boolean;
  hasWebhookSecret: boolean;
  webhookUrl: string;
  demoData: boolean;
};

export async function readSetupStatus(origin: string): Promise<SetupStatus> {
  const { count } = await supabaseAdmin
    .from("conversations")
    .select("id", { count: "exact", head: true })
    .eq("is_demo", false);

  return {
    hasApiKey: Boolean(getApiKey()),
    hasWebhookSecret: Boolean(getWebhookSecret()),
    webhookUrl: `${origin.replace(/\/$/, "")}/api/public/msp-webhook`,
    demoData: (count ?? 0) === 0,
  };
}

function previewOf(message: WebhookMessageSummary | ConversationMessage): string {
  if ("senderType" in message) {
    if (message.textBody) return message.textBody.slice(0, 160);
    if (message.attachments.length > 0)
      return message.attachments[0]?.originalFileName ?? "Attachment";
    return message.messageType.replace(/_/g, " ");
  }
  if (isTextMessage(message)) return message.content.body.slice(0, 160);
  if (isOptOutMessage(message)) return "Customer opted out of messaging";
  if (isInteractiveMessage(message)) {
    const titles = message.content.selections.map((s) => s.title).filter(Boolean);
    return titles.length > 0 ? `Chose: ${titles.join(", ")}` : "Submitted a form";
  }
  if (message.attachments.length > 0) return message.attachments[0]?.fileName ?? "Attachment";
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
      attachments: message.attachments as never,
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


export async function recordInitiationUpdate(payload: unknown): Promise<void> {
  const initiation = payload as {
    data?: { initiation?: { conversationId?: string | null; status?: string } };
  };
  const conversationId = initiation.data?.initiation?.conversationId;
  const status = initiation.data?.initiation?.status;
  if (!conversationId || !status) return;
  await supabaseAdmin
    .from("conversations")
    .update({ agent_status: status === "accepted" ? "live" : "bot" })
    .eq("id", conversationId);
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
      attachments: message.attachments as never,
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
  templateId?: string;
  variables?: Record<string, unknown>;
};

export async function sendOutbound(input: SendInput): Promise<SendResult> {
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
          ...(input.attachmentIds?.length ? { attachmentIds: input.attachmentIds } : {}),
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
        attachments: (input.attachmentIds ?? []).map((id) => ({ id })) as never,
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
        last_message_preview: input.body ?? "Rich message",
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
    };
  }

  const requestMessageId = uuidv7();
  await supabaseAdmin.from("outbound_log").insert({
    request_message_id: requestMessageId,
    conversation_id: input.conversationId,
    kind: "raw",
    status: "pending",
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
