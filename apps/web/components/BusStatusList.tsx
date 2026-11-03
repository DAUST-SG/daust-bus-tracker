"use client";
import { useRef } from "react";
import { useQuery } from "convex/react";
import { api } from "../convex/_generated/api";
import type { BusStatusView } from "../shared/types";
import { useNow } from "../hooks/useNow";
import { punctualityBadge, stateBadge, statusSentence, updatedText, type Tone } from "../lib/statusText";

export function BusStatusList({ initial }: { initial?: BusStatusView[] }) {
  const now = useNow(1000);
  // Re-run the query once a minute too, so "stale" and running-late appear even when no ping arrives.
  const fresh = useQuery(api.status.list, { now: Math.floor(now / 60_000) * 60_000 }) as BusStatusView[] | undefined;
  const last = useRef(fresh ?? initial);
  if (fresh !== undefined) last.current = fresh; // keep the old list while the new minute loads (no flicker)
  const buses = fresh ?? last.current;

  if (buses === undefined) return <p className="muted">Loading buses…</p>;
  if (buses.length === 0) return <p className="muted">No buses yet.</p>;
  return (
    <ul className="buses">
      {buses.map((b) => (
        <BusStatusLine key={b.code} view={b} now={now} />
      ))}
    </ul>
  );
}

function BusStatusLine({ view, now }: { view: BusStatusView; now: number }) {
  const state = stateBadge(view);
  const punctuality = punctualityBadge(view);
  const updated = updatedText(view, now);
  const sentence = statusSentence(view, now);
  return (
    <li className="bus">
      <div className="bus-head">
        <strong>{view.name}</strong>
        <Badge {...state} />
        {punctuality && <Badge {...punctuality} />}
      </div>
      {sentence && <p className="sentence" suppressHydrationWarning>{sentence}</p>}
      {view.itinerary && (
        <p className="muted">
          {view.itinerary.name}
          {view.itinerary.isTemporary && " · temporary route"}
        </p>
      )}
      {/* relative times differ by a few seconds between server and browser clocks */}
      {updated && <p className={view.connectivity === "live" ? "muted" : "stale"} suppressHydrationWarning>{updated}</p>}
    </li>
  );
}

function Badge({ text, tone }: { text: string; tone: Tone }) {
  return <span className={`badge ${tone}`}>{text}</span>;
}
