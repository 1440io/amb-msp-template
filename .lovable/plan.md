# Invitation messages (business-initiated conversations)

Add the ability to start a conversation with a customer who hasn't messaged first: send an invitation to their phone number, then watch it move to accepted, declined, or rejected — live, inside the Inbox.

## What the agent sees

**Inbox header gets a "New invitation" button.** It opens a panel with:

- Phone number (E.164, e.g. `+13035551234`), validated before sending
- Optional first / last name to seed the conversation with
- Channel (Apple Messages for Business or TikTok)
- Whether the resulting conversation starts with a bot or a live agent
- Send button, disabled until the number looks valid or while a send is in flight
- The same copyable Debug panel used by Raw and Templates, so a rejection shows the exact status, error code, and reason

**Invitation list in the same panel.** Newest first, each row showing the customer name or phone, channel, a status pill (Submitting / Sent / Accepted / Declined / Rejected / Error), the failure reason when there is one, and relative time. Accepted invitations link straight to their conversation in the Inbox. Statuses update without a refresh as the transitions arrive.

**Demo mode** seeds four example invitations — one accepted and linked to a demo conversation, one still awaiting a response, one declined, one provider-rejected with a reason — so a fresh clone with no credentials still shows a useful screen. They sit behind the existing Demo data banner and are replaced on the first live backfill.

## Bug fix included

The webhook already listens for invitation status changes but reads the status from the wrong place in the payload, so every accepted/declined transition is currently discarded. That parsing gets corrected against the real payload shape as part of this work.

## Technical notes

**Database (one migration).** New `initiations` table: 1440 initiation id (primary key), channel, purpose, phone number stored last-4-only for display, target first/last name, target agent status, status, reason code, caller reference, linked conversation id, created/updated timestamps, `is_demo` flag. Authenticated read policy, service-role write policy, GRANTs for `authenticated` and `service_role`, added to the Realtime publication with replica identity full, plus the demo rows as literal INSERTs.

Full phone numbers are not persisted — the API call carries the number and only a masked form is stored for display.

**Server layer (`src/lib/msp.server.ts`).**
- `createInitiation` — validates E.164, mints a UUIDv7 idempotency key, calls `client.initiations.create`, upserts the returned row, and returns a structured result reusing the existing `SendDebug`/`SendResult` shape (status, code, reasons, endpoint, duration) so failures surface `invalid_recipient`, `idempotency_conflict`, `initiation_unavailable`, etc.
- `backfillInitiations` — paginates `client.initiations.list` and upserts; called from the existing backfill so Setup's "Backfill" picks invitations up too.
- `recordInitiationUpdate` — rewritten to read `event.data` (`initiationId`, `status`, `reasonCode`, `conversationId`, `channel`, `callerReference`, `occurredAt`), upsert the initiation row, and keep the existing conversation `agent_status` update when a conversation is linked.

**Server functions (`src/lib/msp.functions.ts`).** `sendInitiation` and `listInitiations`, both behind `requireSupabaseAuth`; the API key stays server-side as before. Initial list read comes from the database (Realtime keeps it current), not from 1440 on every render.

**UI.** New `src/components/amb/InvitationPanel.tsx` plus a Realtime subscription on `initiations` mirroring the existing conversations/messages subscription. Inbox index route gains the button and panel; no new route, no new nav item.

Unchanged: templates, raw sends, existing message flows, send signatures.
