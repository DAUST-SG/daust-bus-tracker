type LatLng = { lat: number; lng: number };

const EARTH_RADIUS_M = 6_371_000;
const rad = (deg: number) => (deg * Math.PI) / 180;

export function haversineMeters(a: LatLng, b: LatLng): number {
  const dLat = rad(b.lat - a.lat);
  const dLng = rad(b.lng - a.lng);
  const h = Math.sin(dLat / 2) ** 2 + Math.cos(rad(a.lat)) * Math.cos(rad(b.lat)) * Math.sin(dLng / 2) ** 2;
  return 2 * EARTH_RADIUS_M * Math.asin(Math.sqrt(h));
}

/** Speed between two fixes, m/s. 0 when the timestamps don't move forward. */
export function impliedSpeedMps(
  prev: LatLng & { recordedAt: number },
  next: LatLng & { recordedAt: number },
): number {
  const seconds = (next.recordedAt - prev.recordedAt) / 1000;
  return seconds > 0 ? haversineMeters(prev, next) / seconds : 0;
}
