// Usage: node scripts/ratelimit.mjs <siteUrl> <tokenFile.json>   (token file: {"token":"dbt_live_..."})
// Uses up the quota for that device and IP, so run it against a dev deployment.
// Fires each endpoint past its documented limit (API_DESIGN.md "Rate Limiting") and counts status codes.
import { readFileSync } from "node:fs";
const d = JSON.parse(readFileSync(process.argv[3], "utf8")); const token = d.token ?? d;
const B = `${process.argv[2]}/api/v1`;
const auth = { Authorization: `Bearer ${token}`, "Content-Type": "application/json" };
const ping = { clientId: "rl-test-1", recordedAt: Date.now() - 1000, lat: 14.75, lng: -17.4, accuracy: 10 }; // same id → duplicate, no data change
const cases = [
  ["POST /driver/pings (limit 30/min)", 35, () => fetch(`${B}/driver/pings`, { method: "POST", headers: auth, body: JSON.stringify({ pings: [ping] }) })],
  ["GET /driver/config (limit 20/min)", 25, () => fetch(`${B}/driver/config`, { headers: auth })],
  ["GET /status (limit 60/min per IP)", 65, () => fetch(`${B}/status`, { headers: { "x-forwarded-for": "203.0.113.7" } })],
  ["GET /status, spoofed first entry, proxy-added last entry", 65, (i) => fetch(`${B}/status`, { headers: { "x-forwarded-for": `198.51.100.${i}, 203.0.113.99` } })],
  ["POST /driver/pair bad token (limit 5 fails/15 min)", 8, () => fetch(`${B}/driver/pair`, { method: "POST", headers: { Authorization: "Bearer dbt_live_wrong", "Content-Type": "application/json" }, body: "{}" })],
];
for (const [name, n, fn] of cases) {
  const codes = {}; let first429 = null, retryHeader = null, body429 = null;
  for (let i = 0; i < n; i++) {
    const r = await fn(i);
    codes[r.status] = (codes[r.status] ?? 0) + 1;
    if (r.status === 429 && first429 === null) { first429 = i + 1; retryHeader = r.headers.get("retry-after"); body429 = await r.text(); } else await r.text();
  }
  console.log(`${name}: ${JSON.stringify(codes)}${first429 ? ` | first 429 at request ${first429}, Retry-After header: ${retryHeader}, body: ${body429}` : " | never limited"}`);
}
