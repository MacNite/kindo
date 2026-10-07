import { describe, expect, it } from "vitest";
import en from "./messages/en";
import de from "./messages/de";

type Tree = { [k: string]: string | Tree };
function flatten(t: Tree, prefix = ""): Record<string, string> {
  return Object.entries(t).reduce<Record<string, string>>((acc, [k, v]) => {
    if (typeof v === "string") acc[prefix + k] = v;
    else Object.assign(acc, flatten(v, `${prefix}${k}.`));
    return acc;
  }, {});
}
const placeholders = (s: string) => [...s.matchAll(/\{(\w+)\}/g)].map((m) => m[1]).sort();

describe("translations", () => {
  const E = flatten(en as unknown as Tree);
  const D = flatten(de as unknown as Tree);

  it("German and English have the same keys", () => {
    expect(Object.keys(D).sort()).toEqual(Object.keys(E).sort());
  });

  it("every string uses the same placeholders in both languages", () => {
    for (const key of Object.keys(E)) expect(placeholders(D[key]), key).toEqual(placeholders(E[key]));
  });

  it("no string is empty", () => {
    for (const [key, v] of Object.entries({ ...E, ...D })) expect(v.trim(), key).not.toBe("");
  });
});
