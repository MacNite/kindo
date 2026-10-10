import { describe, expect, it, vi } from "vitest";
import { UserError } from "@/server/errors";

const actor = vi.hoisted(() => ({ current: { kind: "device", deviceId: "d", name: "Kitchen", elevated: false } as Record<string, unknown> | null }));
vi.mock("@/server/db", () => ({ prisma: {} }));
vi.mock("@/server/actor", async (orig) => ({ ...(await orig<typeof import("@/server/actor")>()), getActor: async () => actor.current }));
vi.mock("@/server/media/media", () => ({
  openTrack: async (_db: unknown, itemId: string) => {
    if (itemId === "goneitem") throw new UserError("notFound", "shelf item not found");
    if (itemId === "okayitem") return new Response("abc", { status: 206, headers: { "content-type": "audio/wav", "content-range": "bytes 0-2/9", server: "Jellyfin", "x-emby-authorization": "secret" } });
    throw new UserError("remote", "jellyfin.lan:8096: fetch failed (ECONNREFUSED)");
  },
}));
vi.mock("@/server/assist", () => ({ assist: async () => ({ heard: "hi", answer: "hello" }) }));

const { GET } = await import("@/app/api/media/[itemId]/[track]/route");
const { POST } = await import("@/app/api/assist/route");
const track = (itemId: string, t = "0") => GET(new Request(`http://kindo.test/api/media/${itemId}/${t}`), { params: Promise.resolve({ itemId, track: t }) });

describe("the media proxy (§23, §17)", () => {
  it("passes the sound on with only what a player needs", async () => {
    const res = await track("okayitem");
    expect(res.status).toBe(206);
    expect(res.headers.get("content-range")).toBe("bytes 0-2/9");
    expect(res.headers.get("server")).toBeNull();
    expect(res.headers.get("x-emby-authorization")).toBeNull();
    expect(await res.text()).toBe("abc");
  });
  it("tells a screen only that it failed, never where the server lives", async () => {
    const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
    const error = vi.spyOn(console, "error").mockImplementation(() => {});
    const res = await track("downitem");
    expect([res.status, await res.text()]).toEqual([502, "remote"]);
    const gone = await track("goneitem");
    expect([gone.status, await gone.text()]).toEqual([404, "notFound"]);
    warn.mockRestore();
    error.mockRestore();
  });
  it("refuses odd ids and strangers", async () => {
    expect((await track("../etc", "0")).status).toBe(400);
    expect((await track("okayitem", "-1")).status).toBe(400);
    actor.current = null;
    expect((await track("okayitem")).status).toBe(401);
    actor.current = { kind: "device", deviceId: "d", name: "Kitchen", elevated: false };
  });
});

describe("talking (§24)", () => {
  const say = (bytes = 6400) => POST(new Request("http://kindo.test/api/assist", { method: "POST", headers: { "content-type": "application/octet-stream" }, body: new Uint8Array(bytes) }));
  it("asks a locked wall for the PIN and lets an unlocked one talk", async () => {
    actor.current = { kind: "device", deviceId: "d", name: "Kitchen", elevated: false };
    expect(await (await say()).json()).toEqual({ error: "pin" });
    actor.current = { kind: "device", deviceId: "d", name: "Kitchen", elevated: true };
    expect(await (await say()).json()).toEqual({ heard: "hi", answer: "hello" });
  });
  it("is not for children, and takes only a short recording", async () => {
    actor.current = { kind: "user", userId: "u", memberId: "m", role: "child", name: "Mia" };
    expect((await say()).status).toBe(403);
    actor.current = { kind: "user", userId: "u2", memberId: "m2", role: "adult", name: "Anna" };
    expect((await say(100)).status).toBe(400);
    expect((await say(1_000_000)).status).toBe(413);
  });
});
