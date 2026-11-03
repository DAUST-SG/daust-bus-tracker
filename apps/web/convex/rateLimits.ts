// Per-device / per-IP rate limits (API_DESIGN.md), via @convex-dev/rate-limiter so quota survives
// concurrency. Used only by the HTTP action layer; core mutations are unaffected.
import { RateLimiter, MINUTE } from "@convex-dev/rate-limiter";
import { components } from "./_generated/api";

export const rateLimiter = new RateLimiter(components.rateLimiter, {
  pings: { kind: "token bucket", rate: 30, period: MINUTE, capacity: 30 },
  driver: { kind: "token bucket", rate: 20, period: MINUTE, capacity: 20 },
  status: { kind: "token bucket", rate: 60, period: MINUTE, capacity: 60 },
  pairFail: { kind: "fixed window", rate: 5, period: 15 * MINUTE },
});

/** Caller IP for per-IP limits. The last x-forwarded-for entry is the one added by the proxy in front
 *  of Convex; earlier entries are whatever the client sent, so keying on them lets anyone dodge the limit. */
export function clientIp(req: Request): string {
  return req.headers.get("x-forwarded-for")?.split(",").pop()?.trim() || "anon";
}

/** 429 with the Retry-After header API_DESIGN.md promises (seconds), plus the same value in the body. */
export function tooManyRequests(retryAfterMs: number | undefined, headers: Record<string, string>): Response {
  const seconds = Math.max(1, Math.ceil((retryAfterMs ?? 0) / 1000));
  return new Response(
    JSON.stringify({ error: { code: "RATE_LIMITED", message: "Too many requests.", details: { retryAfterSeconds: seconds } } }),
    { status: 429, headers: { ...headers, "Retry-After": String(seconds) } },
  );
}
