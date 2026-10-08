import { describe, expect, it, vi } from "vitest";
import { UserError } from "@/server/errors";

vi.mock("@/server/db", () => ({ prisma: {} }));
vi.mock("@/server/actor", () => ({ getActor: async () => ({ kind: "device", deviceId: "d", name: "Kitchen", elevated: false }) }));
vi.mock("@/server/photos/sync", () => ({
  getPhoto: async (_db: unknown, assetId: string) => {
    if (assetId === "gone") throw new UserError("notFound", "asset gone");
    throw new UserError("remote", "photos.lan:2283: fetch failed (ECONNREFUSED)");
  },
}));

const { GET } = await import("@/app/api/photos/[assetId]/route");

describe("the photo proxy (§13, §17)", () => {
  it("tells a screen only that a photo failed, never where Immich lives", async () => {
    const error = vi.spyOn(console, "error").mockImplementation(() => {});
    const res = await GET(new Request("http://kindo.test/api/photos/x"), { params: Promise.resolve({ assetId: "x" }) });
    expect(res.status).toBe(502);
    expect(await res.text()).toBe("remote");
    // The detail goes to the log instead.
    expect(error).toHaveBeenCalledWith(expect.stringContaining("photos.lan:2283"));
    const gone = await GET(new Request("http://kindo.test/api/photos/gone"), { params: Promise.resolve({ assetId: "gone" }) });
    expect([gone.status, await gone.text()]).toEqual([404, "notFound"]);
    error.mockRestore();
  });
});
