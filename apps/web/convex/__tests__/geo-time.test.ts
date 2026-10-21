import { describe, expect, it } from "vitest";
import { haversineMeters, impliedSpeedMps } from "../lib/geo";
import { dakarDate, hhmmToMs, isoWeekday, isWithinServiceHours } from "../lib/time";

describe("geo", () => {
  it("measures 0.001° of latitude as ~111 m", () => {
    expect(haversineMeters({ lat: 14.7, lng: -17.4 }, { lat: 14.701, lng: -17.4 })).toBeCloseTo(111.2, 0);
  });

  it("computes speed and guards non-increasing time", () => {
    const a = { lat: 14.7, lng: -17.4, recordedAt: 0 };
    const b = { lat: 14.701, lng: -17.4, recordedAt: 10_000 };
    expect(impliedSpeedMps(a, b)).toBeCloseTo(11.1, 1);
    expect(impliedSpeedMps(b, a)).toBe(0);
  });
});

describe("time (Africa/Dakar = UTC+0, no DST)", () => {
  const config = { serviceHours: [{ days: [1, 2, 3, 4, 5], start: "06:30", end: "22:00" }] };

  it("converts between instants and service-day wall clock", () => {
    const ms = hhmmToMs("2026-10-21", "14:05");
    expect(new Date(ms).toISOString()).toBe("2026-10-21T14:05:00.000Z");
    expect(dakarDate(ms)).toBe("2026-10-21");
  });

  it("numbers weekdays Monday=1 … Sunday=7", () => {
    expect(isoWeekday(hhmmToMs("2026-10-19", "12:00"))).toBe(1); // Monday
    expect(isoWeekday(hhmmToMs("2026-10-25", "12:00"))).toBe(7); // Sunday
  });

  it("checks service hours by weekday and window (end exclusive)", () => {
    expect(isWithinServiceHours(hhmmToMs("2026-10-21", "06:30"), config)).toBe(true);
    expect(isWithinServiceHours(hhmmToMs("2026-10-21", "06:29"), config)).toBe(false);
    expect(isWithinServiceHours(hhmmToMs("2026-10-21", "22:00"), config)).toBe(false);
    expect(isWithinServiceHours(hhmmToMs("2026-10-25", "12:00"), config)).toBe(false); // Sunday
  });
});
