// Pure derivation of the student-facing read model from a busStatus doc + reference data.
// Composes the three state dimensions, resolves `stale` at read time (D3), computes running-late
// before arrival, and builds the English headline label (E1). No DB access.
import type {
  Bus,
  BusStatus,
  BusStatusView,
  Config,
  ConnectivityView,
  Itinerary,
  PunctualityStatus,
  ScheduleEntry,
  Stop,
} from "../../shared/types";
import { dakarDate } from "./time";
import { runningLateMinutes } from "./schedule";

export function deriveBusStatusView(input: {
  bus: Bus;
  status: BusStatus;
  itinerary: Itinerary | null;
  stopsById: Map<string, Stop>;
  entriesById: Map<string, ScheduleEntry>;
  now: number;
  config: Config;
}): BusStatusView {
  const { bus, status, itinerary, stopsById, entriesById, now, config } = input;
  const name = (id: string | undefined) => (id ? (stopsById.get(id)?.name ?? null) : null);

  const offShift = status.serviceStatus === "off_shift";
  const motion = offShift ? null : (status.motion ?? null);
  const connectivity = resolveConnectivity(status, now, config);

  const nextEntry = status.nextEntryId ? (entriesById.get(status.nextEntryId) ?? null) : null;
  const currentStopName = motion === "holding" ? name(status.currentStopId) : null;
  const lastStopName = name(status.lastStopId);

  const currentStop = !offShift && currentStopName ? { name: currentStopName } : null;
  const lastStop =
    !offShift && lastStopName && status.lastDepartedAt != null
      ? { name: lastStopName, departedAt: status.lastDepartedAt }
      : null;
  const nextStopName = nextEntry ? name(nextEntry.stopId) : null;
  const nextStop =
    !offShift && nextEntry && nextStopName
      ? { name: nextStopName, scheduledArrival: nextEntry.arriveBy, scheduledDeparture: nextEntry.departAt }
      : null;

  const punctuality = derivePunctuality(status, nextEntry, motion, now, config);

  const position =
    !offShift && status.lat != null && status.lng != null
      ? { lat: status.lat, lng: status.lng, updatedAt: status.lastPingAt ?? status.updatedAt }
      : null;

  const reason = status.reason ?? null;
  const note = status.note ?? null;

  return {
    code: bus.code,
    name: bus.name,
    serviceStatus: status.serviceStatus,
    motion,
    connectivity,
    label: buildLabel({ status, connectivity, motion, currentStopName, lastStopName, nextStopName, punctuality, reason }),
    itinerary: itinerary ? { name: itinerary.name, isTemporary: itinerary.isTemporary } : null,
    currentStop,
    lastStop,
    nextStop,
    punctuality,
    position,
    reason,
    note,
  };
}

function resolveConnectivity(status: BusStatus, now: number, config: Config): ConnectivityView {
  if (status.connectivity === "signal_lost") return "signal_lost";
  if (status.lastPingAt != null && now - status.lastPingAt > config.staleAfterSeconds * 1000) return "stale";
  return "live";
}

function derivePunctuality(
  status: BusStatus,
  nextEntry: ScheduleEntry | null,
  motion: BusStatusView["motion"],
  now: number,
  config: Config,
): { status: PunctualityStatus; delayMinutes: number | null } {
  // Running late before arrival: while moving toward a timetabled stop that is overdue.
  if (motion === "active") {
    const running = runningLateMinutes(nextEntry, now, dakarDate(now), config);
    if (running != null) return { status: "late", delayMinutes: running };
  }
  if (status.delayMinutes == null) return { status: "unknown", delayMinutes: null };
  if (status.delayMinutes > config.lateGraceMinutes) return { status: "late", delayMinutes: status.delayMinutes };
  return { status: "on_time", delayMinutes: status.delayMinutes };
}

function buildLabel(x: {
  status: BusStatus;
  connectivity: ConnectivityView;
  motion: BusStatusView["motion"];
  currentStopName: string | null;
  lastStopName: string | null;
  nextStopName: string | null;
  punctuality: { status: PunctualityStatus; delayMinutes: number | null };
  reason: string | null;
}): string {
  if (x.status.serviceStatus === "off_shift") return "Not running";
  if (x.status.serviceStatus === "out_of_service") {
    return x.reason ? `Out of service — ${x.reason}` : "Out of service";
  }

  // in_service: motion + punctuality + connectivity compose.
  let base: string;
  if (x.motion === "holding") {
    base = `Holding at ${x.currentStopName ?? "a stop"}`;
  } else if (x.lastStopName) {
    base = `Left ${x.lastStopName}${x.nextStopName ? ` → ${x.nextStopName}` : ""}`;
  } else if (x.nextStopName) {
    base = `Heading to ${x.nextStopName}`;
  } else {
    base = "On route";
  }

  const parts = [base];
  if (x.punctuality.status === "late" && x.punctuality.delayMinutes != null) {
    parts.push(`${x.punctuality.delayMinutes} min late`);
  } else if (x.punctuality.status === "on_time") {
    parts.push("on time");
  }
  if (x.connectivity === "signal_lost") parts.push("signal lost");
  else if (x.connectivity === "stale") parts.push("delayed update");

  return parts.join(" · ");
}
