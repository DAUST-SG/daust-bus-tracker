import { describe, expect, it } from "vitest";
import type { Bus, BusStatus, Config, Itinerary, ScheduleEntry, Stop } from "../../shared/types";
import { deriveBusStatusView } from "../lib/status";

const DATE = "2026-11-16";
const t = (hhmm: string) => Date.parse(`${DATE}T${hhmm}:00Z`);

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

const bus: Bus = { _id: "b1", code: "BUS-1", name: "Bus 1", type: "large", isActive: true };
const itinerary: Itinerary = { _id: "it1", code: "BUS1-WEEKDAY", name: "Bus 1 — weekday loop", busIds: ["b1"], isTemporary: false, daysOfWeek: [1, 2, 3, 4, 5], isActive: true };

const stop = (code: string, name: string): Stop => ({ _id: code, code, name, type: "other", lat: 14.7, lng: -17.4, radiusMeters: 75, exitBufferMeters: 40, dwellSeconds: 20, isActive: true, updatedAt: 0 });
const stopsById = new Map([stop("WARDINI", "Wardini"), stop("SCHOOL", "School"), stop("CAFETERIA", "Cafeteria")].map((s) => [s._id, s]));

const E = (id: string, sequence: number, stopId: string, arriveBy?: string, departAt?: string): ScheduleEntry => ({ _id: id, itineraryId: "it1", sequence, stopId, arriveBy, departAt });
const entriesById = new Map([E("e1", 1, "WARDINI", "08:00", "08:05"), E("e2", 2, "SCHOOL", "08:15", "08:20")].map((e) => [e._id, e]));

const base: BusStatus = {
  _id: "s1",
  busId: "b1",
  shiftId: "sh1",
  itineraryId: "it1",
  serviceStatus: "in_service",
  motion: "active",
  connectivity: "live",
  geofence: { phase: "outside" },
  updatedAt: t("08:12"),
};
const make = (o: Partial<BusStatus>): BusStatus => ({ ...base, ...o });
const view = (status: BusStatus, now = t("08:12")) =>
  deriveBusStatusView({ bus, status, itinerary, stopsById, entriesById, now, config });

describe("deriveBusStatusView", () => {
  it("active, on time: composes a Left → Next label and shows position", () => {
    const v = view(make({ lastStopId: "WARDINI", lastDepartedAt: t("08:06"), nextEntryId: "e2", delayMinutes: 0, lat: 14.70, lng: -17.40, lastPingAt: t("08:12") }));
    expect(v.label).toBe("Left Wardini → School · on time");
    expect(v.connectivity).toBe("live");
    expect(v.position).not.toBeNull();
    expect(v.nextStop?.name).toBe("School");
  });

  it("signal_lost leaves serviceStatus intact and keeps last-known position", () => {
    const v = view(make({ motion: "holding", currentStopId: "SCHOOL", connectivity: "signal_lost", lat: 14.70, lng: -17.40, lastPingAt: t("08:06") }));
    expect(v.serviceStatus).toBe("in_service");
    expect(v.connectivity).toBe("signal_lost");
    expect(v.label).toBe("Holding at School · signal lost");
    expect(v.position).not.toBeNull();
  });

  it("stale is computed at read time from lastPingAt age", () => {
    const v = view(make({ nextEntryId: "e2", delayMinutes: 0, lastStopId: "WARDINI", lastDepartedAt: t("08:06"), lastPingAt: t("08:12") - 200_000 }));
    expect(v.connectivity).toBe("stale");
    expect(v.label).toContain("delayed update");
  });

  it("off_shift: no position, no stops, Not running", () => {
    const v = view(make({ serviceStatus: "off_shift", motion: undefined }));
    expect(v.label).toBe("Not running");
    expect(v.position).toBeNull();
    expect(v.motion).toBeNull();
    expect(v.nextStop).toBeNull();
  });

  it("out_of_service dominates the headline with its reason", () => {
    const v = view(make({ serviceStatus: "out_of_service", reason: "Mechanical issue" }));
    expect(v.label).toBe("Out of service — Mechanical issue");
    expect(v.serviceStatus).toBe("out_of_service");
  });

  it("running late before arrival: overdue next stop while active", () => {
    const v = view(make({ nextEntryId: "e1", delayMinutes: undefined, lastStopId: undefined }), t("08:10"));
    expect(v.punctuality).toEqual({ status: "late", delayMinutes: 10 });
    expect(v.label).toContain("10 min late");
  });
});
