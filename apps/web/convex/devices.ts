// Device provisioning (CLI only). `npx convex run devices:provision '{"busCode":"BUS-1","label":"..."}'`
// prints the token ONCE; only its hash is stored. Re-provisioning a bus revokes the prior device (B1).
import { internalMutation } from "./_generated/server";
import { v } from "convex/values";
import { hashToken } from "./auth";

function randomToken(): string {
  const bytes = new Uint8Array(32);
  crypto.getRandomValues(bytes);
  let bin = "";
  for (const b of bytes) bin += String.fromCharCode(b);
  const b64 = btoa(bin).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
  return `dbt_live_${b64}`;
}

export const provision = internalMutation({
  args: { busCode: v.string(), label: v.string() },
  returns: v.object({ token: v.string(), deviceId: v.id("devices") }),
  handler: async (ctx, args) => {
    const bus = await ctx.db
      .query("buses")
      .withIndex("by_code", (q) => q.eq("code", args.busCode))
      .unique();
    if (!bus) throw new Error(`No bus with code ${args.busCode}`);

    // Revoke any existing non-revoked device for this bus — exactly one active at a time (B1).
    const existing = await ctx.db
      .query("devices")
      .withIndex("by_bus", (q) => q.eq("busId", bus._id))
      .collect();
    const now = Date.now();
    for (const d of existing) if (d.revokedAt == null) await ctx.db.patch(d._id, { revokedAt: now });

    const token = randomToken();
    const deviceId = await ctx.db.insert("devices", {
      busId: bus._id,
      label: args.label,
      tokenHash: await hashToken(token),
      createdAt: now,
    });
    return { token, deviceId };
  },
});

/** Record device metadata captured at pairing. */
export const recordPairing = internalMutation({
  args: { deviceId: v.id("devices"), deviceModel: v.string(), androidVersion: v.string(), appVersion: v.string() },
  returns: v.null(),
  handler: async (ctx, args) => {
    await ctx.db.patch(args.deviceId, { deviceModel: args.deviceModel, androidVersion: args.androidVersion, appVersion: args.appVersion, lastSeenAt: Date.now() });
    return null;
  },
});

export const revoke = internalMutation({
  args: { deviceId: v.id("devices") },
  returns: v.null(),
  handler: async (ctx, args) => {
    await ctx.db.patch(args.deviceId, { revokedAt: Date.now() });
    return null;
  },
});
