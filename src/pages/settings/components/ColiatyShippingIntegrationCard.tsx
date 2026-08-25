import { useState, useEffect } from "react";
import { Truck, ExternalLink, Globe, KeyRound, X, CheckCircle2, Loader2, RefreshCw, AlertCircle, Save, Eye, EyeOff, MoreHorizontal } from "lucide-react";
import { getIntegrationLogo } from "../../../lib/integrationLogos";
import { useAuth } from "../../../hooks/useAuth";
import { supabase } from "../../../lib/supabase";

function ColiatyShippingIntegrationCard() {
  const { workspace, refreshProfile } = useAuth();
  const [isColiatyModalOpen, setIsColiatyModalOpen] = useState(false);
  const [publicKey, setPublicKey] = useState("");
  const [secretKey, setSecretKey] = useState("");
  const [showSecretKey, setShowSecretKey] = useState(false);
  const [apiUrl, setApiUrl] = useState("");
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);
  const [testing, setTesting] = useState(false);
  const [testResult, setTestResult] = useState<{ success: boolean; message: string } | null>(null);

  // Populate fields whenever the modal opens OR whenever workspace data arrives
  // (workspace loads asynchronously — if the modal opens before workspace is ready,
  // we must re-populate when workspace finally arrives, not just on modal-open toggle).
  useEffect(() => {
    if (isColiatyModalOpen) {
      setPublicKey(workspace?.coliaty_public_key || "");
      setSecretKey(workspace?.coliaty_secret_key || "");
      setApiUrl(workspace?.coliaty_api_url || "https://api.coliaty.ma");
      setTestResult(null);
    }
  }, [isColiatyModalOpen, workspace?.coliaty_public_key, workspace?.coliaty_secret_key, workspace?.coliaty_api_url, workspace?.id]);

  const handleTestConnection = async () => {
    setTesting(true);
    setTestResult(null);

    try {
      const response = await fetch(`${apiUrl.trim()}/cities/getCities`, {
        method: 'GET',
        headers: {
          'Authorization': `Bearer ${publicKey.trim()}:${secretKey.trim()}`,
          'Content-Type': 'application/json',
        },
      });

      if (response.ok) {
        setTestResult({ success: true, message: "Connection successful! API key is valid." });
      } else {
        const errorData = await response.json().catch(() => ({}));
        setTestResult({ success: false, message: errorData.message || `Connection failed: ${response.status}` });
      }
    } catch (error: any) {
      setTestResult({ success: false, message: error.message || "Network error" });
    } finally {
      setTesting(false);
    }
  };

  const handleSaveIntegration = async () => {
    setSaving(true);
    setTestResult(null);

    try {
      const { error } = await supabase
        .from("workspaces")
        .update({
          coliaty_enabled: true,
          coliaty_public_key: publicKey.trim(),
          coliaty_secret_key: secretKey.trim(),
        })
        .eq("id", workspace?.id);

      if (error) throw error;

      await refreshProfile();
      setSaved(true);
      setTimeout(() => {
        setSaved(false);
        setIsColiatyModalOpen(false);
      }, 1500);
    } catch (error: any) {
      setTestResult({ success: false, message: error.message || "Failed to save integration" });
    } finally {
      setSaving(false);
    }
  };

  const handleDisable = async () => {
    if (!confirm("Are you sure you want to disable Coliaty integration?")) return;

    try {
      const { error } = await supabase
        .from("workspaces")
        .update({
          coliaty_enabled: false,
          coliaty_public_key: null,
          coliaty_secret_key: null,
          coliaty_api_url: null,
        })
        .eq("id", workspace?.id);

      if (error) throw error;
      await refreshProfile();
    } catch (error: any) {
      console.error("Failed to disable Coliaty:", error);
    }
  };

  const handleClose = () => {
    if (!saving) {
      setIsColiatyModalOpen(false);
      setSaved(false);
      setTestResult(null);
    }
  };

  const isConnected = workspace?.coliaty_enabled && workspace?.coliaty_public_key && workspace?.coliaty_secret_key;

  return (
    <>
      {/* ── Integration Card ── */}
      <div className="group relative flex flex-col h-full overflow-hidden rounded-[24px] border border-base-border bg-base-surface p-6 shadow-sm shadow-black/[0.02] hover:scale-[1.02] hover:shadow-md transition-all duration-150">
        <div className="absolute right-4 top-4">
          <button className="text-ink-faint hover:text-ink transition-colors"><MoreHorizontal size={18} /></button>
        </div>

        <div className="flex flex-col pb-4">
          <div className="mb-4 flex h-12 w-12 flex-none items-center justify-center rounded-2xl bg-base-raised overflow-hidden border border-base-border/50">
            <img src={getIntegrationLogo("coliaty") || ""} alt="Coliaty Delivery" className="h-full w-full object-contain object-center" />
          </div>

          <div className="flex flex-col gap-1.5">
            <div className="flex items-center gap-2">
              <h3 className="text-[16px] font-semibold tracking-tight text-ink leading-none">Coliaty Shipping</h3>
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
            Connect Coliaty for last-mile delivery tracking and shipment management.
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
                onClick={() => setIsColiatyModalOpen(true)}
                className="h-[38px] rounded-xl border border-brand/20 bg-brand/5 px-3 text-[13px] font-semibold text-brand hover:bg-brand hover:text-white transition-colors"
              >
                Configure
              </button>
            </div>
          ) : (
            <button
              onClick={() => setIsColiatyModalOpen(true)}
              className="h-[38px] w-full flex items-center justify-center gap-1.5 rounded-xl bg-brand px-3 text-[13px] font-semibold text-white shadow-sm hover:bg-brand/90 transition-colors"
            >
              Connect
            </button>
          )}
        </div>
      </div>

      {/* ── Configuration Modal ── */}
      {isColiatyModalOpen && (
        <div className="fixed inset-0 z-[999] flex items-center justify-center p-4" onClick={handleClose}>
          <div className="absolute inset-0 bg-black/50 backdrop-blur-sm" />
          <div
            className="relative z-10 w-full max-w-lg rounded-[28px] border border-base-border bg-base-surface shadow-2xl overflow-hidden"
            onClick={(e) => e.stopPropagation()}
          >
            {/* Header */}
            <div className="flex items-center gap-4 px-7 py-6 border-b border-base-border/60 bg-base-raised/30">
              <div className="h-11 w-11 rounded-2xl overflow-hidden border border-base-border/50 flex-shrink-0">
                <img src={getIntegrationLogo("coliaty") || ""} alt="Coliaty" className="h-full w-full object-contain" />
              </div>
              <div className="flex-1">
                <h2 className="text-[18px] font-bold text-ink">Coliaty Shipping</h2>
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
                  <Globe size={13} className="text-brand" /> API URL
                </label>
                <input
                  type="text"
                  value={apiUrl}
                  onChange={(e) => setApiUrl(e.target.value)}
                  placeholder="https://api.coliaty.ma"
                  className="w-full rounded-xl border border-base-border bg-base-raised px-4 py-3 text-[13px] text-ink focus:border-brand/50 focus:outline-none focus:ring-2 focus:ring-brand/10 transition-all"
                />
              </div>
              <div>
                <label className="mb-2 flex items-center gap-1.5 text-[13px] font-semibold text-ink">
                  <KeyRound size={13} className="text-brand" /> Public Key
                </label>
                <input
                  type="text"
                  value={publicKey}
                  onChange={(e) => setPublicKey(e.target.value)}
                  placeholder="Enter your Coliaty Public Key"
                  className="w-full rounded-xl border border-base-border bg-base-raised px-4 py-3 text-[13px] text-ink focus:border-brand/50 focus:outline-none focus:ring-2 focus:ring-brand/10 transition-all"
                />
              </div>
              <div>
                <label className="mb-2 flex items-center gap-1.5 text-[13px] font-semibold text-ink">
                  <KeyRound size={13} className="text-brand" /> Secret Key
                </label>
                <div className="relative">
                  <input
                    type={showSecretKey ? "text" : "password"}
                    value={secretKey}
                    onChange={(e) => setSecretKey(e.target.value)}
                    placeholder="Enter your Coliaty Secret Key"
                    className="w-full rounded-xl border border-base-border bg-base-raised px-4 py-3 pr-11 text-[13px] text-ink focus:border-brand/50 focus:outline-none focus:ring-2 focus:ring-brand/10 transition-all"
                  />
                  <button type="button" onClick={() => setShowSecretKey(!showSecretKey)} className="absolute right-3 top-1/2 -translate-y-1/2 text-ink-faint hover:text-ink transition-colors">
                    {showSecretKey ? <EyeOff size={15} /> : <Eye size={15} />}
                  </button>
                </div>
              </div>
              <button
                onClick={handleTestConnection}
                disabled={testing || !publicKey || !secretKey || !apiUrl}
                className="flex items-center justify-center gap-2 rounded-xl border border-base-border bg-base-raised py-3 text-[13px] font-semibold text-ink hover:bg-base-border transition-colors disabled:opacity-60"
              >
                {testing ? <><Loader2 size={14} className="animate-spin" /> Testing…</> : <><RefreshCw size={14} /> Test Connection</>}
              </button>
              {testResult && (
                <div className={`flex items-center gap-2 rounded-xl px-4 py-3 text-[13px] ${testResult.success ? "bg-emerald-500/10 text-emerald-600" : "bg-danger/10 text-danger"}`}>
                  {testResult.success ? <CheckCircle2 size={14} /> : <AlertCircle size={14} />}
                  {testResult.message}
                </div>
              )}
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
                disabled={saving || saved || !publicKey || !secretKey}
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

export default ColiatyShippingIntegrationCard;
