import type { NotificationPermissionState } from "./types";

export function resolveNotificationPermissionState(
  supported: boolean,
  permission: NotificationPermission | "default",
  activeSubscription: boolean,
): NotificationPermissionState {
  if (!supported) return "unsupported";
  if (permission === "denied") return "denied";
  if (permission === "default") return "not_requested";
  return activeSubscription ? "active" : "allowed";
}
