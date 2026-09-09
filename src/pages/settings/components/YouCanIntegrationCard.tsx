import { useEffect, useState } from "react";
import { AlertCircle, CheckCircle2, ExternalLink, Loader2, RefreshCw } from "lucide-react";
import { useSearchParams } from "react-router-dom";
import { toast } from "../../../components/Toast";
import { useAuth } from "../../../hooks/useAuth";
import { getIntegrationLogo } from "../../../lib/integrationLogos";
import { youcanAuthorizeUrl } from "../../../lib/oauth";
import { supabase } from "../../../lib/supabase";

type YouCanStatus = {
  connected: boolean;
  status: string;
  store_name?: string | null;
  store_domain?: string | null;
  store_public_url?: string | null;
  store_logo_url?: string | null;
  store_currency?: string | null;
  provider_store_status?: string | null;
  webhook_health?: string | null;
  webhook_last_received_at?: string | null;
  last_full_sync_at?: string | null;
  needs_reconnect?: boolean;
};

function YouCanIntegrationCard({ onConnectionChange }: { onConnectionChange?: (connected: boolean) => void }) {
  const { workspace, refreshProfile } = useAuth();
  const [status, setStatus] = useState<YouCanStatus | null>(null);
  const [connecting, setConnecting] = useState(false);
  const [disconnecting, setDisconnecting] = useState(false);
  const [searchParams, setSearchParams] = useSearchParams();

  const loadStatus = async () => {
    if (!workspace?.id) return;
    const { data, error } = await supabase.rpc("get_store_integration_status_v1", { p_workspace_id: workspace.id, p_provider: "youcan" });
    setStatus(error ? { connected: false, status: "unavailable" } : data as YouCanStatus);
  };
  useEffect(() => { void loadStatus(); }, [workspace?.id]);
  useEffect(() => { onConnectionChange?.(Boolean(status?.connected)); }, [status?.connected, onConnectionChange]);
  useEffect(() => {
    const oauthStatus = searchParams.get("youcan");
    if (oauthStatus === "success") {
      toast.success(searchParams.get("reason") === "sync_initializing" ? "YouCan connecté. La synchronisation initiale continue automatiquement." : "YouCan connecté avec succès.");
      void refreshProfile(); void loadStatus();
    } else if (oauthStatus === "error") {
      const reason = searchParams.get("reason");
      toast.error(reason === "client_credentials_rejected" ? "YouCan a rejeté les identifiants de l’application." : reason === "authorization_code_rejected" ? "Le code YouCan a expiré. Réessayez." : "Impossible de connecter YouCan.");
    } else return;
    const next = new URLSearchParams(searchParams); next.delete("youcan"); next.delete("reason"); setSearchParams(next, { replace: true });
  }, [searchParams, setSearchParams, refreshProfile]);

  const connect = async () => {
    if (!workspace?.id || connecting) return;
    setConnecting(true);
    try { window.location.assign(await youcanAuthorizeUrl(workspace.id)); }
    catch (error) {
      console.error("[YouCan] OAuth start failed", error instanceof Error ? error.message : "unknown_error");
      toast.error("Impossible de démarrer la connexion YouCan."); setConnecting(false);
    }
  };
  const disconnect = async () => {
    if (!workspace?.id || disconnecting || !confirm("Voulez-vous vraiment déconnecter YouCan ?")) return;
    setDisconnecting(true);
    try {
      const { data, error } = await supabase.functions.invoke("youcan-disconnect", { body: { workspace_id: workspace.id } });
      if (error || !data?.success) throw new Error("disconnect_failed");
      await refreshProfile(); await loadStatus(); toast.success("YouCan a été déconnecté.");
    } catch { toast.error("Impossible de déconnecter YouCan."); }
    finally { setDisconnecting(false); }
  };

  const connected = Boolean(status?.connected);
  const needsReconnect = Boolean(status?.needs_reconnect || status?.status === "auth_expired" || status?.status === "degraded");
  const healthy = status?.webhook_health === "healthy";
  const lastActivity = status?.webhook_last_received_at ?? status?.last_full_sync_at;
  return <div className="group relative flex h-full flex-col overflow-hidden rounded-[24px] border border-base-border bg-base-surface p-6 shadow-sm shadow-black/[0.02] transition-all duration-150 hover:shadow-md">
    <div className="flex gap-4">
      <div className="flex h-12 w-12 shrink-0 items-center justify-center overflow-hidden rounded-2xl border border-base-border/50 bg-base-raised">
        <img src={status?.store_logo_url || getIntegrationLogo("youcan") || ""} alt="YouCan" className="h-full w-full object-contain" />
      </div>
      <div className="min-w-0 flex-1">
        <h3 className="truncate text-[16px] font-semibold text-ink">{connected ? status?.store_name || "YouCan Store" : "YouCan Store"}</h3>
        <span className={`mt-1 inline-flex h-[22px] items-center gap-1 rounded-full px-2.5 text-[10.5px] font-bold uppercase tracking-wider ${connected ? "bg-emerald-500/15 text-emerald-600" : needsReconnect ? "bg-amber-500/15 text-amber-600" : "bg-base-raised text-ink-muted"}`}>
          {connected && <CheckCircle2 size={11} />} {connected ? "Connected" : needsReconnect ? "Reconnect required" : "Not connected"}
        </span>
      </div>
    </div>
    {connected ? <div className="mt-4 space-y-2 rounded-2xl border border-base-border/70 bg-base-raised/50 p-4 text-[12.5px]">
      <div className="flex items-center justify-between gap-3"><span className="text-ink-muted">Live sync</span><span className={`inline-flex items-center gap-1 font-semibold ${healthy ? "text-emerald-600" : "text-amber-600"}`}>{healthy ? <CheckCircle2 size={13} /> : <RefreshCw size={13} />} {healthy ? "Healthy" : "Initializing"}</span></div>
      {status?.store_domain && <div className="flex items-center justify-between gap-3"><span className="text-ink-muted">Store</span><span className="truncate font-medium text-ink">{status.store_domain}</span></div>}
      {status?.store_currency && <div className="flex items-center justify-between"><span className="text-ink-muted">Currency</span><span className="font-medium text-ink">{status.store_currency}</span></div>}
      <div className="flex items-center justify-between"><span className="text-ink-muted">Last activity</span><span className="font-medium text-ink">{lastActivity ? new Date(lastActivity).toLocaleString() : "Waiting for first sync"}</span></div>
      {status?.needs_reconnect && <p role="alert" className="flex items-center gap-1.5 pt-1 font-medium text-amber-600"><AlertCircle size={13} /> Reconnect to grant the latest sync permissions.</p>}
    </div> : <p className="mt-4 min-h-[44px] text-[13px] leading-relaxed text-ink-muted">{needsReconnect ? "Authorization expired. Reconnect the store to restore automatic orders, products and live sync." : "Connect once to synchronize store identity, orders, customers, products, inventory and status updates automatically."}</p>}
    <div className="mt-auto grid grid-cols-2 gap-2 border-t border-base-border/60 pt-4">
      {connected ? <>
        {status?.store_public_url ? <a href={status.store_public_url} target="_blank" rel="noreferrer" className="inline-flex h-[38px] items-center justify-center gap-1.5 rounded-xl border border-base-border bg-base-raised px-3 text-[13px] font-semibold text-ink"><ExternalLink size={14} /> Open store</a> : <div />}
        <button onClick={() => void disconnect()} disabled={disconnecting} className="h-[38px] rounded-xl bg-danger/10 px-3 text-[13px] font-semibold text-danger disabled:opacity-60">{disconnecting ? "Disconnecting…" : "Disconnect"}</button>
      </> : <button onClick={() => void connect()} disabled={connecting} className="col-span-2 inline-flex h-[38px] items-center justify-center gap-1.5 rounded-xl bg-brand px-3 text-[13px] font-semibold text-white disabled:opacity-60">{connecting ? <><Loader2 size={14} className="animate-spin" /> Connecting…</> : needsReconnect ? "Reconnect with YouCan" : "Connect with YouCan"}</button>}
    </div>
  </div>;
}

export default YouCanIntegrationCard;
