export const SUPPORTED_LOCALES = ["en", "fr"] as const;

export type Locale = (typeof SUPPORTED_LOCALES)[number];

export const DEFAULT_LOCALE: Locale = "en";

export const INTL_LOCALES: Record<Locale, string> = {
  en: "en-GB",
  fr: "fr-FR",
};

export function normalizeLocale(value: unknown): Locale {
  return typeof value === "string" && (SUPPORTED_LOCALES as readonly string[]).includes(value.toLowerCase())
    ? (value.toLowerCase() as Locale)
    : DEFAULT_LOCALE;
}
