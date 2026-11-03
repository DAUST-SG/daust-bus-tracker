// All student-facing copy lives here (PRODUCT_DECISIONS E1: English now, French mode later).
// Built from the structured view, not `view.label`, so relative times tick in the browser.
import type { BusStatusView } from "../shared/types";

export function timeAgo(at: number, now: number): string {
  const s = Math.max(0, Math.round((now - at) / 1000));
  if (s < 60) return `${s} s ago`;
  const m = Math.floor(s / 60);
  if (m < 60) return `${m} min ago`;
  return `${Math.floor(m / 60)} h ${m % 60} min ago`;
}

/** "Left Wardini 2 min ago → Yves dorm · due 14:10". State, punctuality and freshness are badges,
 *  so off shift has no sentence and out of service only gives the reason. */
export function statusSentence(view: BusStatusView, now: number): string | null {
  if (view.serviceStatus === "off_shift") return null;
  if (view.serviceStatus === "out_of_service") return [view.reason, view.note].filter(Boolean).join(" — ") || null;
  const next = view.nextStop;
  let base: string;
  if (view.motion === "holding" && view.currentStop) base = `At ${view.currentStop.name}`;
  else if (view.lastStop) base = `Left ${view.lastStop.name} ${timeAgo(view.lastStop.departedAt, now)}${next ? ` → ${next.name}` : ""}`;
  else if (next) base = `Heading to ${next.name}`;
  else base = "On route";
  return next?.scheduledArrival ? `${base} · due ${next.scheduledArrival}` : base;
}

export type Tone = "ok" | "warn" | "bad" | "off";

/** One state badge; out_of_service dominates, then signal loss, then motion. */
export function stateBadge(view: BusStatusView): { text: string; tone: Tone } {
  if (view.serviceStatus === "out_of_service") return { text: "Out of service", tone: "bad" };
  if (view.serviceStatus === "off_shift") return { text: "Not running", tone: "off" };
  if (view.connectivity === "signal_lost") return { text: "Signal lost", tone: "warn" };
  return view.motion === "holding" ? { text: "At stop", tone: "ok" } : { text: "Moving", tone: "ok" };
}

export function punctualityBadge(view: BusStatusView): { text: string; tone: Tone } | null {
  if (view.serviceStatus !== "in_service") return null;
  const p = view.punctuality;
  if (p.status === "late" && p.delayMinutes != null) return { text: `${p.delayMinutes} min late`, tone: "bad" };
  if (p.status === "on_time") return { text: "On time", tone: "ok" };
  return null;
}

export function updatedText(view: BusStatusView, now: number): string | null {
  return view.position ? `Updated ${timeAgo(view.position.updatedAt, now)}` : null;
}
