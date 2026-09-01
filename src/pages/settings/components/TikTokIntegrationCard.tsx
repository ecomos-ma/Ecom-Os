import { useCallback, useEffect, useMemo, useState } from "react";
import { AlertTriangle, CheckCircle2, Loader2, MoreHorizontal, RefreshCw, Settings2, X } from "lucide-react";
import { useAuth } from "../../../hooks/useAuth";
import { getIntegrationLogo } from "../../../lib/integrationLogos";
import { getTikTokStatus, invokeTikTok, type TikTokIntegrationStatus } from "../../../lib/tiktok";
import { toast } from "../../../components/Toast";
import { supabase } from "../../../lib/supabase";
import { isOwnerLikeRole } from "../../../lib/rbac";

const EMPTY_STATUS: TikTokIntegrationStatus = { state: "not_connected", connection: null, ad_accounts: [], events_api: null };

function readableError(error: unknown): string {
  return error instanceof Error ? error.message : "TikTok Ads request failed";
}

export default function TikTokIntegrationCard({ autoOpenAccountSelection = false, onConnectionChange }: { autoOpenAccountSelection?: boolean; onConnectionChange?: (connected: boolean) => void }) {
  const { workspace, profile, refreshProfile } = useAuth();
  const [status, setStatus] = useState<TikTokIntegrationStatus>(EMPTY_STATUS);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [modal, setModal] = useState<"select" | "manage" | null>(autoOpenAccountSelection ? "select" : null);
  const [selected, setSelected] = useState<string[]>([]);
  const [currency, setCurrency] = useState(workspace?.reporting_currency ?? "");
  const [eventsEnabled, setEventsEnabled] = useState(false);
  const [eventSourceId, setEventSourceId] = useState("");
  const [eventsToken, setEventsToken] = useState("");
  const [testCode, setTestCode] = useState("");
  const [eventLogs, setEventLogs] = useState<Array<{ id: string; event_name: string; event_id: string; attempt_status: string; attempt_count: number; tiktok_response_code: string | null; created_at: string }>>([]);
  const canManage = Boolean(profile && isOwnerLikeRole(profile.role) || profile?.role === "founder" || profile?.role === "admin" || profile?.role === "manager");

  const reload = useCallback(async () => {
    if (!workspace) return;
    setLoading(true);
    try {
      const next = await getTikTokStatus(workspace.id);
      setStatus(next);
      setSelected(next.ad_accounts.filter((account) => account.is_enabled).map((account) => account.advertiser_id));
      setEventsEnabled(next.events_api?.enabled ?? false);
      setEventSourceId(next.events_api?.event_source_id ?? "");
      if (canManage) {
        const { data: logs } = await supabase.from("tiktok_event_logs").select("id,event_name,event_id,attempt_status,attempt_count,tiktok_response_code,created_at").eq("workspace_id", workspace.id).order("created_at", { ascending: false }).limit(10);
        setEventLogs(logs ?? []);
      } else {
        setEventLogs([]);
      }
      if (next.state === "pending_account_selection" || (autoOpenAccountSelection && next.ad_accounts.length > 0)) setModal("select");
    } catch (error) {
      setStatus(EMPTY_STATUS);
      console.error("[TikTok Ads] Status load failed", error);
    } finally {
      setLoading(false);
    }
  }, [autoOpenAccountSelection, canManage, workspace]);

  useEffect(() => { void reload(); }, [reload]);
  useEffect(() => { setCurrency(workspace?.reporting_currency ?? ""); }, [workspace?.reporting_currency]);
  useEffect(() => {
    const parameters = new URLSearchParams(window.location.search);
    if (parameters.get("tiktok") === "error") toast.error(parameters.get("tiktok_message") || "TikTok authorization could not be completed.");
  }, []);

  const connected = status.connection !== null && !["not_connected", "disconnected", "reauth_required"].includes(status.state);

  // Report connection state to parent
  useEffect(() => {
    onConnectionChange?.(connected);
  }, [connected, onConnectionChange]);

  const badge = useMemo(() => {
    if (loading) return "Checking";
    if (status.state === "syncing") return "Syncing";
    if (status.state === "sync_failed") return "Sync failed";
    if (status.state === "configuration_required") return "Configuration required";
    if (status.state === "reauth_required") return "Reconnect required";
    if (status.state === "pending_account_selection") return "Select account";
    return connected ? "Connected" : "Not connected";
  }, [connected, loading, status.state]);

  const run = async (operation: () => Promise<unknown>, success: string) => {
    setBusy(true);
    try { await operation(); toast.success(success); await reload(); }
    catch (error) { toast.error(readableError(error)); }
    finally { setBusy(false); }
  };

  const connect = async () => {
    if (!workspace) return;
    setBusy(true);
    try {
      const response = await invokeTikTok<{ authorize_url: string }>("tiktok-auth-start", {
        workspace_id: workspace.id,
        return_url: `${window.location.origin}/settings?tab=integrations&tiktok=select_accounts`,
      });
      window.location.assign(response.authorize_url);
    } catch (error) {
      const message = readableError(error);
      if (/not configured|configuration/i.test(message)) setStatus((current) => ({ ...current, state: "configuration_required" }));
      toast.error(message);
      setBusy(false);
    }
  };

  const saveAccounts = () => run(async () => {
    if (!workspace) return;
    await invokeTikTok("tiktok-advertisers", { workspace_id: workspace.id, action: "select", advertiser_ids: selected });
    setModal("manage");
  }, "TikTok advertiser accounts saved and initial sync started.");

  const syncNow = () => run(async () => {
    if (!workspace) return;
    await invokeTikTok("tiktok-sync", { workspace_id: workspace.id, days: 14 });
  }, "TikTok Ads sync completed.");

  const saveSettings = () => run(async () => {
    if (!workspace) return;
    if (currency.trim()) await invokeTikTok("tiktok-advertisers", { workspace_id: workspace.id, action: "set_workspace_currency", reporting_currency: currency });
    await invokeTikTok("tiktok-advertisers", {
      workspace_id: workspace.id,
      action: "configure_events",
      enabled: eventsEnabled,
      event_source_id: eventSourceId,
      events_access_token: eventsToken || undefined,
      test_event_code: testCode || undefined,
    });
    setEventsToken("");
    await refreshProfile();
  }, "TikTok settings saved.");

  const disconnect = () => {
    if (!workspace || !window.confirm("Disconnect TikTok Ads? Historical reporting data will be preserved.")) return;
    void run(async () => { await invokeTikTok("tiktok-disconnect", { workspace_id: workspace.id }); setModal(null); }, "TikTok Ads disconnected. Historical reports were preserved.");
  };

  return (
    <>
      <div className="group relative flex h-full flex-col overflow-hidden rounded-[24px] border border-base-border bg-base-surface p-6 shadow-sm transition-all duration-150 hover:scale-[1.02] hover:shadow-md">
        <button className="absolute right-4 top-4 text-ink-faint" aria-label="TikTok integration menu"><MoreHorizontal size={18} /></button>
        <img src={getIntegrationLogo("tiktok")} alt="TikTok Ads" className="mb-4 h-12 w-12 rounded-2xl border border-base-border object-contain" />
        <h3 className="text-[16px] font-semibold text-ink">TikTok Ads</h3>
        <span className={`mt-2 flex w-fit items-center gap-1 rounded-full px-2.5 py-1 text-[10.5px] font-bold uppercase tracking-wider ${connected ? "bg-emerald-500/15 text-emerald-600" : status.state.includes("failed") || status.state === "reauth_required" ? "bg-danger/10 text-danger" : "bg-base-raised text-ink-muted"}`}>
          {connected ? <CheckCircle2 size={11} /> : status.state === "sync_failed" ? <AlertTriangle size={11} /> : null}{badge}
        </span>
        <p className="mt-3 min-h-[40px] flex-1 text-[13px] leading-relaxed text-ink-muted">Sync real campaigns, delivery metrics, COD attribution, profit, and TikTok Events API outcomes.</p>
        {status.connection?.last_sync_error && <p className="mb-3 text-[11px] text-danger">{status.connection.last_sync_error}</p>}
        <div className="mt-auto border-t border-base-border/60 pt-4">
          {connected ? (
            <div className="grid grid-cols-2 gap-2">
              <button onClick={syncNow} disabled={busy} className="flex h-[38px] items-center justify-center gap-2 rounded-xl bg-base-raised text-[13px] font-semibold text-ink disabled:opacity-60"><RefreshCw size={13} className={busy ? "animate-spin" : ""} /> Sync</button>
              <button onClick={() => setModal(status.state === "pending_account_selection" ? "select" : "manage")} className="h-[38px] rounded-xl bg-brand px-3 text-[13px] font-semibold text-white">Manage</button>
            </div>
          ) : <button onClick={() => void connect()} disabled={busy || !canManage} title={canManage ? undefined : "A workspace administrator must connect TikTok Ads"} className="h-[38px] w-full rounded-xl bg-brand text-[13px] font-semibold text-white disabled:opacity-60">{status.state === "reauth_required" ? "Reconnect" : status.state === "configuration_required" ? "Retry configuration" : "Connect"}</button>}
        </div>
      </div>

      {modal && (
        <div className="fixed inset-0 z-[999] flex items-center justify-center p-4">
          <div className="absolute inset-0 bg-black/50 backdrop-blur-sm" onClick={() => !busy && setModal(null)} />
          <div className="relative z-10 max-h-[90vh] w-full max-w-2xl overflow-y-auto rounded-[28px] border border-base-border bg-base-surface shadow-2xl">
            <div className="sticky top-0 flex items-center gap-3 border-b border-base-border bg-base-surface px-6 py-5">
              <img src={getIntegrationLogo("tiktok")} alt="" className="h-10 w-10 rounded-xl" />
              <div className="flex-1"><h2 className="text-[18px] font-bold text-ink">TikTok Ads</h2><p className="text-[12px] text-ink-muted">{modal === "select" ? "Choose one or more authorized advertisers" : "Manage accounts, sync, and Events API"}</p></div>
              <button onClick={() => setModal(null)} className="rounded-full bg-base-raised p-2 text-ink-muted"><X size={16} /></button>
            </div>
            <div className="space-y-5 p-6">
              <div className="space-y-2">
                {status.ad_accounts.length === 0 ? <p className="rounded-xl bg-base-raised p-4 text-[13px] text-ink-muted">No authorized advertiser accounts were returned. Confirm the TikTok Business user has advertiser access, then reconnect.</p> : status.ad_accounts.map((account) => (
                  <label key={account.id} className="flex items-center gap-3 rounded-xl border border-base-border bg-base-raised/50 p-3">
                    <input type="checkbox" checked={selected.includes(account.advertiser_id)} onChange={(event) => setSelected((current) => event.target.checked ? [...new Set([...current, account.advertiser_id])] : current.filter((id) => id !== account.advertiser_id))} />
                    <div className="min-w-0 flex-1"><div className="truncate text-[13px] font-semibold text-ink">{account.advertiser_name || "Unnamed advertiser"}</div><div className="text-[11px] text-ink-muted">ID {account.advertiser_id} · {account.currency || "currency unavailable"} · {account.timezone || "timezone unavailable"}</div></div>
                    <span className="text-[11px] text-ink-muted">{account.reporting_sync_status}</span>
                    {modal === "manage" && <button type="button" disabled={busy} onClick={(event) => { event.preventDefault(); if (workspace && window.confirm(`Remove advertiser ${account.advertiser_name}? Historical reports are preserved.`)) void run(() => invokeTikTok("tiktok-advertisers", { workspace_id: workspace.id, action: "remove_account", advertiser_id: account.advertiser_id }), "Advertiser removed. Historical reports were preserved."); }} className="rounded-lg bg-danger/10 px-2 py-1 text-[10px] font-semibold text-danger">Remove</button>}
                  </label>
                ))}
                <button onClick={saveAccounts} disabled={busy || selected.length === 0} className="flex w-full items-center justify-center gap-2 rounded-xl bg-brand py-2.5 text-[13px] font-semibold text-white disabled:opacity-50">{busy && <Loader2 size={14} className="animate-spin" />} Save accounts</button>
              </div>

              {modal === "manage" && <>
                <div className="rounded-xl border border-base-border p-4">
                  <div className="mb-3 flex items-center gap-2 text-[13px] font-semibold text-ink"><Settings2 size={14} /> Reporting</div>
                  <label className="text-[11px] text-ink-muted">Workspace revenue currency</label>
                  <input value={currency} onChange={(event) => setCurrency(event.target.value.toUpperCase().slice(0, 3))} placeholder="MAD" className="mt-1 w-full rounded-lg border border-base-border bg-base-raised px-3 py-2 text-[13px] text-ink" />
                  <label className="mt-3 flex items-center gap-2 text-[12px] text-ink"><input type="checkbox" checked={status.connection?.auto_sync_enabled ?? false} onChange={(event) => workspace && void run(() => invokeTikTok("tiktok-advertisers", { workspace_id: workspace.id, action: "set_auto_sync", enabled: event.target.checked }), "Automatic sync updated.")} /> Automatic scheduled sync</label>
                </div>
                <div className="rounded-xl border border-base-border p-4">
                  <label className="flex items-center gap-2 text-[13px] font-semibold text-ink"><input type="checkbox" checked={eventsEnabled} onChange={(event) => setEventsEnabled(event.target.checked)} /> TikTok Events API</label>
                  <p className="mt-1 text-[11px] text-ink-muted">Sends PlaceAnOrder and delivered-COD CompletePayment events with stable IDs for deduplication.</p>
                  <div className="mt-3 grid gap-2 sm:grid-cols-2">
                    <input value={eventSourceId} onChange={(event) => setEventSourceId(event.target.value)} placeholder="Event Source ID" className="rounded-lg border border-base-border bg-base-raised px-3 py-2 text-[12px] text-ink" />
                    <input type="password" value={eventsToken} onChange={(event) => setEventsToken(event.target.value)} placeholder={status.events_api?.has_access_token ? "Access token saved — enter to replace" : "Events access token"} className="rounded-lg border border-base-border bg-base-raised px-3 py-2 text-[12px] text-ink" />
                    <input value={testCode} onChange={(event) => setTestCode(event.target.value)} placeholder={status.events_api?.has_test_event_code ? "Test code saved — enter to replace" : "Test Event Code (optional)"} className="rounded-lg border border-base-border bg-base-raised px-3 py-2 text-[12px] text-ink sm:col-span-2" />
                  </div>
                  {status.events_api?.last_error && <p className="mt-2 text-[11px] text-danger">{status.events_api.last_error}</p>}
                  <div className="mt-3 grid grid-cols-2 gap-2"><button onClick={saveSettings} disabled={busy} className="rounded-xl bg-brand py-2 text-[12px] font-semibold text-white disabled:opacity-50">Save settings</button><button onClick={() => workspace && void run(() => invokeTikTok("tiktok-events", { workspace_id: workspace.id, action: "test" }), "TikTok test event accepted.")} disabled={busy || !status.events_api?.has_test_event_code} className="rounded-xl bg-base-raised py-2 text-[12px] font-semibold text-ink disabled:opacity-50">Test connection</button></div>
                </div>
                <div className="rounded-xl border border-base-border p-4">
                  <div className="text-[13px] font-semibold text-ink">Recent Events API deliveries</div>
                  <div className="mt-2 overflow-x-auto"><table className="w-full min-w-[520px] text-left text-[10.5px]"><thead className="text-ink-muted"><tr><th className="py-2">Event</th><th>Status</th><th>Attempts</th><th>Response</th><th>Created</th></tr></thead><tbody>{eventLogs.map((log) => <tr key={log.id} className="border-t border-base-border"><td className="py-2 font-medium text-ink">{log.event_name}<div className="max-w-[160px] truncate font-mono text-[9px] text-ink-faint">{log.event_id}</div></td><td>{log.attempt_status}</td><td>{log.attempt_count}</td><td>{log.tiktok_response_code || "—"}</td><td>{new Date(log.created_at).toLocaleString()}</td></tr>)}{eventLogs.length === 0 && <tr><td colSpan={5} className="py-4 text-center text-ink-muted">No queued or delivered TikTok events yet.</td></tr>}</tbody></table></div>
                </div>
                <div className="grid grid-cols-2 gap-2"><button onClick={() => void connect()} disabled={busy} className="rounded-xl bg-base-raised py-2.5 text-[12px] font-semibold text-ink">Connect another</button><button onClick={disconnect} disabled={busy} className="rounded-xl bg-danger/10 py-2.5 text-[12px] font-semibold text-danger">Disconnect</button></div>
              </>}
            </div>
          </div>
        </div>
      )}
    </>
  );
}
