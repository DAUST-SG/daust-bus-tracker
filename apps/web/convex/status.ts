// Public, read-only queries for the student page. No personal data: never exposes devices,
// tokenHash, raw pings or battery; off-shift buses expose no position (handled in deriveBusStatusView).
import { query, type QueryCtx } from "./_generated/server";
import { v, ConvexError } from "convex/values";
import type { BusLogEntry, BusStatusView, Config, ScheduleEntry, Stop, StopEventFlag } from "../shared/types";
import { deriveBusStatusView } from "./lib/status";
import { hhmmToMs } from "./lib/time";

async function stopsMap(ctx: QueryCtx): Promise<Map<string, Stop>> {
  const stops = (await ctx.db.query("stops").withIndex("by_active", (q) => q.eq("isActive", true)).collect()) as unknown as Stop[];
  return new Map(stops.map((s) => [s._id, s]));
}

export const list = query({
  // `now` is passed by the client (which also ticks relative times); keeps the query wall-clock-free.
  args: { now: v.optional(v.number()) },
  returns: v.array(v.any()),
  handler: async (ctx, args) => {
    const now = args.now ?? Date.now();
    const config = (await ctx.db.query("config").first()) as unknown as Config | null;
    if (!config) return [];
    const stopsById = await stopsMap(ctx);
    const statuses = await ctx.db.query("busStatus").withIndex("by_bus", (q) => q).collect();

    const views: BusStatusView[] = [];
    for (const status of statuses) {
      const bus = await ctx.db.get(status.busId);
      if (!bus) continue;
      const itinerary = status.itineraryId ? await ctx.db.get(status.itineraryId) : null;
      const entries = status.itineraryId
        ? ((await ctx.db.query("scheduleEntries").withIndex("by_itinerary_sequence", (q) => q.eq("itineraryId", status.itineraryId!)).collect()) as unknown as ScheduleEntry[])
        : [];
      views.push(
        deriveBusStatusView({
          bus: bus as never,
          status: status as never,
          itinerary: itinerary as never,
          stopsById,
          entriesById: new Map(entries.map((e) => [e._id, e])),
          now,
          config,
        }),
      );
    }
    return views.sort((a, b) => a.code.localeCompare(b.code));
  },
});

export const busLog = query({
  args: { busCode: v.string(), date: v.string(), now: v.optional(v.number()) },
  returns: v.any(),
  handler: async (ctx, args) => {
    const now = args.now ?? Date.now();
    const bus = await ctx.db.query("buses").withIndex("by_code", (q) => q.eq("code", args.busCode)).unique();
    if (!bus) throw new ConvexError({ code: "BUS_NOT_FOUND", message: `No bus with code ${args.busCode}.` });
    const stopsById = await stopsMap(ctx);
    const name = (id: string) => stopsById.get(id)?.name ?? "?";

    const dayShifts = (await ctx.db.query("shifts").withIndex("by_date", (q) => q.eq("date", args.date)).collect()).filter((s) => s.busId === bus._id);
    const events = await ctx.db.query("stopEvents").withIndex("by_bus_date", (q) => q.eq("busId", bus._id).eq("date", args.date)).collect();
    const byEntry = new Map(events.filter((e) => e.scheduleEntryId).map((e) => [e.scheduleEntryId as string, e]));

    const entriesRaw: ScheduleEntry[] = [];
    for (const sh of dayShifts) {
      entriesRaw.push(...((await ctx.db.query("scheduleEntries").withIndex("by_itinerary_sequence", (q) => q.eq("itineraryId", sh.itineraryId)).collect()) as unknown as ScheduleEntry[]));
    }
    const uniqueEntries = [...new Map(entriesRaw.map((e) => [e._id, e])).values()].sort((a, b) => a.sequence - b.sequence);

    const entries: BusLogEntry[] = [];
    for (const e of uniqueEntries) {
      const ev = byEntry.get(e._id);
      const dueMs = e.arriveBy ? hhmmToMs(args.date, e.arriveBy) : undefined;
      const flags: StopEventFlag[] = ev ? ev.flags : [dueMs !== undefined && now > dueMs ? "undetected" : "pending"];
      entries.push({
        stopName: name(e.stopId),
        scheduledArrival: e.arriveBy,
        scheduledDeparture: e.departAt,
        actualArrival: ev?.arrivedAt ?? null,
        actualDeparture: ev?.departedAt ?? null,
        arrivalDelayMinutes: ev?.arrivalDelayMinutes ?? null,
        flags,
      });
    }
    for (const ev of events.filter((e) => !e.scheduleEntryId)) {
      entries.push({ stopName: name(ev.stopId), actualArrival: ev.arrivedAt, actualDeparture: ev.departedAt ?? null, arrivalDelayMinutes: ev.arrivalDelayMinutes ?? null, flags: ev.flags });
    }

    return { bus: { code: bus.code, name: bus.name }, date: args.date, entries };
  },
});
