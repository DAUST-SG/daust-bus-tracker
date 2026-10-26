// Public HTTP endpoints (no auth). GET /status mirrors the status.list read model; /health is liveness.
import { httpAction } from "./_generated/server";
import { api } from "./_generated/api";
import { rateLimiter } from "./rateLimits";

const headers = { "Content-Type": "application/json", "Access-Control-Allow-Origin": "*" };

export const getStatus = httpAction(async (ctx, req) => {
  const ip = req.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ?? "anon";
  const rl = await rateLimiter.limit(ctx, "status", { key: ip });
  if (!rl.ok) {
    return new Response(JSON.stringify({ error: { code: "RATE_LIMITED", message: "Too many requests.", details: { retryAfterSeconds: Math.ceil((rl.retryAfter ?? 0) / 1000) } } }), { status: 429, headers });
  }
  const buses = await ctx.runQuery(api.status.list, { now: Date.now() });
  return new Response(JSON.stringify({ generatedAt: Date.now(), buses }), { status: 200, headers });
});

export const health = httpAction(async () => new Response(JSON.stringify({ status: "ok", time: Date.now() }), { status: 200, headers }));
