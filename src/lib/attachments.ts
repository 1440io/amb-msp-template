// Client-safe attachment helpers. Media bytes are always fetched through the
// app's own /api/attachments proxy so 1440's short-lived signed URLs never
// reach the browser.
import { supabase } from "@/integrations/supabase/client";
import type { MessageAttachment } from "@/lib/message-preview";

export const MAX_ATTACHMENTS_PER_MESSAGE = 10;
export const MAX_UPLOAD_BYTES = 100 * 1024 * 1024;
export const MAX_TIKTOK_UPLOAD_BYTES = 3 * 1024 * 1024;
export const TIKTOK_MIME_TYPES = ["image/jpeg", "image/png"];

export type UploadedAttachment = {
  id: string;
  fileName: string;
  mimeType: string | null;
  sizeBytes: number | null;
};

export function attachmentName(attachment: MessageAttachment): string {
  return attachment.originalFileName ?? attachment.fileName ?? "Attachment";
}

export function attachmentSize(attachment: MessageAttachment): number | null {
  return attachment.byteSize ?? attachment.size ?? attachment.sizeBytes ?? null;
}

export function isImageAttachment(attachment: MessageAttachment): boolean {
  const mime = attachment.mimeType ?? "";
  if (mime.startsWith("image/")) return true;
  return /\.(png|jpe?g|gif|webp|heic|bmp)$/i.test(attachmentName(attachment));
}

/** Reject before the transfer starts, with a message an agent can act on. */
export function validateFile(file: File, channelPlatform: string): string | null {
  const tiktok = channelPlatform === "tiktok";
  const limit = tiktok ? MAX_TIKTOK_UPLOAD_BYTES : MAX_UPLOAD_BYTES;
  if (file.size > limit) {
    return tiktok
      ? `${file.name} is larger than 3 MB, TikTok's limit.`
      : `${file.name} is larger than 100 MB.`;
  }
  if (tiktok && file.type && !TIKTOK_MIME_TYPES.includes(file.type)) {
    return `TikTok accepts only JPG or PNG — ${file.name} is ${file.type}.`;
  }
  return null;
}

async function authHeader(): Promise<Record<string, string>> {
  const { data } = await supabase.auth.getSession();
  const token = data.session?.access_token;
  if (!token) throw new Error("Your session expired — sign in again.");
  return { Authorization: `Bearer ${token}` };
}

export async function uploadAttachment(
  file: File,
  conversationId: string,
): Promise<UploadedAttachment> {
  const form = new FormData();
  form.append("file", file, file.name);
  form.append("conversationId", conversationId);

  const response = await fetch("/api/attachments/upload", {
    method: "POST",
    headers: await authHeader(),
    body: form,
  });

  const payload = (await response.json().catch(() => null)) as
    | { ok?: boolean; attachment?: UploadedAttachment; message?: string }
    | null;

  if (!response.ok || !payload?.ok || !payload.attachment) {
    throw new Error(payload?.message ?? `Upload failed (${response.status})`);
  }
  return payload.attachment;
}

/** Fetch attachment bytes through the proxy and return an object URL. */
export async function fetchAttachmentObjectUrl(attachmentId: string): Promise<string> {
  const response = await fetch(`/api/attachments/${attachmentId}`, {
    headers: await authHeader(),
  });
  if (!response.ok) throw new Error(`Attachment unavailable (${response.status})`);
  return URL.createObjectURL(await response.blob());
}
