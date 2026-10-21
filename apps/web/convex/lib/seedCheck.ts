import { haversineMeters } from "./geo";

type SeedStop = { code: string; lat: number; lng: number; radiusMeters: number };
type SeedItinerary = { code: string; busCodes: string[]; visits: [string, string, string][] };

const HHMM = /^([01]\d|2[0-3]):[0-5]\d$/;

/**
 * Validates seed data before anything is written. `errors` block the load (broken references,
 * bad times); `warnings` are data hygiene (overlapping stop radii — fix geometry in data).
 */
export function checkSeed(stops: SeedStop[], busCodes: string[], itineraries: SeedItinerary[]) {
  const errors: string[] = [];
  const warnings: string[] = [];
  const stopCodes = new Set(stops.map((s) => s.code));

  stops.forEach((a, i) =>
    stops.slice(i + 1).forEach((b) => {
      const d = haversineMeters(a, b);
      if (d < a.radiusMeters + b.radiusMeters)
        warnings.push(`${a.code} and ${b.code} are ${Math.round(d)} m apart; their radii overlap`);
    }),
  );

  for (const it of itineraries) {
    for (const bus of it.busCodes) if (!busCodes.includes(bus)) errors.push(`${it.code}: unknown bus ${bus}`);
    it.visits.forEach(([stop, arriveBy, departAt], i) => {
      const where = `${it.code} visit ${i + 1}`;
      if (!stopCodes.has(stop)) errors.push(`${where}: unknown stop ${stop}`);
      if (!HHMM.test(arriveBy) || !HHMM.test(departAt)) errors.push(`${where}: times must be HH:mm`);
      else if (departAt < arriveBy) errors.push(`${where}: departAt ${departAt} is before arriveBy ${arriveBy}`);
      const prev = it.visits[i - 1];
      if (prev && arriveBy < prev[2]) errors.push(`${where}: arrives at ${arriveBy}, before the previous departure ${prev[2]}`);
    });
  }
  return { errors, warnings };
}
