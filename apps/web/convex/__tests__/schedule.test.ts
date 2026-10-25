import { describe, expect, it } from "vitest";
import type { Config, ScheduleEntry } from "../../shared/types";
import {
  arrivalDelayMinutes,
  departureDeltaMinutes,
  flagsFor,
  matchEntry,
  nextExpectedEntry,
  runningLateMinutes,
} from "../lib/schedule";

const DATE = "2026-11-16"; // a Monday
const t = (hhmm: string) => Date.parse(`${DATE}T${hhmm}:00Z`); // Dakar = UTC

const config: Config = {
  timezone: "Africa/Dakar",
  serviceHours: [{ days: [1, 2, 3, 4, 5], start: "06:30", end: "22:00" }],
  lateGraceMinutes: 2,
  signalLostAfterSeconds: 300,
  staleAfterSeconds: 120,
  maxAccuracyMeters: 50,
  pingRetentionDays: 30,
  matchWindowMinutes: 45,
  stopSpeedThreshold: 2,
  restConfirmPings: 2,
  outOfServiceReasons: [],
};

const E = (id: string, sequence: number, stopId: string, arriveBy?: string, departAt?: string): ScheduleEntry => ({
  _id: id,
  itineraryId: "it1",
  sequence,
  stopId,
  arriveBy,
  departAt,
});

// A loop that visits Wardini twice.
const entries = [
  E("e1", 1, "WARDINI", "08:00", "08:05"),
  E("e2", 2, "SCHOOL", "08:15", "08:20"),
  E("e3", 3, "CAFETERIA", "08:25", "08:27"),
  E("e4", 4, "WARDINI", "08:35", "08:40"),
];
const [e1] = entries as [ScheduleEntry, ...ScheduleEntry[]];

describe("matchEntry — sequence-forward (ADR 0001)", () => {
  it("on time: arrival at the expected stop matches the pointer entry", () => {
    const { matched, skipped } = matchEntry("WARDINI", t("08:00"), DATE, entries, "e1", new Set(), config);
    expect(matched?._id).toBe("e1");
    expect(skipped).toEqual([]);
  });

  it("late: binds to the visit it was attempting, not the nearest-in-time later visit", () => {
    const { matched } = matchEntry("WARDINI", t("08:12"), DATE, entries, "e1", new Set(), config);
    expect(matched?._id).toBe("e1"); // NOT e4
    expect(arrivalDelayMinutes(matched!, t("08:12"), DATE)).toBe(12); // lateness preserved
  });

  it("skip: arriving downstream auto-advances and reports the skipped entries", () => {
    const { matched, skipped } = matchEntry("SCHOOL", t("08:15"), DATE, entries, "e1", new Set(), config);
    expect(matched?._id).toBe("e2");
    expect(skipped.map((e) => e._id)).toEqual(["e1"]); // e1 → undetected
  });

  it("repeated stop: the second Wardini maps to e4 once e1 is visited", () => {
    const { matched } = matchEntry("WARDINI", t("08:35"), DATE, entries, "e4", new Set(["e1", "e2", "e3"]), config);
    expect(matched?._id).toBe("e4");
  });

  it("no pointer (start of day): matches the earliest unvisited entry for the stop", () => {
    const { matched } = matchEntry("WARDINI", t("08:00"), DATE, entries, undefined, new Set(), config);
    expect(matched?._id).toBe("e1");
  });

  it("sanity guard: an arrival absurdly far from its slot is unscheduled (matched null)", () => {
    const { matched } = matchEntry("WARDINI", t("12:00"), DATE, entries, "e1", new Set(), config);
    expect(matched).toBeNull();
  });
});

describe("delays", () => {
  it("arrivalDelayMinutes positive when late, null when untimetabled", () => {
    expect(arrivalDelayMinutes(e1, t("08:07"), DATE)).toBe(7);
    expect(arrivalDelayMinutes(E("x", 1, "WARDINI"), t("08:07"), DATE)).toBeNull();
  });
  it("departureDeltaMinutes negative when early", () => {
    expect(departureDeltaMinutes(e1, t("08:02"), DATE)).toBe(-3);
  });
});

describe("flagsFor — departAt is a no-earlier-than floor", () => {
  it("on-time arrival, early departure → early_departure", () => {
    expect(flagsFor(e1, { arrivedAt: t("08:00"), arrivalDelayMinutes: 0, departedAt: t("08:02"), departureDeltaMinutes: -3 }, config)).toEqual(["early_departure"]);
  });
  it("late arrival, early departure → late only (no early_departure)", () => {
    expect(flagsFor(e1, { arrivedAt: t("08:10"), arrivalDelayMinutes: 10, departedAt: t("08:02"), departureDeltaMinutes: -3 }, config)).toEqual(["late"]);
  });
  it("no arrival seen → undetected", () => {
    expect(flagsFor(e1, { arrivedAt: null }, config)).toEqual(["undetected"]);
  });
  it("arrival with no matching entry → unscheduled", () => {
    expect(flagsFor(null, { arrivedAt: t("08:00") }, config)).toEqual(["unscheduled"]);
  });
  it("closed without a departure → departure_unknown", () => {
    expect(flagsFor(e1, { arrivedAt: t("08:00"), arrivalDelayMinutes: 0, departedAt: null }, config)).toEqual(["departure_unknown"]);
  });
});

describe("nextExpectedEntry — anchor by scheduled time", () => {
  it("late start skips past the stop whose slot already elapsed", () => {
    expect(nextExpectedEntry(entries, new Set(), t("08:12"), DATE, config)?._id).toBe("e2");
  });
  it("all slots past → falls back to the earliest unvisited", () => {
    expect(nextExpectedEntry(entries, new Set(), t("09:30"), DATE, config)?._id).toBe("e1");
  });
  it("timetable-less itinerary anchors by sequence", () => {
    const loose = [E("a", 1, "WARDINI"), E("b", 2, "SCHOOL")];
    expect(nextExpectedEntry(loose, new Set(), t("08:12"), DATE, config)?._id).toBe("a");
  });
});

describe("runningLateMinutes", () => {
  it("late once past arriveBy + grace", () => {
    expect(runningLateMinutes(e1, t("08:10"), DATE, config)).toBe(10);
  });
  it("not late within grace", () => {
    expect(runningLateMinutes(e1, t("08:01"), DATE, config)).toBeNull();
  });
});
