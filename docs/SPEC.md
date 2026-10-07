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

Sections: Family, Members, Calendar, Routines & chores, Rewards, Photos, Dashboard, Appearance, Language & region, Integrations (Nextcloud/CalDAV, Immich, Google Calendar, ICS, Home Assistant).

## §16 Appearance

- Light, dark and system themes.
- Warm, modern, calm and touch-first. Avoid a corporate SaaS look, heavy gradients, childish cartoons and dense admin layouts.
- Tokens are CSS variables (`src/app/globals.css`). Member colours are applied through `--m`.
- Typefaces: Bricolage Grotesque (clock, headings) and Atkinson Hyperlegible (body text).

## §17 Architecture

- Next.js App Router, React 19, TypeScript and Tailwind CSS 3, with a custom i18n layer (no next-intl, see §20 D3).
- Layering: `src/app` for routing, `src/components` for UI, `src/lib/services` for data seams, `src/lib` for pure domain logic. **Components never import mock data directly.**
- Persistence (planned) follows BrewCore and NutriCore: Server Actions, Prisma and PostgreSQL in a modular monolith, with a one-shot `migrate` image. No separate REST backend, microservices or event bus unless justified.
- Integrations run server-side. Secrets never reach the browser.

## §18 Deployment

- One image, `ghcr.io/macnite/kindo`, multi-stage from `node:22-alpine`, using Next.js `standalone` output. It runs as non-root user `kindo` (uid 1001) with a healthcheck on `/api/health`.
- `docker-compose.yml` uses `APP_IMAGE` and keeps `build:` so `--build` works from source.
- Publishing: see README *Images*. arm64 builds only on release tags and manual runs, because emulated builds are slow.

## §19 Roadmap

1. **v0.1, UX prototype (this release):** all screens on mock data, Docker image, CI.
2. **Persistence:** PostgreSQL and Prisma, a `migrate` image and service, household state moved from `store.tsx` to Server Actions. Realtime sync between wall and phones (SSE).
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
| D6 | No database or `migrate` stage in v0.1 | Nothing to persist yet. Both are added together with Prisma (§19.2). |
| D7 | Client-only rendering in v0.1 | Theme, language and "now" come from the device. SSR returns with server-side persistence and a language cookie. |
| D8 | amd64 on `main`, amd64 + arm64 on `v*` tags | Same as BrewCore. Raspberry Pi hosts are covered by releases. |
| D9 | GitHub Pages demo site not set up yet | Possible later via a static export, like BrewCore's `site/`. |
