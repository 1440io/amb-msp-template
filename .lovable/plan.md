# Attachments: send, receive, and show images inline

Agents will be able to attach files to a reply, and inbound images will render as actual pictures in the conversation thread — with the image bytes served through the app so 1440's signed URLs never reach the browser.

## What changes for the user

**Composer (Inbox thread)**
- The manual "Attachment IDs" box is replaced by real file selection: a paperclip/"Attach files" button plus drag-and-drop onto the composer.
- Selected files appear as chips with thumbnail (images), file name, and size, each removable before sending.
- Files upload as soon as they're chosen, with per-file progress and a clear error if an upload fails.
- Limits enforced in the UI with plain messages: up to 10 files per message, 100 MB per file (3 MB and JPG/PNG only for TikTok conversations), and Send stays enabled once there's text or at least one uploaded file.
- Opt-out still disables the composer entirely.

**Conversation thread**
- Inbound and outbound images render as an actual inline image (max-height bubble, click to open full size in a new tab) instead of a small generic tile.
- Non-image attachments keep a file card with type badge, name, size, and a download action.
- Broken/expired media falls back to the file card rather than a dead image icon.
- Outbound sends immediately show the attachments the agent just uploaded.

**Inbox list**
- Previews for attachment-only messages read like "Photo", "2 photos", or the file name, rather than a bare "Attachment".

## Technical notes

Server-side (all 1440 calls stay server-only; the API key never leaves the server):
- `src/lib/msp.server.ts`: add `uploadAttachment` (calls `client.media.upload` with bytes, filename, contentType, and `targetChannel` from the conversation's platform, returning `mediaAssetId` plus normalized metadata) and `fetchAttachmentBytes` (calls `client.media.getAccessUrl` and streams the signed URL server-side). Reuse the existing diagnostics/logging helpers so upload failures produce the same structured `isMspApiError` detail already used by sends.
- Upload route: an authenticated app route (`src/routes/api/attachments/upload.ts`) accepting `multipart/form-data`, since raw bytes can't cross the server-function RPC boundary. It verifies the Supabase bearer token before uploading and returns the attachment id + metadata.
- Proxy route: an authenticated route (`src/routes/api/attachments/$attachmentId.ts`) that verifies the caller, mints a fresh access URL server-side, streams the bytes back with the stored content-type, `Content-Disposition: inline`, and `Cache-Control: private, max-age=…`. Images in the UI point at this app path only.
- `sendOutbound` already accepts `attachmentIds`; it will persist richer attachment metadata (id, fileName, mimeType, sizeBytes) on the stored outbound message so the thread and preview render correctly.
- Webhook ingestion in `msp.server.ts` normalizes inbound attachment shapes (`fileName`/`sizeBytes`/`url` from webhooks vs `originalFileName`/`accessUrl` from the API) into one stored shape; the short-lived signed `url` is not relied on for display.

Frontend:
- New `src/components/amb/AttachmentPicker.tsx` (file input + drag-and-drop + upload state) used by the composer in `src/routes/_authenticated/inbox/$conversationId.tsx`.
- `src/components/amb/MessageItem.tsx`: attachment rendering split into inline image vs file card, both sourced from the proxy path.
- `src/lib/message-preview.ts`: attachment-aware preview text (photo counts / file names) shared by thread and inbox list.
- Demo mode keeps working: demo attachments render from the existing demo metadata without hitting 1440.
