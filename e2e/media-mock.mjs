/**
 * Stand-ins for Jellyfin (under /jellyfin) and Audiobookshelf (under /abs)
 * for the tests (§23). Jellyfin: the "kids" user (password "secret") sees an
 * album, an audio playlist and a video playlist Kindo must leave out. "Mia"
 * signs in with single sign-on and has no password, so only Quick Connect
 * signs Kindo in as her (D65): her token approves a code, as Jellyfin's own
 * screen would (`POST /jellyfin/QuickConnect/Authorize?code=`).
 * `POST /__quickconnect {"enabled": false}` turns Quick Connect off.
 * Audiobookshelf: a family account and Mia's own account, one book of two
 * files (and one excluded file), and a podcast library Kindo must leave out.
 * The sound is real WAV (silence), served with Range like the real servers,
 * so a browser can play and seek it. `GET /__progress` shows the saved places.
 */
import { createServer } from "node:http";

export const JF_USER = "kids";
export const JF_PASSWORD = "secret";
export const ABS_KEY = "abs-family-key-0123456789";
export const ABS_MIA_KEY = "abs-mia-key-0123456789";
const JF_TOKEN = "jf-access-token";
export const JF_SSO_TOKEN = "jf-sso-mia-token";
const JF_USERS = { [JF_TOKEN]: { Id: "user-kids", Name: "Kids" }, [JF_SSO_TOKEN]: { Id: "user-mia", Name: "Mia" } };
const ABS_USERS = { [ABS_KEY]: { id: "usr-family", username: "family" }, [ABS_MIA_KEY]: { id: "usr-mia", username: "mia" } };

/** `seconds` of 8 kHz 8-bit mono silence as a WAV file. */
function wav(seconds) {
  const rate = 8000;
  const n = rate * seconds;
  const b = Buffer.alloc(44 + n, 0x80);
  b.write("RIFF", 0);
  b.writeUInt32LE(36 + n, 4);
  b.write("WAVEfmt ", 8);
  b.writeUInt32LE(16, 16);
  b.writeUInt16LE(1, 20);
  b.writeUInt16LE(1, 22);
  b.writeUInt32LE(rate, 24);
  b.writeUInt32LE(rate, 28);
  b.writeUInt16LE(1, 32);
  b.writeUInt16LE(8, 34);
  b.write("data", 36);
  b.writeUInt32LE(n, 40);
  return b;
}
// A valid 1×1 PNG.
const PNG = Buffer.from("iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==", "base64");

const JF_ITEMS = [
  { Id: "alb1", Name: "Bibi & Tina Songs", Type: "MusicAlbum", AlbumArtist: "Bibi & Tina" },
  { Id: "pl1", Name: "Sleepy songs", Type: "Playlist", MediaType: "Audio" },
  { Id: "vid1", Name: "Movie night", Type: "Playlist", MediaType: "Video" },
];
const JF_TRACKS = { alb1: [{ Id: "t1", Name: "Song one", RunTimeTicks: 30_000_000 }, { Id: "t2", Name: "Song two", RunTimeTicks: 20_000_000 }], pl1: [{ Id: "t3", Name: "Lullaby", RunTimeTicks: 20_000_000 }] };
const ABS_FILES = [{ ino: "f1", index: 1, duration: 4, metadata: { filename: "01 Chapter one.mp3" } }, { ino: "f2", index: 2, duration: 4, metadata: { filename: "02 Chapter two.mp3" } }, { ino: "fx", index: 3, duration: 9, exclude: true }];

export function startMediaMock(port = 0) {
  /** Saved places in a book, per account. */
  const progress = {};
  /** Quick Connect: whether it is on, and its codes by secret, with whom they were approved for. */
  const qc = { enabled: true, codes: new Map(), next: 100000 };
  /** Every sound request: path and Range, for the tests to check. */
  const requests = [];
  const json = (res, v, status = 200) => res.writeHead(status, { "content-type": "application/json" }).end(JSON.stringify(v));
  const body = (req) => new Promise((resolve) => {
    let b = "";
    req.on("data", (c) => (b += c));
    req.on("end", () => resolve(b ? JSON.parse(b) : {}));
  });
  /** Like the real servers: the whole file, or the asked-for bytes. */
  const sound = (req, res, seconds) => {
    const file = wav(seconds);
    requests.push({ path: req.url, range: req.headers.range ?? null });
    const m = /^bytes=(\d*)-(\d*)$/.exec(req.headers.range ?? "");
    if (!m) return res.writeHead(200, { "content-type": "audio/wav", "content-length": file.length, "accept-ranges": "bytes" }).end(file);
    const start = m[1] ? Number(m[1]) : 0;
    const end = m[2] ? Math.min(Number(m[2]), file.length - 1) : file.length - 1;
    if (start >= file.length) return res.writeHead(416, { "content-range": `bytes */${file.length}` }).end();
    res.writeHead(206, { "content-type": "audio/wav", "content-length": end - start + 1, "content-range": `bytes ${start}-${end}/${file.length}`, "accept-ranges": "bytes" }).end(file.subarray(start, end + 1));
  };

  const server = createServer(async (req, res) => {
    const url = new URL(req.url ?? "/", "http://x");
    const p = url.pathname;
    if (p === "/health") return res.writeHead(200).end("ok");
    if (p === "/__progress") return json(res, progress);
    if (p === "/__requests") return json(res, requests);
    if (p === "/__reset" && req.method === "POST") {
      for (const k of Object.keys(progress)) delete progress[k];
      requests.length = 0;
      qc.enabled = true;
      qc.codes.clear();
      return res.writeHead(200).end();
    }

    if (p === "/__quickconnect" && req.method === "POST") {
      qc.enabled = (await body(req)).enabled !== false;
      return res.writeHead(200).end();
    }

    // ── Jellyfin ──
    if (p.startsWith("/jellyfin/")) {
      const jp = p.slice("/jellyfin".length);
      if (jp === "/Users/AuthenticateByName" && req.method === "POST") {
        const b = await body(req);
        if (b.Username !== JF_USER || b.Pw !== JF_PASSWORD) return res.writeHead(401).end();
        return json(res, { AccessToken: JF_TOKEN, User: { Id: "user-kids", Name: "Kids" } });
      }
      if (jp === "/QuickConnect/Enabled") return json(res, qc.enabled);
      if (jp === "/QuickConnect/Initiate" && req.method === "POST") {
        if (!qc.enabled) return res.writeHead(401).end();
        const secret = `qc-secret-${qc.next}`;
        const code = String(qc.next++);
        qc.codes.set(secret, { code, user: null });
        return json(res, { Secret: secret, Code: code, Authenticated: false });
      }
      if (jp === "/QuickConnect/Connect") {
        const c = qc.codes.get(url.searchParams.get("secret") ?? "");
        if (!c) return res.writeHead(404).end();
        return json(res, { Code: c.code, Authenticated: Boolean(c.user) });
      }
      if (jp === "/Users/AuthenticateWithQuickConnect" && req.method === "POST") {
        const secret = (await body(req)).Secret ?? "";
        const c = qc.codes.get(secret);
        if (!c?.user) return res.writeHead(401).end();
        qc.codes.delete(secret);
        const token = Object.keys(JF_USERS).find((k) => JF_USERS[k].Id === c.user);
        return json(res, { AccessToken: token, User: JF_USERS[token] });
      }
      const me = JF_USERS[/Token="([^"]+)"/.exec(String(req.headers.authorization ?? ""))?.[1] ?? ""];
      if (!me) return res.writeHead(401).end();
      if (jp === "/QuickConnect/Authorize" && req.method === "POST") {
        const c = [...qc.codes.values()].find((v) => v.code === url.searchParams.get("code"));
        if (!c) return res.writeHead(404).end();
        c.user = me.Id;
        return json(res, true);
      }
      if (jp === "/Users/Me") return json(res, me);
      if (jp === "/Items" && url.searchParams.get("ParentId")) return json(res, { Items: JF_TRACKS[url.searchParams.get("ParentId")] ?? [] });
      if (jp === "/Items") {
        const s = (url.searchParams.get("SearchTerm") ?? "").toLowerCase();
        return json(res, { Items: JF_ITEMS.filter((i) => !s || i.Name.toLowerCase().includes(s)) });
      }
      const pl = /^\/Playlists\/([^/]+)\/Items$/.exec(jp);
      if (pl) return json(res, { Items: JF_TRACKS[pl[1]] ?? [] });
      const audio = /^\/Audio\/([^/]+)\/universal$/.exec(jp);
      if (audio) return sound(req, res, 3);
      if (/^\/Items\/[^/]+\/Images\/Primary$/.test(jp)) return res.writeHead(200, { "content-type": "image/png" }).end(PNG);
      return res.writeHead(404).end();
    }

    // ── Audiobookshelf ──
    if (p.startsWith("/abs/")) {
      const ap = p.slice("/abs".length);
      const key = String(req.headers.authorization ?? "").replace(/^Bearer /, "");
      const user = ABS_USERS[key];
      if (!user) return res.writeHead(401).end();
      if (ap === "/api/me") return json(res, user);
      if (ap === "/api/libraries") return json(res, { libraries: [{ id: "lib-books", mediaType: "book" }, { id: "lib-pods", mediaType: "podcast" }] });
      if (ap === "/api/libraries/lib-books/items") return json(res, { results: [{ id: "li_dragon", media: { metadata: { title: "Der kleine Drache", authorName: "Ingo Siegner" } } }] });
      if (ap === "/api/libraries/lib-pods/items") return json(res, { results: [{ id: "li_pod", media: { metadata: { title: "A podcast" } } }] });
      if (ap === "/api/items/li_dragon") return json(res, { id: "li_dragon", media: { metadata: { title: "Der kleine Drache" }, audioFiles: ABS_FILES } });
      const prog = /^\/api\/me\/progress\/([^/]+)$/.exec(ap);
      if (prog) {
        const k = `${user.username}:${prog[1]}`;
        if (req.method === "PATCH") {
          progress[k] = await body(req);
          return json(res, progress[k]);
        }
        return progress[k] ? json(res, progress[k]) : res.writeHead(404).end();
      }
      if (/^\/api\/items\/li_dragon\/file\/f[12]$/.test(ap)) return sound(req, res, 4);
      if (ap === "/api/items/li_dragon/cover") return res.writeHead(200, { "content-type": "image/png" }).end(PNG);
      return res.writeHead(404).end();
    }
    res.writeHead(404).end();
  });
  return new Promise((resolve) => server.listen(port, "127.0.0.1", () => {
    const base = `http://127.0.0.1:${server.address().port}`;
    resolve({ server, progress, requests, url: base, jellyfin: `${base}/jellyfin`, abs: `${base}/abs` });
  }));
}

if (import.meta.url === `file://${process.argv[1]}`) {
  await startMediaMock(Number(process.env.MEDIA_MOCK_PORT ?? 3195));
}
