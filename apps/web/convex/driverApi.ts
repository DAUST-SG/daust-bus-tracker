// Driver HTTP actions. Each authenticates via requireDevice, rate-limits, then delegates to an
// internal mutation/query. Bodies are treated as unknown and narrowed; errors use one JSON envelope.
import { httpAction } from "./_generated/server";
import { internal } from "./_generated/api";
import { ConvexError } from "convex/values";
import type { Id } from "./_generated/dataModel";
import type { PingInput } from "../shared/types";
import { requireDevice, type AuthResult } from "./auth";
import { rateLimiter } from "./rateLimits";

const headers = { "Content-Type": "application/json" };
const json = (data: unknown, status = 200) => new Response(JSON.stringify(data), { status, headers });
const err = (status: number, code: string, message: string, details?: Record<string, unknown>) =>
  json({ error: { code, message, details } }, status);

const STATUS_FOR: Record<string, number> = {
  SHIFT_ALREADY_ACTIVE: 409, SHIFT_NOT_ACTIVE: 409, OUTSIDE_SERVICE_HOURS: 403,
  ITINERARY_NOT_FOUND: 404, VALIDATION_ERROR: 400, NO_CONFIG: 500, SHIFT_NOT_FOUND: 404,
};
function mapError(e: unknown): Response {
  if (e instanceof ConvexError && e.data && typeof e.data === "object" && "code" in e.data) {
    const d = e.data as { code: string; message: string; details?: Record<string, unknown> };
    return err(STATUS_FOR[d.code] ?? 500, d.code, d.message, d.details);
  }
  return err(500, "INTERNAL_ERROR", "Unexpected server error.");
}

async function body(req: Request): Promise<Record<string, unknown>> {
  return (await req.json().catch(() => ({}))) as Record<string, unknown>;
}
const fail = (a: Extract<AuthResult, { ok: false }>) => err(a.status, a.code, a.message);

export const pair = httpAction(async (ctx, req) => {
  const auth = await requireDevice(ctx, req);
  if (!auth.ok) return fail(auth);
  const b = await body(req);
  if (typeof b.deviceModel !== "string") return err(400, "VALIDATION_ERROR", "deviceModel, androidVersion and appVersion are required.");
  await ctx.runMutation(internal.devices.recordPairing, {
    deviceId: auth.device._id,
    deviceModel: b.deviceModel,
    androidVersion: String(b.androidVersion ?? ""),
    appVersion: String(b.appVersion ?? ""),
  });
  return json({ device: { id: auth.device._id, label: auth.device.label }, bus: { code: auth.bus.code, name: auth.bus.name, type: auth.bus.type } });
});

export const getConfig = httpAction(async (ctx, req) => {
  const auth = await requireDevice(ctx, req);
  if (!auth.ok) return fail(auth);
  const rl = await rateLimiter.limit(ctx, "driver", { key: auth.device._id });
  if (!rl.ok) return err(429, "RATE_LIMITED", "Too many requests.", { retryAfterSeconds: Math.ceil((rl.retryAfter ?? 0) / 1000) });
  const data = await ctx.runQuery(internal.driverData.getConfig, { busId: auth.bus._id, now: Date.now() });
  if (!data) return err(500, "NO_CONFIG", "Config not seeded.");
  return json(data);
});

export const startShift = httpAction(async (ctx, req) => {
  const auth = await requireDevice(ctx, req);
  if (!auth.ok) return fail(auth);
  const rl = await rateLimiter.limit(ctx, "driver", { key: auth.device._id });
  if (!rl.ok) return err(429, "RATE_LIMITED", "Too many requests.", { retryAfterSeconds: Math.ceil((rl.retryAfter ?? 0) / 1000) });
  const b = await body(req);
  if (typeof b.itineraryId !== "string" || typeof b.startedAt !== "number") return err(400, "VALIDATION_ERROR", "itineraryId and startedAt are required.");
  try {
    const r = await ctx.runMutation(internal.shifts.start, {
      deviceId: auth.device._id,
      busId: auth.bus._id,
      itineraryId: b.itineraryId as Id<"itineraries">,
      startedAt: b.startedAt,
    });
    return json({ shift: { id: r.shiftId, busCode: auth.bus.code, itineraryId: b.itineraryId, startedAt: b.startedAt, serviceEndsAt: r.serviceEndsAt }, status: r.status }, 201);
  } catch (e) {
    return mapError(e);
  }
});

export const endShift = httpAction(async (ctx, req) => {
  const auth = await requireDevice(ctx, req);
  if (!auth.ok) return fail(auth);
  const rl = await rateLimiter.limit(ctx, "driver", { key: auth.device._id });
  if (!rl.ok) return err(429, "RATE_LIMITED", "Too many requests.", { retryAfterSeconds: Math.ceil((rl.retryAfter ?? 0) / 1000) });
  const b = await body(req);
  if (typeof b.endedAt !== "number") return err(400, "VALIDATION_ERROR", "endedAt is required.");
  const reason = b.reason === "service_hours_over" ? "service_hours_over" : "driver";
  try {
    const r = await ctx.runMutation(internal.shifts.end, { busId: auth.bus._id, endedAt: b.endedAt, reason });
    return json({ shift: { id: r.shiftId, endedAt: b.endedAt } });
  } catch (e) {
    return mapError(e);
  }
});

export const postPings = httpAction(async (ctx, req) => {
  const auth = await requireDevice(ctx, req);
  if (!auth.ok) return fail(auth);
  const b = await body(req);
  if (!Array.isArray(b.pings)) return err(400, "VALIDATION_ERROR", "pings[] is required.");
  if (b.pings.length > 50) return err(413, "BATCH_TOO_LARGE", "A batch may contain at most 50 pings.", { received: b.pings.length });
  const rl = await rateLimiter.limit(ctx, "pings", { key: auth.device._id });
  if (!rl.ok) return err(429, "RATE_LIMITED", "Too many requests.", { retryAfterSeconds: Math.ceil((rl.retryAfter ?? 0) / 1000) });
  try {
    const r = await ctx.runMutation(internal.ingest.ingestPings, {
      deviceId: auth.device._id,
      busId: auth.bus._id,
      pings: b.pings as PingInput[],
      heartbeat: b.heartbeat as { batteryPercent: number; isCharging: boolean; queuedCount: number; appVersion: string } | undefined,
    });
    return json(r);
  } catch (e) {
    return mapError(e);
  }
});

export const patchState = httpAction(async (ctx, req) => {
  const auth = await requireDevice(ctx, req);
  if (!auth.ok) return fail(auth);
  const rl = await rateLimiter.limit(ctx, "driver", { key: auth.device._id });
  if (!rl.ok) return err(429, "RATE_LIMITED", "Too many requests.", { retryAfterSeconds: Math.ceil((rl.retryAfter ?? 0) / 1000) });
  const b = await body(req);
  if (b.serviceStatus !== "out_of_service" && b.serviceStatus !== "in_service") return err(400, "VALIDATION_ERROR", "serviceStatus must be out_of_service or in_service.");
  try {
    const doc = await ctx.runMutation(internal.busState.set, {
      busId: auth.bus._id,
      serviceStatus: b.serviceStatus,
      reasonCode: typeof b.reasonCode === "string" ? b.reasonCode : undefined,
      note: typeof b.note === "string" ? b.note : undefined,
    });
    return json({
      status: {
        busCode: auth.bus.code,
        serviceStatus: doc.serviceStatus,
        motion: doc.motion ?? null,
        connectivity: doc.connectivity,
        reasonCode: typeof b.reasonCode === "string" ? b.reasonCode : null,
        reason: doc.reason ?? null,
        note: doc.note ?? null,
        since: doc.updatedAt,
      },
    });
  } catch (e) {
    return mapError(e);
  }
});
