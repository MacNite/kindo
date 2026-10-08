# Kindo

A self-hosted family dashboard for the kitchen wall, built around the family's day rather than the smart home:

```
People → Today → Routines & Tasks → Calendar → Rewards
```

Kindo puts one screen on the wall that the whole family can read at a glance: what's happening today, and what each person still has to do. Young children who can't read yet follow their morning and evening routines through large picture cards. Parents get the same data on their phones.

> **Status: v0.2.** Roadmap steps 1–10 are in (see [`docs/SPEC.md`](docs/SPEC.md), *Roadmap*): PostgreSQL with live sync between screens, the recurrence engine, logins with single sign-on and paired wall displays, Nextcloud/CalDAV, Immich, ICS, Google Calendar, Home Assistant presence and Home control (a few switches and the solar flow), Frigate cameras with the doorbell and talking back, and an installable PWA with an offline shopping list. A new install starts empty; the Müller demo family can be loaded on the first-run screen.

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
- **Routines and chores:** one block per person, time of day and rhythm, several steps added at once, a recurrence editor (daily, selected days, weekly, every N weeks, monthly, once, school days) with an RRULE preview, and a pictogram library. Routines reset at a household reset time (default 03:00), school days skip the holidays from your state's ICS feed, and a two-week history shows how each routine went.
- **Rewards:** off, stars, tokens or pocket money. Any chore can earn a reward, optionally after a parent approves. Routine steps earn points only while a child's routine points are switched on, which helps while they get used to a routine.
- **Everyday lists:** shopping (several lists, quick add, works offline), tasks, weekly meal plan, important dates with countdowns.
- **Installable (PWA):** add Kindo to the home screen of a phone or the wall tablet. The shopping list opens without a connection; ticks and additions made in the shop are sent once the phone is back online. The wall display keeps the screen on.
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
- **Single sign-on** with authentik or any OpenID Connect provider: set `OIDC_ISSUER`, `OIDC_CLIENT_ID` and `OIDC_CLIENT_SECRET`, with the redirect URI `<APP_URL>/api/auth/callback/oidc`. It signs in people whose email already has a login; it never creates new ones. Set `KINDO_PASSWORD_LOGIN=false` to make single sign-on the only way in (ignored while single sign-on isn't configured).
- **Wall display:** open `/pair` on the tablet. It shows a code and a QR code; an admin confirms it in Settings → Devices. The tablet then shows the wall and the child view without a login. It can tick off routines, chores and shopping; anything else (approving extras, planning, settings) asks for the **settings PIN**, which an admin sets in Settings → Devices and which unlocks the tablet for 10 minutes.

| Service | What it does |
|---|---|
| `db` | PostgreSQL 17. Data in `./data/postgres` (`POSTGRES_DATA_PATH`). Not published outside the compose network. |
| `migrate` | One-shot: applies database migrations (`ghcr.io/macnite/kindo-migrate`), then exits. With `KINDO_DEMO=true` it loads the demo family into an empty database. |
| `app` | The Next.js server (`ghcr.io/macnite/kindo`). Waits for `migrate`. Healthcheck at `/api/health` (includes a database round-trip). Photo cache in the `kindo-cache` volume. |

Back up `./data/postgres` (or run `docker compose exec db pg_dump -U kindo kindo > kindo.sql`).

### Building locally

```sh
docker compose up -d --build
```

## Images

The **Publish image** workflow ([`.github/workflows/publish.yml`](.github/workflows/publish.yml)) first runs the whole CI workflow for that commit (lint, typecheck, unit, integration and end-to-end tests, the image smoke test) and pushes to GitHub Container Registry only if it passes.

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

Requirements: Node.js 26 (what the image and CI run; 22 or newer works) and a PostgreSQL you can create databases in.

```sh
npm install
cp .env.example .env      # then set DATABASE_URL (e.g. postgresql://kindo:kindo@localhost:5432/kindo)
                          # and KINDO_SECRET_KEY: `npm start` runs in production mode and refuses to start without it
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
| `npm test` | Vitest: unit tests, plus integration tests against `TEST_DATABASE_URL` when it is set, and against a real CalDAV server when `CALDAV_TEST_URL` is set (skipped otherwise) |
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
| `/home-control`, `/cameras` | Home control and cameras, once set up |
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

## Integrations

Everything below runs on the server. Passwords, API keys and tokens are entered in Settings → Integrations, stored encrypted with `KINDO_SECRET_KEY`, and never sent to a device.

- **Nextcloud / CalDAV** (the main calendar source): add the server address (`https://cloud.example.com/remote.php/dav`), username and an app password. Kindo discovers the calendars, and in Settings → Calendar you choose whose each one is (its events take their colours), whether it is read-only, and whether it is daily attendance like school. Calendars are synced every few minutes (`KINDO_SYNC_MINUTES`) into Kindo's database, so the wall stays fast when Nextcloud is down. New events and changes to single events are written to Nextcloud first; the people Kindo assigns travel along in `X-KINDO-MEMBERS`. Repeating series are shown, and edited in the calendar app they come from.
- **Immich** (several servers): add each server's address and an API key (permissions `album.read`, `asset.read`, `asset.view`) in Settings → Integrations. Its albums appear on the Photos screen; tick the ones for the photo frame and set how often each appears. Album lists refresh every half hour. Images reach devices only through Kindo (`/api/photos/…`), cached on disk in the `kindo-cache` volume (`KINDO_PHOTO_CACHE_MB`, default 500 MB, least recently shown go first). If photos stay blank, `docker compose logs app | grep photo` names the cause (Immich's answer, a network error, or a cache directory the app can't write; photos are still served then, just not cached).
- **ICS subscriptions:** paste a feed address (school calendar, waste collection, `webcal://` works too), choose whose it is and whether it's daily attendance. Read-only, refreshed every half hour. The address is stored encrypted, since private feeds work like a password.
- **Google Calendar:** needs the household's own OAuth client. Create one in the Google Cloud console (type *Web application*, redirect URI `<APP_URL>/api/integrations/google/callback`, Calendar API enabled) and set `GOOGLE_CLIENT_ID` and `GOOGLE_CLIENT_SECRET`. Then Settings → Integrations → Google signs an account in; its calendars sync like Nextcloud's, and writable ones accept new events and edits of single events.
- **Home Assistant (presence for the photo frame):** the Home Assistant address, a long-lived access token and, optionally, one presence entity (motion, occupancy or a person). Kindo follows it over Home Assistant's WebSocket API: someone there wakes the wall from the photo frame, nobody there lets it go back to photos.
- **Home Assistant (doorbell):** a doorbell's *Visitor* sensor rings on every screen; it is picked in the Frigate camera setup.
- **Home Assistant (Home control):** once connected, *Home control* on the connection picks the lights, switches, fans or helpers the family may switch (with their own names) and the power sensors for the solar view: solar production, and optionally house consumption and grid power (W or kW). They show on `/home-control`, as a home-screen widget, and on the wall once the *Home control* tile is turned on in Settings → Dashboard. Anyone at the wall can switch them without the PIN, so leave out doors, heating and alarms; "Everything off" turns off exactly the switches on that list.
- **Frigate (cameras and the doorbell):** see below.

### Cameras and the doorbell (Frigate)

Kindo shows [Frigate](https://frigate.video)'s cameras as still pictures on the wall (the *Cameras* tile in Settings → Dashboard), as a home-screen widget and on `/cameras`; a tap opens one live, with sound. A doorbell press, reported by Home Assistant, opens the doorbell's camera full screen on every screen, over the photo frame too. Adults, or a wall display unlocked with the PIN, can hold *Talk* to speak through the doorbell. Kindo never offers to unlock a door.

**First make it work in Frigate itself**, from the tablet that will hang on the wall: live view with sound, and two-way talk in Frigate's own UI. If Frigate can't talk to the doorbell, Kindo can't either. For a Reolink doorbell, Frigate's docs (*Camera specific → Reolink*, *Live view → Two way talk*, *Restream → Preventing go2rtc from blocking two-way audio*) suggest:

```yaml
go2rtc:
  streams:
    front_door:                 # watching, recording, detection
      - "ffmpeg:http://DOORBELL_IP/flv?port=1935&app=bcs&stream=channel0_main.bcs&user=USER&password=PASSWORD#video=copy#audio=copy#audio=opus"
    front_door_twt:             # talking: the bare rtsp:// source carries the speaker, so no # options on it
      - "ffmpeg:http://DOORBELL_IP/flv?port=1935&app=bcs&stream=channel0_main.bcs&user=USER&password=PASSWORD#video=copy#audio=copy#audio=opus"
      - "rtsp://USER:PASSWORD@DOORBELL_IP:554/Preview_01_sub"
  webrtc:
    candidates:
      - FRIGATE_LAN_IP:8555     # the address the wall tablet reaches Frigate at
```

Any other rtsp:// source of the same camera that recording or detection uses needs `#backchannel=0`, or go2rtc keeps the speaker for itself. Check the exact source URLs against Frigate's current docs for your model and firmware.

**Then in Kindo:**
1. Settings → Integrations → *Home Assistant* (for the ring), then *Frigate*: Frigate's authenticated address **with its port**: 8971 in the container, or the port it is published on (`https://nvr.local:30193`). Use a Frigate user just for Kindo. Frigate's default certificate is self-signed: turn on *Trust Frigate's own certificate* and Kindo pins exactly that certificate (its SHA-256 fingerprint is shown in the camera setup); any other certificate at that address is refused before the password is sent.
2. *Cameras* on the Frigate connection: add cameras, give them the family's names, check the live and talk streams Kindo guessed (`front_door`, `front_door_twt`) and pick the doorbell's *Visitor* sensor from Home Assistant (Reolink: `binary_sensor.<name>_visitor`).

**Network and browser:**
- Video and sound go directly between the screen and go2rtc's WebRTC port: allow **8555 TCP and UDP** from the wall tablet (and phones) to Frigate. Kindo only relays the handshake, through Frigate's authenticated API; keep go2rtc's API (1984) and Frigate's unauthenticated port (5000) away from the LAN.
- Browsers allow the microphone only on https (or `localhost`): open Kindo over https with a certificate the tablet trusts to talk. Watching and the ring work over http too.
- **Behind a reverse proxy** (`https://frigate.example.com`): Kindo's server must reach that name itself. Kindo's container resolves it with its own DNS, which from inside the house often points to the public address and fails without NAT loopback; then use Frigate's LAN address and port 8971 instead (with *Trust Frigate's own certificate*). A sign-in proxy (authentik, Authelia) in front of Frigate redirects Kindo to its login page: let `/api` through, or use port 8971 directly. When connecting fails, the dialog shows the reason.
- A wall display plays the visitor's sound only after someone has touched the page once (browser autoplay rules); otherwise it shows *Tap for sound*. In a kiosk browser you can allow autoplay instead.

## License

[AGPL-3.0-only](LICENSE). Kindo was inspired by the feature sets of FamilyHub and Kinboard but shares no code, names or assets with them.
