// Editable reference data. Keyed by `code`; buses and stops are referenced by their codes.
// PLACEHOLDER timetables: one short loop per bus, enough to test matching. The real
// timetable comes from Student Affairs; its file format is still open (CSV vs this file).
type Visit = [stopCode: string, arriveBy: string, departAt: string];

export const itineraries: {
  code: string;
  name: string;
  busCodes: string[];
  isTemporary: boolean;
  daysOfWeek: number[];
  validFrom?: string;
  validUntil?: string;
  visits: Visit[]; // in sequence order
}[] = [
  {
    code: "BUS1-WEEKDAY",
    name: "Bus 1 — weekday loop",
    busCodes: ["BUS-1"],
    isTemporary: false,
    daysOfWeek: [1, 2, 3, 4, 5],
    visits: [
      ["WARDINI", "08:00", "08:05"],
      ["SCHOOL", "08:15", "08:20"],
      ["CAFETERIA", "08:25", "08:27"],
      ["WARDINI", "08:35", "08:40"],
    ],
  },
  {
    code: "BUS2-WEEKDAY",
    name: "Bus 2 — weekday loop",
    busCodes: ["BUS-2"],
    isTemporary: false,
    daysOfWeek: [1, 2, 3, 4, 5],
    visits: [
      ["YVES", "08:00", "08:05"],
      ["SCHOOL", "08:12", "08:17"],
      ["YVES", "08:25", "08:30"],
    ],
  },
  {
    code: "BUS3-WEEKDAY",
    name: "Bus 3 — weekday loop",
    busCodes: ["BUS-3"],
    isTemporary: false,
    daysOfWeek: [1, 2, 3, 4, 5],
    visits: [
      ["WARDINI", "08:20", "08:25"],
      ["SCHOOL", "08:35", "08:40"],
      ["WARDINI", "08:55", "09:00"],
    ],
  },
  {
    code: "BUS4-WEEKDAY",
    name: "Bus 4 — weekday loop",
    busCodes: ["BUS-4"],
    isTemporary: false,
    daysOfWeek: [1, 2, 3, 4, 5],
    visits: [
      ["SCHOOL", "12:00", "12:05"],
      ["CAFETERIA", "12:10", "12:30"],
      ["SCHOOL", "12:35", "12:40"],
    ],
  },
];
