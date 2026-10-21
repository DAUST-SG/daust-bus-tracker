# ADR 0002 — Out-of-order ping handling via per-shift reconciliation

- **Status:** Accepted
- **Date:** 2026-10-21
- **Context repo:** single context (`CONTEXT.md`)

## Context

The geofence state machine is stateful and advances per ping in `recordedAt` order.
The driver app buffers positions offline (up to 24 h) and uploads them when the
network returns, so a backlog batch can carry timestamps *older* than points already
processed live. Feeding those into the live machine would corrupt the geofence phase
and the schedule pointer, and there was no defined way for a delayed batch (which may
prove the bus actually stopped) to retract an already-written `undetected` row. The
User Blueprint promised "the log is corrected retroactively" with no mechanism.

Options considered: (A) drop stale pings — discards the backlog the whole Room-queue
design exists to preserve; (B) live-process + per-shift deterministic replay;
(C) full event-sourcing / rebuild-from-raw on every batch — correct but overkill for
4 buses.

## Decision

Adopt (B). Two paths over the same pure logic modules:

- **Live path:** each ping updates `busStatus` only if its `recordedAt` is newer than
  the last processed for that shift. The real-time view is always "best effort now"
  and is never rewound.
- **Reconcile path:** when a batch contains any ping older than
  `shifts.lastProcessedRecordedAt`, set `shifts.needsReconcile = true`. A
  `reconcileShift` internal mutation re-runs `geofence` + `schedule` over *all* that
  shift's pings in `recordedAt` order, rebuilding that shift's `stopEvents` and the
  pointer. `stopEvents` writes are idempotent on `(shiftId, scheduleEntryId)`, so an
  `undetected` row is replaced by a real arrival when the backlog fills in.

`stopEvents` are therefore *eventually correct* once all pings for a shift land.

## Consequences

- Honours the offline-queue promise and keeps the live path cheap (one machine step).
- Correction is a deterministic replay of pure functions, not an in-place patch —
  the reason those modules were kept pure and DB-free.
- New fields on `shifts`: `lastProcessedRecordedAt`, `needsReconcile`. New internal
  mutation `reconcileShift` (invoked after an out-of-order batch; may also be a cron
  sweep for `needsReconcile` shifts).
- `stopEvents` need a uniqueness/idempotency key on `(shiftId, scheduleEntryId)`;
  `unscheduled` rows (null `scheduleEntryId`) key on `(shiftId, stopId, arrivedAt)`.
- The live view can briefly show a skip that the backlog later fills — acceptable:
  live = now, log = settled truth.
- Replay cost is bounded (one shift's pings, a few thousand rows) — fine at 4 buses.
