# Kindo's website

The static site published to GitHub Pages by
[`.github/workflows/pages.yml`](../.github/workflows/pages.yml) (§20 D73):
an overview, the Docker setup guide and the live demo page, in English and
German (`de/`). Plain HTML and CSS, no build step; the static demo itself is
built from the app (D74).

- **Screenshots** are taken from `docs/screenshots` at deploy time. To preview
  locally: `cp -r docs/screenshots website/screenshots && npx serve website`
  (`website/screenshots` is ignored by git).
- **Live demo:** the workflow builds the static demo ([`demo/`](../demo/README.md),
  §20 D74) and publishes it under `demo/`, so the Live demo buttons open
  `demo/` (`../demo/?lang=de` from the German pages). The demo page also
  explains [`docker-compose.demo.yml`](../docker-compose.demo.yml) for the
  complete Kindo.
- Keep the English and German pages in step: every change goes into both.
