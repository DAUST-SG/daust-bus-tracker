# Product Requirements Document — DAUST Bus Tracker

| | |
|---|---|
| **Version** | 1.0 (prototype) |
| **Status** | Approved for prototype by Student Affairs, pending validation with real data |
| **Last Updated** | 2026-10-19 (reconciled with grilling decisions) |
| **Author** | Mohamed (Head, DAUST IT Committee) |

> Decisions from the design grilling are recorded in `CONTEXT.md` and `docs/adr/`.
> Where this doc and `CONTEXT.md` disagree, `CONTEXT.md` wins.

<!-- assumed: "approved for prototype" reflects Student Affairs asking for a prototype with real data -->

## 1. Problem Statement

DAUST runs 4 buses between the dorms (e.g. Wardini, Yves dorm), the school and the cafeteria. Students do not know where a bus is, nor where it is going next. Location alone is not enough: a bus seen near a dorm might be arriving, leaving, or heading elsewhere.

The consequences are daily: students wait at the wrong stop, leave too early or too late, miss buses, and flood group chats with "where is the bus?". When a bus is late, students arrive late to class with no way to prove why. Temporary situations make it worse: during the current road renovation a small bus shuttles students about 5 km around the works, and nobody is informed of the changed route.

A previous tracker used one dedicated GPS device with a SIM card needing data top-ups. It was lost, and buying 4 replacements was judged too costly and hard to maintain. That system failed on upkeep, not technology.

## 2. Product Vision

Within 12 months, every DAUST student checks the bus status instead of guessing, and Student Affairs uses the punctuality data to run the bus service. The status page is part of the MyDAUST hub; buses keep to their timetables because lateness is visible; a transport coordinator manages states and temporary routes from a simple panel; and the system survives committee handovers because it needs no special hardware and is fully documented.

## 3. Target Users

### Students
- **Who:** DAUST students living in the dorms who use the buses daily.
- **Goal:** Know whether to leave now, wait, or take another option.
- **Pain point:** No information on bus location, direction or lateness; no proof when a late bus made them late.

### Drivers
- **Who:** The 4 bus drivers (and replacement drivers).
- **Goal:** Do their route without extra work; fewer calls and complaints from students.
- **Pain point:** Any app that needs attention while driving, drains their battery or data, or feels like personal surveillance.

### Student Affairs / transport coordinator
- **Who:** Staff responsible for student transport.
- **Goal:** Know whether the service runs on time; have evidence to decide on the project.
- **Pain point:** No data on punctuality; complaints without facts.

### IT Committee (operators)
- **Who:** Committee members who build and maintain the system.
- **Goal:** A system that keeps working with little upkeep and can be handed over.
- **Pain point:** Silent failures (a phone stops sending and nobody notices), as with the previous tracker.

## 4. User Stories

### P0
- As a **student**, I want to see where each bus is and which stop it is heading to, so that I go to the right stop at the right time.
- As a **student**, I want to see whether a bus is on time or late (and by how much), so that I can decide what to do when it is late.
- As a **student**, I want to see when each bus last updated, so that I don't trust a frozen position.
- As a **driver**, I want to start my shift with one tap and never touch the phone while driving, so that the app doesn't distract me.
- As a **driver**, I want tracking to stop outside service hours, so that I am never tracked off duty.
- As **Student Affairs**, I want every arrival and departure recorded against the timetable, so that I can judge the project on real data.
- As an **IT Committee member**, I want to change stops, radii, itineraries and times without changing code, so that we can tune the system during the pilot.
- As an **IT Committee member**, I want a bus flagged when its phone stops sending, so that failures are noticed within minutes.

### P1
- As a **driver**, I want to choose a temporary itinerary (e.g. the renovation shuttle) at shift start, so that students see the real route.
- As a **driver**, I want to mark my bus out of service with a reason, so that students stop waiting for it.
- As a **student**, I want to see today's arrival log for a bus, so that I can show a late arrival as the reason I was late.
- As a **student**, I want a map view of the buses, so that I can see positions when I need more than the status line.
- As **Student Affairs**, I want a CSV export of the punctuality log, so that I can analyse it.

### P2
- As a **student**, I want a push notification when my bus leaves the previous stop, so that I don't have to keep checking.
- As a **transport coordinator**, I want a panel to set bus states and create temporary routes, so that I can manage exceptions myself. *(v2)*
- As a **student**, I want the status inside the MyDAUST hub, so that all school services are in one place.

## 5. Feature Specifications

### 5.1 Driver shift and location streaming
**Priority:** P0
**Description:** Native Android app paired with one bus via a device token. The driver taps "Start shift"; a foreground service with a permanent notification sends GPS positions every 10–15 s, buffering them locally when offline. The shift ends on tap or automatically at the end of service hours.

**Acceptance Criteria:**
- [ ] A phone is paired to one bus by entering a one-time device token
- [ ] Positions are sent every 10–15 s while the shift is active, including with the screen off for 60+ minutes on the test phones
- [ ] Positions with accuracy worse than 50 m are discarded on the device
- [ ] With no network, positions are queued (up to 24 h) and uploaded in order when the network returns
- [ ] Tracking cannot run outside configured service hours; it stops automatically at the end
- [ ] The app requests exemption from battery optimisation and shows brand-specific instructions on first setup

### 5.2 Automatic arrival and departure detection
**Priority:** P0
**Description:** Each stop has a coordinate and an entry radius. An arrival is recorded when a bus enters the radius **and comes to rest** (speed near zero); a departure when it leaves the larger exit radius. Arrivals are bound to timetable entries **sequence-forward** (the next expected visit), so a late bus is matched to the visit it was attempting.

**Acceptance Criteria:**
- [ ] Arrival recorded when the bus is inside the entry radius (default 75 m) **and** at rest — speed below `stopSpeedThreshold` for `restConfirmPings`; `dwellSeconds` (~20 s) is the fallback when speed is unavailable
- [ ] A late bus making a brief (<30 s) real stop is still recorded as an arrival
- [ ] Departure recorded when the bus leaves the exit radius (entry radius + 40 m), keyed to the current stop even if it enters another stop's radius
- [ ] A bus driving/rolling past a stop without stopping produces no arrival (and, if a shift was active, the entry is logged `undetected`)
- [ ] Overlapping stop radii are disambiguated by the expected next stop; the seed loader warns when two stops' circles overlap
- [ ] GPS jitter near the radius edge does not produce repeated arrivals/departures
- [ ] Each stop's coordinate, entry radius, dwell and speed thresholds are editable data

### 5.3 Timetable windows and lateness
**Priority:** P0
**Description:** Each itinerary has timetable entries per stop: an arrival time and a departure time (e.g. Wardini arrive 14:00, depart 14:05). The bus must be at the stop by the arrival time and leave at the departure time.

**Acceptance Criteria:**
- [ ] Each arrival is matched **sequence-forward** to the next unvisited entry for that stop and stored with its delay in minutes
- [ ] Arrival after the arrival time + 2 min grace is flagged **late**
- [ ] `departAt` is a no-earlier-than floor: a late bus leaves as soon as its dwell is done and is not held
- [ ] Departure before `departAt` is flagged **early departure** only when the bus was not already late on arrival
- [ ] If the arrival time has passed and the bus has not arrived, the status shows "running late" with the current delay
- [ ] Lateness is computed from device GPS time (`recordedAt`), not server receive time
- [ ] Times are interpreted in Africa/Dakar time

<!-- assumed: 2-minute grace period before an arrival counts as late; configurable -->

### 5.4 Bus states
**Priority:** P0 (automatic states), P1 (out of service)
**Description:** A bus's status is **three orthogonal dimensions**, not one value, so overlapping conditions don't overwrite each other: `serviceStatus` (`off_shift` / `in_service` / `out_of_service`, declared), `motion` (`active` / `holding`, from GPS), and `connectivity` (`live` / `stale` / `signal_lost`, from last-ping age). The student-facing label is derived from all three.

**Acceptance Criteria:**
- [ ] `motion` (`active` / `holding`) set automatically by detection
- [ ] `connectivity = signal_lost` set by a cron job within 1 minute of crossing the 5-minute threshold, **without** changing `serviceStatus` — a bus keeps its operational status and last-known position while dark
- [ ] Driver can set `serviceStatus = out_of_service` with a reason from a short list or free text, and return to service; tracking keeps running meanwhile
- [ ] The student label composes the three dimensions (e.g. "holding at Wardini · signal lost 6 min ago"), with `out_of_service` dominating the headline
- [ ] Every state change is recorded with a timestamp

### 5.5 Itinerary selection (temporary routes)
**Priority:** P1
**Description:** At shift start, the driver picks the bus's itinerary from the list assigned to that bus: its normal itinerary or a temporary one (e.g. "Renovation shuttle"). Temporary itineraries are created as data by the IT Committee during the prototype; creation from an app comes in v2.

**Acceptance Criteria:**
- [ ] The driver sees only itineraries assigned to their bus and active today
- [ ] A temporary itinerary can have an end date after which it disappears
- [ ] Students see a "Temporary route" label on the bus status

<!-- assumed: in v1 the driver picks from pre-made itineraries rather than drawing new ones; creating itineraries belongs to the v2 coordinator panel -->

### 5.6 Student status page
**Priority:** P0 (status), P1 (map, daily log)
**Description:** Public web page, live-updating. One line per bus, e.g. "Bus 1 — left Wardini 2 min ago → Yves dorm · due 14:10 · on time · updated 12 s ago". A map tab and a per-bus "today" log.

**Acceptance Criteria:**
- [ ] Updates live without refresh (Convex subscription)
- [ ] Each line shows: bus name, state, current/last stop, next stop, next scheduled time, on-time/late, last update age
- [ ] Data older than 2 minutes is visually marked stale
- [ ] Works on a 360 px-wide phone screen; loads in under 3 s on 3G
- [ ] Today's log lists each stop with scheduled vs actual times

### 5.7 Editable reference data
**Priority:** P0
**Description:** Stops (name, type, coordinates, radius, dwell), buses, itineraries, timetable entries and service hours are data in Convex, seeded from versioned files and editable in the Convex dashboard.

**Acceptance Criteria:**
- [ ] `npx convex run seed:loadAll` loads all reference data idempotently
- [ ] Changing a stop's radius in the dashboard takes effect on the next position without redeploying
- [ ] Seed files are in the repository so data changes are reviewed like code

### 5.8 Health monitoring and punctuality export
**Priority:** P0 (monitoring), P1 (export)
**Acceptance Criteria:**
- [ ] A health query lists, per bus: last position age, battery level, shift status
- [ ] `npx convex run reports:exportStopEvents` returns a CSV of arrivals/departures for a date range

## 6. Out of Scope (v1)

- Transport coordinator panel (states, temporary routes) — v2
- Creating itineraries from the driver app — v2
- Push / WhatsApp / SMS notifications
- Predicted arrival times (ETA) based on traffic or speed
- iOS driver app
- Student accounts, favourites, or personalised stops
- Integration into the MyDAUST hub (the page is linkable, embedding comes later)
- Ride requests, seat counts, or capacity

## 7. Success Metrics

| Metric | Target (pilot) | How to Measure |
|---|---|---|
| Tracking coverage | ≥ 90% of service minutes with a position < 2 min old, per bus | `pings` vs service hours, computed by report query |
| Detection accuracy | ≥ 95% of real stops detected, < 5% false arrivals | Manual ride-along checks on 3 days vs `stopEvents` |
| Student usage | ≥ 150 unique daily visitors after 2 weeks | Vercel analytics |
| Punctuality visibility | 100% of arrivals have a matched timetable entry and delay | `stopEvents.scheduleEntryId` not null |
| Driver adoption | Shift started on ≥ 90% of service days per driver | `shifts` table |
| Student satisfaction | Fewer reported missed buses (before/after survey) | Short survey before and after pilot |

<!-- assumed: target numbers are starting points to agree with Student Affairs -->

## 8. Timeline & Milestones

| Milestone | Target Date | Deliverable |
|---|---|---|
| Docs + data model agreed | 2026-10-18 | This bundle reviewed; seed data format fixed |
| Backend + detection working with simulated pings | 2026-11-01 | Convex functions, unit tests on geofence/schedule logic |
| Driver app on 1 bus | 2026-11-08 | Real positions from one bus for 3 days |
| Student page live | 2026-11-15 | Public status page, all 4 buses paired |
| Pilot running | 2026-11-16 → 2026-12-06 | 3 weeks of real data |
| Pilot report to Student Affairs | 2026-12-12 | Coverage, accuracy, punctuality, survey results; go/no-go for v2 |

## 9. Open Questions

- [ ] Exact coordinates and sensible radius for each stop (measure on site)
- [ ] Official itineraries and timetables for all 4 buses, and who communicates changes
- [ ] Service hours per day (weekdays vs weekends)
- [ ] Which phones the drivers have (brand, Android version) and whether the school tablet has a SIM slot and GPS
- [ ] Will the school cover drivers' mobile data and car chargers during the pilot?
- [x] ~~Should the student page be public or limited to DAUST?~~ **Resolved: public, read-only, no personal data** (CONTEXT B3).
- [ ] Driver consent: written agreement before the pilot? (Form must state: tracked only during shifts; raw track kept 30 days — CONTEXT E1.)
- [x] ~~Grace period before an arrival counts as late (2 min proposed)~~ **Resolved: 2 min** (`config.lateGraceMinutes`).
