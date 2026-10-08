/**
 * A stand-in Frigate: sign-in (`/api/login`, a JWT in a cookie), its config
 * (two cameras, go2rtc streams whose URLs carry passwords Kindo must never
 * pass on), still pictures, and go2rtc's WebRTC handshake. Every handshake is
 * recorded (`GET /__calls`) so tests can check which stream Kindo asked for.
 * The answer is a valid SDP, but nothing streams: browsers then show the
 * camera as unavailable, which is what the UI tests look for.
 *
 * Serves https instead when given a certificate (`{ cert, key }`), like
 * Frigate's own self-signed one on port 8971.
 */
import { createServer as createHttp } from "node:http";
import { createServer as createHttps } from "node:https";

export const FRIGATE_USER = "kindo";
export const FRIGATE_PASSWORD = "frigate-e2e-password";
const TOKEN = "eyJhbGciOiJIUzI1NiJ9.eyJzdWIiOiJraW5kbyJ9.e2e-signature";
const STREAMS = {
  front_door: ["ffmpeg:http://10.0.0.5/flv?port=1935&app=bcs&stream=channel0_main.bcs&user=admin&password=camera-secret#video=copy#audio=copy#audio=opus"],
  front_door_twt: ["ffmpeg:http://10.0.0.5/flv?port=1935&app=bcs&stream=channel0_main.bcs&user=admin&password=camera-secret", "rtsp://admin:camera-secret@10.0.0.5/Preview_01_sub"],
  garden: ["rtsp://admin:camera-secret@10.0.0.6:554/h264Preview_01_main#backchannel=0"],
};
// A 1×1 JPEG.
const JPEG = Buffer.from("/9j/4AAQSkZJRgABAQEASABIAAD/2wBDAP//////////////////////////////////////////////////////////////////////////////////////wAALCAABAAEBAREA/8QAFAABAAAAAAAAAAAAAAAAAAAACf/EABQQAQAAAAAAAAAAAAAAAAAAAAD/2gAIAQEAAD8AKp//2Q==", "base64");

export function startFrigateMock(port = 0, tls) {
  const calls = [];
  let logins = 0;
  const body = (req) => new Promise((resolve) => {
    let b = "";
    req.on("data", (c) => (b += c));
    req.on("end", () => resolve(b));
  });
  const json = (res, v, status = 200, headers = {}) => res.writeHead(status, { "content-type": "application/json", ...headers }).end(JSON.stringify(v));

  const handler = async (req, res) => {
    const url = new URL(req.url ?? "/", "http://x");
    if (url.pathname === "/health") return res.writeHead(200).end("ok");
    if (url.pathname === "/__calls") return json(res, { calls, logins });
    if (url.pathname === "/__reset" && req.method === "POST") {
      calls.length = 0;
      logins = 0;
      return res.writeHead(200).end();
    }
    if (url.pathname === "/api/login" && req.method === "POST") {
      const b = JSON.parse((await body(req)) || "{}");
      if (b.user !== FRIGATE_USER || b.password !== FRIGATE_PASSWORD) return json(res, { message: "Login failed" }, 401);
      logins++;
      return res.writeHead(200, { "set-cookie": `frigate_token=${TOKEN}; HttpOnly; Max-Age=86400; Path=/; SameSite=lax` }).end();
    }
    if (req.headers.authorization !== `Bearer ${TOKEN}`) return res.writeHead(401).end();
    if (url.pathname === "/api/config") return json(res, { cameras: { front_door: { enabled: true }, garden: { enabled: true } }, go2rtc: { streams: STREAMS } });
    const still = url.pathname.match(/^\/api\/([A-Za-z0-9_.-]+)\/latest\.jpg$/);
    if (still) return ["front_door", "garden"].includes(still[1]) ? res.writeHead(200, { "content-type": "image/jpeg" }).end(JPEG) : res.writeHead(404).end();
    if (url.pathname === "/api/go2rtc/webrtc" && req.method === "POST") {
      const src = url.searchParams.get("src");
      if (!STREAMS[src]) return res.writeHead(404).end("stream not found");
      const offer = JSON.parse(await body(req));
      calls.push({ src, sendsAudio: /m=audio[^]*?a=(sendrecv|sendonly)/.test(offer.sdp) });
      const answer = ["v=0", "o=- 1 1 IN IP4 127.0.0.1", "s=-", "t=0 0", "a=group:BUNDLE 0 1",
        "m=video 9 UDP/TLS/RTP/SAVPF 96", "c=IN IP4 0.0.0.0", "a=mid:0", "a=sendonly", "a=rtcp-mux", "a=rtpmap:96 H264/90000",
        "a=ice-ufrag:e2eu", "a=ice-pwd:e2epasswordpasswordpassword", "a=fingerprint:sha-256 " + Array(32).fill("AB").join(":"), "a=setup:active",
        "m=audio 9 UDP/TLS/RTP/SAVPF 111", "c=IN IP4 0.0.0.0", "a=mid:1", offer.sdp.includes("a=sendrecv") ? "a=sendrecv" : "a=sendonly", "a=rtcp-mux", "a=rtpmap:111 opus/48000/2",
        "a=ice-ufrag:e2eu", "a=ice-pwd:e2epasswordpasswordpassword", "a=fingerprint:sha-256 " + Array(32).fill("AB").join(":"), "a=setup:active", ""].join("\r\n");
      return json(res, { type: "answer", sdp: answer });
    }
    res.writeHead(404).end();
  };
  const server = tls ? createHttps(tls, handler) : createHttp(handler);
  return new Promise((resolve) => server.listen(port, "127.0.0.1", () => resolve({ server, calls, url: `${tls ? "https" : "http"}://127.0.0.1:${server.address().port}` })));
}

if (import.meta.url === `file://${process.argv[1]}`) {
  await startFrigateMock(Number(process.env.FRIGATE_MOCK_PORT ?? 3196));
}
