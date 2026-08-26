# Automatic rich links

Any URL an agent sends — or types into a template or raw payload — becomes an Apple rich link card automatically, with the real page title, description, and image pulled from the linked page.

## How it behaves

**Inbox composer (always automatic)**
1. On send, the message text is scanned for `https://` URLs.
2. If the text is only a URL, one rich link message is sent.
3. If there is text around the URL, two messages go out in order: the surrounding text as a plain text message, then the rich link card. Multiple URLs each get their own card, in the order they appeared.
4. Attachments continue to ride with the text message as they do today.
5. No toggle and no preview — the conversation thread shows the resulting messages after they send. If link metadata can't be fetched, the card still sends with the URL alone rather than failing.

**Template wizard**
- When a URL is typed or pasted into a text body, the Build step offers a one-click "Convert to rich link" action that switches the template's message type to Rich link and fills url, title, and description from the fetched metadata. This one is an explicit click rather than silent, because changing the template's type rewrites the definition.

**Raw payload studio**
- Pasting a URL while the Rich link type is selected auto-fills `richLinkData` (url, title, description, image url) from the fetched metadata. Pasting a URL into a text payload shows the same "Convert to rich link" action.

## Metadata fetching

A new server function fetches the URL server-side and reads OpenGraph/Twitter/HTML metadata: title, description, image, site name. Results are cached briefly in memory per URL so sending the same link repeatedly doesn't refetch. Only `https://` URLs are fetched, with a short timeout, a size cap, and redirects followed a limited number of times; failures return empty metadata instead of erroring.

## Technical notes

- `src/lib/link-preview.server.ts` — `fetchLinkMetadata(url)`: https-only, ~4s timeout, ~512KB read cap, parses `og:*` / `twitter:*` / `<title>` / `<meta name="description">`, resolves relative image URLs, short-lived cache.
- `src/lib/link-preview.functions.ts` — authenticated `getLinkMetadata` server function for the wizard and raw studio.
- `src/lib/links.ts` — client-safe `extractUrls(text)` and `splitTextAndUrls(text)` used by composer and editors.
- `sendOutbound` in `src/lib/msp.server.ts` gains the auto-rich-link path: when the body contains URLs it sends the text part via `sendText` (with attachments), then one `sendRaw` rich link payload per URL, built with the existing `rich_link` skeleton in `src/lib/raw-payloads.ts` (`type: "richLink"`, `richLinkData.url` plus title/image from metadata). Each send keeps its own UUIDv7 request id and `outbound_log` row; a rich link failure is reported with the existing structured diagnostics and does not roll back the text message.
- Rich link messages are stored in `messages` with `message_type: "rich_link"` and content containing the url/title/image, so `src/lib/message-preview.ts` and `MessageItem.tsx` render a link card in the thread and a one-line preview in the inbox list.
- Wizard/raw-studio changes are UI-side: `TemplateWizard.tsx` / `template-fields/FieldEditors.tsx` and `RawPayloadStudio.tsx` call `getLinkMetadata` and write into existing field state. No schema or credential changes; the page fetch happens server-side only.
