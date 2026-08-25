import { type Locale } from "../i18n/config";
import { translate, type TranslationKey, type TranslationValues } from "../i18n/translate";
import { isNotificationEventKey } from "./registry";
import type { NotificationRecord } from "./types";

export interface LocalizedNotificationText {
  title: string;
  message: string;
}

export function localizeNotification(
  notification: Pick<NotificationRecord, "event_key" | "title" | "message" | "payload">,
  locale: Locale,
): LocalizedNotificationText {
  // Announcement title/body are founder-authored content. Translating them
  // would mutate the meaning of user-entered content, so they stay verbatim.
  if (notification.event_key === "system.announcement" || !isNotificationEventKey(notification.event_key)) {
    return { title: notification.title, message: notification.message };
  }

  const values: TranslationValues = {};
  for (const [key, value] of Object.entries(notification.payload || {})) {
    if (typeof value === "string" || typeof value === "number") values[key] = value;
  }
  values.order_number ??= "";
  values.product_name ??= locale === "fr" ? "Un produit" : "A product";

  return {
    title: translate(locale, `notification.${notification.event_key}.title` as TranslationKey, values),
    message: translate(locale, `notification.${notification.event_key}.message` as TranslationKey, values),
  };
}
