// Resolves a conversation into customer/appointment/availability context, then
// maps that context onto a template's declared variables.
import {
  demoAppointments,
  demoAvailability,
  demoCases,
  demoCustomer,
  type ConversationSeed,
} from "./demo.server";
import {
  salesforceAppointments,
  salesforceAvailability,
  salesforceCases,
  salesforceConfigured,
  salesforceContact,
} from "./salesforce.server";
import { appleToDate } from "./slots";
import {
  SOURCE_LABELS,
  type DataSourceSettings,
  type ResolvedContext,
  type ResolvedVariable,
  type VariableMapping,
} from "./types";

export type VariableSpec = {
  name: string;
  type: string;
  required: boolean;
  itemSchema: "list_picker_item" | "timeslot" | null;
};

/** Look the customer and their schedule up, falling back to demo data. */
export async function resolveContext(
  seed: ConversationSeed,
  settings: DataSourceSettings,
): Promise<ResolvedContext> {
  const notes: string[] = [];

  if (!salesforceConfigured()) {
    notes.push("Salesforce is not connected — using demo data.");
    return demoContext(seed, settings, notes);
  }

  const contact = await salesforceContact({
    phone: seed.channelAddress,
    firstName: seed.firstName,
    lastName: seed.lastName,
  });
  if (contact.note) notes.push(contact.note);
  if (!contact.customer) {
    notes.push("Falling back to demo data for this customer.");
    return demoContext(seed, settings, notes);
  }

  const [appointments, availability, cases] = await Promise.all([
    salesforceAppointments(settings, contact.customer.id),
    salesforceAvailability(settings),
    salesforceCases(contact.customer.id),
  ]);
  for (const note of [appointments.note, availability.note, cases.note]) {
    if (note) notes.push(note);
  }

  return {
    source: "salesforce",
    customer: contact.customer,
    appointments: appointments.appointments,
    availability: availability.availability,
    cases: cases.cases,
    notes,
  };
}

function demoContext(
  seed: ConversationSeed,
  settings: DataSourceSettings,
  notes: string[],
): ResolvedContext {
  return {
    source: "demo",
    customer: demoCustomer(seed),
    appointments: demoAppointments(settings),
    availability: demoAvailability(settings),
    cases: demoCases(),
    notes,
  };
}

function formatSlotLabel(startTime: string): string {
  const date = appleToDate(startTime);
  if (!date) return startTime;
  return date.toLocaleString("en-US", {
    weekday: "short",
    month: "short",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit",
    timeZone: "UTC",
  });
}

function valueForMapping(
  mapping: VariableMapping,
  spec: VariableSpec,
  context: ResolvedContext,
  seed: ConversationSeed,
): unknown {
  const path = mapping.sourcePath ?? "";
  switch (mapping.sourceKind) {
    case "literal":
      return mapping.literalValue ?? "";
    case "conversation": {
      const first = seed.firstName?.trim() ?? "";
      const last = seed.lastName?.trim() ?? "";
      if (path === "firstName") return first;
      if (path === "lastName") return last;
      if (path === "fullName") return [first, last].filter(Boolean).join(" ");
      if (path === "channelAddress") return seed.channelAddress ?? "";
      return "";
    }
    case "customer": {
      const customer = context.customer;
      if (!customer) return "";
      if (path === "fullName") {
        return [customer.firstName, customer.lastName].filter(Boolean).join(" ");
      }
      if (path === "caseNumber") return context.cases[0]?.caseNumber ?? "";
      if (path === "caseSubject") return context.cases[0]?.subject ?? "";
      return (customer as unknown as Record<string, string>)[path] ?? "";
    }
    case "appointment": {
      const next = context.appointments[0];
      if (path === "list") {
        return context.appointments.map((appointment, index) => ({
          id: appointment.id || `appt-${index + 1}`,
          title: appointment.subject || "Appointment",
          subtitle: appointment.startTime ? formatSlotLabel(appointment.startTime) : "",
        }));
      }
      if (!next) return "";
      if (path === "next.subject") return next.subject;
      if (path === "next.startTime") return next.startTime;
      if (path === "next.endTime") return next.endTime;
      return "";
    }
    case "availability": {
      if (path === "list") {
        return context.availability.map((slot) => ({
          id: slot.id,
          title: formatSlotLabel(slot.startTime),
          subtitle: `${Math.round(slot.durationSeconds / 60)} min`,
        }));
      }
      return context.availability;
    }
    default:
      return undefined;
  }
}

function isEmpty(value: unknown): boolean {
  if (value === undefined || value === null) return true;
  if (Array.isArray(value)) return value.length === 0;
  return typeof value === "string" && value.trim().length === 0;
}

/** Resolve every mapped variable; unmapped ones are left to AI or the agent. */
export async function resolveVariables(input: {
  seed: ConversationSeed;
  settings: DataSourceSettings;
  specs: VariableSpec[];
  mappings: VariableMapping[];
}): Promise<{
  context: ResolvedContext;
  resolved: ResolvedVariable[];
  /** Variables with no mapped value — the AI/manual fallback set. */
  unresolved: string[];
}> {
  const mapped = input.mappings.filter(
    (mapping) => mapping.sourceKind !== "ai" && mapping.sourceKind !== "manual",
  );
  const needsLookup = mapped.some(
    (mapping) => mapping.sourceKind !== "literal" && mapping.sourceKind !== "conversation",
  );

  const context = needsLookup
    ? await resolveContext(input.seed, input.settings)
    : {
        source: "demo" as const,
        customer: null,
        appointments: [],
        availability: [],
        cases: [],
        notes: [],
      };

  const resolved: ResolvedVariable[] = [];
  const unresolved: string[] = [];

  for (const spec of input.specs) {
    const mapping = mapped.find((entry) => entry.variableName === spec.name);
    if (!mapping) {
      unresolved.push(spec.name);
      continue;
    }
    const value = valueForMapping(mapping, spec, context, input.seed);
    if (isEmpty(value)) {
      unresolved.push(spec.name);
      continue;
    }
    const sourceLabel = SOURCE_LABELS[mapping.sourceKind];
    const origin =
      mapping.sourceKind === "literal" || mapping.sourceKind === "conversation"
        ? sourceLabel
        : `${sourceLabel} · ${context.source === "salesforce" ? "Salesforce" : "demo data"}`;
    resolved.push({ name: spec.name, valueJson: JSON.stringify(value), origin });
  }

  return { context, resolved, unresolved };
}
