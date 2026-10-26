// Bus operational state. Driver sets serviceStatus (out_of_service with a bilingual reason code →
// stored as the EN label for the student page, E1); the signal-lost cron writes ONLY connectivity
// and never touches serviceStatus (CONTEXT.md three-dimension state, A1).
import { internalMutation, type MutationCtx } from "./_generated/server";
import { v, ConvexError } from "convex/values";
import type { Config } from "../shared/types";

async function getConfig(ctx: MutationCtx): Promise<Config> {
  const config = await ctx.db.query("config").first();
  if (!config) throw new ConvexError({ code: "NO_CONFIG", message: "Config not seeded." });
  return config as unknown as Config;
}

export const set = internalMutation({
  args: {
    busId: v.id("buses"),
    serviceStatus: v.union(v.literal("out_of_service"), v.literal("in_service")),
    reasonCode: v.optional(v.string()),
    note: v.optional(v.string()),
  },
  returns: v.any(),
  handler: async (ctx, args) => {
    const status = await ctx.db.query("busStatus").withIndex("by_bus", (q) => q.eq("busId", args.busId)).unique();
    if (!status) throw new ConvexError({ code: "SHIFT_NOT_ACTIVE", message: "Bus is not on shift." });

    let reason: string | undefined;
    if (args.serviceStatus === "out_of_service") {
      if (!args.reasonCode) throw new ConvexError({ code: "VALIDATION_ERROR", message: "A reason is required to mark the bus out of service.", details: { field: "reasonCode" } });
      const config = await getConfig(ctx);
      reason = config.outOfServiceReasons.find((r) => r.code === args.reasonCode)?.en ?? args.reasonCode;
    }

    const now = Date.now();
    const from = status.serviceStatus;
    await ctx.db.patch(status._id, {
      serviceStatus: args.serviceStatus,
      reason: args.serviceStatus === "out_of_service" ? reason : undefined,
      note: args.serviceStatus === "out_of_service" ? args.note : undefined,
      updatedAt: now,
    });
    await ctx.db.insert("stateChanges", { busId: args.busId, dimension: "serviceStatus", from, to: args.serviceStatus, reason, source: "driver", at: now });
    return (await ctx.db.get(status._id))!;
  },
});

/** Cron: flag buses whose last ping is older than the threshold while on shift (connectivity only). */
export const markSignalLost = internalMutation({
  args: {},
  returns: v.object({ flagged: v.array(v.string()) }),
  handler: async (ctx) => {
    const config = await getConfig(ctx);
    const now = Date.now();
    const threshold = now - config.signalLostAfterSeconds * 1000;
    const all = await ctx.db.query("busStatus").withIndex("by_bus", (q) => q).collect();

    const flagged: string[] = [];
    for (const status of all) {
      const onShift = status.shiftId != null && status.serviceStatus !== "off_shift";
      if (!onShift || status.connectivity === "signal_lost") continue;
      if (status.lastPingAt == null || status.lastPingAt >= threshold) continue;

      await ctx.db.patch(status._id, { connectivity: "signal_lost", updatedAt: now });
      if (status.geofence.phase === "inside" && status.shiftId) {
        const open = (
          await ctx.db.query("stopEvents").withIndex("by_shift_arrivedAt", (q) => q.eq("shiftId", status.shiftId!)).collect()
        ).filter((e) => e.arrivedAt != null && e.departedAt === undefined);
        for (const e of open) await ctx.db.patch(e._id, { departedAt: null, flags: [...new Set([...e.flags, "departure_unknown" as const])] });
      }
      await ctx.db.insert("stateChanges", { busId: status.busId, dimension: "connectivity", from: "live", to: "signal_lost", source: "cron", at: now });

      const bus = await ctx.db.get(status.busId);
      if (bus) flagged.push(bus.code);
    }
    await onSignalLost(flagged);
    return { flagged };
  },
});

/**
 * v1 no-op: the silent-failure surface is the health view only (Product Decision A1). Wired so a
 * Telegram/email webhook can be enabled here by config if pilot week 1 shows missed failures.
 */
export async function onSignalLost(_busCodes: string[]): Promise<void> {
  // intentionally empty
}
