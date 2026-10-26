// Pure timetable logic — no DB access, unit-tested in isolation.
// Sequence-forward matching (ADR 0001), pointer anchoring and punctuality flags
// (Docs/CONTEXT.md D1–D6, Docs/DATABASE_SCHEMA.md).
import type { Config, ISODate, ScheduleEntry, StopEvent, StopEventFlag } from "../../shared/types";
import { hhmmToMs } from "./time";

const MIN = 60_000;
const bySequence = (a: ScheduleEntry, b: ScheduleEntry) => a.sequence - b.sequence;

/**
 * Sequence-forward match (ADR 0001): the earliest UNVISITED entry for this stop at or after the
 * current pointer, NOT nearest-by-time — so a late arrival binds to the visit it was attempting.
 * Returns the matched entry plus the unvisited entries skipped past (to be logged `undetected`).
 * `matchWindowMinutes` is only a sanity guard: an arrival absurdly far from a timetabled slot is
 * treated as `unscheduled` (matched = null). Timetable-less entries (no `arriveBy`) skip the guard.
 */
export function matchEntry(
  stopId: string,
  at: number,
  date: ISODate,
  entries: ScheduleEntry[],
  nextEntryId: string | undefined,
  alreadyMatchedIds: Set<string>,
  config: Config,
): { matched: ScheduleEntry | null; skipped: ScheduleEntry[] } {
  const ordered = [...entries].sort(bySequence);
  const pointerSeq = ordered.find((e) => e._id === nextEntryId)?.sequence ?? -Infinity;
  const forward = ordered.filter((e) => e.sequence >= pointerSeq && !alreadyMatchedIds.has(e._id));

  const matched = forward.find((e) => e.stopId === stopId) ?? null;
  if (!matched) return { matched: null, skipped: [] };

  // Sanity guard: reject a timetabled match that is absurdly far from its slot.
  if (matched.arriveBy !== undefined) {
    const gapMin = Math.abs(at - hhmmToMs(date, matched.arriveBy)) / MIN;
    if (gapMin > config.matchWindowMinutes) return { matched: null, skipped: [] };
  }

  const skipped = forward.filter((e) => e.sequence < matched.sequence);
  return { matched, skipped };
}

/** Minutes between arrival and the scheduled `arriveBy` (positive = late). Null when untimetabled. */
export function arrivalDelayMinutes(entry: ScheduleEntry, arrivedAt: number, date: ISODate): number | null {
  if (entry.arriveBy === undefined) return null;
  return Math.round((arrivedAt - hhmmToMs(date, entry.arriveBy)) / MIN);
}

/** Minutes between departure and the scheduled `departAt` (negative = early). Null when untimetabled. */
export function departureDeltaMinutes(entry: ScheduleEntry, departedAt: number, date: ISODate): number | null {
  if (entry.departAt === undefined) return null;
  return Math.round((departedAt - hhmmToMs(date, entry.departAt)) / MIN);
}

/**
 * Flags for a stop event. `departAt` is a no-earlier-than floor: `early_departure` fires only when
 * the bus left before `departAt` AND was not already late on arrival (CONTEXT.md departAt floor).
 */
export function flagsFor(entry: ScheduleEntry | null, e: Partial<StopEvent>, config: Config): StopEventFlag[] {
  const flags: StopEventFlag[] = [];

  if (entry === null) {
    if (e.arrivedAt != null) flags.push("unscheduled");
    return flags;
  }
  if (e.arrivedAt == null) {
    flags.push("undetected");
    return flags;
  }

  const late = e.arrivalDelayMinutes != null && e.arrivalDelayMinutes > config.lateGraceMinutes;
  if (late) flags.push("late");
  if (!late && e.departedAt != null && e.departureDeltaMinutes != null && e.departureDeltaMinutes < 0) {
    flags.push("early_departure");
  }
  if (e.departedAt === null) flags.push("departure_unknown");
  return flags;
}

/**
 * Anchor/advance the pointer. Re-anchor by SCHEDULED TIME: the first unvisited entry whose
 * `arriveBy >= now − lateGrace`, so a late start or a blackout does not cascade-match stale entries
 * (CONTEXT.md pointer anchoring). Timetable-less itineraries anchor by sequence position.
 */
export function nextExpectedEntry(
  entries: ScheduleEntry[],
  matchedIds: Set<string>,
  now: number,
  date: ISODate,
  config: Config,
): ScheduleEntry | null {
  const unvisited = [...entries].filter((e) => !matchedIds.has(e._id)).sort(bySequence);
  const [first] = unvisited;
  if (!first) return null;
  if (first.arriveBy === undefined) return first; // timetable-less → by sequence

  const floor = now - config.lateGraceMinutes * MIN;
  return unvisited.find((e) => e.arriveBy !== undefined && hhmmToMs(date, e.arriveBy) >= floor) ?? first;
}

/** Minutes late when the bus is past `arriveBy + grace` and has not arrived; null otherwise. */
export function runningLateMinutes(
  next: ScheduleEntry | null,
  now: number,
  date: ISODate,
  config: Config,
): number | null {
  if (!next || next.arriveBy === undefined) return null;
  const due = hhmmToMs(date, next.arriveBy);
  if (now <= due + config.lateGraceMinutes * MIN) return null;
  return Math.round((now - due) / MIN);
}
