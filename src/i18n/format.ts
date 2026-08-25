import { INTL_LOCALES, type Locale } from "./config";

export function formatDate(value: Date | string | number, locale: Locale, options?: Intl.DateTimeFormatOptions): string {
  const date = value instanceof Date ? value : new Date(value);
  if (Number.isNaN(date.getTime())) return "—";
  return new Intl.DateTimeFormat(INTL_LOCALES[locale], options).format(date);
}

export function formatDateTime(value: Date | string | number, locale: Locale): string {
  return formatDate(value, locale, { dateStyle: "medium", timeStyle: "short" });
}

export function formatNumber(value: number, locale: Locale, options?: Intl.NumberFormatOptions): string {
  return new Intl.NumberFormat(INTL_LOCALES[locale], options).format(value);
}

export function formatPercent(value: number, locale: Locale, options?: Intl.NumberFormatOptions): string {
  return formatNumber(value, locale, { style: "percent", maximumFractionDigits: 1, ...options });
}

export function formatCurrency(value: number, locale: Locale, currency = "MAD"): string {
  return formatNumber(value, locale, { style: "currency", currency, maximumFractionDigits: 2 });
}
