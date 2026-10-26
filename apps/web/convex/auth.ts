// Device-token authentication for driver endpoints. Tokens are opaque bearer strings
// (dbt_live_<43 base64url>), stored only as SHA-256(token + pepper) via Web Crypto — no "use node"
// needed (SECURITY.md §2). requireDevice() gates every driver HTTP action (Stage 3).
import { internalQuery, type ActionCtx } from "./_generated/server";
import { internal } from "./_generated/api";
import { v } from "convex/values";
import type { Doc } from "./_generated/dataModel";

export async function hashToken(token: string): Promise<string> {
  const pepper = process.env.DEVICE_TOKEN_PEPPER ?? ""; // set in Convex env for production
  const bytes = new TextEncoder().encode(token + pepper);
  const digest = await crypto.subtle.digest("SHA-256", bytes);
  return [...new Uint8Array(digest)].map((b) => b.toString(16).padStart(2, "0")).join("");
}

/** Internal: resolve a token hash to its (non-revoked) device + bus. */
export const deviceByTokenHash = internalQuery({
  args: { tokenHash: v.string() },
  returns: v.union(v.null(), v.object({ deviceId: v.id("devices"), busId: v.id("buses"), revoked: v.boolean() })),
  handler: async (ctx, args) => {
    const device = await ctx.db
      .query("devices")
      .withIndex("by_tokenHash", (q) => q.eq("tokenHash", args.tokenHash))
      .unique();
    if (!device) return null;
    return { deviceId: device._id, busId: device.busId, revoked: device.revokedAt != null };
  },
});

export type AuthResult =
  | { ok: true; device: Doc<"devices">; bus: Doc<"buses"> }
  | { ok: false; status: 401 | 403; code: string; message: string };

/**
 * Authenticate a driver HTTP action from its `Authorization: Bearer <token>` header.
 * Returns the device + bus, or a structured failure the caller renders as a JSON error response.
 */
export async function requireDevice(ctx: ActionCtx, request: Request): Promise<AuthResult> {
  const header = request.headers.get("Authorization") ?? "";
  const token = header.startsWith("Bearer ") ? header.slice(7).trim() : "";
  if (!token) return { ok: false, status: 401, code: "UNAUTHORIZED", message: "Missing or invalid Authorization header." };

  const found = await ctx.runQuery(internal.auth.deviceByTokenHash, { tokenHash: await hashToken(token) });
  if (!found) return { ok: false, status: 401, code: "UNAUTHORIZED", message: "Unknown device token." };
  if (found.revoked) return { ok: false, status: 403, code: "DEVICE_REVOKED", message: "This device token has been revoked. Ask the IT Committee for a new one." };

  const device = (await ctx.runQuery(internal.auth.deviceDoc, { deviceId: found.deviceId }))!;
  const bus = (await ctx.runQuery(internal.auth.busDoc, { busId: found.busId }))!;
  return { ok: true, device, bus };
}

export const deviceDoc = internalQuery({
  args: { deviceId: v.id("devices") },
  returns: v.union(v.null(), v.any()),
  handler: (ctx, args) => ctx.db.get(args.deviceId),
});

export const busDoc = internalQuery({
  args: { busId: v.id("buses") },
  returns: v.union(v.null(), v.any()),
  handler: (ctx, args) => ctx.db.get(args.busId),
});
