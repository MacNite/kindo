/**
 * The static demo on GitHub Pages (§20 D74) is served under a sub-path and has
 * no server. Both are set only by its build (`scripts/build-demo.mjs`); a
 * normal Kindo runs at its root with a server, and these change nothing.
 */
export const BASE_PATH = process.env.NEXT_PUBLIC_BASE_PATH ?? "";
export const STATIC_DEMO = process.env.NEXT_PUBLIC_KINDO_STATIC_DEMO === "1";

/** A path of Kindo's own for places Next.js doesn't prefix itself: plain <img>, `location.assign`. */
export const withBase = (path: string) => `${BASE_PATH}${path}`;
