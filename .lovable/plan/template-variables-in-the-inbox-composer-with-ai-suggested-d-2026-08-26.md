# Template variables in the Inbox composer, with AI-suggested defaults

Today the Inbox "Rich template" tab renders a plain text box per variable, and only for canonical templates — native templates (list picker, time picker, form, rich link, iMessage app) report an empty variable list, so their variables can't be filled at all. There is also no help deciding what to put in them.

## What changes

1. **Every template exposes its variables.** Variables are read from the definition for native templates too, not just canonical ones, so the composer can always show the right fields.

2. **Proper editors per variable type.**
   - text: single-line input
   - url: URL input with a light validity hint
   - datetime: date + time picker producing the Apple time format the sender already expects
   - collection: repeatable rows matching the collection's item schema — list picker items (id, title, subtitle) or timeslots (start time, duration)
   - Required variables are marked, and "Send template" stays disabled until every required one has a value.

3. **AI-suggested defaults.** A "Suggest values" button on the template tab sends the recent conversation (last ~30 messages: direction, text, form responses, picker selections) plus the template's variable list to Lovable AI, which returns a suggested value per variable and a short reason. Suggestions land in the fields as editable prefills — never auto-sent. Each prefilled field shows the one-line rationale, with a "Clear suggestions" reset. Suggestions run automatically once when a template is selected on a conversation with messages, and can be re-run manually.
   Values are validated/coerced to the variable's type before filling; anything unusable is skipped rather than inserted.

4. **Errors surface plainly.** If AI is rate limited, out of credits, or blocked, the composer shows that message inline and the fields stay manually editable.

## Technical notes

- `TemplateView.variables` / `TemplateAdminView.variables` in `src/lib/msp.server.ts` gain native-definition support (map `definition.variables` regardless of mode) and carry `itemSchema` through so the client knows which collection editor to render.
- New server fn `suggestTemplateVariables` in `src/lib/ai.functions.ts` (auth middleware, as the others), implemented in `src/lib/ai.server.ts` reusing the existing `callGateway` helper and `google/gemini-3.7-flash`, returning `{ suggestions: { name, value, reason }[] }` plus the existing structured error shape. The handler loads the conversation's recent messages server-side via the admin client and scopes them to the requested conversation.
- The composer's template tab in `src/routes/_authenticated/inbox/$conversationId.tsx` moves into a `TemplateComposer` component holding variable state, the typed editors, and suggestion state. Collection/datetime editors reuse the existing formatting helpers in `src/lib/template-fields.ts` / `src/lib/template-definitions.ts` where they already exist.
- Send payload stays as-is: `sendMessage({ conversationId, templateId, variables })`; collection variables are sent as arrays of objects, datetimes as the existing Apple time string.
- No database or schema changes.
