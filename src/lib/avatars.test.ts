import { describe, expect, it } from "vitest";
import { AVATAR_EMOJI, CHEER_COUNT, MOTIONS, celebrationFor } from "./avatars";
import type { Member } from "./types";

const paul = { id: "paul", avatar: { kind: "emoji", value: "🦖" } } satisfies Pick<Member, "id" | "avatar">;
const lena = { id: "lena", avatar: { kind: "emoji", value: "🐴" } } satisfies Pick<Member, "id" | "avatar">;

describe("celebrationFor", () => {
  it("gives the same child, day and period the same animation and cheer", () => {
    expect(celebrationFor(paul, "2026-10-10", "morning")).toEqual(celebrationFor(paul, "2026-10-10", "morning"));
  });

  it("never repeats yesterday's animation or cheer", () => {
    for (let d = 1; d < 28; d++) {
      const day = `2026-02-${String(d + 1).padStart(2, "0")}`;
      const before = `2026-02-${String(d).padStart(2, "0")}`;
      for (const period of ["morning", "afternoon", "evening"] as const) {
        const a = celebrationFor(paul, before, period);
        const b = celebrationFor(paul, day, period);
        expect(b.motion).not.toBe(a.motion);
        expect(b.cheer).not.toBe(a.cheer);
      }
    }
  });

  it("plays each of an avatar's three animations and every cheer over a week", () => {
    const week = Array.from({ length: 7 }, (_, i) => celebrationFor(paul, `2026-03-0${i + 1}`, "evening"));
    expect(new Set(week.map((c) => c.motion))).toEqual(new Set(["stomp", "roar", "hatch"]));
    expect(new Set(week.map((c) => c.cheer)).size).toBe(CHEER_COUNT);
    for (const c of week) expect(c.cheer).toBeGreaterThanOrEqual(1);
  });

  it("moves the whole animal where the avatar is only its head", () => {
    const c = celebrationFor(lena, "2026-10-10", "morning");
    expect(c).toMatchObject({ figure: "🐎", body: true });
    expect(["gallop", "rear", "jump"]).toContain(c.motion);
    expect(celebrationFor(paul, "2026-10-10", "morning")).toMatchObject({ figure: "🦖", body: false });
  });

  it("ignores an emoji's variation selector", () => {
    const star = { id: "x", avatar: { kind: "emoji", value: "🐴️" } } satisfies Pick<Member, "id" | "avatar">;
    expect(celebrationFor(star, "2026-10-10", "morning").figure).toBe("🐎");
  });

  it("falls back to hop, spin and wiggle for photos, initials and other emoji", () => {
    const fallback = ["hop", "spin", "wiggle"];
    for (const avatar of [{ kind: "photo", url: "/p.jpg" }, { kind: "initial" }, { kind: "emoji", value: "🍕" }] as const) {
      const c = celebrationFor({ id: "anna", avatar }, "2026-10-10", "afternoon");
      expect(fallback).toContain(c.motion);
      expect(c.body).toBe(false);
    }
    expect(celebrationFor({ id: "anna", avatar: { kind: "photo", url: "/p.jpg" } }, "2026-10-10", "afternoon").figure).toBeNull();
  });

  it("only uses motions the stylesheet knows", () => {
    for (const value of AVATAR_EMOJI) {
      for (let d = 1; d <= 3; d++) {
        expect(MOTIONS).toContain(celebrationFor({ id: "k", avatar: { kind: "emoji", value } }, `2026-01-0${d}`, "morning").motion);
      }
    }
  });
});
