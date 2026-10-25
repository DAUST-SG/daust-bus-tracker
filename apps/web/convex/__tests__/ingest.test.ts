// @vitest-environment edge-runtime
/// <reference types="vite/client" />
import { describe, expect, it } from "vitest";
import { convexTest } from "convex-test";
import schema from "../schema";
import { internal } from "../_generated/api";

const modules = import.meta.glob("../**/*.ts");

const WARDINI = { lat: 14.7, lng: -17.4 };
const SCHOOL = { lat: 14.708, lng: -17.4 };
const isoDate = (ms: number) => new Date(ms).toISOString().slice(0, 10);
const hhmm = (ms: number) => new Date(ms).toISOString().slice(11, 16); // Dakar = UTC

const config = {
  timezone: "Africa/Dakar" as const,
  serviceHours: [{ days: [1, 2, 3, 4, 5], start: "06:30", end: "22:00" }],
  lateGraceMinutes: 2,
  signalLostAfterSeconds: 300,
  staleAfterSeconds: 120,
  maxAccuracyMeters: 50,
  pingRetentionDays: 30,
  matchWindowMinutes: 45,
  stopSpeedThreshold: 2,
  restConfirmPings: 2,
  outOfServiceReasons: [{ code: "MECHANICAL", fr: "Panne", en: "Mechanical issue" }],
};

/** Seed reference data + an active shift + busStatus directly (decoupled from the wall clock). */
async function setup(t: ReturnType<typeof convexTest>, base: number) {
  return await t.run(async (ctx) => {
    await ctx.db.insert("config", config);
    const busId = await ctx.db.insert("buses", { code: "BUS-1", name: "Bus 1", type: "large", isActive: true });
    const deviceId = await ctx.db.insert("devices", { busId, label: "test", tokenHash: "x", createdAt: base });
    const wardini = await ctx.db.insert("stops", { code: "WARDINI", name: "Wardini", type: "dorm", ...WARDINI, radiusMeters: 75, exitBufferMeters: 40, dwellSeconds: 20, isActive: true, updatedAt: base });
    const school = await ctx.db.insert("stops", { code: "SCHOOL", name: "School", type: "school", ...SCHOOL, radiusMeters: 75, exitBufferMeters: 40, dwellSeconds: 20, isActive: true, updatedAt: base });
    const itineraryId = await ctx.db.insert("itineraries", { code: "BUS1", name: "Bus 1 loop", busIds: [busId], isTemporary: false, daysOfWeek: [1, 2, 3, 4, 5], isActive: true });
    // Schedule times anchored near `base` so matching isn't rejected by the sanity window.
    const e1 = await ctx.db.insert("scheduleEntries", { itineraryId, sequence: 1, stopId: wardini, arriveBy: hhmm(base), departAt: hhmm(base + 300_000) });
    const e2 = await ctx.db.insert("scheduleEntries", { itineraryId, sequence: 2, stopId: school, arriveBy: hhmm(base + 600_000), departAt: hhmm(base + 900_000) });
    const shiftId = await ctx.db.insert("shifts", { busId, deviceId, itineraryId, date: isoDate(base), startedAt: base, pingCount: 0, lastProcessedRecordedAt: base, needsReconcile: false });
    await ctx.db.insert("busStatus", { busId, shiftId, itineraryId, serviceStatus: "in_service", motion: "active", connectivity: "live", geofence: { phase: "outside" }, nextEntryId: e1, updatedAt: base });
    return { busId, deviceId, shiftId, wardini, e1, e2 };
  });
}

const atRest = (clientId: string, recordedAt: number, p: { lat: number; lng: number }) => ({ clientId, recordedAt, lat: p.lat, lng: p.lng, accuracy: 5, speed: 0 });

describe("ingestPings", () => {
  it("rejects pings when no shift is active", async () => {
    const t = convexTest(schema, modules);
    const base = Date.now();
    const { deviceId, busId } = await t.run(async (ctx) => {
      await ctx.db.insert("config", config);
      const b = await ctx.db.insert("buses", { code: "BUS-9", name: "Bus 9", type: "large", isActive: true });
      const d = await ctx.db.insert("devices", { busId: b, label: "t", tokenHash: "y", createdAt: base });
      return { deviceId: d, busId: b };
    });
    await expect(t.mutation(internal.ingest.ingestPings, { deviceId, busId, pings: [atRest("p1", base, WARDINI)] })).rejects.toThrow();
  });

  it("detects an arrival at the expected stop and counts accepted pings", async () => {
    const t = convexTest(schema, modules);
    const base = Date.now();
    const { deviceId, busId, shiftId, e1 } = await setup(t, base);
    const res = await t.mutation(internal.ingest.ingestPings, {
      deviceId,
      busId,
      pings: [atRest("p1", base - 20_000, WARDINI), atRest("p2", base - 10_000, WARDINI)],
    });
    expect(res.accepted).toBe(2);
    const events = await t.run((ctx) => ctx.db.query("stopEvents").withIndex("by_shift_arrivedAt", (q) => q.eq("shiftId", shiftId)).collect());
    const arrival = events.find((e) => e.scheduleEntryId === e1);
    expect(arrival?.arrivedAt).not.toBeNull();
  });

  it("dedupes retried pings by clientId", async () => {
    const t = convexTest(schema, modules);
    const base = Date.now();
    const { deviceId, busId, shiftId } = await setup(t, base);
    const batch = [atRest("p1", base - 20_000, WARDINI), atRest("p2", base - 10_000, WARDINI)];
    await t.mutation(internal.ingest.ingestPings, { deviceId, busId, pings: batch });
    const again = await t.mutation(internal.ingest.ingestPings, { deviceId, busId, pings: batch });
    expect(again.duplicates).toBe(2);
    expect(again.accepted).toBe(0);
    const pingCount = await t.run((ctx) => ctx.db.query("pings").withIndex("by_shift_recordedAt", (q) => q.eq("shiftId", shiftId)).collect());
    expect(pingCount.length).toBe(2);
  });

  it("replaying the same batch produces no duplicate stopEvents (DoD-2)", async () => {
    const t = convexTest(schema, modules);
    const base = Date.now();
    const { deviceId, busId, shiftId } = await setup(t, base);
    const batch = [atRest("p1", base - 20_000, WARDINI), atRest("p2", base - 10_000, WARDINI)];
    await t.mutation(internal.ingest.ingestPings, { deviceId, busId, pings: batch });
    const before = (await t.run((ctx) => ctx.db.query("stopEvents").withIndex("by_shift_arrivedAt", (q) => q.eq("shiftId", shiftId)).collect())).length;
    await t.mutation(internal.ingest.ingestPings, { deviceId, busId, pings: batch });
    const after = (await t.run((ctx) => ctx.db.query("stopEvents").withIndex("by_shift_arrivedAt", (q) => q.eq("shiftId", shiftId)).collect())).length;
    expect(after).toBe(before);
  });

  it("accepts an out-of-order backlog ping and rebuilds the log without error", async () => {
    const t = convexTest(schema, modules);
    const base = Date.now();
    const { deviceId, busId, shiftId, e1 } = await setup(t, base);
    await t.mutation(internal.ingest.ingestPings, { deviceId, busId, pings: [atRest("p2", base - 10_000, WARDINI)] });
    const backlog = await t.mutation(internal.ingest.ingestPings, { deviceId, busId, pings: [atRest("p1", base - 20_000, WARDINI)] });
    expect(backlog.accepted).toBe(1);
    const events = await t.run((ctx) => ctx.db.query("stopEvents").withIndex("by_shift_arrivedAt", (q) => q.eq("shiftId", shiftId)).collect());
    const arrival = events.find((e) => e.scheduleEntryId === e1);
    expect(arrival?.arrivedAt).toBe(base - 20_000); // earliest ping inside the radius wins
  });
});
