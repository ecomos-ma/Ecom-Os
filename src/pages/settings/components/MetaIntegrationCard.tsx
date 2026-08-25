import { useState } from "react";
import { CheckCircle2, MoreHorizontal, X, Loader2, Eye, EyeOff, Zap } from "lucide-react";
import { getIntegrationLogo } from "../../../lib/integrationLogos";
import { useAuth } from "../../../hooks/useAuth";
import { supabase } from "../../../lib/supabase";

function MetaIntegrationCard() {
  const { workspace, refreshProfile } = useAuth();
  const [token, setToken] = useState(workspace?.meta_access_token ?? "");
  const [adId, setAdId] = useState(workspace?.meta_ad_account_id ?? "");
  const [modalOpen, setModalOpen] = useState(false);
  const [saving, setSaving] = useState(false);
  const [showToken, setShowToken] = useState(false);

  const connected = !!workspace?.meta_access_token && !!workspace?.meta_ad_account_id;

  const handleSave = async () => {
    if (!workspace) return;
    setSaving(true);
    const { error } = await supabase
      .from("workspaces")
      .update({
        meta_access_token: token.trim() || null,
        meta_ad_account_id: adId.trim() || null,
      })
      .eq("id", workspace.id);

    setSaving(false);
    if (!error) {
      setModalOpen(false);
      refreshProfile();
    }
  };

  const handleDisconnect = async () => {
    if (!workspace) return;
    setSaving(true);
    await supabase.from("workspaces").update({ meta_access_token: null, meta_ad_account_id: null }).eq("id", workspace.id);
    setToken("");
    setAdId("");
    setSaving(false);
    setModalOpen(false);
    refreshProfile();
  };

  return (
    <>
      {/* ── Card ── */}
      <div className="group relative flex flex-col h-full overflow-hidden rounded-[24px] border border-base-border bg-base-surface p-6 shadow-sm shadow-black/[0.02] hover:scale-[1.02] hover:shadow-md transition-all duration-150">
        <div className="absolute right-4 top-4">
          <button className="text-ink-faint hover:text-ink transition-colors"><MoreHorizontal size={18} /></button>
        </div>

        <div className="flex flex-col pb-4">
          <div className="mb-4 flex h-12 w-12 flex-none items-center justify-center rounded-2xl bg-base-raised overflow-hidden border border-base-border/50">
            <img src={getIntegrationLogo("meta") || ""} alt="Meta Ads" className="h-full w-full object-contain object-center" />
          </div>
          <div className="flex flex-col gap-1.5">
            <h3 className="text-[16px] font-semibold tracking-tight text-ink leading-none">Meta Ads</h3>
            <div className="flex items-center">
              {connected ? (
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
            Sync active campaigns, spend, and ROAS directly from your Facebook Ad accounts.
          </p>
        </div>

        <div className="mt-auto border-t border-base-border/60 pt-4">
          {connected ? (
            <div className="grid grid-cols-2 gap-2">
              <button
                onClick={handleDisconnect}
                disabled={saving}
                className="h-[38px] rounded-xl bg-base-raised px-3 text-[13px] font-semibold text-ink hover:text-danger hover:bg-danger/10 transition-colors disabled:opacity-60"
              >
                Disconnect
              </button>
              <button
                onClick={() => setModalOpen(true)}
                className="h-[38px] rounded-xl border border-brand/20 bg-brand/5 px-3 text-[13px] font-semibold text-brand hover:bg-brand hover:text-white transition-colors"
              >
                Configure
              </button>
            </div>
          ) : (
            <button
              onClick={() => setModalOpen(true)}
              className="h-[38px] w-full rounded-xl bg-brand px-3 text-[13px] font-semibold text-white shadow-sm hover:bg-brand/90 transition-colors"
            >
              Connect
            </button>
          )}
        </div>
      </div>

      {/* ── SaaS Modal ── */}
      {modalOpen && (
        <div className="fixed inset-0 z-[999] flex items-center justify-center p-4">
          <div className="absolute inset-0 bg-black/50 backdrop-blur-sm" onClick={() => setModalOpen(false)} />
          <div className="relative z-10 w-full max-w-lg rounded-[28px] border border-base-border bg-base-surface shadow-2xl overflow-hidden">
            {/* Header */}
            <div className="flex items-center gap-4 px-7 py-6 border-b border-base-border/60 bg-base-raised/30">
              <div className="h-11 w-11 rounded-2xl overflow-hidden border border-base-border/50 flex-shrink-0">
                <img src={getIntegrationLogo("meta") || ""} alt="Meta Ads" className="h-full w-full object-contain" />
              </div>
              <div className="flex-1">
                <h2 className="text-[18px] font-bold text-ink">Meta Ads</h2>
                <p className="text-[13px] text-ink-muted">Connect your Facebook Ads account</p>
              </div>
              <button onClick={() => setModalOpen(false)} className="rounded-full bg-base-raised p-2 text-ink-faint hover:text-ink hover:bg-base-border transition-colors">
                <X size={16} />
              </button>
            </div>
            {/* Body */}
            <div className="px-7 py-6 flex flex-col gap-5">
              <div>
                <label className="mb-2 flex items-center gap-1.5 text-[13px] font-semibold text-ink">
                  System User Access Token
                </label>
                <div className="relative">
                  <input
                    type={showToken ? "text" : "password"}
                    value={token}
                    onChange={(e) => setToken(e.target.value)}
                    className="w-full rounded-xl border border-base-border bg-base-raised px-4 py-3 pr-11 text-[13px] text-ink focus:border-brand/50 focus:outline-none focus:ring-2 focus:ring-brand/10 transition-all"
                    placeholder="EAAGm0..."
                  />
                  <button
                    type="button"
                    onClick={() => setShowToken(!showToken)}
                    className="absolute right-3 top-1/2 -translate-y-1/2 text-ink-faint hover:text-ink transition-colors"
                  >
                    {showToken ? <EyeOff size={15} /> : <Eye size={15} />}
                  </button>
                </div>
              </div>
              <div>
                <label className="mb-2 flex items-center gap-1.5 text-[13px] font-semibold text-ink">
                  Ad Account ID
                </label>
                <input
                  type="text"
                  value={adId}
                  onChange={(e) => setAdId(e.target.value)}
                  className="w-full rounded-xl border border-base-border bg-base-raised px-4 py-3 text-[13px] text-ink focus:border-brand/50 focus:outline-none focus:ring-2 focus:ring-brand/10 transition-all"
                  placeholder="act_123456789"
                />
              </div>
              <div className="rounded-xl bg-base-raised/60 border border-base-border/60 p-4">
                <p className="text-[12px] text-ink-muted">
                  You can find your Access Token under <strong>Meta Business Suite → Settings → System Users</strong>. Ensure the token has <strong>ads_read</strong> and <strong>ads_management</strong> permissions.
                </p>
              </div>
            </div>
            {/* Footer */}
            <div className="flex items-center gap-3 px-7 py-5 border-t border-base-border/60 bg-base-raised/20">
              <button
                onClick={() => setModalOpen(false)}
                disabled={saving}
                className="flex-1 rounded-xl bg-base-raised py-2.5 text-[13px] font-semibold text-ink hover:bg-base-border transition-colors disabled:opacity-60"
              >
                Cancel
              </button>
              <button
                onClick={handleSave}
                disabled={saving}
                className="flex-1 flex items-center justify-center gap-2 rounded-xl bg-brand py-2.5 text-[13px] font-semibold text-white shadow-sm hover:bg-brand/90 transition-colors disabled:opacity-60"
              >
                {saving ? <><Loader2 size={14} className="animate-spin" /> Saving...</> : <><Zap size={14} /> Save Connection</>}
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  );
}

export default MetaIntegrationCard;
