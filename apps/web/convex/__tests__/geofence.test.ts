import { describe, expect, it } from "vitest";
import type { GeofenceEvent, GeofenceState } from "../../shared/types";
import { stepGeofence, type GeofencePing, type GeofenceStop } from "../lib/geofence";

// synthetic traces along a north–south line. Swap in recorded GPS fixtures
// (__tests__/fixtures/*.json) once real bus rides are logged (Sprint 1 task 6).
const BASE = { lat: 14.7, lng: -17.4 };
const M_PER_DEG_LAT = 111_195;
const at = (metersNorth: number) => ({ lat: BASE.lat + metersNorth / M_PER_DEG_LAT, lng: BASE.lng });
const stop = (id: string, metersNorth: number, extra: Partial<GeofenceStop> = {}): GeofenceStop => ({
  _id: id,
  ...at(metersNorth),
  radiusMeters: 75,
  exitBufferMeters: 40,
  dwellSeconds: 20,
  ...extra,
});
const config = { stopSpeedThreshold: 2, restConfirmPings: 2 };

/** [metersNorth, speed m/s | undefined] every 10 s. */
function run(points: [number, number | undefined][], stops: GeofenceStop[], expected?: string) {
  let state: GeofenceState = { phase: "outside" };
  const events: GeofenceEvent[] = [];
  points.forEach(([m, speed], i) => {
    const ping: GeofencePing = { ...at(m), recordedAt: i * 10_000, speed };
    const step = stepGeofence(state, ping, stops, expected, config);
    state = step.state;
    events.push(...step.events);
  });
  return { state, events };
}

const A = stop("A", 0);
const B = stop("B", 600);

describe("stepGeofence", () => {
  it("full stop: arrives at first ping in radius, departs at first ping past exit radius", () => {
    const { events } = run(
      [[-200, 8], [-120, 8], [-60, 5], [-10, 0.5], [0, 0], [0, 0], [60, 6], [130, 9]],
      [A],
      "A",
    );
    expect(events).toEqual([
      { type: "ARRIVED", stopId: "A", at: 20_000 },
      { type: "DEPARTED", stopId: "A", at: 70_000 },
    ]);
  });

  it("quick stop (~20 s at rest) still counts as an arrival", () => {
    const { events } = run([[-150, 9], [-40, 1], [0, 0.3], [90, 8], [200, 10]], [A], "A");
    expect(events.map((e) => e.type)).toEqual(["ARRIVED", "DEPARTED"]);
  });

  it("roll-by below walking speed never reaching rest: no events", () => {
    const { events, state } = run([[-150, 6], [-90, 4], [-50, 3], [-20, 2.5], [20, 3], [60, 4], [130, 6]], [A], "A");
    expect(events).toEqual([]);
    expect(state.phase).toBe("outside");
  });

  it("one at-rest ping then moving again (traffic) does not confirm; rest count resets", () => {
    const { events } = run([[-100, 8], [-60, 1], [-30, 4], [0, 1], [70, 9], [140, 9]], [A], "A");
    expect(events).toEqual([]);
  });

  it("edge jitter: a fix just outside the entry radius neither resets entering nor fakes a departure", () => {
    const { events } = run(
      // stopped at the edge: 70 m, jitter to 85 m (inside exit radius 115), back to 72 m
      [[-200, 8], [70, 1], [85, 0], [72, 0], [100, 0], [110, 0], [72, 0], [200, 9]],
      [A],
      "A",
    );
    expect(events).toEqual([
      { type: "ARRIVED", stopId: "A", at: 10_000 },
      { type: "DEPARTED", stopId: "A", at: 70_000 },
    ]);
  });

  it("no speed from the phone: falls back to dwell time", () => {
    const { events } = run([[-200, undefined], [-30, undefined], [-10, undefined], [0, undefined], [200, undefined]], [A], "A");
    expect(events).toEqual([
      { type: "ARRIVED", stopId: "A", at: 10_000 },
      { type: "DEPARTED", stopId: "A", at: 40_000 },
    ]);
  });

  it("overlapping radii: the expected stop wins, not the nearest centre", () => {
    const C = stop("C", 60); // 60 m from A, radii overlap
    const parked: [number, number][] = [[-200, 8], [20, 0], [20, 0]]; // nearer A
    expect(run(parked, [A, C], "C").events).toEqual([{ type: "ARRIVED", stopId: "C", at: 10_000 }]);
    expect(run(parked, [A, C], "A").events).toEqual([{ type: "ARRIVED", stopId: "A", at: 10_000 }]);
  });

  it("stop with no expected match still arrives (logged unscheduled downstream)", () => {
    const { events } = run([[-200, 8], [0, 0], [0, 0]], [A, B], "B");
    expect(events).toEqual([{ type: "ARRIVED", stopId: "A", at: 10_000 }]);
  });

  it("departure and entering the next stop can happen on the same ping", () => {
    const D = stop("D", 150, { radiusMeters: 40 }); // A's exit radius is 115 m
    const { events, state } = run([[0, 0], [0, 0], [150, 0], [150, 0]], [A, D], "D");
    expect(events).toEqual([
      { type: "ARRIVED", stopId: "A", at: 0 },
      { type: "DEPARTED", stopId: "A", at: 20_000 },
      { type: "ARRIVED", stopId: "D", at: 20_000 },
    ]);
    expect(state).toEqual({ phase: "inside", stopId: "D", enteredAt: 20_000 });
  });
});
