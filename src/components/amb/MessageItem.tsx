import { clockTime, type MessageRow, type OutboundLogRow } from "@/lib/amb";
import { AttachmentGallery } from "@/components/amb/AttachmentGallery";
import { TemplatePreview } from "@/components/amb/TemplatePreview";
import type { TemplateAdminView } from "@/lib/msp.server";
import { inferTemplateShape, templateKindLabel, templateModeLabel } from "@/lib/template-definitions";
import { fieldsFromDefinition } from "@/lib/template-fields";
import {
  RESPONSE_LABEL,
  formEntries,
  formatBookedTime,
  type MessageAttachment as Attachment,
  type MessageContent as Content,
  type RichLinkData,
} from "@/lib/message-preview";

function RichLinkCard({ link, outbound }: { link: RichLinkData; outbound: boolean }) {
  const image = link.assets?.image?.url ?? null;
  let host = "";
  try {
    host = link.url ? new URL(link.url).hostname : "";
  } catch {
    host = "";
  }
  return (
    <a
      href={link.url ?? "#"}
      target="_blank"
      rel="noreferrer"
      className={`block overflow-hidden rounded-lg border border-border ${
        outbound
          ? "bg-bubble-outbound text-bubble-outbound-foreground"
          : "bg-bubble-inbound text-bubble-inbound-foreground"
      }`}
    >
      {image ? (
        <img
          src={image}
          alt={link.title ?? "Link preview"}
          loading="lazy"
          className="h-36 w-full object-cover"
        />
      ) : null}
      <div className="px-3 py-2">
        <p className="text-sm font-medium leading-snug">{link.title ?? link.url}</p>
        {host ? <p className="mt-0.5 text-[11px] opacity-70">{host}</p> : null}
      </div>
    </a>
  );
}



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
        <p className="mt-1 text-sm text-foreground">{formatBookedTime(content)}</p>
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
  const richLink = content.richLinkData?.url ? content.richLinkData : null;

  return (
    <div className={`flex flex-col ${outbound ? "items-end" : "items-start"}`}>
      <div className="max-w-[min(34rem,80%)]">
        {richLink ? (
          <RichLinkCard link={richLink} outbound={outbound} />
        ) : isInteractive ? (
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
            <AttachmentGallery attachments={attachments} />
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
