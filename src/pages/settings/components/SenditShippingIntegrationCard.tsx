import { useEffect, useState } from "react";
import { AlertCircle, CheckCircle2, KeyRound, Loader2, RefreshCw, Save, X, MoreHorizontal, Truck } from "lucide-react";
import { getIntegrationLogo } from "../../../lib/integrationLogos";
import { useAuth } from "../../../hooks/useAuth";
import { supabase } from "../../../lib/supabase";
import {
  disconnectSendit,
  getSenditPackagings,
  getSenditStatus,
  saveSenditCredentials,
  testSenditConnection,
  updateSenditPreferences,
  type SenditPackaging,
  type SenditStatus,
} from "../../../services/senditService";

const EMPTY_STATUS: SenditStatus = {
  connected: false, public_key_last4: null, secret_key_last4: null,
  pickup_district_id: null, allow_open: false, allow_try: false, packaging_id: null,
  last_tested_at: null, last_test_status: null,
};

const DEFAULT_PICKUP_ID = 46; // Casablanca

type PickupCity = { sendit_city_id: number; city_name: string; arabic_name?: string | null };

export default function SenditShippingIntegrationCard({ onConnectionChange }: { onConnectionChange?: (connected: boolean) => void }) {
  const { workspace } = useAuth();
  const [status, setStatus] = useState<SenditStatus>(EMPTY_STATUS);
  const [pickupCities, setPickupCities] = useState<PickupCity[]>([]);
  const [packagings, setPackagings] = useState<SenditPackaging[]>([]);
  const [open, setOpen] = useState(false);
  const [publicKey, setPublicKey] = useState("");
  const [secretKey, setSecretKey] = useState("");
  const [loading, setLoading] = useState(false);
  const [testing, setTesting] = useState(false);
  const [message, setMessage] = useState<{ success: boolean; text: string } | null>(null);

  const load = async () => {
    if (!workspace?.id) return;
    try { setStatus({ ...EMPTY_STATUS, ...(await getSenditStatus(workspace.id)) }); }
    catch (error: any) { setMessage({ success: false, text: error?.message || "Could not load Sendit settings." }); }
  };

  const loadProviderOptions = async () => {
    if (!workspace?.id || !status.connected) return;
    try {
      // Load pickup cities from local table — faster and no auth dependency
      const { data: pickupData } = await supabase
        .from("sendit_city_mappings")
        .select("sendit_city_id, city_name, arabic_name")
        .eq("is_pickup_city", true)
        .order("city_name");
      setPickupCities(pickupData || []);

      // Load packaging options from Sendit API
      const packagingResult = await getSenditPackagings(workspace.id);
      setPackagings(packagingResult.data || []);
    } catch (error: any) {
      setMessage({ success: false, text: error?.message || "Could not load Sendit options." });
    }
  };

  useEffect(() => { void load(); }, [workspace?.id]);
  useEffect(() => { if (open) void loadProviderOptions(); }, [open, workspace?.id, status.connected]);

  // Report connection state to parent
  useEffect(() => {
    onConnectionChange?.(status.connected);
  }, [status.connected, onConnectionChange]);

  // Auto-save Casablanca as default pickup city if nothing is configured yet
  useEffect(() => {
    if (
      open &&
      status.connected &&
      status.pickup_district_id == null &&
      pickupCities.length > 0 &&
      workspace?.id
    ) {
      const casablanca = pickupCities.find((c) => c.sendit_city_id === DEFAULT_PICKUP_ID);
      if (casablanca) {
        void savePreferences({ pickup_district_id: DEFAULT_PICKUP_ID });
      }
    }
  }, [open, status.connected, status.pickup_district_id, pickupCities, workspace?.id]);

  const saveCredentials = async () => {
    if (!workspace?.id || !publicKey.trim() || !secretKey.trim()) return;
    setLoading(true); setMessage(null);
    try {
      const result = await saveSenditCredentials(workspace.id, publicKey.trim(), secretKey.trim());
      setStatus((previous) => ({ ...previous, connected: result.connected, public_key_last4: result.public_key_last4, secret_key_last4: result.secret_key_last4 }));
      setPublicKey(""); setSecretKey("");
      setMessage({ success: true, text: "Sendit credentials saved securely. Test the connection before sending orders." });
    } catch (error: any) { setMessage({ success: false, text: error?.message || "Could not save Sendit credentials." }); }
    finally { setLoading(false); }
  };

  const test = async () => {
    if (!workspace?.id) return;
    setTesting(true); setMessage(null);
    try {
      const result = await testSenditConnection(workspace.id);
      setMessage({ success: true, text: result.message || "Connected successfully." });
      await load();
    }
    catch (error: any) { setMessage({ success: false, text: error?.message || "Sendit connection test failed." }); }
    finally { setTesting(false); }
  };

  const disconnect = async () => {
    if (!workspace?.id || !confirm("Disconnect Sendit? Existing tracking history will be kept.")) return;
    setLoading(true); setMessage(null);
    try {
      await disconnectSendit(workspace.id);
      setStatus(EMPTY_STATUS); setPickupCities([]); setPackagings([]);
      setMessage({ success: true, text: "Sendit disconnected. Historical shipments were kept." });
    }
    catch (error: any) { setMessage({ success: false, text: error?.message || "Could not disconnect Sendit." }); }
    finally { setLoading(false); }
  };

  const savePreferences = async (changes: Partial<Pick<SenditStatus, "pickup_district_id" | "allow_open" | "allow_try" | "packaging_id">>) => {
    if (!workspace?.id) return;
    const previous = status; const next = { ...status, ...changes };
    setStatus(next);
    try { await updateSenditPreferences(workspace.id, changes); setMessage({ success: true, text: "Sendit delivery preferences saved." }); }
    catch (error: any) { setStatus(previous); setMessage({ success: false, text: error?.message || "Could not save Sendit preferences." }); }
  };

  const selectedPickupCity = pickupCities.find((c) => c.sendit_city_id === status.pickup_district_id);

  return <>
    <div className="group relative flex flex-col h-full rounded-[24px] border border-base-border bg-base-surface p-6 shadow-sm transition-all duration-150 hover:scale-[1.02] hover:shadow-md">
      <div className="absolute right-4 top-4">
        <button className="text-ink-faint hover:text-ink transition-colors"><MoreHorizontal size={18} /></button>
      </div>
      <div className="flex flex-col pb-4">
        <div className="mb-4 flex h-12 w-12 items-center justify-center overflow-hidden rounded-2xl border border-base-border/50 bg-base-raised">
          <img src={getIntegrationLogo("sendit") || ""} alt="Sendit" className="h-full w-full object-contain object-center" />
        </div>
        <h3 className="text-[16px] font-semibold tracking-tight text-ink">Sendit Shipping</h3>
        <div className="mt-2">{status.connected ? <span className="inline-flex h-[22px] items-center gap-1 rounded-full bg-emerald-500/15 px-2.5 text-[10.5px] font-bold uppercase tracking-wider text-emerald-600"><CheckCircle2 size={11} /> Connected</span> : <span className="inline-flex h-[22px] items-center rounded-full bg-base-raised px-2.5 text-[10.5px] font-bold uppercase tracking-wider text-ink-muted">Not connected</span>}</div>
        {status.connected && status.pickup_district_id && (
          <p className="mt-2 text-[11px] text-ink-muted">
            Pickup: <span className="font-semibold text-ink">{selectedPickupCity?.city_name ?? `City ${status.pickup_district_id}`}</span>
          </p>
        )}
        {status.connected && !status.pickup_district_id && (
          <p className="mt-2 text-[11px] text-warn font-medium flex items-center gap-1">
            <AlertCircle size={11} /> No pickup city set — open Manage to configure
          </p>
        )}
        <p className="mt-3 min-h-[40px] text-[13px] leading-relaxed text-ink-muted flex-1">Morocco delivery with secure parcel creation, Sendit cities, labels, pickups, returns, and tracking.</p>
      </div>
      <div className="mt-auto border-t border-base-border/60 pt-4">
        {status.connected ? (
          <div className="grid grid-cols-2 gap-2">
            <button onClick={() => void disconnect()} disabled={loading} className="h-[38px] rounded-xl bg-base-raised px-3 text-[13px] font-semibold text-ink hover:text-danger hover:bg-danger/10 transition-colors disabled:opacity-60">Disconnect</button>
            <button onClick={() => { setOpen(true); setPublicKey(""); setSecretKey(""); setMessage(null); }} className="h-[38px] rounded-xl border border-brand/20 bg-brand/5 px-3 text-[13px] font-semibold text-brand hover:bg-brand hover:text-white">Manage</button>
          </div>
        ) : (
          <button onClick={() => { setOpen(true); setPublicKey(""); setSecretKey(""); setMessage(null); }} className="h-[38px] w-full rounded-xl bg-brand px-3 text-[13px] font-semibold text-white shadow-sm hover:bg-brand/90">Connect</button>
        )}
      </div>
    </div>

    {open && <div className="fixed inset-0 z-[999] overflow-y-auto p-4" onClick={() => !loading && setOpen(false)}>
      <div className="fixed inset-0 bg-black/50 backdrop-blur-sm" />
      <div className="relative mx-auto my-8 w-full max-w-2xl overflow-hidden rounded-[28px] border border-base-border bg-base-surface shadow-2xl" onClick={(event) => event.stopPropagation()}>
        <div className="flex items-center gap-4 border-b border-base-border/60 bg-base-raised/30 px-6 py-5"><div className="flex h-11 w-11 items-center justify-center rounded-2xl bg-brand/10 text-brand"><Truck size={21} /></div><div className="flex-1"><h2 className="text-[18px] font-bold text-ink">Sendit Shipping</h2><p className="text-[13px] text-ink-muted">Your public and secret keys remain server-side and are never shown again.</p></div><button onClick={() => setOpen(false)} disabled={loading} className="rounded-full bg-base-raised p-2 text-ink-faint hover:text-ink"><X size={16} /></button></div>
        <div className="max-h-[70vh] space-y-6 overflow-y-auto px-6 py-5">
          <section className="space-y-3"><div><h3 className="text-[14px] font-semibold text-ink">Secure credentials</h3><p className="mt-1 text-[12px] text-ink-muted">{status.connected ? "Credentials configured. Enter both fields only to replace them." : "Connect your Sendit account."}</p></div>
            <label className="block text-[13px] font-medium text-ink"><span className="mb-1.5 flex items-center gap-1.5"><KeyRound size={13} className="text-brand" />Public Key</span><input autoComplete="off" value={publicKey} onChange={(event) => setPublicKey(event.target.value)} placeholder={status.connected ? "Enter a new Public Key to replace" : "Enter your Public Key"} className="w-full rounded-xl border border-base-border bg-base-raised px-3.5 py-2.5 text-[13px] outline-none focus:border-brand/50" /></label>
            <label className="block text-[13px] font-medium text-ink"><span className="mb-1.5 flex items-center gap-1.5"><KeyRound size={13} className="text-brand" />Private / Secret Key</span><input type="password" autoComplete="new-password" value={secretKey} onChange={(event) => setSecretKey(event.target.value)} placeholder={status.connected ? "Enter a new Secret Key to replace" : "Enter your Secret Key"} className="w-full rounded-xl border border-base-border bg-base-raised px-3.5 py-2.5 text-[13px] outline-none focus:border-brand/50" /></label>
            <div className="flex gap-2"><button onClick={() => void saveCredentials()} disabled={loading || !publicKey.trim() || !secretKey.trim()} className="flex flex-1 items-center justify-center gap-2 rounded-xl bg-brand py-2.5 text-[13px] font-semibold text-white hover:bg-brand/90 disabled:opacity-60">{loading ? <Loader2 size={14} className="animate-spin" /> : <Save size={14} />}Save credentials</button><button onClick={() => void test()} disabled={testing || !status.connected} className="flex items-center justify-center gap-2 rounded-xl border border-base-border bg-base-raised px-4 text-[13px] font-semibold text-ink hover:bg-base-border disabled:opacity-60">{testing ? <Loader2 size={14} className="animate-spin" /> : <RefreshCw size={14} />}Test</button></div>
          </section>
          {status.connected && <section className="space-y-3 border-t border-base-border pt-5"><div><h3 className="text-[14px] font-semibold text-ink">Default delivery preferences</h3><p className="mt-1 text-[12px] text-ink-muted">Pickup city determines Sendit delivery prices and delays. Webhook is ready for production setup; localhost uses safe polling.</p></div>
            <label className="block text-[13px] font-medium text-ink">
              Default Pickup City
              {!status.pickup_district_id && pickupCities.length > 0 && (
                <span className="ml-2 text-[11px] font-normal text-warn">⚠ Required before sending orders</span>
              )}
              <select
                value={status.pickup_district_id ?? ""}
                onChange={(event) => void savePreferences({ pickup_district_id: event.target.value ? Number(event.target.value) : null })}
                className={`mt-1.5 w-full rounded-xl border px-3.5 py-2.5 text-[13px] outline-none focus:border-brand/50 bg-base-raised ${!status.pickup_district_id ? "border-warn/60" : "border-base-border"}`}
              >
                <option value="">Select Sendit pickup city</option>
                {pickupCities.map((city) => (
                  <option key={city.sendit_city_id} value={city.sendit_city_id}>
                    {city.city_name}{city.arabic_name ? ` — ${city.arabic_name}` : ""}
                  </option>
                ))}
              </select>
            </label>
            <div className="grid gap-2 sm:grid-cols-2"><label className="flex cursor-pointer items-center gap-2 rounded-xl border border-base-border bg-base-raised px-3 py-2.5 text-[12px] font-medium text-ink"><input type="checkbox" checked={status.allow_open} onChange={(event) => void savePreferences({ allow_open: event.target.checked })} className="h-4 w-4 accent-brand" />Allow open</label><label className="flex cursor-pointer items-center gap-2 rounded-xl border border-base-border bg-base-raised px-3 py-2.5 text-[12px] font-medium text-ink"><input type="checkbox" checked={status.allow_try} onChange={(event) => void savePreferences({ allow_try: event.target.checked })} className="h-4 w-4 accent-brand" />Allow try</label></div>
            <label className="block text-[13px] font-medium text-ink">Default packaging <span className="font-normal text-ink-muted">(optional)</span><select value={status.packaging_id ?? ""} onChange={(event) => void savePreferences({ packaging_id: event.target.value ? Number(event.target.value) : null })} className="mt-1.5 w-full rounded-xl border border-base-border bg-base-raised px-3.5 py-2.5 text-[13px] outline-none focus:border-brand/50"><option value="">No default packaging</option>{packagings.map((item) => <option key={item.id} value={item.id}>{item.name}{item.code ? ` (${item.code})` : ""}</option>)}</select></label>
          </section>}
          {message && <div className={`flex items-start gap-2 rounded-xl px-4 py-3 text-[13px] ${message.success ? "bg-emerald-500/10 text-emerald-700" : "bg-danger/10 text-danger"}`}>{message.success ? <CheckCircle2 size={15} className="mt-0.5 shrink-0" /> : <AlertCircle size={15} className="mt-0.5 shrink-0" />}{message.text}</div>}
        </div>
        <div className="flex gap-3 border-t border-base-border/60 bg-base-raised/20 px-6 py-4">{status.connected && <button onClick={() => void disconnect()} disabled={loading} className="rounded-xl bg-danger/10 px-4 text-[13px] font-semibold text-danger hover:bg-danger hover:text-white">Disconnect</button>}<button onClick={() => setOpen(false)} className="ml-auto rounded-xl bg-base-raised px-5 py-2.5 text-[13px] font-semibold text-ink hover:bg-base-border">Close</button></div>
      </div>
    </div>}
  </>;
}
