// Core write path. Validates + stores pings, then replays the whole shift (pure, ADR 0002) to
// rebuild the authoritative stopEvents and the live busStatus. Full replay makes out-of-order /
// backlogged pings self-correcting and stopEvents idempotent (re-running yields no duplicates).
import { internalMutation, type MutationCtx } from "./_generated/server";
import { v, ConvexError } from "convex/values";
import type { Doc, Id } from "./_generated/dataModel";
import type { BusStatusView, Config, ScheduleEntry, Stop } from "../shared/types";
import { impliedSpeedMps } from "./lib/geo";
import { replayShift, type ReplayPing } from "./lib/replay";
import { deriveBusStatusView } from "./lib/status";

const MAX_SPEED_MPS = 33; // ~120 km/h plausibility cap (SECURITY.md §5)
const pingInput = v.object({
  clientId: v.string(),
  recordedAt: v.number(),
  lat: v.number(),
  lng: v.number(),
  accuracy: v.number(),
  speed: v.optional(v.number()),
  heading: v.optional(v.number()),
});

async function getConfig(ctx: MutationCtx): Promise<Config> {
  const config = await ctx.db.query("config").first();
  if (!config) throw new ConvexError({ code: "NO_CONFIG", message: "Config not seeded." });
  return config as unknown as Config;
}

/** Replay all of a shift's stored pings and rewrite its stopEvents (delete + insert = idempotent). */
async function rebuildStopEvents(ctx: MutationCtx, shift: Doc<"shifts">, config: Config) {
  const pings = await ctx.db
    .query("pings")
    .withIndex("by_shift_recordedAt", (q) => q.eq("shiftId", shift._id))
    .collect();
  const entries = (await ctx.db
    .query("scheduleEntries")
    .withIndex("by_itinerary_sequence", (q) => q.eq("itineraryId", shift.itineraryId))
    .collect()) as unknown as ScheduleEntry[];
  const stops = (await ctx.db
    .query("stops")
    .withIndex("by_active", (q) => q.eq("isActive", true))
    .collect()) as unknown as Stop[];

  const replayPings: ReplayPing[] = pings.map((p) => ({ lat: p.lat, lng: p.lng, recordedAt: p.recordedAt, speed: p.speed, accuracy: p.accuracy }));
  const { events, final } = replayShift({ pings: replayPings, stops, entries, config, date: shift.date });

  const existing = await ctx.db.query("stopEvents").withIndex("by_shift_arrivedAt", (q) => q.eq("shiftId", shift._id)).collect();
  for (const e of existing) await ctx.db.delete(e._id);
  for (const ev of events) {
    await ctx.db.insert("stopEvents", {
      busId: shift.busId,
      shiftId: shift._id,
      stopId: ev.stopId as Id<"stops">,
      scheduleEntryId: ev.scheduleEntryId as Id<"scheduleEntries"> | undefined,
      date: shift.date,
      arrivedAt: ev.arrivedAt,
      departedAt: ev.departedAt,
      arrivalDelayMinutes: ev.arrivalDelayMinutes,
      departureDeltaMinutes: ev.departureDeltaMinutes,
      flags: ev.flags as Doc<"stopEvents">["flags"], // replay only emits stored flags (no view-only pending/temporary_route)
    });
  }
  return { final, entries, stops, lastRecordedAt: pings.length ? pings[pings.length - 1]!.recordedAt : shift.startedAt };
}

export const ingestPings = internalMutation({
  args: { deviceId: v.id("devices"), busId: v.id("buses"), pings: v.array(pingInput), heartbeat: v.optional(v.object({ batteryPercent: v.number(), isCharging: v.boolean(), queuedCount: v.number(), appVersion: v.string() })) },
  returns: v.object({ accepted: v.number(), duplicates: v.number(), rejected: v.number(), status: v.any() }),
  handler: async (ctx, args) => {
    const shifts = await ctx.db.query("shifts").withIndex("by_bus_active", (q) => q.eq("busId", args.busId).eq("endedAt", undefined)).collect();
    const shift = shifts[0];
    if (!shift) throw new ConvexError({ code: "SHIFT_NOT_ACTIVE", message: "No active shift for this device. Start a shift before sending pings." });

    const config = await getConfig(ctx);
    const now = Date.now();
    let accepted = 0;
    let duplicates = 0;
    let rejected = 0;

    const incoming = [...args.pings].sort((a, b) => a.recordedAt - b.recordedAt);
    let prev: { lat: number; lng: number; recordedAt: number } | null = null;
    for (const p of incoming) {
      const plausibleTime = p.recordedAt > now - 24 * 3600_000 && p.recordedAt < now + 2 * 60_000;
      const plausibleAcc = p.accuracy <= config.maxAccuracyMeters;
      const plausibleSpeed = !prev || impliedSpeedMps(prev, p) <= MAX_SPEED_MPS;
      if (!plausibleTime || !plausibleAcc || !plausibleSpeed) {
        rejected++;
        continue;
      }
      const dup = await ctx.db.query("pings").withIndex("by_shift_clientId", (q) => q.eq("shiftId", shift._id).eq("clientId", p.clientId)).unique();
      if (dup) {
        duplicates++;
        continue;
      }
      await ctx.db.insert("pings", { busId: args.busId, shiftId: shift._id, clientId: p.clientId, recordedAt: p.recordedAt, receivedAt: now, lat: p.lat, lng: p.lng, accuracy: p.accuracy, speed: p.speed, heading: p.heading });
      accepted++;
      prev = p;
    }

    const { final, entries, stops, lastRecordedAt } = await rebuildStopEvents(ctx, shift, config);

    const status = (await ctx.db.query("busStatus").withIndex("by_bus", (q) => q.eq("busId", args.busId)).unique())!;
    const wasSignalLost = status.connectivity === "signal_lost";
    // serviceStatus is left untouched (driver may have set out_of_service); update derived dimensions only.
    await ctx.db.patch(status._id, {
      motion: final.motion,
      connectivity: "live",
      geofence: final.geofence as Doc<"busStatus">["geofence"],
      nextEntryId: final.nextEntryId as Id<"scheduleEntries"> | undefined,
      currentStopId: final.currentStopId as Id<"stops"> | undefined,
      lastStopId: final.lastStopId as Id<"stops"> | undefined,
      lastDepartedAt: final.lastDepartedAt,
      delayMinutes: final.delayMinutes,
      lat: final.lat,
      lng: final.lng,
      accuracy: final.accuracy,
      lastPingAt: now,
      updatedAt: now,
    });
    if (wasSignalLost) await ctx.db.insert("stateChanges", { busId: args.busId, dimension: "connectivity", from: "signal_lost", to: "live", source: "system", at: now });

    await ctx.db.patch(shift._id, { pingCount: shift.pingCount + accepted, lastProcessedRecordedAt: lastRecordedAt, needsReconcile: false });

    const devicePatch: Partial<Doc<"devices">> = { lastSeenAt: now };
    if (args.heartbeat) {
      devicePatch.lastBatteryPercent = args.heartbeat.batteryPercent;
      devicePatch.appVersion = args.heartbeat.appVersion;
    }
    await ctx.db.patch(args.deviceId, devicePatch);

    const bus = (await ctx.db.get(args.busId))!;
    const itinerary = await ctx.db.get(shift.itineraryId);
    const view = deriveBusStatusView({
      bus: bus as never,
      status: (await ctx.db.get(status._id))! as never,
      itinerary: itinerary as never,
      stopsById: new Map(stops.map((s) => [s._id, s])),
      entriesById: new Map(entries.map((e) => [e._id, e])),
      now,
      config,
    }) as BusStatusView;

    return { accepted, duplicates, rejected, status: view };
  },
});

/** ADR 0002: rebuild a shift's stopEvents from its pings (does not rewind live busStatus). */
export const reconcileShift = internalMutation({
  args: { shiftId: v.id("shifts") },
  returns: v.object({ rebuilt: v.number() }),
  handler: async (ctx, args) => {
    const shift = await ctx.db.get(args.shiftId);
    if (!shift) throw new ConvexError({ code: "SHIFT_NOT_FOUND", message: "No such shift." });
    const config = await getConfig(ctx);
    await rebuildStopEvents(ctx, shift, config);
    await ctx.db.patch(shift._id, { needsReconcile: false });
    const count = (await ctx.db.query("stopEvents").withIndex("by_shift_arrivedAt", (q) => q.eq("shiftId", shift._id)).collect()).length;
    return { rebuilt: count };
  },
});
