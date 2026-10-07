/**
 * A stand-in Immich server for the tests: two albums, a few photos (one
 * video, which the photo frame skips), and real JPEG thumbnails. Counts the
 * thumbnail requests so tests can see the proxy's cache working.
 */
import { createServer } from "node:http";

export const IMMICH_KEY = "e2e-immich-api-key";
// A valid 1×1 JPEG.
const JPEG = Buffer.from(
  "/9j/4AAQSkZJRgABAQEASABIAAD/2wBDAAMCAgICAgMCAgIDAwMDBAYEBAQEBAgGBgUGCQgKCgkICQkKDA8MCgsOCwkJDRENDg8QEBEQCgwSExIQEw8QEBD/yQALCAABAAEBAREA/8wABgAQEAX/2gAIAQEAAD8A0s8g/9k=",
  "base64",
);
const albums = [
  { id: "alb-summer", albumName: "Summer", assets: [
    { id: "a1", type: "IMAGE", exifInfo: { dateTimeOriginal: "2026-07-14T10:00:00Z", city: "Rügen", country: "Germany" } },
    { id: "a2", type: "IMAGE", localDateTime: "2026-07-15T12:00:00Z" },
    { id: "v1", type: "VIDEO" },
  ] },
  { id: "alb-kids", albumName: "Kids", assets: [{ id: "a3", type: "IMAGE", fileCreatedAt: "2026-05-01T08:00:00Z" }] },
];

export function startImmichMock(port = 0) {
  const stats = { thumbnails: 0 };
  const server = createServer((req, res) => {
    const url = new URL(req.url ?? "/", "http://x");
    if (url.pathname === "/health") return res.writeHead(200).end("ok");
    if (req.headers["x-api-key"] !== IMMICH_KEY) return res.writeHead(401).end();
    const json = (b) => res.writeHead(200, { "content-type": "application/json" }).end(JSON.stringify(b));
    if (url.pathname === "/api/albums") {
      return json(url.searchParams.get("shared") === "true" ? [] : albums.map((a) => ({ id: a.id, albumName: a.albumName, assetCount: a.assets.length })));
    }
    const album = url.pathname.match(/^\/api\/albums\/([^/]+)$/);
    if (album) {
      const a = albums.find((x) => x.id === album[1]);
      return a ? json({ id: a.id, albumName: a.albumName, assets: a.assets }) : res.writeHead(404).end();
    }
    const thumb = url.pathname.match(/^\/api\/assets\/([^/]+)\/thumbnail$/);
    if (thumb) {
      stats.thumbnails++;
      return res.writeHead(200, { "content-type": "image/jpeg" }).end(JPEG);
    }
    res.writeHead(404).end();
  });
  return new Promise((resolve) => server.listen(port, "127.0.0.1", () => resolve({ server, stats, url: `http://127.0.0.1:${server.address().port}` })));
}

if (import.meta.url === `file://${process.argv[1]}`) {
  await startImmichMock(Number(process.env.IMMICH_MOCK_PORT ?? 3198));
}
