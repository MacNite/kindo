/// <reference lib="webworker" />
import { defaultCache } from "@serwist/next/worker";
import type { PrecacheEntry, SerwistGlobalConfig } from "serwist";
import { NetworkOnly, Serwist } from "serwist";

/**
 * Kindo's service worker (§19.7). The app shell and every page a device has
 * opened are cached, so the shopping list opens without a connection; its
 * changes queue on the device and are sent once it's back (see
 * src/lib/state/offline.ts). Live sync and sign-in never come from a cache.
 */
declare global {
  interface WorkerGlobalScope extends SerwistGlobalConfig {
    __SW_MANIFEST: (PrecacheEntry | string)[] | undefined;
  }
}
declare const self: ServiceWorkerGlobalScope;

const serwist = new Serwist({
  precacheEntries: self.__SW_MANIFEST,
  skipWaiting: true,
  clientsClaim: true,
  navigationPreload: true,
  runtimeCaching: [
    // Never cached: the live-sync stream, sign-in, health, integration sign-ins, and the cameras (D48): a
    // still picture from a cache would show the door as it was, and the cache ignores `no-store`.
    // Photos (/api/photos, D34) stay in the default API cache: an id is always the same picture.
    { matcher: ({ url }) => /^\/api\/(stream|auth|health|integrations|cameras)(\/|$)/.test(url.pathname), handler: new NetworkOnly() },
    ...defaultCache,
  ],
  fallbacks: { entries: [{ url: "/offline", matcher: ({ request }) => request.destination === "document" }] },
});

serwist.addEventListeners();
