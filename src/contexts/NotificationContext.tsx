import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from "react";
import { useNavigate } from "react-router-dom";
import { toast } from "../components/Toast";
import { useAuth } from "../hooks/useAuth";
import { supabase } from "../lib/supabase";
import { isWithinQuietHours, safeNotificationActionUrl } from "../notifications/privacy";
import type { NotificationRecord, NotificationUserSettings } from "../notifications/types";
import {
  archiveNotifications,
  deleteNotifications,
  listNotifications,
  loadNotificationSettings,
  markAllNotificationsRead,
  markNotificationsRead,
  unreadNotificationCount,
} from "../services/notificationService";
import { useI18n } from "../i18n";
import { localizeNotification } from "../notifications/localize";

interface NotificationContextValue {
  notifications: NotificationRecord[];
  unreadCount: number;
  settings: NotificationUserSettings | null;
  loading: boolean;
  error: string | null;
  reload: () => Promise<void>;
  openNotification: (notification: NotificationRecord) => Promise<void>;
  markAsRead: (id: string, isRead?: boolean) => Promise<void>;
  markAllAsRead: () => Promise<void>;
  archive: (id: string) => Promise<void>;
  remove: (id: string) => Promise<void>;
}

const NotificationContext = createContext<NotificationContextValue | null>(null);
const MAX_BELL_NOTIFICATIONS = 20;
const SOUND_COOLDOWN_MS = 800;

export function NotificationProvider({ children }: { children: ReactNode }) {
  const { session, workspace, isDemoMode } = useAuth();
  const { language } = useI18n();
  const navigate = useNavigate();
  const [notifications, setNotifications] = useState<NotificationRecord[]>([]);
  const [unreadCount, setUnreadCount] = useState(0);
  const [settings, setSettings] = useState<NotificationUserSettings | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const audioRef = useRef<HTMLAudioElement | null>(null);
  const audioUnlockedRef = useRef(false);
  const lastSoundAtRef = useRef(0);
  const seenRealtimeIdsRef = useRef(new Set<string>());

  const reset = useCallback(() => {
    setNotifications([]);
    setUnreadCount(0);
    setSettings(null);
    setError(null);
    setLoading(false);
    seenRealtimeIdsRef.current.clear();
  }, []);

  const reload = useCallback(async () => {
    if (isDemoMode || !workspace?.id || !session?.user.id) {
      reset();
      return;
    }
    setLoading(true);
    setError(null);
    try {
      const [pageResult, countResult, settingsResult] = await Promise.allSettled([
        listNotifications(workspace.id, { limit: MAX_BELL_NOTIFICATIONS }),
        unreadNotificationCount(workspace.id),
        loadNotificationSettings(workspace.id, session.user.id),
      ]);

      if (pageResult.status === "rejected") throw pageResult.reason;

      const page = pageResult.value;
      setNotifications(page.rows);
      setUnreadCount(
        countResult.status === "fulfilled"
          ? countResult.value
          : page.rows.filter((row) => !row.is_read).length,
      );
      setSettings(settingsResult.status === "fulfilled" ? settingsResult.value : null);
      if (countResult.status === "rejected") {
        console.warn("[notifications] Unread count unavailable; using the loaded page", countResult.reason);
      }
      if (settingsResult.status === "rejected") {
        console.warn("[notifications] User settings unavailable; the feed remains usable", settingsResult.reason);
      }
      seenRealtimeIdsRef.current = new Set(page.rows.map((row) => row.id));
    } catch (cause) {
      console.error("[notifications] Failed to load notification feed", cause);
      setError(cause instanceof Error ? cause.message : "Notifications could not be loaded.");
    } finally {
      setLoading(false);
    }
  }, [isDemoMode, reset, session?.user.id, workspace?.id]);

  useEffect(() => {
    void reload();
  }, [reload]);

  useEffect(() => {
    if (typeof window === "undefined") return;
    const unlock = () => {
      if (!audioRef.current) {
        audioRef.current = new Audio("/notification.mp3");
        audioRef.current.preload = "auto";
      }
      audioUnlockedRef.current = true;
      window.removeEventListener("pointerdown", unlock);
      window.removeEventListener("keydown", unlock);
    };
    window.addEventListener("pointerdown", unlock, { once: true, passive: true });
    window.addEventListener("keydown", unlock, { once: true });
    return () => {
      window.removeEventListener("pointerdown", unlock);
      window.removeEventListener("keydown", unlock);
    };
  }, []);

  const playSound = useCallback((notification: NotificationRecord) => {
    if (!settings?.sound_enabled || !notification.sound_requested || !audioUnlockedRef.current) return;
    const quiet = settings.quiet_hours_enabled && isWithinQuietHours(
      new Date(),
      settings.quiet_hours_start,
      settings.quiet_hours_end,
      settings.quiet_days,
      settings.timezone,
    );
    if (quiet && !(notification.priority === "critical" && settings.allow_critical_during_quiet_hours)) return;
    const now = Date.now();
    if (now - lastSoundAtRef.current < SOUND_COOLDOWN_MS) return;
    lastSoundAtRef.current = now;
    const audio = audioRef.current;
    if (!audio || !audio.paused) return;
    audio.currentTime = 0;
    void audio.play().catch(() => {
      audioUnlockedRef.current = false;
    });
  }, [settings]);

  useEffect(() => {
    if (isDemoMode || !workspace?.id || !session?.user.id) return;
    const workspaceId = workspace.id;
    const userId = session.user.id;
    const channel = supabase
      .channel(`notifications:${workspaceId}:${userId}`)
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "notifications", filter: `workspace_id=eq.${workspaceId}` },
        (payload) => {
          const row = payload.new as NotificationRecord | Record<string, never>;
          if (!row.id || row.recipient_user_id !== userId) return;
          if (payload.eventType === "INSERT") {
            if (seenRealtimeIdsRef.current.has(row.id)) return;
            seenRealtimeIdsRef.current.add(row.id);
            if (row.in_app_visible !== false && !row.is_archived) {
              setNotifications((current) => [row as NotificationRecord, ...current.filter((item) => item.id !== row.id)].slice(0, MAX_BELL_NOTIFICATIONS));
              if (!row.is_read) setUnreadCount((current) => current + 1);
              if (document.visibilityState === "visible" && settings?.in_app_enabled !== false) {
                const localized = localizeNotification(row as NotificationRecord, language);
                toast.info(`${localized.title}: ${localized.message}`, 6000);
                playSound(row as NotificationRecord);
              }
            }
          } else if (payload.eventType === "UPDATE") {
            setNotifications((current) => current.map((item) => item.id === row.id ? row as NotificationRecord : item));
            void unreadNotificationCount(workspaceId).then(setUnreadCount).catch(() => undefined);
          }
        },
      )
      .subscribe();
    return () => {
      void supabase.removeChannel(channel);
    };
  }, [isDemoMode, language, playSound, session?.user.id, settings?.in_app_enabled, workspace?.id]);

  const markAsRead = useCallback(async (id: string, isRead = true) => {
    if (!workspace?.id) return;
    const existing = notifications.find((item) => item.id === id);
    await markNotificationsRead(workspace.id, [id], isRead);
    setNotifications((current) => current.map((item) => item.id === id ? {
      ...item,
      is_read: isRead,
      read_at: isRead ? new Date().toISOString() : null,
    } : item));
    if (existing && existing.is_read !== isRead) {
      setUnreadCount((current) => Math.max(0, current + (isRead ? -1 : 1)));
    }
  }, [notifications, workspace?.id]);

  const markAllAsRead = useCallback(async () => {
    if (!workspace?.id) return;
    await markAllNotificationsRead(workspace.id);
    setNotifications((current) => current.map((item) => ({ ...item, is_read: true, read_at: item.read_at ?? new Date().toISOString() })));
    setUnreadCount(0);
  }, [workspace?.id]);

  const archive = useCallback(async (id: string) => {
    if (!workspace?.id) return;
    const existing = notifications.find((item) => item.id === id);
    await archiveNotifications(workspace.id, [id]);
    setNotifications((current) => current.filter((item) => item.id !== id));
    if (existing && !existing.is_read) setUnreadCount((current) => Math.max(0, current - 1));
  }, [notifications, workspace?.id]);

  const remove = useCallback(async (id: string) => {
    if (!workspace?.id) return;
    const existing = notifications.find((item) => item.id === id);
    await deleteNotifications(workspace.id, [id]);
    setNotifications((current) => current.filter((item) => item.id !== id));
    if (existing && !existing.is_read) setUnreadCount((current) => Math.max(0, current - 1));
  }, [notifications, workspace?.id]);

  const openNotification = useCallback(async (notification: NotificationRecord) => {
    if (!notification.is_read) await markAsRead(notification.id);
    navigate(safeNotificationActionUrl(notification.action_url));
  }, [markAsRead, navigate]);

  const value = useMemo<NotificationContextValue>(() => ({
    notifications,
    unreadCount,
    settings,
    loading,
    error,
    reload,
    openNotification,
    markAsRead,
    markAllAsRead,
    archive,
    remove,
  }), [archive, error, loading, markAllAsRead, markAsRead, notifications, openNotification, reload, remove, settings, unreadCount]);

  return <NotificationContext.Provider value={value}>{children}</NotificationContext.Provider>;
}

export function useNotifications() {
  const context = useContext(NotificationContext);
  if (!context) throw new Error("useNotifications must be used inside NotificationProvider");
  return context;
}
