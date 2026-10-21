// Types shared by web + convex. Ids are plain strings so the pure logic in
// convex/lib/* can be tested without a database.
// ponytail: only the types Sprint 1 uses; API inputs and read models land with
// the code that needs them (Sprint 2 / 4), per Docs/TECHNICAL_ROADMAP.md §2.

// ---------- Enumerations ----------
export type StopType = "dorm" | "school" | "cafeteria" | "other";
export type BusType = "large" | "small";
// Bus state is three orthogonal dimensions, not one enum (see CONTEXT.md)
export type ServiceStatus = "off_shift" | "in_service" | "out_of_service";
export type Motion = "active" | "holding";
export type Connectivity = "live" | "signal_lost"; // stored; "stale" is computed at read time (D3)
export type StopEventFlag =
  | "late"
  | "early_departure"
  | "unscheduled"
  | "undetected"
  | "departure_unknown";
export type HHmm = string; // "14:05", Africa/Dakar
export type ISODate = string; // "2026-11-16"

// ---------- Entities ----------
export interface Stop {
  _id: string;
  code: string;
  name: string;
  type: StopType;
  lat: number;
  lng: number;
  radiusMeters: number;
  exitBufferMeters: number;
  dwellSeconds: number;
  isActive: boolean;
}

export interface ServiceHours {
  days: number[]; // 1 = Monday … 7 = Sunday
  start: HHmm;
  end: HHmm;
}

export interface Config {
  timezone: "Africa/Dakar";
  serviceHours: ServiceHours[];
  lateGraceMinutes: number;
  signalLostAfterSeconds: number;
  staleAfterSeconds: number;
  maxAccuracyMeters: number;
  pingRetentionDays: number;
  matchWindowMinutes: number; // sanity guard only — matching is sequence-forward (ADR 0001)
  stopSpeedThreshold: number; // m/s below which the bus is "at rest"
  restConfirmPings: number; // consecutive at-rest pings inside a radius to confirm arrival
}

// ---------- Geofence engine ----------
export interface GeofenceState {
  phase: "outside" | "entering" | "inside";
  stopId?: string;
  enteredAt?: number;
  restPings?: number; // consecutive at-rest pings while entering
}

export type GeofenceEvent =
  | { type: "ARRIVED"; stopId: string; at: number }
  | { type: "DEPARTED"; stopId: string; at: number };
