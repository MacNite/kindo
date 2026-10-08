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
  seams, `src/lib` pure domain logic, `src/server` server-only code (rules,
  integrations, jobs; the demo family in `src/server/demo`). Components never
  import from `src/server` directly. Go through `src/lib/services` or
  `src/lib/state`.
- No hard-coded UI strings. Add keys to `src/i18n/messages/en.ts` **and**
  `de.ts` (German is first-class, and the types and tests enforce parity).
- Member colour comes from the member (`--m` + `.tint`, `.m-text`, `.m-bg`).
  No ad-hoc colours for people.
- Child-facing UI: pictures carry the meaning, text is optional. Large targets,
  calm feedback, no excessive gamification (§6, §9).
- Rewards are optional per item. Routine steps earn points only while the child's
  routine points are on, at once and never with approval (§9, D49).
- Integrations run server-side. Secrets never reach the browser (§17).
- Persistence is PostgreSQL through Prisma, following BrewCore (§17, D10–D18).
  Rules and writes live in `src/server` (`household.ts` etc.), exposed as
  Server Actions in `src/server/actions`. Every schema change ships as a
  migration in `prisma/migrations` (`npm run db:migrate:dev`), applied by the
  one-shot `migrate` image; `npm run db:drift` must pass. Never edit an applied
  migration. New migration names must sort after `20261009100000_cameras`.

## Commands

```sh
npm run dev          # development server
npm run check        # lint + typecheck + unit tests
npm run build        # production build (standalone)
npm run test:e2e     # Playwright (starts the standalone server itself)
npm run db:drift     # schema vs. migrations (needs SHADOW_DATABASE_URL)
docker compose up -d --build
```

Development needs a `.env` with `DATABASE_URL` and `KINDO_SECRET_KEY` (see
`.env.example`). Test-only variables:

- `npm run test:e2e` needs a prior `npm run build`, a `DATABASE_URL` whose role
  can `CREATE DATABASE` (the suite makes `<name>_e2e`, or uses
  `E2E_DATABASE_URL`), and free ports 3100 (`E2E_PORT`) and 3196–3199 (mocks).
- `TEST_DATABASE_URL`: a disposable database for the integration tests in
  `tests/`, emptied on every run. Its name must contain `test` and differ from
  `DATABASE_URL` (`KINDO_TEST_DB_FORCE=1` overrides). Unset, they are skipped.
- `SHADOW_DATABASE_URL`: an empty database for `db:drift`.
- `CALDAV_TEST_URL`, `CALDAV_TEST_USER`, `CALDAV_TEST_PASSWORD`: a real CalDAV
  server for the CalDAV and contacts tests (skipped otherwise).

A change is done when `npm run check`, `npm run build` and `npm run test:e2e`
pass.
