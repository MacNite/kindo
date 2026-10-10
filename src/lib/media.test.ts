import { describe, expect, it } from "vitest";
import { clampVolume, resumeAt, shelfFor, speakerStateOf, startNeedsPin, toPcm16, totalOf, trackAt, withStarts } from "./media";

describe("the kids' shelf (§23)", () => {
  const shelf = [{ id: "a", memberIds: [] }, { id: "b", memberIds: ["mia"] }, { id: "c", memberIds: ["ben", "mia"] }];
  it("shows a child what is for everyone and what is for them", () => {
    expect(shelfFor(shelf, "ben").map((s) => s.id)).toEqual(["a", "c"]);
    expect(shelfFor(shelf, "mia").map((s) => s.id)).toEqual(["a", "b", "c"]);
  });
  it("shows everything without a child", () => {
    expect(shelfFor(shelf, null)).toHaveLength(3);
  });
});

describe("places in an item", () => {
  const tracks = withStarts([{ title: "1", duration: 60 }, { title: "2", duration: 30 }, { title: "3", duration: Number.NaN }, { title: "4", duration: 10 }]);
  it("lines the files up, counting a file without a length as none", () => {
    expect(tracks.map((t) => [t.start, t.duration])).toEqual([[0, 60], [60, 30], [90, 0], [90, 10]]);
    expect(totalOf(tracks)).toBe(100);
  });
  it("finds the file and the offset of a place", () => {
    expect(trackAt(tracks, 0)).toEqual({ index: 0, offset: 0 });
    expect(trackAt(tracks, 75)).toEqual({ index: 1, offset: 15 });
    expect(trackAt(tracks, 95)).toEqual({ index: 3, offset: 5 });
    expect(trackAt(tracks, 500)).toEqual({ index: 3, offset: 10 });
    expect(trackAt(tracks, -3)).toEqual({ index: 0, offset: 0 });
    expect(trackAt([], 10)).toEqual({ index: 0, offset: 0 });
  });
  it("starts a finished audiobook again", () => {
    expect(resumeAt(50, 100)).toBe(50);
    expect(resumeAt(99, 100)).toBe(0);
    expect(resumeAt(3590, 3600)).toBe(0);
    expect(resumeAt(3500, 3600)).toBe(3500);
    expect(resumeAt(-1, 100)).toBe(0);
  });
});

describe("starting with the PIN (D64)", () => {
  it("guards nothing, the speakers, or everything", () => {
    expect([startNeedsPin("off", "screen"), startNeedsPin("off", "speaker")]).toEqual([false, false]);
    expect([startNeedsPin("speakers", "screen"), startNeedsPin("speakers", "speaker")]).toEqual([false, true]);
    expect([startNeedsPin("all", "screen"), startNeedsPin("all", "speaker")]).toEqual([true, true]);
  });
});

describe("speakers", () => {
  it("never goes louder than the admin allows", () => {
    expect(clampVolume(90, 60)).toBe(60);
    expect(clampVolume(-5, 60)).toBe(0);
    expect(clampVolume(42.4, 100)).toBe(42);
  });
  it("puts Home Assistant's states in Kindo's words", () => {
    expect(["playing", "buffering", "on", "standby", "unknown", undefined].map(speakerStateOf)).toEqual(["playing", "playing", "idle", "idle", "unavailable", "unavailable"]);
  });
});

describe("toPcm16 (§24)", () => {
  it("brings 48 kHz down to 16 kHz, averaging, and to 16-bit", () => {
    const input = new Float32Array([0, 0.5, 1, 1, 1, 1, -1, -1, -1]);
    expect([...toPcm16(input, 48_000)]).toEqual([Math.round(0.5 * 0x7fff), 0x7fff, -0x8000]);
  });
  it("clips what is too loud and copes with nothing", () => {
    expect([...toPcm16(new Float32Array([2, -2]), 16_000)]).toEqual([0x7fff, -0x8000]);
    expect(toPcm16(new Float32Array(0), 48_000)).toHaveLength(0);
  });
});
