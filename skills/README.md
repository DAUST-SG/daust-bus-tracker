# Developer Skills

Vendored, self-contained guidance for contributors to the DAUST Bus Tracker. Each
subfolder is a "skill" — a focused `SKILL.md` (plus any references) describing how to
do one part of the work well. They are copied into the repo on purpose so a new
developer gets the right guidance for their area **straight from the repo**, with no
external setup.

**Before working on your area, read the matching skill below.**

## What's here, and when to use it

| Skill | Area | Used in |
|---|---|---|
| [`convex`](./convex) | Convex umbrella/index — points to the specific patterns | All backend work |
| [`convex-functions`](./convex-functions) | Queries, mutations, actions, **HTTP actions**, internal functions, scheduling; `args`+`returns` validators | Sprint 2 (backend), ongoing |
| [`create-pull-request`](./create-pull-request) | PR hygiene with the `gh` CLI | Every PR |
| [`vercel-react-best-practices`](./vercel-react-best-practices) | Next.js/React patterns | Sprint 4 (student web) |
| [`vercel-composition-patterns`](./vercel-composition-patterns) | Server/Client component composition | Sprint 4 |
| [`vercel-deploy`](./vercel-deploy) | Deploying the web app to Vercel | Sprint 4 |
| [`frontend-design`](./frontend-design) | General frontend design craft | Sprint 4–6 |
| [`web-design-guidelines`](./web-design-guidelines) | Web UI guidelines | Sprint 4–6 |
| [`ui-typography`](./ui-typography) | Type scale, readable text | Sprint 4–6 |
| [`use-of-color`](./use-of-color) | Colour usage | Sprint 4–6 |
| [`contrast-checker`](./contrast-checker) | Accessible colour contrast | Sprint 4–6 |
| [`design-audit`](./design-audit) | Reviewing a UI against design principles | Sprint 5–6 polish |

Project conventions that override any skill default live in [`../CONTRIBUTING.md`]
(e.g. feature branches target **`dev`**, not `main`) and in the decision record
([`../CONTEXT.md`](../CONTEXT.md) + [`../docs/adr/`](../docs/adr)). When a skill and a
project doc disagree, the project doc wins.

## Two honest notes

1. **The driver app (native Android/Kotlin) has no skill here yet.** This set covers
   the Convex backend and the Next.js student web app; it does not cover Jetpack
   Compose / foreground-service / Room work. Writing a Kotlin skill for Sprint 3 is an
   open gap — see `skill-creator` in the source collection if you pick it up.
2. **Expo / React-Native skills were deliberately excluded.** This stack is **Next.js
   (web) + native Kotlin (app)**, not React Native, so Expo/RN guidance would mislead.
   Artifacts/MCP/meta skills were excluded for the same "not relevant to this project"
   reason.
