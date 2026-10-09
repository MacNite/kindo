import { describe, expect, it } from "vitest";
import { DESIGNS, fixedScheme, isDark, isDesign } from "./designs";

describe("design styles", () => {
  it("offers Kindo's own look and four others", () => {
    expect(DESIGNS).toEqual(["warm", "minimal", "glass", "brutal", "future"]);
    expect(isDesign("glass")).toBe(true);
    expect(isDesign("neon")).toBe(false);
    expect(isDesign(undefined)).toBe(false);
  });

  it("follows the device's scheme in Warm and Minimal", () => {
    for (const d of ["warm", "minimal"] as const) {
      expect(fixedScheme(d)).toBeUndefined();
      expect(isDark("light", d, true)).toBe(false);
      expect(isDark("dark", d, false)).toBe(true);
      expect(isDark("system", d, true)).toBe(true);
      expect(isDark("system", d, false)).toBe(false);
    }
  });

  it("fixes the scheme for glass, neo-brutal (light) and futuristic (dark)", () => {
    expect(isDark("dark", "glass", true)).toBe(false);
    expect(isDark("dark", "brutal", true)).toBe(false);
    expect(isDark("light", "future", false)).toBe(true);
  });
});
