# Kindo's static demo

The live demo on the website, <https://macnite.github.io/kindo/demo/>: the real
Kindo, exported as plain files for GitHub Pages, with the Müller family kept in
the visitor's browser instead of PostgreSQL (§20 D74). It is to Kindo what
HiveHub's `dashboard-demo/` is to its dashboard, but built from the app itself,
so it never falls behind.

```sh
npm run build:demo                              # → demo/out, served under /kindo/demo
KINDO_DEMO_BASE_PATH=/demo npm run build:demo   # another sub-path
```

To look at it locally, serve a folder that holds `demo/out` at the base path:

```sh
mkdir -p /tmp/site/kindo && cp -r demo/out /tmp/site/kindo/demo
npx serve /tmp/site    # http://localhost:3000/kindo/demo/
```

## How it works

`scripts/build-demo.mjs` copies the app to `.demo-build/`, lays `demo/src` over
it and runs `next build` with [`demo/next.config.ts`](next.config.ts)
(`output: "export"`). What needs a server is left out: API routes, middleware,
background jobs, sign-in, pairing, first-run setup and the service worker.

- **`src/server/actions/*.ts`** replace the Server Actions, module for module,
  with the same names, inputs and results (each typed as `typeof` the real one;
  [`parity.ts`](parity.ts) checks that none is missing). The household ones
  apply the rules of `src/server/household.ts` with the server's own input
  schemas; integrations, logins and devices answer `demo` ("needs a Kindo of
  your own").
- **`src/server/demo/browser.ts`** is the household: seeded from
  `src/server/demo/data.ts` (the same family as the Docker demo), relative to
  today, and kept in `localStorage` (`kindo.demo`). The visitor is always Anna,
  the admin. *Start over* in the banner, or a new day, seeds it again.
- **`src/app/(app)/layout.tsx`, `src/app/(kiosk)/layout.tsx`** take the
  snapshot from it instead of the database, and the app layout shows the demo
  banner. `?lang=de` opens the demo in German.
- **`src/app/(kiosk)/kids/[memberId]/…`** list the demo children for the export.

Apart from these files the demo runs Kindo's own code. In `src/`, only the base
path (`src/lib/basePath.ts`, for plain `<img>` and `location.assign`) and the
skipped live stream know about it.

`npm run check` type-checks and lints `demo/` against the real modules and runs
its tests; CI also builds it on every push. Pages publishes it with the website
(`.github/workflows/pages.yml`).
