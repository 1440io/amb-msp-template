# Template Wizard for /templates

Replace the single dense panel with a stepped wizard that builds template definitions from real form fields, shows a live Apple-style preview, and ends with Save draft or Save & publish. Works for both new templates and editing existing drafts.

## Steps

1. **Basics** — template name, message type (the same seven types as /raw: text, quick reply, list picker, time picker, form, iMessage app, rich link), and mode (Canonical or Channel-native AMB). Short plain-language explanation of the two modes inline.
2. **Describe (optional AI)** — free-text prompt with "Draft with AI" and "Review & fix", reusing the existing AI drafting function. AI output populates the structured fields, not just raw JSON.
3. **Build** — structured editors per type:
   - text: body
   - quick reply: summary text, body, 2–5 items (id + title) with add/remove and the 2–5 rule enforced inline
   - list picker: sections with title, multi-select toggle, items
   - time picker: title, received title, timeslots source/variable
   - form: pages with fields (id, title, type, required)
   - iMessage app: app name, url, received title
   - rich link: url, title, image slot
   Plus a variables editor (name, type, required) with a warning when a `{{variable}}` used in the content is not declared.
4. **Assets & review** — asset slot bindings (existing UI, with the asset library shown), full validation list, and the advanced JSON view (collapsible, editable; edits sync back into the fields when parseable).
5. **Finish** — Save draft, or Save & publish (draft creation followed by the publish lifecycle call). Failures keep the existing copyable debug panel.

## Live preview

A panel beside the wizard renders an Apple-style bubble for the current definition: message body, quick-reply chips, list picker rows/sections, time picker slots, form pages/fields, rich link card, and iMessage app card. `{{variables}}` render as sample values so the preview reads like a real message.

## Behavior details

- Editing an existing template infers type + mode from the stored definition (existing `inferTemplateShape`) and hydrates the structured fields from it. Anything the fields cannot represent stays available and editable in the JSON view, and is preserved on save.
- Changing type or mode reseeds from the existing skeletons, with a confirm prompt when the current content has been edited.
- Step navigation allows moving back freely; forward is blocked only by errors that make the step's own data invalid (missing name, unparseable JSON).
- All validation continues to run through `validateTemplateDefinition`, so Apple rules (outer `type` marker, hyphenated `quick-reply`, 2–5 items, Apple time format) stay in one place.
- Native mode keeps `{ mode, channel: "amb", content }` and canonical keeps `{ mode, variables, block }`; the structured fields write into the correct shape for the selected mode.

## Technical notes

- New `src/components/amb/TemplateWizard.tsx` (step shell + save/publish), `src/components/amb/template-fields/` (per-type field editors), and `src/components/amb/TemplatePreview.tsx`.
- New client-only helpers in `src/lib/template-definitions.ts` for definition to fields and fields to definition conversion per type and mode; no server or schema changes.
- `src/routes/_authenticated/templates.tsx` opens the wizard for both New template and Edit; the old `TemplateEditor.tsx` is removed once the wizard covers both paths.
- Reuses existing server functions: `draftTemplate`, `createTemplate`, `updateTemplate`, `templateLifecycle`, `listAssets`. No new credentials or endpoints.
