export const NOTIFICATION_CATEGORIES = [
  "orders", "confirmation", "shipping", "inventory", "team", "finance",
  "ads", "integrations", "security", "system",
] as const;

export type NotificationCategory = typeof NOTIFICATION_CATEGORIES[number];
export type NotificationPriority = "low" | "normal" | "high" | "critical";
export type NotificationChannel = "in_app" | "push" | "sound";
export type NotificationDeliveryMode = "immediate" | "digest" | "off";

export interface NotificationRecord {
  id: string;
  workspace_id: string;
  recipient_user_id: string;
  event_key: string;
  category: NotificationCategory;
  priority: NotificationPriority;
  title: string;
  message: string;
  related_entity_type: string | null;
  related_entity_id: string | null;
  action_url: string | null;
  payload: Record<string, unknown>;
  occurrence_count: number;
  in_app_visible: boolean;
  push_requested: boolean;
  is_read: boolean;
  read_at: string | null;
  is_archived: boolean;
  archived_at: string | null;
  expires_at: string;
  created_at: string;
  updated_at: string;
  sound_requested?: boolean;
}

export interface NotificationUserSettings {
  id?: string;
  workspace_id: string;
  user_id: string;
  notifications_enabled: boolean;
  in_app_enabled: boolean;
  push_enabled: boolean;
  sound_enabled: boolean;
  muted_until: string | null;
  quiet_hours_enabled: boolean;
  quiet_hours_start: string;
  quiet_hours_end: string;
  timezone: string;
  quiet_days: number[];
  allow_critical_during_quiet_hours: boolean;
  private_preview_enabled: boolean;
  created_at?: string;
  updated_at?: string;
}

export interface NotificationPreference {
  id?: string;
  workspace_id: string;
  user_id: string;
  event_key: string;
  in_app_enabled: boolean | null;
  push_enabled: boolean | null;
  sound_enabled: boolean | null;
  delivery_mode: NotificationDeliveryMode;
}

export interface NotificationDevice {
  id: string;
  device_name: string;
  browser: string;
  operating_system: string;
  device_type: "desktop" | "mobile" | "tablet" | "unknown";
  is_pwa: boolean;
  is_active: boolean;
  last_active_at: string;
  last_success_at: string | null;
  last_failure_at: string | null;
  failure_count: number;
  expires_at: string | null;
  created_at: string;
}

export type NotificationPermissionState =
  | "not_requested"
  | "allowed"
  | "denied"
  | "unsupported"
  | "subscription_expired"
  | "active";
