import { clockTime, formatBytes, type MessageRow, type OutboundLogRow } from "@/lib/amb";
import {
  RESPONSE_LABEL,
  formEntries,
  formatBookedTime,
  type MessageAttachment as Attachment,
  type MessageContent as Content,
} from "@/lib/message-preview";


function AttachmentList({ attachments }: { attachments: Attachment[] }) {
  if (attachments.length === 0) return null;
  return (
    <div className="mt-2 flex flex-wrap gap-2">
      {attachments.map((attachment, index) => {
        const name = attachment.originalFileName ?? attachment.fileName ?? "Attachment";
        const size = formatBytes(attachment.byteSize ?? attachment.size ?? null);
        const isImage = (attachment.mimeType ?? "").startsWith("image/");
        return (
          <div
            key={attachment.id ?? index}
            className="flex items-center gap-2 rounded-md border border-border bg-card p-2"
          >
            {isImage && attachment.accessUrl ? (
              <img
                src={attachment.accessUrl}
                alt={name}
                loading="lazy"
                className="h-12 w-12 rounded object-cover"
              />
            ) : (
              <div className="flex h-12 w-12 items-center justify-center rounded bg-muted text-[10px] uppercase text-muted-foreground">
                {(attachment.mimeType ?? "file").split("/")[1]?.slice(0, 4) ?? "file"}
              </div>
            )}
            <div className="min-w-0">
              <p className="truncate text-xs font-medium text-foreground">{name}</p>
              {size ? <p className="text-[11px] text-muted-foreground">{size}</p> : null}
            </div>
          </div>
        );
      })}
    </div>
  );
}

/** "contactEmail" / "contact_email" → "Contact email". */
function fieldLabel(raw: string): string {
  const spaced = raw
    .replace(/[_-]+/g, " ")
    .replace(/([a-z\d])([A-Z])/g, "$1 $2")
    .trim();
  if (!spaced) return raw;
  return spaced.charAt(0).toUpperCase() + spaced.slice(1).toLowerCase();
}

function formatValue(value: unknown): string {
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
function formEntries(content: Content): { label: string; value: string }[] {
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

const RESPONSE_LABEL: Record<string, string> = {
  quick_reply: "Quick reply",
  list_picker: "List picker selection",
  time_picker: "Booked a time",
  form: "Form response",
  invitation_accept: "Accepted invitation",
  other: "Reply",
};

function InteractiveCard({ content }: { content: Content }) {
  const titles = (content.selections ?? []).map((s) => s.title).filter(Boolean) as string[];
  const ids = (content.selections ?? []).map((s) => s.id).filter(Boolean) as string[];
  const rows = formEntries(content);
  const heading =
    RESPONSE_LABEL[content.responseType ?? ""] ??
    (content.selectedStartTime ? "Booked a time" : rows.length > 0 ? "Form response" : "Reply");

  return (
    <div className="rounded-md border border-border bg-card px-3 py-2">
      <div className="flex items-center gap-2">
        <p className="text-[11px] uppercase tracking-wide text-muted-foreground">{heading}</p>
        {content.private ? (
          <span className="rounded-sm bg-muted px-1 text-[10px] uppercase tracking-wide text-muted-foreground">
            Private
          </span>
        ) : null}
      </div>

      {content.selectedStartTime ? (
        <p className="mt-1 text-sm text-foreground">
          {parseAppleTimestamp(content.selectedStartTime)?.toLocaleString() ??
            content.selectedStartTime}
        </p>
      ) : null}

      {rows.length > 0 ? (
        <dl className="mt-1.5 space-y-1">
          {rows.map((row, index) => (
            <div key={`${row.label}-${index}`} className="grid grid-cols-[9rem_1fr] gap-2 text-sm">
              <dt className="truncate text-muted-foreground" title={row.label}>
                {row.label}
              </dt>
              <dd className="whitespace-pre-wrap break-words text-foreground">{row.value}</dd>
            </div>
          ))}
        </dl>
      ) : null}

      {rows.length === 0 && !content.selectedStartTime ? (
        <p className="mt-1 text-sm text-foreground">
          {titles.length > 0
            ? `Chose: ${titles.join(", ")}`
            : ids.length > 0
              ? `Chose: ${ids.join(", ")}`
              : content.responseType === "invitation_accept"
                ? "Customer accepted the invitation and opened the conversation."
                : "—"}
        </p>
      ) : null}

      {content.requestIdentifier ? (
        <p className="mt-1.5 text-[11px] text-muted-foreground">
          Responds to {content.requestIdentifier}
        </p>
      ) : null}
    </div>
  );
}

function DeliveryState({ log }: { log?: OutboundLogRow }) {
  if (!log) return null;
  const reasons = Array.isArray(log.reasons)
    ? (log.reasons as { code?: string; message?: string }[])
    : [];
  const rejected = log.status === "rejected" || log.status === "failed";
  return (
    <div className="mt-1 text-right text-[11px] text-muted-foreground">
      <span className={rejected ? "text-destructive" : undefined}>
        {log.status === "sent"
          ? "Sent"
          : log.status === "duplicate"
            ? "Sent (deduplicated)"
            : log.status === "pending"
              ? "Sending…"
              : `Rejected${log.error_code ? ` · ${log.error_code}` : ""}`}
      </span>
      {rejected && reasons.length > 0 ? (
        <ul className="mt-0.5 space-y-0.5 text-destructive">
          {reasons.map((reason, index) => (
            <li key={index}>{reason.message ?? reason.code}</li>
          ))}
        </ul>
      ) : null}
    </div>
  );
}

export function MessageItem({ message, log }: { message: MessageRow; log?: OutboundLogRow }) {
  const content = (message.content ?? {}) as Content;
  const attachments = (Array.isArray(message.attachments) ? message.attachments : []) as Attachment[];
  const outbound = message.direction === "outbound";

  if (message.message_type === "opt_out") {
    return (
      <div className="my-3 rounded-md border border-destructive/40 bg-destructive/10 px-3 py-2 text-center text-xs text-destructive">
        Customer opted out of messaging{content.reason ? ` — ${content.reason}` : ""}
      </div>
    );
  }

  const isInteractive = message.message_type === "interactive";

  return (
    <div className={`flex flex-col ${outbound ? "items-end" : "items-start"}`}>
      <div className="max-w-[min(34rem,80%)]">
        {isInteractive ? (
          <InteractiveCard content={content} />
        ) : (
          <div
            className={`rounded-lg px-3 py-2 text-sm leading-relaxed ${
              outbound
                ? "bg-bubble-outbound text-bubble-outbound-foreground"
                : "bg-bubble-inbound text-bubble-inbound-foreground"
            }`}
          >
            {content.body ? (
              <p className="whitespace-pre-wrap">{content.body}</p>
            ) : content.templateId ? (
              <p className="text-muted-foreground">Rich template · {content.templateId}</p>
            ) : (
              <p className="text-muted-foreground">{message.message_type.replace(/_/g, " ")}</p>
            )}
            <AttachmentList attachments={attachments} />
          </div>
        )}
        <p
          className={`mt-1 text-[11px] text-muted-foreground ${outbound ? "text-right" : "text-left"}`}
        >
          {clockTime(message.occurred_at)}
        </p>
        {outbound ? <DeliveryState {...(log ? { log } : {})} /> : null}
      </div>
    </div>
  );
}
