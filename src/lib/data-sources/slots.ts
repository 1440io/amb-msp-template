// Pure helpers shared by the data-source implementations: Apple time formatting
// and business-hours slot generation.
import type { DataSourceSettings, TimeslotRecord } from "./types";

/** Apple's time format: no seconds, no colon in the offset. Always UTC here. */
export function toAppleUtc(date: Date): string {
  const pad = (value: number) => String(value).padStart(2, "0");
  return `${date.getUTCFullYear()}-${pad(date.getUTCMonth() + 1)}-${pad(date.getUTCDate())}T${pad(
    date.getUTCHours(),
  )}:${pad(date.getUTCMinutes())}+0000`;
}

export function appleToDate(value: string): Date | null {
  const match = /^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2})([+-])(\d{2})(\d{2})$/.exec(value);
  if (!match) {
    const loose = /^(\d{4}-\d{2}-\d{2}T\d{2}:\d{2})$/.exec(value);
    if (!loose) return null;
    const parsed = new Date(`${loose[1]}:00Z`);
    return Number.isNaN(parsed.getTime()) ? null : parsed;
  }
  const [, year, month, day, hour, minute, sign, offsetHours, offsetMinutes] = match;
  const base = Date.UTC(
    Number(year),
    Number(month) - 1,
    Number(day),
    Number(hour),
    Number(minute),
  );
  const offset = (Number(offsetHours) * 60 + Number(offsetMinutes)) * 60_000;
  return new Date(sign === "+" ? base - offset : base + offset);
}

/**
 * Free slots inside the configured business hours over the next `daysAhead`
 * days, skipping weekends and anything overlapping a busy interval.
 */
export function buildAvailability(
  settings: DataSourceSettings,
  busy: { start: Date; end: Date }[],
  now = new Date(),
): TimeslotRecord[] {
  const slots: TimeslotRecord[] = [];
  const durationMs = settings.slotMinutes * 60_000;
  for (let dayOffset = 0; dayOffset <= settings.daysAhead; dayOffset += 1) {
    const day = new Date(now.getTime() + dayOffset * 86_400_000);
    const weekday = day.getUTCDay();
    if (weekday === 0 || weekday === 6) continue;
    for (let hour = settings.businessStartHour; hour < settings.businessEndHour; ) {
      const start = new Date(
        Date.UTC(day.getUTCFullYear(), day.getUTCMonth(), day.getUTCDate(), hour, 0),
      );
      const minuteStep = settings.slotMinutes;
      for (let minute = 0; minute < 60 && slots.length < settings.slotsOffered; minute += minuteStep) {
        const slotStart = new Date(start.getTime() + minute * 60_000);
        const slotEnd = new Date(slotStart.getTime() + durationMs);
        if (slotStart.getTime() <= now.getTime() + 3_600_000) continue;
        if (slotEnd.getUTCHours() > settings.businessEndHour) continue;
        const clash = busy.some(
          (interval) => slotStart < interval.end && slotEnd > interval.start,
        );
        if (clash) continue;
        slots.push({
          id: `slot-${slots.length + 1}`,
          startTime: toAppleUtc(slotStart),
          durationSeconds: settings.slotMinutes * 60,
        });
      }
      if (slots.length >= settings.slotsOffered) return slots;
      hour += 1;
    }
  }
  return slots;
}
