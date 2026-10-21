# Technical Roadmap — DAUST Bus Tracker

| | |
|---|---|
| **Version** | 1.0 (prototype) |
| **Last Updated** | 2026-10-20 (reconciled with grilling decisions) |

> Decision record: `CONTEXT.md` + `docs/adr/`. Where this doc and `CONTEXT.md`
> disagree, `CONTEXT.md` wins. Key reconciled points: three-dimension bus state,
> sequence-forward matching (ADR 0001), speed-aware arrival detection, `undetected`
> flag, pointer anchoring, health-view-only silent-failure alert.

Code-level map of the v1 codebase: files, types, function signatures, data flows and build order. The backend replaces the generic `app/api` + `lib/db` pattern with Convex equivalents (HTTP actions + queries/mutations), and the driver app is Kotlin.

## 1. Project File Structure

```text
daust-bus-tracker/
├── apps/
│   ├── web/
│   │   ├── app/
│   │   │   ├── layout.tsx                  # Root layout, ConvexClientProvider, fonts
│   │   │   ├── page.tsx                    # "/" — live status list
│   │   │   ├── map/page.tsx                # "/map" — map of buses + stops (Leaflet, client-only)
│   │   │   ├── bus/[code]/page.tsx         # "/bus/BUS-1" — today's log for one bus
│   │   │   └── about/page.tsx              # How it works, what "late" means
│   │   ├── components/
│   │   │   ├── ConvexClientProvider.tsx    # Wraps app in ConvexProvider
│   │   │   ├── BusStatusList.tsx           # Renders all buses
│   │   │   ├── BusStatusLine.tsx           # One bus: state, stops, punctuality, freshness
│   │   │   ├── StateBadge.tsx              # badge from serviceStatus + motion + connectivity (out_of_service dominates)
│   │   │   ├── PunctualityBadge.tsx        # on time / late X min
│   │   │   ├── UpdatedAgo.tsx              # Ticking "updated 12 s ago" + stale styling
│   │   │   ├── BusMap.tsx                  # Leaflet map (dynamic import, ssr: false)
│   │   │   └── BusLogTable.tsx             # Scheduled vs actual times
│   │   ├── hooks/
│   │   │   ├── useBusStatuses.ts           # useQuery(api.status.list)
│   │   │   ├── useBusLog.ts                # useQuery(api.status.busLog)
│   │   │   └── useNow.ts                   # Ticking clock for relative times
│   │   ├── lib/
│   │   │   ├── format.ts                   # timeAgo, formatHHmm, delayText
│   │   │   └── statusText.ts               # Builds the human status sentence
│   │   ├── convex/
│   │   │   ├── schema.ts                   # All tables + indexes
│   │   │   ├── http.ts                     # HTTP router: /api/v1/*
│   │   │   ├── driverApi.ts                # httpAction handlers for driver endpoints
│   │   │   ├── publicApi.ts                # httpAction handlers for /status, /health
│   │   │   ├── auth.ts                     # Device token hashing + lookup
│   │   │   ├── ingest.ts                   # internalMutation ingestPings
│   │   │   ├── shifts.ts                   # start/end shift, internal
│   │   │   ├── busState.ts                 # set out-of-service / in-service
│   │   │   ├── status.ts                   # public queries: list, busLog
│   │   │   ├── stops.ts                    # public query: list
│   │   │   ├── devices.ts                  # provision / revoke (internal, CLI)
│   │   │   ├── reports.ts                  # health, exportStopEvents (internal)
│   │   │   ├── crons.ts                    # signal-lost, close shifts, purge pings
│   │   │   ├── seed.ts                     # loadAll (idempotent upsert)
│   │   │   ├── rateLimits.ts               # Rate limiter definitions
│   │   │   ├── lib/
│   │   │   │   ├── geo.ts                  # haversineMeters, impliedSpeed
│   │   │   │   ├── geofence.ts             # Pure state machine: ping → events
│   │   │   │   ├── schedule.ts             # Pure: match events to scheduleEntries, delays
│   │   │   │   ├── status.ts               # Pure: derive BusStatusView
│   │   │   │   ├── time.ts                 # Dakar time helpers, service-hours check
│   │   │   │   └── errors.ts               # apiError(), error codes
│   │   │   ├── seed/                       # Editable reference data
│   │   │   │   ├── stops.ts
│   │   │   │   ├── buses.ts
│   │   │   │   ├── itineraries.ts
│   │   │   │   ├── schedule.ts
│   │   │   │   └── config.ts
│   │   │   ├── migrations/                 # One-off data migrations
│   │   │   └── __tests__/                  # Vitest: geofence, schedule, status, ingest
│   │   │       └── fixtures/               # Recorded GPS traces (JSON)
│   │   ├── shared/types.ts                 # Types shared by web + convex
│   │   ├── .env.example
│   │   └── package.json
│   └── driver-android/
│       ├── app/src/main/
│       │   ├── AndroidManifest.xml         # Permissions, foreground service type=location
│       │   └── java/sn/daust/bustracker/
│       │       ├── BusTrackerApp.kt        # Application: DI wiring, notification channel
│       │       ├── MainActivity.kt         # Compose host + navigation
│       │       ├── ui/                     # All driver-facing copy in FRENCH (Product Decision E1)
│       │       │   ├── PairingScreen.kt    # Enter device token
│       │       │   ├── SetupScreen.kt      # Permissions, battery exemption, brand tips
│       │       │   ├── ShiftScreen.kt      # Start/stop shift, itinerary picker, status
│       │       │   ├── StateScreen.kt      # Out of service + reason
│       │       │   └── ShiftViewModel.kt   # UI state
│       │       ├── tracking/
│       │       │   ├── TrackingService.kt  # Foreground service, location updates
│       │       │   ├── LocationSource.kt   # FusedLocationProviderClient wrapper
│       │       │   ├── ServiceHoursGuard.kt# Stops tracking at service end (AlarmManager)
│       │       │   └── BootReceiver.kt     # Resumes an active shift after reboot
│       │       ├── data/
│       │       │   ├── db/AppDatabase.kt   # Room database
│       │       │   ├── db/PingEntity.kt    # Queued ping row
│       │       │   ├── db/PingDao.kt       # insert, oldest(n), delete(ids)
│       │       │   ├── api/BusApi.kt       # OkHttp client for /api/v1/driver/*
│       │       │   ├── api/Dto.kt          # kotlinx.serialization DTOs
│       │       │   ├── Uploader.kt         # Batch upload loop with backoff
│       │       │   ├── TokenStore.kt       # DataStore + Keystore encryption
│       │       │   └── ShiftRepository.kt  # Shift state, config cache
│       │       └── domain/
│       │           ├── Models.kt           # Bus, Itinerary, ShiftState
│       │           └── BatteryInfo.kt      # Battery % and charging
│       └── build.gradle.kts
├── docs/                                   # This bundle
└── .github/workflows/ci.yml                # Typecheck + tests (web/convex), Gradle build
```

## 2. Type Definitions

```typescript
// apps/web/shared/types.ts

// ---------- Enumerations ----------
export type StopType = "dorm" | "school" | "cafeteria" | "other";
export type BusType = "large" | "small";
// Bus state is three orthogonal dimensions, not one enum (see CONTEXT.md)
export type ServiceStatus = "off_shift" | "in_service" | "out_of_service"; // declared
export type Motion = "active" | "holding";                                 // from GPS
export type Connectivity = "live" | "signal_lost";          // STORED (cron). "stale" is computed at read time from lastPingAt age (D3)
export type ConnectivityView = "live" | "stale" | "signal_lost"; // what the status view exposes
export type PunctualityStatus = "on_time" | "late" | "early_departure" | "unknown";
// undetected = shift active, no arrival (skip OR miss); departure_unknown = inside at shift end/signal loss;
// unscheduled = at-rest arrival matching no forward entry; pending/temporary_route are view-only
export type StopEventFlag = "late" | "early_departure" | "unscheduled" | "undetected" | "departure_unknown" | "pending" | "temporary_route";
export type StateChangeSource = "system" | "driver" | "cron";
export type HHmm = string;   // "14:05", Africa/Dakar
export type ISODate = string; // "2026-11-16"

// ---------- Entities (one per table) ----------
export interface Stop {
  _id: string; code: string; name: string; type: StopType;
  lat: number; lng: number;
  radiusMeters: number; exitBufferMeters: number; dwellSeconds: number;
  isActive: boolean; updatedAt: number;
}

export interface Bus { _id: string; code: string; name: string; type: BusType; isActive: boolean; }

export interface Itinerary {
  _id: string; code: string; name: string; busIds: string[];
  isTemporary: boolean; validFrom?: ISODate; validUntil?: ISODate;
  daysOfWeek: number[]; isActive: boolean;
}

export interface ScheduleEntry {
  _id: string; itineraryId: string; sequence: number; stopId: string;
  arriveBy?: HHmm; departAt?: HHmm;
}

export interface Config {
  timezone: "Africa/Dakar";
  serviceHours: { days: number[]; start: HHmm; end: HHmm }[];
  lateGraceMinutes: number; signalLostAfterSeconds: number; staleAfterSeconds: number;
  maxAccuracyMeters: number; pingRetentionDays: number;
  matchWindowMinutes: number;   // sanity guard only — matching is sequence-forward (ADR 0001)
  stopSpeedThreshold: number;   // m/s below which the bus is "at rest" for arrival detection
  restConfirmPings: number;     // consecutive at-rest pings inside a radius to confirm arrival
}

export interface Device {
  _id: string; busId: string; label: string; tokenHash: string;
  deviceModel?: string; androidVersion?: string; appVersion?: string;
  lastSeenAt?: number; lastBatteryPercent?: number; revokedAt?: number; createdAt: number;
}

export interface Shift {
  _id: string; busId: string; deviceId: string; itineraryId: string; date: ISODate;
  startedAt: number; endedAt?: number;
  endReason?: "driver" | "service_hours_over" | "auto_timeout"; // auto_timeout = server watchdog only
  pingCount: number;
  lastProcessedRecordedAt?: number; // newest recordedAt fed to the live machine (ADR 0002)
  needsReconcile?: boolean;         // set on out-of-order batch, cleared by reconcileShift
}

export interface Ping {
  _id: string; busId: string; shiftId: string; clientId: string;
  recordedAt: number; receivedAt: number;
  lat: number; lng: number; accuracy: number; speed?: number; heading?: number;
}

export interface GeofenceState {
  phase: "outside" | "entering" | "inside";
  stopId?: string;
  enteredAt?: number;
}

export interface BusStatus {
  _id: string; busId: string; shiftId?: string; itineraryId?: string;
  serviceStatus: ServiceStatus; motion?: Motion; connectivity: Connectivity;
  reason?: string; note?: string;
  lat?: number; lng?: number; accuracy?: number; lastPingAt?: number;
  geofence: GeofenceState;
  currentStopId?: string; lastStopId?: string; lastDepartedAt?: number;
  nextEntryId?: string; delayMinutes?: number; updatedAt: number;
}

export interface StopEvent {
  _id: string; busId: string; shiftId: string; stopId: string; scheduleEntryId?: string;
  date: ISODate; arrivedAt: number; departedAt?: number;
  arrivalDelayMinutes?: number; departureDeltaMinutes?: number; flags: StopEventFlag[];
}

export interface StateChange {
  _id: string; busId: string;
  dimension: "serviceStatus" | "motion" | "connectivity"; // which dimension changed
  from: string; to: string;
  reason?: string; source: StateChangeSource; at: number;
}

// ---------- Inputs ----------
export interface PingInput {
  clientId: string; recordedAt: number; lat: number; lng: number;
  accuracy: number; speed?: number; heading?: number;
}
export interface HeartbeatInput { batteryPercent: number; isCharging: boolean; queuedCount: number; appVersion: string; }
export interface IngestPingsInput { pings: PingInput[]; heartbeat?: HeartbeatInput; }
export interface StartShiftInput { itineraryId: string; startedAt: number; }
export interface EndShiftInput { endedAt: number; reason?: "driver" | "service_hours_over"; }
export interface OutOfServiceReason { code: string; fr: string; en: string; } // bilingual (E1)
export interface SetBusStateInput { serviceStatus: "out_of_service" | "in_service"; reasonCode?: string; note?: string; }
export interface CreateStopInput extends Omit<Stop, "_id" | "updatedAt"> {}
export interface UpdateStopInput extends Partial<CreateStopInput> { code: string; }
export interface ProvisionDeviceInput { busCode: string; label: string; }

// ---------- Geofence engine ----------
export type GeofenceEvent =
  | { type: "ARRIVED"; stopId: string; at: number }
  | { type: "DEPARTED"; stopId: string; at: number };

// ---------- Read models (what clients see) ----------
export interface BusStatusView {
  code: string; name: string;
  serviceStatus: ServiceStatus; motion: Motion | null; connectivity: ConnectivityView;
  label: string;   // server-derived headline, e.g. "Left Wardini 2 min ago → Yves dorm"
  itinerary: { name: string; isTemporary: boolean } | null;
  currentStop: { name: string; departsAt?: HHmm } | null;
  lastStop: { name: string; departedAt: number } | null;
  nextStop: { name: string; scheduledArrival?: HHmm; scheduledDeparture?: HHmm } | null;
  punctuality: { status: PunctualityStatus; delayMinutes: number | null };
  position: { lat: number; lng: number; updatedAt: number } | null;
  reason: string | null; note: string | null;
}

export interface BusLogEntry {
  stopName: string; scheduledArrival?: HHmm; scheduledDeparture?: HHmm;
  actualArrival: number | null; actualDeparture: number | null;
  arrivalDelayMinutes: number | null; flags: StopEventFlag[];
}
export interface BusLogView { bus: { code: string; name: string }; date: ISODate; entries: BusLogEntry[]; }

// ---------- API wrappers ----------
export interface ApiError { error: { code: string; message: string; details?: Record<string, unknown> } }
export type ApiResponse<T> = T | ApiError;
export interface PaginatedResponse<T> { data: T[]; pagination: { cursor: string | null; isDone: boolean; pageSize: number } }
```

```kotlin
// apps/driver-android/.../domain/Models.kt
data class BusInfo(val code: String, val name: String)
data class ItineraryOption(val id: String, val name: String, val isTemporary: Boolean, val validUntil: String?)
data class DriverConfig(
    val bus: BusInfo, val serviceStart: String, val serviceEnd: String,
    val itineraries: List<ItineraryOption>, val intervalSeconds: Int,
    val batchMax: Int, val maxAccuracyMeters: Float, val outOfServiceReasons: List<OutOfServiceReason>
)
sealed interface ShiftState {
    data object Unpaired : ShiftState
    data object OffShift : ShiftState
    data class OnShift(val shiftId: String, val itinerary: ItineraryOption, val startedAt: Long,
                       val lastUploadAt: Long?, val queued: Int) : ShiftState
}

// .../data/db/PingEntity.kt
@Entity(tableName = "pings")
data class PingEntity(
    @PrimaryKey val clientId: String, val recordedAt: Long,
    val lat: Double, val lng: Double, val accuracy: Float,
    val speed: Float?, val heading: Float?
)
```

## 3. Function Signatures

### `convex/lib/geo.ts`
```typescript
export function haversineMeters(a: { lat: number; lng: number }, b: { lat: number; lng: number }): number;
export function impliedSpeedMps(prev: { lat: number; lng: number; recordedAt: number },
                                next: { lat: number; lng: number; recordedAt: number }): number;
```

### `convex/lib/geofence.ts` — pure state machine
```typescript
/**
 * outside  --(inside entry radius of expected stop S)--> entering(S, enteredAt)
 * entering --(at rest: speed < stopSpeedThreshold for restConfirmPings, OR dwellSeconds elapsed
 *             as fallback when speed is unavailable)--> inside(S)  emits ARRIVED(S, enteredAt)
 * entering --(left entry radius before confirming at-rest)--> outside   (roll-by: no event)
 * inside   --(beyond THIS stop's exit radius = radius + buffer)--> outside  emits DEPARTED(S, firstOutsideAt)
 *            (departure is keyed to the current stop even if now inside another stop's radius)
 * Overlapping radii are disambiguated by `expectedStopId` (the stop at nextEntryId); the
 * expected stop wins — NOT nearest-centre. See CONTEXT.md (geofence disambiguation).
 */
export function stepGeofence(
  state: GeofenceState,
  ping: { lat: number; lng: number; recordedAt: number; speed?: number },
  stops: Pick<Stop, "_id" | "lat" | "lng" | "radiusMeters" | "exitBufferMeters" | "dwellSeconds">[],
  expectedStopId: string | undefined,
  config: Pick<Config, "stopSpeedThreshold" | "restConfirmPings">
): { state: GeofenceState; events: GeofenceEvent[] };
```

### `convex/lib/schedule.ts` — pure
```typescript
/**
 * Sequence-forward match (ADR 0001): the earliest UNVISITED entry for this stop at or after
 * the current pointer (nextEntryId), NOT nearest-by-time. Binds a late arrival to the visit it
 * was attempting, preserving lateness. `matchWindowMinutes` is only a sanity guard here:
 * reject/flag an arrival absurdly far from the expected slot. Returns the matched entry plus any
 * entries that were skipped past (to be logged `undetected` with arrivedAt = null).
 */
export function matchEntry(
  stopId: string, at: number, date: ISODate,
  entries: ScheduleEntry[], nextEntryId: string | undefined,
  alreadyMatchedIds: Set<string>, config: Config
): { matched: ScheduleEntry | null; skipped: ScheduleEntry[] };

export function arrivalDelayMinutes(entry: ScheduleEntry, arrivedAt: number, date: ISODate): number | null;
export function departureDeltaMinutes(entry: ScheduleEntry, departedAt: number, date: ISODate): number | null;
export function flagsFor(entry: ScheduleEntry | null, e: Partial<StopEvent>, config: Config): StopEventFlag[];

/**
 * Anchor/advance the pointer. Normally the next unvisited entry in sequence order. At shift
 * start and after any gap > ~1 headway (e.g. signal_lost), re-anchor by SCHEDULED TIME to the
 * first unvisited entry whose arriveBy >= now − lateGrace, so a late start or blackout does not
 * cascade-match stale entries. See CONTEXT.md (pointer anchoring).
 */
export function nextExpectedEntry(entries: ScheduleEntry[], matchedIds: Set<string>, now: number, date: ISODate, config: Config): ScheduleEntry | null;

/** Positive when now > arriveBy + grace and the bus has not arrived. */
export function runningLateMinutes(next: ScheduleEntry | null, now: number, date: ISODate, config: Config): number | null;
```

### `convex/lib/status.ts` — pure
```typescript
export function deriveBusStatusView(input: {
  bus: Bus; status: BusStatus; itinerary: Itinerary | null;
  stopsById: Map<string, Stop>; entriesById: Map<string, ScheduleEntry>;
  now: number; config: Config;
}): BusStatusView;
```

### `convex/lib/time.ts`
```typescript
export function dakarDate(ms: number): ISODate;
export function hhmmToMs(date: ISODate, hhmm: HHmm): number;
export function isWithinServiceHours(ms: number, config: Config): boolean;
export function serviceEndMs(date: ISODate, config: Config): number | null;
```

### `convex/auth.ts`
```typescript
export async function hashToken(token: string, pepper: string): Promise<string>;
export const deviceByTokenHash: InternalQuery<{ tokenHash: string }, (Device & { bus: Bus }) | null>;
/** Used at the start of every driver httpAction. Throws 401/403 Response on failure. */
export async function requireDevice(ctx: ActionCtx, request: Request): Promise<{ device: Device; bus: Bus }>;
```

### `convex/driverApi.ts` — HTTP action handlers
```typescript
export const pair: HttpAction;          // POST /api/v1/driver/pair
export const getConfig: HttpAction;     // GET  /api/v1/driver/config
export const startShift: HttpAction;    // POST /api/v1/driver/shifts
export const endShift: HttpAction;      // POST /api/v1/driver/shifts/end
export const postPings: HttpAction;     // POST /api/v1/driver/pings
export const patchState: HttpAction;    // PATCH /api/v1/driver/state
```

### `convex/publicApi.ts`
```typescript
export const getStatus: HttpAction;     // GET /api/v1/status
export const health: HttpAction;        // GET /api/v1/health
```

### `convex/ingest.ts`
```typescript
export const ingestPings: InternalMutation<
  { deviceId: Id<"devices">; busId: Id<"buses">; pings: PingInput[]; heartbeat?: HeartbeatInput },
  { accepted: number; duplicates: number; rejected: number; status: BusStatusView }
>;
/** ADR 0002: re-run pure geofence+schedule over all of a shift's pings in recordedAt order,
 *  rebuild its stopEvents (idempotent on (shiftId, scheduleEntryId)) and pointer. Invoked when a
 *  batch arrives with recordedAt < shift.lastProcessedRecordedAt; also sweeps needsReconcile shifts. */
export const reconcileShift: InternalMutation<{ shiftId: Id<"shifts"> }, { rebuilt: number }>;
```

### `convex/shifts.ts`
```typescript
export const start: InternalMutation<{ deviceId: Id<"devices">; busId: Id<"buses"> } & StartShiftInput, { shift: Shift; status: BusStatusView }>;
export const end: InternalMutation<{ busId: Id<"buses"> } & EndShiftInput, { shift: Shift }>; // sets serviceStatus=off_shift; if geofence inside, closes open stopEvent with departure_unknown (D2)
export const activeForBus: InternalQuery<{ busId: Id<"buses"> }, Shift | null>;
export const closeAfterHours: InternalMutation<{}, { closed: number }>; // cron
```

### `convex/busState.ts`
```typescript
export const set: InternalMutation<{ busId: Id<"buses"> } & SetBusStateInput, BusStatus>; // sets serviceStatus only; motion/connectivity keep updating
/** cron: sets connectivity=signal_lost (never touches serviceStatus) and calls onSignalLost. */
export const markSignalLost: InternalMutation<{}, { flagged: string[] }>;
/** v1 no-op stub: silent-failure surface is the health view only (user decision). Wired so a
 *  Telegram/email webhook can be enabled by config if pilot week 1 shows missed failures. */
export function onSignalLost(busCodes: string[]): Promise<void>;
```

### `convex/status.ts` — public queries
```typescript
export const list: Query<{}, BusStatusView[]>;
export const busLog: Query<{ busCode: string; date: ISODate }, BusLogView>;
```

### `convex/devices.ts`, `seed.ts`, `reports.ts` — internal (CLI)
```typescript
export const provision: InternalMutation<ProvisionDeviceInput, { token: string; deviceId: Id<"devices"> }>;
export const revoke: InternalMutation<{ deviceId: Id<"devices"> }, null>;
export const loadAll: InternalMutation<{}, { stops: number; buses: number; itineraries: number; entries: number }>;
export const health: InternalQuery<{}, { busCode: string; serviceStatus: ServiceStatus; connectivity: Connectivity; lastPingAgeSec: number | null; battery?: number }[]>;
export const exportStopEvents: InternalQuery<{ from: ISODate; to: ISODate }, string /* CSV */>;
export const purgeOldPings: InternalMutation<{}, { deleted: number }>; // cron
```

### Web hooks
```typescript
// hooks/useBusStatuses.ts
export function useBusStatuses(): { buses: BusStatusView[] | undefined; isLoading: boolean };
// hooks/useBusLog.ts
export function useBusLog(busCode: string, date: ISODate): { log: BusLogView | undefined; isLoading: boolean };
// hooks/useNow.ts
export function useNow(intervalMs?: number): number;
// lib/statusText.ts
export function statusSentence(view: BusStatusView, now: number): string;
// lib/format.ts
export function timeAgo(ms: number, now: number): string;
export function delayText(delayMinutes: number | null): string;
```

### Driver app (Kotlin)
```kotlin
// tracking/TrackingService.kt
class TrackingService : LifecycleService() {
    companion object { fun start(context: Context); fun stop(context: Context) }
    override fun onStartCommand(intent: Intent?, flags: Int, startId: Int): Int  // START_STICKY
    private fun onLocation(location: Location)                                    // filter → PingDao.insert
}
// tracking/LocationSource.kt
class LocationSource(context: Context) {
    fun updates(intervalMs: Long): Flow<Location>   // Priority.PRIORITY_HIGH_ACCURACY
}
// tracking/ServiceHoursGuard.kt
class ServiceHoursGuard(context: Context) { fun scheduleStopAt(epochMs: Long); fun cancel() }
// data/Uploader.kt
class Uploader(private val dao: PingDao, private val api: BusApi) {
    suspend fun runLoop()                     // every intervalSeconds: send oldest ≤ batchMax, delete on 2xx
    internal fun backoffMs(attempt: Int): Long // 5s, 10s, 20s … max 5 min
}
// data/api/BusApi.kt
interface BusApi {
    suspend fun pair(req: PairRequest): Result<PairResponse>
    suspend fun config(): Result<DriverConfigDto>
    suspend fun startShift(req: StartShiftRequest): Result<StartShiftResponse>
    suspend fun endShift(req: EndShiftRequest): Result<EndShiftResponse>
    suspend fun postPings(req: PingBatchRequest): Result<PingBatchResponse>
    suspend fun setState(req: SetStateRequest): Result<SetStateResponse>
}
// data/db/PingDao.kt
@Dao interface PingDao {
    @Insert(onConflict = OnConflictStrategy.IGNORE) suspend fun insert(p: PingEntity)
    @Query("SELECT * FROM pings ORDER BY recordedAt ASC LIMIT :n") suspend fun oldest(n: Int): List<PingEntity>
    @Query("DELETE FROM pings WHERE clientId IN (:ids)") suspend fun delete(ids: List<String>)
    @Query("SELECT COUNT(*) FROM pings") fun count(): Flow<Int>
    @Query("DELETE FROM pings WHERE recordedAt < :cutoff") suspend fun dropOlderThan(cutoff: Long)
}
// data/TokenStore.kt
class TokenStore(context: Context) { suspend fun save(token: String); suspend fun read(): String?; suspend fun clear() }
// data/ShiftRepository.kt
class ShiftRepository(api: BusApi, store: TokenStore) {
    val state: StateFlow<ShiftState>
    suspend fun refreshConfig(): DriverConfig
    suspend fun startShift(itineraryId: String)
    suspend fun endShift(reason: String = "driver")
    suspend fun setOutOfService(reason: String, note: String?)
    suspend fun setInService()
}
```

## 4. Exact Data Flow

### Flow A — Position to student screen
```text
TrackingService.onLocation(location)
  → filter: accuracy ≤ 50 m, within service hours (local check)
  → PingDao.insert(PingEntity(clientId = UUID, ...))            [Room, on device]
Uploader.runLoop()
  → PingDao.oldest(50)
  → BusApi.postPings(batch + heartbeat)                         [HTTPS]
      → convex/http.ts route POST /api/v1/driver/pings
      → driverApi.postPings
          → auth.requireDevice()  → devices.by_tokenHash
          → rateLimits.check(device)
          → validate body
          → ctx.runMutation(internal.ingest.ingestPings)
              → shifts.activeForBus()                           [shifts.by_bus_active]
              → load itinerary stops + scheduleEntries + config
              → if any ping.recordedAt < shift.lastProcessedRecordedAt (ADR 0002):
                   set shift.needsReconcile = true; schedule internal.ingest.reconcileShift
                   (live busStatus below is NOT rewound; stopEvents become correct after replay)
              → for each ping (sorted by recordedAt):
                   skip duplicate (pings.by_shift_clientId) / implausible
                   db.insert("pings")
                   lib/geofence.stepGeofence(state, ping, stops, expectedStopId, config) → events
                   for ARRIVED: lib/schedule.matchEntry() → db.insert matched "stopEvents";
                                insert skipped[] as stopEvents (arrivedAt=null, flag "undetected");
                                advance nextEntryId
                   for DEPARTED: patch open stopEvent with departedAt + delta + flags
                                (early_departure only if not already late; departAt is a floor)
              → lib/status: motion from geofence phase (inside=holding), connectivity stored=live,
                            nextEntryId, delayMinutes (connectivity "stale" is computed later in the view)
              → db.patch("busStatus"); set shift.lastProcessedRecordedAt = max seen
              → db.insert("stateChanges") per dimension that changed
              → devices.patch(lastSeenAt, battery)
          ← { accepted, duplicates, rejected, status }
  ← 200 → PingDao.delete(sent ids)
Convex reactivity: busStatus changed → status.list re-runs
  → WebSocket push → useBusStatuses() → BusStatusList → BusStatusLine re-renders
```

### Flow B — Start shift
```text
ShiftScreen "Start shift" (itinerary chosen)
  → ShiftViewModel.onStart(itineraryId)
  → ShiftRepository.startShift()
  → BusApi.startShift()  → POST /api/v1/driver/shifts
      → driverApi.startShift → requireDevice → isWithinServiceHours
      → internal.shifts.start
          → check no active shift; check itinerary assigned + valid today
          → freeze config into the shift (later dashboard edits apply to the NEXT shift only)
          → db.insert("shifts"); db.patch("busStatus", serviceStatus=in_service, motion=active,
                connectivity=live, geofence=outside, nextEntryId anchored by scheduled time to now)
          → db.insert("stateChanges")
      ← 201 { shift, status }
  → ServiceHoursGuard.scheduleStopAt(serviceEndsAt)
  → TrackingService.start()   (foreground notification shown)
```

### Flow C — Signal lost
```text
crons.ts every 1 min → internal.busState.markSignalLost
  → query busStatus where shiftId set and lastPingAt < now − 300 s and connectivity ≠ signal_lost
  → db.patch(connectivity = signal_lost)   // serviceStatus/motion untouched → keeps last-known position
  → if geofence.phase == inside: close the open stopEvent (departedAt=null, flag departure_unknown) (D2)
  → db.insert("stateChanges", dimension=connectivity, source = cron)
  → onSignalLost(busCodes)   // v1 no-op; health view is the only alert surface
  → status.list subscribers updated → "Signal lost — last seen 6 min ago"
next valid ping → ingestPings sets connectivity=live and re-anchors nextEntryId by scheduled time
```

### Flow D — Today's log for a bus
```text
/bus/[code] page → useBusLog(code, today)
  → query status.busLog
      → buses.by_code → shift(s) today → itinerary scheduleEntries (by_itinerary_sequence)
      → stopEvents.by_bus_date
      → join sequence-forward: each entry + its matched event; shift active but no arrival → "undetected";
        entry outside any shift → omitted (not in service); future entry → "pending"
  ← BusLogView → BusLogTable
```

### Flow E — Out of service
```text
StateScreen → ShiftRepository.setOutOfService(reason, note)
  → PATCH /api/v1/driver/state → driverApi.patchState → internal.busState.set
      → db.patch(busStatus: serviceStatus=out_of_service, reason, note); db.insert(stateChanges, dimension=serviceStatus, source=driver)
  ← 200 → students see "Out of service — Mechanical issue"
(tracking keeps running; motion/connectivity + geofence events still update; serviceStatus stays
 out_of_service until the driver sets in_service — serviceStatus dominates the student label)
```

## 5. Files to Create vs. Modify

### Create from scratch
| File | Purpose |
|---|---|
| `apps/web/convex/schema.ts` | Tables and indexes |
| `apps/web/convex/lib/geo.ts` | Distance and speed |
| `apps/web/convex/lib/geofence.ts` | Arrival/departure state machine |
| `apps/web/convex/lib/schedule.ts` | Timetable matching and delays |
| `apps/web/convex/lib/status.ts` | Status view derivation |
| `apps/web/convex/lib/time.ts` | Dakar time and service hours |
| `apps/web/convex/http.ts`, `driverApi.ts`, `publicApi.ts` | HTTP endpoints |
| `apps/web/convex/auth.ts`, `devices.ts` | Device tokens |
| `apps/web/convex/ingest.ts`, `shifts.ts`, `busState.ts` | Write paths |
| `apps/web/convex/status.ts`, `stops.ts`, `reports.ts` | Read paths |
| `apps/web/convex/crons.ts`, `seed.ts`, `seed/*` | Jobs and reference data |
| `apps/web/convex/__tests__/*` + `fixtures/*` | Unit tests with GPS traces |
| `apps/web/app/*`, `components/*`, `hooks/*`, `lib/*` | Student web app |
| `apps/driver-android/**` | Entire driver app |
| `.github/workflows/ci.yml` | CI |

### Modify existing
| File | What to change |
|---|---|
| — | New repository; nothing exists yet. In v2, `convex/status.ts` and `schema.ts` gain coordinator fields, and the MyDAUST hub links to `/` |

## 6. Component Interaction Map

```text
RootLayout (ConvexClientProvider)
├── "/" StatusPage
│   └── BusStatusList            ← useBusStatuses()  [status.list subscription]
│       └── BusStatusLine ×4     ← useNow(1000)       [ticking relative times]
│           ├── StateBadge
│           ├── PunctualityBadge
│           ├── UpdatedAgo       (stale if > staleAfterSeconds)
│           └── Link → /bus/[code]
├── "/map" MapPage
│   └── BusMap (dynamic, ssr:false) ← useBusStatuses() + useQuery(stops.list)
│       ├── StopMarker ×N (radius circle)
│       └── BusMarker ×4 (popup = BusStatusLine)
├── "/bus/[code]" BusPage
│   ├── BusStatusLine            ← useBusStatuses() filtered by code
│   └── BusLogTable              ← useBusLog(code, today)
└── "/about" AboutPage           (static)

Driver app
MainActivity (NavHost)
├── PairingScreen → ShiftRepository.pair
├── SetupScreen   → permission + battery-exemption intents
├── ShiftScreen   ← ShiftViewModel ← ShiftRepository.state, PingDao.count()
│   └── starts/stops TrackingService → LocationSource → PingDao → Uploader → BusApi
└── StateScreen   → ShiftRepository.setOutOfService / setInService
```

**State ownership**
| State | Lives in | Shared via |
|---|---|---|
| Bus status (serviceStatus/motion/connectivity, stops, delay) | Convex `busStatus` | `status.list` subscription |
| Raw positions | Phone Room queue → Convex `pings` | Uploader batches |
| Geofence phase per bus | Convex `busStatus.geofence` | Internal only |
| Timetable, stops, itineraries | Convex reference tables (seeded from Git) | Queries + driver config endpoint |
| Current time for "X ago" | Browser (`useNow`) | Props |
| Device token | Phone DataStore (Keystore-encrypted) | `Authorization` header |
| Shift state on phone | `ShiftRepository.state` (StateFlow) | ViewModel → Compose |

## 7. Build Order

1. `shared/types.ts` and `convex/schema.ts` — the vocabulary everything else uses.
2. `convex/seed/*` + `seed.loadAll` with placeholder stops and one itinerary.
3. `lib/geo.ts`, `lib/time.ts` with unit tests.
4. `lib/geofence.ts` with tests on recorded traces: full stop, quick stop at-rest below dwell, roll-by (no event), jitter at the edge, overlapping-radii disambiguation by expected stop.
5. `lib/schedule.ts` with tests: sequence-forward match, on time, late (bound to the attempted visit, lateness preserved), early departure only when not already late, `undetected` skip auto-advance, loop with repeated stops, pointer re-anchoring after a gap.
6. `lib/status.ts` with tests: running late before arrival, holding, `connectivity=signal_lost` leaving serviceStatus intact, derived label composition.
7. `auth.ts`, `devices.provision` / `revoke`.
8. `shifts.ts`, `ingest.ts`, `busState.ts`.
9. `http.ts` + `driverApi.ts` + `publicApi.ts`, rate limits; test with a script that replays a GPS trace via HTTP (a "fake bus").
10. `crons.ts` (signal lost, close shifts, purge).
11. Web: provider, `useBusStatuses`, `BusStatusLine`, status page — driven by the fake bus.
12. Android: pairing + token store + config.
13. Android: foreground service + location + Room queue + uploader.
14. Android: setup screen (permissions, battery exemption, brand tips), service-hours guard, boot receiver.
15. Real test on one bus for 3 days; tune radii and dwell from recorded data.
16. Web: map, bus log, about page; Android: out-of-service screen, itinerary picker.
17. Reports (`health`, `exportStopEvents`), stale-data UI, error/empty states.
18. Edge cases: phone reboot mid-shift, clock skew, two devices for one bus, itinerary expiring mid-shift, shift left open overnight.
