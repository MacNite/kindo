import { describe, expect, it } from "vitest";
import { photoFit } from "./photoFit";

const screen = { width: 1920, height: 1080 };

describe("photoFit", () => {
  it("fills the screen when little is cut away", () => {
    expect(photoFit({ width: 3840, height: 2160 }, screen)).toBe("cover");
    expect(photoFit({ width: 1440, height: 960 }, screen)).toBe("cover"); // 3:2 loses 16 %
  });
  it("shows the whole photo when filling would crop too much", () => {
    expect(photoFit({ width: 1080, height: 1440 }, screen)).toBe("contain"); // portrait
    expect(photoFit({ width: 1440, height: 1080 }, screen)).toBe("contain"); // 4:3 loses a quarter
    expect(photoFit({ width: 6000, height: 1000 }, screen)).toBe("contain"); // panorama
    expect(photoFit({ width: 1920, height: 1080 }, { width: 1080, height: 1920 })).toBe("contain"); // turned screen
  });
  it("falls back to filling without sizes", () => {
    expect(photoFit({ width: 0, height: 0 }, screen)).toBe("cover");
    expect(photoFit({ width: 100, height: 100 }, { width: 0, height: 0 })).toBe("cover");
  });
});
