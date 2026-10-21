// Editable reference data. Keyed by `code`.
// PLACEHOLDER types — confirm which bus is the small one with the transport team.
export const buses = [
  { code: "BUS-1", name: "Bus 1", type: "large", isActive: true },
  { code: "BUS-2", name: "Bus 2", type: "large", isActive: true },
  { code: "BUS-3", name: "Bus 3", type: "large", isActive: true },
  { code: "BUS-4", name: "Bus 4", type: "small", isActive: true },
] as const;
