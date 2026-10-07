import type { MetadataRoute } from "next";

/** Installable on phones and the wall tablet (§19.7). */
export default function manifest(): MetadataRoute.Manifest {
  return {
    name: "Kindo",
    short_name: "Kindo",
    description: "The family's day on one screen",
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
      { name: "Shopping", url: "/shopping" },
      { name: "Wall display", url: "/wall" },
    ],
  };
}
