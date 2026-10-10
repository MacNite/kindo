# Kindo

A self-hosted family dashboard for the kitchen wall, built around the family's day rather than the smart home:

```
People → Today → Routines & Tasks → Calendar → Rewards
```

Kindo puts one screen on the wall that the whole family can read at a glance: what's happening today, and what each person still has to do. Young children who can't read yet follow their morning and evening routines through large picture cards. Parents get the same data on their phones.

> **Status: v0.2.** Roadmap steps 1–12 are in (see [`docs/SPEC.md`](docs/SPEC.md), *Roadmap*): PostgreSQL with live sync between screens, the recurrence engine, logins with single sign-on and paired wall displays, Nextcloud/CalDAV, Immich, ICS, Google Calendar, Home Assistant presence and Home control (a few switches and the solar flow), Frigate cameras with the doorbell and talking back, a kids' shelf of music and audiobooks from Jellyfin and Audiobookshelf (on the screen or a Home Assistant speaker), talking to Home Assistant with a held button, and an installable PWA with an offline shopping list. A new install starts empty; the Müller demo family can be loaded on the first-run screen.

| Wall display | Child view |
|---|---|
| ![Wall display](docs/screenshots/wall-display.png) | ![Child view](docs/screenshots/child-view-lena.png) |
| **Home (desktop)** | **Calendar (dark)** |
| ![Home](docs/screenshots/home-desktop.png) | ![Calendar](docs/screenshots/calendar-week-dark.png) |

<p align="center"><img src="docs/screenshots/mobile-home.png" alt="Mobile home" width="260"></p>

## What's in v0.2

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
- **Wall display:** open `/pair` on the tablet. It shows a code and a QR code; an admin confirms it in Settings → Devices. The tablet then shows the wall and the child view without a login. It can tick off routines, chores and shopping; anything else (approving extras, planning, settings) asks for the **settings PIN**, which an admin sets in Settings → Devices and which unlocks the tablet for 10 minutes. The PIN never gives admin rights: people, logins, devices and integrations need an admin's own login.
- **Keeping the wall screen on (Android):** Kindo's photo frame is the wall's screensaver, so Android must not turn the screen off or start its own first. Open `/wall` (or `/screensaver`); both ask the browser to keep the screen on. The browser only allows that over **https** (or `localhost`) and from Chrome / Android System WebView 84 on; otherwise it silently refuses and Android's timeout wins. On the tablet:
  - *Settings → Display → Screen saver* (older Android: *Daydream*): off, or *When to start: Never*. Otherwise Android's own screensaver starts while the tablet charges.
  - *Settings → Display → Sleep / Screen timeout*: the longest value, and longer than Kindo's *Photos → After no touch for*.
  - *Developer options → Stay awake* (screen never sleeps while charging). A wall tablet is always plugged in, so this keeps it on even where the browser refuses. Developer options appear after tapping *About tablet → Build number* seven times.
  - Battery saver off, and battery optimisation off for the browser (*Settings → Apps → Browser → Battery → Unrestricted*), or Android may stop it in the background.
  - Browser: Chrome over https, added to the home screen (long-press the icon for the *Wall display* shortcut), or a kiosk browser such as Fully Kiosk Browser on old tablets, which also works over http: start URL `/wall`, *Keep screen on* on, its own screensaver and screen-off timer **off** (so Kindo's photo frame shows), autoplay on for the doorbell's sound. Keep *Android System WebView* updated if the Play Store still offers it.
  - To check: set Android's screen timeout to 30 seconds for a moment and open `/wall`. If the screen stays on and the photos appear after Kindo's idle time, it works; then set the timeout back.
- **Behind a reverse proxy** (Traefik, Caddy, nginx) that is the only way in, set `KINDO_TRUST_PROXY=true` so sign-in attempts are limited per client address too. Without one, leave it off: anyone could send an `X-Forwarded-For` header.

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

To release, tag and push: `git tag v0.2.1 && git push origin v0.2.1` (bump `version` in `package.json` first).

> After the first publish, GHCR packages are **private** by default. To pull without logging in, open the package on GitHub → *Package settings* → *Change visibility* → *Public*.

## Development

Requirements: Node.js 22 or newer (the image runs 26, CI's tests run on 22) and a PostgreSQL you can create databases in.

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
    login/ pair/      Sign-in, and pairing a wall display
    offline/          Shown by the service worker when a page isn't cached
    api/health/       Liveness endpoint for Docker (with a database round-trip)
    api/stream/       Server-Sent Events: tells every screen when something changed
    api/auth/         Better Auth (password and single sign-on)
    api/photos/       Immich photo proxy with the disk cache
    api/cameras/      Camera still pictures and the WebRTC handshake (Frigate)
    api/media/        Kids' shelf: sound and covers through Kindo, signed addresses for speakers
    api/assist/       Push-to-talk: a short recording to Home Assistant's Assist
    api/integrations/ Google Calendar OAuth start and callback
    layout.tsx, providers.tsx, manifest.ts, sw.ts
  components/
    ui/               Design-system primitives (Avatar, Button, Panel, Dialog, Pictogram, …)
    layout/           AppShell, navigation, language/theme toggle
    widgets/          FamilyLanes, dashboard widgets, HomeScreen, WallDashboard
    routines/         ChildRoutine, RoutinesScreen, RecurrenceEditor, PictogramPicker
    auth/ setup/      Login and pairing screens, first-run setup
    home/ cameras/    Home control and talking, cameras and the doorbell
    media/            The kids' shelf, the player and the wall tile
    birthdays/        The birthday wheel
    calendar/ shopping/ rewards/ photos/ settings/
  lib/
    types.ts          Domain model: the contract between UI and server
    services/         Selectors over the household snapshot, and the Server Action seam (actions.ts)
    state/            Device prefs and the household store (snapshot, optimistic updates, live refresh)
    recurrence.ts     Recurrence model, matcher, RRULE mapping
    ledger.ts         The reward rule (§9)
    pictograms.tsx    Pictogram library
  server/
    household.ts      The household's rules and writes (plain functions over Prisma)
    actions/          Server Actions: thin wrappers that parse input and announce changes
    snapshot.ts       Loads everything a screen needs in one round-trip
    realtime.ts       PostgreSQL LISTEN/NOTIFY → SSE
    jobs.ts           Background jobs, run by the instance holding an advisory lock
    calendar/         CalDAV, Google and ICS sync
    contacts/         CardDAV birthdays
    photos/           Immich sync, playlist and the photo cache
    homeassistant.ts  Home Assistant: presence, switches, doorbell sensors
    home.ts           Home control (§21)
    cameras.ts        Cameras and talking back (§22); frigate.ts talks to Frigate
    media/            The kids' shelf (§23): Jellyfin, Audiobookshelf, speakers
    assist.ts         Talking to Home Assistant (§24)
    demo/             The Müller demo family and the seed
  i18n/               messages/en.ts + de.ts (parity enforced by types and tests), formats
  instrumentation.ts  Starts the background jobs when the server starts
prisma/               schema.prisma, migrations, seed-demo.ts
scripts/              start-standalone.mjs, check-migration-drift.mjs, make-icons.mjs
tests/                Integration tests against PostgreSQL
e2e/                  Playwright specs, mock servers (OIDC, Immich, Home Assistant, Frigate, Jellyfin and Audiobookshelf), and prepare-db.ts for the suite's own database
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
- **Home Assistant (speakers and talking):** *Speakers & talking* on the connection's cog picks the media players the kids' shelf may play on, and how loud a tap may make each (they fetch the sound from `APP_URL`, so set it to an address the speakers reach), and turns on *Talk to Home Assistant*: adults, or a wall unlocked with the PIN, hold a button on Home control and speak; Home Assistant's Assist does the rest. What a command may switch is Home Assistant's *Expose* list. Talking needs Kindo over https (or opened on the device itself) for the microphone.
- **Jellyfin (music for the kids' shelf):** the address, then Quick Connect (Kindo shows a code; enter it in Jellyfin, signed in as the children's user, under your profile → Quick Connect) or the user's name and password. Quick Connect also works for users made through single sign-on, which have no password; it must be on in Jellyfin (Dashboard → General). Kindo keeps only the user's access token. Best a user just for the children, limited to their music, so Jellyfin's parental controls apply too. *Kids' shelf* on the connection's cog picks albums and audio playlists.
- **Kids' shelf and the PIN:** Settings → Dashboard → *Listening and the PIN* makes starting playback on a wall need the settings PIN: for speakers only, or for everything. Pause, stop and volume stay free.
- **Audiobookshelf (audiobooks for the kids' shelf):** the address and an account's API key (the account's library access and *explicit content* switch apply). *Kids' shelf* picks the books; a child can get their own account's key there, so each keeps their own place.
- **Frigate (cameras and the doorbell):** see below.

Every connection has a cog: change its address, account or secret in place (an empty secret keeps the stored one), and open its own setup.

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
