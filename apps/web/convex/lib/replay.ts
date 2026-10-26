// Pure full-replay of a shift's pings → the authoritative stopEvents + final live state.
// Deterministic and DB-free, so both the live ingest and reconcileShift (ADR 0002) share it and
// out-of-order/backlogged pings are handled by replaying in recordedAt order. The final state
// reflects the NEWEST ping (replay ends there), so the live view is never rewound.
import type { Config, GeofenceState, ISODate, Motion, ScheduleEntry, Stop, StopEventFlag } from "../../shared/types";
import { stepGeofence, type GeofenceStop } from "./geofence";
import { arrivalDelayMinutes, departureDeltaMinutes, flagsFor, matchEntry, nextExpectedEntry } from "./schedule";

export interface ReplayPing {
  lat: number;
  lng: number;
  recordedAt: number;
  speed?: number;
  accuracy?: number;
}

export interface StopEventRecord {
  stopId: string;
  scheduleEntryId?: string;
  arrivedAt: number | null;
  departedAt?: number | null;
  arrivalDelayMinutes?: number;
  departureDeltaMinutes?: number;
  flags: StopEventFlag[];
}

export interface ReplayFinal {
  geofence: GeofenceState;
  nextEntryId?: string;
  currentStopId?: string;
  lastStopId?: string;
  lastDepartedAt?: number;
  delayMinutes?: number;
  motion: Motion;
  lat?: number;
  lng?: number;
  accuracy?: number;
}

const bySeq = (a: ScheduleEntry, b: ScheduleEntry) => a.sequence - b.sequence;
const firstUnvisited = (entries: ScheduleEntry[], matched: Set<string>) =>
  [...entries].sort(bySeq).find((e) => !matched.has(e._id));
const nn = <T>(x: T | null): T | undefined => (x === null ? undefined : x);

/** Replay all of a shift's pings (ordered by recordedAt) from a clean start. */
export function replayShift(input: {
  pings: ReplayPing[];
  stops: GeofenceStop[];
  entries: ScheduleEntry[];
  config: Config;
  date: ISODate;
}): { events: StopEventRecord[]; final: ReplayFinal } {
  const { pings, stops, entries, config, date } = input;
  const entryById = new Map(entries.map((e) => [e._id, e]));

  let geofence: GeofenceState = { phase: "outside" };
  const matchedIds = new Set<string>();
  let nextEntryId = pings[0] ? nextExpectedEntry(entries, matchedIds, pings[0].recordedAt, date, config)?._id : undefined;

  const events: StopEventRecord[] = [];
  const openIdxByStop = new Map<string, number>(); // open arrival awaiting departure
  let currentStopId: string | undefined;
  let lastStopId: string | undefined;
  let lastDepartedAt: number | undefined;
  let delayMinutes: number | undefined;
  let lat: number | undefined;
  let lng: number | undefined;
  let accuracy: number | undefined;

  for (const ping of pings) {
    const expectedStopId = nextEntryId ? entryById.get(nextEntryId)?.stopId : undefined;
    const r = stepGeofence(geofence, ping, stops, expectedStopId, config);
    geofence = r.state;
    lat = ping.lat;
    lng = ping.lng;
    accuracy = ping.accuracy;

    for (const ev of r.events) {
      if (ev.type === "ARRIVED") {
        const { matched, skipped } = matchEntry(ev.stopId, ev.at, date, entries, nextEntryId, matchedIds, config);
        for (const sk of skipped) {
          events.push({ stopId: sk.stopId, scheduleEntryId: sk._id, arrivedAt: null, flags: ["undetected"] });
          matchedIds.add(sk._id);
        }
        if (matched) {
          const delay = nn(arrivalDelayMinutes(matched, ev.at, date));
          events.push({
            stopId: ev.stopId,
            scheduleEntryId: matched._id,
            arrivedAt: ev.at,
            arrivalDelayMinutes: delay,
            flags: flagsFor(matched, { arrivedAt: ev.at, arrivalDelayMinutes: delay }, config),
          });
          matchedIds.add(matched._id);
          delayMinutes = delay;
          nextEntryId = firstUnvisited(entries, matchedIds)?._id;
        } else {
          events.push({ stopId: ev.stopId, arrivedAt: ev.at, flags: ["unscheduled"] });
        }
        openIdxByStop.set(ev.stopId, events.length - 1);
        currentStopId = ev.stopId;
      } else {
        const idx = openIdxByStop.get(ev.stopId);
        if (idx !== undefined) {
          const rec = events[idx]!;
          rec.departedAt = ev.at;
          const entry = rec.scheduleEntryId ? entryById.get(rec.scheduleEntryId) : undefined;
          if (entry) {
            rec.departureDeltaMinutes = nn(departureDeltaMinutes(entry, ev.at, date));
            rec.flags = flagsFor(
              entry,
              { arrivedAt: rec.arrivedAt, arrivalDelayMinutes: rec.arrivalDelayMinutes, departedAt: ev.at, departureDeltaMinutes: rec.departureDeltaMinutes },
              config,
            );
          }
          openIdxByStop.delete(ev.stopId);
        }
        currentStopId = undefined;
        lastStopId = ev.stopId;
        lastDepartedAt = ev.at;
      }
    }
  }

  return {
    events,
    final: {
      geofence,
      nextEntryId,
      currentStopId,
      lastStopId,
      lastDepartedAt,
      delayMinutes,
      motion: geofence.phase === "inside" ? "holding" : "active",
      lat,
      lng,
      accuracy,
    },
  };
}
