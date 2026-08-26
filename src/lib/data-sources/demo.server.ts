// Demo customer/scheduling data, used until Salesforce is connected or when a
// lookup finds nothing. Shapes match the Salesforce implementation exactly.
import { buildAvailability, toAppleUtc } from "./slots";
import type {
  AppointmentRecord,
  CaseRecord,
  CustomerRecord,
  DataSourceSettings,
  TimeslotRecord,
} from "./types";

export type ConversationSeed = {
  id: string;
  firstName: string | null;
  lastName: string | null;
  channelAddress: string | null;
};

export function demoCustomer(seed: ConversationSeed): CustomerRecord {
  const firstName = seed.firstName?.trim() || "Alex";
  const lastName = seed.lastName?.trim() || "Rivera";
  return {
    id: `demo-${seed.id.slice(0, 8)}`,
    firstName,
    lastName,
    email: `${firstName}.${lastName}`.toLowerCase().replace(/\s+/g, "") + "@example.com",
    phone: seed.channelAddress?.trim() || "+15555550123",
    company: "Northwind Retail",
  };
}

export function demoAppointments(settings: DataSourceSettings, now = new Date()): AppointmentRecord[] {
  const start = new Date(
    Date.UTC(
      now.getUTCFullYear(),
      now.getUTCMonth(),
      now.getUTCDate() + 2,
      settings.businessStartHour + 1,
      0,
    ),
  );
  const end = new Date(start.getTime() + settings.slotMinutes * 60_000);
  return [
    {
      id: "demo-appt-1",
      subject: "Device setup consultation",
      startTime: toAppleUtc(start),
      endTime: toAppleUtc(end),
    },
  ];
}

export function demoAvailability(
  settings: DataSourceSettings,
  now = new Date(),
): TimeslotRecord[] {
  return buildAvailability(settings, [], now);
}

export function demoCases(): CaseRecord[] {
  return [
    {
      id: "demo-case-1",
      caseNumber: "00001042",
      subject: "Screen replacement follow-up",
      status: "Working",
      priority: "Medium",
    },
  ];
}
