import type { NextConfig } from "next";
import withSerwistInit from "@serwist/next";

// The PWA (§19.7): a service worker built from src/app/sw.ts. Off in
// development, where it would only cache stale bundles.
const withSerwist = withSerwistInit({
  swSrc: "src/app/sw.ts",
  swDest: "public/sw.js",
  disable: process.env.NODE_ENV === "development",
  cacheOnNavigation: true,
  reloadOnOnline: false,
});

const config: NextConfig = {
  // Self-contained server for the Docker image (see Dockerfile).
  output: "standalone",
  poweredByHeader: false,
  reactStrictMode: true,
};

export default withSerwist(config);
