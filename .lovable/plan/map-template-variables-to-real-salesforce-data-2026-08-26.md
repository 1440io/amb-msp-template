# Map template variables to real Salesforce data

Today a template's variables are typed (text, url, datetime, collection of list items or timeslots) and filled either by hand or by an AI guess from the conversation. This adds a real mapping layer: each variable declares *where its value comes from*, and a Salesforce-backed data source resolves it at send time.

## How it works

```text
Conversation (phone / name)
        |
   [ Contact match ]  -> Salesforce Contact
        |
   [ Data source ]    -> customer fields, upcoming appointments, open cases, availability slots
        |
   [ Variable mapping ] per template: variable -> field path (e.g. contact.firstName, appointments[0].startTime, availability.timeslots)
        |
   Inbox composer prefills real values (editable) -> AI only fills what has no mapping
```

Three pieces:

1. **Data source layer** — one server-side interface (`resolveCustomer`, `listAppointments`, `listAvailability`, `listCases`) with two implementations: a Salesforce one and a demo one used until Salesforce is connected or when a lookup misses. Nothing in the UI knows which one answered.
2. **Variable mappings** — per template, per variable, a stored binding to a data path plus an optional fallback (literal, or "ask AI", or "manual"). Editable in the template wizard's Review step and in a new mapping panel on the template row.
3. **Resolution at compose time** — opening the rich-template tab in the Inbox resolves mapped variables from live data, shows the source of each value ("from Salesforce Contact", "demo data", "AI suggestion"), and leaves every field editable. Nothing auto-sends.

## Salesforce specifics

Uses the workspace Salesforce connector (one org for the whole app, called only from the server). Planned reads:

- **Contact** matched by mobile phone from the conversation address, falling back to first/last name: `Id, FirstName, LastName, Email, MobilePhone, Account.Name`.
- **Appointments** — Salesforce has no single standard object here, so this is configurable: default to `Event` (`Subject, StartDateTime, EndDateTime, WhoId`) for scheduling, with an optional custom-object/field override in Setup so an org using `ServiceAppointment` or a custom object can point at it without code changes.
- **Cases** — `CaseNumber, Subject, Status, Priority` for the customer, used for text variables like a case reference.
- **Availability** — derived: take a configurable business-hours window and subtract existing `Event` rows for the assigned owner, producing timeslot collections shaped exactly like the template `timeslot` itemSchema (`id`, Apple `startTime`, `durationSeconds`).

All Salesforce traffic goes through the connector gateway from server functions; no credential ever reaches the browser. If the connector isn't linked, everything still works on demo data and the UI says so.

## What you'll see

- **Setup** gains a "Data sources" card: Salesforce connection status, appointment-object configuration, business-hours/slot-length settings, and a "Test lookup" button that resolves a phone number end to end and shows the raw result.
- **Templates** gains a "Map variables" panel per template: each variable lists a source dropdown (Salesforce contact field / appointment field / availability / conversation / literal / AI / manual), with type-compatible options only (a `timeslot` collection can only bind to availability or appointments).
- **Inbox rich-template tab** prefills mapped variables on template selection, badges each value with its origin, offers "Refresh from Salesforce", and keeps the existing AI suggestion for anything unmapped.

## Technical notes

- New table `template_variable_mappings` (template id, variable name, source kind, source path, fallback kind, literal value) with RLS for authenticated agents, plus a `data_source_settings` table for the appointment-object/business-hours configuration. Both get GRANTs in the same migration.
- New `src/lib/data-sources/` module: `types.ts` (the interface + resolved-context shape), `salesforce.server.ts` (SOQL through `https://connector-gateway.lovable.dev/salesforce`, validated ids, no raw input in SOQL), `demo.server.ts`, and `resolve.server.ts` (contact match + variable resolution, including Apple datetime formatting and timeslot shaping).
- New server functions in `src/lib/data-sources.functions.ts`: `resolveTemplateVariables`, `testCustomerLookup`, `saveVariableMappings`, `saveDataSourceSettings` — all behind `requireSupabaseAuth`.
- The Inbox composer keeps its current send path unchanged; resolution only changes how values are prefilled. AI suggestions become the fallback for unmapped variables instead of the primary source.
- Salesforce failures degrade: the composer shows the error inline, falls back to demo/AI values, and never blocks sending.

## Setup step required from you

Linking the Salesforce connector (an in-chat card, choose Production for a Developer Edition or production org). I'll open it as the first step of the build.
