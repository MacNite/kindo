import type { Text } from "./types";

export type TextLanguage = keyof Exclude<Text, string>;

/**
 * Edits a label in the language it is being read in (§14). A bilingual label
 * keeps its other language; a plain one stays plain, as it reads the same in
 * both. Editing the German name of "Wocheneinkauf" must not erase "Weekly shop".
 */
export function editText(old: Text | undefined, language: TextLanguage, value: string): Text {
  if (old === undefined || typeof old === "string") return value;
  return { ...old, [language]: value };
}

/** Is there nothing to read in either language? */
export const isBlankText = (t: Text | undefined) => !t || (typeof t === "string" ? !t.trim() : !t.de.trim() && !t.en.trim());
