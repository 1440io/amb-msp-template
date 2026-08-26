# Raw payload sending + AI-assisted template authoring

Add two capabilities, both driven by the same AI-assisted JSON workflow:

1. Build and send **raw Apple MSP payloads** (the `SendRawChannelPayloadBody` shapes: text, quick_reply, list_picker, time_picker, form, imessage_app, rich_link) — from a new tab in the conversation composer and from a standalone playground page.
2. Turn **/templates** into a full authoring surface: create, edit, publish, archive, and delete draft rich templates, with AI generating and repairing the template definition JSON.

## What the user sees

**Composer "Raw" tab (in a conversation)**
- Pick a message type, describe what you want in plain English ("3 quick replies for pickup, delivery, or store credit"), and AI drafts the payload JSON.
- The JSON stays editable in a code editor. A "Review & fix" action sends the current JSON back to AI, which repairs it and explains what was wrong, including Apple's quirks (quick replies need 2–5 items, the payload marker is `quick-reply` not `quickReply`, time-picker timestamps are not RFC 3339).
- Local validation runs before send: opted-out conversations block sending, required fields and item counts are checked, and errors show inline.
- Send goes through the existing server path with a `uuidv7` idempotency key and is logged in `outbound_log` with kind `raw`, so rejects show their reason codes in the thread just like template sends.

**/raw playground page** (new route, confirmed)
- Same generate / edit / review loop without a conversation attached, plus a conversation picker so a draft can be sent when ready. Useful for iterating on a payload shape before wiring it into a real reply.

**/templates**
- Existing published gallery stays, plus draft and archived templates.
- "New template" opens an editor: describe the template, AI produces a valid definition (canonical or channel-native) with declared variables; the JSON remains editable and can be reviewed/repaired by AI.
- Per template: save draft, publish, archive, delete draft. Readiness badges and reason codes render as they do today.
- Asset slot bindings are shown and editable as `slotName → assetId` pairs, listing the existing asset library.

## Technical notes

**Server-only, credentials never leave the server**
- New raw send in `src/lib/msp.server.ts`: `sendRawPayload()` mirroring `sendOutbound` — pre-write `outbound_log` row with `kind: "raw"`, call `client.messaging.sendRaw({ channel: "amb", conversationId, messageType, payload, requestMessageId })`, record sent/duplicate/rejected/failed, upsert the outbound message row, refresh conversation preview.
- Template authoring in `src/lib/msp.server.ts` using `client.admin.templates`: `list` (all states), `get`, `create`, `update`, `delete`, `publish`, `archive`, `listAssets`.
- New auth-gated server functions in `src/lib/msp.functions.ts`: `sendRaw`, `listAllTemplates`, `createTemplate`, `updateTemplate`, `publishTemplate`, `archiveTemplate`, `deleteTemplate`, `listAssets`.

**AI generation (Lovable AI Gateway, server-side only)**
- New `src/lib/ai.server.ts` + `src/lib/ai.functions.ts` with two auth-gated server functions: `draftPayload` (message type + prompt → payload JSON) and `draftTemplate` (prompt → `RichTemplateWriteBody` definition), each also accepting existing JSON for the review/repair mode and returning `{ json, notes[] }`.
- Uses the AI SDK with the Lovable AI Gateway provider, default `google/gemini-3-flash`, streaming consumed server-side. Prompts embed the exact `@1440io/msp-types` shapes for the selected message type plus the Apple quirk rules, so output is constrained to what the platform accepts. Gateway errors (402/403/429) surface as readable messages, never a blank failure.
- `LOVABLE_API_KEY` is provisioned as a project secret; nothing AI-related is called from the browser.

**Validation**
- Shared client-safe validators in `src/lib/raw-payloads.ts`: per-message-type required fields, quick-reply 2–5 item rule, hyphenated payload markers, timestamp format checks. Used by both the UI (pre-send) and the server function (before calling 1440).

**Data**
- No schema change needed: `outbound_log.kind` already accepts `raw` and `messages.content` is jsonb.

**Demo mode**
- With no `MSP_API_KEY`, AI drafting still works (it's local to the gateway) but sends and template writes return the existing "not configured" notice pointing at Setup.
