import { useCallback, useEffect, useRef, useState } from "react";
import {
  Archive,
  Bell,
  CheckCheck,
  CircleAlert,
  Loader2,
  RefreshCw,
  Search,
  Trash2,
} from "lucide-react";
import { useNavigate } from "react-router-dom";
import { PageHeader } from "../components/PageHeader";
import { EmptyState } from "../components/EmptyState";
import { toast } from "../components/Toast";
import { useNotifications } from "../contexts/NotificationContext";
import { useAuth } from "../hooks/useAuth";
import { NOTIFICATION_CATEGORIES, type NotificationRecord } from "../notifications/types";
import {
  archiveNotifications,
  deleteNotifications,
  listNotifications,
  markNotificationsRead,
  type NotificationFilters,
} from "../services/notificationService";
import { safeNotificationActionUrl } from "../notifications/privacy";
import { useI18n } from "../i18n";
import { localizeNotification } from "../notifications/localize";
import { reportError } from "../lib/errorHandling";

const categoryLabels = Object.fromEntries(NOTIFICATION_CATEGORIES.map((category) => [category, category.replace(/_/g, " ")]));

export default function Notifications() {
  const { workspace, isDemoMode } = useAuth();
  const notificationContext = useNotifications();
  const { language, formatDateTime } = useI18n();
  const navigate = useNavigate();
  const [rows, setRows] = useState<NotificationRecord[]>([]);
  const [cursor, setCursor] = useState<{ createdAt: string; id: string } | null>(null);
  const [loading, setLoading] = useState(true);
  const [loadingMore, setLoadingMore] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [online, setOnline] = useState(() => navigator.onLine);
  const [filters, setFilters] = useState<NotificationFilters>({ limit: 30 });
  const previousUpdatedAt = useRef<string | null>(null);
  const isFiltering = Boolean(filters.search || filters.read !== undefined || filters.category || filters.priority || filters.dateFrom || filters.dateTo);

  const load = useCallback(async (append = false) => {
    if (isDemoMode || !workspace?.id) {
      console.log("[Notifications] Demo mode or no workspace, skipping load");
      setRows([]);
      setCursor(null);
      setLoading(false);
      return;
    }
    append ? setLoadingMore(true) : setLoading(true);
    setError(null);
    try {
      console.log("[Notifications] Loading notifications for workspace:", workspace.id, "with filters:", filters);
      const page = await listNotifications(workspace.id, { ...filters, cursor: append ? cursor ?? undefined : undefined });
      console.log("[Notifications] Loaded page:", page);
      setRows((current) => append ? [...current, ...page.rows] : page.rows);
      setCursor(page.nextCursor);
    } catch (cause) {
      console.error("[Notifications] Failed to load notifications - FULL ERROR:", {
        message: cause instanceof Error ? cause.message : String(cause),
        cause,
        workspaceId: workspace.id,
        filters,
      });
      const safe = await reportError(cause, "notifications.load", { workspace_id: workspace.id, action: "list_notifications" });
      setError(safe.userMessage);
    } finally {
      setLoading(false);
      setLoadingMore(false);
    }
  }, [cursor, filters, isDemoMode, workspace?.id]);

  useEffect(() => {
    const timer = window.setTimeout(() => void load(false), 250);
    return () => window.clearTimeout(timer);
  }, [filters.category, filters.dateFrom, filters.dateTo, filters.priority, filters.read, filters.search, workspace?.id, load]);

  useEffect(() => {
    const currentUpdatedAt = notificationContext.notifications[0]?.updated_at;
    if (!currentUpdatedAt) return;
    // Only reload if the timestamp actually changed
    if (previousUpdatedAt.current !== currentUpdatedAt) {
      previousUpdatedAt.current = currentUpdatedAt;
      if (!loading) {
        void load(false);
      }
    }
  }, [notificationContext.notifications, loading, load]);

  useEffect(() => {
    const sync = () => setOnline(navigator.onLine);
    window.addEventListener("online", sync);
    window.addEventListener("offline", sync);
    return () => { window.removeEventListener("online", sync); window.removeEventListener("offline", sync); };
  }, []);

  const runAction = async (action: () => Promise<void>, success: string) => {
    try {
      await action();
      toast.success(success);
      await Promise.all([load(false), notificationContext.reload()]);
    } catch (cause) {
      const safe = await reportError(cause, "notifications.action", { workspace_id: workspace?.id, action: "notification_action" });
      toast.error(safe.userMessage);
    }
  };

  const open = async (notification: NotificationRecord) => {
    if (!notification.is_read && workspace?.id) {
      await markNotificationsRead(workspace.id, [notification.id], true).catch(() => undefined);
      void notificationContext.reload();
    }
    navigate(safeNotificationActionUrl(notification.action_url));
  };

  const updateFilter = <K extends keyof NotificationFilters>(key: K, value: NotificationFilters[K]) => {
    setCursor(null);
    setFilters((current) => ({ ...current, [key]: value }));
  };

  return (
    <div className="pb-10">
      <PageHeader title="Notifications" subtitle="Workspace activity addressed specifically to you." />

      <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
        {!online ? <p className="rounded-lg bg-amber-500/10 px-3 py-2 text-xs font-medium text-amber-700">You are offline. Showing the last loaded notification state.</p> : <span />}
        <div className="flex gap-2"><button onClick={() => navigate("/settings/notifications")} className="rounded-lg border border-base-border bg-base-surface px-3 py-2 text-xs font-semibold text-brand hover:bg-base-raised">Notification settings</button>{notificationContext.unreadCount > 0 && <button onClick={() => void notificationContext.markAllAsRead().then(() => load(false))} className="inline-flex items-center gap-2 rounded-lg border border-base-border bg-base-surface px-3 py-2 text-xs font-semibold text-ink hover:bg-base-raised"><CheckCheck size={14} /> Mark all as read</button>}</div>
      </div>

      <div className="mb-4 grid gap-2 rounded-xl border border-base-border bg-base-surface p-3 shadow-card sm:grid-cols-2 lg:grid-cols-6">
        <label className="relative sm:col-span-2">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-ink-faint" size={15} />
          <input
            value={filters.search ?? ""}
            onChange={(event) => updateFilter("search", event.target.value)}
            placeholder="Search notifications"
            className="h-10 w-full rounded-lg border border-base-border bg-base-raised pl-9 pr-3 text-sm text-ink outline-none focus:border-brand"
          />
        </label>
        <select value={filters.read === undefined ? "all" : String(filters.read)} onChange={(event) => updateFilter("read", event.target.value === "all" ? undefined : event.target.value === "true")} className="h-10 rounded-lg border border-base-border bg-base-raised px-3 text-sm text-ink">
          <option value="all">All activity</option><option value="false">Unread</option><option value="true">Read</option>
        </select>
        <select value={filters.category ?? ""} onChange={(event) => updateFilter("category", event.target.value || undefined)} className="h-10 rounded-lg border border-base-border bg-base-raised px-3 text-sm capitalize text-ink">
          <option value="">All categories</option>
          {NOTIFICATION_CATEGORIES.map((category) => <option key={category} value={category}>{categoryLabels[category]}</option>)}
        </select>
        <select value={filters.priority ?? ""} onChange={(event) => updateFilter("priority", event.target.value || undefined)} className="h-10 rounded-lg border border-base-border bg-base-raised px-3 text-sm capitalize text-ink">
          <option value="">All priorities</option><option value="critical">Critical</option><option value="high">High</option><option value="normal">Normal</option><option value="low">Low</option>
        </select>
        <button onClick={() => void load(false)} className="inline-flex h-10 items-center justify-center gap-2 rounded-lg border border-base-border text-sm font-medium text-ink hover:bg-base-raised"><RefreshCw size={14} /> Refresh</button>
        <input type="date" value={filters.dateFrom ?? ""} onChange={(event) => updateFilter("dateFrom", event.target.value ? new Date(`${event.target.value}T00:00:00`).toISOString() : undefined)} aria-label="From date" className="h-10 rounded-lg border border-base-border bg-base-raised px-3 text-sm text-ink" />
        <input type="date" value={filters.dateTo?.slice(0, 10) ?? ""} onChange={(event) => updateFilter("dateTo", event.target.value ? new Date(`${event.target.value}T23:59:59.999`).toISOString() : undefined)} aria-label="To date" className="h-10 rounded-lg border border-base-border bg-base-raised px-3 text-sm text-ink" />
      </div>

      <div className="overflow-hidden rounded-xl border border-base-border bg-base-surface shadow-card">
        {loading ? (
          <div className="flex min-h-56 items-center justify-center gap-2 text-sm text-ink-muted"><Loader2 className="animate-spin" size={18} /> Loading notifications…</div>
        ) : error ? (
          <div className="flex min-h-56 flex-col items-center justify-center gap-3 px-5 text-center"><CircleAlert className="text-danger" /><p className="text-sm text-ink">{error}</p><button onClick={() => void load(false)} className="rounded-lg bg-brand px-3 py-2 text-sm font-medium text-white">Try again</button></div>
        ) : rows.length === 0 ? (
          <div className="py-16 md:py-24">
            {isFiltering ? (
              <EmptyState 
                title="No notifications match these filters" 
                description="Try clearing your search or filters to see more activity." 
                primaryAction={<button onClick={() => setFilters({ limit: 30 })} className="rounded-lg border border-base-border bg-base-surface px-4 py-2 text-[13px] font-medium text-ink hover:bg-base-border">Clear Filters</button>}
              />
            ) : (
              <EmptyState 
                title="You're all caught up" 
                description="New workspace activity and alerts will appear here." 
              />
            )}
          </div>
        ) : (
          rows.map((notification) => {
            const localized = localizeNotification(notification, language);
            return <article key={notification.id} className={`flex gap-3 border-b border-base-border p-4 last:border-0 ${notification.is_read ? "" : "bg-brand/[0.035]"}`}>
              <button onClick={() => void open(notification)} className="min-w-0 flex-1 text-left">
                <div className="flex flex-wrap items-center gap-2">
                  {!notification.is_read && <span className="h-2 w-2 rounded-full bg-brand" />}
                  <h2 className="truncate text-sm font-semibold text-ink">{localized.title}</h2>
                  <span className="max-w-36 truncate text-[10px] font-medium text-ink-faint">{workspace?.name}</span>
                  <span className="rounded-full bg-base-raised px-2 py-0.5 text-[10px] font-semibold capitalize text-ink-muted">{categoryLabels[notification.category]}</span>
                  {notification.priority !== "normal" && <span className={`rounded-full px-2 py-0.5 text-[10px] font-semibold capitalize ${notification.priority === "critical" ? "bg-red-500/10 text-red-600" : "bg-amber-500/10 text-amber-600"}`}>{notification.priority}</span>}
                  {notification.occurrence_count > 1 && <span className="text-[11px] text-ink-faint">×{notification.occurrence_count}</span>}
                </div>
                <p className="mt-1 text-sm text-ink-muted">{localized.message}</p>
                <time className="mt-1 block text-xs text-ink-faint">{formatDateTime(notification.created_at)}</time>
              </button>
              <div className="flex shrink-0 items-start gap-1">
                <button title={notification.is_read ? "Mark unread" : "Mark read"} onClick={() => void runAction(() => markNotificationsRead(workspace!.id, [notification.id], !notification.is_read), notification.is_read ? "Marked unread" : "Marked read")} className="rounded-lg p-2 text-ink-muted hover:bg-base-raised hover:text-ink"><CheckCheck size={15} /></button>
                <button title="Archive" onClick={() => void runAction(() => archiveNotifications(workspace!.id, [notification.id]), "Notification archived")} className="rounded-lg p-2 text-ink-muted hover:bg-base-raised hover:text-ink"><Archive size={15} /></button>
                <button title="Delete" onClick={() => void runAction(() => deleteNotifications(workspace!.id, [notification.id]), "Notification deleted")} className="rounded-lg p-2 text-ink-muted hover:bg-red-500/10 hover:text-red-600"><Trash2 size={15} /></button>
              </div>
            </article>;
          })
        )}
      </div>

      {cursor && <div className="mt-4 text-center"><button disabled={loadingMore} onClick={() => void load(true)} className="inline-flex items-center gap-2 rounded-lg border border-base-border bg-base-surface px-4 py-2 text-sm font-medium text-ink hover:bg-base-raised disabled:opacity-60">{loadingMore && <Loader2 className="animate-spin" size={14} />} Load more</button></div>}
    </div>
  );
}
