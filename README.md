# DAUST Bus Tracker

> Know where every campus bus is, where it is heading, and whether it is on time.

## Overview

DAUST Bus Tracker is a live tracking system for DAUST's 4 campus buses. Each bus sends its GPS position from an Android phone carried by the driver. A backend works out what each bus is doing: which stop it is at, which stop it is heading to, and whether it is on schedule. Students see the result on a web page, one status line per bus.

Students today know neither where a bus is nor where it is going next, so they wait at the wrong stop, leave too early or too late, and miss buses. The system solves this by combining live location with each bus's official itinerary and timetable. When a bus is late, students see it immediately and can decide what to do.

This version is a **prototype**. Student Affairs asked for real data before validating the project, so v1 focuses on reliable tracking, automatic arrival detection and a punctuality log. The transport coordinator panel comes in v2, after validation. The project is built and maintained by the DAUST IT Committee.

## Features

- **Driver app (native Android, Kotlin)** — one tap to start a shift; sends GPS every 10–15 s through a foreground service, even with the screen off; buffers positions offline and uploads them when signal returns
- **Automatic arrival and departure detection** — geofences around each stop, confirmed by the bus coming to rest (speed-aware, dwell as fallback), with hysteresis; arrivals matched sequence-forward to the timetable; no driver input while driving
- **Next destination** — taken from the bus's itinerary, never typed by the driver
- **Timetable windows** — each stop has an arrival time and a departure time (e.g. Wardini 14:00–14:05); the system flags late arrivals and early departures
- **Bus status** — three independent dimensions (service: off-shift / in-service / out-of-service · motion: active / holding · connectivity: live / stale / signal-lost) composed into one plain-language line
- **Itinerary selection** — at shift start, the driver picks the bus's normal itinerary or a temporary one (e.g. the road-renovation shuttle)
- **Student status page (Next.js)** — one live line per bus, "updated X ago", and a map one tap away; no login, no install
- **Punctuality log** — every arrival and departure is recorded against the timetable, giving Student Affairs real data and students a record when a late bus made them late
- **Editable reference data** — stops, itineraries and timetables are plain data (seed files + Convex dashboard), changeable during development without code changes

## Tech Stack

| Layer | Technology |
|---|---|
| Driver app | Kotlin, Jetpack Compose, Google Play Services Fused Location Provider, Android foreground service, Room (offline queue), OkHttp |
| Student web app | Next.js (App Router), TypeScript, Convex React client, Leaflet + OpenStreetMap tiles |
| Backend & database | Convex (queries, mutations, HTTP actions, scheduled functions, cron jobs) |
| Auth | Per-device bearer tokens for driver phones (hashed in Convex); student page is public read-only |
| Hosting | Convex Cloud (backend), Vercel (web) |
| Map tiles | OpenStreetMap (no API key) |

<!-- assumed: Leaflet + OpenStreetMap chosen over Google Maps to avoid API keys and billing for a prototype -->

## Getting Started

### Prerequisites

- Node.js 20+ and npm
- A Convex account (free tier)
- A Vercel account (for deploying the web app)
- Android Studio (latest stable) with JDK 17 and Android SDK 34+
- An Android phone (Android 8.0 / API 26 or newer) with developer mode enabled for testing

### Installation

```bash
# 1. Clone
git clone https://github.com/mouha18/daust-bus-tracker.git
cd daust-bus-tracker

# 2. Install web + backend dependencies
cd apps/web
npm install

# 3. Environment
cp .env.example .env.local

# 4. Start Convex (creates a dev deployment and writes NEXT_PUBLIC_CONVEX_URL)
npx convex dev

# 5. Load reference data (stops, buses, itineraries, timetable)
npx convex run seed:loadAll

# 6. Create a device token for a test phone (printed once — copy it)
npx convex run devices:provision '{"busCode": "BUS-1", "label": "Test phone"}'

# 7. Start the student web app
npm run dev

# 8. Driver app: open apps/driver-android in Android Studio,
#    set CONVEX_SITE_URL in local.properties, then Run on a device
```

<!-- assumed: repository hosted under the user's GitHub account; move to an IT Committee organisation before handover -->

## Project Structure

```text
daust-bus-tracker/
├── apps/
│   ├── web/                      # Next.js student status page + Convex backend
│   │   ├── app/                  # App Router pages (status, map, bus log)
│   │   ├── components/           # UI components (BusStatusLine, BusMap, ...)
│   │   ├── hooks/                # React hooks wrapping Convex queries
│   │   ├── lib/                  # Formatting helpers (time ago, lateness text)
│   │   └── convex/               # Backend: schema, queries, mutations, HTTP actions, crons
│   │       ├── lib/              # Pure logic: geofence, schedule matching, status derivation
│   │       └── seed/             # Editable reference data (stops, buses, itineraries, timetable)
│   └── driver-android/           # Native Kotlin driver app
│       └── app/src/main/java/sn/daust/bustracker/
│           ├── ui/               # Compose screens (pairing, shift, state)
│           ├── tracking/         # Foreground service + location client
│           ├── data/             # Room queue, API client, token storage
│           └── domain/           # Models and use cases
└── docs/                         # This documentation bundle
```

## Environment Variables

| Variable | Description | Required |
|---|---|---|
| `CONVEX_DEPLOYMENT` | Convex deployment name, written by `npx convex dev` | Yes |
| `NEXT_PUBLIC_CONVEX_URL` | Convex client URL used by the web app | Yes |
| `NEXT_PUBLIC_CAMPUS_CENTER` | Default map centre as `lat,lng` | No |
| `DEVICE_TOKEN_PEPPER` | Secret mixed into device-token hashes (set in Convex dashboard env vars) | Yes |
| `CONVEX_SITE_URL` | Driver app: base URL of Convex HTTP actions (`https://<deployment>.convex.site`), in `local.properties` | Yes |

## License

Internal project of the DAUST IT Committee. All rights reserved by Dakar American University of Science and Technology unless the committee decides to open-source it.
<!-- assumed: license to be decided with the university -->
