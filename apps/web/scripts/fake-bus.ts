/*
 * fake-bus.ts — end-to-end smoke harness for the driver + public HTTP API against a live Convex
 * deployment. Replays a short "ride" (pair → start shift → stream pings → status → out-of-service →
 * end) and exercises the public status endpoint.
 *
 * Usage:
 *   1) npx convex run seed:loadAll
 *   2) npx convex run devices:provision '{"busCode":"BUS-1","label":"fake-bus"}'   # copy the token
 *   3) npx tsx scripts/fake-bus.ts <https://<deployment>.convex.site> <token>
 *
 * Notes: the full timed ride (shift + arrival matching) is meaningful only during seeded weekday
 * service hours; otherwise shift start returns OUTSIDE_SERVICE_HOURS and the script smoke-tests the
 * clock-independent endpoints (health, pair, config, status). Deterministic detection/idempotency/
 * signal-lost coverage lives in the Vitest + convex-test suite.
 */
const [, , SITE, TOKEN] = process.argv;
if (!SITE) {
  console.error("Usage: tsx scripts/fake-bus.ts <siteUrl> <deviceToken>");
  process.exit(1);
}

// Seed stop coordinates (mirror convex/seed/stops.ts) — the driver config does not expose coords.
const STOPS: Record<string, { lat: number; lng: number }> = {
  WARDINI: { lat: 14.7, lng: -17.4 },
  SCHOOL: { lat: 14.708, lng: -17.4 },
};

type Res = { status: number; body: any };
async function call(method: string, path: string, body?: unknown, auth = true): Promise<Res> {
  const headers: Record<string, string> = { "Content-Type": "application/json" };
  if (auth && TOKEN) headers.Authorization = `Bearer ${TOKEN}`;
  const r = await fetch(`${SITE}${path}`, { method, headers, body: body ? JSON.stringify(body) : undefined });
  const text = await r.text();
  return { status: r.status, body: text ? JSON.parse(text) : null };
}
const log = (label: string, r: Res) => console.log(`${r.status === 200 || r.status === 201 ? "✓" : "✗"} ${label} [${r.status}]`, JSON.stringify(r.body).slice(0, 200));
const uuid = () => (globalThis.crypto as Crypto).randomUUID();
const atRest = (p: { lat: number; lng: number }, recordedAt: number) => ({ clientId: uuid(), recordedAt, lat: p.lat, lng: p.lng, accuracy: 5, speed: 0 });

async function main() {
  log("GET /health", await call("GET", "/api/v1/health", undefined, false));
  if (!TOKEN) {
    console.log("No token given — smoke-testing public status only.");
    log("GET /status", await call("GET", "/api/v1/status", undefined, false));
    return;
  }

  log("POST /driver/pair", await call("POST", "/api/v1/driver/pair", { deviceModel: "FakeBus", androidVersion: "14", appVersion: "0.0.0" }));
  const config = await call("GET", "/api/v1/driver/config");
  log("GET /driver/config", config);

  const itinerary = config.body?.itineraries?.[0];
  const now = Date.now();
  if (!itinerary) {
    console.log("No itinerary available today — skipping the timed ride.");
    log("GET /status", await call("GET", "/api/v1/status", undefined, false));
    return;
  }

  const shift = await call("POST", "/api/v1/driver/shifts", { itineraryId: itinerary.id, startedAt: now });
  log("POST /driver/shifts", shift);
  if (shift.status !== 201) {
    console.log("Shift did not start (likely OUTSIDE_SERVICE_HOURS). Smoke-testing status then exiting.");
    log("GET /status", await call("GET", "/api/v1/status", undefined, false));
    return;
  }

  // Stream a short stop at the first stop in the itinerary.
  const first = STOPS[itinerary.stops?.[0]?.name?.toUpperCase().includes("WARD") ? "WARDINI" : "SCHOOL"] ?? STOPS.WARDINI;
  const batch = [atRest(first, now - 20_000), atRest(first, now - 10_000)];
  log("POST /driver/pings (batch 1)", await call("POST", "/api/v1/driver/pings", { pings: batch, heartbeat: { batteryPercent: 80, isCharging: true, queuedCount: 0, appVersion: "0.0.0" } }));
  log("POST /driver/pings (replay → duplicates, DoD-2)", await call("POST", "/api/v1/driver/pings", { pings: batch }));

  log("GET /status", await call("GET", "/api/v1/status", undefined, false));
  log("PATCH /driver/state out_of_service", await call("PATCH", "/api/v1/driver/state", { serviceStatus: "out_of_service", reasonCode: "MECHANICAL", note: "test" }));
  log("PATCH /driver/state in_service", await call("PATCH", "/api/v1/driver/state", { serviceStatus: "in_service" }));
  log("POST /driver/shifts/end", await call("POST", "/api/v1/driver/shifts/end", { endedAt: Date.now(), reason: "driver" }));
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
