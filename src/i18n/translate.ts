import { DEFAULT_LOCALE, type Locale } from "./config";
import en from "./locales/en";
import fr from "./locales/fr";

export type TranslationKey = keyof typeof en;
export type TranslationValues = Record<string, string | number>;

const dictionaries: Record<Locale, Record<TranslationKey, string>> = { en, fr };
const reportedMissingKeys = new Set<string>();

export function translate(locale: Locale, key: TranslationKey, values?: TranslationValues): string {
  const template = dictionaries[locale]?.[key] ?? dictionaries[DEFAULT_LOCALE][key];

  if (!template) {
    if (import.meta.env.DEV && !reportedMissingKeys.has(key)) {
      reportedMissingKeys.add(key);
      console.error(`[i18n] Missing translation key: ${key}`);
    }
    return key;
  }

  if (!values) return template;
  return template.replace(/\{(\w+)\}/g, (match, name: string) =>
    Object.prototype.hasOwnProperty.call(values, name) ? String(values[name]) : match
  );
}

export function hasCompleteLocale(locale: Locale): boolean {
  return (Object.keys(en) as TranslationKey[]).every((key) => Boolean(dictionaries[locale][key]));
}
