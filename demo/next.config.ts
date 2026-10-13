import type { NextConfig } from "next";

/**
 * The static demo (§20 D74): Kindo exported as plain files for GitHub Pages,
 * under KINDO_DEMO_BASE_PATH (default /kindo/demo). Built by
 * `scripts/build-demo.mjs` from a copy of the app with `demo/src` laid over
 * it; no service worker, no server. `npm run check` already type-checks and
 * lints these sources against the real ones, where the copy can't.
 */
const basePath = process.env.KINDO_DEMO_BASE_PATH ?? "/kindo/demo";

const config: NextConfig = {
  output: "export",
  basePath,
  trailingSlash: true,
  images: { unoptimized: true },
  env: { NEXT_PUBLIC_BASE_PATH: basePath, NEXT_PUBLIC_KINDO_STATIC_DEMO: "1" },
  typescript: { ignoreBuildErrors: true },
  eslint: { ignoreDuringBuilds: true },
  reactStrictMode: true,
};

export default config;
