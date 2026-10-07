import { describe, expect, it } from "vitest";
import { upcoming } from "./calendar";
import { at, sameDay } from "../dates";
import { TODAY } from "../data/anchor";

describe("upcoming", () => {
  it("skips today's events before applying the limit", () => {
    const items = upcoming(at(TODAY, 9), 14, 6, { afterToday: true });
    expect(items).toHaveLength(6);
    expect(items.some((e) => sameDay(e.start, TODAY))).toBe(false);
    expect(items.every((e) => e.start > TODAY)).toBe(true);
  });
});
