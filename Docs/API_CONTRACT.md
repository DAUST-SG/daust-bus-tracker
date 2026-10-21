# API Contract — DAUST Bus Tracker

Full request and response shapes for `/api/v1`. Conventions:
- Timestamps: Unix milliseconds (UTC). Africa/Dakar is UTC+0, so local and UTC times match.
- Coordinates: WGS84 decimal degrees.
- Distances: metres. Speeds: metres per second.
- Fields marked `// required` or `// optional` in requests.

---

## Device pairing

### POST /api/v1/driver/pair

Called once when the IT Committee enters a token on a new phone.

**Request**

Headers: `Authorization: Bearer <device token>`

```json
{
  "deviceModel": "TECNO Spark 20",        // required, string ≤ 80
  "androidVersion": "14",                 // required
  "appVersion": "1.0.0"                   // required
}
```

**Response (success)** — `200 OK`

```json
{
  "device": { "id": "j57a2...", "label": "Driver phone — Bus 1" },
  "bus": { "code": "BUS-1", "name": "Bus 1", "type": "large" }
}
```

**Response (error)** — `403 Forbidden`

```json
{
  "error": { "code": "DEVICE_REVOKED", "message": "This device token has been revoked. Ask the IT Committee for a new one." }
}
```

---

## Config

### GET /api/v1/driver/config

Fetched at app start and before each shift.

**Request**

Headers: `Authorization: Bearer <device token>` · no body.

**Response (success)** — `200 OK`

```json
{
  "bus": { "code": "BUS-1", "name": "Bus 1" },
  "serviceHours": { "date": "2026-11-16", "start": "06:30", "end": "22:00", "timezone": "Africa/Dakar" },
  "itineraries": [
    {
      "id": "k1x9...",
      "name": "Bus 1 — Weekday loop",
      "isTemporary": false,
      "validUntil": null,
      "stops": [
        { "id": "s_wardini", "name": "Wardini", "sequence": 1 },
        { "id": "s_yves", "name": "Yves dorm", "sequence": 2 },
        { "id": "s_school", "name": "School", "sequence": 3 }
      ]
    },
    {
      "id": "k1y3...",
      "name": "Renovation shuttle",
      "isTemporary": true,
      "validUntil": "2026-12-20",
      "stops": [
        { "id": "s_works_north", "name": "Roadworks — north side", "sequence": 1 },
        { "id": "s_works_south", "name": "Roadworks — south side", "sequence": 2 }
      ]
    }
  ],
  "upload": { "intervalSeconds": 10, "batchMax": 50, "maxAccuracyMeters": 50 },
  "outOfServiceReasons": [                        // bilingual codes (E1): driver sees fr, student page shows en
    { "code": "MECHANICAL", "fr": "Panne mécanique", "en": "Mechanical issue" },
    { "code": "FUEL", "fr": "Carburant", "en": "Fuel" },
    { "code": "LOGISTICS", "fr": "Logistique", "en": "Logistics" },
    { "code": "BREAK", "fr": "Pause chauffeur", "en": "Driver break" },
    { "code": "OTHER", "fr": "Autre", "en": "Other" }
  ]
}
```

**Response (error)** — `401 Unauthorized`

```json
{
  "error": { "code": "UNAUTHORIZED", "message": "Missing or invalid Authorization header." }
}
```

---

## Shifts

### POST /api/v1/driver/shifts

**Request**

```json
{
  "itineraryId": "k1x9...",       // required, must be in today's config
  "startedAt": 1763284200000       // required, device time; server also records its own time
}
```

**Response (success)** — `201 Created`

```json
{
  "shift": {
    "id": "m3q8...",
    "busCode": "BUS-1",
    "itineraryId": "k1x9...",
    "startedAt": 1763284200000,
    "serviceEndsAt": 1763330400000
  },
  "status": { "serviceStatus": "in_service", "motion": "active", "connectivity": "live", "nextStopName": "Wardini", "nextScheduledArrival": "07:00" }
}
```

**Response (error)** — `409 Conflict`

```json
{
  "error": {
    "code": "SHIFT_ALREADY_ACTIVE",
    "message": "A shift is already active for this bus.",
    "details": { "shiftId": "m3q8...", "startedAt": 1763280000000 }
  }
}
```

### POST /api/v1/driver/shifts/end

**Request**

```json
{
  "endedAt": 1763330000000,          // required
  "reason": "driver"                  // optional: "driver" | "service_hours_over"
}
```

**Response (success)** — `200 OK`

```json
{
  "shift": { "id": "m3q8...", "startedAt": 1763284200000, "endedAt": 1763330000000, "pingCount": 4310 }
}
```

**Response (error)** — `409 Conflict`

```json
{
  "error": { "code": "SHIFT_NOT_ACTIVE", "message": "No active shift for this device." }
}
```

---

## Pings

### POST /api/v1/driver/pings

**Request**

```json
{
  "pings": [                                   // required, 1–50 items, oldest first
    {
      "clientId": "5f0c1b9e-2c1a-4b2e-9a8e-1d2f3c4b5a6d",  // required, UUID, used for de-duplication
      "recordedAt": 1763284810000,             // required, device GPS time
      "lat": 14.7461,                          // required, -90..90
      "lng": -17.1789,                         // required, -180..180
      "accuracy": 8.5,                         // required, metres, ≤ 50
      "speed": 6.2,                            // optional, m/s
      "heading": 182.0                         // optional, degrees 0–360
    }
  ],
  "heartbeat": {                               // optional, sent with every batch
    "batteryPercent": 64,
    "isCharging": true,
    "queuedCount": 0,
    "appVersion": "1.0.0"
  }
}
```

<!-- assumed: example coordinates are placeholders, not real stop locations -->

**Response (success)** — `200 OK`

```json
{
  "accepted": 12,
  "duplicates": 0,
  "rejected": 0,
  "status": {
    "serviceStatus": "in_service",
    "motion": "holding",
    "connectivity": "live",
    "currentStopName": "Wardini",
    "nextStopName": "Yves dorm",
    "nextScheduledDeparture": "14:05"
  }
}
```

`rejected` counts points outside service hours or with invalid values; they are skipped, the rest are stored.

**Response (error)** — `413 Payload Too Large`

```json
{
  "error": { "code": "BATCH_TOO_LARGE", "message": "A batch may contain at most 50 pings.", "details": { "received": 64 } }
}
```

---

## Bus state

### PATCH /api/v1/driver/state

**Request**

```json
{
  "serviceStatus": "out_of_service",     // required: "out_of_service" | "in_service"
  "reasonCode": "MECHANICAL",            // required when serviceStatus = out_of_service; from config.outOfServiceReasons
  "note": "En attente du mécanicien"     // optional, ≤ 140 chars, free text shown verbatim to students
}
```

This sets only `serviceStatus`; `motion` and `connectivity` keep updating because tracking continues while out of service.

**Response (success)** — `200 OK`

```json
{
  "status": {
    "busCode": "BUS-1",
    "serviceStatus": "out_of_service",
    "motion": "active",
    "connectivity": "live",
    "reasonCode": "MECHANICAL",
    "reason": "Mechanical issue",          // resolved EN label for the student page
    "note": "En attente du mécanicien",
    "since": 1763290000000
  }
}
```

**Response (error)** — `400 Bad Request`

```json
{
  "error": {
    "code": "VALIDATION_ERROR",
    "message": "A reason is required to mark the bus out of service.",
    "details": { "field": "reason" }
  }
}
```

---

## Public status

### GET /api/v1/status

**Request** — no headers, no body.

**Response (success)** — `200 OK`

```json
{
  "generatedAt": 1763284900000,
  "buses": [
    {
      "code": "BUS-1",
      "name": "Bus 1",
      "serviceStatus": "in_service",
      "motion": "active",
      "connectivity": "live",
      "label": "Left Wardini 2 min ago → Yves dorm",
      "itinerary": { "name": "Bus 1 — Weekday loop", "isTemporary": false },
      "lastStop": { "name": "Wardini", "departedAt": 1763284780000 },
      "nextStop": { "name": "Yves dorm", "scheduledArrival": "14:10", "scheduledDeparture": "14:15" },
      "punctuality": { "status": "on_time", "delayMinutes": 0 },
      "position": { "lat": 14.7470, "lng": -17.1801, "updatedAt": 1763284890000 },
      "reason": null
    },
    {
      "code": "BUS-3",
      "name": "Bus 3",
      "serviceStatus": "in_service",
      "motion": "holding",
      "connectivity": "signal_lost",
      "label": "Signal lost — last seen at School, 6 min ago · due Cafeteria 14:05 · 6 min late",
      "itinerary": { "name": "Bus 3 — Weekday loop", "isTemporary": false },
      "lastStop": { "name": "School", "departedAt": 1763284000000 },
      "nextStop": { "name": "Cafeteria", "scheduledArrival": "14:05", "scheduledDeparture": "14:10" },
      "punctuality": { "status": "late", "delayMinutes": 6 },
      "position": { "lat": 14.7442, "lng": -17.1830, "updatedAt": 1763284500000 },
      "reason": null
    }
  ]
}
```

Status is three orthogonal dimensions — `serviceStatus` (`off_shift`/`in_service`/`out_of_service`), `motion` (`active`/`holding`), `connectivity` (`live`/`stale`/`signal_lost`) — plus a server-derived `label` the page can show directly. A bus can be `out_of_service` *and* last-seen-`holding`; clients needing custom wording compose the three fields themselves. `connectivity` is resolved in the view: `signal_lost` if stored, else `stale` when the last position is older than `staleAfterSeconds`, else `live` (only `live`/`signal_lost` are stored — D3). `off_shift` buses omit `position`, `motion`, `currentStop`, `lastStop` and `nextStop`.

**Response (error)** — `429 Too Many Requests`

```json
{
  "error": { "code": "RATE_LIMITED", "message": "Too many requests. Retry in 30 seconds.", "details": { "retryAfterSeconds": 30 } }
}
```

### GET /api/v1/health

**Response (success)** — `200 OK`

```json
{ "status": "ok", "time": 1763284900000 }
```

---

## Convex query contracts (student web app)

### status:list

**Args**

```json
{}
```

**Returns** — array of `BusStatusView` (same shape as `buses[]` in `GET /api/v1/status`).

### status:busLog

**Args**

```json
{ "busCode": "BUS-1", "date": "2026-11-16" }
```

**Returns**

```json
{
  "bus": { "code": "BUS-1", "name": "Bus 1" },
  "date": "2026-11-16",
  "entries": [
    {
      "stopName": "Wardini",
      "scheduledArrival": "14:00",
      "scheduledDeparture": "14:05",
      "actualArrival": 1763301720000,
      "actualDeparture": 1763302020000,
      "arrivalDelayMinutes": 2,
      "flags": []
    },
    {
      "stopName": "Yves dorm",
      "scheduledArrival": "14:10",
      "scheduledDeparture": "14:15",
      "actualArrival": null,
      "actualDeparture": null,
      "arrivalDelayMinutes": null,
      "flags": ["pending"]
    }
  ]
}
```

Possible `flags`: `late`, `early_departure`, `unscheduled`, `undetected` (shift was active across the entry but no arrival was seen — a true skip *or* a detection miss, not asserted as "driver skipped"), `pending` (view-only: future entry, not yet reached), `temporary_route`. Entries whose time fell outside any shift are **not in service** and are omitted from the log rather than flagged.

**Error** — Convex throws `ConvexError` with:

```json
{ "code": "BUS_NOT_FOUND", "message": "No bus with code BUS-9." }
```
