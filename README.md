# Kindo

A self-hosted family dashboard for the kitchen wall, built around the family's day rather than the smart home:

```
People → Today → Routines & Tasks → Calendar → Rewards
```

Kindo puts one screen on the wall that the whole family can read at a glance: what's happening today, and what each person still has to do. Young children who can't read yet follow their morning and evening routines through large picture cards. Parents get the same data on their phones.

> **Status: v0.2.** Everything is stored in PostgreSQL and every screen stays in sync live (see [`docs/SPEC.md`](docs/SPEC.md), *Roadmap*). A new install starts empty; the Müller demo family can be loaded on the first-run screen.

| Wall display | Child view |
|---|---|
| ![Wall display](docs/screenshots/wall-display.png) | ![Child view](docs/screenshots/child-view-lena.png) |
| **Home (desktop)** | **Calendar (dark)** |
| ![Home](docs/screenshots/home-desktop.png) | ![Calendar](docs/screenshots/calendar-week-dark.png) |

<p align="center"><img src="docs/screenshots/mobile-home.png" alt="Mobile home" width="260"></p>

## What's in the prototype

- **Family lanes:** one column per person, in their colour, showing the current routine as picture tiles, appointments and chores. School and Kita appear as a quiet line.
- **Child view:** large pictogram cards, progress shown as dots, morning/afternoon/evening chosen by icon. Leaving the view needs a press-and-hold.
- **Wall display:** a kiosk layout readable from a few metres. It becomes a photo frame when idle, and a tap returns to the dashboard.
- **Calendar:** month, week and agenda views, colour-coded by person, with filters and calendar sources (Nextcloud/CalDAV, Google, ICS, local).
- **Routines, chores and extras:** a recurrence editor (daily, selected days, weekly, every N weeks, monthly, once, school days) with an RRULE preview, and a pictogram library. Routines reset at a household reset time (default 03:00), school days skip the holidays from your state's ICS feed, and a two-week history shows how each routine went.
- **Rewards:** off, stars, tokens or pocket money. Expected routines earn nothing, extras can earn a reward. Includes parent approval.
- **Everyday lists:** shopping (several lists, quick add), tasks, weekly meal plan, important dates with countdowns.
- **Photos:** several Immich servers, album pool, weighting.
- **Customization:** show, hide, reorder and resize home widgets.
- **Languages and themes:** English and German (separate language and region formats), light, dark and system themes.

## Running with Docker Compose

Requirements: Docker with Compose v2.

```sh
cp .env.example .env      # set POSTGRES_PASSWORD and KINDO_SECRET_KEY; optional: APP_URL, single sign-on, time zone
docker compose up -d
```

Open <http://localhost:3000> and set up your household and your admin login, or tick *Start with the demo family*.

### Logins and the wall display

- **Everything is behind a login.** Adults get a login from an admin (Settings → Members). Children never need one.
- **Single sign-on** with authentik or any OpenID Connect provider: set `OIDC_ISSUER`, `OIDC_CLIENT_ID` and `OIDC_CLIENT_SECRET`, with the redirect URI `<APP_URL>/api/auth/callback/oidc`. It signs in people whose email already has a login; it never creates new ones.
- **Wall display:** open `/pair` on the tablet. It shows a code and a QR code; an admin confirms it in Settings → Devices. The tablet then shows the wall and the child view without a login. It can tick off routines, chores and shopping; anything else (approving extras, planning, settings) asks for the **settings PIN**, which an admin sets in Settings → Devices and which unlocks the tablet for 10 minutes.

| Service | What it does |
|---|---|
| `db` | PostgreSQL 17. Data in `./data/postgres` (`POSTGRES_DATA_PATH`). Not published outside the compose network. |
| `migrate` | One-shot: applies database migrations (`ghcr.io/macnite/kindo-migrate`), then exits. With `KINDO_DEMO=true` it loads the demo family into an empty database. |
| `app` | The Next.js server (`ghcr.io/macnite/kindo`). Waits for `migrate`. Healthcheck at `/api/health` (includes a database round-trip). |

Back up `./data/postgres` (or run `docker compose exec db pg_dump -U kindo kindo > kindo.sql`).

### Building locally

```sh
docker compose up -d --build
```

## Images

The **Publish image** workflow ([`.github/workflows/publish.yml`](.github/workflows/publish.yml)) runs lint, typecheck and unit tests, then pushes to GitHub Container Registry.

| Trigger | Tags | Platforms |
|---|---|---|
| Push to `main` | `latest`, `main`, `sha-<short>` | `linux/amd64` |
| Tag `v1.2.3` | `1.2.3`, `1.2`, `1`, `latest`, `sha-<short>` | `linux/amd64`, `linux/arm64` |
| Tag `v0.x.y` | as above, without the bare major tag | `linux/amd64`, `linux/arm64` |
| Manual run | as for the ref | selectable |

Images carry provenance attestations and an SBOM. The migration image `ghcr.io/macnite/kindo-migrate` is published alongside with the same tags. For a reproducible deployment, pin the same version on both in `.env`:

```sh
APP_IMAGE=ghcr.io/macnite/kindo:0.2.0
MIGRATE_IMAGE=ghcr.io/macnite/kindo-migrate:0.2.0
```

To release, tag and push: `git tag v0.1.0 && git push origin v0.1.0`.

> After the first publish, GHCR packages are **private** by default. To pull without logging in, open the package on GitHub → *Package settings* → *Change visibility* → *Public*.

## Development

Requirements: Node.js 22 and a PostgreSQL you can create databases in.

```sh
npm install
cp .env.example .env      # then set DATABASE_URL, e.g. postgresql://kindo:kindo@localhost:5432/kindo
npm run db:migrate        # apply migrations
npm run db:seed:demo      # optional: the Müller demo family
npm run dev               # http://localhost:3000
```

| Command | What it does |
|---|---|
| `npm run dev` | Development server |
| `npm run build` / `npm start` | Production build, served from the standalone output exactly as in the image |
| `npm run lint` | ESLint (`next/core-web-vitals`, `next/typescript`) |
| `npm run typecheck` | `tsc --noEmit` |
| `npm test` | Vitest: unit tests, plus integration tests against `TEST_DATABASE_URL` when it is set (skipped otherwise) |
| `npm run test:e2e` | Playwright. Creates, migrates and seeds its own database (`<name>_e2e` next to `DATABASE_URL`), then starts the production server |
| `npm run check` | lint + typecheck + tests |
| `npm run db:migrate` / `db:migrate:dev` | Apply migrations / create a new one after changing `prisma/schema.prisma` |
| `npm run db:drift` | Fails when the schema and the committed migrations disagree (needs `SHADOW_DATABASE_URL`) |
| `npm run db:seed:demo` | Load the demo family into an empty database |

CI ([`.github/workflows/ci.yml`](.github/workflows/ci.yml)) runs all of the above against PostgreSQL on every push. It also builds both images, migrates a fresh database with the migrate image, and checks that the app starts, becomes healthy, carries no Prisma CLI and runs as a non-root user.

### Screens

| URL | Screen |
|---|---|
| `/` | Home: family lanes and widgets (desktop), separate layout on phones |
| `/wall` | Wall display (kiosk) with photo frame |
| `/kids`, `/kids/lena`, `/kids/paul` | Child view |
| `/calendar`, `/routines`, `/tasks`, `/shopping`, `/meals`, `/rewards`, `/photos`, `/settings` | Management screens |
| `/screensaver` | The photo frame on its own |

### Project structure

```
src/
  app/
    (app)/            Management screens inside the AppShell (rail on desktop, bottom nav on phones)
    (kiosk)/          Full-screen surfaces: wall, kids, screensaver
    setup/            First-run setup
    api/health/       Liveness endpoint for Docker (with a database round-trip)
    api/stream/       Server-Sent Events: tells every screen when something changed
    layout.tsx, providers.tsx
  components/
    ui/               Design-system primitives (Avatar, Button, Panel, Dialog, Pictogram, …)
    layout/           AppShell, navigation, language/theme toggle
    widgets/          FamilyLanes, dashboard widgets, HomeScreen, WallDashboard
    routines/         ChildRoutine, RoutinesScreen, RecurrenceEditor, PictogramPicker
    calendar/ shopping/ rewards/ photos/ settings/
  lib/
    types.ts          Domain model: the contract between UI and server
    services/         Selectors over the household snapshot, and the Server Action seam (actions.ts)
    state/            Device prefs and the household store (snapshot, optimistic updates, live refresh)
    recurrence.ts     Recurrence model, matcher, RRULE mapping
    ledger.ts         The reward rule (§9)
  server/
    household.ts      The household's rules and writes (plain functions over Prisma)
    actions/          Server Actions: thin wrappers that parse input and announce changes
    snapshot.ts       Loads everything a screen needs in one round-trip
    realtime.ts       PostgreSQL LISTEN/NOTIFY → SSE
    demo/             The Müller demo family and the seed
    pictograms.tsx    Pictogram library
  i18n/               messages/en.ts + de.ts (parity enforced by types and tests), formats
prisma/               schema.prisma, migrations, seed-demo.ts
tests/                Integration tests against PostgreSQL
e2e/                  Playwright specs, and prepare-db.ts for the suite's own database
docker/               entrypoint.sh, migrate.sh, healthcheck.sh
docs/                 SPEC.md (product + decisions), screenshots
```

### Localization

UI strings live in `src/i18n/messages/`. `de.ts` is typed against `en.ts`, so a missing German string fails the build. A unit test also checks that placeholders match. Language (UI text) and region (date format, 12/24 h, week start, numbers, currency) are set separately in **Settings → Language & region**.

## Integrations (planned)

The seams are in place and documented in code. Nothing connects yet.

- **Nextcloud / CalDAV** (primary calendar source): `CalendarAdapter` in [`src/lib/services/calendar.ts`](src/lib/services/calendar.ts). It runs server-side so app passwords never reach the browser. `Recurrence` maps 1:1 onto RRULE, so routines can later be stored as VTODO.
- **Immich** (several servers): `PhotoAdapter` and `buildPool()` in [`src/lib/services/photos.ts`](src/lib/services/photos.ts). Thumbnails will be proxied by Kindo so API keys stay on the server.
- **Google Calendar, ICS subscriptions, Home Assistant:** shown in Settings → Integrations.

## License

[AGPL-3.0-only](LICENSE). Kindo was inspired by the feature sets of FamilyHub and Kinboard but shares no code, names or assets with them.
