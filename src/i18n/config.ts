export type Language = "de" | "en";
export type RegionId = "de-DE" | "en-GB" | "en-US" | "de-AT" | "de-CH";

export interface RegionFormat {
  id: RegionId;
  weekStartsOn: 0 | 1;
  hour12: boolean;
  currency: string;
}

/** Locale = language (UI text) + region (formats). Kept separate on purpose. */
export const REGIONS: Record<RegionId, RegionFormat> = {
  "de-DE": { id: "de-DE", weekStartsOn: 1, hour12: false, currency: "EUR" },
  "de-AT": { id: "de-AT", weekStartsOn: 1, hour12: false, currency: "EUR" },
  "de-CH": { id: "de-CH", weekStartsOn: 1, hour12: false, currency: "CHF" },
  "en-GB": { id: "en-GB", weekStartsOn: 1, hour12: false, currency: "GBP" },
  "en-US": { id: "en-US", weekStartsOn: 0, hour12: true, currency: "USD" },
};

export const LANGUAGES: { id: Language; native: string }[] = [
  { id: "de", native: "Deutsch" },
  { id: "en", native: "English" },
];
