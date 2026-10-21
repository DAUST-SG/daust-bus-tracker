// Tables and indexes — see Docs/DATABASE_SCHEMA.md (CONTEXT.md wins on conflicts).
import { defineSchema, defineTable } from "convex/server";
import { v } from "convex/values";

const hhmm = v.string(); // "14:05", Africa/Dakar
const isoDate = v.string(); // "2026-11-16"

export default defineSchema({
  // ---------- Reference data (seeded from convex/seed/*) ----------
  stops: defineTable({
    code: v.string(),
    name: v.string(),
    type: v.union(v.literal("dorm"), v.literal("school"), v.literal("cafeteria"), v.literal("other")),
    lat: v.number(),
    lng: v.number(),
    radiusMeters: v.number(),
    exitBufferMeters: v.number(),
    dwellSeconds: v.number(),
    isActive: v.boolean(),
    updatedAt: v.number(),
  })
    .index("by_code", ["code"])
    .index("by_active", ["isActive"]),

  buses: defineTable({
    code: v.string(),
    name: v.string(),
    type: v.union(v.literal("large"), v.literal("small")),
    isActive: v.boolean(),
  }).index("by_code", ["code"]),

  itineraries: defineTable({
    code: v.string(),
    name: v.string(),
    busIds: v.array(v.id("buses")),
    isTemporary: v.boolean(),
    validFrom: v.optional(isoDate),
    validUntil: v.optional(isoDate),
    daysOfWeek: v.array(v.number()), // 1 = Monday … 7 = Sunday
    isActive: v.boolean(),
  }).index("by_code", ["code"]),

  scheduleEntries: defineTable({
    itineraryId: v.id("itineraries"),
    sequence: v.number(),
    stopId: v.id("stops"),
    arriveBy: v.optional(hhmm), // omitted on timetable-less temporary itineraries (D4)
    departAt: v.optional(hhmm),
  })
    .index("by_itinerary_sequence", ["itineraryId", "sequence"])
    .index("by_itinerary_stop", ["itineraryId", "stopId"]),

  config: defineTable({
    timezone: v.literal("Africa/Dakar"),
    serviceHours: v.array(v.object({ days: v.array(v.number()), start: hhmm, end: hhmm })),
    lateGraceMinutes: v.number(),
    signalLostAfterSeconds: v.number(),
    staleAfterSeconds: v.number(),
    maxAccuracyMeters: v.number(),
    pingRetentionDays: v.number(),
    matchWindowMinutes: v.number(),
    stopSpeedThreshold: v.number(),
    restConfirmPings: v.number(),
    outOfServiceReasons: v.array(v.object({ code: v.string(), fr: v.string(), en: v.string() })),
  }),

  // ---------- Operational data (written by the system) ----------
  devices: defineTable({
    busId: v.id("buses"),
    label: v.string(),
    tokenHash: v.string(),
    deviceModel: v.optional(v.string()),
    androidVersion: v.optional(v.string()),
    appVersion: v.optional(v.string()),
    lastSeenAt: v.optional(v.number()),
    lastBatteryPercent: v.optional(v.number()),
    revokedAt: v.optional(v.number()),
    createdAt: v.number(),
  })
    .index("by_tokenHash", ["tokenHash"])
    .index("by_bus", ["busId"]),

  shifts: defineTable({
    busId: v.id("buses"),
    deviceId: v.id("devices"),
    itineraryId: v.id("itineraries"),
    date: isoDate,
    startedAt: v.number(),
    endedAt: v.optional(v.number()),
    endReason: v.optional(v.union(v.literal("driver"), v.literal("service_hours_over"), v.literal("auto_timeout"))),
    pingCount: v.number(),
    lastProcessedRecordedAt: v.optional(v.number()), // ADR 0002
    needsReconcile: v.optional(v.boolean()),
  })
    .index("by_bus_active", ["busId", "endedAt"])
    .index("by_date", ["date"]),

  pings: defineTable({
    busId: v.id("buses"),
    shiftId: v.id("shifts"),
    clientId: v.string(),
    recordedAt: v.number(),
    receivedAt: v.number(),
    lat: v.number(),
    lng: v.number(),
    accuracy: v.number(),
    speed: v.optional(v.number()),
    heading: v.optional(v.number()),
  })
    .index("by_shift_recordedAt", ["shiftId", "recordedAt"])
    .index("by_shift_clientId", ["shiftId", "clientId"])
    .index("by_receivedAt", ["receivedAt"]),

  busStatus: defineTable({
    busId: v.id("buses"),
    shiftId: v.optional(v.id("shifts")),
    itineraryId: v.optional(v.id("itineraries")),
    serviceStatus: v.union(v.literal("off_shift"), v.literal("in_service"), v.literal("out_of_service")),
    motion: v.optional(v.union(v.literal("active"), v.literal("holding"))),
    connectivity: v.union(v.literal("live"), v.literal("signal_lost")), // "stale" is computed at read time (D3)
    reason: v.optional(v.string()),
    note: v.optional(v.string()),
    lat: v.optional(v.number()),
    lng: v.optional(v.number()),
    accuracy: v.optional(v.number()),
    lastPingAt: v.optional(v.number()),
    geofence: v.object({
      phase: v.union(v.literal("outside"), v.literal("entering"), v.literal("inside")),
      stopId: v.optional(v.id("stops")),
      enteredAt: v.optional(v.number()),
      restPings: v.optional(v.number()),
    }),
    currentStopId: v.optional(v.id("stops")),
    lastStopId: v.optional(v.id("stops")),
    lastDepartedAt: v.optional(v.number()),
    nextEntryId: v.optional(v.id("scheduleEntries")),
    delayMinutes: v.optional(v.number()),
    updatedAt: v.number(),
  }).index("by_bus", ["busId"]),

  stopEvents: defineTable({
    busId: v.id("buses"),
    shiftId: v.id("shifts"),
    stopId: v.id("stops"),
    scheduleEntryId: v.optional(v.id("scheduleEntries")),
    date: isoDate,
    arrivedAt: v.union(v.number(), v.null()), // null = undetected
    departedAt: v.optional(v.union(v.number(), v.null())), // null = departure_unknown
    arrivalDelayMinutes: v.optional(v.number()),
    departureDeltaMinutes: v.optional(v.number()),
    flags: v.array(
      v.union(
        v.literal("late"),
        v.literal("early_departure"),
        v.literal("unscheduled"),
        v.literal("undetected"),
        v.literal("departure_unknown"),
      ),
    ),
  })
    .index("by_bus_date", ["busId", "date"])
    .index("by_date", ["date"])
    .index("by_shift_arrivedAt", ["shiftId", "arrivedAt"])
    .index("by_shift_entry", ["shiftId", "scheduleEntryId"]), // idempotency key (ADR 0002)

  stateChanges: defineTable({
    busId: v.id("buses"),
    dimension: v.union(v.literal("serviceStatus"), v.literal("motion"), v.literal("connectivity")),
    from: v.string(),
    to: v.string(),
    reason: v.optional(v.string()),
    source: v.union(v.literal("system"), v.literal("driver"), v.literal("cron")),
    at: v.number(),
  }).index("by_bus_at", ["busId", "at"]),
});
