// Ping retention. Cron deletes pings older than config.pingRetentionDays (stopEvents are kept).
import { internalMutation } from "./_generated/server";
import { v } from "convex/values";
import type { Config } from "../shared/types";

export const purgeOld = internalMutation({
  args: {},
  returns: v.object({ deleted: v.number() }),
  handler: async (ctx) => {
    const config = (await ctx.db.query("config").first()) as unknown as Config | null;
    if (!config) return { deleted: 0 };
    const cutoff = Date.now() - config.pingRetentionDays * 24 * 3600_000;
    const old = await ctx.db.query("pings").withIndex("by_receivedAt", (q) => q.lt("receivedAt", cutoff)).take(1000);
    for (const p of old) await ctx.db.delete(p._id);
    return { deleted: old.length };
  },
});
