import { useRef, useState } from "react";
import { Paperclip, X, Loader2, FileText } from "lucide-react";
import { Button } from "@/components/ui/button";
import { formatBytes } from "@/lib/amb";
import {
  MAX_ATTACHMENTS_PER_MESSAGE,
  uploadAttachment,
  validateFile,
  type UploadedAttachment,
} from "@/lib/attachments";

export type PendingAttachment = {
  key: string;
  name: string;
  size: number;
  type: string;
  previewUrl?: string;
  status: "uploading" | "ready" | "error";
  error?: string;
  uploaded?: UploadedAttachment;
};

export function AttachmentPicker({
  conversationId,
  channelPlatform,
  items,
  onChange,
  disabled,
}: {
  conversationId: string;
  channelPlatform: string;
  items: PendingAttachment[];
  onChange: (next: (previous: PendingAttachment[]) => PendingAttachment[]) => void;
  disabled?: boolean;
}) {
  const inputRef = useRef<HTMLInputElement>(null);
  const [dragging, setDragging] = useState(false);

  const addFiles = async (files: File[]) => {
    if (files.length === 0) return;
    let accepted: { key: string; file: File }[] = [];

    onChange((previous) => {
      const room = MAX_ATTACHMENTS_PER_MESSAGE - previous.length;
      const slice = files.slice(0, Math.max(room, 0));
      accepted = slice.map((file) => ({ key: `${Date.now()}-${file.name}-${Math.random()}`, file }));
      const next: PendingAttachment[] = accepted.map(({ key, file }) => {
        const problem = validateFile(file, channelPlatform);
        return {
          key,
          name: file.name,
          size: file.size,
          type: file.type,
          ...(file.type.startsWith("image/") ? { previewUrl: URL.createObjectURL(file) } : {}),
          status: problem ? ("error" as const) : ("uploading" as const),
          ...(problem ? { error: problem } : {}),
        };
      });
      return [...previous, ...next];
    });

    for (const { key, file } of accepted) {
      if (validateFile(file, channelPlatform)) continue;
      try {
        const uploaded = await uploadAttachment(file, conversationId);
        onChange((previous) =>
          previous.map((item) =>
            item.key === key ? { ...item, status: "ready", uploaded } : item,
          ),
        );
      } catch (error) {
        onChange((previous) =>
          previous.map((item) =>
            item.key === key
              ? {
                  ...item,
                  status: "error",
                  error: error instanceof Error ? error.message : "Upload failed",
                }
              : item,
          ),
        );
      }
    }
  };

  const full = items.length >= MAX_ATTACHMENTS_PER_MESSAGE;

  return (
    <div
      onDragOver={(event) => {
        event.preventDefault();
        if (!disabled) setDragging(true);
      }}
      onDragLeave={() => setDragging(false)}
      onDrop={(event) => {
        event.preventDefault();
        setDragging(false);
        if (disabled) return;
        void addFiles(Array.from(event.dataTransfer.files));
      }}
      className={`rounded-md border border-dashed px-2 py-2 transition-colors ${
        dragging ? "border-primary bg-primary/5" : "border-border"
      }`}
    >
      <div className="flex items-center gap-2">
        <input
          ref={inputRef}
          type="file"
          multiple
          className="hidden"
          onChange={(event) => {
            void addFiles(Array.from(event.target.files ?? []));
            event.target.value = "";
          }}
        />
        <Button
          type="button"
          size="sm"
          variant="outline"
          className="h-7 gap-1.5 text-xs"
          disabled={disabled || full}
          onClick={() => inputRef.current?.click()}
        >
          <Paperclip className="h-3.5 w-3.5" />
          Attach files
        </Button>
        <p className="text-[11px] text-muted-foreground">
          {full
            ? `Limit reached — ${MAX_ATTACHMENTS_PER_MESSAGE} files per message`
            : "or drop files here"}
        </p>
      </div>

      {items.length > 0 ? (
        <ul className="mt-2 flex flex-wrap gap-2">
          {items.map((item) => (
            <li
              key={item.key}
              className={`flex items-center gap-2 rounded-md border bg-card p-1.5 pr-1 ${
                item.status === "error" ? "border-destructive/60" : "border-border"
              }`}
            >
              {item.previewUrl ? (
                <img
                  src={item.previewUrl}
                  alt={item.name}
                  className="h-9 w-9 rounded object-cover"
                />
              ) : (
                <div className="flex h-9 w-9 items-center justify-center rounded bg-muted text-muted-foreground">
                  <FileText className="h-4 w-4" />
                </div>
              )}
              <div className="min-w-0 max-w-[11rem]">
                <p className="truncate text-xs font-medium text-foreground">{item.name}</p>
                <p
                  className={`truncate text-[11px] ${
                    item.status === "error" ? "text-destructive" : "text-muted-foreground"
                  }`}
                >
                  {item.status === "uploading"
                    ? "Uploading…"
                    : item.status === "error"
                      ? (item.error ?? "Upload failed")
                      : (formatBytes(item.size) ?? "Ready")}
                </p>
              </div>
              {item.status === "uploading" ? (
                <Loader2 className="mr-1 h-3.5 w-3.5 animate-spin text-muted-foreground" />
              ) : (
                <button
                  type="button"
                  aria-label={`Remove ${item.name}`}
                  className="rounded p-1 text-muted-foreground hover:bg-muted hover:text-foreground"
                  onClick={() => {
                    if (item.previewUrl) URL.revokeObjectURL(item.previewUrl);
                    onChange((previous) => previous.filter((entry) => entry.key !== item.key));
                  }}
                >
                  <X className="h-3.5 w-3.5" />
                </button>
              )}
            </li>
          ))}
        </ul>
      ) : null}
    </div>
  );
}
