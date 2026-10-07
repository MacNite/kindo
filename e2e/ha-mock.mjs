/**
 * A stand-in Home Assistant for the presence test: the REST state endpoint
 * and the WebSocket API, with one entity whose state the test sets through
 * `POST /__state` ("on" / "off").
 */
import { createServer } from "node:http";
import { WebSocketServer } from "ws";

const port = Number(process.env.HA_MOCK_PORT ?? 3197);
const TOKEN = "e2e-home-assistant-long-lived-token";
const ENTITY = "binary_sensor.hallway_motion";
let state = "off";
const subscribers = new Set();

const server = createServer((req, res) => {
  const url = new URL(req.url ?? "/", "http://x");
  if (url.pathname === "/health") return res.writeHead(200).end("ok");
  if (url.pathname === "/__state" && req.method === "POST") {
    let body = "";
    req.on("data", (c) => (body += c));
    req.on("end", () => {
      state = JSON.parse(body).state;
      for (const send of subscribers) send(state);
      res.writeHead(200).end();
    });
    return;
  }
  if (req.headers.authorization !== `Bearer ${TOKEN}`) return res.writeHead(401).end();
  if (url.pathname === `/api/states/${ENTITY}`) return res.writeHead(200, { "content-type": "application/json" }).end(JSON.stringify({ entity_id: ENTITY, state }));
  res.writeHead(404).end();
});

const wss = new WebSocketServer({ server, path: "/api/websocket" });
wss.on("connection", (ws) => {
  ws.send(JSON.stringify({ type: "auth_required" }));
  let send;
  ws.on("message", (raw) => {
    const msg = JSON.parse(String(raw));
    if (msg.type === "auth") ws.send(JSON.stringify({ type: msg.access_token === TOKEN ? "auth_ok" : "auth_invalid" }));
    if (msg.type === "get_states") ws.send(JSON.stringify({ id: msg.id, type: "result", success: true, result: [{ entity_id: ENTITY, state }] }));
    if (msg.type === "subscribe_trigger") {
      send = (s) => ws.send(JSON.stringify({ id: msg.id, type: "event", event: { variables: { trigger: { to_state: { state: s } } } } }));
      subscribers.add(send);
    }
  });
  ws.on("close", () => subscribers.delete(send));
});
server.listen(port, "127.0.0.1");
