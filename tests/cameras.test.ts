import { execFileSync } from "node:child_process";
import { mkdtempSync, readFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { createServer, type Server } from "node:http";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import type { PrismaClient } from "@prisma/client";
import type { Actor } from "@/server/actor";
import * as C from "@/server/connections";
import * as K from "@/server/cameras";
import { activeRing, ringFor } from "@/server/doorbell";
import { syncPresenceWatchers } from "@/server/homeassistant";
import { loadSnapshot } from "@/server/snapshot";
import { seedDemo } from "@/server/demo/seed";
import { RING_MS, TALK_LEASE_MS } from "@/lib/cameras";
// @ts-expect-error: plain ESM test helper
import { FRIGATE_PASSWORD, FRIGATE_USER, startFrigateMock } from "../e2e/frigate-mock.mjs";
// @ts-expect-error: plain ESM test helper
import { HA_TOKEN, VISITOR, startHaMock } from "../e2e/ha-mock.mjs";
import { TEST_DB, VIEWER, resetTestDatabase } from "./db";

type Mock = { server: Server; url: string; calls: { src: string; sendsAudio: boolean }[] };

const ADULT: Actor = { kind: "user", userId: "u-anna", memberId: "anna", role: "admin", name: "Anna" };
const OTHER_ADULT: Actor = { kind: "user", userId: "u-ben", memberId: "ben", role: "adult", name: "Ben" };
const WALL: Actor = { kind: "device", deviceId: "d-kitchen", name: "Kitchen", elevated: false };
const SCREEN = "screen-aaaaaaaa";

const offer = (audio: "recvonly" | "sendrecv") =>
  ["v=0", "o=- 1 2 IN IP4 127.0.0.1", "s=-", "t=0 0", "m=video 9 UDP/TLS/RTP/SAVPF 96", "a=recvonly", "m=audio 9 UDP/TLS/RTP/SAVPF 111", `a=${audio}`, ""].join("\r\n");

/** A throwaway self-signed certificate, like Frigate's own on port 8971. */
function selfSigned(): { cert: Buffer; key: Buffer } | null {
  try {
    const dir = mkdtempSync(join(tmpdir(), "kindo-cert-"));
    execFileSync("openssl", ["req", "-x509", "-newkey", "rsa:2048", "-nodes", "-days", "1", "-subj", "/CN=frigate", "-keyout", join(dir, "k.pem"), "-out", join(dir, "c.pem")], { stdio: "ignore" });
    return { cert: readFileSync(join(dir, "c.pem")), key: readFileSync(join(dir, "k.pem")) };
  } catch {
    return null;
  }
}

describe.skipIf(!TEST_DB)("Cameras and the doorbell (§22)", () => {
  let db: PrismaClient;
  let frigate: Mock;
  let ha: { server: Server; url: string };
  let id = "";

  beforeAll(async () => {
    db = await resetTestDatabase();
    await db.$transaction((tx) => seedDemo(tx), { timeout: 60_000 });
    frigate = await startFrigateMock();
    ha = await startHaMock();
    await C.addHomeAssistant(db, { url: ha.url, token: HA_TOKEN, entityId: "" });
  }, 60_000);
  afterAll(async () => {
    await db?.connection.deleteMany({ where: { kind: { in: ["homeassistant", "frigate"] } } });
    await syncPresenceWatchers(db).catch(() => {});
    frigate?.server.close();
    ha?.server.close();
    await db?.$disconnect();
  });

  it("connects Frigate with a Frigate user, and refuses a wrong password", async () => {
    await expect(K.addFrigate(db, { url: frigate.url, username: FRIGATE_USER, password: "wrong", trustCertificate: false })).rejects.toMatchObject({ code: "remote" });
    id = await K.addFrigate(db, { url: frigate.url, username: FRIGATE_USER, password: FRIGATE_PASSWORD, trustCertificate: false });
    const snap = await loadSnapshot(db, VIEWER);
    expect(snap?.cameras).toEqual([]);
    expect(snap?.integrations.find((i) => i.id === "frigate")?.status).toBe("connected");
  });

  it("says why Frigate can't be reached: a name that doesn't resolve, a sign-in proxy in the way", async () => {
    const add = (url: string) => K.addFrigate(db, { url, username: FRIGATE_USER, password: FRIGATE_PASSWORD, trustCertificate: false });
    await expect(add("http://frigate.kindo-test.invalid:8971")).rejects.toThrow(/can't resolve frigate\.kindo-test\.invalid/);
    const proxy = createServer((_req, res) => res.writeHead(302, { location: "https://auth.example.home/outpost/start" }).end());
    await new Promise<void>((r) => proxy.listen(0, "127.0.0.1", r));
    try {
      await expect(add(`http://127.0.0.1:${(proxy.address() as { port: number }).port}`)).rejects.toThrow(/redirects \(HTTP 302 to auth\.example\.home\)/);
    } finally {
      proxy.close();
    }
  });

  it("offers Frigate's cameras and streams by name, and Home Assistant's doorbell sensor first", async () => {
    const c = await K.listChoices(db, { id });
    expect(c.cameras).toEqual(["front_door", "garden"]);
    expect(c.streams).toEqual(["front_door", "front_door_twt", "garden"]);
    expect(c.visitors[0]).toEqual({ entityId: VISITOR, name: "Front door Visitor" });
    expect(JSON.stringify(c)).not.toContain("camera-secret");
  });

  it("tells screens names only: never the address, the login or a stream", async () => {
    await K.saveSetup(db, {
      id, cameras: [
        { id: "door", name: "Front door", camera: "front_door", stream: "front_door", talkStream: "front_door_twt", visitorEntity: VISITOR },
        { id: "garden", name: "Garden", camera: "garden", stream: "garden" },
      ],
    });
    const wall = await loadSnapshot(db, { kind: "device", name: "Kitchen", canManage: false, isAdmin: false, pinSet: false });
    expect(wall?.cameras).toEqual([
      { id: "door", name: "Front door", snapshot: true, talk: true, doorbell: true },
      { id: "garden", name: "Garden", snapshot: true, talk: false, doorbell: false },
    ]);
    expect(wall?.connections).toEqual([]);
    const text = JSON.stringify(wall);
    for (const secret of [FRIGATE_PASSWORD, frigate.url, "front_door_twt", "camera-secret"]) expect(text).not.toContain(secret);
    // Admins see the setup, never the password.
    expect(JSON.stringify(await loadSnapshot(db, VIEWER))).not.toContain(FRIGATE_PASSWORD);
  });

  it("serves still pictures through Kindo", async () => {
    const img = await K.cameraSnapshot(db, "door", 480);
    expect(img.type).toBe("image/jpeg");
    expect(img.body.length).toBeGreaterThan(10);
    await expect(K.cameraSnapshot(db, "nope", 480)).rejects.toMatchObject({ code: "notFound" });
  });

  it("lets every screen watch the camera's own stream, receiving only", async () => {
    frigate.calls.length = 0;
    const answer = await K.answerOffer(db, { cameraId: "door", offer: offer("recvonly"), talk: false }, WALL);
    expect(answer.startsWith("v=0")).toBe(true);
    expect(frigate.calls).toEqual([{ src: "front_door", sendsAudio: false }]);
    // A microphone in a watching offer is refused before it reaches go2rtc.
    await expect(K.answerOffer(db, { cameraId: "door", offer: offer("sendrecv"), talk: false }, WALL)).rejects.toMatchObject({ code: "invalid" });
    expect(frigate.calls).toHaveLength(1);
  });

  it("lets only adults, or a wall with the PIN, talk, and only while they hold the camera", async () => {
    const talk = { cameraId: "door", offer: offer("sendrecv"), talk: true, screen: SCREEN };
    await expect(K.answerOffer(db, talk, WALL)).rejects.toMatchObject({ code: "pin" });
    await expect(K.answerOffer(db, talk, ADULT)).rejects.toMatchObject({ code: "busy" });
    await expect(K.takeTalk(db, { cameraId: "garden", screen: SCREEN }, ADULT)).rejects.toMatchObject({ code: "invalid" });

    await K.takeTalk(db, { cameraId: "door", screen: SCREEN }, ADULT);
    frigate.calls.length = 0;
    await K.answerOffer(db, talk, ADULT);
    expect(frigate.calls).toEqual([{ src: "front_door_twt", sendsAudio: true }]);
    // The same person on another screen holds nothing.
    await expect(K.answerOffer(db, { ...talk, screen: "screen-bbbbbbbb" }, ADULT)).rejects.toMatchObject({ code: "busy" });
  });

  it("allows one speaker per camera; a lease that runs out frees it", async () => {
    await expect(K.takeTalk(db, { cameraId: "door", screen: "screen-cccccccc" }, OTHER_ADULT)).rejects.toMatchObject({ code: "busy" });
    // The holder renews.
    await K.takeTalk(db, { cameraId: "door", screen: SCREEN }, ADULT);
    // A screen that crashed mid-talk: after the lease, someone else may.
    const later = new Date(Date.now() + TALK_LEASE_MS + 1000);
    await K.takeTalk(db, { cameraId: "door", screen: "screen-cccccccc" }, OTHER_ADULT, later);
    await expect(K.takeTalk(db, { cameraId: "door", screen: SCREEN }, ADULT, later)).rejects.toMatchObject({ code: "busy" });
    // Giving it back frees it at once.
    await K.releaseTalk(db, { cameraId: "door", screen: "screen-cccccccc" }, OTHER_ADULT);
    await K.takeTalk(db, { cameraId: "door", screen: SCREEN }, ADULT, later);
    await K.releaseTalk(db, { cameraId: "door", screen: SCREEN }, ADULT);
  });

  it("rings once per press, and a ring ends after a minute", async () => {
    const now = new Date("2026-10-08T10:00:00Z");
    expect(await ringFor(db, VISITOR, now)).toEqual(["door"]);
    // The button bounces, Home Assistant reconnects: still one ring.
    expect(await ringFor(db, VISITOR, new Date(now.getTime() + 3000))).toEqual([]);
    expect(await ringFor(db, "binary_sensor.other", now)).toEqual([]);
    expect(await activeRing(db, new Date(now.getTime() + 10_000))).toMatchObject({ cameraId: "door" });
    expect(await activeRing(db, new Date(now.getTime() + RING_MS + 1))).toBeNull();
  });

  it("rings when Home Assistant's visitor sensor goes from off to on", async () => {
    await db.doorbellRing.deleteMany();
    await syncPresenceWatchers(db);
    // Give the watcher a moment to sign in and subscribe.
    await new Promise((r) => setTimeout(r, 500));
    expect(await activeRing(db)).toBeNull();
    await fetch(`${ha.url}/__ring`, { method: "POST" });
    let ring = null;
    for (let i = 0; i < 40 && !ring; i++) {
      await new Promise((r) => setTimeout(r, 100));
      ring = await activeRing(db);
    }
    expect(ring).toMatchObject({ cameraId: "door" });
  });

  it("keeps the cameras when Frigate is connected again", async () => {
    id = await K.addFrigate(db, { url: frigate.url, username: FRIGATE_USER, password: FRIGATE_PASSWORD, trustCertificate: false });
    expect((await loadSnapshot(db, VIEWER))?.cameras.map((c) => c.id)).toEqual(["door", "garden"]);
  });

  const cert = selfSigned();
  it.skipIf(!cert)("trusts Frigate's self-signed certificate only when asked, and only that one", async () => {
    const https = await startFrigateMock(0, cert!) as Mock;
    try {
      await expect(K.addFrigate(db, { url: https.url, username: FRIGATE_USER, password: FRIGATE_PASSWORD, trustCertificate: false }))
        .rejects.toThrow(/certificate isn't trusted/);
      const httpsId = await K.addFrigate(db, { url: https.url, username: FRIGATE_USER, password: FRIGATE_PASSWORD, trustCertificate: true });
      const conn = await db.connection.findUniqueOrThrow({ where: { id: httpsId } });
      expect((conn.config as { fingerprint?: string }).fingerprint).toMatch(/^([0-9A-F]{2}:){31}[0-9A-F]{2}$/);
      expect((await K.cameraSnapshot(db, "door", 240)).type).toBe("image/jpeg");

      // Another server with another certificate at the same address: refused before anything is sent.
      const port = new URL(https.url).port;
      await new Promise((r) => https.server.close(r));
      const impostor = await startFrigateMock(Number(port), selfSigned()!) as Mock;
      try {
        await expect(K.cameraSnapshot(db, "garden", 240)).rejects.toThrow(/certificate changed/);
      } finally {
        impostor.server.close();
      }
    } finally {
      https.server.close();
    }
  });
});
