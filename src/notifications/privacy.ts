const SENSITIVE_KEYS = /(^|_)(phone|address|notes?|token|secret|api_key|password|otp|rib|credential|authorization)($|_)/i;

export function sanitizeNotificationPayload(payload: Record<string, unknown>): Record<string, unknown> {
  return Object.fromEntries(
    Object.entries(payload)
      .filter(([key]) => !SENSITIVE_KEYS.test(key))
      .map(([key, value]) => [key, sanitizeValue(value)]),
  );
}

function sanitizeValue(value: unknown): unknown {
  if (typeof value === "string") return value.replace(/<[^>]*>/g, "").slice(0, 600);
  if (Array.isArray(value)) return value.map(sanitizeValue);
  if (value && typeof value === "object") return sanitizeNotificationPayload(value as Record<string, unknown>);
  return value;
}

export function safeNotificationActionUrl(value: unknown, fallback = "/notifications"): string {
  if (typeof value !== "string" || !value.startsWith("/") || value.startsWith("//")) return fallback;
  try {
    const parsed = new URL(value, "https://ecomos.invalid");
    return parsed.origin === "https://ecomos.invalid" ? `${parsed.pathname}${parsed.search}${parsed.hash}` : fallback;
  } catch {
    return fallback;
  }
}

export function privatePreview(category: string): { title: string; message: string } {
  const normalized = category.replace(/_/g, " ");
  return { title: "Ecom OS", message: `You have a new ${normalized} notification in Ecom OS.` };
}

export function isWithinQuietHours(now: Date, start: string, end: string, days: number[], timezone?: string): boolean {
  let day = now.getDay();
  let minutes = now.getHours() * 60 + now.getMinutes();
  if (timezone) {
    try {
      const parts = new Intl.DateTimeFormat("en-US", {
        timeZone: timezone,
        weekday: "short",
        hour: "2-digit",
        minute: "2-digit",
        hourCycle: "h23",
      }).formatToParts(now);
      const weekday = parts.find((part) => part.type === "weekday")?.value;
      const hour = Number(parts.find((part) => part.type === "hour")?.value ?? 0);
      const minute = Number(parts.find((part) => part.type === "minute")?.value ?? 0);
      const weekdays = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];
      day = Math.max(0, weekdays.indexOf(weekday ?? "Sun"));
      minutes = hour * 60 + minute;
    } catch {
      // Invalid time zones fall back to the browser's local clock.
    }
  }
  if (!days.includes(day) || start === end) return false;
  const parse = (value: string) => {
    const [hours, mins] = value.split(":").map(Number);
    return hours * 60 + mins;
  };
  const from = parse(start);
  const to = parse(end);
  return from < to ? minutes >= from && minutes < to : minutes >= from || minutes < to;
}
