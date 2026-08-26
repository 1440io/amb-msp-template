// Salesforce reads through the Lovable connector gateway. Server-only: the
// connector key and LOVABLE_API_KEY never reach the browser.
import { buildAvailability, toAppleUtc } from "./slots";
import type {
  AppointmentRecord,
  CaseRecord,
  CustomerRecord,
  DataSourceSettings,
  TimeslotRecord,
} from "./types";

const GATEWAY_URL = "https://connector-gateway.lovable.dev/salesforce";
const SAFE_NAME = /^[A-Za-z][A-Za-z0-9_]{0,60}$/;

export function salesforceConfigured(): boolean {
  return Boolean(process.env["LOVABLE_API_KEY"] && process.env["SALESFORCE_API_KEY"]);
}

/** Escape a value for a SOQL string literal. */
function soqlLiteral(value: string): string {
  return `'${value.replace(/\\/g, "\\\\").replace(/'/g, "\\'")}'`;
}

function safeField(name: string, fallback: string): string {
  return SAFE_NAME.test(name) ? name : fallback;
}

async function soql<T>(query: string): Promise<{ records: T[] } | { error: string }> {
  const lovableKey = process.env["LOVABLE_API_KEY"];
  const connectorKey = process.env["SALESFORCE_API_KEY"];
  if (!lovableKey || !connectorKey) return { error: "Salesforce is not connected." };

  let response: Response;
  try {
    response = await fetch(`${GATEWAY_URL}/query?q=${encodeURIComponent(query)}`, {
      method: "GET",
      headers: {
        Authorization: `Bearer ${lovableKey}`,
        "X-Connection-Api-Key": connectorKey,
        Accept: "application/json",
      },
    });
  } catch (error) {
    return { error: error instanceof Error ? error.message : "Salesforce request failed." };
  }

  if (!response.ok) {
    const body = await response.text().catch(() => "");
    console.error(`Salesforce gateway failed [${response.status}]: ${body}`);
    return { error: `Salesforce request failed (${response.status}): ${body.slice(0, 300)}` };
  }

  const data = (await response.json()) as { records?: T[] };
  return { records: data.records ?? [] };
}

/** Last 10 digits, so +1 555 555 0123 matches 5555550123 in any format. */
function digits(value: string): string {
  return value.replace(/\D/g, "").slice(-10);
}

type ContactRow = {
  Id: string;
  FirstName: string | null;
  LastName: string | null;
  Email: string | null;
  MobilePhone: string | null;
  Phone: string | null;
  Account?: { Name?: string | null } | null;
};

export async function salesforceContact(input: {
  phone: string | null;
  firstName: string | null;
  lastName: string | null;
}): Promise<{ customer: CustomerRecord | null; note?: string }> {
  const fields = "Id, FirstName, LastName, Email, MobilePhone, Phone, Account.Name";
  const phoneDigits = input.phone ? digits(input.phone) : "";

  if (phoneDigits.length >= 7) {
    const like = soqlLiteral(`%${phoneDigits}%`);
    const result = await soql<ContactRow>(
      `SELECT ${fields} FROM Contact WHERE MobilePhone LIKE ${like} OR Phone LIKE ${like} LIMIT 1`,
    );
    if ("error" in result) return { customer: null, note: result.error };
    const row = result.records[0];
    if (row) return { customer: mapContact(row) };
  }

  if (input.lastName?.trim()) {
    const conditions = [`LastName = ${soqlLiteral(input.lastName.trim())}`];
    if (input.firstName?.trim()) {
      conditions.push(`FirstName = ${soqlLiteral(input.firstName.trim())}`);
    }
    const result = await soql<ContactRow>(
      `SELECT ${fields} FROM Contact WHERE ${conditions.join(" AND ")} LIMIT 1`,
    );
    if ("error" in result) return { customer: null, note: result.error };
    const row = result.records[0];
    if (row) return { customer: mapContact(row) };
  }

  return { customer: null, note: "No matching Salesforce contact." };
}

function mapContact(row: ContactRow): CustomerRecord {
  return {
    id: row.Id,
    firstName: row.FirstName ?? "",
    lastName: row.LastName ?? "",
    email: row.Email ?? "",
    phone: row.MobilePhone ?? row.Phone ?? "",
    company: row.Account?.Name ?? "",
  };
}

function toApple(value: string | null): string {
  if (!value) return "";
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? "" : toAppleUtc(date);
}

export async function salesforceAppointments(
  settings: DataSourceSettings,
  contactId: string | null,
): Promise<{ appointments: AppointmentRecord[]; note?: string }> {
  const object = safeField(settings.appointmentObject, "Event");
  const startField = safeField(settings.appointmentStartField, "StartDateTime");
  const endField = safeField(settings.appointmentEndField, "EndDateTime");
  const subjectField = safeField(settings.appointmentSubjectField, "Subject");
  const contactField = safeField(settings.appointmentContactField, "WhoId");

  const where = [`${startField} >= TODAY`];
  if (contactId) where.push(`${contactField} = ${soqlLiteral(contactId)}`);

  const result = await soql<Record<string, string | null>>(
    `SELECT Id, ${subjectField}, ${startField}, ${endField} FROM ${object} WHERE ${where.join(
      " AND ",
    )} ORDER BY ${startField} ASC LIMIT 10`,
  );
  if ("error" in result) return { appointments: [], note: result.error };

  return {
    appointments: result.records.map((row, index) => ({
      id: typeof row["Id"] === "string" ? row["Id"] : `appt-${index + 1}`,
      subject: row[subjectField] ?? "Appointment",
      startTime: toApple(row[startField] ?? null),
      endTime: toApple(row[endField] ?? null),
    })),
  };
}

/** Open slots = business hours minus everything already booked. */
export async function salesforceAvailability(
  settings: DataSourceSettings,
  now = new Date(),
): Promise<{ availability: TimeslotRecord[]; note?: string }> {
  const object = safeField(settings.appointmentObject, "Event");
  const startField = safeField(settings.appointmentStartField, "StartDateTime");
  const endField = safeField(settings.appointmentEndField, "EndDateTime");

  const result = await soql<Record<string, string | null>>(
    `SELECT ${startField}, ${endField} FROM ${object} WHERE ${startField} >= TODAY AND ${startField} <= NEXT_N_DAYS:${Math.max(
      1,
      Math.min(30, settings.daysAhead),
    )} LIMIT 200`,
  );
  if ("error" in result) return { availability: [], note: result.error };

  const busy = result.records.flatMap((row) => {
    const start = new Date(row[startField] ?? "");
    const end = new Date(row[endField] ?? "");
    if (Number.isNaN(start.getTime()) || Number.isNaN(end.getTime())) return [];
    return [{ start, end }];
  });

  return { availability: buildAvailability(settings, busy, now) };
}

export async function salesforceCases(
  contactId: string | null,
): Promise<{ cases: CaseRecord[]; note?: string }> {
  if (!contactId) return { cases: [] };
  const result = await soql<{
    Id: string;
    CaseNumber: string | null;
    Subject: string | null;
    Status: string | null;
    Priority: string | null;
  }>(
    `SELECT Id, CaseNumber, Subject, Status, Priority FROM Case WHERE ContactId = ${soqlLiteral(
      contactId,
    )} ORDER BY CreatedDate DESC LIMIT 5`,
  );
  if ("error" in result) return { cases: [], note: result.error };
  return {
    cases: result.records.map((row) => ({
      id: row.Id,
      caseNumber: row.CaseNumber ?? "",
      subject: row.Subject ?? "",
      status: row.Status ?? "",
      priority: row.Priority ?? "",
    })),
  };
}
