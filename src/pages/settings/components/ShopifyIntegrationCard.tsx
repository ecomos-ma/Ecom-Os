import { useEffect, useState, useRef } from "react";
import { CheckCircle2, Loader2, Store } from "lucide-react";
import { useSearchParams } from "react-router-dom";
import { toast } from "../../../components/Toast";
import { useAuth } from "../../../hooks/useAuth";
import { getIntegrationLogo } from "../../../lib/integrationLogos";
import { shopifyAuthorizeUrl } from "../../../lib/oauth";
import { supabase } from "../../../lib/supabase";
import { Modal } from "../../../components/Modal";

type ShopifyStatus = {
  connected: boolean;
  status?: string;
  shop_domain?: string;
  updated_at?: string;
};

function ShopifyIntegrationCard({ onConnectionChange }: { onConnectionChange?: (connected: boolean) => void }) {
  const { workspace } = useAuth();
  const [status, setStatus] = useState<ShopifyStatus | null>(null);
  const [connecting, setConnecting] = useState(false);
  const [disconnecting, setDisconnecting] = useState(false);
  const [showConnectModal, setShowConnectModal] = useState(false);
  const [shopDomainInput, setShopDomainInput] = useState("");
  const [searchParams, setSearchParams] = useSearchParams();
  const registeringRef = useRef(false);

  const loadStatus = async () => {
    if (!workspace?.id) return;
    const { data, error } = await supabase.rpc("get_shopify_connection_status_v1", { p_workspace_id: workspace.id });
    setStatus(error ? { connected: false } : data as ShopifyStatus);
  };

  useEffect(() => { void loadStatus(); }, [workspace?.id]);
  useEffect(() => { onConnectionChange?.(Boolean(status?.connected)); }, [status?.connected, onConnectionChange]);

  // Handle OAuth callback redirects
  useEffect(() => {
    if (!workspace?.id) return;
    const integration = searchParams.get("integration");
    const oauthStatus = searchParams.get("status");
    if (integration === "shopify") {
      if (oauthStatus === "success") {
        if (registeringRef.current) return;
        registeringRef.current = true;

        toast.success("Shopify connecté avec succès. Configuration des webhooks...");
        
        supabase.functions.invoke("shopify-register-webhook", {
          body: { workspace_id: workspace.id }
        }).then(({ data, error }) => {
          if (error || !data?.success) {
            console.error("Webhook registration failed:", error || data);
            toast.error("Connecté, mais l'enregistrement des webhooks a échoué.");
          } else {
            toast.success("Boutique et webhooks configurés !");
          }
        }).catch(err => {
          console.error("Webhook invocation error:", err);
          toast.error("Erreur de configuration des webhooks.");
        }).finally(() => {
          void loadStatus();
        });

      } else if (oauthStatus === "error") {
        const errorMsg = searchParams.get("error_message");
        toast.error(errorMsg || "Impossible de connecter Shopify.");
        void loadStatus();
      }
      const next = new URLSearchParams(searchParams);
      next.delete("integration");
      next.delete("status");
      next.delete("error_message");
      setSearchParams(next, { replace: true });
    }
  }, [searchParams, setSearchParams, workspace?.id]);

  const connect = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!workspace?.id || connecting || !shopDomainInput.trim()) return;
    
    let domain = shopDomainInput.trim().toLowerCase();
    // Auto-append .myshopify.com if they just typed the store name
    if (!domain.includes(".")) domain += ".myshopify.com";
    
    if (!domain.endsWith(".myshopify.com")) {
      toast.error("Veuillez entrer une adresse se terminant par .myshopify.com");
      return;
    }

    setConnecting(true);
    try {
      const url = await shopifyAuthorizeUrl(workspace.id, domain);
      window.location.assign(url);
    } catch (error) {
      console.error("[Shopify] OAuth start failed", error);
      toast.error("Impossible de démarrer la connexion Shopify.");
      setConnecting(false);
    }
  };

  const disconnect = async () => {
    if (!workspace?.id || disconnecting || !confirm("Voulez-vous vraiment déconnecter Shopify ?")) return;
    setDisconnecting(true);
    try {
      const { data, error } = await supabase.functions.invoke("shopify-disconnect", { 
        body: { workspace_id: workspace.id } 
      });
      if (error || !data?.success) throw new Error("disconnect_failed");
      toast.success("Shopify a été déconnecté.");
      await loadStatus();
    } catch {
      toast.error("Impossible de déconnecter Shopify.");
    } finally {
      setDisconnecting(false);
    }
  };

  const connected = Boolean(status?.connected);

  return (
    <div className="group relative flex h-full flex-col overflow-hidden rounded-[24px] border border-base-border bg-base-surface p-6 shadow-sm shadow-black/[0.02] transition-all duration-150 hover:shadow-md">
      <div className="flex gap-4">
        <div className="flex h-12 w-12 shrink-0 items-center justify-center overflow-hidden rounded-2xl border border-base-border/50 bg-base-raised p-2">
          {/* Fallback icon if getIntegrationLogo doesn't have shopify mapped yet */}
          <img src={getIntegrationLogo("shopify") || "https://cdn.shopify.com/s/assets/monorail/shopify-logo-header.svg"} alt="Shopify" className="h-full w-full object-contain" />
        </div>
        <div className="min-w-0 flex-1">
          <h3 className="truncate text-[16px] font-semibold text-ink">Shopify</h3>
          <span className={`mt-1 inline-flex h-[22px] items-center gap-1 rounded-full px-2.5 text-[10.5px] font-bold uppercase tracking-wider ${connected ? "bg-emerald-500/15 text-emerald-600" : "bg-base-raised text-ink-muted"}`}>
            {connected && <CheckCircle2 size={11} />} {connected ? "Connected" : "Not connected"}
          </span>
        </div>
      </div>
      
      {connected ? (
        <div className="mt-4 space-y-2 rounded-2xl border border-base-border/70 bg-base-raised/50 p-4 text-[12.5px]">
          <div className="flex items-center justify-between gap-3">
            <span className="text-ink-muted">Store</span>
            <span className="truncate font-medium text-ink">{status?.shop_domain}</span>
          </div>
          <div className="flex items-center justify-between">
            <span className="text-ink-muted">Connected At</span>
            <span className="font-medium text-ink">{status?.updated_at ? new Date(status.updated_at).toLocaleDateString() : ""}</span>
          </div>
        </div>
      ) : (
        <p className="mt-4 min-h-[44px] text-[13px] leading-relaxed text-ink-muted">
          Connect your Shopify store to synchronize orders, customers, and product catalogs automatically.
        </p>
      )}

      <div className="mt-auto grid grid-cols-2 gap-2 border-t border-base-border/60 pt-4">
        {connected ? (
          <>
            <div className="col-span-1" /> {/* Spacer */}
            <button onClick={() => void disconnect()} disabled={disconnecting} className="h-[38px] rounded-xl bg-danger/10 px-3 text-[13px] font-semibold text-danger disabled:opacity-60">
              {disconnecting ? "Disconnecting…" : "Disconnect"}
            </button>
          </>
        ) : (
          <button onClick={() => setShowConnectModal(true)} className="col-span-2 inline-flex h-[38px] items-center justify-center gap-1.5 rounded-xl bg-brand px-3 text-[13px] font-semibold text-white">
            Connect with Shopify
          </button>
        )}
      </div>

      {showConnectModal && (
        <Modal title="Connect Shopify Store" onClose={() => setShowConnectModal(false)}>
          <form onSubmit={connect} className="space-y-4 p-2">
            <p className="text-sm text-ink-muted">
              Entrez le domaine de votre boutique Shopify pour commencer la connexion.
            </p>
            <div>
              <label htmlFor="shopDomain" className="mb-1.5 block text-[13px] font-semibold text-ink">
                Domaine de la boutique
              </label>
              <div className="relative flex items-center">
                <Store size={16} className="absolute left-3 text-ink-muted" />
                <input
                  id="shopDomain"
                  type="text"
                  placeholder="maboutique.myshopify.com"
                  value={shopDomainInput}
                  onChange={(e) => setShopDomainInput(e.target.value)}
                  className="h-10 w-full rounded-xl border border-base-border bg-base-surface pl-9 pr-3 text-[13px] text-ink shadow-sm outline-none transition-colors focus:border-brand focus:ring-1 focus:ring-brand"
                  autoFocus
                />
              </div>
            </div>
            <div className="flex gap-2 pt-2">
              <button type="button" onClick={() => setShowConnectModal(false)} className="h-10 flex-1 rounded-xl border border-base-border bg-base-surface text-[13px] font-semibold text-ink hover:bg-base-raised">
                Annuler
              </button>
              <button type="submit" disabled={connecting || !shopDomainInput.trim()} className="inline-flex h-10 flex-1 items-center justify-center gap-2 rounded-xl bg-brand text-[13px] font-semibold text-white disabled:opacity-60">
                {connecting ? <Loader2 size={14} className="animate-spin" /> : null}
                {connecting ? "Connexion..." : "Continuer"}
              </button>
            </div>
          </form>
        </Modal>
      )}
    </div>
  );
}

export default ShopifyIntegrationCard;
