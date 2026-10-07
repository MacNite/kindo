# Kindo: product and architecture spec

Section numbers (`§N`) are stable references for issues, PRs and `CLAUDE.md`. When the code and this spec disagree, stop and decide, then record the decision in §20 in the same PR.

## §1 Vision

Kindo is a self-hosted family organiser built around **People → Today → Routines & Tasks → Calendar → Rewards**.

The key question the product answers is: *can a family glance at one screen and immediately understand what is happening today and what each person needs to do?*

- **For a child:** can a four- or five-year-old follow their morning or evening routine largely through pictures?
- **For a parent:** can I see today's schedule, tasks and family status without navigating through several screens?

Kindo is **not** a smart-home dashboard. Family organisation comes first.

## §2 Devices

| Context | Requirements |
|---|---|
| Wall display | Landscape or portrait touchscreen in the kitchen or hallway. Readable from several metres away. Large touch targets, no tiny controls. Always on, and becomes a photo frame when idle. |
| Mobile (PWA later) | Parents quickly check the calendar, add tasks, use shopping, manage chores and approve children's extras. |
| Desktop/tablet | Full management: calendar, settings, configuration. |

## §3 People and accounts

People and login accounts are **separate**. Children never need an account.

A member has a name, avatar (emoji, photo or initial), colour, role (`admin`, `adult`, `child`), an optional birthday and an optional account.

The member's colour is used consistently on events, chores, routines and avatars.

## §4 Today / dashboard

- The home screen is built around **family lanes**: one column per person with their colour, current routine, appointments and chores.
- Household context sits around the lanes: clock, weather, tonight's meal, shopping count and important dates.
- Widgets can be shown or hidden, reordered and resized: clock, weather, today, coming up, routines, chores, meals, shopping, dates, photos.
- There are separate presentations for the wall (`/wall`), phones and the child view.

## §5 Calendar

- Month, week and agenda views. Events are colour-coded by person, with a filter per person.
- Daily attendance (school, Kita) is a *background* event: shown quietly, and left out of "coming up".
- Sources: **Nextcloud/CalDAV (primary)**, Google Calendar, ICS subscriptions and local events. Each source has default members that decide the event colour, and a read-only flag.

## §6 Routines, chores, tasks

- **Routine:** a member, a period (morning, afternoon, evening), a recurrence and ordered steps.
- **Chore:** a recurring household responsibility for one member or anyone.
- **Task:** a one-off item with an optional due date.
- Each step is a pictogram, an optional short label and a value.
- The child view must be fully usable without reading. Completed cards change calmly. No excessive gamification.

## §7 Recurrence

`Recurrence` covers daily, selected weekdays, weekly, every N weeks, monthly, once, and school days (weekdays minus holidays from an ICS feed).

Every kind maps onto an RFC 5545 RRULE (`toRRule`), so recurrence can round-trip through CalDAV later.

## §8 Pictograms

There is a built-in library in one visual language (Lucide, plus custom icons drawn on the same grid), organised in categories: morning, household, evening, outdoors, school & play.

Emoji and uploaded photos are supported as alternatives (`emoji:` and `img:` prefixes). Upload is planned.

## §9 Rewards

- Modes: off, stars, tokens, pocket money (with a conversion rate).
- **Expected routines earn nothing. Extras may earn a reward**, optionally after a parent approves.
- Rewards are a simple catalogue with costs. The product should never feel like a video game.

## §10 Shopping

Several lists, quick add, checkboxes, categories, an assigned person, and a trolley section for ticked items. Shopping must work offline once the app is installed as a PWA (planned).

## §11 Meals

A weekly dinner plan with who cooks. Recipes and "ingredients to shopping list" are planned.

## §12 Important dates

Birthdays, anniversaries, school events and other yearly dates, with countdowns.

## §13 Photos and screensaver

- **Several Immich servers.** Albums from all of them form one pool, with weighting.
- Each photo can show date, place and album.
- Flow: dashboard → no touch for N minutes → photo frame → touch → dashboard. Presence sensors (e.g. via Home Assistant) are planned and will trigger the same switch.

## §14 Localisation

- English and German from day one. German is first-class.
- Strings live in `src/i18n/messages`. `de.ts` is typed against `en.ts`, and a unit test checks key and placeholder parity.
- **Language and region are separate.** Region controls date format, 12/24 h, week start, numbers and currency.

## §15 Settings

Sections: Family, Members, Dates, Calendar, Routines & chores, Rewards, Photos, Dashboard, Appearance, Language & region, Integrations (Nextcloud/CalDAV, Immich, Google Calendar, ICS, Home Assistant).

## §16 Appearance

- Light, dark and system themes.
- Warm, modern, calm and touch-first. Avoid a corporate SaaS look, heavy gradients, childish cartoons and dense admin layouts.
- Tokens are CSS variables (`src/app/globals.css`). Member colours are applied through `--m`.
- Typefaces: Bricolage Grotesque (clock, headings) and Atkinson Hyperlegible (body text).

## §17 Architecture

- Next.js App Router, React 19, TypeScript and Tailwind CSS 3, with a custom i18n layer (no next-intl, see §20 D3).
- Layering: `src/app` for routing, `src/components` for UI, `src/lib/services` for data seams, `src/lib` for pure domain logic. **Components never import mock data directly.**
- Persistence follows BrewCore and NutriCore: Server Actions, Prisma and PostgreSQL in a modular monolith, with a one-shot `migrate` image. No separate REST backend, microservices or event bus unless justified. Server code lives in `src/server` (`household.ts` holds the rules, `actions/*.ts` wraps them as Server Actions); UI reaches it only through `src/lib/services/actions.ts` and the store.
- Integrations run server-side. Secrets never reach the browser.

## §18 Deployment

- Two images from one multi-stage Dockerfile on `node:22-alpine`: `ghcr.io/macnite/kindo` (Next.js `standalone` output, no Prisma CLI) and `ghcr.io/macnite/kindo-migrate` (one-shot `prisma migrate deploy`). Both run as non-root user `kindo` (uid 1001). The app has a healthcheck on `/api/health`, which includes a database round-trip.
- Compose runs `db` (PostgreSQL 17), `migrate` and `app`; the app waits for `migrate` to complete.
- `docker-compose.yml` uses `APP_IMAGE` and keeps `build:` so `--build` works from source.
- Publishing: see README *Images*. arm64 builds only on release tags and manual runs, because emulated builds are slow.

## §19 Roadmap

1. **v0.1, UX prototype:** all screens on mock data, Docker image, CI. *(done)*
2. **Persistence:** *(done)* PostgreSQL and Prisma, a `migrate` image and service, household state moved from `store.tsx` to Server Actions. Realtime sync between wall and phones (SSE).
3. **Recurrence engine:** occurrences per date, daily reset, completion history.
4. **Accounts:** local login plus OIDC (authentik), kiosk device pairing, a PIN for settings on the wall.
5. **Nextcloud/CalDAV** read, then write, with member mapping per calendar.
6. **Immich adapter** with a thumbnail proxy and cache.
7. **PWA:** installable, offline shopping list, wake lock on the wall.
8. Google Calendar, ICS, Home Assistant (presence for the photo frame).

## §20 Decisions

| # | Decision | Why |
|---|---|---|
| D1 | Product name **Kindo**, repository `MacNite/kindo`, image `ghcr.io/macnite/kindo` | Replaces the working name FamilyBoard. |
| D2 | Upgrade to Next.js 15 / React 19 now | Matches BrewCore and NutriCore, and avoids a later migration. |
| D3 | Keep the custom i18n layer instead of next-intl | Type-checked German parity, separate language and region, and no locale routing needed while rendering is client-side. Revisit with SSR. |
| D4 | ESLint (`next/core-web-vitals`, `next/typescript`), Vitest and Playwright | Same tooling as BrewCore. |
| D5 | License **AGPL-3.0-only** | Same as BrewCore. A self-hosted network service should keep modifications open. |
| D6 | No database or `migrate` stage in v0.1 | Nothing to persist yet. Both are added together with Prisma (§19.2). *Superseded by D10–D18.* |
| D7 | Client-only rendering in v0.1 | Theme, language and "now" come from the device. SSR returns with server-side persistence and a language cookie. |
| D8 | amd64 on `main`, amd64 + arm64 on `v*` tags | Same as BrewCore. Raspberry Pi hosts are covered by releases. |
| D9 | GitHub Pages demo site not set up yet | Possible later via a static export, like BrewCore's `site/`. |
| D10 | One household per installation | A family runs its own instance. The singleton `Household` row holds family-wide settings; no `householdId` on every table. |
| D11 | A new install starts empty, with first-run setup at `/setup`; the Müller demo family is optional | Real families must not start with fake data. The demo loads from the setup screen, `npm run db:seed:demo`, or `KINDO_DEMO=true` in the migrate service, and only into an empty database. The e2e suite runs on the demo. |
| D12 | Realtime sync: Server-Sent Events fed by PostgreSQL `LISTEN/NOTIFY` | Works with more than one app container and needs no extra service. Messages carry only a topic, never data; each device refetches what it may see. |
| D13 | Screens keep rendering on the device (D7 stays); the route-group layouts load a household snapshot on the server and hand it to the store | Smallest change from v0.1, no hydration mismatches for time and theme, and the first paint has data. SSR can still come later. |
| D14 | One household snapshot per round-trip: everything a screen needs, events from 90 days back to 400 days ahead, completions of the last 35 days | Family-sized data is small. One shape keeps the store simple and the optimistic updates honest. |
| D15 | The server decides rewards: routine steps are always stored as expected, and an item's points come from the database, not the device | §9 must hold whatever a device sends. |
| D16 | Important dates are stored as the original date plus a yearly flag, managed in a new Settings section, *Dates* | Ages and anniversaries count themselves; §15 gains one section. |
| D17 | All-day events are stored at UTC midnight with an exclusive end, as in iCalendar | "Tuesday" stays Tuesday on every device and round-trips through CalDAV. |
| D18 | Mutations are idempotent "set" operations; offline-capable creates use ids from the device | Retries, double taps and the later offline queue (§19.7) cannot create duplicates or flip state twice. |
