import { useEffect, useState } from "react";
import { AlertCircle, CheckCircle2, Loader2, RefreshCw, Settings2 } from "lucide-react";
import { useSearchParams } from "react-router-dom";
import { toast } from "../../../components/Toast";
import { useAuth } from "../../../hooks/useAuth";
import { getIntegrationLogo } from "../../../lib/integrationLogos";
import { youcanAuthorizeUrl } from "../../../lib/oauth";
import { supabase } from "../../../lib/supabase";
import { Modal } from "../../../components/Modal";

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

const connectionErrorMessage = (reason: string | null): string => {
  switch (reason) {
    case "access_denied": return "Connexion YouCan annulée.";
    case "invalid_scope": return "YouCan a refusé une permission demandée. Réessayez avec la configuration mise à jour.";
    case "invalid_client": return "YouCan a rejeté la configuration de l’application. Contactez le support.";
    case "missing_code": return "YouCan n’a pas renvoyé de code d’autorisation.";
    case "missing_state":
    case "invalid_state":
    case "expired_state":
    case "replayed_state": return "La demande de connexion a expiré. Relancez la connexion YouCan.";
    case "token_exchange_failed": return "Le code YouCan n’a pas pu être échangé. Relancez la connexion.";
    case "store_info_failed": return "Le compte est autorisé, mais les informations de la boutique sont indisponibles.";
    case "store_already_connected": return "Cette boutique YouCan est déjà liée à un autre espace de travail.";
    case "database_save_failed": return "La connexion YouCan n’a pas pu être enregistrée en toute sécurité.";
    case "initial_sync_failed": return "YouCan est connecté, mais la synchronisation initiale n’a pas pu démarrer.";
    default: return "Impossible de connecter YouCan.";
  }
};

function YouCanIntegrationCard({ onConnectionChange }: { onConnectionChange?: (connected: boolean) => void }) {
  const { workspace, refreshProfile } = useAuth();
  const [status, setStatus] = useState<YouCanStatus | null>(null);
  const [connecting, setConnecting] = useState(false);
  const [disconnecting, setDisconnecting] = useState(false);
  const [configuring, setConfiguring] = useState(false);
  const [syncing, setSyncing] = useState(false);
  const [repairingWebhook, setRepairingWebhook] = useState(false);
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
      toast.error(connectionErrorMessage(reason));
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
  const syncOrders = async () => {
    if (!workspace?.id || syncing) return;
    setSyncing(true);
    try {
      const { data, error } = await supabase.functions.invoke("youcan-sync-orders", { body: { workspace_id: workspace.id } });
      if (error || !data?.success) throw new Error("sync_failed");
      toast.success("YouCan order sync started immediately.");
      window.setTimeout(() => void loadStatus(), 1200);
    } catch { toast.error("Unable to start YouCan order sync."); }
    finally { setSyncing(false); }
  };
  const repairWebhook = async () => {
    if (!workspace?.id || repairingWebhook) return;
    setRepairingWebhook(true);
    try {
      const { data, error } = await supabase.functions.invoke("youcan-register-webhook", { body: { workspace_id: workspace.id } });
      if (error || !data?.success) throw new Error("webhook_failed");
      await loadStatus(); toast.success("YouCan live webhook is active.");
    } catch { toast.error("Unable to verify the YouCan webhook."); }
    finally { setRepairingWebhook(false); }
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
        <button onClick={() => setConfiguring(true)} className="inline-flex h-[38px] items-center justify-center gap-1.5 rounded-xl border border-base-border bg-base-raised px-3 text-[13px] font-semibold text-ink"><Settings2 size={14} /> Configure</button>
        <button onClick={() => void disconnect()} disabled={disconnecting} className="h-[38px] rounded-xl bg-danger/10 px-3 text-[13px] font-semibold text-danger disabled:opacity-60">{disconnecting ? "Disconnecting…" : "Disconnect"}</button>
      </> : <button onClick={() => void connect()} disabled={connecting} className="col-span-2 inline-flex h-[38px] items-center justify-center gap-1.5 rounded-xl bg-brand px-3 text-[13px] font-semibold text-white disabled:opacity-60">{connecting ? <><Loader2 size={14} className="animate-spin" /> Connecting…</> : needsReconnect ? "Reconnect with YouCan" : "Connect with YouCan"}</button>}
    </div>
    {configuring && <Modal title="Configure YouCan" onClose={() => setConfiguring(false)}>
      <div className="space-y-4">
        <div className="rounded-2xl border border-emerald-500/20 bg-emerald-500/5 p-4">
          <div className="flex items-center justify-between gap-3"><div><p className="text-sm font-semibold text-ink">Live order webhook</p><p className="mt-1 text-xs leading-5 text-ink-muted">Always enabled by default. New orders sync in the background even when Ecom OS is closed.</p></div><span className="inline-flex shrink-0 items-center gap-1 rounded-full bg-emerald-500/15 px-2.5 py-1 text-[10px] font-bold uppercase text-emerald-600"><CheckCircle2 size={11} /> Always on</span></div>
          <button onClick={() => void repairWebhook()} disabled={repairingWebhook} className="mt-3 inline-flex h-9 items-center gap-2 rounded-xl border border-base-border bg-base-surface px-3 text-xs font-semibold text-ink disabled:opacity-60">{repairingWebhook ? <Loader2 size={13} className="animate-spin" /> : <RefreshCw size={13} />} Verify webhook</button>
        </div>
        <div className="rounded-2xl border border-base-border bg-base-raised/50 p-4">
          <p className="text-sm font-semibold text-ink">Orders</p><p className="mt-1 text-xs leading-5 text-ink-muted">Import existing or recently changed orders immediately.</p>
          <button onClick={() => void syncOrders()} disabled={syncing} className="mt-3 inline-flex h-10 w-full items-center justify-center gap-2 rounded-xl bg-brand px-4 text-sm font-semibold text-white disabled:opacity-60">{syncing ? <Loader2 size={14} className="animate-spin" /> : <RefreshCw size={14} />} {syncing ? "Syncing…" : "Sync orders now"}</button>
        </div>
      </div>
    </Modal>}
  </div>;
}

export default YouCanIntegrationCard;
