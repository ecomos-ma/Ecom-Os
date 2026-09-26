// Google Sheets display values have no timezone. This store's sheet records
// Morocco wall time; store the corresponding UTC instant, including Ramadan DST.
const SHEET_TIME_ZONE = "Africa/Casablanca";
const wallFormatter = new Intl.DateTimeFormat("en-GB", {
  timeZone: SHEET_TIME_ZONE,
  year: "numeric", month: "2-digit", day: "2-digit",
  hour: "2-digit", minute: "2-digit", second: "2-digit", hourCycle: "h23",
});

function wallMilliseconds(instant: number): number {
  const parts = Object.fromEntries(
    wallFormatter.formatToParts(new Date(instant)).map(({ type, value }) => [type, value]),
  );
  return Date.UTC(
    Number(parts.year), Number(parts.month) - 1, Number(parts.day),
    Number(parts.hour), Number(parts.minute), Number(parts.second),
  );
}

export function parseSheetOrderTime(value: unknown): string | null {
  if (value === null || value === undefined || value === "") return null;
  const raw = String(value).trim();
  // Apps Script JSON.stringify(Date) and explicit offsets already identify an instant.
  if (/^\d{4}-\d{1,2}-\d{1,2}T.*(?:Z|[+-]\d{2}:?\d{2})$/i.test(raw)) {
    const instant = new Date(raw);
    return Number.isNaN(instant.getTime()) ? null : instant.toISOString();
  }

  const match = raw.match(/^(\d{4})-(\d{1,2})-(\d{1,2})(?:[ T](\d{1,2}):(\d{2})(?::(\d{2}))?)?$/);
  if (!match) return null;
  const [, year, month, day, hour = "0", minute = "0", second = "0"] = match;
  const wall = Date.UTC(+year, +month - 1, +day, +hour, +minute, +second);
  const valid = new Date(wall);
  if (valid.getUTCFullYear() !== +year || valid.getUTCMonth() !== +month - 1 ||
      valid.getUTCDate() !== +day || valid.getUTCHours() !== +hour ||
      valid.getUTCMinutes() !== +minute || valid.getUTCSeconds() !== +second) return null;

  let instant = wall;
  for (let attempt = 0; attempt < 3; attempt++) {
    const difference = wall - wallMilliseconds(instant);
    if (difference === 0) return new Date(instant).toISOString();
    instant += difference;
  }
  // Nonexistent local time at a DST transition must not be silently shifted.
  return wallMilliseconds(instant) === wall ? new Date(instant).toISOString() : null;
}

// Preserve the historical phone + date sync key so re-sync corrects old rows
// rather than creating duplicates when the stored timestamp shifts by an hour.
export function legacySheetSyncTime(value: unknown, parsedTime: string | null): string | null {
  if (value === null || value === undefined || value === "") return null;
  const raw = String(value).trim();
  // The old Edge runtime interpreted timezone-free sheet strings in UTC.
  // Reproduce that key independently of the machine running the sync.
  const local = raw.match(/^(\d{4})-(\d{1,2})-(\d{1,2})(?:[ T](\d{1,2}):(\d{2})(?::(\d{2}))?)?$/);
  const oldParser = local
    ? new Date(Date.UTC(+local[1], +local[2] - 1, +local[3], +(local[4] || 0), +(local[5] || 0), +(local[6] || 0)))
    : new Date(raw);
  return Number.isNaN(oldParser.getTime()) ? parsedTime : oldParser.toISOString();
}
