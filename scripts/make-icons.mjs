// Renders the app icons (public/icon-*.png) from the logo: four calm dots in
// the default member colours. Run after changing the logo:
//   node scripts/make-icons.mjs
import { chromium } from "@playwright/test";

const dots = (pad) => {
  const s = 32 - 2 * pad;
  const k = (v) => pad + (v / 32) * s;
  const r = (8 / 32) * s;
  return `<circle cx="${k(11)}" cy="${k(11)}" r="${r}" fill="#3B78C2"/><circle cx="${k(21)}" cy="${k(11)}" r="${r}" fill="#2E8B6E" opacity=".9"/>
    <circle cx="${k(11)}" cy="${k(21)}" r="${r}" fill="#8A5CD1" opacity=".9"/><circle cx="${k(21)}" cy="${k(21)}" r="${r}" fill="#E39A1B" opacity=".9"/>`;
};
const svg = (pad, background) =>
  `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 32 32" width="100%" height="100%">${background ? `<rect width="32" height="32" fill="${background}"/>` : ""}${dots(pad)}</svg>`;

const icons = [
  { file: "public/icon-192.png", size: 192, svg: svg(2, "#EEF1EC") },
  { file: "public/icon-512.png", size: 512, svg: svg(2, "#EEF1EC") },
  // Maskable: everything inside the 80 % safe zone.
  { file: "public/icon-maskable-512.png", size: 512, svg: svg(6.5, "#EEF1EC") },
  { file: "public/apple-icon.png", size: 180, svg: svg(3, "#EEF1EC") },
];

const browser = await chromium.launch();
const page = await browser.newPage();
for (const i of icons) {
  await page.setViewportSize({ width: i.size, height: i.size });
  await page.setContent(`<html><body style="margin:0">${i.svg}</body></html>`);
  await page.screenshot({ path: i.file, omitBackground: false });
}
await browser.close();
console.log(`Wrote ${icons.length} icons.`);
