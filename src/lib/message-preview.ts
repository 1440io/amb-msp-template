// Shared formatting for interactive message responses.
// Used by both the thread view (MessageItem) and the inbox list preview so
// they never diverge.
import { parseAppleTimestamp } from "@1440io/msp-webhooks";
import type { MessageRow } from "@/lib/amb";

export type Selection = { id?: string; title?: string | null };
/** Apple/1440 send one entry per submitted form page: `{ pageId, values }`. */
export type FormPageValue = { pageId?: string; values?: unknown };
export type RichLinkData = {
  url?: string;
  title?: string | null;
  assets?: { image?: { url?: string | null; mimeType?: string | null } | null } | null;
};
export type MessageContent = {
  body?: string;
  reason?: string;
  responseType?: string;
  selections?: Selection[];
  selectedStartTime?: string | null;
  selectedEndTime?: string | null;
  pages?: { title?: string; values?: Record<string, unknown> }[];
  formValues?: FormPageValue[] | Record<string, unknown>;
  private?: boolean;
  templateId?: string;
  variables?: Record<string, unknown>;
  sessionIdentifier?: string | null;
  requestIdentifier?: string | null;
  richLinkData?: RichLinkData | null;
};

export type MessageAttachment = {
  id?: string;
  accessUrl?: string | null;
  url?: string | null;
  mimeType?: string | null;
  originalFileName?: string | null;
  fileName?: string | null;
  byteSize?: number | null;
  sizeBytes?: number | null;
  size?: number | null;
};

/** "Photo" / "2 photos" / "receipt.pdf" — used in previews. */
export function attachmentSummary(attachments: MessageAttachment[]): string {
  if (attachments.length === 0) return "";
  const images = attachments.filter((attachment) => {
    const mime = attachment.mimeType ?? "";
    const name = attachment.originalFileName ?? attachment.fileName ?? "";
    return mime.startsWith("image/") || /\.(png|jpe?g|gif|webp|heic|bmp)$/i.test(name);
  });
  if (images.length === attachments.length) {
    return attachments.length === 1 ? "Photo" : `${attachments.length} photos`;
  }
  const name = attachments[0]?.originalFileName ?? attachments[0]?.fileName;
  if (attachments.length === 1) return name ?? "Attachment";
  return `${name ?? "Attachment"} +${attachments.length - 1}`;
}

/** "contactEmail" / "contact_email" → "Contact email". */
export function fieldLabel(raw: string): string {
  const spaced = raw
    .replace(/[_-]+/g, " ")
    .replace(/([a-z\d])([A-Z])/g, "$1 $2")
    .trim();
  if (!spaced) return raw;
  return spaced.charAt(0).toUpperCase() + spaced.slice(1).toLowerCase();
}

export function formatValue(value: unknown): string {
  if (value == null) return "—";
  if (Array.isArray(value)) {
    const parts = value.map(formatValue).filter((part) => part !== "—");
    return parts.length > 0 ? parts.join(", ") : "—";
  }
  if (typeof value === "object") {
    const record = value as Record<string, unknown>;
    // Apple echoes some fields as { title } / { value } wrappers.
    for (const key of ["title", "value", "label", "text"]) {
      if (typeof record[key] === "string") return record[key] as string;
    }
    return Object.entries(record)
      .map(([key, nested]) => `${fieldLabel(key)}: ${formatValue(nested)}`)
      .join(", ");
  }
  if (typeof value === "boolean") return value ? "Yes" : "No";
  return String(value);
}

/** Flatten the wire shapes we may receive into label/value rows. */
export function formEntries(content: MessageContent): { label: string; value: string }[] {
  const rows: { label: string; value: string }[] = [];

  for (const page of content.pages ?? []) {
    for (const [key, value] of Object.entries(page.values ?? {})) {
      rows.push({
        label: page.title ? `${page.title} · ${fieldLabel(key)}` : fieldLabel(key),
        value: formatValue(value),
      });
    }
  }

  const raw = content.formValues;
  if (Array.isArray(raw)) {
    for (const page of raw) {
      rows.push({
        label: fieldLabel(page?.pageId ?? "Response"),
        value: formatValue(page?.values),
      });
    }
  } else if (raw && typeof raw === "object") {
    for (const [key, value] of Object.entries(raw)) {
      rows.push({ label: fieldLabel(key), value: formatValue(value) });
    }
  }

  return rows;
}

export const RESPONSE_LABEL: Record<string, string> = {
  quick_reply: "Quick reply",
  list_picker: "List picker selection",
  time_picker: "Booked a time",
  form: "Form response",
  invitation_accept: "Accepted invitation",
  other: "Reply",
};

export function formatBookedTime(content: MessageContent): string | null {
  if (!content.selectedStartTime) return null;
  const parsed = parseAppleTimestamp(content.selectedStartTime);
  return parsed ? parsed.toLocaleString() : content.selectedStartTime;
}

function truncate(text: string, max = 160): string {
  const clean = text.replace(/\s+/g, " ").trim();
  return clean.length > max ? `${clean.slice(0, max - 1)}…` : clean;
}

/** One-line summary of an interactive reply's actual content. */
export function summarizeInteractive(content: MessageContent): string {
  const titles = (content.selections ?? []).map((s) => s.title).filter(Boolean) as string[];
  const ids = (content.selections ?? []).map((s) => s.id).filter(Boolean) as string[];

  if (titles.length > 0) return `Chose: ${titles.join(", ")}`;

  const booked = formatBookedTime(content);
  if (booked) return `Booked ${booked}`;

  const rows = formEntries(content);
  if (rows.length > 0) {
    return rows.map((row) => `${row.label}: ${row.value}`).join(" · ");
  }

  if (ids.length > 0) return `Chose: ${ids.join(", ")}`;
  if (content.responseType === "invitation_accept") return "Accepted the invitation";
  if (content.body) return content.body;
  return RESPONSE_LABEL[content.responseType ?? ""] ?? "Reply";
}

/** Inbox list preview text for the most recent message of a conversation. */
export function previewForMessage(message: MessageRow): string {
  const content = (message.content ?? {}) as MessageContent;
  const attachments = (Array.isArray(message.attachments) ? message.attachments : []) as MessageAttachment[];
  const type = String(message.message_type ?? "");

  let text: string;
  if (type === "opt_out") {
    text = "Customer opted out of messaging";
  } else if (content.richLinkData?.url) {
    text = content.richLinkData.title
      ? `${content.richLinkData.title} — ${content.richLinkData.url}`
      : content.richLinkData.url;
  } else if (type === "text" && content.body) {
    text = content.body;
  } else if (

    type === "interactive" ||
    type === "quick_reply" ||
    type === "list_picker" ||
    type === "time_picker" ||
    type === "form" ||
    content.responseType ||
    content.selections ||
    content.formValues ||
    content.pages ||
    content.selectedStartTime
  ) {
    text = summarizeInteractive(content);
  } else if (content.body) {
    text = content.body;
  } else if (attachments.length > 0) {
    text = attachmentSummary(attachments);
  } else if (content.templateId) {
    text = `Rich message · ${content.templateId}`;
  } else {
    text = type.replace(/_/g, " ") || "Message";
  }

  if (attachments.length > 0) {
    const summary = attachmentSummary(attachments);
    if (summary && !text.includes(summary)) text = `${text} · ${summary}`;
  }

  return truncate(message.direction === "outbound" ? `You: ${text}` : text);
}
