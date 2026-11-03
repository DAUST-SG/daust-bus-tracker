/*
 * fake-bus.ts — end-to-end replay harness for the driver + public HTTP API against a live Convex
 * deployment: pair → start shift → replay a ride as ping batches → replay it AGAIN (must be all
 * duplicates) → status → out-of-service → end.
 *
 * Usage:
 *   1) npx convex run seed:loadAll
 *   2) npx convex run devices:provision '{"busCode":"BUS-1","label":"fake-bus"}'   # copy the token
 *   3) npx tsx scripts/fake-bus.ts <https://<deployment>.convex.site> <token> [trace.json]
 *
 * Without a trace it drives the first itinerary's stops (seed coordinates) at 10 s per ping,
 * stopping 40 s at each. A trace is a JSON array of { lat, lng, speed?, accuracy? } at 10 s spacing
 * (e.g. a recorded ride from convex/__tests__/fixtures). Pings are back-dated to end "now".
 * Arrivals match the timetable only within matchWindowMinutes of its slots; outside that they are
 * logged `unscheduled`, which still exercises detection and idempotency.
 */
import { readFileSync } from "node:fs";
import { stops } from "../convex/seed/stops";

const [, , SITE, TOKEN, TRACE] = process.argv;
if (!SITE) {
  console.error("Usage: tsx scripts/fake-bus.ts <siteUrl> <deviceToken> [trace.json]");
  process.exit(1);
}

const STEP_MS = 10_000;
type Point = { lat: number; lng: number; speed?: number; accuracy?: number };
type Res = { status: number; body: any };

async function call(method: string, path: string, body?: unknown, auth = true): Promise<Res> {
  const headers: Record<string, string> = { "Content-Type": "application/json" };
  if (auth && TOKEN) headers.Authorization = `Bearer ${TOKEN}`;
  const r = await fetch(`${SITE}${path}`, { method, headers, body: body ? JSON.stringify(body) : undefined });
  const text = await r.text();
  return { status: r.status, body: text ? JSON.parse(text) : null };
}
const log = (label: string, r: Res) => console.log(`${r.status === 200 || r.status === 201 ? "✓" : "✗"} ${label} [${r.status}]`, JSON.stringify(r.body).slice(0, 200));

/** Synthetic ride through the itinerary's stops: 4 pings at rest, then ~10 m/s straight-line legs. */
function synthRide(stopNames: string[]): Point[] {
  const coords = stopNames.map((n) => stops.find((s) => s.name === n)).filter((s) => s !== undefined);
  const pts: Point[] = [];
  coords.forEach((s, i) => {
    for (let k = 0; k < 4; k++) pts.push({ lat: s.lat, lng: s.lng, speed: 0 });
    const next = coords[i + 1];
    if (!next) return;
    const legs = Math.max(3, Math.round(Math.hypot(next.lat - s.lat, next.lng - s.lng) * 111_000 / 100)); // ~100 m per ping
    for (let k = 1; k < legs; k++)
      pts.push({ lat: s.lat + ((next.lat - s.lat) * k) / legs, lng: s.lng + ((next.lng - s.lng) * k) / legs, speed: 10 });
  });
  return pts;
}

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
  if (!itinerary) {
    console.log("No itinerary available today — skipping the ride.");
    return;
  }

  const points: Point[] = TRACE ? JSON.parse(readFileSync(TRACE, "utf8")) : synthRide(itinerary.stops.map((s: { name: string }) => s.name));
  const t0 = Date.now() - points.length * STEP_MS;
  const pings = points.map((p, i) => ({
    clientId: `fake-${t0}-${i}`,
    recordedAt: t0 + i * STEP_MS,
    lat: p.lat,
    lng: p.lng,
    accuracy: p.accuracy ?? 5,
    speed: p.speed,
  }));

  const shift = await call("POST", "/api/v1/driver/shifts", { itineraryId: itinerary.id, startedAt: t0 - 1000 });
  log("POST /driver/shifts", shift);
  if (shift.status !== 201) {
    console.log("Shift did not start (OUTSIDE_SERVICE_HOURS, or a shift is already open). Exiting.");
    return;
  }

  // Send the ride twice: the second pass must be 100% duplicates (DoD: no duplicate stop events).
  for (const pass of ["ride", "replay"]) {
    let accepted = 0, duplicates = 0, rejected = 0;
    for (let i = 0; i < pings.length; i += 50) {
      const r = await call("POST", "/api/v1/driver/pings", { pings: pings.slice(i, i + 50), heartbeat: { batteryPercent: 80, isCharging: true, queuedCount: 0, appVersion: "0.0.0" } });
      if (r.status !== 200) log("POST /driver/pings", r);
      accepted += r.body?.accepted ?? 0;
      duplicates += r.body?.duplicates ?? 0;
      rejected += r.body?.rejected ?? 0;
    }
    const ok = pass === "ride" ? accepted > 0 : accepted === 0 && duplicates === pings.length;
    console.log(`${ok ? "✓" : "✗"} ${pass}: ${pings.length} pings → accepted ${accepted}, duplicates ${duplicates}, rejected ${rejected}`);
  }

  const status = await call("GET", "/api/v1/status", undefined, false);
  const me = status.body?.buses?.find((b: { code: string }) => b.code === config.body.bus.code);
  console.log(`  status: ${me?.label}  (next: ${me?.nextStop ? `${me.nextStop.name} ${me.nextStop.scheduledArrival}` : "none"})`);
  console.log("  stop events: npx convex data stopEvents --limit 10");

  log("PATCH /driver/state out_of_service", await call("PATCH", "/api/v1/driver/state", { serviceStatus: "out_of_service", reasonCode: "MECHANICAL", note: "test" }));
  log("PATCH /driver/state in_service", await call("PATCH", "/api/v1/driver/state", { serviceStatus: "in_service" }));
  log("POST /driver/shifts/end", await call("POST", "/api/v1/driver/shifts/end", { endedAt: Date.now(), reason: "driver" }));
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
