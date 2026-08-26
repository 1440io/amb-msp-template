# Template authoring gets the same message-type mechanism as /raw

Today the raw studio starts from a message-type selector: pick "Quick reply", get a valid starting payload, AI drafts inside that shape, local validation checks it, and a debug panel explains failures. The template editor has none of that — it opens with an empty JSON box and a free-form prompt, so the model decides the shape and there is no per-type validation.

## What changes for the user

**On /templates → New template (and Edit)**

- A message-type selector appears next to the name field, with the same seven options as /raw: Text, Quick reply, List picker, Time picker, Form, iMessage app, Rich link.
- Choosing a type immediately fills the definition editor with a valid starting definition for that type, including declared variables where they make sense (for example a `customerName` text variable in a quick-reply summary).
- A definition mode toggle sits beside the type: **Canonical** (portable across channels) or **Channel-native (AMB)** (the Apple payload shape, same content as the raw studio's skeleton). Switching either control regenerates the starting definition.
- "Draft with AI" and "Review & fix" work exactly as they do on /raw, but the model is now told the chosen message type and mode, and is given the matching skeleton as a reference — so drafts stay inside the shape you picked instead of inventing one.
- Inline validation runs against the chosen type before saving: missing required fields, quick-reply item counts (2-5), hyphenated `quick-reply` marker, Apple time formats, Apple's outer `type` marker for native definitions, and undeclared `{{variables}}`. Save stays disabled while problems remain, and each problem is listed under the editor.
- The same collapsible, copyable Debug panel from the raw studio appears here, auto-opening when an AI draft or a save fails, showing the status, error code, reason codes and the definition that was sent.
- Editing an existing template infers its type and mode from the stored definition so the selector reflects reality instead of resetting the JSON.

## Technical notes

- Extract the shared pieces the raw studio already owns into reusable modules so both surfaces use one implementation:
  - `src/lib/template-definitions.ts` (client-safe): per-message-type canonical and native definition skeletons built from the existing `RAW_PAYLOAD_SKELETONS`, `inferTemplateShape(definition)` to recover type + mode when editing, and `validateTemplateDefinition(messageType, mode, definition)` reusing the raw validators for the native branch.
  - `src/components/amb/JsonDebugPanel.tsx`: the debug panel currently inline in `RawPayloadStudio`, used by both.
- `TemplateEditor.tsx`: add message-type and mode state, seed and reseed the JSON from the skeletons, run the new validator, pass `messageType`/`mode` to the AI call, and record AI/save results into the debug panel.
- `src/lib/ai.functions.ts` (`draftTemplate`): accept optional `messageType` and `mode`, validating `messageType` with the existing `isRawMessageType`.
- `src/lib/ai.server.ts` (`draftTemplateDefinition`): accept the same two inputs; when present, pin the system prompt to that block kind, embed the matching skeleton, and run `validateTemplateDefinition` on the model output so "Still invalid: ..." notes come back the way raw drafting already does.
- No database or server-send changes; template create/update server functions keep their current signatures.
