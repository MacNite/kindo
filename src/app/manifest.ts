import type { MetadataRoute } from "next";
import { headers } from "next/headers";
import en from "@/i18n/messages/en";
import de from "@/i18n/messages/de";

/**
 * Installable on phones and the wall tablet (§19.7). The device's language
 * lives in the browser (§20 D7), so the words follow the language the
 * browser asks for when it installs Kindo.
 */
export default async function manifest(): Promise<MetadataRoute.Manifest> {
  const first = (await headers()).get("accept-language")?.split(",")[0]?.trim().toLowerCase() ?? "";
  const m = first.startsWith("de") ? de : en;
  return {
    name: m.app.name,
    short_name: m.app.name,
    description: m.app.tagline,
    id: "/",
    start_url: "/",
    scope: "/",
    display: "standalone",
    background_color: "#EEF1EC",
    theme_color: "#EEF1EC",
    categories: ["lifestyle", "productivity"],
    icons: [
      { src: "/icon-192.png", sizes: "192x192", type: "image/png", purpose: "any" },
      { src: "/icon-512.png", sizes: "512x512", type: "image/png", purpose: "any" },
      { src: "/icon-maskable-512.png", sizes: "512x512", type: "image/png", purpose: "maskable" },
    ],
    shortcuts: [
      { name: m.nav.shopping, url: "/shopping" },
      { name: m.nav.wall, url: "/wall" },
    ],
  };
}
