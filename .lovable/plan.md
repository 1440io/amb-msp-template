# Inbox list: show the real latest message

The conversation list currently prints whatever summary string was saved on the conversation row when the message arrived. For interactive replies that string is a placeholder ("Submitted a form"), so the list says nothing useful even though the thread view now renders the full response data.

## What changes

- The list preview is derived from the actual most recent message of each conversation instead of the saved placeholder string, so it always matches what the thread shows.
- Previews read like the response itself:
  - Text: the message body.
  - Quick reply / list picker: the chosen titles (falling back to the chosen IDs).
  - Time picker: the booked date and time, formatted.
  - Form: the first submitted fields as `Label: value` pairs, truncated to fit one line.
  - Attachments: the file name.
  - Opt-out: "Customer opted out of messaging".
  - Outbound messages are prefixed with "You: " so it is clear who spoke last.
- Timestamp and ordering keep using the conversation's last-message time.
- Search keeps working against the new preview text.
- New inbound/outbound messages update the preview live through the existing Realtime subscription.
- Rows with no messages still show "No messages yet".

## Technical notes

- Extract the response-formatting helpers currently local to `src/components/amb/MessageItem.tsx` (`fieldLabel`, `formatValue`, form-entry flattening, Apple timestamp parsing) into a shared module, e.g. `src/lib/message-preview.ts`, exporting a `previewForMessage(message)` used by the inbox list. `MessageItem.tsx` imports the same helpers so thread and list never diverge.
- Add a query in `src/routes/_authenticated/inbox/route.tsx` that fetches the latest message per conversation (single `messages` select ordered by `occurred_at` desc, reduced to the first row per `conversation_id`) and render `previewForMessage(latest) ?? conversation.last_message_preview`. Invalidate it in the existing `messages` Realtime handler.
- Also upgrade `previewOf` in `src/lib/msp.server.ts` to use the same summariser so newly stored rows carry a meaningful `last_message_preview` (used as the fallback and for search server-side). No schema change, no backfill.
