# Kindo's website

The static site published to GitHub Pages by
[`.github/workflows/pages.yml`](../.github/workflows/pages.yml) (§20 D73):
an overview, the Docker setup guide and the live demo page, in English and
German (`de/`). Plain HTML and CSS, no build step.

- **Screenshots** are taken from `docs/screenshots` at deploy time. To preview
  locally: `cp -r docs/screenshots website/screenshots && npx serve website`
  (`website/screenshots` is ignored by git).
- **Hosted demo:** set the repository variable `KINDO_DEMO_URL` (Settings →
  Secrets and variables → Actions → Variables) and the Live demo buttons open
  it. Unset, they lead to the page that starts the demo locally with
  [`docker-compose.demo.yml`](../docker-compose.demo.yml).
- Keep the English and German pages in step: every change goes into both.
