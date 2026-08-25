import { useState, useEffect } from "react";
import { KeyRound, User, Building2, X, CheckCircle2, Loader2, Save, MoreHorizontal } from "lucide-react";
import { getIntegrationLogo } from "../../../lib/integrationLogos";
import { useAuth } from "../../../hooks/useAuth";
import { supabase } from "../../../lib/supabase";
import { toast } from "../../../components/Toast";

function OzonShippingIntegrationCard() {
  const { workspace, refreshProfile } = useAuth();
  const [isOzonModalOpen, setIsOzonModalOpen] = useState(false);

  const [apiKey, setApiKey] = useState("");
  const [clientId, setClientId] = useState("");
  const [warehouseId, setWarehouseId] = useState("");
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);

  // Populate from workspace (DB-persisted) when modal opens
  useEffect(() => {
    if (isOzonModalOpen) {
      setApiKey(workspace?.ozon_api_key ?? "");
      setClientId(workspace?.ozon_client_id ?? "");
      setWarehouseId(workspace?.ozon_warehouse_id ?? "");
      setSaved(false);
    }
  }, [isOzonModalOpen, workspace?.ozon_api_key, workspace?.ozon_client_id, workspace?.ozon_warehouse_id]);

  const isConnected = Boolean(workspace?.ozon_api_key && workspace?.ozon_client_id);

  const handleSaveIntegration = async () => {
    if (!workspace?.id) return;
    setSaving(true);
    try {
      const { error } = await supabase
        .from("workspaces")
        .update({
          ozon_api_key: apiKey.trim() || null,
          ozon_client_id: clientId.trim() || null,
          ozon_warehouse_id: warehouseId.trim() || null,
        })
        .eq("id", workspace.id);

      if (error) throw error;
      await refreshProfile();
      setSaved(true);
      toast.success("Ozon integration saved!");
      setTimeout(() => {
        setSaved(false);
        setIsOzonModalOpen(false);
      }, 1500);
    } catch (err: any) {
      toast.error(`Failed to save: ${err.message}`);
    } finally {
      setSaving(false);
    }
  };

  const handleDisconnect = async () => {
    if (!workspace?.id || !confirm("Disconnect Ozon? Existing tracking data will be kept.")) return;
    try {
      const { error } = await supabase
        .from("workspaces")
        .update({ ozon_api_key: null, ozon_client_id: null, ozon_warehouse_id: null })
        .eq("id", workspace.id);
      if (error) throw error;
      await refreshProfile();
      toast.success("Ozon disconnected.");
    } catch (err: any) {
      toast.error(`Failed to disconnect: ${err.message}`);
    }
  };

  const handleClose = () => {
    if (!saving) {
      setIsOzonModalOpen(false);
      setSaved(false);
    }
  };

  return (
    <>
      {/* ── Integration Card ── */}
      <div className="group relative flex flex-col h-full overflow-hidden rounded-[24px] border border-base-border bg-base-surface p-6 shadow-sm shadow-black/[0.02] hover:scale-[1.02] hover:shadow-md transition-all duration-150">
        <div className="absolute right-4 top-4">
          <button className="text-ink-faint hover:text-ink transition-colors"><MoreHorizontal size={18} /></button>
        </div>

        <div className="flex flex-col pb-4">
          <div className="mb-4 flex h-12 w-12 flex-none items-center justify-center rounded-2xl bg-base-raised overflow-hidden border border-base-border/50">
            <img src={getIntegrationLogo("ozon") || ""} alt="Ozon Express" className="h-full w-full object-contain object-center" />
          </div>

          <div className="flex flex-col gap-1.5">
            <h3 className="text-[16px] font-semibold tracking-tight text-ink leading-none">Ozon Shipping</h3>
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
            Connect Ozon Express for last-mile delivery tracking and shipment management.
          </p>
        </div>

        <div className="mt-auto border-t border-base-border/60 pt-4">
          {isConnected ? (
            <div className="grid grid-cols-2 gap-2">
              <button
                onClick={handleDisconnect}
                className="h-[38px] rounded-xl bg-base-raised px-3 text-[13px] font-semibold text-ink hover:text-danger hover:bg-danger/10 transition-colors"
              >
                Disconnect
              </button>
              <button
                onClick={() => setIsOzonModalOpen(true)}
                className="h-[38px] rounded-xl border border-brand/20 bg-brand/5 px-3 text-[13px] font-semibold text-brand hover:bg-brand hover:text-white transition-colors"
              >
                Configure
              </button>
            </div>
          ) : (
            <button
              onClick={() => setIsOzonModalOpen(true)}
              className="h-[38px] w-full flex items-center justify-center gap-1.5 rounded-xl bg-brand px-3 text-[13px] font-semibold text-white shadow-sm hover:bg-brand/90 transition-colors"
            >
              Connect
            </button>
          )}
        </div>
      </div>

      {isOzonModalOpen && (
        <div className="fixed inset-0 z-[999] flex items-center justify-center p-4" onClick={handleClose}>
          <div className="absolute inset-0 bg-black/50 backdrop-blur-sm" />
          <div
            className="relative z-10 w-full max-w-lg rounded-[28px] border border-base-border bg-base-surface shadow-2xl overflow-hidden"
            onClick={(e) => e.stopPropagation()}
          >
            {/* Header */}
            <div className="flex items-center gap-4 px-7 py-6 border-b border-base-border/60 bg-base-raised/30">
              <div className="h-11 w-11 rounded-2xl overflow-hidden border border-base-border/50 flex-shrink-0 flex items-center justify-center bg-base-raised">
                <img src={getIntegrationLogo("ozon") || ""} alt="Ozon" className="h-8 w-8 object-contain" />
              </div>
              <div className="flex-1">
                <h2 className="text-[18px] font-bold text-ink">Ozon Shipping</h2>
                <p className="text-[13px] text-ink-muted">Enter your API credentials below</p>
              </div>
              <button onClick={handleClose} disabled={saving} className="rounded-full bg-base-raised p-2 text-ink-faint hover:text-ink hover:bg-base-border transition-colors disabled:opacity-40">
                <X size={16} />
              </button>
            </div>

            {/* Body */}
            <div className="flex flex-col gap-4 px-7 py-6">
              <div>
                <label className="mb-2 flex items-center gap-1.5 text-[13px] font-semibold text-ink">
                  <KeyRound size={13} className="text-brand" /> API Key
                </label>
                <input
                  type="password"
                  value={apiKey}
                  onChange={(e) => setApiKey(e.target.value)}
                  placeholder="Enter your Ozon API key"
                  className="w-full rounded-xl border border-base-border bg-base-raised px-4 py-3 text-[13px] text-ink focus:border-brand/50 focus:outline-none focus:ring-2 focus:ring-brand/10 transition-all"
                />
              </div>
              <div>
                <label className="mb-2 flex items-center gap-1.5 text-[13px] font-semibold text-ink">
                  <User size={13} className="text-brand" /> Client ID / Account ID
                </label>
                <input
                  type="text"
                  value={clientId}
                  onChange={(e) => setClientId(e.target.value)}
                  placeholder="e.g. 123456"
                  className="w-full rounded-xl border border-base-border bg-base-raised px-4 py-3 text-[13px] text-ink focus:border-brand/50 focus:outline-none focus:ring-2 focus:ring-brand/10 transition-all"
                />
              </div>
              <div>
                <label className="mb-2 flex items-center gap-1.5 text-[13px] font-semibold text-ink">
                  <Building2 size={13} className="text-brand" /> Sender Warehouse ID
                </label>
                <input
                  type="text"
                  value={warehouseId}
                  onChange={(e) => setWarehouseId(e.target.value)}
                  placeholder="Origin warehouse identifier"
                  className="w-full rounded-xl border border-base-border bg-base-raised px-4 py-3 text-[13px] text-ink focus:border-brand/50 focus:outline-none focus:ring-2 focus:ring-brand/10 transition-all"
                />
              </div>
              {saved && (
                <div className="flex items-center gap-2 rounded-xl bg-emerald-500/10 px-4 py-3 text-[13px] text-emerald-600">
                  <CheckCircle2 size={14} /> Integration saved successfully!
                </div>
              )}
            </div>

            {/* Footer */}
            <div className="flex items-center gap-3 px-7 py-5 border-t border-base-border/60 bg-base-raised/20">
              <button onClick={handleClose} disabled={saving} className="flex-1 rounded-xl bg-base-raised py-2.5 text-[13px] font-semibold text-ink hover:bg-base-border transition-colors disabled:opacity-60">
                Cancel
              </button>
              <button
                onClick={handleSaveIntegration}
                disabled={saving || saved}
                className="flex-1 flex items-center justify-center gap-2 rounded-xl bg-brand py-2.5 text-[13px] font-semibold text-white shadow-sm hover:bg-brand/90 transition-colors disabled:opacity-60"
              >
                {saving ? <><Loader2 size={14} className="animate-spin" /> Saving…</> : saved ? <><CheckCircle2 size={14} /> Saved ✓</> : <><Save size={14} /> Save Integration</>}
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  );
}

export default OzonShippingIntegrationCard;
