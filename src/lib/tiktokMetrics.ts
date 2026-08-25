export type DatePreset = "today" | "yesterday" | "last7" | "last14" | "last30" | "thisMonth" | "lastMonth";

export interface DateRange { start: string; end: string }

function partsInZone(date: Date, timeZone: string): { year: number; month: number; day: number } {
  const parts = new Intl.DateTimeFormat("en-CA", { timeZone, year: "numeric", month: "2-digit", day: "2-digit" }).formatToParts(date);
  const read = (type: Intl.DateTimeFormatPartTypes) => Number(parts.find((part) => part.type === type)?.value);
  return { year: read("year"), month: read("month"), day: read("day") };
}

function isoDate(date: Date): string { return date.toISOString().slice(0, 10); }
function utcDate(year: number, month: number, day: number): Date { return new Date(Date.UTC(year, month - 1, day)); }
function shift(date: Date, days: number): Date { const copy = new Date(date); copy.setUTCDate(copy.getUTCDate() + days); return copy; }

export function dateRangeForPreset(preset: DatePreset, timeZone = "UTC", now = new Date()): DateRange {
  const parts = partsInZone(now, timeZone);
  const today = utcDate(parts.year, parts.month, parts.day);
  if (preset === "today") return { start: isoDate(today), end: isoDate(today) };
  if (preset === "yesterday") { const day = shift(today, -1); return { start: isoDate(day), end: isoDate(day) }; }
  if (preset === "last7") return { start: isoDate(shift(today, -6)), end: isoDate(today) };
  if (preset === "last14") return { start: isoDate(shift(today, -13)), end: isoDate(today) };
  if (preset === "last30") return { start: isoDate(shift(today, -29)), end: isoDate(today) };
  const firstThisMonth = utcDate(parts.year, parts.month, 1);
  if (preset === "thisMonth") return { start: isoDate(firstThisMonth), end: isoDate(today) };
  const lastPrevious = shift(firstThisMonth, -1);
  return { start: isoDate(utcDate(lastPrevious.getUTCFullYear(), lastPrevious.getUTCMonth() + 1, 1)), end: isoDate(lastPrevious) };
}

export function safeDivide(numerator: number, denominator: number): number | null {
  return denominator === 0 || !Number.isFinite(numerator) || !Number.isFinite(denominator) ? null : numerator / denominator;
}

export function percent(numerator: number, denominator: number): number | null {
  const value = safeDivide(numerator, denominator);
  return value === null ? null : value * 100;
}

export function stableEventId(workspaceId: string, orderId: string, eventName: "PlaceAnOrder" | "CompletePayment"): string {
  return `${workspaceId}:${orderId}:${eventName}`;
}

export function hasCurrencyMismatch(workspaceCurrency: string | null | undefined, adCurrency: string | null | undefined): boolean {
  return Boolean(workspaceCurrency && adCurrency && workspaceCurrency.toUpperCase() !== adCurrency.toUpperCase());
}
