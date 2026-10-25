// @vitest-environment edge-runtime
/// <reference types="vite/client" />
import { describe, expect, it } from "vitest";
import { convexTest } from "convex-test";
import schema from "../schema";
import { internal } from "../_generated/api";

const modules = import.meta.glob("../**/*.ts");
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

async function onShiftBus(t: ReturnType<typeof convexTest>, lastPingAt: number) {
  return await t.run(async (ctx) => {
    await ctx.db.insert("config", config);
    const busId = await ctx.db.insert("buses", { code: "BUS-1", name: "Bus 1", type: "large", isActive: true });
    const deviceId = await ctx.db.insert("devices", { busId, label: "t", tokenHash: "h", createdAt: 0 });
    const itineraryId = await ctx.db.insert("itineraries", { code: "I", name: "I", busIds: [busId], isTemporary: false, daysOfWeek: [1, 2, 3, 4, 5], isActive: true });
    const shiftId = await ctx.db.insert("shifts", { busId, deviceId, itineraryId, date: "2026-11-16", startedAt: 0, pingCount: 0 });
    const statusId = await ctx.db.insert("busStatus", { busId, shiftId, itineraryId, serviceStatus: "in_service", motion: "active", connectivity: "live", geofence: { phase: "outside" }, lastPingAt, updatedAt: lastPingAt });
    return { busId, statusId };
  });
}

describe("markSignalLost", () => {
  it("flags a bus whose last ping is older than the threshold (connectivity only)", async () => {
    const t = convexTest(schema, modules);
    const { busId, statusId } = await onShiftBus(t, Date.now() - 10 * 60_000); // 10 min ago
    const res = await t.mutation(internal.busState.markSignalLost, {});
    expect(res.flagged).toContain("BUS-1");
    const status = await t.run((ctx) => ctx.db.get(statusId));
    expect(status?.connectivity).toBe("signal_lost");
    expect(status?.serviceStatus).toBe("in_service"); // operational state untouched
  });

  it("does not flag a bus with a recent ping", async () => {
    const t = convexTest(schema, modules);
    const { statusId } = await onShiftBus(t, Date.now() - 30_000); // 30 s ago
    const res = await t.mutation(internal.busState.markSignalLost, {});
    expect(res.flagged).toEqual([]);
    const status = await t.run((ctx) => ctx.db.get(statusId));
    expect(status?.connectivity).toBe("live");
  });

  it("out_of_service with a reason code resolves to the EN label for students (E1)", async () => {
    const t = convexTest(schema, modules);
    const { busId, statusId } = await onShiftBus(t, Date.now());
    await t.mutation(internal.busState.set, { busId, serviceStatus: "out_of_service", reasonCode: "MECHANICAL", note: "attente" });
    const status = await t.run((ctx) => ctx.db.get(statusId));
    expect(status?.serviceStatus).toBe("out_of_service");
    expect(status?.reason).toBe("Mechanical issue");
  });
});
