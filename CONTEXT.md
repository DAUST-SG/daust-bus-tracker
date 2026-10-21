# CONTEXT — DAUST Bus Tracker

Domain glossary and modeling decisions. Terms are canonical: use these names in
code, docs and conversation. Challenge and update this file as the model changes.

## Glossary

### Itinerary
The ordered circuit a bus runs on a given service day — e.g. `BUS1-WEEKDAY` or
`RENOVATION-SHUTTLE`. **The real-world service is a repeating loop**: the same short
circuit of stops (e.g. Wardini → School → Café → Wardini) repeated on a cadence
until service hours end — not a long varied linear journey.

**Punctuality model: fixed clock times (not headway).** DAUST already publishes a
real per-visit wall-clock timetable (e.g. Wardini 08:00, 08:20, …) that drivers are
held to. "Late" = arrival vs *this visit's* `arriveBy`, not headway adherence.

**Model decision: flat enumerated `scheduleEntries`** (one row per stop-visit for
the whole day). Chosen because the source timetable is itself already enumerated, so
the table directly mirrors existing data — no recurrence engine to build for the
pilot. Accepted costs: (1) editing service hours means re-enumerating rows;
(2) the same stop appears as N distinct rows, forcing the "which of the N identical
visits does this arrival belong to?" matching problem (see Arrival matching).

### Stop-visit (scheduleEntry)
A single scheduled visit to one stop within an itinerary, with `sequence`,
`arriveBy` and `departAt`. The unit against which punctuality is judged. In a loop,
the same stop appears as many distinct stop-visits (different sequence/times).

### Arrival matching (sequence-forward)
How a detected arrival is bound to the stop-visit it was trying to make. **Rule:
consume the schedule in order.** `busStatus.nextEntryId` points at the next
unvisited stop-visit. An arrival at stop X is matched to the earliest unvisited
entry whose `stopId = X`. The loop structure guarantees this is the visit the bus is
actually on, *however late it is*.

This deliberately **replaces** the schema's original `matchWindowMinutes`
nearest-scheduled-time matching, which mis-assigns a late arrival to the *next*
scheduled visit and thereby erases the lateness — defeating the headline feature.
`matchWindowMinutes` is demoted to a sanity guard (flag/ignore arrivals absurdly far
from the expected slot), not the primary key. See ADR 0001.

### Arrival detection (speed-aware, dwell as fallback)
An arrival fires when the bus is inside a stop's entry radius **and comes to rest** —
`speed` below ~2 m/s for a short confirm window (2–3 consecutive pings ≈ 20–30 s).
Rationale: with decision (A) a late bus makes *quick* stops (<30 s), so pure
dwell-time can't tell a brief real stop from a slow roll-by. Speed can: a genuine
stop reaches ≈0; a roll-through never does.
- `dwellSeconds` (time inside radius) is the **fallback** when `speed` is
  missing/unreliable on a phone; default lowered to ~15–20 s.
- A quick stop caught this way is a **real arrival** (often flagged `late`), not
  `undetected`. A true roll-through (late bus skipping) stays `undetected` — this is
  a wanted signal, not an error.
- Limit: a stop shorter than ~10 s may still be missed at a 10–15 s ping interval.
  Acceptable — barely a stop. Depends on `departAt` being a no-earlier-than floor
  (see Punctuality / departAt).

### Punctuality / departAt (no-earlier-than floor)
`departAt` is a *floor*, enforced only when the bus is on time or early. A late bus
departs as soon as its passenger dwell is done (does not wait for `departAt`), so
road delay is an input each visit inherits — the data then shows whether drivers
recover or fall further behind. `early_departure` flags only a bus that left before
`departAt` **and** was not already late on arrival. `departureDeltaMinutes` records
actual `departedAt − departAt` honestly (negative = early).

### Skipped / missed visit
Detected when an arrival matches an entry *ahead of* `nextEntryId` (bus showed up
downstream). The intervening stop-visits are auto-advanced past and each recorded as
a `stopEvents` row with `arrivedAt = null` and flag **`undetected`** (NOT a
confident "driver skipped" — it may equally be a detection miss). No driver prompt,
no state change: the driver app stays dumb and the bus keeps running.

### Overdue / stalled
Distinct from a skip: the bus has not arrived *anywhere*. Well past `arriveBy` with
no arrival → student-facing "running late". If it persists (signal present, zero
progress for N minutes) or goes `signal_lost`, raise a **passive coordinator/IT
flag** in the health view. Never a driver prompt, never auto out-of-service —
non-response from a safely-driving driver is the expected default, so silence must
not trigger the most student-damaging action (a false `out_of_service`).

### Bus state (three orthogonal dimensions, derived display)
Replaces the single `busStatus.state` enum, which collapsed independent conditions
and lost history (a bus can be out-of-service *and* last-seen-holding-at-Wardini).
Split into:
- **`serviceStatus`**: `off_shift | in_service | out_of_service` — declared /
  operational; driver- or schedule-driven; changes rarely. Tracking may keep running
  while `out_of_service`.
- **`motion`**: `active | holding` — derived from GPS while in service.
- **`connectivity`**: `live | stale | signal_lost` — derived from `lastPingAt` age.
The student-facing label is **computed** from all three (out_of_service dominates the
headline; otherwise motion + connectivity compose, e.g. "holding at Wardini · signal
lost 6 min ago"). The `checkSignalLost` cron only ever writes `connectivity`, never
clobbering operational state.

### Pointer anchoring (re-anchor by scheduled time)
`nextEntryId` is never trusted blindly by position; it is **anchored by scheduled
clock time**. At shift start and after any gap longer than ~one headway (e.g. after
`signal_lost`), set it to the first unvisited entry whose `arriveBy ≥ now − lateGrace`
— the soonest visit the bus could plausibly still be heading to. This prevents a
late-started shift or a blackout from cascade-matching old entries.

### Not-in-service vs undetected
Two different reasons an entry has no detected arrival:
- **Not in service** — no shift covered that entry's time (driver started late /
  ended early / off-duty). Produces **no** `stopEvents` row; it is not a punctuality
  miss, just outside the service window.
- **Undetected** — a shift *was* active across the entry but no arrival was seen.
  Produces a `stopEvents` row flagged `undetected` and counts as a miss.
Only `undetected` affects coverage/accuracy metrics.

### Geofence disambiguation (overlapping radii)
On a small campus two stops' radii can overlap. Resolution:
- **Arrival:** when a ping is inside ≥1 radius, only the stop matching `nextEntryId`
  (expected next) is considered; other overlapping stops are ignored. The schedule,
  not geometry, decides "where the bus is". (Nearest-centre-by-distance is rejected —
  it reintroduces the ambiguity sequence-forward removed.)
- **Departure:** fires when the bus leaves the *current* stop's own exit radius,
  even if it is now inside another stop's radius. No global "outside" phase required.
- **Data hygiene:** the seed loader warns when two stops are closer than the sum of
  their radii. Fix geometry in data, not with code.

### Out-of-service / "indefinite" route change
Always **driver-initiated when safely stopped** (out-of-service + reason, or picking
a temporary itinerary) — never demanded by the system mid-drive.

## Operational & platform decisions (Batches A–E, accepted 2026-10-19)

**Reliability (A)**
- A1 — Silent-failure surface is the **health view only** (user's decision, 2026-10-19).
  ⚠ Known risk: this is passive and is the v1 failure mode (works only if someone
  habitually opens the dashboard). Hedge accepted: `checkSignalLost` keeps a stubbed
  `onSignalLost` notifier hook (no-op in v1) so enabling a Telegram/email webhook is a
  config flip, not a redesign, if the first pilot week shows missed failures.
- A2 — Shift/service-hours close ends *collection*, not *upload*. Buffered points
  keep uploading (24 h cap), attributed to the shift they were recorded in.
- A3 — Detection & lateness use device **`recordedAt`** (GPS time); `receivedAt` is
  for connectivity/age only. Reject pings whose clocks are implausibly far apart.
- A4 — School covers data top-up + car charger per bus (operational risk if not).

**Device identity & security (B)**
- B1 — Re-pairing a bus revokes the previous device (`revokedAt`); exactly one
  non-revoked device per bus, enforced in `provision`.
- B2 — Stolen-token blast radius (one bus, service hours, no personal data) accepted
  for the pilot; mitigation is easy revoke + re-pair. No device attestation in v1.
- B3 — Student page is **public, read-only, no personal data**; driver identity
  never exposed. (DAUST-restricted would add an SSO/password dependency — not taken.)

**Time & schedule governance (C)**
- C1 — "Service day" = calendar date in **Africa/Dakar** at event time. Service
  06:30–22:00, so nothing crosses midnight in v1.
- C2 — Config/schedule is **frozen into a shift at its start**; dashboard edits apply
  to the *next* shift, never retroactively re-flag a running bus. Seed files remain
  source of truth; dashboard is for live tuning.
- C3 — A single transport coordinator owns schedule/stop data; IT applies changes via
  seed PR + dashboard (process, not code).

**Student-facing (D)**
- D1 — `stale` (>120 s, data shown greyed) and `signal_lost` (>300 s on shift,
  explicit status) are distinct — a soft visual cue vs a stated status.
- D2 — `off_shift` buses show "Not running" (+ next start time if today) and **no
  position**.
- D3 — "Today's log" shows the whole planned day: past visits resolved (actual vs
  scheduled + flags), future ones as "scheduled".

**Data lifecycle (E)**
- E1 — `pings` purged after 30 days; `stopEvents` kept permanently (arrivals/
  departures only, no continuous track). Driver consent form states this. (Would drop
  to ~72 h only if drivers object.)
- E2 — CSV export carries bus code, stop, scheduled vs actual, flags — no driver
  name, no raw coordinates.

## Logic decisions (D1–D9, accepted 2026-10-21)

- **D1 — Out-of-order / backlog pings (see ADR 0002).** Pings process live for the
  real-time `busStatus` view. When a batch contains points older than the shift's
  `lastProcessedRecordedAt`, set `shifts.needsReconcile` and re-run the **pure**
  geofence+schedule pass over all that shift's pings in `recordedAt` order, replacing
  that shift's `stopEvents` and recomputing the pointer. `stopEvents` are idempotent
  on `(shiftId, scheduleEntryId)`; an `undetected` row vanishes on replay if the
  backlog reveals a real arrival. Live `busStatus` only ever reflects the newest
  point (never rewound by replay). Net: live view = best-effort now; `stopEvents` =
  eventually correct once all pings land. This delivers "log corrected retroactively".
- **D2 — Open stopEvent closure.** If a bus is `inside` a stop when the shift ends or
  goes `signal_lost`, close the open `stopEvent` with `departedAt = null` and flag
  `departure_unknown`. Never invent a departure, never leave it half-open.
- **D3 — `connectivity` stored vs derived.** `busStatus.connectivity` stores only
  `live | signal_lost` (cron-written). `stale` is computed at read time in the status
  view from `lastPingAt` age. View precedence: `signal_lost` if stored → else `stale`
  if age > `staleAfterSeconds` → else `live`. One writer, no contradiction.
- **D4 — Timetable-less temporary itineraries.** When `arriveBy`/`departAt` are
  omitted, match **pure sequence-forward** (next stop in `sequence` order) and anchor
  the pointer by sequence position, not time. No punctuality computed; students see
  position + next stop, never "late".
- **D5 — `motion` rule.** `motion = holding` when geofence phase is `inside`;
  `active` otherwise (entering/outside) while in service; absent when `off_shift`.
- **D6 — `unscheduled` flag.** An at-rest arrival that matches no forward entry
  within the sanity window is recorded with `scheduleEntryId = null` and flag
  `unscheduled` (e.g. a stop not on today's itinerary).
- **D7 — `daysOfWeek` vs `serviceHours.days`.** They answer different questions and
  both must pass: `config.serviceHours.days` decides whether the *service* runs today
  at all; `itinerary.daysOfWeek` + `validFrom/validUntil` filter *which itineraries* a
  driver may pick. No single winner.
- **D8 — Multiple shifts per day.** Sequential shifts per bus per day are allowed
  (one active at a time, enforced). Each shift start re-anchors the pointer by time
  (D-pointer-anchoring). `busLog` unions all of today's shifts; gaps between shifts
  render as "not in service".
- **D9 — UI language (SUPERSEDED by Product Decision E1).** Bilingual from v1: the
  **driver Android app is in French**, the **student web page is in English**. Student
  copy still routes through `lib/statusText.ts` so a later French student mode is cheap.
  See `Docs/PRODUCT_DECISIONS.md` E1.

### Forks — all resolved
A1 resolved (health view only + stubbed notifier hedge). No open forks.
