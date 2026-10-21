// npx convex run seed:loadAll — idempotent upsert of convex/seed/* (running it twice changes nothing).
import { v } from "convex/values";
import { internalMutation, type MutationCtx } from "./_generated/server";
import type { Id, TableNames } from "./_generated/dataModel";
import { checkSeed } from "./lib/seedCheck";
import { stops, stopDefaults } from "./seed/stops";
import { buses } from "./seed/buses";
import { itineraries } from "./seed/itineraries";
import { config } from "./seed/config";

// Convex returns nested object keys sorted, so compare with sorted keys.
const stable = (value: unknown) =>
  JSON.stringify(value, (_, val) =>
    val && typeof val === "object" && !Array.isArray(val) ? Object.fromEntries(Object.entries(val).sort()) : val,
  );

export const loadAll = internalMutation({
  args: {},
  returns: v.object({
    stops: v.number(),
    buses: v.number(),
    itineraries: v.number(),
    entries: v.number(),
    changed: v.number(),
    warnings: v.array(v.string()),
  }),
  handler: async (ctx) => {
    const stopDocs = stops.map((s) => ({ ...stopDefaults, ...s }));
    const { errors, warnings } = checkSeed(stopDocs, buses.map((b) => b.code), itineraries);
    if (errors.length) throw new Error(`Seed rejected:\n${errors.join("\n")}`);

    let changed = 0;
    // `onChange` fields (e.g. updatedAt) are written only when something else changed.
    const upsert = async <T extends TableNames>(
      table: T,
      existing: { _id: Id<T> } | null,
      doc: Record<string, unknown>,
      onChange: Record<string, unknown> = {},
    ) => {
      if (!existing) {
        changed++;
        return (await ctx.db.insert(table, { ...doc, ...onChange } as never)) as Id<T>;
      }
      const diff = Object.fromEntries(
        Object.entries(doc).filter(([k, val]) => stable((existing as Record<string, unknown>)[k]) !== stable(val)),
      );
      if (Object.keys(diff).length) {
        changed++;
        await ctx.db.patch(existing._id, { ...diff, ...onChange } as never);
      }
      return existing._id;
    };

    const stopIds = new Map<string, Id<"stops">>();
    for (const s of stopDocs) {
      const existing = await ctx.db.query("stops").withIndex("by_code", (q) => q.eq("code", s.code)).unique();
      stopIds.set(s.code, await upsert("stops", existing, s, { updatedAt: Date.now() }));
    }

    const busIds = new Map<string, Id<"buses">>();
    for (const b of buses) {
      const existing = await ctx.db.query("buses").withIndex("by_code", (q) => q.eq("code", b.code)).unique();
      busIds.set(b.code, await upsert("buses", existing, b));
    }

    let entries = 0;
    for (const { busCodes, visits, ...it } of itineraries) {
      const existing = await ctx.db.query("itineraries").withIndex("by_code", (q) => q.eq("code", it.code)).unique();
      const itineraryId = await upsert("itineraries", existing, {
        isActive: true,
        ...it,
        busIds: busCodes.map((c) => busIds.get(c)!),
      });
      const rows = await ctx.db
        .query("scheduleEntries")
        .withIndex("by_itinerary_sequence", (q) => q.eq("itineraryId", itineraryId))
        .collect();
      for (const [i, [stopCode, arriveBy, departAt]] of visits.entries()) {
        const sequence = i + 1;
        const row = rows.find((r) => r.sequence === sequence) ?? null;
        await upsert("scheduleEntries", row, { itineraryId, sequence, stopId: stopIds.get(stopCode)!, arriveBy, departAt });
        entries++;
      }
      // ponytail: deletes visits removed from the seed. Safe while no stopEvents reference
      // them; once the pilot logs real data, retire entries via a migration instead.
      for (const extra of rows.filter((r) => r.sequence > visits.length)) {
        await ctx.db.delete(extra._id);
        changed++;
      }
    }

    await upsert("config", await ctx.db.query("config").first(), config);

    for (const w of warnings) console.warn(w);
    return { stops: stopDocs.length, buses: buses.length, itineraries: itineraries.length, entries, changed, warnings };
  },
});
