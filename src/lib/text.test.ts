import { describe, expect, it } from "vitest";
import { editText, isBlankText } from "./text";

describe("editText (§14)", () => {
  it("replaces only the language being edited and keeps the other", () => {
    expect(editText({ de: "Wocheneinkauf", en: "Weekly shop" }, "de", "Großeinkauf")).toEqual({ de: "Großeinkauf", en: "Weekly shop" });
    expect(editText({ de: "Wocheneinkauf", en: "Weekly shop" }, "en", "Big shop")).toEqual({ de: "Wocheneinkauf", en: "Big shop" });
  });

  it("keeps a plain label plain", () => {
    expect(editText("Lego", "de", "Lego Duplo")).toBe("Lego Duplo");
    expect(editText(undefined, "en", "New")).toBe("New");
  });

  it("knows when a label is empty in both languages", () => {
    expect(isBlankText("  ")).toBe(true);
    expect(isBlankText({ de: "", en: " " })).toBe(true);
    expect(isBlankText({ de: "Nudeln", en: "" })).toBe(false);
    expect(isBlankText(undefined)).toBe(true);
  });
});
