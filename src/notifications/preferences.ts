import type { NotificationEventDefinition } from "./registry";
import type { NotificationChannel, NotificationPreference, NotificationUserSettings } from "./types";
import { isWithinQuietHours } from "./privacy.ts";

export function resolveEventChannel(
  definition: NotificationEventDefinition,
  preference: NotificationPreference | undefined,
  settings: NotificationUserSettings,
  channel: NotificationChannel,
): boolean {
  if (!settings.notifications_enabled || (settings.muted_until && new Date(settings.muted_until) > new Date())) return false;
  if (preference?.delivery_mode === "off" || !definition.availableChannels.includes(channel)) return false;
  const eventOverride = channel === "in_app" ? preference?.in_app_enabled : channel === "push" ? preference?.push_enabled : preference?.sound_enabled;
  const globalEnabled = channel === "in_app" ? settings.in_app_enabled : channel === "push" ? settings.push_enabled : settings.in_app_enabled && settings.sound_enabled && definition.soundAllowed;
  return globalEnabled && (eventOverride ?? definition.defaults[channel]);
}

export function shouldDelayForQuietHours(
  definition: NotificationEventDefinition,
  settings: NotificationUserSettings,
  priority: string,
  now: Date,
): boolean {
  if (!settings.quiet_hours_enabled) return false;
  if (priority === "critical" && definition.canBypassQuietHours && settings.allow_critical_during_quiet_hours) return false;
  return isWithinQuietHours(now, settings.quiet_hours_start, settings.quiet_hours_end, settings.quiet_days, settings.timezone);
}
