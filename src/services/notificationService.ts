import { supabase } from "../lib/supabase";
import type {
  NotificationDevice,
  NotificationPermissionState,
  NotificationPreference,
  NotificationRecord,
  NotificationUserSettings,
} from "../notifications/types";
import { resolveNotificationPermissionState } from "../notifications/permissions";

export interface NotificationFilters {
  category?: string;
  priority?: string;
  read?: boolean;
  search?: string;
  dateFrom?: string;
  dateTo?: string;
  cursor?: { createdAt: string; id: string };
  limit?: number;
}

export interface NotificationPage {
  rows: NotificationRecord[];
  nextCursor: { createdAt: string; id: string } | null;
}

const DEFAULT_SETTINGS = (workspaceId: string, userId: string): NotificationUserSettings => ({
  workspace_id: workspaceId,
  user_id: userId,
  notifications_enabled: true,
  in_app_enabled: true,
  push_enabled: false,
  sound_enabled: true,
  muted_until: null,
  quiet_hours_enabled: false,
  quiet_hours_start: "22:00",
  quiet_hours_end: "08:00",
  timezone: "Africa/Casablanca",
  quiet_days: [0, 1, 2, 3, 4, 5, 6],
  allow_critical_during_quiet_hours: true,
  private_preview_enabled: true,
});

function cleanSearch(value: string): string {
  return value.replace(/[^\p{L}\p{N}\s#-]/gu, " ").replace(/\s+/g, " ").trim().slice(0, 100);
}

export async function listNotifications(workspaceId: string, filters: NotificationFilters = {}): Promise<NotificationPage> {
  console.log("[notificationService] listNotifications called with:", { workspaceId, filters });
  const limit = Math.min(Math.max(filters.limit ?? 30, 1), 100);
  let query = supabase.from("notifications").select("id, workspace_id, recipient_user_id, event_key, category, priority, title, message, related_entity_type, related_entity_id, action_url, payload, occurrence_count, is_read, read_at, is_archived, archived_at, expires_at, created_at, updated_at, sound_requested")
    .eq("workspace_id", workspaceId).eq("in_app_visible", true).eq("is_archived", false)
    .gt("expires_at", new Date().toISOString()).order("created_at", { ascending: false }).order("id", { ascending: false }).limit(limit + 1);
  if (filters.category) query = query.eq("category", filters.category);
  if (filters.priority) query = query.eq("priority", filters.priority);
  if (typeof filters.read === "boolean") query = query.eq("is_read", filters.read);
  if (filters.dateFrom) query = query.gte("created_at", filters.dateFrom);
  if (filters.dateTo) query = query.lte("created_at", filters.dateTo);
  if (filters.cursor) query = query.or(`created_at.lt.${filters.cursor.createdAt},and(created_at.eq.${filters.cursor.createdAt},id.lt.${filters.cursor.id})`);
  const search = cleanSearch(filters.search ?? "");
  if (search) query = query.or(`title.ilike.%${search}%,message.ilike.%${search}%`);
  
  console.log("[notificationService] Executing Supabase query...");
  const { data, error } = await query;
  
  if (error) {
    console.error("[notificationService] Supabase query failed:", {
      code: error.code,
      message: error.message,
      details: error.details,
      hint: error.hint,
    });
    throw error;
  }
  
  console.log("[notificationService] Query successful, data length:", data?.length);
  const rows = (data ?? []) as NotificationRecord[];
  const hasMore = rows.length > limit;
  const page = rows.slice(0, limit);
  const last = page[page.length - 1];
  return { rows: page, nextCursor: hasMore && last ? { createdAt: last.created_at, id: last.id } : null };
}

export async function unreadNotificationCount(workspaceId: string): Promise<number> {
  console.log("[notificationService] unreadNotificationCount called for workspace:", workspaceId);
  const { data, error } = await supabase.rpc("notification_unread_count", { p_workspace_id: workspaceId });
  if (error) {
    console.error("[notificationService] unreadNotificationCount RPC failed:", {
      code: error.code,
      message: error.message,
      details: error.details,
      hint: error.hint,
    });
    throw error;
  }
  const count = Number(data ?? 0);
  console.log("[notificationService] unreadNotificationCount result:", count);
  return count;
}

export async function markNotificationsRead(workspaceId: string, ids: string[], isRead: boolean): Promise<void> {
  const { error } = await supabase.rpc("notification_mark_read", { p_workspace_id: workspaceId, p_ids: ids, p_is_read: isRead });
  if (error) throw error;
}

export async function markAllNotificationsRead(workspaceId: string): Promise<void> {
  const { error } = await supabase.rpc("notification_mark_all_read", { p_workspace_id: workspaceId });
  if (error) throw error;
}

export async function archiveNotifications(workspaceId: string, ids: string[], archived = true): Promise<void> {
  const { error } = await supabase.rpc("notification_archive", { p_workspace_id: workspaceId, p_ids: ids, p_archived: archived });
  if (error) throw error;
}

export async function deleteNotifications(workspaceId: string, ids: string[]): Promise<void> {
  const { error } = await supabase.rpc("notification_delete", { p_workspace_id: workspaceId, p_ids: ids });
  if (error) throw error;
}

export async function loadNotificationSettings(workspaceId: string, userId: string): Promise<NotificationUserSettings> {
  console.log("[notificationService] loadNotificationSettings called for workspace:", workspaceId, "user:", userId);
  const { data, error } = await supabase.from("notification_user_settings").select("*").eq("workspace_id", workspaceId).eq("user_id", userId).maybeSingle();
  if (error) {
    console.error("[notificationService] loadNotificationSettings query failed:", {
      code: error.code,
      message: error.message,
      details: error.details,
      hint: error.hint,
    });
    throw error;
  }
  if (data) {
    console.log("[notificationService] Found existing settings:", data);
    return data as NotificationUserSettings;
  }
  console.log("[notificationService] No existing settings, creating defaults");
  const defaults = DEFAULT_SETTINGS(workspaceId, userId);
  const { data: inserted, error: insertError } = await supabase.from("notification_user_settings").upsert(defaults, { onConflict: "workspace_id,user_id" }).select("*").single();
  if (insertError) {
    console.error("[notificationService] Failed to insert default settings:", insertError);
    throw insertError;
  }
  console.log("[notificationService] Created default settings:", inserted);
  return inserted as NotificationUserSettings;
}

export async function saveNotificationSettings(settings: NotificationUserSettings): Promise<NotificationUserSettings> {
  const { id: _id, created_at: _created, updated_at: _updated, ...payload } = settings;
  const { data, error } = await supabase.from("notification_user_settings").upsert(payload, { onConflict: "workspace_id,user_id" }).select("*").single();
  if (error) throw error;
  return data as NotificationUserSettings;
}

export async function loadNotificationPreferences(workspaceId: string, userId: string): Promise<NotificationPreference[]> {
  const { data, error } = await supabase.from("notification_preferences").select("*").eq("workspace_id", workspaceId).eq("user_id", userId);
  if (error) throw error;
  return (data ?? []) as NotificationPreference[];
}

export async function saveNotificationPreferences(preferences: NotificationPreference[]): Promise<void> {
  if (!preferences.length) return;
  const payload = preferences.map(({ id: _id, ...preference }) => preference);
  const { error } = await supabase.from("notification_preferences").upsert(payload, { onConflict: "workspace_id,user_id,event_key" });
  if (error) throw error;
}

export async function resetNotificationPreferences(workspaceId: string, userId: string, eventKeys?: string[]): Promise<void> {
  let query = supabase.from("notification_preferences").delete().eq("workspace_id", workspaceId).eq("user_id", userId);
  if (eventKeys?.length) query = query.in("event_key", eventKeys);
  const { error } = await query;
  if (error) throw error;
}

async function invokeDeviceAction<T>(workspaceId: string, action: string, body: Record<string, unknown> = {}): Promise<T> {
  const { data, error } = await supabase.functions.invoke("notification-subscriptions", { body: { action, workspace_id: workspaceId, ...body } });
  if (error) throw error;
  if (data?.error) throw new Error(data.error);
  return data as T;
}

export async function listNotificationDevices(workspaceId: string): Promise<NotificationDevice[]> {
  const data = await invokeDeviceAction<{ devices: NotificationDevice[] }>(workspaceId, "list");
  return data.devices ?? [];
}

export async function updateNotificationDevice(workspaceId: string, deviceId: string, patch: { device_name?: string; is_active?: boolean }): Promise<void> {
  await invokeDeviceAction(workspaceId, "update", { device_id: deviceId, ...patch });
}

export async function removeNotificationDevice(workspaceId: string, deviceId: string): Promise<void> {
  await invokeDeviceAction(workspaceId, "remove", { device_id: deviceId });
  if (localStorage.getItem(`ecomos:push-device:${workspaceId}`) === deviceId) {
    const registration = await navigator.serviceWorker?.ready;
    const subscription = await registration?.pushManager.getSubscription();
    await subscription?.unsubscribe();
    localStorage.removeItem(`ecomos:push-device:${workspaceId}`);
  }
}

export async function removeOtherNotificationDevices(workspaceId: string, currentDeviceId: string): Promise<void> {
  await invokeDeviceAction(workspaceId, "remove_others", { device_id: currentDeviceId });
}

export async function sendTestNotification(workspaceId: string): Promise<void> {
  await invokeDeviceAction(workspaceId, "test");
}

function base64UrlToUint8Array(value: string): Uint8Array {
  const padding = "=".repeat((4 - value.length % 4) % 4);
  const raw = atob((value + padding).replace(/-/g, "+").replace(/_/g, "/"));
  return Uint8Array.from([...raw].map((character) => character.charCodeAt(0)));
}

function deviceMetadata() {
  const ua = navigator.userAgent;
  const browser = /Edg\//.test(ua) ? "Edge" : /Firefox\//.test(ua) ? "Firefox" : /CriOS|Chrome\//.test(ua) ? "Chrome" : /Safari\//.test(ua) ? "Safari" : "Unknown";
  const operating_system = /Windows/i.test(ua) ? "Windows" : /Android/i.test(ua) ? "Android" : /iPhone|iPad|iPod/i.test(ua) ? "iOS/iPadOS" : /Mac OS/i.test(ua) ? "macOS" : /Linux/i.test(ua) ? "Linux" : "Unknown";
  const device_type = /iPad|Tablet/i.test(ua) ? "tablet" : /Android|iPhone|Mobile/i.test(ua) ? "mobile" : "desktop";
  const is_pwa = window.matchMedia("(display-mode: standalone)").matches || (navigator as Navigator & { standalone?: boolean }).standalone === true;
  return { name: `${browser} on ${operating_system}`, browser, operating_system, device_type, is_pwa };
}

export function browserNotificationPermissionState(hasActiveSubscription = false): NotificationPermissionState {
  const supported = "Notification" in window && "serviceWorker" in navigator && "PushManager" in window;
  return resolveNotificationPermissionState(supported, supported ? Notification.permission : "default", hasActiveSubscription);
}

export async function enableBrowserNotifications(workspaceId: string): Promise<{ deviceId: string; permission: NotificationPermissionState }> {
  if (browserNotificationPermissionState() === "unsupported") throw new Error("Web Push is not supported on this browser or device.");
  const permission = await Notification.requestPermission();
  if (permission !== "granted") throw new Error(permission === "denied" ? "Browser notification permission is blocked." : "Notification permission was not granted.");
  const registration = await navigator.serviceWorker.ready;
  const publicKey = await invokeDeviceAction<{ public_key: string }>(workspaceId, "public_key");
  let subscription = await registration.pushManager.getSubscription();
  if (!subscription) subscription = await registration.pushManager.subscribe({ userVisibleOnly: true, applicationServerKey: base64UrlToUint8Array(publicKey.public_key) as BufferSource });
  const json = subscription.toJSON();
  if (!json.endpoint || !json.keys?.p256dh || !json.keys?.auth) throw new Error("The browser returned an incomplete push subscription.");
  const result = await invokeDeviceAction<{ device_id: string }>(workspaceId, "register", { subscription: json, device: deviceMetadata() });
  localStorage.setItem(`ecomos:push-device:${workspaceId}`, result.device_id);
  return { deviceId: result.device_id, permission: "active" };
}

export async function currentPushSubscriptionActive(): Promise<boolean> {
  if (browserNotificationPermissionState() === "unsupported" || Notification.permission !== "granted") return false;
  const registration = await navigator.serviceWorker.ready;
  return Boolean(await registration.pushManager.getSubscription());
}

export function currentNotificationDeviceId(workspaceId: string): string | null {
  return localStorage.getItem(`ecomos:push-device:${workspaceId}`);
}
