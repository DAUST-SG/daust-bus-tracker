# ADR 0001 — Sequence-forward arrival matching (not nearest-scheduled-time)

- **Status:** Accepted
- **Date:** 2026-10-19
- **Context repo:** single context (`CONTEXT.md`)

## Context

Buses run a **repeating loop** against a fixed published wall-clock timetable, so the
same stop (e.g. Wardini) appears as many identical-looking `scheduleEntries` through
the day (08:00, 08:20, 08:40 …). A detected arrival must be bound to exactly one of
them to compute lateness.

The original schema matched by **nearest scheduled time within `matchWindowMinutes`
(default 45)**. With a ~20-minute loop, a 45-minute window spans 2–3 candidate
entries, and "nearest" fails precisely when it matters most: a bus due at Wardini
08:00 that arrives 08:12 (12 min late) snaps to the 08:20 entry and is reported
~8 min *early*. The lateness — the product's headline value — silently disappears.

## Decision

Match **sequence-forward**: track `busStatus.nextEntryId` (next unvisited stop-visit
in `sequence` order) and bind an arrival at stop X to the earliest unvisited entry
whose `stopId = X`. The loop guarantees this is the visit the bus is on, regardless
of delay. `matchWindowMinutes` is demoted from primary key to a sanity guard.

Skips are detected structurally: an arrival matching an entry *ahead of*
`nextEntryId` means the intervening visits were not detected. Auto-advance past them
and record each as a `stopEvents` row (`arrivedAt = null`, flag `undetected`). No
driver prompt and no state change — the driver app stays dumb and the bus keeps
running. Persistent overdue/no-progress or `signal_lost` raises only a **passive**
coordinator/health flag; out-of-service remains driver-initiated.

## Consequences

- Late arrivals are attributed to the visit the bus was attempting — lateness is
  preserved. This is the main win.
- Requires robust "where in the sequence is this bus" state, including recovery
  after `signal_lost` (bus advances while dark) and detection misses.
- `undetected` conflates a true skip with a false-negative detection; reports must
  present it honestly as "not detected", not "driver skipped".
- `matchWindowMinutes` semantics change (guard, not selector) — update schema docs.
- Open edge (see grilling): how `nextEntryId` is re-anchored after a gap where the
  bus reappears several stops ahead, and how the day's *first* arrival is anchored.
