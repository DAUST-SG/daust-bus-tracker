import type { Config, HHmm, ISODate } from "../../shared/types";

// Africa/Dakar is UTC+0 all year with no DST, so Dakar wall-clock time is UTC.
// Revisit only if the service ever runs in another timezone.

/** Service day (Africa/Dakar calendar date) of an instant. */
export function dakarDate(ms: number): ISODate {
  return new Date(ms).toISOString().slice(0, 10);
}

/** Instant of a Dakar wall-clock time on a given service day. */
export function hhmmToMs(date: ISODate, hhmm: HHmm): number {
  return Date.parse(`${date}T${hhmm}:00Z`);
}

/** 1 = Monday … 7 = Sunday, matching config.serviceHours.days and itinerary.daysOfWeek. */
export function isoWeekday(ms: number): number {
  return new Date(ms).getUTCDay() || 7;
}

/** True when `ms` falls inside any service-hours window for its weekday (end exclusive). */
export function isWithinServiceHours(ms: number, config: Pick<Config, "serviceHours">): boolean {
  const date = dakarDate(ms);
  const day = isoWeekday(ms);
  return config.serviceHours.some(
    (w) => w.days.includes(day) && ms >= hhmmToMs(date, w.start) && ms < hhmmToMs(date, w.end),
  );
}
