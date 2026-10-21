import type { Config, GeofenceEvent, GeofenceState, Stop } from "../../shared/types";
import { haversineMeters } from "./geo";

export type GeofenceStop = Pick<Stop, "_id" | "lat" | "lng" | "radiusMeters" | "exitBufferMeters" | "dwellSeconds">;
export type GeofencePing = { lat: number; lng: number; recordedAt: number; speed?: number };

/**
 * Pure state machine, one step per ping (pings must arrive in recordedAt order — ADR 0002).
 *
 * outside  --(inside a stop's entry radius)--> entering(S, enteredAt)
 * entering --(at rest: speed < stopSpeedThreshold for restConfirmPings pings in a row,
 *             or dwellSeconds elapsed when the ping has no speed)--> inside(S), emits ARRIVED(S, enteredAt)
 * entering --(beyond S's exit radius before coming to rest)--> outside   (roll-by: no event)
 * inside   --(beyond S's exit radius = radius + buffer)--> outside, emits DEPARTED(S, first ping outside)
 *
 * Overlapping radii: the expected stop (the one at nextEntryId) wins, never nearest-centre
 * (CONTEXT.md, geofence disambiguation). Departure is keyed to the current stop only, and the
 * same ping may start entering the next stop.
 */
export function stepGeofence(
  state: GeofenceState,
  ping: GeofencePing,
  stops: GeofenceStop[],
  expectedStopId: string | undefined,
  config: Pick<Config, "stopSpeedThreshold" | "restConfirmPings">,
): { state: GeofenceState; events: GeofenceEvent[] } {
  const events: GeofenceEvent[] = [];
  const dist = (s: GeofenceStop) => haversineMeters(ping, s);
  const inExit = (s: GeofenceStop) => dist(s) <= s.radiusMeters + s.exitBufferMeters;
  const current = stops.find((s) => s._id === state.stopId);

  if (state.phase === "inside") {
    if (current && inExit(current)) return { state, events };
    events.push({ type: "DEPARTED", stopId: state.stopId!, at: ping.recordedAt });
    state = { phase: "outside" };
  }

  const stop = pickStop(state, current, stops, dist, inExit, expectedStopId);
  if (!stop) return { state: { phase: "outside" }, events };

  const restarted = state.phase !== "entering" || state.stopId !== stop._id;
  const enteredAt = restarted ? ping.recordedAt : state.enteredAt!;
  const atRest = ping.speed !== undefined && ping.speed < config.stopSpeedThreshold;
  const restPings = atRest ? (restarted ? 0 : (state.restPings ?? 0)) + 1 : 0;
  const confirmed =
    ping.speed === undefined
      ? ping.recordedAt - enteredAt >= stop.dwellSeconds * 1000
      : restPings >= config.restConfirmPings;

  if (confirmed) {
    events.push({ type: "ARRIVED", stopId: stop._id, at: enteredAt });
    return { state: { phase: "inside", stopId: stop._id, enteredAt }, events };
  }
  return { state: { phase: "entering", stopId: stop._id, enteredAt, restPings }, events };
}

function pickStop(
  state: GeofenceState,
  current: GeofenceStop | undefined,
  stops: GeofenceStop[],
  dist: (s: GeofenceStop) => number,
  inExit: (s: GeofenceStop) => boolean,
  expectedStopId: string | undefined,
): GeofenceStop | undefined {
  const inEntry = stops.filter((s) => dist(s) <= s.radiusMeters);
  const expected = inEntry.find((s) => s._id === expectedStopId);
  if (expected) return expected;
  // Already entering: hold on to that stop until the bus leaves its exit radius, so GPS jitter
  // at the edge doesn't reset the at-rest count.
  if (state.phase === "entering" && current && inExit(current)) return current;
  // ponytail: not near the expected stop → nearest stop in range, so an at-rest arrival there
  // can be logged `unscheduled` (D6). Overlaps between non-expected stops are a data issue.
  return inEntry.sort((a, b) => dist(a) - dist(b))[0];
}
