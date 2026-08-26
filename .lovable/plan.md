# Show template details in the Inbox

Today a sent rich-template message renders as `Rich template · 01a03c60-…` — just the raw ID. Instead, the bubble should show what was actually sent.

## What the bubble will show

- Template **name** and a readable kind/mode label (e.g. "Quick reply · canonical", "List picker · Apple native").
- A rendered **preview of the template content** (bubble text, quick-reply options, list sections, timeslots, form pages, rich-link card, iMessage app), using the same preview component the Templates wizard already uses, with the message's saved variable values filled in.
- The **variables** that were sent (name → value), when the message carried any.
- The template ID kept as small muted secondary text so it's still available for debugging.

If the template can't be loaded (credentials missing, template deleted, API error), the bubble falls back to today's `Rich template · <id>` line plus a short "details unavailable" note — nothing breaks.

The Inbox conversation list preview line also becomes `Rich message · <template name>` once the name is known, instead of the ID.

## Technical notes

- Add a `getTemplateDetail` server function (`src/lib/msp.functions.ts` + `src/lib/msp.server.ts`) that calls `client.admin.templates.get(id)` and returns the existing `TemplateAdminView` shape. Keep it auth-protected like the other template functions.
- In the conversation route, collect the distinct `content.templateId` values from loaded messages and fetch their details with React Query (one query per template ID, cached/stale-time so scrolling doesn't refetch). Pass the resolved detail into `MessageItem` as an optional prop.
- `MessageItem` gains a `TemplateCard` branch (before the plain-text branch) that converts the detail's `definition` into fields via `src/lib/template-fields.ts` and renders `TemplatePreview` in a compact read-only mode, merging the message's `content.variables` over the sample values.
- Update `src/lib/message-preview.ts` so the template preview text accepts an optional resolved name and uses it when present, keeping the ID fallback.
- No changes to sending, `/raw`, the wizard's authoring flow, or webhooks.
