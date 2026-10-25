// Public query: active stops for the map. Coordinates of fixed campus stops only — no personal data.
import { query } from "./_generated/server";
import { v } from "convex/values";

export const list = query({
  args: {},
  returns: v.array(v.any()),
  handler: async (ctx) => {
    const stops = await ctx.db.query("stops").withIndex("by_active", (q) => q.eq("isActive", true)).collect();
    return stops.map((s) => ({ code: s.code, name: s.name, type: s.type, lat: s.lat, lng: s.lng, radiusMeters: s.radiusMeters }));
  },
});
