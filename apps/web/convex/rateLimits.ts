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
