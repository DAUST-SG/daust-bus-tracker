# Implementation Roadmap — DAUST Bus Tracker

| | |
|---|---|
| **Version** | 1.0 (prototype) |
| **Last Updated** | 2026-10-15 |
| **Total Sprints** | 8 (Oct 19 → Dec 12, 2026) |
| **Sprint Length** | 1 week (Monday → Sunday) |

> Reconciled with grilling decisions 2026-10-20. Decision record: `CONTEXT.md` +
> `docs/adr/`. Where this doc and `CONTEXT.md` disagree, `CONTEXT.md` wins.

The order is driven by risk: first prove the detection logic with simulated data, then prove a real phone keeps sending in the background, then open the page to students, then run the pilot that produces the data Student Affairs asked for.

## Status Legend

| Symbol | Meaning |
|--------|---------|
| ✅ | Done |
| 🔄 | In Progress |
| 📋 | Planned |
| ⏸ | Blocked |

---

#### Sprint 1 — Foundations and reference data (Oct 19–25)
**Goal:** The data model exists and the core detection logic is proven on simulated traces.
**Deliverable:** `npx convex run seed:loadAll` loads stops and timetables; geofence tests pass on recorded traces.

| # | Task | Type | Files Involved | Status |
|---|------|------|----------------|--------|
| 1 | Create repo, monorepo layout, CI (typecheck + tests) | `infra` | `.github/workflows/ci.yml`, `apps/web/package.json` | ✅ |
| 2 | Shared types and Convex schema with indexes | `feat` | `shared/types.ts`, `convex/schema.ts` | ✅ |
| 3 | Seed files with placeholder stops, 4 buses, one itinerary + timetable per bus | `feat` | `convex/seed/*`, `convex/seed.ts` | ✅ |
| 4 | Distance, time and service-hours helpers + tests | `feat` | `convex/lib/geo.ts`, `convex/lib/time.ts` | ✅ |
| 5 | Speed-aware geofence state machine + tests (full stop, quick stop below dwell, roll-by, jitter, overlapping-radii disambiguation) | `feat` | `convex/lib/geofence.ts`, `__tests__/geofence.test.ts` | ✅ |
| 6 | Record 2–3 real GPS traces on a bus ride (any GPS logger app) as test fixtures | `chore` | `__tests__/fixtures/*.json` | 📋 |
| 7 | Measure real coordinates of Wardini, Yves dorm, school, cafeteria | `chore` | `convex/seed/stops.ts` | 📋 |

**Definition of Done:**
- [x] Seed is idempotent (running it twice changes nothing)
- [x] Geofence tests cover arrival (full + quick at-rest stop), departure, roll-by, edge jitter and overlapping-radii disambiguation, all green in CI
- [ ] Real coordinates entered for at least the 4 main stops

---

#### Sprint 2 — Timetable logic and driver API (Oct 26–Nov 1)
**Goal:** A simulated bus driven by a script produces correct arrivals, delays and statuses through the real HTTP API.
**Deliverable:** `scripts/fake-bus.ts` replays a trace; Convex dashboard shows correct `stopEvents` and `busStatus`.

| # | Task | Type | Files Involved | Status |
|---|------|------|----------------|--------|
| 1 | Sequence-forward schedule matching + pointer anchoring, delays, flags + tests (on time, late bound to attempted visit, early-only-if-not-late, `undetected` skip, loops) | `feat` | `convex/lib/schedule.ts` | 📋 |
| 2 | Status derivation (serviceStatus/motion/connectivity + derived label) incl. "running late" before arrival + tests | `feat` | `convex/lib/status.ts` | 📋 |
| 3 | Device tokens: hash, provision, revoke, `requireDevice` | `feat` | `convex/auth.ts`, `convex/devices.ts` | 📋 |
| 4 | Shift start/end, ingest mutation, bus state mutation | `feat` | `convex/shifts.ts`, `convex/ingest.ts`, `convex/busState.ts` | 📋 |
| 5 | HTTP router + driver/public endpoints + rate limits | `feat` | `convex/http.ts`, `driverApi.ts`, `publicApi.ts`, `rateLimits.ts` | 📋 |
| 6 | Crons: signal lost (sets `connectivity` only + `onSignalLost` no-op stub), close shifts after hours, purge pings | `feat` | `convex/crons.ts`, `convex/busState.ts` | 📋 |
| 7 | Fake-bus replay script | `chore` | `apps/web/scripts/fake-bus.ts` | 📋 |

**Definition of Done:**
- [ ] Every endpoint in `API_CONTRACT.md` returns the documented shapes
- [ ] Replaying a trace twice produces no duplicate stop events
- [ ] Stopping the fake bus flips `connectivity` to `signal_lost` within 6 minutes (serviceStatus unchanged)
- [ ] Official timetables requested from Student Affairs (⏸ if not received)

---

#### Sprint 3 — Driver app on one real bus (Nov 2–8)
**Goal:** Prove a real phone keeps sending positions in the background for a full service day.
**Deliverable:** One bus tracked for 3 days with ≥ 90% coverage.

| # | Task | Type | Files Involved | Status |
|---|------|------|----------------|--------|
| 1 | Android project, manifest permissions, notification channel | `infra` | `AndroidManifest.xml`, `BusTrackerApp.kt`, `build.gradle.kts` | 📋 |
| 2 | Pairing screen + encrypted token store + config fetch | `feat` | `PairingScreen.kt`, `TokenStore.kt`, `BusApi.kt`, `ShiftRepository.kt` | 📋 |
| 3 | Foreground location service + accuracy filter | `feat` | `TrackingService.kt`, `LocationSource.kt` | 📋 |
| 4 | Room queue + batch uploader with backoff | `feat` | `AppDatabase.kt`, `PingDao.kt`, `Uploader.kt` | 📋 |
| 5 | Shift screen (start/stop, itinerary picker, queued count) | `feat` | `ShiftScreen.kt`, `ShiftViewModel.kt` | 📋 |
| 6 | Setup screen: battery-optimisation exemption + brand-specific tips | `feat` | `SetupScreen.kt` | 📋 |
| 7 | Service-hours auto-stop + resume after reboot | `feat` | `ServiceHoursGuard.kt`, `BootReceiver.kt` | 📋 |
| 8 | Meet drivers, explain the app, collect consent; install on Bus 1 | `chore` | — | 📋 |

**Definition of Done:**
- [ ] Screen off for 60+ min: positions keep arriving on the test phone and the driver's phone
- [ ] Airplane mode for 10 min: queued positions arrive in order afterwards
- [ ] Tracking stops by itself at the end of service hours
- [ ] Driver consent recorded

---

#### Sprint 4 — Student status page and all 4 buses (Nov 9–15)
**Goal:** Students can use the page; every bus is tracked.
**Deliverable:** Public URL shared with students; 4 buses paired.

| # | Task | Type | Files Involved | Status |
|---|------|------|----------------|--------|
| 1 | Convex provider, `useBusStatuses`, `useNow` | `feat` | `ConvexClientProvider.tsx`, `hooks/*` | 📋 |
| 2 | Status list + status line + badges + "updated X ago" | `feat` | `app/page.tsx`, `components/BusStatus*.tsx`, `lib/statusText.ts` | 📋 |
| 3 | Tune radii and dwell times using Sprint 3 data | `chore` | `convex/seed/stops.ts` | 📋 |
| 4 | Pair Bus 2–4 (school tablet if a driver has no Android phone) | `chore` | — | 📋 |
| 5 | Deploy web to Vercel, production Convex deployment | `infra` | Vercel / Convex settings | 📋 |
| 6 | Pre-launch survey to students (baseline) | `chore` | — | 📋 |

**Definition of Done:**
- [ ] Page loads in < 3 s on a throttled 3G profile, readable at 360 px width
- [ ] All 4 buses show live status during service hours
- [ ] Baseline survey has ≥ 50 responses

---

#### Sprint 5 — P1 features (Nov 16–22) · pilot week 1
**Goal:** Complete the features that make the pilot data useful for students and Student Affairs.
**Deliverable:** Map, per-bus log, out-of-service state and temporary itineraries live.

| # | Task | Type | Files Involved | Status |
|---|------|------|----------------|--------|
| 1 | Bus log query + page ("today's log", scheduled vs actual) | `feat` | `convex/status.ts`, `app/bus/[code]/page.tsx`, `BusLogTable.tsx` | 📋 |
| 2 | Map page with stops and buses | `feat` | `app/map/page.tsx`, `BusMap.tsx`, `convex/stops.ts` | 📋 |
| 3 | Out-of-service screen in the driver app | `feat` | `StateScreen.kt` | 📋 |
| 4 | Renovation shuttle as a temporary itinerary (data) + "Temporary route" label | `feat` | `convex/seed/itineraries.ts`, `BusStatusLine.tsx` | 📋 |
| 5 | Daily check of the health report; fix any phone issues | `chore` | `convex/reports.ts` | 📋 |

**Definition of Done:**
- [ ] A student can open a bus's log and show a late arrival with scheduled vs actual time
- [ ] Out-of-service state appears on the student page within 5 s
- [ ] Shuttle runs show as a temporary route

---

#### Sprint 6 — Polish and edge cases (Nov 23–29) · pilot week 2
**Goal:** Remove the rough edges students and drivers report.
**Deliverable:** Error, empty, stale and loading states everywhere; edge cases handled.

| # | Task | Type | Files Involved | Status |
|---|------|------|----------------|--------|
| 1 | Stale data styling, "data unavailable" state, loading skeletons | `feat` | `UpdatedAgo.tsx`, `BusStatusList.tsx` | 📋 |
| 2 | "Off shift" and "no service today" empty states | `feat` | `lib/statusText.ts`, `app/page.tsx` | 📋 |
| 3 | About page: how it works, what "late" means | `feat` | `app/about/page.tsx` | 📋 |
| 4 | Edge cases: reboot mid-shift, clock skew, shift left open, itinerary expiring mid-shift | `feat` | `ingest.ts`, `shifts.ts`, `BootReceiver.kt` | 📋 |
| 5 | Collect driver and student feedback | `chore` | — | 📋 |

**Definition of Done:**
- [ ] No unhandled error on any page with Convex offline
- [ ] All listed edge cases covered by a test or a documented manual check

---

#### Sprint 7 — Reporting and security review (Nov 30–Dec 6) · pilot week 3
**Goal:** Produce the evidence Student Affairs needs and make the system safe to hand over.
**Deliverable:** CSV export and coverage/accuracy numbers; security checklist done.

| # | Task | Type | Files Involved | Status |
|---|------|------|----------------|--------|
| 1 | CSV export of stop events; coverage report per bus | `feat` | `convex/reports.ts` | 📋 |
| 2 | 3 ride-along days to measure detection accuracy | `chore` | — | 📋 |
| 3 | Security review against `SECURITY.md` (tokens, CORS, rate limits, public data) | `chore` | `convex/*` | 📋 |
| 4 | Dependency audit; Dependabot enabled | `infra` | `.github/dependabot.yml` | 📋 |
| 5 | Post-pilot student survey | `chore` | — | 📋 |

**Definition of Done:**
- [ ] Coverage, detection accuracy and punctuality numbers computed for the whole pilot
- [ ] No critical/high vulnerabilities open

---

#### Sprint 8 — Pilot report and handover (Dec 7–12)
**Goal:** Deliver the go/no-go evidence and make sure the system outlives the current committee.
**Deliverable:** Pilot report to Student Affairs; handover documentation.

| # | Task | Type | Files Involved | Status |
|---|------|------|----------------|--------|
| 1 | Pilot report: coverage, accuracy, punctuality, survey before/after, costs | `chore` | `docs/pilot-report.md` | 📋 |
| 2 | Operations runbook: pair a phone, revoke a token, edit a stop, read health | `chore` | `docs/RUNBOOK.md` | 📋 |
| 3 | Move accounts (Convex, Vercel, GitHub) to committee-owned accounts | `infra` | — | 📋 |
| 4 | v2 scope proposal (coordinator panel, notifications, MyDAUST integration) | `chore` | `docs/v2-proposal.md` | 📋 |

**Definition of Done:**
- [ ] Report delivered to Student Affairs
- [ ] A second committee member can run every runbook task without help

---

## Full Feature Checklist

- [ ] Driver shift start/stop with one tap — Sprint 3
- [ ] Background location streaming with offline queue — Sprint 3
- [ ] Service-hours restriction (no off-duty tracking) — Sprint 3
- [ ] Battery-optimisation setup flow — Sprint 3
- [ ] Automatic arrival/departure detection (geofence) — Sprint 1–2
- [ ] Next destination from itinerary — Sprint 2
- [ ] Timetable windows, lateness and early-departure flags — Sprint 2
- [ ] Automatic bus state across three dimensions (serviceStatus / motion / connectivity) + derived label — Sprint 2
- [ ] Editable reference data via seed + dashboard — Sprint 1
- [ ] Health monitoring — Sprint 2 (cron) / Sprint 5 (report)
- [ ] Student live status page — Sprint 4
- [ ] Out-of-service state from driver app — Sprint 5
- [ ] Itinerary selection incl. temporary routes — Sprint 3 (picker) / Sprint 5 (shuttle)
- [ ] Today's punctuality log per bus — Sprint 5
- [ ] Map view — Sprint 5
- [ ] CSV export of punctuality log — Sprint 7

---

## Pilot Risks to Watch

The engineering is sound; the project's real risk lives in daily human upkeep and in
whether the product actually changes behaviour. These are the things the pilot must
*measure*, not assume — most of them first surface in the Sprint 3 one-bus test
(Product Decision B2). Each maps to a `PRODUCT_DECISIONS.md` bet.

| # | Risk (decision) | How we measure it | First checkpoint | Trigger / fallback |
|---|---|---|---|---|
| R1 | **Phones unreliable in the background** (A1) — the axis that killed v1 | Coverage: % of service minutes with a position < 2 min old, per bus; note OS/brand that drops | Sprint 3 (1 bus, 3 days) | < 90% coverage after exemption tuning → pull the dedicated-tracker escape hatch (same `/pings` endpoint) |
| R2 | **Drivers don't start the shift** (A1/B1) — a bus with no shift is invisible | Shift started on ≥ 90% of service days per driver (`shifts` table) | Sprint 3, then weekly | Persistent misses → escalate to the School mandate behind B1 |
| R3 | **It doesn't cut the "where is the bus?" calls** (B1) — the adoption carrot | Before/after count of calls/messages to drivers & staff; driver report at feedback meeting | Sprint 6 feedback (pilot wk 2) | No drop → the value story is wrong; revisit A2/A3 before v2 |
| R4 | **Detection accuracy too low** (speed-aware + radii) | ≥ 95% real stops detected, < 5% false arrivals, via 3 ride-along days vs `stopEvents` | Sprint 7 ride-alongs | Tune radii/dwell/speed thresholds (data, not code) before judging |
| R5 | **Silent failures go unnoticed** (A1 health-view-only) | Count of signal-lost events caught late because nobody opened the health view | Sprint 5 daily health check | Any missed-for-hours case → flip on the `onSignalLost` webhook (config change) |
| R6 | **Battery / data cost on drivers** (A1/A4) | Heartbeat battery trend; data use per phone; driver complaints | Sprint 3 | Confirm School top-up + chargers (D1 partnership) are actually in place |
| R7 | **Students don't show up** (E3) — awareness, not tech | Unique daily visitors (Vercel analytics) vs the 150 target | Sprint 4 launch → pilot | Below target → push QR/WhatsApp/MyDAUST channels harder before concluding |
| R8 | **Bilingual gaps** (E1) — French reason leaks onto EN page, untranslated driver copy | Manual review of driver app (FR) and student page (EN); check reason-code labels | Sprint 5 (out-of-service screen) | Fix via the `{ code, fr, en }` reason scheme already specified |

**Go/no-go for full rollout (end of Sprint 3):** R1 coverage ≥ 90% on one bus for 3
consecutive days **and** R2 shift started every service day. If both hold, expand to
all 4 buses (B2); if not, fix or switch sensor before widening the pilot.
