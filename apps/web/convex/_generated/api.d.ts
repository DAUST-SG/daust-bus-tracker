/* eslint-disable */
/**
 * Generated `api` utility.
 *
 * THIS CODE IS AUTOMATICALLY GENERATED.
 *
 * To regenerate, run `npx convex dev`.
 * @module
 */

import type * as lib_geo from "../lib/geo.js";
import type * as lib_geofence from "../lib/geofence.js";
import type * as lib_seedCheck from "../lib/seedCheck.js";
import type * as lib_time from "../lib/time.js";
import type * as seed from "../seed.js";
import type * as seed_buses from "../seed/buses.js";
import type * as seed_config from "../seed/config.js";
import type * as seed_itineraries from "../seed/itineraries.js";
import type * as seed_stops from "../seed/stops.js";

import type {
  ApiFromModules,
  FilterApi,
  FunctionReference,
} from "convex/server";

declare const fullApi: ApiFromModules<{
  "lib/geo": typeof lib_geo;
  "lib/geofence": typeof lib_geofence;
  "lib/seedCheck": typeof lib_seedCheck;
  "lib/time": typeof lib_time;
  seed: typeof seed;
  "seed/buses": typeof seed_buses;
  "seed/config": typeof seed_config;
  "seed/itineraries": typeof seed_itineraries;
  "seed/stops": typeof seed_stops;
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
