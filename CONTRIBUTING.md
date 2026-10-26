# Contributing — DAUST Bus Tracker

This project is maintained by the DAUST IT Committee. Core members own it; open-committee members can pick up issues labelled `mission`.

## Branch Strategy

```text
main                 # Production. Deployed automatically (Convex prod + Vercel). Protected.
dev                  # Integration branch. Deployed to the Convex dev deployment + Vercel preview.
feat/<short-name>    # New feature, e.g. feat/bus-log-page
fix/<short-name>     # Bug fix, e.g. fix/geofence-jitter
chore/<short-name>   # Tooling, docs, seed data, e.g. chore/tune-wardini-radius
android/<short-name> # Driver app work, e.g. android/battery-setup-screen
```

Feature branches start from `dev` and merge back into `dev`. `dev` merges into `main` at the end of each sprint after a test on a real bus.

## Commit Convention

Conventional Commits, scope = area of the code:

```text
feat(geofence): confirm arrival by speed-at-rest, dwell as fallback
fix(ingest): ignore duplicate pings by clientId
feat(web): show "running late" before the bus arrives
feat(android): queue pings in Room when offline
chore(seed): update Yves dorm coordinates and radius to 90 m
docs(api): document 413 BATCH_TOO_LARGE
test(schedule): cover loops that visit Wardini twice a day
refactor(status): move status sentence builder to lib/statusText
```

## Development Workflow

1. Pick or create an issue; assign yourself and move it to "In Progress".
2. **Before working on your area, read the matching skill in [`skills/`](skills/README.md)** (e.g. `convex-functions` for backend, `vercel-*` for the web app). Project docs win over any skill default.
3. `git checkout dev && git pull`, then create `feat/<short-name>`.
4. Run `npx convex dev` (your own dev deployment) and `npm run dev`; use `scripts/fake-bus.ts` to simulate a bus instead of riding one.
5. Write or update tests for any logic in `convex/lib/*` before changing it.
6. Run `npm run typecheck && npm test` (web/convex) or `./gradlew test assembleDebug` (Android) locally.
7. Open a pull request into `dev` with: what changed, why, how you tested it, and screenshots for UI changes.
8. One core-member review is required; CI must be green.
9. Squash-merge; delete the branch.
10. Seed data changes (stops, timetables) also need a note in the PR saying where the new values came from (measured on site, from Student Affairs, from pilot data).

## Code Standards

- **TypeScript strict mode**; no `any` (use `unknown` and narrow).
- **ESLint + Prettier** on web/convex; **ktlint** on Android. CI fails on lint errors.
- **Business logic lives in `convex/lib/*` as pure functions** with unit tests; HTTP actions and mutations only orchestrate.
- **Validate every input** with Convex validators at the boundary; never trust device data.
- **No public mutations.** All writes go through authenticated HTTP actions or internal functions.
- **No secrets in code or Git**: tokens, deploy keys, pepper, keystore stay in env vars / secure storage.
- **Reference data changes go through Git** (`convex/seed/*`); if you edit in the dashboard to test, mirror it back in a PR.
- **Times**: store instants as Unix ms; schedule times as `"HH:mm"` Africa/Dakar; never use the device clock as the source of truth for server decisions.
- **Android**: no work on the main thread; the location callback only filters and writes to Room; uploads happen in the uploader.
- **Keep the driver app quiet**: no feature may require driver interaction while the bus is moving.
- **Plain language in the UI**: short sentences students understand at a glance.

## Questions

- Day-to-day: the IT Committee group chat, `#bus-tracker` thread.
- Design or scope decisions: open a GitHub Discussion or bring it to the weekly committee meetup.
- Data questions (itineraries, timetables): through the committee head to Student Affairs.
- Security issues: message the committee head directly; do not post them publicly.
