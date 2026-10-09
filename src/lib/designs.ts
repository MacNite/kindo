/**
 * Design styles (§16, D54): one look per device, on top of the same tokens.
 * Warm is Kindo's own; the others restyle surfaces, borders and type through
 * `html[data-design]` in `src/app/designs.css`. Some only work in one scheme
 * and fix it, so the device's light/dark choice waits until Warm or Minimal.
 */
export const DESIGNS = ["warm", "minimal", "glass", "brutal", "future"] as const;
export type Design = (typeof DESIGNS)[number];

const FIXED: Partial<Record<Design, "light" | "dark">> = { glass: "light", brutal: "light", future: "dark" };

/** The scheme a design insists on, if any. */
export function fixedScheme(design: Design): "light" | "dark" | undefined {
  return FIXED[design];
}

export function isDesign(v: unknown): v is Design {
  return typeof v === "string" && (DESIGNS as readonly string[]).includes(v);
}

/** Whether the screen is dark: the design's own scheme wins over the device's choice. */
export function isDark(theme: "light" | "dark" | "system", design: Design, systemDark: boolean): boolean {
  const fixed = fixedScheme(design);
  if (fixed) return fixed === "dark";
  return theme === "dark" || (theme === "system" && systemDark);
}
