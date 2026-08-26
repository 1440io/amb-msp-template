# Example prompts in the wizard's Describe step

Add a set of ready-made example descriptions to step 2 (Describe) so you can start from a realistic prompt instead of a blank box.

## Behavior

- Under the description textarea, show a short list of example prompts as clickable chips/rows.
- The examples shown match the message type picked in Basics (quick reply examples for quick reply, form examples for form, etc.), so they are always relevant.
- Clicking an example fills the textarea with its full text. Clicking another replaces it. The text stays fully editable, and "Draft with AI" works exactly as it does now.
- A small "Shuffle"/"More examples" affordance is not included; each type gets 3 curated examples plus 2 generic ones that work for any type.

## Examples per type (3 each)

- Text: appointment reminder with customer name and time; order shipped with tracking number; store closure notice.
- Quick reply: confirm or reschedule an appointment; rate a recent support chat; choose pickup or delivery.
- List picker: pick a service from grouped categories; choose a store location; select topics of interest (multi-select).
- Time picker: offer three appointment slots for next week; schedule a callback; book a test drive.
- Form: collect name, email, and issue description; warranty claim with order number and photo; new-patient intake across two pages.
- iMessage app: open a seat-picker app for a booking; launch a loyalty card app; open a payment app for an invoice.
- Rich link: link to an order tracking page with a hero image; product page with price; blog post announcement.

Generic examples appended for every type: "Business-initiated welcome message with the customer's first name" and "Post-purchase follow-up asking if everything arrived as expected".

## Technical notes

- Examples live in a new client-only constant map in `src/lib/template-fields.ts` (or a small `src/lib/template-examples.ts`), keyed by `RawMessageType`.
- Step 1 of `src/components/amb/TemplateWizard.tsx` renders the chips and sets `prompt` on click; no server, schema, or AI-prompt changes.
