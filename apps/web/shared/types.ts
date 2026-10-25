// Types shared by web + convex. Ids are plain strings so the pure logic in
// convex/lib/* can be tested without a database. Shapes mirror Docs/TECHNICAL_ROADMAP.md §2
// and Docs/DATABASE_SCHEMA.md (CONTEXT.md wins on conflicts).

// ---------- Enumerations ----------
export type StopType = "dorm" | "school" | "cafeteria" | "other";
export type BusType = "large" | "small";
// Bus state is three orthogonal dimensions, not one enum (see CONTEXT.md)
export type ServiceStatus = "off_shift" | "in_service" | "out_of_service"; // declared
export type Motion = "active" | "holding"; // from GPS
export type Connectivity = "live" | "signal_lost"; // stored; "stale" is computed at read time (D3)
export type ConnectivityView = "live" | "stale" | "signal_lost"; // what the status view exposes
export type PunctualityStatus = "on_time" | "late" | "early_departure" | "unknown";
// undetected = shift active, no arrival (skip OR miss); departure_unknown = inside at shift end/signal loss;
// unscheduled = at-rest arrival matching no forward entry; pending/temporary_route are view-only
export type StopEventFlag =
  | "late"
  | "early_departure"
  | "unscheduled"
  | "undetected"
  | "departure_unknown"
  | "pending"
  | "temporary_route";
export type StateChangeSource = "system" | "driver" | "cron";
export type HHmm = string; // "14:05", Africa/Dakar
export type ISODate = string; // "2026-11-16"

// ---------- Entities (one per table) ----------
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
  updatedAt: number;
}

export interface ServiceHours {
  days: number[]; // 1 = Monday … 7 = Sunday
  start: HHmm;
  end: HHmm;
}

export interface Bus {
  _id: string;
  code: string;
  name: string;
  type: BusType;
  isActive: boolean;
}

export interface Itinerary {
  _id: string;
  code: string;
  name: string;
  busIds: string[];
  isTemporary: boolean;
  validFrom?: ISODate;
  validUntil?: ISODate;
  daysOfWeek: number[];
  isActive: boolean;
}

export interface ScheduleEntry {
  _id: string;
  itineraryId: string;
  sequence: number;
  stopId: string;
  arriveBy?: HHmm; // omitted on timetable-less temporary itineraries (D4)
  departAt?: HHmm;
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
  outOfServiceReasons: OutOfServiceReason[];
}

export interface Device {
  _id: string;
  busId: string;
  label: string;
  tokenHash: string;
  deviceModel?: string;
  androidVersion?: string;
  appVersion?: string;
  lastSeenAt?: number;
  lastBatteryPercent?: number;
  revokedAt?: number;
  createdAt: number;
}

export interface Shift {
  _id: string;
  busId: string;
  deviceId: string;
  itineraryId: string;
  date: ISODate;
  startedAt: number;
  endedAt?: number;
  endReason?: "driver" | "service_hours_over" | "auto_timeout"; // auto_timeout = server watchdog only
  pingCount: number;
  lastProcessedRecordedAt?: number; // newest recordedAt fed to the live machine (ADR 0002)
  needsReconcile?: boolean; // set on out-of-order batch, cleared by reconcileShift
}

export interface Ping {
  _id: string;
  busId: string;
  shiftId: string;
  clientId: string;
  recordedAt: number;
  receivedAt: number;
  lat: number;
  lng: number;
  accuracy: number;
  speed?: number;
  heading?: number;
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

export interface BusStatus {
  _id: string;
  busId: string;
  shiftId?: string;
  itineraryId?: string;
  serviceStatus: ServiceStatus;
  motion?: Motion;
  connectivity: Connectivity;
  reason?: string;
  note?: string;
  lat?: number;
  lng?: number;
  accuracy?: number;
  lastPingAt?: number;
  geofence: GeofenceState;
  currentStopId?: string;
  lastStopId?: string;
  lastDepartedAt?: number;
  nextEntryId?: string;
  delayMinutes?: number;
  updatedAt: number;
}

export interface StopEvent {
  _id: string;
  busId: string;
  shiftId: string;
  stopId: string;
  scheduleEntryId?: string;
  date: ISODate;
  arrivedAt: number | null; // null = undetected
  departedAt?: number | null; // null = departure_unknown
  arrivalDelayMinutes?: number;
  departureDeltaMinutes?: number;
  flags: StopEventFlag[];
}

export interface StateChange {
  _id: string;
  busId: string;
  dimension: "serviceStatus" | "motion" | "connectivity"; // which dimension changed
  from: string;
  to: string;
  reason?: string;
  source: StateChangeSource;
  at: number;
}

// ---------- Inputs ----------
export interface PingInput {
  clientId: string;
  recordedAt: number;
  lat: number;
  lng: number;
  accuracy: number;
  speed?: number;
  heading?: number;
}
export interface HeartbeatInput {
  batteryPercent: number;
  isCharging: boolean;
  queuedCount: number;
  appVersion: string;
}
export interface IngestPingsInput {
  pings: PingInput[];
  heartbeat?: HeartbeatInput;
}
export interface StartShiftInput {
  itineraryId: string;
  startedAt: number;
}
export interface EndShiftInput {
  endedAt: number;
  reason?: "driver" | "service_hours_over";
}
export interface OutOfServiceReason {
  code: string;
  fr: string;
  en: string;
} // bilingual (E1)
export interface SetBusStateInput {
  serviceStatus: "out_of_service" | "in_service";
  reasonCode?: string;
  note?: string;
}
export interface ProvisionDeviceInput {
  busCode: string;
  label: string;
}

// ---------- Read models (what clients see) ----------
export interface BusStatusView {
  code: string;
  name: string;
  serviceStatus: ServiceStatus;
  motion: Motion | null;
  connectivity: ConnectivityView;
  label: string; // server-derived headline, e.g. "Left Wardini 2 min ago → Yves dorm"
  itinerary: { name: string; isTemporary: boolean } | null;
  currentStop: { name: string; departsAt?: HHmm } | null;
  lastStop: { name: string; departedAt: number } | null;
  nextStop: { name: string; scheduledArrival?: HHmm; scheduledDeparture?: HHmm } | null;
  punctuality: { status: PunctualityStatus; delayMinutes: number | null };
  position: { lat: number; lng: number; updatedAt: number } | null;
  reason: string | null;
  note: string | null;
}

export interface BusLogEntry {
  stopName: string;
  scheduledArrival?: HHmm;
  scheduledDeparture?: HHmm;
  actualArrival: number | null;
  actualDeparture: number | null;
  arrivalDelayMinutes: number | null;
  flags: StopEventFlag[];
}
export interface BusLogView {
  bus: { code: string; name: string };
  date: ISODate;
  entries: BusLogEntry[];
}

// ---------- API wrappers ----------
export interface ApiError {
  error: { code: string; message: string; details?: Record<string, unknown> };
}
export type ApiResponse<T> = T | ApiError;
export interface PaginatedResponse<T> {
  data: T[];
  pagination: { cursor: string | null; isDone: boolean; pageSize: number };
}
