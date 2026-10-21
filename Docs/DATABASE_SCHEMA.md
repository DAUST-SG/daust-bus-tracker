# Database Schema — DAUST Bus Tracker

| | |
|---|---|
| **Database** | Convex (document database; tables defined in `convex/schema.ts`) |
| **Naming convention** | Tables: camelCase plural (`stopEvents`). Fields: camelCase. Codes: UPPER-KEBAB (`BUS-1`). IDs: Convex `Id<"table">` |
| **Times** | Instants as Unix ms (`number`). Schedule times as `"HH:mm"` strings in Africa/Dakar. Dates as `"YYYY-MM-DD"` |

> Reconciled with grilling decisions 2026-10-19. Decision record: `CONTEXT.md` +
> `docs/adr/`. Where this doc and `CONTEXT.md` disagree, `CONTEXT.md` wins.

Convex has no SQL, migrations or row-level security. Their equivalents are noted in each section: indexes are declared in `schema.ts`, access control is done in function code, and schema changes are applied by deploying `schema.ts` plus one-off data migration functions.

## Reference data vs operational data

- **Reference data** (editable during development): `stops`, `buses`, `itineraries`, `scheduleEntries`, `config`. Seeded from `convex/seed/*.ts`, editable in the Convex dashboard. A stop is the "dorm class" idea generalised: name, type (dorm, school, cafeteria, other), coordinates and radius.
- **Operational data** (written by the system): `devices`, `shifts`, `pings`, `busStatus`, `stopEvents`, `stateChanges`.

## Tables

### stops
| Column | Type | Constraints | Description |
|---|---|---|---|
| `_id` | `Id<"stops">` | PK, auto | |
| `code` | string | unique | Stable key, e.g. `WARDINI`, `YVES`, `SCHOOL` |
| `name` | string | required | Display name, e.g. "Wardini" |
| `type` | `"dorm" \| "school" \| "cafeteria" \| "other"` | required | Kind of place |
| `lat` | number | -90..90 | Centre latitude |
| `lng` | number | -180..180 | Centre longitude |
| `radiusMeters` | number | 20..300, default 75 | Entry radius for arrival detection |
| `exitBufferMeters` | number | default 40 | Exit radius = radius + buffer (hysteresis) |
| `dwellSeconds` | number | default 20 | Fallback dwell: time inside radius before an arrival counts when device `speed` is missing/unreliable. Primary arrival trigger is speed-near-zero (see Arrival detection) |
| `isActive` | boolean | default true | Hidden from detection and map when false |
| `updatedAt` | number | | Last edit time |

### buses
| Column | Type | Constraints | Description |
|---|---|---|---|
| `_id` | `Id<"buses">` | PK | |
| `code` | string | unique | `BUS-1` … `BUS-4` |
| `name` | string | required | "Bus 1" |
| `type` | `"large" \| "small"` | required | Small bus used for the renovation shuttle |
| `isActive` | boolean | default true | |

### itineraries
| Column | Type | Constraints | Description |
|---|---|---|---|
| `_id` | `Id<"itineraries">` | PK | |
| `code` | string | unique | `BUS1-WEEKDAY`, `RENOVATION-SHUTTLE` |
| `name` | string | required | Shown to drivers and students |
| `busIds` | `Id<"buses">[]` | ≥ 1 | Buses allowed to run it |
| `isTemporary` | boolean | | Labelled "Temporary route" for students |
| `validFrom` | string (date) | optional | First day available |
| `validUntil` | string (date) | optional | Last day available; hidden after |
| `daysOfWeek` | number[] | 1 (Mon)..7 (Sun) | Days this itinerary may be picked. Independent of `config.serviceHours.days`, which decides whether the service runs at all today; both must pass (D7) |
| `isActive` | boolean | default true | |

### scheduleEntries
One row per stop visit in an itinerary. A loop that visits Wardini 6 times a day has 6 Wardini rows.

| Column | Type | Constraints | Description |
|---|---|---|---|
| `_id` | `Id<"scheduleEntries">` | PK | |
| `itineraryId` | `Id<"itineraries">` | FK, required | |
| `sequence` | number | unique per itinerary | Order of visits in the day |
| `stopId` | `Id<"stops">` | FK, required | |
| `arriveBy` | string `"HH:mm"` | required | Bus must be at the stop by this time (e.g. `14:00`) |
| `departAt` | string `"HH:mm"` | ≥ `arriveBy` | Bus leaves at this time, not before (e.g. `14:05`) |

For temporary itineraries without fixed times, `arriveBy`/`departAt` may be omitted; punctuality is then not computed. In that case matching is **pure sequence-forward** (next stop in `sequence` order) and the pointer is anchored by sequence position, not time (D4). Students see position + next stop, never "late".
<!-- assumed: renovation shuttle may run on demand without a timetable -->

**Matching is sequence-forward, not nearest-time.** Buses run a repeating loop, so a
stop appears as many entries with different times. An arrival at stop X binds to the
earliest unvisited entry whose `stopId = X` (tracked via `busStatus.nextEntryId`),
so a late bus is matched to the visit it was *attempting* — preserving its lateness.
`nextEntryId` is anchored by scheduled time at shift start and re-anchored after any
multi-entry gap (e.g. `signal_lost`). An arrival matching an entry *ahead* of
`nextEntryId` means the intervening entries were undetected: they are auto-advanced
and logged as `stopEvents` with `arrivedAt = null`, flag `undetected`. See ADR 0001.

### config (single document)
| Column | Type | Constraints | Description |
|---|---|---|---|
| `_id` | `Id<"config">` | PK | Only one row |
| `timezone` | string | `"Africa/Dakar"` | |
| `serviceHours` | `{ days: number[], start: string, end: string }[]` | | E.g. Mon–Fri 06:30–22:00 |
| `lateGraceMinutes` | number | default 2 | Arrival later than `arriveBy` + grace = late |
| `signalLostAfterSeconds` | number | default 300 | |
| `staleAfterSeconds` | number | default 120 | Student page marks data stale |
| `maxAccuracyMeters` | number | default 50 | |
| `pingRetentionDays` | number | default 30 | |
| `stopSpeedThreshold` | number | default 2 | m/s below which the bus counts as "at rest" for arrival detection |
| `restConfirmPings` | number | default 2 | Consecutive at-rest pings inside a radius to confirm an arrival |
| `matchWindowMinutes` | number | default 45 | **Sanity guard only** (not the matcher). Matching is sequence-forward (see scheduleEntries / ADR 0001); this flags/ignores arrivals absurdly far from the expected slot |

### devices
| Column | Type | Constraints | Description |
|---|---|---|---|
| `_id` | `Id<"devices">` | PK | |
| `busId` | `Id<"buses">` | FK | One active device per bus |
| `label` | string | | "Driver phone — Bus 1" |
| `tokenHash` | string | unique | SHA-256(token + pepper); token never stored |
| `deviceModel` | string | optional | Filled at pairing |
| `androidVersion` | string | optional | |
| `appVersion` | string | optional | |
| `lastSeenAt` | number | optional | |
| `lastBatteryPercent` | number | optional | |
| `revokedAt` | number | optional | Set when revoked |
| `createdAt` | number | | |

### shifts
| Column | Type | Constraints | Description |
|---|---|---|---|
| `_id` | `Id<"shifts">` | PK | |
| `busId` | `Id<"buses">` | FK | |
| `deviceId` | `Id<"devices">` | FK | |
| `itineraryId` | `Id<"itineraries">` | FK | Chosen at start |
| `date` | string | `YYYY-MM-DD` | Service day |
| `startedAt` | number | | Server time |
| `endedAt` | number | optional | Null while active |
| `endReason` | `"driver" \| "service_hours_over" \| "auto_timeout"` | optional | `auto_timeout` is set server-side only (watchdog), never sent by the app; the API accepts only `driver`/`service_hours_over` |
| `pingCount` | number | default 0 | |
| `lastProcessedRecordedAt` | number | optional | Newest `recordedAt` fed to the live state machine; pings older than this trigger reconcile (ADR 0002) |
| `needsReconcile` | boolean | default false | Set when an out-of-order/backlog batch arrives; cleared by `reconcileShift` |

Multiple sequential shifts per bus per day are allowed (one active at a time, enforced via `by_bus_active`). Each start re-anchors the pointer by scheduled time (D8).

### pings
| Column | Type | Constraints | Description |
|---|---|---|---|
| `_id` | `Id<"pings">` | PK | |
| `busId` | `Id<"buses">` | FK | |
| `shiftId` | `Id<"shifts">` | FK | |
| `clientId` | string | unique per device | De-duplication of retries |
| `recordedAt` | number | | Device GPS time |
| `receivedAt` | number | | Server time |
| `lat` / `lng` | number | | |
| `accuracy` | number | ≤ maxAccuracyMeters | |
| `speed` | number | optional | m/s |
| `heading` | number | optional | degrees |

Purged after `pingRetentionDays`.

### busStatus (read model, one per bus)
| Column | Type | Constraints | Description |
|---|---|---|---|
| `_id` | `Id<"busStatus">` | PK | |
| `busId` | `Id<"buses">` | FK, unique | |
| `shiftId` | `Id<"shifts">` | optional | Current shift |
| `itineraryId` | `Id<"itineraries">` | optional | |
| `serviceStatus` | `"off_shift" \| "in_service" \| "out_of_service"` | | Declared/operational; driver- or schedule-driven. Tracking may continue while `out_of_service` |
| `motion` | `"active" \| "holding"` | optional | `holding` when geofence phase is `inside`, else `active` while in service; absent when `off_shift` (D5) |
| `connectivity` | `"live" \| "signal_lost"` | | **Stored** value (cron-written). `stale` is NOT stored — it is computed at read time from `lastPingAt` age; the view resolves `signal_lost` → else `stale` if age > `staleAfterSeconds` → else `live` (D3) |
| `reason` / `note` | string | optional | For out of service |
| `lat` / `lng` / `accuracy` | number | optional | Latest position |
| `lastPingAt` | number | optional | |
| `geofence` | `{ phase: "outside" \| "entering" \| "inside", stopId?: Id<"stops">, enteredAt?: number }` | | State machine memory |
| `currentStopId` | `Id<"stops">` | optional | Set while holding |
| `lastStopId` / `lastDepartedAt` | | optional | |
| `nextEntryId` | `Id<"scheduleEntries">` | optional | Next expected visit |
| `delayMinutes` | number | optional | Current lateness (positive = late) |
| `updatedAt` | number | | |

The student-facing label is **derived** from the three state dimensions, not stored:
`out_of_service` dominates the headline; otherwise `motion` + `connectivity` compose
(e.g. "holding at Wardini · signal lost 6 min ago"). Splitting the old single `state`
enum keeps history intact — a bus can be `out_of_service` *and* last-seen-holding.

### stopEvents (punctuality log — kept permanently)
| Column | Type | Constraints | Description |
|---|---|---|---|
| `_id` | `Id<"stopEvents">` | PK | |
| `busId` | `Id<"buses">` | FK | |
| `shiftId` | `Id<"shifts">` | FK | |
| `stopId` | `Id<"stops">` | FK | |
| `scheduleEntryId` | `Id<"scheduleEntries">` | optional | Null if no entry matched |
| `date` | string | | Service day |
| `arrivedAt` | number | | First ping inside the radius |
| `departedAt` | number | optional | First ping outside the exit radius |
| `arrivalDelayMinutes` | number | optional | `arrivedAt − arriveBy` |
| `departureDeltaMinutes` | number | optional | `departedAt − departAt` (negative = early) |
| `flags` | string[] | | `late`, `early_departure`, `unscheduled`, `undetected`, `departure_unknown` |

Idempotency: a matched event is unique on `(shiftId, scheduleEntryId)`; an
`unscheduled` event (null `scheduleEntryId`) keys on `(shiftId, stopId, arrivedAt)`.
This lets `reconcileShift` (ADR 0002) rebuild a shift's events deterministically.

`departAt` is a **no-earlier-than floor**: a late bus leaves as soon as its dwell is
done and does not wait for `departAt`. So `early_departure` is flagged only when
`departedAt < departAt` **and** the bus was not already late on arrival. `undetected`
means a shift was active across the entry but no arrival was seen (`arrivedAt = null`)
— a true skip *or* a detection miss; it is NOT asserted as "driver skipped".
`unscheduled` (D6) = an at-rest arrival matching no forward entry within the sanity
window (`scheduleEntryId = null`). `departure_unknown` (D2) = the bus was still
`inside` when the shift ended or went `signal_lost`, so no departure was observed
(`departedAt = null`). An entry with no shift covering it is **not in service**: it
gets no `stopEvents` row and does not count against coverage.

### stateChanges
| Column | Type | Constraints | Description |
|---|---|---|---|
| `_id` | `Id<"stateChanges">` | PK | |
| `busId` | `Id<"buses">` | FK | |
| `dimension` | `"serviceStatus" \| "motion" \| "connectivity"` | | Which state dimension changed |
| `from` / `to` | string | | Value within that dimension (e.g. `active`→`holding`, `live`→`signal_lost`) |
| `reason` | string | optional | |
| `source` | `"system" \| "driver" \| "cron"` | | |
| `at` | number | | |

## Indexes

Declared in `convex/schema.ts`:

```typescript
stops: defineTable({...}).index("by_code", ["code"]).index("by_active", ["isActive"]),
buses: defineTable({...}).index("by_code", ["code"]),
itineraries: defineTable({...}).index("by_code", ["code"]),
scheduleEntries: defineTable({...})
  .index("by_itinerary_sequence", ["itineraryId", "sequence"])
  .index("by_itinerary_stop", ["itineraryId", "stopId"]),
devices: defineTable({...}).index("by_tokenHash", ["tokenHash"]).index("by_bus", ["busId"]),
shifts: defineTable({...})
  .index("by_bus_active", ["busId", "endedAt"])
  .index("by_date", ["date"]),
pings: defineTable({...})
  .index("by_shift_recordedAt", ["shiftId", "recordedAt"])
  .index("by_shift_clientId", ["shiftId", "clientId"])
  .index("by_receivedAt", ["receivedAt"]),
busStatus: defineTable({...}).index("by_bus", ["busId"]),
stopEvents: defineTable({...})
  .index("by_bus_date", ["busId", "date"])
  .index("by_date", ["date"])
  .index("by_shift_arrivedAt", ["shiftId", "arrivedAt"]),
stateChanges: defineTable({...}).index("by_bus_at", ["busId", "at"]),
```

## Relationships

- `devices.busId → buses` — many-to-one (history of devices per bus; one non-revoked at a time).
- `itineraries.busIds → buses` — many-to-many (stored as an array; the renovation shuttle may be run by any small bus).
- `scheduleEntries.itineraryId → itineraries` — many-to-one.
- `scheduleEntries.stopId → stops` — many-to-one.
- `shifts.busId / deviceId / itineraryId` — many-to-one each.
- `pings.shiftId → shifts` — many-to-one.
- `busStatus.busId → buses` — one-to-one.
- `stopEvents.shiftId → shifts`, `.stopId → stops`, `.scheduleEntryId → scheduleEntries` — many-to-one each.
- `stateChanges.busId → buses` — many-to-one.

## Access Control

Convex has no RLS; access is enforced by which functions exist and what they check.

```typescript
// Public (callable from the browser): read-only, no personal data
export const list = query({ args: {}, handler: ... });          // status:list
export const busLog = query({ args: {...}, handler: ... });     // status:busLog

// Driver writes: ONLY through HTTP actions that verify the device token,
// then call internal mutations (not callable from browsers)
export const ingestPings = internalMutation({ ... });
export const startShift = internalMutation({ ... });
export const setBusState = internalMutation({ ... });

// Operator functions: internal only, run from CLI / dashboard by committee members
export const provision = internalMutation({ ... });            // devices:provision
export const loadAll = internalMutation({ ... });              // seed:loadAll
```

Rules:
- No public `mutation` exists in v1; every write path is internal and authenticated.
- Public queries never return `devices`, `tokenHash`, raw `pings`, or battery data.
- Positions are only exposed while a bus is on shift; `off_shift` buses return no coordinates.

## Migrations

Convex applies `schema.ts` on deploy; data changes use one-off internal mutations kept in the repo.

```text
apps/web/convex/
├── schema.ts                         # Current schema (source of truth)
├── migrations/
│   ├── 2026_10_20_initial_seed.ts    # Loads first stops, buses, itineraries, timetable
│   └── README.md                     # How to write and run a data migration
└── seed/
    ├── stops.ts                      # Editable: name, type, lat, lng, radius, dwell
    ├── buses.ts                      # BUS-1 … BUS-4
    ├── itineraries.ts                # Normal loops + renovation shuttle
    ├── schedule.ts                   # arriveBy / departAt per stop visit
    └── config.ts                     # Service hours, thresholds
```
