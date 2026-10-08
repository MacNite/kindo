import { describe, expect, it } from "vitest";
import { guessCategory } from "./shopping";

describe("guessCategory (§10)", () => {
  it("sorts quick-adds in German and English", () => {
    expect(guessCategory("Milch")).toBe("dairy");
    expect(guessCategory("Bananen")).toBe("produce");
    expect(guessCategory("Brötchen")).toBe("bakery");
    expect(guessCategory("Nudeln")).toBe("pantry");
    expect(guessCategory("AA-Batterien")).toBe("hardware");
  });

  it("knows ice from rice", () => {
    expect(guessCategory("Reis")).toBe("pantry");
    expect(guessCategory("Basmati-Reis")).toBe("pantry");
    expect(guessCategory("Eis")).toBe("frozen");
    expect(guessCategory("Eiscreme")).toBe("frozen");
    expect(guessCategory("Ice cream")).toBe("frozen");
    expect(guessCategory("Eisbergsalat")).toBe("produce");
    expect(guessCategory("Klopapierrolle")).toBe("household");
  });

  it("a list named for a kind of shop decides, whatever its id", () => {
    expect(guessCategory("Bilderhaken", { de: "Baumarkt", en: "Hardware store" })).toBe("hardware");
    expect(guessCategory("Milch", "Drogerie")).toBe("care");
    expect(guessCategory("Milch", { de: "Wocheneinkauf", en: "Weekly shop" })).toBe("dairy");
  });
});
