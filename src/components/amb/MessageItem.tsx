import { parseAppleTimestamp } from "@1440io/msp-webhooks";
import { clockTime, formatBytes, type MessageRow, type OutboundLogRow } from "@/lib/amb";

type Selection = { id?: string; title?: string | null };
/** Apple/1440 send one entry per submitted form page: `{ pageId, values[] }`. */
type FormPageValue = { pageId?: string; values?: unknown };
type Content = {
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
};
type Attachment = {
  id?: string;
  accessUrl?: string | null;
  mimeType?: string | null;
  originalFileName?: string | null;
  fileName?: string | null;
  byteSize?: number | null;
  size?: number | null;
};

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

function InteractiveCard({ content }: { content: Content }) {
  const titles = (content.selections ?? []).map((s) => s.title).filter(Boolean) as string[];
  const ids = (content.selections ?? []).map((s) => s.id).filter(Boolean) as string[];
  const formPages = content.pages ?? [];

  if (content.selectedStartTime) {
    const start = parseAppleTimestamp(content.selectedStartTime);
    return (
      <div className="rounded-md border border-border bg-card px-3 py-2">
        <p className="text-[11px] uppercase tracking-wide text-muted-foreground">Booked a time</p>
        <p className="mt-1 text-sm text-foreground">
          {start ? start.toLocaleString() : content.selectedStartTime}
        </p>
      </div>
    );
  }

  if (formPages.length > 0 || content.formValues) {
    const entries: [string, unknown][] =
      formPages.length > 0
        ? formPages.flatMap((page) => Object.entries(page.values ?? {}))
        : Object.entries(content.formValues ?? {});
    return (
      <div className="rounded-md border border-border bg-card px-3 py-2">
        <p className="text-[11px] uppercase tracking-wide text-muted-foreground">Form response</p>
        <dl className="mt-1 space-y-0.5">
          {entries.map(([key, value]) => (
            <div key={key} className="flex gap-2 text-sm">
              <dt className="text-muted-foreground">{key}</dt>
              <dd className="text-foreground">{String(value)}</dd>
            </div>
          ))}
        </dl>
      </div>
    );
  }

  return (
    <div className="rounded-md border border-border bg-card px-3 py-2">
      <p className="text-[11px] uppercase tracking-wide text-muted-foreground">Reply</p>
      <p className="mt-1 text-sm text-foreground">
        Chose: {titles.length > 0 ? titles.join(", ") : ids.join(", ") || "—"}
      </p>
      {content.requestIdentifier ? (
        <p className="mt-1 text-[11px] text-muted-foreground">
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
