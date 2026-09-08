import { useState, useEffect } from "react";
import { CheckCircle2, Loader2, RefreshCw, Zap, AlertCircle, MoreHorizontal, X } from "lucide-react";
import { getIntegrationLogo } from "../../../lib/integrationLogos";
import { useAuth } from "../../../hooks/useAuth";
import { supabase } from "../../../lib/supabase";
import { toast } from "../../../components/Toast";
import { youcanAuthorizeUrl } from "../../../lib/oauth";
import { useSearchParams } from "react-router-dom";

type SyncResult = {
  total_fetched: number;
  synced_count: number;
  skipped_count: number;
  errors?: string[];
};

/** Extract real error message from a supabase.functions.invoke response */
async function extractEdgeFunctionError(error: unknown, data: unknown): Promise<string> {
  // If data contains a server-returned error field, use it
  if (data && typeof data === "object" && "error" in data) {
    return String((data as Record<string, unknown>).error);
  }

  // Rip out real backend message from Supabase's FunctionsHttpError
  if (error && typeof error === "object" && "context" in error) {
    try {
      const res = (error as any).context as Response;
      if (res && typeof res.clone === "function") {
        const body = await res.clone().json();
        if (body?.error) return body.error;
      }
    } catch {
      // Fall through to generic message
    }
  }

  if (!error) return "Unknown error";
  const msg = error instanceof Error ? error.message : String(error);
  // Supabase JS wraps CORS/network errors
  if (msg.includes("Failed to send a request") || msg.includes("fetch")) {
    return "Edge Function unreachable — check Supabase deployment and CORS config";
  }
  return msg;
}

function YouCanIntegrationCard({ onConnectionChange }: { onConnectionChange?: (connected: boolean) => void }) {
  const { workspace, refreshProfile } = useAuth();
  const [connecting, setConnecting] = useState(false);
  const [canonicalConnected, setCanonicalConnected] = useState<boolean | null>(null);
  const [searchParams, setSearchParams] = useSearchParams();

  // Webhook registration state
  const [registeringWebhook, setRegisteringWebhook] = useState(false);
  const [webhookActive, setWebhookActive] = useState(false);

  useEffect(() => {
    let cancelled = false;
    setCanonicalConnected(null);
    if (!workspace?.id) return () => { cancelled = true; };
    void supabase.rpc("get_store_integration_status_v1", {
      p_workspace_id: workspace.id,
      p_provider: "youcan",
    }).then(({ data, error }) => {
      if (!cancelled) setCanonicalConnected(error ? false : Boolean(data?.connected));
    });
    return () => { cancelled = true; };
  }, [workspace?.id]);

  useEffect(() => {
    const youcanStatus = searchParams.get("youcan");
    if (youcanStatus === "success") {
      const reason = searchParams.get("reason");
      if (reason === "webhook_failed") {
        toast.success("YouCan connecté, mais le webhook a échoué. Veuillez l'activer manuellement.");
      } else {
        toast.success("YouCan connecté avec succès !");
      }
      void refreshProfile();
      searchParams.delete("youcan");
      searchParams.delete("reason");
      setSearchParams(searchParams, { replace: true });
    } else if (youcanStatus === "error") {
      const reason = searchParams.get("reason");
      toast.error(`Erreur de connexion YouCan: ${reason || "connection_failed"}`);
      searchParams.delete("youcan");
      searchParams.delete("reason");
      setSearchParams(searchParams, { replace: true });
    }
  }, [refreshProfile, searchParams, setSearchParams]);

  // Sync state
  const [syncing, setSyncing] = useState(false);
  const [syncResult, setSyncResult] = useState<SyncResult | null>(null);
  const [syncError, setSyncError] = useState<string | null>(null);

  const handleConnect = async () => {
    if (!workspace?.id) return;
    setConnecting(true);

    try {
      const oauthUrl = await youcanAuthorizeUrl(workspace.id);
      toast.success("Redirection vers YouCan en cours...");

      setTimeout(() => {
        window.location.href = oauthUrl;
      }, 1000);

    } catch (error: any) {
      toast.error(`Erreur: ${error.message}`);
      setConnecting(false);
    }
  };

  const handleSyncOrders = async () => {
    if (!workspace?.id) return;
    setSyncing(true);
    setSyncResult(null);
    setSyncError(null);

    try {
      const { data, error } = await supabase.functions.invoke("youcan-sync-orders", {
        body: { workspace_id: workspace.id },
      });

      if (error || data?.error) {
        throw new Error(await extractEdgeFunctionError(error, data));
      }

      setSyncResult(data as SyncResult);
      if ((data as SyncResult).synced_count > 0) {
        toast.success(`✅ ${data.synced_count} commande${data.synced_count > 1 ? "s" : ""} synchronisée${data.synced_count > 1 ? "s" : ""} depuis YouCan`);
      } else {
        toast.success(`Sync terminé — ${data.total_fetched} commandes vérifiées, aucune nouvelle`);
      }

      // Trigger orders list reload across the app
      window.dispatchEvent(new Event("trigger-order-reload"));
    } catch (err: any) {
      const msg = err.message || "Sync failed";
      setSyncError(msg);
      toast.error(`Erreur sync YouCan: ${msg}`);
    } finally {
      setSyncing(false);
    }
  };

  const handleRegisterWebhook = async () => {
    if (!workspace?.id) return;
    setRegisteringWebhook(true);

    try {
      const { data, error } = await supabase.functions.invoke("youcan-register-webhook", {
        body: { workspace_id: workspace.id },
      });

      if (error || data?.error) {
        throw new Error(await extractEdgeFunctionError(error, data));
      }

      setWebhookActive(true);
      toast.success(`🔗 Webhook enregistré (ID: ${data?.webhook_id ?? "ok"}) — nouvelles commandes en temps réel`);
      await refreshProfile();
    } catch (err: any) {
      const msg = err.message || "Webhook registration failed";
      toast.error(`Erreur webhook YouCan: ${msg}`);
    } finally {
      setRegisteringWebhook(false);
    }
  };

  const handleDisable = async () => {
    if (!confirm("Voulez-vous vraiment déconnecter YouCan ?")) return;

    try {
      if (!workspace?.id) return;
      const { data, error } = await supabase.functions.invoke("youcan-disconnect", {
        body: { workspace_id: workspace.id },
      });
      if (error) throw error;
      if (!data?.success) throw new Error("YouCan could not be disconnected");
      setCanonicalConnected(false);
      await refreshProfile();
      setSyncResult(null);
      setSyncError(null);
      toast.success("YouCan a été déconnecté");
    } catch (error: any) {
      toast.error(`Erreur: ${error.message}`);
    }
  };

  const isConnected = canonicalConnected ?? !!workspace?.youcan_access_token;
  const [manageOpen, setManageOpen] = useState(false);

  // Report connection state to parent
  useEffect(() => {
    onConnectionChange?.(isConnected);
  }, [isConnected, onConnectionChange]);

  return (
    <>
      {/* ── Card ── */}
      <div className="group relative flex flex-col h-full overflow-hidden rounded-[24px] border border-base-border bg-base-surface p-6 shadow-sm shadow-black/[0.02] hover:scale-[1.02] hover:shadow-md transition-all duration-150">
        <div className="absolute right-4 top-4">
          <button className="text-ink-faint hover:text-ink transition-colors"><MoreHorizontal size={18} /></button>
        </div>

        <div className="flex flex-col pb-4">
          <div className="mb-4 flex h-12 w-12 flex-none items-center justify-center rounded-2xl bg-base-raised overflow-hidden border border-base-border/50">
            <img src={getIntegrationLogo("youcan") || ""} alt="YouCan" className="h-full w-full object-contain object-center" />
          </div>
          <div className="flex flex-col gap-1.5">
            <h3 className="text-[16px] font-semibold tracking-tight text-ink leading-none">YouCan Store</h3>
            <div className="flex items-center">
              {isConnected ? (
                <span className="flex h-[22px] items-center gap-1 rounded-full bg-[#10B981]/15 px-2.5 text-[10.5px] font-bold uppercase tracking-wider text-[#10B981]">
                  <CheckCircle2 size={11} strokeWidth={2.5} /> Connected
                </span>
              ) : (
                <span className="flex h-[22px] items-center rounded-full bg-base-raised px-2.5 text-[10.5px] font-bold uppercase tracking-wider text-ink-muted">
                  Not Connected
                </span>
              )}
            </div>
          </div>
          <p className="mt-3 text-[13px] leading-relaxed text-ink-muted min-h-[40px] flex-1">
            Synchronisez vos commandes directement depuis votre boutique YouCan automatiquement.
          </p>
        </div>

        <div className="mt-auto border-t border-base-border/60 pt-4">
          {isConnected ? (
            <div className="grid grid-cols-2 gap-2">
              <button
                onClick={handleDisable}
                className="h-[38px] rounded-xl bg-base-raised px-3 text-[13px] font-semibold text-ink hover:text-danger hover:bg-danger/10 transition-colors"
              >
                Disconnect
              </button>
              <button
                onClick={() => setManageOpen(true)}
                className="h-[38px] rounded-xl border border-brand/20 bg-brand/5 px-3 text-[13px] font-semibold text-brand hover:bg-brand hover:text-white transition-colors"
              >
                Manage
              </button>
            </div>
          ) : (
            <button
              onClick={handleConnect}
              disabled={connecting}
              className="h-[38px] w-full flex items-center justify-center gap-1.5 rounded-xl bg-brand px-3 text-[13px] font-semibold text-white shadow-sm hover:bg-brand/90 transition-colors disabled:opacity-60"
            >
              {connecting ? <><Loader2 size={14} className="animate-spin" /> Connexion…</> : "Connect"}
            </button>
          )}
        </div>
      </div>

      {/* ── Manage Modal ── */}
      {manageOpen && (
        <div className="fixed inset-0 z-[999] flex items-center justify-center p-4">
          <div className="absolute inset-0 bg-black/50 backdrop-blur-sm" onClick={() => setManageOpen(false)} />
          <div className="relative z-10 w-full max-w-lg rounded-[28px] border border-base-border bg-base-surface shadow-2xl overflow-hidden">
            {/* Header */}
            <div className="flex items-center gap-4 px-7 py-6 border-b border-base-border/60 bg-base-raised/30">
              <div className="h-11 w-11 rounded-2xl overflow-hidden border border-base-border/50 flex-shrink-0">
                <img src={getIntegrationLogo("youcan") || ""} alt="YouCan" className="h-full w-full object-contain" />
              </div>
              <div className="flex-1">
                <h2 className="text-[18px] font-bold text-ink">YouCan Store</h2>
                <p className="text-[13px] text-ink-muted">Sync orders and configure webhooks</p>
              </div>
              <button onClick={() => setManageOpen(false)} className="rounded-full bg-base-raised p-2 text-ink-faint hover:text-ink hover:bg-base-border transition-colors">
                <X size={16} />
              </button>
            </div>

            {/* Body */}
            <div className="px-7 py-6 flex flex-col gap-4">
              <div className="grid grid-cols-2 gap-3">
                <button
                  id="youcan-sync-orders-btn"
                  onClick={handleSyncOrders}
                  disabled={syncing}
                  className="flex items-center justify-center gap-2 rounded-xl border border-brand/30 bg-brand/10 py-3 text-[13px] font-semibold text-brand hover:bg-brand/20 transition-colors disabled:opacity-60"
                >
                  {syncing ? <><Loader2 size={14} className="animate-spin" /> Syncing…</> : <><RefreshCw size={14} /> Sync Orders</>}
                </button>
                <button
                  id="youcan-register-webhook-btn"
                  onClick={handleRegisterWebhook}
                  disabled={registeringWebhook || webhookActive}
                  className={`flex items-center justify-center gap-2 rounded-xl border py-3 text-[13px] font-semibold transition-colors disabled:opacity-60 ${webhookActive
                    ? "border-emerald-500/30 bg-emerald-500/10 text-emerald-600"
                    : "border-base-border bg-base-raised text-ink hover:bg-base-border"
                    }`}
                >
                  {registeringWebhook ? <><Loader2 size={14} className="animate-spin" /> Webhook…</> :
                    webhookActive ? <><CheckCircle2 size={14} /> Webhook Active</> :
                      <><Zap size={14} /> Activate Webhook</>}
                </button>
              </div>

              {syncResult && !syncing && (
                <div className="flex items-center gap-2 rounded-xl bg-emerald-500/10 px-4 py-3 text-[13px] text-emerald-600">
                  <CheckCircle2 size={14} />
                  {syncResult.synced_count} synced {syncResult.total_fetched > syncResult.synced_count && <span className="text-emerald-500/70">({syncResult.total_fetched} fetched)</span>}
                </div>
              )}
              {syncError && !syncing && (
                <div className="flex items-center gap-2 rounded-xl bg-danger/10 px-4 py-3 text-[13px] text-danger">
                  <AlertCircle size={14} />
                  {syncError.length > 80 ? syncError.slice(0, 80) + "…" : syncError}
                </div>
              )}
              {syncResult?.errors && syncResult.errors.length > 0 && (
                <div className="rounded-xl bg-amber-500/10 px-4 py-3 text-[12px] text-amber-600 max-h-[80px] overflow-y-auto">
                  <div className="font-semibold mb-1">{syncResult.errors.length} orders skipped:</div>
                  {syncResult.errors.slice(0, 3).map((e, i) => <div key={i} className="truncate">• {e}</div>)}
                  {syncResult.errors.length > 3 && <div className="opacity-70">…and {syncResult.errors.length - 3} more</div>}
                </div>
              )}
              <div className="rounded-xl bg-base-raised/60 border border-base-border/60 p-4">
                <p className="text-[12px] text-ink-muted">
                  <strong>Sync Orders</strong> imports all existing YouCan orders. <strong>Activate Webhook</strong> registers a real-time listener for new orders as they arrive.
                </p>
              </div>
            </div>

            {/* Footer */}
            <div className="px-7 py-5 border-t border-base-border/60 bg-base-raised/20">
              <button onClick={() => setManageOpen(false)} className="w-full rounded-xl bg-base-raised py-2.5 text-[13px] font-semibold text-ink hover:bg-base-border transition-colors">
                Close
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  );
}

export default YouCanIntegrationCard;
