import { describe, expect, it } from "vitest";
import { checkSeed } from "../lib/seedCheck";
import { stops, stopDefaults } from "../seed/stops";
import { buses } from "../seed/buses";
import { itineraries } from "../seed/itineraries";

describe("checkSeed", () => {
  it("accepts the committed seed data", () => {
    const result = checkSeed(
      stops.map((s) => ({ ...stopDefaults, ...s })),
      buses.map((b) => b.code),
      itineraries,
    );
    expect(result).toEqual({ errors: [], warnings: [] });
  });

  it("reports broken references, bad times and overlapping radii", () => {
    const s = [
      { code: "A", lat: 14.7, lng: -17.4, radiusMeters: 75 },
      { code: "B", lat: 14.7005, lng: -17.4, radiusMeters: 75 }, // ~56 m away
    ];
    const { errors, warnings } = checkSeed(s, ["BUS-1"], [
      {
        code: "X",
        busCodes: ["BUS-9"],
        visits: [
          ["A", "08:00", "07:59"],
          ["Z", "8:00", "08:10"],
          ["B", "08:30", "08:35"],
          ["A", "08:20", "08:25"],
        ],
      },
    ]);
    expect(errors).toEqual([
      "X: unknown bus BUS-9",
      "X visit 1: departAt 07:59 is before arriveBy 08:00",
      "X visit 2: unknown stop Z",
      "X visit 2: times must be HH:mm",
      "X visit 4: arrives at 08:20, before the previous departure 08:35",
    ]);
    expect(warnings).toEqual(["A and B are 56 m apart; their radii overlap"]);
  });
});
