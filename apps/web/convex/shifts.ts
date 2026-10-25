// Shift lifecycle (internal; driven by driver HTTP actions and a cron). Validates service hours +
// itinerary assignment (D7), anchors the pointer by scheduled time, and on end closes any open
// stop event as departure_unknown (D2).
import { internalMutation, internalQuery, type MutationCtx, type QueryCtx } from "./_generated/server";
import { v, ConvexError } from "convex/values";
import type { Doc, Id } from "./_generated/dataModel";
import type { BusStatusView, Config, ScheduleEntry, Stop } from "../shared/types";
import { dakarDate, isWithinServiceHours, isoWeekday } from "./lib/time";
import { nextExpectedEntry } from "./lib/schedule";
import { deriveBusStatusView } from "./lib/status";

async function getConfig(ctx: MutationCtx): Promise<Config> {
  const config = await ctx.db.query("config").first();
  if (!config) throw new ConvexError({ code: "NO_CONFIG", message: "Config not seeded. Run seed:loadAll." });
  return config as unknown as Config;
}

async function activeShift(ctx: QueryCtx | MutationCtx, busId: Id<"buses">): Promise<Doc<"shifts"> | null> {
  const rows = await ctx.db
    .query("shifts")
    .withIndex("by_bus_active", (q) => q.eq("busId", busId).eq("endedAt", undefined))
    .collect();
  return rows[0] ?? null;
}

async function loadRefs(ctx: MutationCtx, itineraryId: Id<"itineraries">) {
  const entries = (await ctx.db
    .query("scheduleEntries")
    .withIndex("by_itinerary_sequence", (q) => q.eq("itineraryId", itineraryId))
    .collect()) as unknown as ScheduleEntry[];
  const stops = (await ctx.db
    .query("stops")
    .withIndex("by_active", (q) => q.eq("isActive", true))
    .collect()) as unknown as Stop[];
  return { entries, stops };
}

export const start = internalMutation({
  args: { deviceId: v.id("devices"), busId: v.id("buses"), itineraryId: v.id("itineraries"), startedAt: v.number() },
  returns: v.object({ shiftId: v.id("shifts"), status: v.any() }),
  handler: async (ctx, args) => {
    const existing = await activeShift(ctx, args.busId);
    if (existing) {
      throw new ConvexError({
        code: "SHIFT_ALREADY_ACTIVE",
        message: "A shift is already active for this bus.",
        details: { shiftId: existing._id, startedAt: existing.startedAt },
      });
    }
    const config = await getConfig(ctx);
    if (!isWithinServiceHours(args.startedAt, config)) {
      throw new ConvexError({ code: "OUTSIDE_SERVICE_HOURS", message: "Shift start is outside service hours." });
    }
    const itinerary = await ctx.db.get(args.itineraryId);
    const date = dakarDate(args.startedAt);
    const day = isoWeekday(args.startedAt);
    const ok =
      itinerary &&
      itinerary.isActive &&
      itinerary.busIds.includes(args.busId) &&
      itinerary.daysOfWeek.includes(day) &&
      (itinerary.validFrom === undefined || itinerary.validFrom <= date) &&
      (itinerary.validUntil === undefined || date <= itinerary.validUntil);
    if (!ok) throw new ConvexError({ code: "ITINERARY_NOT_FOUND", message: "Itinerary not assigned to this bus or not valid today." });

    const { entries, stops } = await loadRefs(ctx, args.itineraryId);
    const nextEntryId = nextExpectedEntry(entries, new Set(), args.startedAt, date, config)?._id as Id<"scheduleEntries"> | undefined;
    const now = Date.now();

    const shiftId = await ctx.db.insert("shifts", {
      busId: args.busId,
      deviceId: args.deviceId,
      itineraryId: args.itineraryId,
      date,
      startedAt: args.startedAt,
      pingCount: 0,
      lastProcessedRecordedAt: args.startedAt,
      needsReconcile: false,
    });

    const prev = await ctx.db
      .query("busStatus")
      .withIndex("by_bus", (q) => q.eq("busId", args.busId))
      .unique();
    const patch = {
      shiftId,
      itineraryId: args.itineraryId,
      serviceStatus: "in_service" as const,
      motion: "active" as const,
      connectivity: "live" as const,
      geofence: { phase: "outside" as const },
      nextEntryId,
      currentStopId: undefined,
      lastStopId: undefined,
      lastDepartedAt: undefined,
      delayMinutes: undefined,
      reason: undefined,
      note: undefined,
      updatedAt: now,
    };
    if (prev) await ctx.db.patch(prev._id, patch);
    else await ctx.db.insert("busStatus", { busId: args.busId, ...patch });

    await ctx.db.insert("stateChanges", { busId: args.busId, dimension: "serviceStatus", from: "off_shift", to: "in_service", source: "driver", at: now });

    const bus = (await ctx.db.get(args.busId))!;
    const status = deriveBusStatusView({
      bus: bus as unknown as Doc<"buses"> & { type: "large" | "small" },
      status: (await ctx.db.query("busStatus").withIndex("by_bus", (q) => q.eq("busId", args.busId)).unique())! as never,
      itinerary: itinerary as never,
      stopsById: new Map(stops.map((s) => [s._id, s])),
      entriesById: new Map(entries.map((e) => [e._id, e])),
      now,
      config,
    }) as BusStatusView;

    return { shiftId, status };
  },
});

/** Shared close logic for driver-end and the service-hours watchdog. */
async function closeShift(ctx: MutationCtx, shift: Doc<"shifts">, endedAt: number, reason: Doc<"shifts">["endReason"]) {
  await ctx.db.patch(shift._id, { endedAt, endReason: reason });

  const status = await ctx.db.query("busStatus").withIndex("by_bus", (q) => q.eq("busId", shift.busId)).unique();
  const now = Date.now();
  if (status) {
    // D2: if still inside a stop, close the open stop event as departure_unknown.
    if (status.geofence.phase === "inside") {
      const open = (
        await ctx.db.query("stopEvents").withIndex("by_shift_arrivedAt", (q) => q.eq("shiftId", shift._id)).collect()
      ).filter((e) => e.arrivedAt != null && e.departedAt === undefined);
      for (const e of open) await ctx.db.patch(e._id, { departedAt: null, flags: [...new Set([...e.flags, "departure_unknown" as const])] });
    }
    await ctx.db.patch(status._id, {
      serviceStatus: "off_shift",
      motion: undefined,
      geofence: { phase: "outside" },
      currentStopId: undefined,
      updatedAt: now,
    });
    await ctx.db.insert("stateChanges", { busId: shift.busId, dimension: "serviceStatus", from: "in_service", to: "off_shift", reason: reason ?? undefined, source: reason === "driver" ? "driver" : "cron", at: now });
  }
}

export const end = internalMutation({
  args: { busId: v.id("buses"), endedAt: v.number(), reason: v.optional(v.union(v.literal("driver"), v.literal("service_hours_over"))) },
  returns: v.object({ shiftId: v.id("shifts") }),
  handler: async (ctx, args) => {
    const shift = await activeShift(ctx, args.busId);
    if (!shift) throw new ConvexError({ code: "SHIFT_NOT_ACTIVE", message: "No active shift for this device." });
    await closeShift(ctx, shift, args.endedAt, args.reason ?? "driver");
    return { shiftId: shift._id };
  },
});

export const activeForBus = internalQuery({
  args: { busId: v.id("buses") },
  returns: v.union(v.null(), v.any()),
  handler: (ctx, args) => activeShift(ctx, args.busId),
});

/** Cron: end shifts left open past service hours (auto_timeout). */
export const closeAfterHours = internalMutation({
  args: {},
  returns: v.object({ closed: v.number() }),
  handler: async (ctx) => {
    const config = await getConfig(ctx);
    const now = Date.now();
    if (isWithinServiceHours(now, config)) return { closed: 0 };
    const today = dakarDate(now);
    const open = (await ctx.db.query("shifts").withIndex("by_date", (q) => q.eq("date", today)).collect()).filter((s) => s.endedAt === undefined);
    for (const shift of open) await closeShift(ctx, shift, now, "auto_timeout");
    return { closed: open.length };
  },
});
