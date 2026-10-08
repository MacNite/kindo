import { describe, expect, it } from "vitest";
import { EMOJI_CHOICES, PICTOGRAMS, PICTO_CATEGORIES, getPictogram } from "./pictograms";

describe("pictograms", () => {
  it("has unique ids and every category in use", () => {
    expect(new Set(PICTOGRAMS.map((p) => p.id)).size).toBe(PICTOGRAMS.length);
    for (const c of PICTO_CATEGORIES) expect(PICTOGRAMS.some((p) => p.category === c)).toBe(true);
    expect(PICTOGRAMS.every((p) => PICTO_CATEGORIES.includes(p.category) && typeof p.label === "object" && p.label.en && p.label.de)).toBe(true);
    expect(new Set(EMOJI_CHOICES).size).toBe(EMOJI_CHOICES.length);
  });

  it("keeps the ids of pictures that moved to personal care (D43)", () => {
    for (const id of ["toothbrush", "hair", "bath", "wash"]) expect(getPictogram(id)?.category).toBe("care");
    for (const id of ["handwash", "shower", "hairwash", "towel", "toilet"]) expect(getPictogram(id)?.category).toBe("care");
  });
});
