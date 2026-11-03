// Public HTTP endpoints (no auth). GET /status mirrors the status.list read model; /health is liveness.
import { httpAction } from "./_generated/server";
import { api } from "./_generated/api";
import { clientIp, rateLimiter, tooManyRequests } from "./rateLimits";

const headers = { "Content-Type": "application/json", "Access-Control-Allow-Origin": "*" };

export const getStatus = httpAction(async (ctx, req) => {
  const rl = await rateLimiter.limit(ctx, "status", { key: clientIp(req) });
  if (!rl.ok) return tooManyRequests(rl.retryAfter, headers);
  const buses = await ctx.runQuery(api.status.list, { now: Date.now() });
  return new Response(JSON.stringify({ generatedAt: Date.now(), buses }), { status: 200, headers });
});

export const health = httpAction(async () => new Response(JSON.stringify({ status: "ok", time: Date.now() }), { status: 200, headers }));
