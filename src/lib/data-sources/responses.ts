// Turns a customer's inbound replies (forms, pickers, quick replies, text) into
// named fields that template variables can be mapped back onto.
import { parseAppleTimestamp } from "@1440io/msp-webhooks";
import {
  fieldLabel,
  formatValue,
  type MessageContent,
} from "@/lib/message-preview";

export type ReplyField = {
  /** Stable field name used by mappings, e.g. "contactEmail" or "bookedTime". */
  key: string;
  label: string;
  /** Plain text rendering, shown in the UI. */
  text: string;
  /** Typed value: string, Apple datetime string, or a list of selections. */
  value: unknown;
  occurredAt: string;
  messageId: string;
};

type InboundMessage = {
  id: string;
  direction: string;
  message_type: string;
  content: unknown;
  occurred_at: string;
};

/** "contact_email" / "Contact Email" → "contactemail" for loose matching. */
export function normalizeKey(raw: string): string {
  return raw.replace(/[^a-z0-9]+/gi, "").toLowerCase();
}

function pushField(
  out: ReplyField[],
  message: InboundMessage,
  key: string,
  value: unknown,
  label?: string,
) {
  const trimmedKey = key.trim();
  if (!trimmedKey) return;
  const text = formatValue(value);
  if (text === "—" || text.trim().length === 0) return;
  out.push({
    key: trimmedKey,
    label: label ?? fieldLabel(trimmedKey),
    text,
    value,
    occurredAt: message.occurred_at,
    messageId: message.id,
  });
}

function fieldsFromMessage(message: InboundMessage): ReplyField[] {
  const content = (message.content ?? {}) as MessageContent;
  const out: ReplyField[] = [];

  // Form submissions: one field per key across every submitted page.
  for (const page of content.pages ?? []) {
    for (const [key, value] of Object.entries(page.values ?? {})) {
      pushField(out, message, key, value);
    }
  }
  const raw = content.formValues;
  if (Array.isArray(raw)) {
    for (const page of raw) {
      const values = page?.values;
      if (values && typeof values === "object" && !Array.isArray(values)) {
        for (const [key, value] of Object.entries(values as Record<string, unknown>)) {
          pushField(out, message, key, value);
        }
      } else if (values !== undefined) {
        pushField(out, message, page?.pageId ?? "formResponse", values);
      }
    }
  } else if (raw && typeof raw === "object") {
    for (const [key, value] of Object.entries(raw)) {
      pushField(out, message, key, value);
    }
  }

  // Picker / quick reply selections.
  const selections = content.selections ?? [];
  if (selections.length > 0) {
    const items = selections.map((selection, index) => ({
      id: selection.id ?? `selection-${index + 1}`,
      title: selection.title ?? selection.id ?? "",
    }));
    const titles = items.map((item) => item.title).filter(Boolean);
    pushField(out, message, "selection", titles.length === 1 ? titles[0] : titles, "Selection");
    pushField(out, message, "selections", items, "Selections (list)");
  }

  // Time picker booking.
  if (content.selectedStartTime) {
    pushField(out, message, "bookedTime", content.selectedStartTime, "Booked time");
    const parsed = parseAppleTimestamp(content.selectedStartTime);
    if (parsed) {
      pushField(out, message, "bookedTimeText", parsed.toLocaleString(), "Booked time (text)");
    }
  }
  if (content.selectedEndTime) {
    pushField(out, message, "bookedEndTime", content.selectedEndTime, "Booked end time");
  }

  // Plain text and invitation acceptance.
  if (content.body) {
    pushField(out, message, "lastMessage", content.body, "Last customer message");
  }
  if (content.responseType === "invitation_accept") {
    pushField(out, message, "invitationAccepted", "Yes", "Accepted invitation");
  }

  return out;
}

/**
 * Extract reply fields from a conversation's messages, newest value winning
 * per field. Pass messages in any order; only inbound ones are considered.
 */
export function extractReplyFields(messages: InboundMessage[]): ReplyField[] {
  const inbound = messages
    .filter((message) => message.direction === "inbound")
    .slice()
    .sort((a, b) => Date.parse(a.occurred_at) - Date.parse(b.occurred_at));

  const byKey = new Map<string, ReplyField>();
  for (const message of inbound) {
    for (const field of fieldsFromMessage(message)) {
      byKey.set(normalizeKey(field.key), field);
    }
  }
  return [...byKey.values()].sort((a, b) => Date.parse(b.occurredAt) - Date.parse(a.occurredAt));
}

/** Find the reply field matching a name loosely (case/underscore-insensitive). */
export function findReplyField(fields: ReplyField[], name: string): ReplyField | undefined {
  const target = normalizeKey(name);
  return fields.find((field) => normalizeKey(field.key) === target);
}
