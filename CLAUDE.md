# Kindo

Self-hosted family dashboard for a kitchen wall screen, phones and desktops.
Core flow:

```
People → Today → Routines & Tasks → Calendar → Rewards
```

The goal is that a family can glance at one screen and see what is happening
today and what each person still has to do. A four-year-old must be able to
follow their routine through pictures alone.

## Where things are

- **Product & architecture spec:** [`docs/SPEC.md`](docs/SPEC.md). Section
  numbers (`§N`) below refer to it. Decisions are logged in §20.
- **Architectural references:** `MacNite/BrewCore` and `MacNite/NutriCore`
  (Docker layout, workflows, persistence pattern to follow in §19.2).

If the spec is ambiguous or contradicts the code: stop and ask, then record the
decision in §20 in the same PR.

## Rules

- Layering: `src/app` routing, `src/components` UI, `src/lib/services` data
  seams, `src/lib` pure domain logic. Components never import from
  `src/lib/data` (mock data) directly. Go through `services/` or `state/`.
- No hard-coded UI strings. Add keys to `src/i18n/messages/en.ts` **and**
  `de.ts` (German is first-class, and the types and tests enforce parity).
- Member colour comes from the member (`--m` + `.tint`, `.m-text`, `.m-bg`).
  No ad-hoc colours for people.
- Child-facing UI: pictures carry the meaning, text is optional. Large targets,
  calm feedback, no excessive gamification (§6, §9).
- Expected routines never earn points. Only extras do (§9).
- Integrations run server-side. Secrets never reach the browser (§17).
- No database yet (§20 D6). Don't add persistence piecemeal. It comes as one
  step with Prisma, a `migrate` image and Server Actions, following BrewCore.

## Commands

```sh
npm run dev          # development server
npm run check        # lint + typecheck + unit tests
npm run build        # production build (standalone)
npm run test:e2e     # Playwright (starts the standalone server itself)
docker compose up -d --build
```

A change is done when `npm run check`, `npm run build` and `npm run test:e2e`
pass.
