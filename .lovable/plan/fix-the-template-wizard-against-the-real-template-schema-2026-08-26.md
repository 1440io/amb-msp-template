# Fix the template wizard against the real template schema

Both 400s come from the same root cause: the wizard builds template definitions in a shape the platform's template API does not accept. I checked the SDK schema (`@1440io/msp-types`, `RichTemplateDefinition`) and confirmed:

- **Canonical mode accepts only two block kinds**: `text` (`{ kind, body }`) and `quick_reply` (`{ kind, summaryText, items[{id,title}] }` — no `body`). The wizard also emits canonical `list_picker`, `time_picker`, `form`, `imessage_app`, `rich_link` blocks, which produces `definition.block.kind: Invalid discriminator value. Expected 'text' | 'quick_reply'`.
- **Every variable must carry `itemSchema`** (either `"list_picker_item"`, `"timeslot"`, or an explicit `null`), and `type` is limited to `text | url | datetime | number-less set` (`text`, `url`, `datetime`, `collection`). The wizard omits `itemSchema` entirely and offers a `number` type, which produces the `definition.variables.0.itemSchema` error.
- **"Native" mode is not a raw Apple payload.** It is the platform's own structured per-channel schema: `{ mode: "native", channel: "amb", content: { kind, ... }, variables: [...] }` with kinds `list_picker`, `rich_link`, `time_picker`, `form`, `imessage_app`, `app_clip_rich_link`, each with `receivedBubble`/`replyBubble`, `sections[].itemsVariable`, `timeslots[{ id, startTime, durationSeconds }]`/`timeslotsVariable`, and form `pages[]` with `pageType` (`select`/`picker`/`date_picker`/`input`). The wizard currently puts the raw Apple send payload (`type`, `interactiveData`) into `content`, which the API also rejects.

Raw sending (`/raw` and the Inbox composer) is unaffected — that endpoint really does take Apple payloads, and none of it changes.

## What changes for you

- The **Mode** selector goes away. Mode is now implied by the message type: text and quick reply are canonical (render on every channel), and list picker, time picker, form, iMessage app, rich link, and App Clip rich link are AMB-native. The wizard shows this as a line of explanatory text on the Basics step instead of a choice you have to understand.
- **App Clip rich link** becomes an eighth selectable type, since the platform supports it.
- Build-step fields are rebuilt to match each real kind: received/reply bubble title, subtitle, style and image slot for the interactive kinds; timeslot id + start time + duration in seconds, or a timeslots variable; form pages typed as input / select / picker / date picker; iMessage app team id, bundle id, app id and icon slot.
- The **Variables** editor gains an item-schema choice for `collection` variables (list picker item or timeslot) and drops the unsupported `number` type.
- Validation now checks against the real schema before you can save, so these 400s surface as inline problems rather than API errors. Existing saved templates that use the old shape will show as invalid with a clear message rather than silently failing on publish.

## Technical work

1. `src/lib/template-definitions.ts` — replace `CANONICAL_BLOCKS`/`CANONICAL_VARIABLES` with schema-accurate skeletons: canonical for `text`/`quick_reply` only, native AMB `content` objects for the other kinds. Add `app_clip_rich_link` to the type set used by templates (keep `RAW_MESSAGE_TYPES` untouched for the raw studio). Derive mode from type (`modeForType`), keep `inferTemplateShape` reading `block.kind` / `content.kind`, and rewrite `validateTemplateDefinition` to validate the platform schema (discriminated kinds, required bubble fields, `itemSchema` presence, variable types, declared-variable references) instead of delegating to the Apple raw validators.
2. `src/lib/template-fields.ts` — extend `TemplateFields` with the new field set (bubble objects, timeslot ids/`durationSeconds`, `timeslotsVariable`, typed form pages, `teamId`/`extensionBundleId`/`appIconSlot`, `storeRegion`, `videoUrl`, `itemsVariable`) and rewrite `fieldsFromDefinition`/`definitionFromFields` to read and write the real shapes. Always emit `itemSchema` (defaulting to `null`), and never emit `body` on a canonical `quick_reply` block.
3. `src/components/amb/template-fields/FieldEditors.tsx` — per-kind editors updated to the new fields; variables editor gains item-schema select and loses `number`.
4. `src/components/amb/TemplateWizard.tsx` — remove the mode toggle (derive it), extend the type selector with App Clip rich link, keep the Describe examples, AI create/review, JSON view, validation gate, asset bindings, and diagnostics working against the new shapes. The rich-link conversion action keeps working and now targets the native `rich_link` content.
5. `src/components/amb/TemplatePreview.tsx` and `src/lib/template-examples.ts` — update to the new field names and add App Clip examples.
6. AI drafting rules (server-side template prompt) — teach the model the two-mode schema explicitly: canonical is text/quick_reply only, everything else is native AMB `content` with `kind`, and every variable needs `itemSchema`.
7. Verify: typecheck/build, then walk the wizard for each type in the preview and confirm a save/publish round trip succeeds instead of 400ing.
