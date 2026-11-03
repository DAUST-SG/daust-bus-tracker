import { describe, expect, it } from "vitest";
import type { BusStatusView } from "../shared/types";
import { punctualityBadge, stateBadge, statusSentence, timeAgo } from "./statusText";

const now = 1_800_000_000_000;
const base: BusStatusView = {
  code: "BUS-1", name: "Bus 1", serviceStatus: "in_service", motion: "active", connectivity: "live", label: "",
  itinerary: null, currentStop: null, lastStop: null, nextStop: null,
  punctuality: { status: "unknown", delayMinutes: null }, position: null, reason: null, note: null,
};

describe("statusText", () => {
  it("timeAgo", () => {
    expect(timeAgo(now - 12_000, now)).toBe("12 s ago");
    expect(timeAgo(now - 125_000, now)).toBe("2 min ago");
    expect(timeAgo(now - 3_900_000, now)).toBe("1 h 5 min ago");
  });

  it("left a stop, heading to the next", () => {
    const v = { ...base, lastStop: { name: "Wardini", departedAt: now - 120_000 }, nextStop: { name: "Yves dorm", scheduledArrival: "14:10" } };
    expect(statusSentence(v, now)).toBe("Left Wardini 2 min ago → Yves dorm · due 14:10");
  });

  it("holding at a stop", () => {
    expect(statusSentence({ ...base, motion: "holding", currentStop: { name: "Wardini" } }, now)).toBe("At Wardini");
  });

  it("out of service dominates, with reason and note", () => {
    const v = { ...base, serviceStatus: "out_of_service" as const, connectivity: "signal_lost" as const, reason: "Breakdown", note: "Tyre" };
    expect(statusSentence(v, now)).toBe("Breakdown — Tyre");
    expect(stateBadge(v).text).toBe("Out of service");
    expect(punctualityBadge(v)).toBeNull();
  });

  it("off shift and signal lost", () => {
    expect(statusSentence({ ...base, serviceStatus: "off_shift" }, now)).toBeNull();
    expect(stateBadge({ ...base, connectivity: "signal_lost" }).text).toBe("Signal lost");
  });

  it("punctuality", () => {
    expect(punctualityBadge({ ...base, punctuality: { status: "late", delayMinutes: 7 } })?.text).toBe("7 min late");
    expect(punctualityBadge({ ...base, punctuality: { status: "on_time", delayMinutes: 0 } })?.text).toBe("On time");
  });
});
