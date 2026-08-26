# Map customer replies back into template variables

Today a template variable can be filled from Salesforce, appointments, availability, the conversation, a fixed value, AI, or by hand. What's missing is the richest source of all: **what the customer already told you** — quick reply choices, list picker selections, booked times, and every form field they submitted.

This adds "Customer reply" as a first-class data source, with automatic name matching so most variables map themselves.

## What you'll see

**A new source: Customer reply**

In a template's "Map variables" panel, each variable gains a "Customer reply" option. Instead of a fixed field list, it offers the reply fields this workspace has actually received (form field names, picker selections, booked times), plus a free-text box for a field you know is coming but hasn't arrived yet.

**Automatic mapping**

- An "Auto-map from replies" button fills every variable whose name matches a known reply field (case/underscore-insensitive: `contactEmail` matches `contact_email`).
- Even with no mapping saved, composing a template will fall back to a reply field with the same name as the variable and prefill it, badged "Customer reply". Explicit mappings always win over this fallback.
- If a variable maps to a reply the customer hasn't sent in this conversation, it falls through to its configured fallback (AI or manual) exactly as other sources do.

**In the Inbox**

Selecting a template prefills reply-sourced values with an origin badge like `Customer reply · Preferred date`, and the note line says how many values came from earlier replies. Everything stays editable, and "Refresh data" re-reads the latest replies.

**A Replies panel in the conversation**

A small collapsible list above the composer showing the captured reply fields for this conversation (label, value, when it arrived), so an agent can see exactly what will be reused.

## How it works

Replies are already stored: every inbound interactive message keeps its full payload in `messages.content`, with `request_identifier` linking it back to the outbound request. So there's **no new table and no migration** — reply fields are extracted from the conversation's inbound messages on demand, newest wins.

Extraction covers the shapes the console already renders:
- form submissions — one field per key across all submitted pages
- list picker / quick reply — selected titles and ids (single value, or a collection when the variable is a collection)
- time picker — the booked start time, in Apple datetime format, plus end time
- invitation acceptance and plain text bodies as a `lastMessage` field

## Technical notes

- `src/lib/data-sources/responses.ts` (new, client-safe): `extractReplyFields(messages)` → `{ key, label, value, occurredAt, messageId }[]`, reusing `formEntries`/`formatValue`/`parseAppleTimestamp` from `src/lib/message-preview.ts` so the thread view and the mapper never disagree. `normalizeKey()` does the loose name matching.
- `src/lib/data-sources/types.ts`: add `"response"` to `SourceKind`, `SOURCE_LABELS`, and `compatibleSources` (valid for text, datetime, and both collection item schemas). Its paths are dynamic, so `pathsFor` returns `[]` and the UI supplies options from the catalog.
- `src/lib/data-sources/resolve.server.ts`: accept the conversation's inbound messages, resolve `response` mappings by key, coerce to the variable's shape (text, Apple datetime, `list_picker_item[]`, `timeslot[]`), and apply the by-name fallback for unmapped variables. Origin string: `Customer reply · <label>`.
- `src/lib/data-sources.functions.ts`: `resolveTemplateVariables` also loads the conversation's recent inbound messages; new `listReplyFieldCatalog` (distinct keys/labels from recent inbound messages, for the mapping dropdown) and `listConversationReplies` (for the Replies panel).
- `src/components/amb/VariableMappingPanel.tsx`: reply-field dropdown + custom-key input + "Auto-map from replies".
- `src/components/amb/TemplateComposer.tsx`: no new logic needed beyond origins already implemented; badge text comes from the resolver.
- New `src/components/amb/ConversationReplies.tsx` rendered in the Inbox conversation route.

No credentials leave the server, and no schema changes.
