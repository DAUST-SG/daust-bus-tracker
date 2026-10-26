// Internal query backing GET /api/v1/driver/config: bus info, today's service window, the
// itineraries this bus may run today (with their stops), upload settings and bilingual reasons.
import { internalQuery } from "./_generated/server";
import { v } from "convex/values";
import type { Config } from "../shared/types";
import { dakarDate, isoWeekday } from "./lib/time";

export const getConfig = internalQuery({
  args: { busId: v.id("buses"), now: v.number() },
  returns: v.any(),
  handler: async (ctx, args) => {
    const config = (await ctx.db.query("config").first()) as unknown as Config | null;
    if (!config) return null;
    const bus = await ctx.db.get(args.busId);
    if (!bus) return null;

    const date = dakarDate(args.now);
    const day = isoWeekday(args.now);
    const window = config.serviceHours.find((w) => w.days.includes(day)) ?? null;

    const stops = await ctx.db.query("stops").collect();
    const stopName = new Map(stops.map((s) => [s._id as string, s.name]));

    const all = await ctx.db.query("itineraries").collect();
    const itineraries = [];
    for (const it of all) {
      const ok =
        it.isActive &&
        it.busIds.includes(args.busId) &&
        it.daysOfWeek.includes(day) &&
        (it.validFrom === undefined || it.validFrom <= date) &&
        (it.validUntil === undefined || date <= it.validUntil);
      if (!ok) continue;
      const entries = await ctx.db.query("scheduleEntries").withIndex("by_itinerary_sequence", (q) => q.eq("itineraryId", it._id)).collect();
      itineraries.push({
        id: it._id,
        name: it.name,
        isTemporary: it.isTemporary,
        validUntil: it.validUntil ?? null,
        stops: entries.map((e) => ({ id: e.stopId, name: stopName.get(e.stopId) ?? "?", sequence: e.sequence })),
      });
    }

    return {
      bus: { code: bus.code, name: bus.name },
      serviceHours: window ? { date, start: window.start, end: window.end, timezone: config.timezone } : null,
      itineraries,
      upload: { intervalSeconds: 10, batchMax: 50, maxAccuracyMeters: config.maxAccuracyMeters },
      outOfServiceReasons: config.outOfServiceReasons,
    };
  },
});
