# API Design — DAUST Bus Tracker

| | |
|---|---|
| **Base URL** | `https://<deployment>.convex.site/api/v1` (Convex HTTP actions) |
| **Protocol** | HTTPS only |
| **Auth** | Bearer device token (driver endpoints); none (public status endpoints) |
| **Format** | JSON, UTF-8; timestamps as Unix milliseconds (UTC); schedule times as `"HH:mm"` in Africa/Dakar |
| **Version** | v1 |

> Reconciled with grilling decisions 2026-10-20. Decision record: `CONTEXT.md` +
> `docs/adr/`. Bus status is three orthogonal dimensions (`serviceStatus` / `motion` /
> `connectivity`) plus a derived `label` — see `API_CONTRACT.md`.

The system has two kinds of interface:

1. **REST over HTTP actions** — used by the Android driver app and, later, external consumers such as the MyDAUST hub.
2. **Convex query functions over WebSocket** — used by the Next.js student page for real-time updates. These are not REST endpoints; they are listed at the end for completeness.

## Design Principles

1. **Resource-oriented** — URLs name resources (`shifts`, `pings`, `state`), not actions where avoidable.
2. **Plural nouns** for collections (`/pings`, `/shifts`, `/buses`).
3. **HTTP verbs carry meaning** — `GET` reads, `POST` creates, `PATCH` partially updates.
4. **Versioned** — every path starts with `/api/v1`; breaking changes go to `/v2`.
5. **Batch writes from devices** — pings are posted in batches (1–50) to save data and battery.
6. **Idempotent where retried** — each ping carries a client-generated `clientId`; duplicates are ignored, so the app can safely retry.
7. **The device decides nothing** — devices send facts (positions, chosen itinerary, state); the server derives everything else.
8. **Small responses** — phones are on mobile data.

## Authentication

Driver endpoints require a device token in the `Authorization` header. A token is created by the IT Committee for one bus with `devices:provision`, shown once, and stored hashed (SHA-256 + pepper) in Convex.

```text
Authorization: Bearer dbt_live_7Hq2...k9Zx
```

Public routes (no auth):
- `GET /api/v1/status`
- `GET /api/v1/health` (liveness only, no data)

## Resource Map

### Device pairing
| Method | Endpoint | Description | Auth |
|---|---|---|---|
| POST | `/api/v1/driver/pair` | Validate a token and return the bus it is linked to | Device token |

### Config
| Method | Endpoint | Description | Auth |
|---|---|---|---|
| GET | `/api/v1/driver/config` | Bus info, itineraries available today, service hours, upload settings | Device token |

### Shifts
| Method | Endpoint | Description | Auth |
|---|---|---|---|
| POST | `/api/v1/driver/shifts` | Start a shift with a chosen itinerary | Device token |
| POST | `/api/v1/driver/shifts/end` | End the current shift | Device token |

### Pings
| Method | Endpoint | Description | Auth |
|---|---|---|---|
| POST | `/api/v1/driver/pings` | Upload a batch of 1–50 positions (+ heartbeat) | Device token |

### Bus state
| Method | Endpoint | Description | Auth |
|---|---|---|---|
| PATCH | `/api/v1/driver/state` | Set `serviceStatus` (`out_of_service` with reason, or back to `in_service`); `motion`/`connectivity` keep updating | Device token |

### Public status
| Method | Endpoint | Description | Auth |
|---|---|---|---|
| GET | `/api/v1/status` | Current status of all buses (same data as the student page) | None |
| GET | `/api/v1/health` | Returns `200 ok` if the backend is reachable | None |

### Convex queries (student web app, real-time)
| Function | Args | Returns |
|---|---|---|
| `status:list` | none | All buses' `BusStatusView`, sorted by bus code |
| `status:busLog` | `{ busCode, date }` | Today's timetable entries with actual arrival/departure |
| `stops:list` | none | Active stops for the map |

### Internal operations (CLI only, `npx convex run`)
| Function | Purpose |
|---|---|
| `seed:loadAll` | Upsert stops, buses, itineraries, schedule entries, config from `convex/seed/*` |
| `devices:provision` | Create a device token for a bus (prints it once) |
| `devices:revoke` | Revoke a device token |
| `reports:exportStopEvents` | CSV of stop events for a date range |
| `reports:health` | Per-bus last ping age, battery, shift status |

## Error Responses

All errors share one shape:

```json
{
  "error": {
    "code": "SHIFT_NOT_ACTIVE",
    "message": "No active shift for this device. Start a shift before sending pings.",
    "details": { "busCode": "BUS-1" }
  }
}
```

| HTTP | Code | When |
|---|---|---|
| 400 | `VALIDATION_ERROR` | Body missing fields or values out of range |
| 401 | `UNAUTHORIZED` | Missing or malformed `Authorization` header |
| 403 | `DEVICE_REVOKED` | Token valid format but revoked |
| 403 | `OUTSIDE_SERVICE_HOURS` | Shift start or ping outside service hours |
| 404 | `ITINERARY_NOT_FOUND` | Itinerary not assigned to this bus or expired |
| 409 | `SHIFT_ALREADY_ACTIVE` | Starting a shift while one is open (returns the open shift) |
| 409 | `SHIFT_NOT_ACTIVE` | Pings or end-shift without an active shift |
| 413 | `BATCH_TOO_LARGE` | More than 50 pings in one request |
| 429 | `RATE_LIMITED` | Too many requests (see below) |
| 500 | `INTERNAL_ERROR` | Unexpected server error |

## Pagination Shape

v1 endpoints return small, bounded lists (4 buses, < 30 log entries), so they are not paginated. Future list endpoints (e.g. stop-event history) will use cursor pagination, matching Convex's `paginate`:

```json
{
  "data": [],
  "pagination": {
    "cursor": "eyJpZCI6Ii4uLiJ9",
    "isDone": false,
    "pageSize": 50
  }
}
```

## Rate Limiting

| Category | Limit | Key |
|---|---|---|
| `POST /driver/pings` | 30 requests/min, 50 pings/request | Device |
| Other driver endpoints | 20 requests/min | Device |
| `POST /driver/pair` with bad token | 5 failures/15 min, then 429 | IP |
| `GET /status` | 60 requests/min | IP |

Implemented with the Convex rate-limiter component. Exceeded limits return `429` with a `Retry-After` header in seconds.
<!-- assumed: limits generous enough for offline backlog upload (a 24 h backlog ≈ 170 batches drains in ~6 min) -->
