/**
 * A stand-in Home Assistant: the REST API (states, services) and the
 * WebSocket API. One presence entity whose state tests set through
 * `POST /__state` ("on" / "off"), two lights, a plug, a lock Kindo must
 * never switch, solar, house, feed-in and grid draw power sensors
 * (`POST /__power`), and a doorbell's visitor sensor (`POST /__ring`
 * presses it: on, then off again).
 */
import { createServer } from "node:http";
import { WebSocketServer } from "ws";

export const HA_TOKEN = "e2e-home-assistant-long-lived-token";
const ENTITY = "binary_sensor.hallway_motion";
export const VISITOR = "binary_sensor.front_door_visitor";

const initial = () => ({
  [ENTITY]: { state: "off", attributes: { friendly_name: "Hallway motion", device_class: "motion" } },
  "light.kitchen": { state: "on", attributes: { friendly_name: "Kitchen light" } },
  "light.living_room": { state: "off", attributes: { friendly_name: "Living room" } },
  "switch.coffee": { state: "on", attributes: { friendly_name: "Coffee machine" } },
  [VISITOR]: { state: "off", attributes: { friendly_name: "Front door Visitor" } },
  "lock.front_door": { state: "locked", attributes: { friendly_name: "Front door" } },
  "sensor.solar_power": { state: "3.2", attributes: { friendly_name: "Inverter output", unit_of_measurement: "kW", device_class: "power" } },
  "sensor.house_power": { state: "1200", attributes: { friendly_name: "Smart meter", unit_of_measurement: "W", device_class: "power" } },
  "sensor.grid_feed_in": { state: "2000", attributes: { friendly_name: "Meter feed-in", unit_of_measurement: "W", device_class: "power" } },
  "sensor.grid_draw": { state: "0", attributes: { friendly_name: "Meter draw", unit_of_measurement: "W", device_class: "power" } },
  "sensor.outside_temperature": { state: "14", attributes: { friendly_name: "Outside", unit_of_measurement: "°C", device_class: "temperature" } },
});

export function startHaMock(port = 0) {
  const states = initial();
  /** Every service call, for the tests to check. */
  const calls = [];
  const subscribers = new Set();
  const set = (id, state) => {
    const old = states[id]?.state;
    states[id] = { ...states[id], state };
    for (const s of subscribers) s(id, state, old);
  };
  const body = (req) => new Promise((resolve) => {
    let b = "";
    req.on("data", (c) => (b += c));
    req.on("end", () => resolve(b ? JSON.parse(b) : {}));
  });
  const json = (res, v) => res.writeHead(200, { "content-type": "application/json" }).end(JSON.stringify(v));

  const server = createServer(async (req, res) => {
    const url = new URL(req.url ?? "/", "http://x");
    if (url.pathname === "/health") return res.writeHead(200).end("ok");
    if (url.pathname === "/__state" && req.method === "POST") {
      set(ENTITY, (await body(req)).state);
      return res.writeHead(200).end();
    }
    if (url.pathname === "/__power" && req.method === "POST") {
      const p = await body(req);
      if (p.solar !== undefined) set("sensor.solar_power", String(p.solar));
      if (p.house !== undefined) set("sensor.house_power", String(p.house));
      if (p.feedIn !== undefined) set("sensor.grid_feed_in", String(p.feedIn));
      if (p.draw !== undefined) set("sensor.grid_draw", String(p.draw));
      return res.writeHead(200).end();
    }
    if (url.pathname === "/__ring" && req.method === "POST") {
      set(VISITOR, "on");
      setTimeout(() => set(VISITOR, "off"), 200);
      return res.writeHead(200).end();
    }
    if (url.pathname === "/__reset" && req.method === "POST") {
      Object.assign(states, initial());
      calls.length = 0;
      return res.writeHead(200).end();
    }
    if (req.headers.authorization !== `Bearer ${HA_TOKEN}`) return res.writeHead(401).end();
    if (url.pathname === "/api/") return json(res, { message: "API running." });
    if (url.pathname === "/api/states") return json(res, Object.entries(states).map(([entity_id, s]) => ({ entity_id, ...s })));
    const one = url.pathname.match(/^\/api\/states\/(.+)$/);
    if (one) {
      const id = decodeURIComponent(one[1]);
      return states[id] ? json(res, { entity_id: id, ...states[id] }) : res.writeHead(404).end();
    }
    const service = url.pathname.match(/^\/api\/services\/([a-z_]+)\/([a-z_]+)$/);
    if (service && req.method === "POST") {
      const data = await body(req);
      calls.push({ domain: service[1], service: service[2], ...data });
      const ids = [data.entity_id].flat().filter(Boolean);
      if (ids.some((id) => !states[id])) return res.writeHead(400).end();
      for (const id of ids) {
        if (service[2] === "turn_on") set(id, "on");
        if (service[2] === "turn_off") set(id, "off");
      }
      return json(res, []);
    }
    res.writeHead(404).end();
  });

  const wss = new WebSocketServer({ server, path: "/api/websocket" });
  wss.on("connection", (ws) => {
    ws.send(JSON.stringify({ type: "auth_required" }));
    const mine = [];
    ws.on("message", (raw) => {
      const msg = JSON.parse(String(raw));
      if (msg.type === "auth") ws.send(JSON.stringify({ type: msg.access_token === HA_TOKEN ? "auth_ok" : "auth_invalid" }));
      if (msg.type === "get_states") ws.send(JSON.stringify({ id: msg.id, type: "result", success: true, result: Object.entries(states).map(([entity_id, s]) => ({ entity_id, ...s })) }));
      if (msg.type === "subscribe_trigger") {
        const watched = [msg.trigger.entity_id].flat();
        const { from, to } = msg.trigger;
        const send = (id, state, old) => watched.includes(id) && (!to || to === state) && (!from || from === old) && ws.send(JSON.stringify({ id: msg.id, type: "event", event: { variables: { trigger: { entity_id: id, to_state: { state } } } } }));
        subscribers.add(send);
        mine.push(send);
      }
    });
    ws.on("close", () => mine.forEach((s) => subscribers.delete(s)));
  });
  return new Promise((resolve) => server.listen(port, "127.0.0.1", () => resolve({ server, calls, states, url: `http://127.0.0.1:${server.address().port}` })));
}

if (import.meta.url === `file://${process.argv[1]}`) {
  await startHaMock(Number(process.env.HA_MOCK_PORT ?? 3197));
}
