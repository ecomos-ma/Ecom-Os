import { useState, useEffect } from "react";
import { ShoppingBag, ExternalLink, CheckCircle2, Loader2, X, Globe, MoreHorizontal, Store } from "lucide-react";
import { getIntegrationLogo } from "../../../lib/integrationLogos";
import { useAuth } from "../../../hooks/useAuth";
import { supabase } from "../../../lib/supabase";
import { toast } from "../../../components/Toast";
import { shopifyAuthorizeUrl } from "../../../lib/oauth";
import { useSearchParams } from "react-router-dom";

function ShopifyIntegrationCard({ onConnectionChange }: { onConnectionChange?: (connected: boolean) => void }) {
  const { workspace, refreshProfile } = useAuth();
  const [connecting, setConnecting] = useState(false);
  const [searchParams, setSearchParams] = useSearchParams();
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [shopDomain, setShopDomain] = useState("");

  useEffect(() => {
    const shopifyStatus = searchParams.get("shopify");
    if (shopifyStatus === "success") {
      toast.success("Shopify connecté avec succès !");
      searchParams.delete("shopify");
      setSearchParams(searchParams, { replace: true });
    } else if (shopifyStatus === "error") {
      const details = searchParams.get("details");
      toast.error(`Erreur de connexion Shopify: ${details || "Inconnue"}`);
      searchParams.delete("shopify");
      searchParams.delete("details");
      setSearchParams(searchParams, { replace: true });
    }
  }, [searchParams, setSearchParams]);

  const handleConnect = async () => {
    if (!workspace?.id) return;
    if (!shopDomain.trim()) {
      toast.error("Veuillez entrer le domaine de votre boutique Shopify");
      return;
    }

    setConnecting(true);

    try {
      const oauthUrl = await shopifyAuthorizeUrl(workspace.id, shopDomain.trim());
      toast.success("Redirection vers Shopify en cours...");

      setTimeout(() => {
        window.location.href = oauthUrl;
      }, 1000);

    } catch (error: any) {
      toast.error(`Erreur: ${error.message}`);
      setConnecting(false);
    }
  };

  const handleDisable = async () => {
    if (!confirm("Voulez-vous vraiment déconnecter Shopify ?")) return;

    try {
      const { error } = await supabase
        .from("workspaces")
        .update({
          shopify_enabled: false,
          shopify_access_token: null,
          shopify_scopes: null,
          shopify_connected_at: null,
        })
        .eq("id", workspace?.id);

      if (error) throw error;
      await refreshProfile();
      toast.success("Shopify a été déconnecté");
    } catch (error: any) {
      toast.error(`Erreur: ${error.message}`);
    }
  };

  const handleClose = () => {
    if (!connecting) {
      setIsModalOpen(false);
      setShopDomain("");
    }
  };

  // It's connected if shopify_enabled is true and we have an access token
  const isConnected = Boolean(workspace?.shopify_enabled && workspace?.shopify_access_token);

  // Report connection state to parent
  useEffect(() => {
    onConnectionChange?.(isConnected);
  }, [isConnected, onConnectionChange]);

  return (
    <>
      <div className="group relative flex flex-col h-full overflow-hidden rounded-[24px] border border-base-border bg-base-surface p-6 shadow-sm shadow-black/[0.02] hover:scale-[1.02] hover:shadow-md transition-all duration-150">
        <div className="absolute right-4 top-4">
          <button className="text-ink-faint hover:text-ink transition-colors"><MoreHorizontal size={18} /></button>
        </div>

        <div className="flex flex-col pb-4">
          <div className="mb-4 flex h-12 w-12 flex-none items-center justify-center rounded-2xl bg-base-raised overflow-hidden border border-base-border/50">
            <img src={getIntegrationLogo("shopify") || ""} alt="Shopify" className="h-full w-full object-contain object-center" />
          </div>

          <div className="flex flex-col gap-1.5">
            <div className="flex items-center gap-2">
              <h3 className="text-[16px] font-semibold tracking-tight text-ink leading-none">Shopify</h3>
            </div>
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
            Connectez votre boutique Shopify pour synchroniser vos commandes et clients automatiquement.
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
                onClick={() => setIsModalOpen(true)}
                className="h-[38px] rounded-xl border border-brand/20 bg-brand/5 px-3 text-[13px] font-semibold text-brand hover:bg-brand hover:text-white transition-colors"
              >
                Configure
              </button>
            </div>
          ) : (
            <button
              onClick={() => setIsModalOpen(true)}
              className="h-[38px] w-full rounded-xl bg-brand px-3 text-[13px] font-semibold text-white shadow-sm hover:bg-brand/90 transition-colors"
            >
              Connect
            </button>
          )}
        </div>
      </div>

      {/* ── Connection Modal ── */}
      {isModalOpen && (
        <div className="fixed inset-0 z-[999] flex items-center justify-center p-4">
          <div className="absolute inset-0 bg-black/50 backdrop-blur-sm" onClick={handleClose} />
          <div className="relative z-10 w-full max-w-lg rounded-[28px] border border-base-border bg-base-surface shadow-2xl overflow-hidden">
            {/* Header */}
            <div className="flex items-center gap-4 px-7 py-6 border-b border-base-border/60 bg-base-raised/30">
              <div className="h-11 w-11 rounded-2xl overflow-hidden border border-base-border/50 flex-shrink-0 flex items-center justify-center bg-base-raised">
                <img src={getIntegrationLogo("shopify") || ""} alt="Shopify" className="h-2/3 w-2/3 object-contain" />
              </div>
              <div className="flex-1">
                <h2 className="text-[18px] font-bold text-ink">Shopify Connections</h2>
                <p className="text-[13px] text-ink-muted">Enter your store domain</p>
              </div>
              <button onClick={handleClose} disabled={connecting} className="rounded-full bg-base-raised p-2 text-ink-faint hover:text-ink hover:bg-base-border transition-colors disabled:opacity-40">
                <X size={16} />
              </button>
            </div>

            {/* Body */}
            <div className="flex flex-col gap-5 px-7 py-6">
              <div>
                <label className="mb-2 flex items-center gap-1.5 text-[13px] font-semibold text-ink">
                  <Globe size={13} className="text-[#95BF47]" /> Store Domain
                </label>
                <input
                  type="text"
                  value={shopDomain}
                  onChange={(e) => setShopDomain(e.target.value)}
                  placeholder="e.g. my-store.myshopify.com"
                  className="w-full rounded-xl border border-base-border bg-base-raised px-4 py-3 text-[13px] text-ink focus:border-[#95BF47]/50 focus:outline-none focus:ring-2 focus:ring-[#95BF47]/10 transition-all font-mono"
                />
                <div className="mt-2 text-[12px] text-ink-muted">
                  We will redirect you to Shopify to authorize EcomOS via OAuth.
                </div>
              </div>
            </div>

            {/* Footer */}
            <div className="flex items-center gap-3 px-7 py-5 border-t border-base-border/60 bg-base-raised/20">
              <button onClick={handleClose} disabled={connecting} className="flex-1 rounded-xl bg-base-raised py-2.5 text-[13px] font-semibold text-ink hover:bg-base-border transition-colors disabled:opacity-60">
                Cancel
              </button>
              <button
                onClick={handleConnect}
                disabled={connecting || !shopDomain.trim()}
                className="flex-1 flex items-center justify-center gap-2 rounded-xl bg-[#95BF47] py-2.5 text-[13px] font-semibold text-white shadow-sm hover:bg-[#95BF47]/90 transition-colors disabled:opacity-60"
              >
                {connecting ? <><Loader2 size={14} className="animate-spin" /> Connecting…</> : "Connect Store"}
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  );
}

export default ShopifyIntegrationCard;
