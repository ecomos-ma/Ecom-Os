import { useEffect, useState } from "react";
import { AlertCircle, CheckCircle2, KeyRound, Loader2, MapPin, Plus, RefreshCw, Save, Trash2, X, MoreHorizontal } from "lucide-react";
import { getIntegrationLogo } from "../../../lib/integrationLogos";
import { useAuth } from "../../../hooks/useAuth";
import {
  disconnectAmeex,
  getAmeexStatus,
  saveAmeexCredentials,
  testAmeexConnection,
  updateAmeexPreferences,
  type AmeexStatus,
} from "../../../services/ameexService";

const EMPTY_STATUS: AmeexStatus = {
  connected: false,
  client_id_last4: null,
  client_key_last4: null,
  open_on_delivery: false,
  try_on_delivery: false,
  fragile: false,
  last_tested_at: null,
  last_test_status: null,
};

type AmeexShippingIntegrationCardProps = {
  autoOpen?: boolean;
  initialCity?: string;
};

export default function AmeexShippingIntegrationCard({ autoOpen = false, initialCity = "", onConnectionChange }: AmeexShippingIntegrationCardProps & { onConnectionChange?: (connected: boolean) => void }) {
  const { workspace } = useAuth();
  const [status, setStatus] = useState<AmeexStatus>(EMPTY_STATUS);
  const [open, setOpen] = useState(false);
  const [clientApiId, setClientApiId] = useState("");
  const [clientApiKey, setClientApiKey] = useState("");
  const [loading, setLoading] = useState(false);
  const [testing, setTesting] = useState(false);
  const [message, setMessage] = useState<{ success: boolean; text: string } | null>(null);

  const load = async () => {
    if (!workspace?.id) return;
    try {
      const nextStatus = await getAmeexStatus(workspace.id);
      setStatus({ ...EMPTY_STATUS, ...nextStatus });
    } catch (error: any) {
      setMessage({ success: false, text: error?.message || "Could not load Ameex settings." });
    }
  };

  useEffect(() => { void load(); }, [workspace?.id]);

  // Report connection state to parent
  useEffect(() => {
    onConnectionChange?.(status.connected);
  }, [status.connected, onConnectionChange]);

  useEffect(() => {
    if (!autoOpen) return;
    setOpen(true);
    setMessage({ success: false, text: "Ameex credentials are required before sending parcels." });
  }, [autoOpen, initialCity]);

  const saveCredentials = async () => {
    if (!workspace?.id || !clientApiId.trim() || !clientApiKey.trim()) return;
    setLoading(true); setMessage(null);
    try {
      const result = await saveAmeexCredentials(workspace.id, clientApiId, clientApiKey);
      setStatus((previous) => ({ ...previous, connected: result.connected, client_id_last4: result.client_id_last4, client_key_last4: result.client_key_last4 }));
      setClientApiId(""); setClientApiKey("");
      setMessage({ success: true, text: "Ameex credentials saved securely. Test the connection before sending orders." });
    } catch (error: any) { setMessage({ success: false, text: error?.message || "Could not save Ameex credentials." }); }
    finally { setLoading(false); }
  };

  const test = async () => {
    if (!workspace?.id) return;
    setTesting(true); setMessage(null);
    try {
      const result = await testAmeexConnection(workspace.id);
      setMessage({ success: true, text: result.message || "Ameex connection verified." });
      await load();
    } catch (error: any) { setMessage({ success: false, text: error?.message || "Ameex connection test failed." }); }
    finally { setTesting(false); }
  };

  const disconnect = async () => {
    if (!workspace?.id || !confirm("Disconnect Ameex? Existing parcel codes and tracking history will be kept.")) return;
    setLoading(true); setMessage(null);
    try {
      await disconnectAmeex(workspace.id);
      setStatus(EMPTY_STATUS); setMessage({ success: true, text: "Ameex disconnected. Historical shipments were kept." });
    } catch (error: any) { setMessage({ success: false, text: error?.message || "Could not disconnect Ameex." }); }
    finally { setLoading(false); }
  };

  const savePreferences = async (field: "open_on_delivery" | "try_on_delivery" | "fragile", value: boolean) => {
    if (!workspace?.id) return;
    const next = { ...status, [field]: value };
    setStatus(next);
    try {
      await updateAmeexPreferences(workspace.id, next);
      setMessage({ success: true, text: "Ameex shipment preferences saved." });
    } catch (error: any) {
      setStatus(status);
      setMessage({ success: false, text: error?.message || "Could not save preferences." });
    }
  };



  return <>
    <div className="group relative flex flex-col h-full rounded-[24px] border border-base-border bg-base-surface p-6 shadow-sm transition-all duration-150 hover:scale-[1.02] hover:shadow-md">
      <div className="absolute right-4 top-4">
        <button className="text-ink-faint hover:text-ink transition-colors"><MoreHorizontal size={18} /></button>
      </div>
      <div className="flex flex-col pb-4">
        <div className="mb-4 flex h-12 w-12 items-center justify-center overflow-hidden rounded-2xl border border-base-border/50 bg-base-raised">
          <img src={getIntegrationLogo("ameex") || ""} alt="Ameex" className="h-full w-full object-contain object-center" />
        </div>
        <h3 className="text-[16px] font-semibold tracking-tight text-ink">Ameex Shipping</h3>
        <div className="mt-2">{status.connected ? <span className="inline-flex h-[22px] items-center gap-1 rounded-full bg-emerald-500/15 px-2.5 text-[10.5px] font-bold uppercase tracking-wider text-emerald-600"><CheckCircle2 size={11} /> Connected</span> : <span className="inline-flex h-[22px] items-center rounded-full bg-base-raised px-2.5 text-[10.5px] font-bold uppercase tracking-wider text-ink-muted">Not connected</span>}</div>
        <p className="mt-3 min-h-[40px] text-[13px] leading-relaxed text-ink-muted flex-1">Morocco shipping with secure parcel creation, tracking, delivery notes, labels, and pickup requests.</p>
      </div>
      <div className="mt-auto border-t border-base-border/60 pt-4">
        {status.connected ? (
          <div className="grid grid-cols-2 gap-2">
            <button onClick={disconnect} disabled={loading} className="h-[38px] rounded-xl bg-base-raised px-3 text-[13px] font-semibold text-ink hover:text-danger hover:bg-danger/10 transition-colors disabled:opacity-60">Disconnect</button>
            <button onClick={() => { setOpen(true); setClientApiId(""); setClientApiKey(""); setMessage(null); }} className="h-[38px] rounded-xl border border-brand/20 bg-brand/5 px-3 text-[13px] font-semibold text-brand hover:bg-brand hover:text-white">Manage</button>
          </div>
        ) : (
          <button onClick={() => { setOpen(true); setClientApiId(""); setClientApiKey(""); setMessage(null); }} className="h-[38px] w-full rounded-xl bg-brand px-3 text-[13px] font-semibold text-white shadow-sm hover:bg-brand/90">Connect</button>
        )}
      </div>
    </div>

    {open && <div className="fixed inset-0 z-[999] overflow-y-auto p-4" onClick={() => !loading && setOpen(false)}>
      <div className="fixed inset-0 bg-black/50 backdrop-blur-sm" />
      <div className="relative mx-auto my-8 w-full max-w-2xl overflow-hidden rounded-[28px] border border-base-border bg-base-surface shadow-2xl" onClick={(event) => event.stopPropagation()}>
        <div className="flex items-center gap-4 border-b border-base-border/60 bg-base-raised/30 px-6 py-5">
          <div className="flex h-11 w-11 items-center justify-center overflow-hidden rounded-2xl bg-brand/10"><img src={getIntegrationLogo("ameex") || ""} alt="Ameex" className="h-full w-full object-contain" /></div>
          <div className="flex-1"><h2 className="text-[18px] font-bold text-ink">Ameex Shipping</h2><p className="text-[13px] text-ink-muted">Your API ID and key stay on the server and are never shown again.</p></div>
          <button onClick={() => setOpen(false)} disabled={loading} className="rounded-full bg-base-raised p-2 text-ink-faint hover:text-ink"><X size={16} /></button>
        </div>

        <div className="max-h-[70vh] space-y-6 overflow-y-auto px-6 py-5">
          <section className="space-y-3">
            <div><h3 className="text-[14px] font-semibold text-ink">Secure credentials</h3><p className="mt-1 text-[12px] text-ink-muted">{status.connected ? "API credentials configured. Enter both values only to replace them." : "Connect your Ameex customer account."}</p></div>
            <label className="block text-[13px] font-medium text-ink"><span className="mb-1.5 flex items-center gap-1.5"><KeyRound size={13} className="text-brand" />Client API ID</span><input autoComplete="off" value={clientApiId} onChange={(event) => setClientApiId(event.target.value)} placeholder={status.connected ? "Enter a new Client API ID to replace" : "Enter your Client API ID"} className="w-full rounded-xl border border-base-border bg-base-raised px-3.5 py-2.5 text-[13px] outline-none focus:border-brand/50" /></label>
            <label className="block text-[13px] font-medium text-ink"><span className="mb-1.5 flex items-center gap-1.5"><KeyRound size={13} className="text-brand" />Client API Key</span><input type="password" autoComplete="new-password" value={clientApiKey} onChange={(event) => setClientApiKey(event.target.value)} placeholder={status.connected ? "Enter a new Client API Key to replace" : "Enter your Client API Key"} className="w-full rounded-xl border border-base-border bg-base-raised px-3.5 py-2.5 text-[13px] outline-none focus:border-brand/50" /></label>
            <div className="flex gap-2"><button onClick={saveCredentials} disabled={loading || !clientApiId.trim() || !clientApiKey.trim()} className="flex flex-1 items-center justify-center gap-2 rounded-xl bg-brand py-2.5 text-[13px] font-semibold text-white hover:bg-brand/90 disabled:opacity-60">{loading ? <Loader2 size={14} className="animate-spin" /> : <Save size={14} />}Save credentials</button><button onClick={test} disabled={testing || !status.connected} className="flex items-center justify-center gap-2 rounded-xl border border-base-border bg-base-raised px-4 text-[13px] font-semibold text-ink hover:bg-base-border disabled:opacity-60">{testing ? <Loader2 size={14} className="animate-spin" /> : <RefreshCw size={14} />}Test</button></div>
          </section>

          {status.connected && <section className="space-y-3 border-t border-base-border pt-5">
            <div><h3 className="text-[14px] font-semibold text-ink">Default shipment preferences</h3><p className="mt-1 text-[12px] text-ink-muted">Applied safely to new Ameex SIMPLE parcels.</p></div>
            <div className="grid gap-2 sm:grid-cols-3">{([
              ["open_on_delivery", "Open on delivery"], ["try_on_delivery", "Try on delivery"], ["fragile", "Fragile"],
            ] as const).map(([field, label]) => <label key={field} className="flex cursor-pointer items-center gap-2 rounded-xl border border-base-border bg-base-raised px-3 py-2.5 text-[12px] font-medium text-ink"><input type="checkbox" checked={status[field]} onChange={(event) => void savePreferences(field, event.target.checked)} className="h-4 w-4 accent-brand" />{label}</label>)}</div>
          </section>}



          {message && <div className={`flex items-start gap-2 rounded-xl px-4 py-3 text-[13px] ${message.success ? "bg-emerald-500/10 text-emerald-700" : "bg-danger/10 text-danger"}`}>{message.success ? <CheckCircle2 size={15} className="mt-0.5 shrink-0" /> : <AlertCircle size={15} className="mt-0.5 shrink-0" />}{message.text}</div>}
        </div>
        <div className="flex gap-3 border-t border-base-border/60 bg-base-raised/20 px-6 py-4">{status.connected && <button onClick={disconnect} disabled={loading} className="rounded-xl bg-danger/10 px-4 text-[13px] font-semibold text-danger hover:bg-danger hover:text-white">Disconnect</button>}<button onClick={() => setOpen(false)} className="ml-auto rounded-xl bg-base-raised px-5 py-2.5 text-[13px] font-semibold text-ink hover:bg-base-border">Close</button></div>
      </div>
    </div>}
  </>;
}
