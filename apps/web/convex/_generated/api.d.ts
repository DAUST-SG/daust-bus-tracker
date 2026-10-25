/* eslint-disable */
/**
 * Generated `api` utility.
 *
 * THIS CODE IS AUTOMATICALLY GENERATED.
 *
 * To regenerate, run `npx convex dev`.
 * @module
 */

import type * as auth from "../auth.js";
import type * as busState from "../busState.js";
import type * as devices from "../devices.js";
import type * as ingest from "../ingest.js";
import type * as lib_geo from "../lib/geo.js";
import type * as lib_geofence from "../lib/geofence.js";
import type * as lib_replay from "../lib/replay.js";
import type * as lib_schedule from "../lib/schedule.js";
import type * as lib_seedCheck from "../lib/seedCheck.js";
import type * as lib_status from "../lib/status.js";
import type * as lib_time from "../lib/time.js";
import type * as seed from "../seed.js";
import type * as seed_buses from "../seed/buses.js";
import type * as seed_config from "../seed/config.js";
import type * as seed_itineraries from "../seed/itineraries.js";
import type * as seed_stops from "../seed/stops.js";
import type * as shifts from "../shifts.js";

import type {
  ApiFromModules,
  FilterApi,
  FunctionReference,
} from "convex/server";

declare const fullApi: ApiFromModules<{
  auth: typeof auth;
  busState: typeof busState;
  devices: typeof devices;
  ingest: typeof ingest;
  "lib/geo": typeof lib_geo;
  "lib/geofence": typeof lib_geofence;
  "lib/replay": typeof lib_replay;
  "lib/schedule": typeof lib_schedule;
  "lib/seedCheck": typeof lib_seedCheck;
  "lib/status": typeof lib_status;
  "lib/time": typeof lib_time;
  seed: typeof seed;
  "seed/buses": typeof seed_buses;
  "seed/config": typeof seed_config;
  "seed/itineraries": typeof seed_itineraries;
  "seed/stops": typeof seed_stops;
  shifts: typeof shifts;
}>;

/**
 * A utility for referencing Convex functions in your app's public API.
 *
 * Usage:
 * ```js
 * const myFunctionReference = api.myModule.myFunction;
 * ```
 */
export declare const api: FilterApi<
  typeof fullApi,
  FunctionReference<any, "public">
>;

/**
 * A utility for referencing Convex functions in your app's internal API.
 *
 * Usage:
 * ```js
 * const myFunctionReference = internal.myModule.myFunction;
 * ```
 */
export declare const internal: FilterApi<
  typeof fullApi,
  FunctionReference<any, "internal">
>;

export declare const components: {};
