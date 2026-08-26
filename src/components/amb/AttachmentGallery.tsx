import { useEffect, useState } from "react";
import { Download, FileText, ImageOff } from "lucide-react";
import { formatBytes } from "@/lib/amb";
import {
  attachmentName,
  attachmentSize,
  fetchAttachmentObjectUrl,
  isImageAttachment,
} from "@/lib/attachments";
import type { MessageAttachment } from "@/lib/message-preview";

/**
 * Bytes come through the app's own proxy, so the object URL below is the only
 * media URL the browser ever sees.
 */
function useAttachmentUrl(attachment: MessageAttachment, enabled: boolean) {
  const directUrl = attachment.accessUrl ?? attachment.url ?? null;
  const id = attachment.id ?? null;
  const [state, setState] = useState<{ url: string | null; failed: boolean }>({
    url: directUrl,
    failed: false,
  });

  useEffect(() => {
    if (!enabled || directUrl || !id) return;
    let objectUrl: string | null = null;
    let cancelled = false;

    fetchAttachmentObjectUrl(id)
      .then((url) => {
        objectUrl = url;
        if (cancelled) URL.revokeObjectURL(url);
        else setState({ url, failed: false });
      })
      .catch(() => {
        if (!cancelled) setState({ url: null, failed: true });
      });

    return () => {
      cancelled = true;
      if (objectUrl) URL.revokeObjectURL(objectUrl);
    };
  }, [enabled, directUrl, id]);

  return state;
}

function ImageAttachment({ attachment }: { attachment: MessageAttachment }) {
  const name = attachmentName(attachment);
  const { url, failed } = useAttachmentUrl(attachment, true);
  const [broken, setBroken] = useState(false);

  if (failed || broken) return <FileAttachment attachment={attachment} unavailable />;

  if (!url) {
    return (
      <div className="flex h-40 w-56 animate-pulse items-center justify-center rounded-md border border-border bg-muted/50">
        <ImageOff className="h-5 w-5 text-muted-foreground" />
      </div>
    );
  }

  return (
    <a href={url} target="_blank" rel="noreferrer" className="block">
      <img
        src={url}
        alt={name}
        loading="lazy"
        onError={() => setBroken(true)}
        className="max-h-72 max-w-full rounded-md border border-border object-cover"
      />
    </a>
  );
}

function FileAttachment({
  attachment,
  unavailable,
}: {
  attachment: MessageAttachment;
  unavailable?: boolean;
}) {
  const name = attachmentName(attachment);
  const size = formatBytes(attachmentSize(attachment));
  const [busy, setBusy] = useState(false);
  const directUrl = attachment.accessUrl ?? attachment.url ?? null;

  const download = async () => {
    if (!attachment.id) return;
    setBusy(true);
    try {
      const url = directUrl ?? (await fetchAttachmentObjectUrl(attachment.id));
      const link = document.createElement("a");
      link.href = url;
      link.download = name;
      link.rel = "noreferrer";
      link.click();
      if (!directUrl) setTimeout(() => URL.revokeObjectURL(url), 10_000);
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="flex items-center gap-2 rounded-md border border-border bg-card p-2">
      <div className="flex h-10 w-10 items-center justify-center rounded bg-muted text-muted-foreground">
        <FileText className="h-4 w-4" />
      </div>
      <div className="min-w-0 max-w-[12rem]">
        <p className="truncate text-xs font-medium text-foreground">{name}</p>
        <p className="text-[11px] text-muted-foreground">
          {unavailable ? "Preview unavailable" : (size ?? attachment.mimeType ?? "File")}
        </p>
      </div>
      {attachment.id ? (
        <button
          type="button"
          aria-label={`Download ${name}`}
          disabled={busy}
          onClick={() => void download()}
          className="rounded p-1.5 text-muted-foreground hover:bg-muted hover:text-foreground disabled:opacity-50"
        >
          <Download className="h-3.5 w-3.5" />
        </button>
      ) : null}
    </div>
  );
}

export function AttachmentGallery({ attachments }: { attachments: MessageAttachment[] }) {
  if (attachments.length === 0) return null;
  return (
    <div className="mt-2 flex flex-wrap gap-2">
      {attachments.map((attachment, index) =>
        isImageAttachment(attachment) ? (
          <ImageAttachment key={attachment.id ?? index} attachment={attachment} />
        ) : (
          <FileAttachment key={attachment.id ?? index} attachment={attachment} />
        ),
      )}
    </div>
  );
}
