# Fix rich link raw sends rejected by Apple (502 / gateway 400)

## What we know

- The failure is real and specific to rich links: the send log shows two `raw` sends at 04:48 UTC rejected with `502` and reason `provider_rejected — AMB gateway request failed with status 400`, while the plain `text` sends immediately before and after both succeeded.
- Earlier `raw` sends at 04:14 UTC succeeded. The change since then is that link previews now always attach an image: OpenGraph image, npm registry logo, or a site-icon fallback.
- Our rich link payload currently sends the image as a remote URL:
  `richLinkData.assets.image = { url, mimeType }`.
- The 1440 template path never sends a remote image URL — it binds an image **slot** to an asset uploaded into the asset library (`usage: "rich_link_image"`, PNG). The raw send schema documents no asset shape at all, and `richLinkDataRef` is explicitly rejected.

That makes the attached remote image the prime suspect for Apple's 400, but the API does not return a field-level reason, so the cause is **not yet confirmed**. Step 1 below confirms it before we change behavior.

## Step 1 — Confirm the cause (first task)

Send three probe rich links into a real conversation through the existing raw path and record each result:

1. `url` + `title` only, no `assets`.
2. `url` + `title` + `assets.image` with the remote https PNG (today's payload).
3. `url` + `title` + `assets.image` with only `url` (no `mimeType`), to separate shape from content.

Whichever variants return 400 tells us exactly what Apple rejects. If variant 1 also fails, the image is not the cause and we investigate the outer envelope (`type: "richLink"`, title length, URL scheme) instead of proceeding to Step 2 as written.

## Step 2 — Fix the send path

Assuming the probe confirms the remote image asset is the problem:

- Stop putting remote image URLs into raw rich link payloads. A raw rich link sends `url` and `title` (plus `videoUrl` when present) — the shape that already worked.
- When we have preview image bytes we can legitimately attach, upload them to the 1440 asset library (`uploadAsset`, channel `amb`, usage `rich_link_image`, PNG) server-side and attach via the identifier the probe shows Apple accepts. If no accepted form exists for raw sends, rich links go out without an image and the UI says so plainly rather than failing the send.
- Keep the link-preview metadata (title, description, image) for our own in-app preview and diagnostics; it just stops being blindly forwarded to Apple.

## Step 3 — Make this class of failure debuggable

- Persist the outbound raw payload alongside the existing `outbound_log` reason rows, so a provider 400 can be diagnosed from the log instead of by re-deriving it.
- Surface the provider reason and the rejected payload in the send diagnostics panel (raw studio, composer, wizard) — today the panel shows the 502 but the payload is gone.
- Extend the client-side rich link validation with whatever the probe proves is invalid, so the reject happens before we call the API.

## Scope

- Composer auto-conversion, `/raw`, and the template wizard all go through the same rich link builder, so all three are fixed by one change.
- No new pages or sections. Template sends (which use asset slots) are untouched.

## Technical notes

- Payload builder: `src/lib/links.ts` (`richLinkPayload`), skeleton and validation in `src/lib/raw-payloads.ts` (`rich_link`, `validateRawPayload`).
- Metadata and image resolution: `src/lib/link-preview.server.ts`.
- Send + logging: `src/lib/msp.server.ts` raw send path and the `outbound_log` writer.
- Asset upload: `client.admin.templates.uploadAsset({ channel: "amb", usage: "rich_link_image", ... })`.
