// Editable reference data. Single document. Defaults from Docs/DATABASE_SCHEMA.md.
export const config = {
  timezone: "Africa/Dakar" as const,
  serviceHours: [{ days: [1, 2, 3, 4, 5], start: "06:30", end: "22:00" }], // weekend hours still to confirm (PRD §8)
  lateGraceMinutes: 2,
  signalLostAfterSeconds: 300,
  staleAfterSeconds: 120,
  maxAccuracyMeters: 50,
  pingRetentionDays: 30,
  matchWindowMinutes: 45,
  stopSpeedThreshold: 2,
  restConfirmPings: 2,
  outOfServiceReasons: [
    { code: "MECHANICAL", fr: "Panne mécanique", en: "Mechanical issue" },
    { code: "FUEL", fr: "Carburant", en: "Fuel" },
    { code: "LOGISTICS", fr: "Logistique", en: "Logistics" },
    { code: "BREAK", fr: "Pause chauffeur", en: "Driver break" },
    { code: "OTHER", fr: "Autre", en: "Other" },
  ],
};
