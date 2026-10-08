import type { MessageKey } from "@/i18n";

/** Calm, distinct member colours that read on both themes (§3, §16), each with a name to say instead of its hex code. */
const PALETTE = [
  ["#3B78C2", "colors.blue"], ["#2E8B6E", "colors.green"], ["#8A5CD1", "colors.purple"], ["#E39A1B", "colors.orange"],
  ["#C2477A", "colors.pink"], ["#2A8C9E", "colors.teal"], ["#B4443C", "colors.red"], ["#5B6A6D", "colors.grey"],
] as const satisfies readonly (readonly [string, MessageKey])[];

export const MEMBER_COLORS: string[] = PALETTE.map(([hex]) => hex);
const NAMES = new Map<string, MessageKey>(PALETTE);

/** The colour's name for a screen reader, or undefined for a colour outside the palette. */
export const colorName = (hex: string) => NAMES.get(hex.toUpperCase());
