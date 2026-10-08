import type { Server } from "node:http";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import type { PrismaClient } from "@prisma/client";
import * as C from "@/server/connections";
import * as H from "@/server/home";
import { syncPresenceWatchers } from "@/server/homeassistant";
import { loadSnapshot } from "@/server/snapshot";
import { seedDemo } from "@/server/demo/seed";
// @ts-expect-error: plain ESM test helper
import { HA_TOKEN, startHaMock } from "../e2e/ha-mock.mjs";
import { TEST_DB, VIEWER, resetTestDatabase } from "./db";

type Call = { service: string; entity_id: string[] };

describe.skipIf(!TEST_DB)("Home control (§21)", () => {
  let db: PrismaClient;
  let mock: { server: Server; calls: Call[]; states: Record<string, { state: string }>; url: string };
  let id = "";

  beforeAll(async () => {
    db = await resetTestDatabase();
    await db.$transaction((tx) => seedDemo(tx), { timeout: 60_000 });
    mock = await startHaMock();
  }, 60_000);
  afterAll(async () => {
    await db?.connection.deleteMany({ where: { kind: "homeassistant" } });
    await syncPresenceWatchers(db).catch(() => {});
    mock?.server.close();
    await db?.$disconnect();
  });

  it("connects without a presence sensor, and isn't on any screen until something is picked", async () => {
    await expect(C.addHomeAssistant(db, { url: mock.url, token: "wrong-token-0123456789", entityId: "" })).rejects.toMatchObject({ code: "remote" });
    id = await C.addHomeAssistant(db, { url: mock.url, token: HA_TOKEN, entityId: "" });
    expect(await H.readHome(db)).toBeNull();
    expect((await loadSnapshot(db, VIEWER))?.home).toBeNull();
  });

  it("offers lights and switches, and only power sensors for solar", async () => {
    const c = await H.listChoices(db, { id });
    expect(c.switches.map((s) => s.entityId)).toEqual(["switch.coffee", "light.kitchen", "light.living_room"]);
    expect(c.sensors.map((s) => s.entityId)).toEqual(["sensor.solar_power", "sensor.house_power"]);
  });

  it("refuses to save anything but lights, switches, fans and helpers", async () => {
    expect(H.H.setup.safeParse({ id, controls: [{ entityId: "lock.front_door", name: "Door" }], energy: null }).success).toBe(false);
  });

  it("reads the switches and the solar flow in watts, the grid worked out", async () => {
    await H.saveSetup(db, {
      id, controls: [{ entityId: "light.kitchen", name: "Kitchen" }, { entityId: "switch.coffee", name: "Coffee" }],
      energy: { solar: "sensor.solar_power", house: "sensor.house_power" },
    });
    const snap = await loadSnapshot(db, { ...VIEWER, isAdmin: false });
    expect(snap?.home).toEqual({ controls: [{ entityId: "light.kitchen", name: "Kitchen" }, { entityId: "switch.coffee", name: "Coffee" }], energy: true });
    const s = await H.readHome(db, Date.now() + 10_000);
    expect(s?.switches.map((x) => [x.name, x.on, x.available])).toEqual([["Kitchen", true, true], ["Coffee", true, true]]);
    expect(s?.energy).toEqual({ solar: 3200, house: 1200, grid: -2000 });
    expect(s?.reachable).toBe(true);
  });

  it("switches only what the admin picked", async () => {
    await H.setSwitch(db, { entityId: "light.kitchen", on: false });
    expect(mock.states["light.kitchen"].state).toBe("off");
    await expect(H.setSwitch(db, { entityId: "light.living_room", on: true })).rejects.toMatchObject({ code: "notFound" });
    expect(mock.states["light.living_room"].state).toBe("off");
  });

  it("turns everything off in one call, and nothing else", async () => {
    mock.calls.length = 0;
    await H.allOff(db);
    expect(mock.calls).toEqual([{ domain: "homeassistant", service: "turn_off", entity_id: ["light.kitchen", "switch.coffee"] }]);
    expect(mock.states["switch.coffee"].state).toBe("off");
  });

  it("keeps the switches when Home Assistant is connected again", async () => {
    await C.addHomeAssistant(db, { url: mock.url, token: HA_TOKEN, entityId: "binary_sensor.hallway_motion" });
    expect((await loadSnapshot(db, VIEWER))?.home?.controls).toHaveLength(2);
  });
});
