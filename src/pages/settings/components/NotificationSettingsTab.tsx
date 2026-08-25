import { useCallback, useEffect, useMemo, useState } from "react";
import { Bell, BellOff, Check, ChevronDown, Laptop, Loader2, Play, RefreshCw, Smartphone, Trash2, Volume2 } from "lucide-react";
import { toast } from "../../../components/Toast";
import { useNotifications } from "../../../contexts/NotificationContext";
import { useAuth } from "../../../hooks/useAuth";
import { NOTIFICATION_EVENTS, type NotificationEventKey } from "../../../notifications/registry";
import { NOTIFICATION_CATEGORIES, type NotificationChannel, type NotificationDevice, type NotificationPermissionState, type NotificationPreference, type NotificationUserSettings } from "../../../notifications/types";
import {
  browserNotificationPermissionState,
  currentNotificationDeviceId,
  currentPushSubscriptionActive,
  enableBrowserNotifications,
  listNotificationDevices,
  loadNotificationPreferences,
  loadNotificationSettings,
  removeNotificationDevice,
  removeOtherNotificationDevices,
  resetNotificationPreferences,
  saveNotificationPreferences,
  saveNotificationSettings,
  sendTestNotification,
  updateNotificationDevice,
} from "../../../services/notificationService";

const DAYS = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];
const TIMEZONES = ["Africa/Casablanca", "Africa/Algiers", "Africa/Tunis", "Europe/Paris", "Europe/London", "UTC"];

function Toggle({ checked, onChange, disabled = false, label }: { checked: boolean; onChange: (value: boolean) => void; disabled?: boolean; label: string }) {
  return <button type="button" role="switch" aria-checked={checked} aria-label={label} disabled={disabled} onClick={() => onChange(!checked)} className={`relative h-6 w-11 shrink-0 rounded-full transition ${checked ? "bg-brand" : "bg-base-border"} disabled:cursor-not-allowed disabled:opacity-50`}><span className={`absolute top-0.5 h-5 w-5 rounded-full bg-white shadow transition-transform ${checked ? "translate-x-5" : "translate-x-0.5"}`} /></button>;
}

function PermissionMessage({ state }: { state: NotificationPermissionState }) {
  const messages: Record<NotificationPermissionState, string> = {
    active: "Push is active on this browser.",
    allowed: "Permission is allowed, but this browser is not currently subscribed.",
    not_requested: "Permission has not been requested. Ecom OS will ask only after you choose Enable.",
    denied: "Notifications are blocked. Allow them in this site's browser settings, then reload.",
    unsupported: "This browser does not support Web Push. On iPhone/iPad, install Ecom OS to the Home Screen and open the installed app.",
    subscription_expired: "This subscription expired. Enable notifications again to renew it.",
  };
  return <p className={`text-xs ${state === "denied" || state === "unsupported" ? "text-amber-600" : "text-ink-muted"}`}>{messages[state]}</p>;
}

export default function NotificationSettingsTab() {
  const { workspace, session, isDemoMode } = useAuth();
  const notificationContext = useNotifications();
  const [settings, setSettings] = useState<NotificationUserSettings | null>(null);
  const [preferences, setPreferences] = useState<NotificationPreference[]>([]);
  const [devices, setDevices] = useState<NotificationDevice[]>([]);
  const [permission, setPermission] = useState<NotificationPermissionState>("not_requested");
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [showPermissionModal, setShowPermissionModal] = useState(false);
  const [openCategories, setOpenCategories] = useState(new Set<string>(["orders"]));
  const [eventSearch, setEventSearch] = useState("");

  const reload = useCallback(async () => {
    if (isDemoMode || !workspace?.id || !session?.user.id) {
      setLoading(false);
      return;
    }
    setLoading(true);
    try {
      const active = await currentPushSubscriptionActive();
      const [nextSettings, nextPreferences, nextDevices] = await Promise.all([
        loadNotificationSettings(workspace.id, session.user.id),
        loadNotificationPreferences(workspace.id, session.user.id),
        listNotificationDevices(workspace.id),
      ]);
      setSettings(nextSettings);
      setPreferences(nextPreferences);
      setDevices(nextDevices);
      const localDeviceId = currentNotificationDeviceId(workspace.id);
      const localDevice = nextDevices.find((device) => device.id === localDeviceId);
      if (active && localDevice && (!localDevice.is_active || (localDevice.expires_at && new Date(localDevice.expires_at) <= new Date()))) {
        setPermission("subscription_expired");
      } else {
        setPermission(browserNotificationPermissionState(active && Boolean(localDevice?.is_active)));
      }
    } catch (cause) {
      toast.error(cause instanceof Error ? cause.message : "Notification settings could not be loaded.");
    } finally {
      setLoading(false);
    }
  }, [isDemoMode, session?.user.id, workspace?.id]);

  useEffect(() => { void reload(); }, [reload]);

  const updateSettings = async (patch: Partial<NotificationUserSettings>) => {
    if (!settings) return;
    const previous = settings;
    const next = { ...settings, ...patch };
    setSettings(next);
    setSaving(true);
    try {
      const saved = await saveNotificationSettings(next);
      setSettings(saved);
      await notificationContext.reload();
    } catch (cause) {
      setSettings(previous);
      toast.error(cause instanceof Error ? cause.message : "Settings could not be saved.");
    } finally {
      setSaving(false);
    }
  };

  const preferenceFor = (key: string) => preferences.find((item) => item.event_key === key);
  const effective = (key: NotificationEventKey, channel: NotificationChannel) => {
    const preference = preferenceFor(key);
    const override = channel === "in_app" ? preference?.in_app_enabled : channel === "push" ? preference?.push_enabled : preference?.sound_enabled;
    return override ?? NOTIFICATION_EVENTS[key].defaults[channel];
  };

  const setEventChannel = async (key: NotificationEventKey, channel: NotificationChannel, enabled: boolean) => {
    if (!workspace?.id || !session?.user.id) return;
    const existing = preferenceFor(key);
    const next: NotificationPreference = existing ?? { workspace_id: workspace.id, user_id: session.user.id, event_key: key, in_app_enabled: null, push_enabled: null, sound_enabled: null, delivery_mode: "immediate" };
    const updated = { ...next, [`${channel}_enabled`]: enabled } as NotificationPreference;
    setPreferences((current) => [...current.filter((item) => item.event_key !== key), updated]);
    try {
      await saveNotificationPreferences([updated]);
    } catch (cause) {
      setPreferences((current) => [...current.filter((item) => item.event_key !== key), ...(existing ? [existing] : [])]);
      toast.error(cause instanceof Error ? cause.message : "Preference could not be saved.");
    }
  };

  const setAllEvents = async (enabled: boolean) => {
    if (!workspace?.id || !session?.user.id) return;
    const next = (Object.keys(NOTIFICATION_EVENTS) as NotificationEventKey[]).map((key) => ({
      workspace_id: workspace.id,
      user_id: session.user.id,
      event_key: key,
      in_app_enabled: enabled,
      push_enabled: enabled && NOTIFICATION_EVENTS[key].availableChannels.includes("push"),
      sound_enabled: enabled && NOTIFICATION_EVENTS[key].defaults.sound,
      delivery_mode: enabled ? "immediate" : "off",
    } satisfies NotificationPreference));
    setSaving(true);
    try { await saveNotificationPreferences(next); setPreferences(next); toast.success(enabled ? "All notification events enabled" : "All notification events disabled"); }
    catch (cause) { toast.error(cause instanceof Error ? cause.message : "Preferences could not be saved."); }
    finally { setSaving(false); }
  };

  const setCategory = async (category: string, enabled: boolean) => {
    if (!workspace?.id || !session?.user.id) return;
    const next = (Object.keys(NOTIFICATION_EVENTS) as NotificationEventKey[])
      .filter((key) => NOTIFICATION_EVENTS[key].category === category)
      .map((key) => ({
        workspace_id: workspace.id,
        user_id: session.user.id,
        event_key: key,
        in_app_enabled: enabled,
        push_enabled: enabled && NOTIFICATION_EVENTS[key].defaults.push,
        sound_enabled: enabled && NOTIFICATION_EVENTS[key].defaults.sound,
        delivery_mode: enabled ? "immediate" as const : "off" as const,
      }));
    try {
      await saveNotificationPreferences(next);
      setPreferences((current) => [...current.filter((item) => item.event_key && !next.some((replacement) => replacement.event_key === item.event_key)), ...next]);
      toast.success(`${category.replace(/_/g, " ")} notifications ${enabled ? "enabled" : "disabled"}`);
    } catch (cause) { toast.error(cause instanceof Error ? cause.message : "Category preferences could not be saved."); }
  };

  const resetRecommended = async () => {
    if (!workspace?.id || !session?.user.id) return;
    setSaving(true);
    try {
      await resetNotificationPreferences(workspace.id, session.user.id);
      setPreferences([]);
      await updateSettings({
        notifications_enabled: true,
        in_app_enabled: true,
        sound_enabled: true,
        quiet_hours_enabled: false,
        quiet_hours_start: "22:00",
        quiet_hours_end: "08:00",
        timezone: "Africa/Casablanca",
        quiet_days: [0, 1, 2, 3, 4, 5, 6],
        allow_critical_during_quiet_hours: true,
        private_preview_enabled: true,
        muted_until: null,
      });
      toast.success("Recommended notification defaults restored");
    } catch (cause) { toast.error(cause instanceof Error ? cause.message : "Defaults could not be restored."); }
    finally { setSaving(false); }
  };

  const resetCategory = async (category: string) => {
    if (!workspace?.id || !session?.user.id) return;
    const keys = (Object.keys(NOTIFICATION_EVENTS) as NotificationEventKey[]).filter((key) => NOTIFICATION_EVENTS[key].category === category);
    try {
      await resetNotificationPreferences(workspace.id, session.user.id, keys);
      setPreferences((current) => current.filter((item) => !keys.includes(item.event_key as NotificationEventKey)));
      toast.success("Category defaults restored");
    } catch (cause) { toast.error(cause instanceof Error ? cause.message : "Defaults could not be restored."); }
  };

  const enablePush = async () => {
    if (!workspace?.id) return;
    setSaving(true);
    try {
      await enableBrowserNotifications(workspace.id);
      if (settings) await updateSettings({ push_enabled: true });
      await sendTestNotification(workspace.id);
      await reload();
      toast.success("Browser notifications enabled; a test notification was queued");
    } catch (cause) {
      setPermission(browserNotificationPermissionState(false));
      toast.error(cause instanceof Error ? cause.message : "Browser notifications could not be enabled.");
    } finally {
      setSaving(false);
      setShowPermissionModal(false);
    }
  };

  const filteredEvents = useMemo(() => Object.entries(NOTIFICATION_EVENTS).filter(([key, event]) => `${key} ${event.label} ${event.description}`.toLowerCase().includes(eventSearch.toLowerCase())), [eventSearch]);
  const currentDeviceId = workspace?.id ? currentNotificationDeviceId(workspace.id) : null;

  if (loading) return <div className="flex min-h-52 items-center justify-center gap-2 text-sm text-ink-muted"><Loader2 className="animate-spin" size={18} /> Loading notification settings…</div>;
  if (!settings) return <div className="rounded-xl border border-base-border bg-base-surface p-5 text-sm text-ink-muted">Notification settings are unavailable in demo mode.</div>;

  return (
    <div className="space-y-5 pb-10">
      <section className="rounded-xl border border-base-border bg-base-surface p-5 shadow-card">
        <div className="mb-5 flex items-start justify-between gap-4"><div><h2 className="text-base font-semibold text-ink">Notification controls</h2><p className="mt-1 text-sm text-ink-muted">Choose how Ecom OS reaches you in this workspace.</p></div>{saving && <Loader2 className="animate-spin text-brand" size={18} />}</div>
        <div className="divide-y divide-base-border">
          {[
            ["notifications_enabled", "All notifications", "Master switch for this workspace", Bell],
            ["in_app_enabled", "In-app notifications", "Bell inbox and foreground toasts", Check],
            ["sound_enabled", "Notification sound", "Plays once after a browser interaction", Volume2],
          ].map(([key, label, description, Icon]) => <div key={String(key)} className="flex items-center justify-between gap-4 py-3"><div className="flex items-center gap-3"><Icon size={17} className="text-ink-muted" /><div><p className="text-sm font-medium text-ink">{String(label)}</p><p className="text-xs text-ink-muted">{String(description)}</p></div></div><Toggle label={String(label)} checked={Boolean(settings[key as keyof NotificationUserSettings])} onChange={(value) => void updateSettings({ [String(key)]: value } as Partial<NotificationUserSettings>)} /></div>)}
        </div>
        <div className="mt-4 flex flex-wrap gap-2 border-t border-base-border pt-4">
          {settings.muted_until && new Date(settings.muted_until) > new Date() ? <button onClick={() => void updateSettings({ muted_until: null })} className="inline-flex items-center gap-2 rounded-lg border border-base-border px-3 py-2 text-xs font-semibold text-ink"><Bell size={13} /> Unmute now</button> : <><button onClick={() => void updateSettings({ muted_until: new Date(Date.now() + 60 * 60 * 1000).toISOString() })} className="inline-flex items-center gap-2 rounded-lg border border-base-border px-3 py-2 text-xs font-semibold text-ink"><BellOff size={13} /> Mute for 1 hour</button><button onClick={() => void updateSettings({ muted_until: new Date(Date.now() + 8 * 60 * 60 * 1000).toISOString() })} className="rounded-lg border border-base-border px-3 py-2 text-xs font-semibold text-ink">Mute for 8 hours</button></>}
          <button onClick={() => void resetRecommended()} className="rounded-lg border border-base-border px-3 py-2 text-xs font-semibold text-brand">Reset recommended defaults</button>
        </div>
      </section>

      <section className="rounded-xl border border-base-border bg-base-surface p-5 shadow-card">
        <div className="flex flex-wrap items-start justify-between gap-3"><div><h2 className="text-base font-semibold text-ink">Browser push</h2><PermissionMessage state={permission} /></div><button disabled={saving || permission === "unsupported" || permission === "denied"} onClick={() => setShowPermissionModal(true)} className="inline-flex items-center gap-2 rounded-lg bg-brand px-3 py-2 text-sm font-semibold text-white disabled:cursor-not-allowed disabled:opacity-50"><Bell size={15} />{permission === "active" ? "Renew subscription" : "Enable on this device"}</button></div>
        <div className="mt-4 flex items-center justify-between border-t border-base-border pt-4"><div><p className="text-sm font-medium text-ink">Push delivery</p><p className="text-xs text-ink-muted">Server-delivered alerts when Ecom OS is closed.</p></div><Toggle label="Push delivery" checked={settings.push_enabled} onChange={(value) => void updateSettings({ push_enabled: value })} disabled={permission !== "active" && !settings.push_enabled} /></div>
        <button onClick={() => void sendTestNotification(workspace!.id).then(() => toast.success("Test notification queued")).catch((cause) => toast.error(cause.message))} disabled={permission !== "active"} className="mt-3 inline-flex items-center gap-2 rounded-lg border border-base-border px-3 py-2 text-xs font-semibold text-ink hover:bg-base-raised disabled:opacity-50"><Play size={13} /> Send test notification</button>
      </section>

      <section className="rounded-xl border border-base-border bg-base-surface p-5 shadow-card">
        <div className="flex items-center justify-between"><div><h2 className="text-base font-semibold text-ink">Quiet hours</h2><p className="text-xs text-ink-muted">Push and sound wait until quiet hours end. In-app records remain available.</p></div><Toggle label="Quiet hours" checked={settings.quiet_hours_enabled} onChange={(value) => void updateSettings({ quiet_hours_enabled: value })} /></div>
        <div className="mt-4 grid gap-3 sm:grid-cols-3"><label className="text-xs text-ink-muted">From<input type="time" value={settings.quiet_hours_start.slice(0,5)} onChange={(event) => void updateSettings({ quiet_hours_start: event.target.value })} className="mt-1 block h-10 w-full rounded-lg border border-base-border bg-base-raised px-3 text-sm text-ink" /></label><label className="text-xs text-ink-muted">Until<input type="time" value={settings.quiet_hours_end.slice(0,5)} onChange={(event) => void updateSettings({ quiet_hours_end: event.target.value })} className="mt-1 block h-10 w-full rounded-lg border border-base-border bg-base-raised px-3 text-sm text-ink" /></label><label className="text-xs text-ink-muted">Time zone<select value={settings.timezone} onChange={(event) => void updateSettings({ timezone: event.target.value })} className="mt-1 block h-10 w-full rounded-lg border border-base-border bg-base-raised px-3 text-sm text-ink">{TIMEZONES.map((zone) => <option key={zone}>{zone}</option>)}</select></label></div>
        <div className="mt-3 flex flex-wrap gap-2">{DAYS.map((day, index) => <button key={day} onClick={() => void updateSettings({ quiet_days: settings.quiet_days.includes(index) ? settings.quiet_days.filter((value) => value !== index) : [...settings.quiet_days, index].sort() })} className={`rounded-lg px-3 py-1.5 text-xs font-medium ${settings.quiet_days.includes(index) ? "bg-brand text-white" : "bg-base-raised text-ink-muted"}`}>{day}</button>)}</div>
        <div className="mt-4 flex items-center justify-between border-t border-base-border pt-4"><div><p className="text-sm font-medium text-ink">Allow critical alerts</p><p className="text-xs text-ink-muted">Only registry-approved critical events can bypass quiet hours.</p></div><Toggle label="Allow critical alerts" checked={settings.allow_critical_during_quiet_hours} onChange={(value) => void updateSettings({ allow_critical_during_quiet_hours: value })} /></div>
        <div className="mt-4 flex items-center justify-between"><div><p className="text-sm font-medium text-ink">Private lock-screen previews</p><p className="text-xs text-ink-muted">Hide order/customer detail in push previews.</p></div><Toggle label="Private previews" checked={settings.private_preview_enabled} onChange={(value) => void updateSettings({ private_preview_enabled: value })} /></div>
      </section>

      <section className="rounded-xl border border-base-border bg-base-surface p-5 shadow-card">
        <div className="flex flex-wrap items-center justify-between gap-3"><div><h2 className="text-base font-semibold text-ink">Event preferences</h2><p className="text-xs text-ink-muted">Defaults are secure and workspace-aware; your choices override them.</p></div><div className="flex gap-2"><button onClick={() => void setAllEvents(false)} className="rounded-lg border border-base-border px-3 py-2 text-xs font-semibold text-ink">Disable all</button><button onClick={() => void setAllEvents(true)} className="rounded-lg bg-brand px-3 py-2 text-xs font-semibold text-white">Enable all</button></div></div>
        <input value={eventSearch} onChange={(event) => setEventSearch(event.target.value)} placeholder="Search event types" className="mt-4 h-10 w-full rounded-lg border border-base-border bg-base-raised px-3 text-sm text-ink outline-none focus:border-brand" />
        <div className="mt-3 space-y-2">{NOTIFICATION_CATEGORIES.map((category) => {
          const events = filteredEvents.filter(([, event]) => event.category === category);
          if (!events.length) return null;
          const open = openCategories.has(category);
          return <div key={category} className="overflow-hidden rounded-lg border border-base-border"><div className="flex items-center justify-between gap-2 bg-base-raised px-3 py-2"><button onClick={() => setOpenCategories((current) => { const next = new Set(current); next.has(category) ? next.delete(category) : next.add(category); return next; })} className="flex flex-1 items-center gap-2 text-left text-sm font-semibold capitalize text-ink"><ChevronDown size={14} className={open ? "rotate-180" : ""} />{category.replace(/_/g," ")} <span className="text-xs font-normal text-ink-faint">{events.length}</span></button><button onClick={() => void setCategory(category, true)} className="text-[11px] font-semibold text-emerald-600">Enable</button><button onClick={() => void setCategory(category, false)} className="text-[11px] font-semibold text-red-600">Disable</button><button onClick={() => void resetCategory(category)} className="inline-flex items-center gap-1 text-xs font-medium text-brand"><RefreshCw size={12} /> Defaults</button></div>{open && <div className="divide-y divide-base-border">{events.map(([key, event]) => <div key={key} className="grid gap-3 px-3 py-3 md:grid-cols-[1fr_auto_auto_auto]"><div><div className="flex flex-wrap items-center gap-2"><p className="text-sm font-medium text-ink">{event.label}</p><span className="rounded bg-base-raised px-1.5 py-0.5 text-[10px] capitalize text-ink-faint">{event.defaultPriority}</span>{event.cooldownSeconds > 0 && <span className="text-[10px] text-ink-faint">grouped for {Math.round(event.cooldownSeconds / 60)} min</span>}</div><p className="text-xs text-ink-muted">{event.description}</p></div>{(["in_app","push","sound"] as NotificationChannel[]).map((channel) => <label key={channel} className={`flex items-center justify-between gap-2 text-xs capitalize text-ink-muted md:w-20 ${!event.availableChannels.includes(channel) ? "opacity-35" : ""}`}>{channel.replace("_"," ")}<Toggle label={`${event.label} ${channel}`} checked={effective(key as NotificationEventKey, channel)} disabled={!event.availableChannels.includes(channel)} onChange={(value) => void setEventChannel(key as NotificationEventKey, channel, value)} /></label>)}</div>)}</div>}</div>;
        })}</div>
      </section>

      <section className="rounded-xl border border-base-border bg-base-surface p-5 shadow-card">
        <div className="flex items-center justify-between"><div><h2 className="text-base font-semibold text-ink">Devices</h2><p className="text-xs text-ink-muted">Endpoints and cryptographic keys are never shown in the browser.</p></div>{currentDeviceId && devices.length > 1 && <button onClick={() => void removeOtherNotificationDevices(workspace!.id, currentDeviceId).then(reload)} className="text-xs font-semibold text-red-600">Remove other devices</button>}</div>
        <div className="mt-3 divide-y divide-base-border">{devices.length === 0 ? <p className="py-4 text-sm text-ink-muted">No browser is subscribed yet.</p> : devices.map((device) => <div key={device.id} className="flex items-center gap-3 py-3">{device.device_type === "mobile" ? <Smartphone className="text-ink-muted" size={18} /> : <Laptop className="text-ink-muted" size={18} />}<div className="min-w-0 flex-1"><div className="flex items-center gap-2"><input aria-label="Device name" value={device.device_name} onChange={(event) => setDevices((current) => current.map((item) => item.id === device.id ? { ...item, device_name: event.target.value } : item))} onBlur={() => void updateNotificationDevice(workspace!.id, device.id, { device_name: device.device_name })} className="min-w-0 flex-1 bg-transparent text-sm font-medium text-ink outline-none" /><span className={`rounded-full px-2 py-0.5 text-[10px] font-semibold ${device.is_active ? "bg-emerald-500/10 text-emerald-600" : "bg-base-raised text-ink-muted"}`}>{device.is_active ? "Active" : "Disabled"}</span></div><p className="truncate text-xs text-ink-muted">{device.browser} · {device.operating_system} · {device.is_pwa ? "installed PWA" : "browser"} · created {new Date(device.created_at).toLocaleDateString()} · last active {new Date(device.last_active_at).toLocaleString()} {device.id === currentDeviceId ? "· this device" : ""}</p></div><Toggle label={`${device.device_name} active`} checked={device.is_active} onChange={(value) => void updateNotificationDevice(workspace!.id, device.id, { is_active: value }).then(reload)} /><button aria-label="Remove device" onClick={() => void removeNotificationDevice(workspace!.id, device.id).then(reload)} className="rounded-lg p-2 text-ink-muted hover:bg-red-500/10 hover:text-red-600"><Trash2 size={15} /></button></div>)}</div>
      </section>

      <button onClick={() => { const audio = new Audio("/notification.mp3"); void audio.play().catch(() => toast.warning("Your browser blocked audio. Interact with the page and try again.")); }} className="inline-flex items-center gap-2 rounded-lg border border-base-border px-3 py-2 text-xs font-semibold text-ink"><Volume2 size={13} /> Test sound</button>

      {showPermissionModal && <div className="fixed inset-0 z-[100] flex items-center justify-center p-4"><button aria-label="Close" onClick={() => setShowPermissionModal(false)} className="absolute inset-0 bg-black/50" /><div role="dialog" aria-modal="true" className="relative w-full max-w-md rounded-2xl border border-base-border bg-base-surface p-6 shadow-2xl"><Bell className="mb-3 text-brand" /><h2 className="text-lg font-semibold text-ink">Enable browser notifications?</h2><p className="mt-2 text-sm leading-6 text-ink-muted">Your browser will ask for permission. If allowed, this device receives selected Ecom OS alerts even when the app is closed. You can disable or remove the device at any time.</p><div className="mt-5 flex justify-end gap-2"><button onClick={() => setShowPermissionModal(false)} className="rounded-lg border border-base-border px-3 py-2 text-sm font-medium text-ink">Cancel</button><button onClick={() => void enablePush()} className="rounded-lg bg-brand px-3 py-2 text-sm font-semibold text-white">Continue</button></div></div></div>}
    </div>
  );
}
