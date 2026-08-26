// Client-safe types for the data-source mapping layer: where each template
// variable's value comes from, and what a resolved lookup looks like.

export type SourceKind =
  | "customer"
  | "appointment"
  | "availability"
  | "conversation"
  | "response"
  | "literal"
  | "ai"
  | "manual";

export type VariableMapping = {
  templateId: string;
  variableName: string;
  sourceKind: SourceKind;
  sourcePath: string | null;
  literalValue: string | null;
  fallbackKind: "ai" | "manual";
};

export type DataSourceSettings = {
  appointmentObject: string;
  appointmentStartField: string;
  appointmentEndField: string;
  appointmentSubjectField: string;
  appointmentContactField: string;
  businessStartHour: number;
  businessEndHour: number;
  slotMinutes: number;
  daysAhead: number;
  slotsOffered: number;
};

export const DEFAULT_SETTINGS: DataSourceSettings = {
  appointmentObject: "Event",
  appointmentStartField: "StartDateTime",
  appointmentEndField: "EndDateTime",
  appointmentSubjectField: "Subject",
  appointmentContactField: "WhoId",
  businessStartHour: 9,
  businessEndHour: 17,
  slotMinutes: 30,
  daysAhead: 5,
  slotsOffered: 4,
};

export type CustomerRecord = {
  id: string;
  firstName: string;
  lastName: string;
  email: string;
  phone: string;
  company: string;
};

export type AppointmentRecord = {
  id: string;
  subject: string;
  /** Apple time format: YYYY-MM-DDTHH:mm±HHMM */
  startTime: string;
  endTime: string;
};

export type TimeslotRecord = { id: string; startTime: string; durationSeconds: number };

export type CaseRecord = {
  id: string;
  caseNumber: string;
  subject: string;
  status: string;
  priority: string;
};

export type ResolvedContext = {
  /** Which implementation answered. */
  source: "salesforce" | "demo";
  customer: CustomerRecord | null;
  appointments: AppointmentRecord[];
  availability: TimeslotRecord[];
  cases: CaseRecord[];
  notes: string[];
};

export type ResolvedVariable = {
  name: string;
  /** JSON-encoded so it survives the server-function boundary. */
  valueJson: string;
  /** Human label for where the value came from. */
  origin: string;
};

/** Field paths a mapping can point at, per source kind. */
export const SOURCE_PATHS: Record<SourceKind, { path: string; label: string; kinds: string[] }[]> = {
  customer: [
    { path: "firstName", label: "First name", kinds: ["text"] },
    { path: "lastName", label: "Last name", kinds: ["text"] },
    { path: "fullName", label: "Full name", kinds: ["text"] },
    { path: "email", label: "Email", kinds: ["text"] },
    { path: "phone", label: "Mobile phone", kinds: ["text"] },
    { path: "company", label: "Company / account", kinds: ["text"] },
    { path: "caseNumber", label: "Latest case number", kinds: ["text"] },
    { path: "caseSubject", label: "Latest case subject", kinds: ["text"] },
  ],
  appointment: [
    { path: "next.subject", label: "Next appointment title", kinds: ["text"] },
    { path: "next.startTime", label: "Next appointment start", kinds: ["datetime", "text"] },
    { path: "next.endTime", label: "Next appointment end", kinds: ["datetime", "text"] },
    { path: "list", label: "Appointments as list items", kinds: ["list_picker_item"] },
  ],
  availability: [
    { path: "timeslots", label: "Open timeslots", kinds: ["timeslot"] },
    { path: "list", label: "Open times as list items", kinds: ["list_picker_item"] },
  ],
  conversation: [
    { path: "firstName", label: "First name", kinds: ["text"] },
    { path: "lastName", label: "Last name", kinds: ["text"] },
    { path: "fullName", label: "Full name", kinds: ["text"] },
    { path: "channelAddress", label: "Channel address", kinds: ["text"] },
  ],
  // Reply fields are discovered from real inbound messages, so options are
  // supplied by the UI catalog instead of a fixed list.
  response: [],
  literal: [],
  ai: [],
  manual: [],
};

export const SOURCE_LABELS: Record<SourceKind, string> = {
  customer: "Customer record",
  appointment: "Appointments",
  availability: "Availability",
  conversation: "Conversation",
  response: "Customer reply",
  literal: "Fixed value",
  ai: "Lovable AI",
  manual: "Fill in manually",
};

/** Which source kinds can supply a variable of this shape. */
export function compatibleSources(
  type: string,
  itemSchema: "list_picker_item" | "timeslot" | null,
): SourceKind[] {
  const target = type === "collection" ? (itemSchema ?? "list_picker_item") : type;
  const kinds: SourceKind[] = [];
  for (const kind of ["customer", "appointment", "availability", "conversation"] as SourceKind[]) {
    if (SOURCE_PATHS[kind].some((option) => option.kinds.includes(target))) kinds.push(kind);
  }
  kinds.push("response");
  if (type !== "collection") kinds.push("literal");
  kinds.push("ai", "manual");
  return kinds;
}

/** Paths for one source kind that fit a variable of this shape. */
export function pathsFor(
  kind: SourceKind,
  type: string,
  itemSchema: "list_picker_item" | "timeslot" | null,
): { path: string; label: string }[] {
  const target = type === "collection" ? (itemSchema ?? "list_picker_item") : type;
  return SOURCE_PATHS[kind]
    .filter((option) => option.kinds.includes(target))
    .map(({ path, label }) => ({ path, label }));
}
