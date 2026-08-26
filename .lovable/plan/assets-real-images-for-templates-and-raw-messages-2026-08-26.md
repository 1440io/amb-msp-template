# Assets: real images for templates and raw messages

Add an asset library so image slots in templates (and image-bearing raw messages) can use actual artwork. Images can be uploaded, imported from a URL, or generated with AI, and they live in the 1440 rich-asset library that Apple templates bind to.

## New Assets page

A new `/assets` page listing every asset in the library: thumbnail (when we can render it), display name, usage slot (interactive image, rich link image, iMessage app icon, App Clip image), and delete (blocked by the API while a template still binds it — surfaced as a clear message).

Three ways to add an asset, all in one dialog:

1. **Upload** — pick or drop a PNG, give it a display name and usage slot.
2. **From URL** — paste an image URL; the server fetches the bytes, checks type and size, and uploads them.
3. **Generate with AI** — describe the image; Lovable AI creates it and it lands straight in the library. Prompt hints are tailored to the chosen usage slot (e.g. wide hero art for rich links, square icon for app icons).

Every fetch and upload happens server-side; the 1440 key never reaches the browser.

## Template wizard

Image slot fields stop being free-text slot names. Each image slot becomes an asset picker showing the library filtered to the right usage, plus an inline "Add image" that opens the same upload / URL / generate dialog and selects the new asset immediately. Picking an asset sets both the slot name and the slot binding, so publishing no longer fails with an unbound slot. The live preview renders the chosen image.

Review step lists every slot with its bound asset and flags any slot still unbound before publish.

## Raw messages

Apple's raw send rejects inline image assets, so the raw studio keeps sending URL/title-only rich links. When an image is wanted, the studio offers a one-click path: "Send with an image (rich template)". That builds a rich-link template from the current payload with the picked or newly created asset bound to its image slot, publishes it, and sends it to the selected conversation — with the existing diagnostics panel on any failure. The generated template is named after the link so it is recognizable in `/templates`.

## Technical notes

- Server: new `uploadRichAsset`, `deleteRichAsset`, and asset-listing helpers in `src/lib/msp.server.ts` wrapping `client.admin.templates.uploadAsset` / `deleteAsset` / `listAssets` (channel fixed to `amb`).
- Raw bytes: `src/routes/api/assets/upload.ts` (multipart, bearer-token checked like the attachments route) for file uploads.
- `src/lib/assets.functions.ts`: server functions for URL import (redirect-following fetch, content-type + size checks, reuse of the existing link-metadata fetch hardening) and AI generation via `https://ai.gateway.lovable.dev/v1/images/generations` with `openai/gpt-image-2`, non-streaming, PNG bytes uploaded directly to the library. Gateway 402/403/429 statuses surface their message; no artificial timeouts.
- Thumbnails: a small authenticated proxy route serves asset bytes when the API exposes a read URL; otherwise the card shows a name-and-usage placeholder.
- Client: `src/routes/_authenticated/assets.tsx`, `src/components/amb/AssetLibrary.tsx`, and `src/components/amb/AssetPickerDialog.tsx` (reused by the wizard and raw studio).
- `template-fields.ts` / `TemplateWizard.tsx` gain slot-to-asset binding state; `TemplatePreview.tsx` renders bound images.
- No schema changes; assets live in the 1440 library, not in the app database.
