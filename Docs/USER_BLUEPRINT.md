# User Blueprint — DAUST Bus Tracker

| | |
|---|---|
| **Version** | 1.0 (prototype) |
| **Last Updated** | 2026-10-20 (reconciled with grilling decisions) |

How each type of user meets the system, uses it, and comes back to it, plus the edge cases each journey must survive.

> Decision record: `CONTEXT.md` + `docs/adr/`. Where this doc and `CONTEXT.md`
> disagree, `CONTEXT.md` wins.

## User Types

| User Type | Description | Entry Point |
|---|---|---|
| Student | Rides the buses between dorms, school and cafeteria; wants to know where and when | Link shared in class WhatsApp groups, QR codes at bus stops, later the MyDAUST hub |
| Driver | Drives one of the 4 buses; carries the phone that sends positions | App installed and paired by the IT Committee |
| Student Affairs | Decides whether the project continues; uses punctuality data | Pilot report and CSV export from the IT Committee |
| IT Committee operator | Pairs phones, edits stops/timetables, watches health | Convex dashboard and CLI |

<!-- assumed: QR codes at stops are a cheap way to bring students to the page -->

## Journey — Student

### Phase 1 — Discovery & Onboarding (goal: first useful check of a bus)
| Step | Screen/Page | What user does | What happens next | Notes |
|---|---|---|---|---|
| 1 | WhatsApp message / QR code at a stop | Taps the link or scans | Opens `/` in the browser | No install, no login |
| 2 | `/` Status page | Reads the line for their bus | Sees state, last/next stop, on time or late, "updated X ago" | First load < 3 s on 3G |
| 3 | `/` Status page | Taps "How does this work?" | `/about` explains states and "late" | Builds trust in the data |
| 4 | Browser menu | Adds the page to the home screen | Icon on the phone | Prompted by a small hint on the page |

### Phase 2 — Core Usage (goal: decide when to leave)
| Step | Screen/Page | What user does | What happens next | Notes |
|---|---|---|---|---|
| 1 | `/` | Opens the page before leaving the dorm | Sees "Bus 2 — at Wardini until 14:05 · on time" | Updates live, no refresh |
| 2 | `/` | Bus is late: sees "Running late · due 14:00 · 7 min late" | Decides to wait, walk, or take another bus | The core principle: know what to do when it's late |
| 3 | `/map` | Opens the map to see exactly where the bus is | Map with bus marker and stops | Only when the line isn't enough |
| 4 | `/bus/BUS-2` | Opens today's log after arriving late to class | Shows "Wardini: due 14:00, arrived 14:12 (12 min late)" | Can show it to a teacher |

### Phase 3 — Retention & Return (goal: checking becomes a habit)
| Step | Screen/Page | What user does | What happens next | Notes |
|---|---|---|---|---|
| 1 | Home-screen icon | Opens the page every morning | Same live view | Value depends on the data being right every day |
| 2 | `/` | Notices data is consistently accurate | Stops asking in group chats | Accuracy is the retention mechanism |
| 3 | Survey | Answers the end-of-pilot survey | Feedback goes into the report | Sprint 7 |

## Journey — Driver

### Phase 1 — Discovery & Onboarding (goal: first shift tracked)
| Step | Screen/Page | What user does | What happens next | Notes |
|---|---|---|---|---|
| 1 | Meeting with IT Committee | Hears what is tracked, when, and why; signs consent | Agrees to the pilot | Tracks the bus, not the driver |
| 2 | — | Hands over the phone for setup | Committee installs the APK, pairs it, runs the setup screen | 10 minutes per phone |
| 3 | Setup screen | Grants location + notification permissions; allows battery exemption | Checklist turns green | Brand-specific steps for Tecno / Infinix / Xiaomi / Samsung |
| 4 | Shift screen | Taps "Start shift" with the committee present | Notification appears; first position on the student page | Shows the driver it works |

### Phase 2 — Core Usage (goal: a full day tracked with no effort)
| Step | Screen/Page | What user does | What happens next | Notes |
|---|---|---|---|---|
| 1 | Shift screen | At the start of service, picks the itinerary and taps "Start shift" | Tracking starts | Normal itinerary pre-selected |
| 2 | (none) | Drives; phone stays in a holder, plugged into the car charger | Arrivals, departures and states detected automatically | Never touches the phone while driving |
| 3 | State screen | If the bus breaks down: taps "Out of service", picks a reason (parked) | Students see the reason | Only when stopped |
| 4 | Shift screen | At the end of service, does nothing | Tracking stops automatically | Or taps "End shift" earlier |

### Phase 3 — Retention & Return (goal: driver keeps starting the shift)
| Step | Screen/Page | What user does | What happens next | Notes |
|---|---|---|---|---|
| 1 | Notification at service start | Taps the reminder | Shift screen opens | Reminder at the configured start time |
| 2 | — | Gets fewer calls from students asking where the bus is | Sees the benefit | Main motivation |
| 3 | Feedback meeting | Shares problems (battery, data) | Committee fixes or escalates (data top-up, charger) | Mid-pilot check-in |

## Journey — Student Affairs

### Phase 1 — Discovery & Onboarding (goal: approve the pilot)
| Step | Screen/Page | What user does | What happens next | Notes |
|---|---|---|---|---|
| 1 | Proposal document | Reads the proposal | Asks for a prototype with real data | Done |
| 2 | Meeting | Provides itineraries, timetables, driver contacts | Data entered in seed files | Dependency for Sprint 2 |

### Phase 2 — Core Usage (goal: see the service as it runs)
| Step | Screen/Page | What user does | What happens next | Notes |
|---|---|---|---|---|
| 1 | `/` Status page | Checks buses during the pilot | Same view as students | No separate panel in v1 |
| 2 | `/bus/[code]` | Reviews a bus's day | Sees late arrivals and early departures | |

### Phase 3 — Retention & Return (goal: decide on v2)
| Step | Screen/Page | What user does | What happens next | Notes |
|---|---|---|---|---|
| 1 | Pilot report | Reviews coverage, accuracy, punctuality, survey | Go / no-go for v2 | Sprint 8 |
| 2 | v2 proposal | Assigns a transport coordinator | Coordinator panel is built | v2 |

## Journey — IT Committee operator

### Phase 1 — Discovery & Onboarding (goal: system running)
| Step | Screen/Page | What user does | What happens next | Notes |
|---|---|---|---|---|
| 1 | Terminal | Runs `seed:loadAll` and `devices:provision` | Data loaded, token printed once | |
| 2 | Driver phone | Pairs and sets up the phone | Bus appears on the page | |

### Phase 2 — Core Usage (goal: keep data accurate)
| Step | Screen/Page | What user does | What happens next | Notes |
|---|---|---|---|---|
| 1 | Convex dashboard | Runs `reports:health` each morning | Sees each bus's last ping age and battery | Catches silent failures |
| 2 | Seed files / dashboard | Adjusts a stop radius or timetable | Takes effect on the next ping | Mirror dashboard edits back to Git |
| 3 | Terminal | Revokes and re-issues a token for a lost phone | Old phone can no longer send | |

### Phase 3 — Retention & Return (goal: clean handover)
| Step | Screen/Page | What user does | What happens next | Notes |
|---|---|---|---|---|
| 1 | Runbook | Follows the runbook for every operation | No knowledge lives only in one head | Sprint 8 |
| 2 | Handover meeting | Transfers accounts and keys to the next head | System survives the committee change | Rotate keys |

## Page Index

| Page | Route | Purpose | Used in Journey |
|---|---|---|---|
| Status | `/` | Live line per bus | Student, Student Affairs |
| Map | `/map` | Positions of buses and stops | Student |
| Bus log | `/bus/[code]` | Today's scheduled vs actual times for one bus | Student, Student Affairs |
| About | `/about` | How it works, states, what "late" means | Student |
| Pairing (app) | — | Enter device token | Driver, Operator |
| Setup (app) | — | Permissions, battery exemption | Driver, Operator |
| Shift (app) | — | Start/end shift, itinerary picker | Driver |
| Bus state (app) | — | Out of service / back in service | Driver |

## Edge Cases & Alternate Flows

| Scenario | Trigger | Where user lands | How it's handled |
|---|---|---|---|
| Phone loses network | Dead zone, no data credit | Student page shows growing "updated X ago", then "signal lost" | Positions queued on the phone; uploaded later; log corrected retroactively |
| Phone battery dies | No charger | Student page: "Signal lost — last seen at …" | Health report flags it; charger in each bus |
| Android kills the app | Aggressive battery saver | Same as signal lost | Setup screen exemption; foreground service; detected within 5 min |
| Driver forgets to start the shift | Habit | Bus shows "Off shift" | Reminder notification at service start; morning health check |
| Bus rolls past a stop without stopping | Running late / not serving it now | No arrival recorded | Speed-aware detection: no at-rest, no arrival; if a shift is active the entry logs `undetected` |
| Late bus makes a quick (<30 s) stop | Driver rushing to catch up | Arrival still recorded (likely `late`) | Detection keys on speed-near-zero, not dwell time |
| Bus stops near but outside the radius | Parks 100 m away | Arrival missed | Tune radius from pilot data |
| Bus leaves before its departure time | Driver in a hurry | Students see it left; log flagged `early_departure` | Flagged only if the bus was not already late (`departAt` is a no-earlier-than floor) |
| Bus skips a scheduled stop | Shows up at a later stop | Skipped visit auto-advanced, logged `undetected`; bus keeps running | Detected because the arrival matches an entry ahead of the pointer; no driver prompt, no shutdown |
| Bus never reaches a scheduled stop | Route change, breakdown | Entry logs `undetected` once passed; persistent no-progress raises a passive health flag | Driver sets out of service when stopped; no auto-shutdown |
| Phone reboots mid-shift | Crash / update | Tracking resumes | Boot receiver restarts the service if a shift is active |
| Renovation shuttle running | Road works | Bus line shows "Temporary route — Renovation shuttle" | Driver picks the temporary itinerary at shift start |
| Shift left open overnight | Phone stayed on | No positions accepted after hours | Cron closes shifts after service hours |
| Student opens page outside service hours | Evening / weekend | All buses "Off shift — service resumes 06:30" | Empty state with next service time |
| Two phones paired to one bus | Replacement phone | Only the newest device can start a shift | Older device revoked on provisioning |

## Notifications & Async Events

| Event | Trigger | Channel | Deep link destination |
|---|---|---|---|
| Shift reminder | Configured service start time on service days | Android notification (driver) | Shift screen |
| Tracking active | Shift started | Persistent foreground notification (driver) | Shift screen |
| Auto-stop | Service hours ended | Android notification (driver) | Shift screen |
| Queue not uploading | > 50 queued points for > 10 min | Android notification (driver) | Shift screen (shows connection tips) |
| Signal lost | No position for 5 min during a shift | Student page `connectivity`; `reports:health` (the **only** operator alert surface in v1 — passive, opened manually; `onSignalLost` push hook is a stubbed no-op) | `/` |
| Bus out of service | Driver sets state | Student page state | `/bus/[code]` |
| Bus leaves previous stop *(v2)* | `DEPARTED` event | Web push (student) | `/` |
