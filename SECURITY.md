# Security — DAUST Bus Tracker

| | |
|---|---|
| **Version** | 1.0 (prototype) |
| **Last Updated** | 2026-10-20 (reconciled with grilling decisions) |

> Decision record: `CONTEXT.md` + `docs/adr/`. Reconciled: student page confirmed
> public read-only (B3); `out_of_service` is the `serviceStatus` dimension; the health
> view is the only silent-failure alert surface in v1 (operators must check it daily).

## 1. Threat Model

### Assets to Protect
- **Driver location privacy** — positions come from drivers' personal phones; they must never be tracked off duty.
- **Integrity of bus data** — fake positions or states would mislead hundreds of students and corrupt the punctuality record.
- **Punctuality log** — used by Student Affairs for decisions and by students as evidence of lateness; it must be trustworthy.
- **Device tokens** — whoever holds one can write data for a bus.
- **Convex deploy keys and dashboard access** — full control of the system.
- **Availability during service hours** — the page is useless if it is down at 7:30.

### Threat Actors
- **Curious or prankster student** — tries to post fake positions or mark a bus out of service.
- **Lost or stolen driver phone** — token remains on the device.
- **Former committee member** — still has dashboard access after leaving.
- **Outside scraper** — uses the public API to follow bus movements.
- **Accidental insider error** — a committee member edits a stop radius or timetable wrongly in the dashboard.

### Key Risks
| Risk | Likelihood | Impact | Mitigation |
|---|---|---|---|
| Driver tracked outside working hours | Medium | High (trust, consent) | Server rejects pings outside service hours; app auto-stops; no positions exposed for `off_shift` buses |
| Forged pings with a leaked token | Low | High | Hashed tokens, per-bus revocation, rate limits, plausibility check (speed > 33 m/s rejected) |
| Lost driver phone | Medium | Medium | `devices:revoke` in one command; new token issued |
| Public API used to track bus movements | Medium | Low | Only bus positions during service; no driver identity anywhere in public data |
| Wrong reference data edited in dashboard | Medium | Medium | Seed files in Git are the source of truth; dashboard edits mirrored back to seed via PR |
| Ex-member keeps admin access | Medium | High | Access review at every committee handover; deploy keys rotated |
| Brute-forcing device tokens | Low | Medium | 32-byte random tokens; 5 failed attempts per IP per 15 min |
| Backend down during peak hours | Low | Medium | Managed hosting; health endpoint; page shows "data unavailable" instead of stale data |

## 2. Authentication & Authorization

- **Driver devices:** opaque bearer tokens, format `dbt_live_<43 base64url chars>` (32 random bytes). Issued by `devices:provision`, shown once, stored on the phone in DataStore encrypted with an Android Keystore key. Stored server-side only as `SHA-256(token + DEVICE_TOKEN_PEPPER)`.
- **Token expiry:** no time expiry (phones are unattended devices); revoked manually. Tokens are rotated at the start of every semester.
  <!-- assumed: per-semester rotation is a practical balance for 4 devices -->
- **Students:** no authentication in v1; read-only public data.
- **Operators:** IT Committee members access the Convex dashboard with personal Convex accounts in a team; minimum 2, maximum 4 admins.
- **Roles & rules:**
  - A device can write only for the bus it is linked to.
  - A device can start a shift only within service hours and only with an itinerary assigned to its bus.
  - Only internal functions (CLI/dashboard) can create devices, edit reference data or export reports.
  - v2 will add a `coordinator` role (Convex Auth) for the panel.

## 3. Data Security

- **Hashing:** device tokens hashed with SHA-256 + server-side pepper; no passwords exist in v1.
- **PII fields:** none collected about students. For drivers: none stored by name; buses are identified by code. Device model and battery level are operational data, never public.
- **Location data:** positions are linked to a bus, not a person. Raw pings deleted after 30 days; only stop events (arrival/departure times) are kept long-term.
- **In transit:** HTTPS/TLS everywhere (Convex and Vercel enforce it). The Android app sets `usesCleartextTraffic="false"`.
- **At rest:** encrypted by Convex's managed infrastructure; token on the phone encrypted with a Keystore-backed key.
- **Driver consent:** written consent from each driver before the pilot, stating what is collected, when, who sees it, and how long it is kept.
<!-- assumed: consent form to be prepared with Student Affairs -->

## 4. Secrets Management

- **`.env` policy:** `.env.local` and `local.properties` are git-ignored; only `.env.example` with placeholder values is committed.
- **Production secrets:** `DEVICE_TOKEN_PEPPER` lives in Convex environment variables; `CONVEX_DEPLOY_KEY` in Vercel project env vars; the APK signing keystore stored offline by the committee head plus one backup holder.
- **Rotation:**
  - Device tokens: every semester and immediately on a lost phone.
  - Convex deploy key: at each committee handover.
  - Pepper: only if suspected compromised (requires re-provisioning all devices).
- Never paste tokens or keys into chats, group messages or issues.

## 5. API Security

- **Input validation:** every HTTP action validates the body with Convex validators (`v.object(...)`) before calling internal mutations; coordinates, accuracy, timestamps and string lengths bounded.
- **Plausibility checks:** pings with `recordedAt` more than 24 h old or 2 min in the future are rejected; implied speed between consecutive pings above 33 m/s (~120 km/h) is rejected.
- **Rate limiting:** see `API_DESIGN.md` (per device and per IP, Convex rate-limiter component).
- **CORS:** driver endpoints do not send CORS headers (not callable from browsers); `GET /status` allows `*` (public read data).
- **Webhooks:** none in v1.
- **Errors:** generic messages; no stack traces or internal IDs beyond what the client needs.

## 6. Dependency Security

- **Audit process:** `npm audit --omit=dev` and Android Gradle dependency check run before each release.
- **Automated updates:** Dependabot (GitHub) for npm and Gradle, weekly, grouped minor updates.
- **CVE policy:** critical/high vulnerabilities in runtime dependencies fixed within 7 days; others at the next release.
- Keep dependencies few: no analytics SDKs in the driver app.

## 7. Incident Response

1. **Detect** — the `reports:health` view shows a bus without pings (the only automated silent-failure signal in v1, so it must be checked daily — see `CONTEXT.md` A1), students report wrong data, or unexpected writes appear in the dashboard logs.
2. **Contain** — revoke the affected device token (`devices:revoke`); if reference data was corrupted, re-run `seed:loadAll` from Git; if the dashboard was compromised, remove members and rotate deploy keys.
3. **Assess** — check Convex function logs and `stateChanges`/`pings` for the affected period; list wrong stop events.
4. **Notify** — inform the committee head and Student Affairs within 24 h; post a short notice on the status page if students saw wrong data.
5. **Fix** — correct the root cause, mark affected `stopEvents` as invalid (flag, never delete), re-issue tokens.
6. **Post-mortem** — one-page write-up in `docs/incidents/` within a week: what happened, impact, fix, prevention.
