import type { Server } from "node:http";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import type { PrismaClient } from "@prisma/client";
import * as C from "@/server/connections";
import * as M from "@/server/media/media";
import * as V from "@/server/assist";
import { syncPresenceWatchers } from "@/server/homeassistant";
import { loadSnapshot } from "@/server/snapshot";
import { seedDemo } from "@/server/demo/seed";
// @ts-expect-error: plain ESM test helper
import { ABS_KEY, ABS_MIA_KEY, JF_PASSWORD, JF_USER, startMediaMock } from "../e2e/media-mock.mjs";
// @ts-expect-error: plain ESM test helper
import { HA_TOKEN, SPEAKER, startHaMock } from "../e2e/ha-mock.mjs";
import { TEST_DB, VIEWER, resetTestDatabase } from "./db";

type Call = { domain: string; service: string; entity_id?: string; media_content_id?: string; enqueue?: string; volume_level?: number; bytes?: number; pipeline?: string };

describe.skipIf(!TEST_DB)("Listening and talking (§23, §24)", () => {
  let db: PrismaClient;
  let media: { server: Server; url: string; jellyfin: string; abs: string; progress: Record<string, { currentTime: number }>; requests: { path: string; range: string | null }[] };
  let ha: { server: Server; calls: Call[]; states: Record<string, { state: string; attributes: Record<string, unknown> }>; url: string };
  let jf = "";
  let abs = "";
  let haId = "";
  let mia = "";
  let ben = "";

  beforeAll(async () => {
    db = await resetTestDatabase();
    await db.$transaction((tx) => seedDemo(tx), { timeout: 60_000 });
    [media, ha] = await Promise.all([startMediaMock(), startHaMock()]);
    const kids = await db.member.findMany({ where: { role: "child" }, orderBy: { sortOrder: "asc" } });
    [mia, ben] = [kids[0].id, kids[1].id];
  }, 60_000);
  afterAll(async () => {
    await db?.connection.deleteMany({ where: { kind: "homeassistant" } });
    await syncPresenceWatchers(db).catch(() => {});
    media?.server.close();
    ha?.server.close();
    await db?.$disconnect();
  });

  it("signs in to Jellyfin as the children's user and keeps only its token", async () => {
    await expect(M.addJellyfin(db, { url: media.jellyfin, username: JF_USER, password: "wrong" })).rejects.toMatchObject({ code: "remote" });
    jf = await M.addJellyfin(db, { url: media.jellyfin, username: JF_USER, password: JF_PASSWORD });
    const conn = await db.connection.findUniqueOrThrow({ where: { id: jf } });
    expect(conn.secret).not.toContain(JF_PASSWORD);
    expect(conn.username).toBe("Kids");
    expect(conn.config).toMatchObject({ userId: "user-kids", shelf: [] });
    // An empty shelf is on no screen.
    expect((await loadSnapshot(db, VIEWER))?.media).toBeNull();
  });

  it("offers albums and audio playlists, never videos", async () => {
    const all = await M.browse(db, { id: jf, search: "" });
    expect(all.map((c) => [c.remoteId, c.kind])).toEqual([["alb1", "album"], ["pl1", "playlist"]]);
    expect((await M.browse(db, { id: jf, search: "sleepy" })).map((c) => c.remoteId)).toEqual(["pl1"]);
  });

  it("puts things on the shelf for everyone or some, and shows names only", async () => {
    await M.saveShelf(db, { id: jf, items: [
      { remoteId: "alb1", kind: "album", name: "Bibi", memberIds: [] },
      { remoteId: "pl1", kind: "playlist", name: "Sleepy", memberIds: [ben, "gone"] },
    ] });
    const shelf = M.shelfOf(await db.connection.findUniqueOrThrow({ where: { id: jf } }));
    expect(shelf.map((s) => s.memberIds)).toEqual([[], [ben]]);
    const snap = await loadSnapshot(db, { ...VIEWER, isAdmin: false });
    expect(snap?.media?.shelf).toEqual(shelf.map((s) => ({ id: s.id, kind: s.kind, name: s.name, memberIds: s.memberIds, source: "jellyfin" })));
    expect(JSON.stringify(snap?.media)).not.toContain("alb1");
    // Saving again keeps the ids, so a screen playing it carries on.
    await M.saveShelf(db, { id: jf, items: [{ remoteId: "pl1", kind: "playlist", name: "Sleepy", memberIds: [] }, { remoteId: "alb1", kind: "album", name: "Bibi", memberIds: [] }] });
    const again = M.shelfOf(await db.connection.findUniqueOrThrow({ where: { id: jf } }));
    expect(again.map((s) => s.id).sort()).toEqual(shelf.map((s) => s.id).sort());
  });

  it("plays only what is on the shelf, its files in order, through Kindo with the player's Range", async () => {
    const [sleepy, bibi] = M.shelfOf(await db.connection.findUniqueOrThrow({ where: { id: jf } }));
    const q = await M.queue(db, { itemId: bibi.id });
    expect(q).toMatchObject({ itemId: bibi.id, position: 0, resumable: false });
    expect(q.tracks).toEqual([{ title: "Song one", duration: 3, start: 0 }, { title: "Song two", duration: 2, start: 3 }]);
    expect((await M.queue(db, { itemId: sleepy.id })).tracks.map((t) => t.title)).toEqual(["Lullaby"]);
    const res = await M.openTrack(db, bibi.id, 1, "bytes=10-19");
    expect(res.status).toBe(206);
    expect((await res.arrayBuffer()).byteLength).toBe(10);
    expect(media.requests.at(-1)).toMatchObject({ path: expect.stringContaining("/Audio/t2/universal"), range: "bytes=10-19" });
    await expect(M.openTrack(db, bibi.id, 5, null)).rejects.toMatchObject({ code: "notFound" });
    await expect(M.queue(db, { itemId: "notonshelf1" })).rejects.toMatchObject({ code: "notFound" });
    const cover = await M.openCover(db, bibi.id);
    expect(cover.headers.get("content-type")).toBe("image/png");
  });

  it("connects Audiobookshelf, offers books only, and keeps each child's own place", async () => {
    await expect(M.addAudiobookshelf(db, { url: media.abs, apiKey: "wrong-key-0123456789" })).rejects.toMatchObject({ code: "remote" });
    abs = await M.addAudiobookshelf(db, { url: media.abs, apiKey: ABS_KEY });
    expect((await M.browse(db, { id: abs, search: "" })).map((c) => [c.remoteId, c.kind, c.detail])).toEqual([["li_dragon", "book", "Ingo Siegner"]]);
    await M.saveShelf(db, { id: abs, items: [{ remoteId: "li_dragon", kind: "album", name: "Drache", memberIds: [] }] });
    const [book] = M.shelfOf(await db.connection.findUniqueOrThrow({ where: { id: abs } }));
    expect(book.kind).toBe("book");

    await expect(M.saveAccount(db, { id: abs, memberId: mia, apiKey: "wrong-key-0123456789" })).rejects.toMatchObject({ code: "remote" });
    await M.saveAccount(db, { id: abs, memberId: mia, apiKey: ABS_MIA_KEY });
    expect(await M.listAccounts(db, { id: abs })).toEqual([{ memberId: mia, username: "mia" }]);

    const q = await M.queue(db, { itemId: book.id, memberId: mia });
    expect(q.resumable).toBe(true);
    expect(q.tracks.map((t) => t.title)).toEqual(["01 Chapter one", "02 Chapter two"]);
    expect(q.position).toBe(0);
    // Mia's place goes into Mia's account; Ben shares the family account.
    await M.saveProgress(db, { itemId: book.id, memberId: mia, position: 5 });
    await M.saveProgress(db, { itemId: book.id, memberId: ben, position: 2 });
    expect(media.progress["mia:li_dragon"]).toMatchObject({ currentTime: 5, duration: 8, isFinished: false });
    expect(media.progress["family:li_dragon"]).toMatchObject({ currentTime: 2 });
    expect((await M.queue(db, { itemId: book.id, memberId: mia })).position).toBe(5);
    expect((await M.queue(db, { itemId: book.id, memberId: ben })).position).toBe(2);
    // A finished book starts again.
    await M.saveProgress(db, { itemId: book.id, memberId: mia, position: 8 });
    expect(media.progress["mia:li_dragon"]).toMatchObject({ isFinished: true });
    expect((await M.queue(db, { itemId: book.id, memberId: mia })).position).toBe(0);
    // The second file of the book is the second audio file.
    await M.openTrack(db, book.id, 1, null).then((r) => r.arrayBuffer());
    expect(media.requests.at(-1)?.path).toContain("/api/items/li_dragon/file/f2");
    // Unlinked, Mia shares the family account again.
    await M.saveAccount(db, { id: abs, memberId: mia, apiKey: "" });
    expect(await M.listAccounts(db, { id: abs })).toEqual([]);
  });

  it("signs speaker addresses for one file, and refuses forged or stale ones", () => {
    const path = M.castPath("abcdef12", 3);
    const token = path.split("/").pop()!;
    expect(M.readCast(token)).toEqual({ itemId: "abcdef12", index: 3 });
    // Another file of the same signature, or a signature that was changed.
    expect(M.readCast(token.replace("abcdef12-3", "abcdef12-4"))).toBeNull();
    const sig = token.lastIndexOf(".") + 1;
    expect(M.readCast(`${token.slice(0, sig)}${token[sig] === "A" ? "B" : "A"}${token.slice(sig + 1)}`)).toBeNull();
    expect(M.readCast("abcdef12-3.1.x")).toBeNull();
  });

  it("plays the shelf on the admin's speakers, queued, never louder than allowed", async () => {
    haId = await C.addHomeAssistant(db, { url: ha.url, token: HA_TOKEN, entityId: "" });
    expect(await M.listSpeakerChoices(db, { id: haId })).toEqual([{ entityId: SPEAKER, name: "Kitchen speaker" }]);
    expect(M.M.speakers.safeParse({ id: haId, speakers: [{ entityId: "light.kitchen", name: "x", maxVolume: 50 }] }).success).toBe(false);
    await M.saveSpeakers(db, { id: haId, speakers: [{ entityId: SPEAKER, name: "Kitchen", maxVolume: 40 }] });
    expect((await loadSnapshot(db, VIEWER))?.media?.speakers).toEqual([{ entityId: SPEAKER, name: "Kitchen" }]);

    const bibi = M.shelfOf(await db.connection.findUniqueOrThrow({ where: { id: jf } })).find((s) => s.name === "Bibi")!;
    ha.calls.length = 0;
    expect(await M.castToSpeaker(db, { itemId: bibi.id, speaker: SPEAKER }, "http://kindo.lan:3000/")).toEqual({ queued: 2 });
    const [volume, first, second] = ha.calls;
    expect(volume).toMatchObject({ service: "volume_set", volume_level: 0.4 });
    expect(first).toMatchObject({ service: "play_media", enqueue: "replace", media_content_id: expect.stringMatching(/^http:\/\/kindo\.lan:3000\/api\/media\/cast\//) });
    expect(second).toMatchObject({ service: "play_media", enqueue: "add" });
    // The speaker fetches the file it was given, without signing in.
    const token = first.media_content_id!.split("/").pop()!;
    const res = await M.openCast(db, token, null);
    expect(res.headers.get("content-type")).toBe("audio/wav");

    await M.speakerCommand(db, { speaker: SPEAKER, command: "volume", volume: 90 });
    expect(ha.calls.at(-1)).toMatchObject({ service: "volume_set", volume_level: 0.4 });
    await M.speakerCommand(db, { speaker: SPEAKER, command: "pause" });
    expect(ha.calls.at(-1)).toMatchObject({ service: "media_pause" });
    const [state] = await M.readSpeakers(db);
    expect(state).toMatchObject({ entityId: SPEAKER, name: "Kitchen", state: "paused", volume: 40, maxVolume: 40, title: "Bibi" });
    await expect(M.speakerCommand(db, { speaker: "media_player.other", command: "play" })).rejects.toMatchObject({ code: "notFound" });
  });

  it("talks to Home Assistant: what was heard, the answer and its sound", async () => {
    expect((await loadSnapshot(db, VIEWER))?.voice).toBe(false);
    await expect(V.assist(db, new Uint8Array(6400))).rejects.toMatchObject({ code: "notFound" });
    expect(await V.voiceChoices(db, { id: haId })).toEqual({
      pipelines: [{ id: "pipe-de", name: "Zuhause", language: "de" }, { id: "pipe-en", name: "Home", language: "en" }], preferred: "pipe-de",
    });
    await V.saveVoice(db, { id: haId, on: true, pipeline: "pipe-en" });
    expect((await loadSnapshot(db, VIEWER))?.voice).toBe(true);
    ha.states["light.kitchen"].state = "off";
    const reply = await V.assist(db, new Uint8Array(32_000));
    expect(reply).toMatchObject({ heard: "Licht in der Küche an", answer: "Licht ist an", audio: { type: "audio/mpeg" } });
    expect(Buffer.from(reply.audio!.data, "base64").toString()).toBe("ID3-fake-mp3-answer");
    expect(ha.calls.at(-1)).toMatchObject({ domain: "assist", bytes: 32_000, pipeline: "pipe-en" });
    expect(ha.states["light.kitchen"].state).toBe("on");
    // Nothing said is an answer, not a failure.
    expect(await V.assist(db, new Uint8Array(1000))).toEqual({ heard: "", answer: "" });
  });

  it("changes a connection in place behind the cog, checking it first and keeping its setup", async () => {
    await expect(C.updateConnection(db, { id: jf, url: media.jellyfin, username: "someone-else" })).rejects.toMatchObject({ code: "invalid" });
    await C.updateConnection(db, { id: jf, url: `${media.jellyfin}/`, secret: JF_PASSWORD, username: JF_USER });
    const conn = await db.connection.findUniqueOrThrow({ where: { id: jf } });
    expect(conn.url).toBe(`${media.jellyfin}/`);
    expect(M.shelfOf(conn)).toHaveLength(2);

    await expect(C.updateConnection(db, { id: haId, secret: "wrong-token-0123456789" })).rejects.toMatchObject({ code: "remote" });
    await C.updateConnection(db, { id: haId, entityId: "binary_sensor.hallway_motion" });
    const h = await db.connection.findUniqueOrThrow({ where: { id: haId } });
    expect(h.config).toMatchObject({ entityId: "binary_sensor.hallway_motion", speakers: [{ entityId: SPEAKER }], voice: { on: true } });
    expect(h.name).toBe("binary_sensor.hallway_motion");

    await C.updateConnection(db, { id: abs, name: "Hörbücher" });
    expect((await db.connection.findUniqueOrThrow({ where: { id: abs } })).name).toBe("Hörbücher");
    await expect(C.updateConnection(db, { id: abs, url: "ftp://nope" })).rejects.toThrow();
  });
});
