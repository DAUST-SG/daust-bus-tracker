// Editable reference data. Keyed by `code`: renaming a code creates a new stop.
// PLACEHOLDER coordinates — replace with values measured on site (Sprint 1 task 7).
export const stops = [
  { code: "WARDINI", name: "Wardini", type: "dorm", lat: 14.7, lng: -17.4 },
  { code: "YVES", name: "Yves dorm", type: "dorm", lat: 14.704, lng: -17.4 },
  { code: "SCHOOL", name: "School", type: "school", lat: 14.708, lng: -17.4 },
  { code: "CAFETERIA", name: "Cafeteria", type: "cafeteria", lat: 14.708, lng: -17.396 },
] as const;

// Applied to every stop unless it sets its own value.
export const stopDefaults = { radiusMeters: 75, exitBufferMeters: 40, dwellSeconds: 20, isActive: true };
