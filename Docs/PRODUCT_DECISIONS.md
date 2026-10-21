# Product Decisions — DAUST Bus Tracker

| | |
|---|---|
| **Scope** | Idea / solution / concept decisions owned by the product owner (Mohamed), distinct from the architectural/technical decisions in `CONTEXT.md` + `docs/adr/`. |
| **Last Updated** | 2026-10-21 |

These are the deliberate bets behind the product. Engineering follows from them; they
are not re-litigated in code review. Revisit at the end of the pilot.

## A. The core bet

### A1 — Personal phones as the sensor (ACCEPTED, eyes open)
The system streams GPS from the drivers' Android phones, not dedicated trackers. The
previous DAUST tracker died on *upkeep* (a lost dedicated GPS device + SIM top-ups),
and this approach still depends on human diligence (daily shift start), school data
top-ups, chargers, and battery-exemptions surviving OS updates.
**Decision:** keep personal phones — it avoids buying/maintaining hardware and is
cheap to trial. The architecture keeps an escape hatch: dedicated trackers can POST to
the same `/api/v1/driver/pings` endpoint later without backend changes, if phones
prove unreliable in the pilot.
**Standing risk:** this is a people-and-upkeep bet wearing a software costume — the
same axis that killed v1. Watched via the coverage metric and Sprint 3's one-bus test.

### A2 — Informative (timetable), not predictive (ETA) (ACCEPTED)
The product's value is "the bus vs its published timetable" — where it is, which stop
is next, whether it's on time — **not** a predicted ETA. With a real timetable now in
hand, that is just as actionable for a student ("the 08:20 is 6 min late, so I can
wait / walk") without the complexity and inaccuracy of traffic/speed prediction.
ETA stays out of scope (not deferred-as-planned, deliberately *not the point*).

### A3 — No notifications; pull-only (ACCEPTED)
No push/WhatsApp/SMS. Students who need the information check the page themselves. The
informative framing (A2) makes a pull model sufficient: the page answers "should I
leave now / how do I prepare" on demand. Push remains a possible v2 feature, not a v1
dependency.

## B. Scope & people

### B1 — Adoption carrot = killing the "where is the bus?" call storm (ACCEPTED)
When a bus breaks its schedule, students flood drivers/staff with "where is the bus?"
calls. The page exists to absorb those calls. That reduction is the concrete benefit
that justifies drivers starting their shift and students checking the page — the
feedback loop that drives adoption.

### B2 — Launch with ONE bus this week, then expand (ACCEPTED)
Pilot a single bus first (matches Sprint 3). Only after it proves reliable do we roll
out to the remaining buses, folding in whatever fixes/additions the first bus surfaces.

### B3 — No operator panel in v1; coordinator is v2 (ACCEPTED)
Student Affairs sees the same read-only page as students during the pilot. The
transport-coordinator control panel (set states, create temporary routes) is v2.

## C. Trust & social contract

### C1 — Driver consent (AGREED)
Drivers have agreed to the arrangement ("track the bus, not the driver"; tracking only
during shifts; raw track kept 30 days). Written consent is collected before the pilot.

### C2 — Public live map (SCHOOL-APPROVED)
The school has approved a public, read-only status page/map. No safety/privacy
objection to raise.

## D. Sustainability & ownership

### D1 — Owner = IT Committee / School partnership (ACCEPTED)
Ongoing cost and operation (hosting tiers, data top-ups, phone replacement) are owned
jointly by the DAUST IT Committee and the School — not left to an individual. This is
the institutional answer to what killed v1.

### D2 — Continuity via student volunteers (ACCEPTED, standing risk)
Day-to-day maintenance continues to rest on the rotating student IT committee, backed
by the runbook and handover docs (Sprint 8). Accepted risk; the D1 school partnership
is the backstop.

## E. Product framing

### E1 — Bilingual: French driver app, English student page (ACCEPTED)
The **driver app is in French** (drivers are francophone); the **student page is in
English** (student-facing norm). This is a v1 requirement, not a deferred pass.
→ Reconciles/overrides `CONTEXT.md` D9 ("English for v1"). Implication: the Kotlin
driver app ships French strings from v1; the Next.js page ships English, with copy
still routed through `lib/statusText.ts` so a later French student mode stays cheap.
→ Consequence: the out-of-service **reason list** must be **codes with both FR and EN
labels** (driver picks the French label; the English page renders the EN label), not
free strings — otherwise a French reason leaks onto the English student page. Free-text
notes are shown verbatim (accepted). Update `config.outOfServiceReasons` and the
`/state` contract to carry `{ code, fr, en }`.

### E2 — Map is an optional student view in v1 (ACCEPTED)
Keep the map in v1, but as an opt-in tab students open when the status line isn't
enough — not the default surface. (Loaded only on `/map`, as already designed.)

### E3 — Distribution: few testers now, broad channels later (ACCEPTED)
During testing, only a handful of people use it. After validation, awareness spreads
through the usual communication channels + QR codes at stops + WhatsApp links + the
MyDAUST hub.

### E4 — Success-metric targets (ACCEPTED as drafted)
The PRD §7 targets (≥90% coverage, ≥95% detection accuracy, ≥150 daily visitors, etc.)
stand as the pilot's go/no-go thresholds.
