import { useCallback, useEffect, useState } from "react";
import { Loader2, Save } from "lucide-react";
import { founderAdmin, type FounderPlatformSetting } from "../../../lib/founderAdmin";
import { errorMessage } from "./shared";

type Details = { bank_name: string; account_name: string; rib: string; iban: string; instructions: string };
const empty: Details = { bank_name: "", account_name: "", rib: "", iban: "", instructions: "Make the bank transfer using the details below, then upload your receipt." };

export function BankTransferSettings() {
  const [setting, setSetting] = useState<FounderPlatformSetting | null>(null);
  const [details, setDetails] = useState<Details>(empty);
  const [saving, setSaving] = useState(false);
  const [loading, setLoading] = useState(true);
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");
  const load = useCallback(async () => { setLoading(true); try { const rows = await founderAdmin.platformSettingsV3(); const found = rows.find((row) => row.settings_key === "bank_transfer_details") || null; setSetting(found); if (found?.value && typeof found.value === "object") setDetails({ ...empty, ...(found.value as Partial<Details>) }); } catch (err) { setError(errorMessage(err)); } finally { setLoading(false); } }, []);
  useEffect(() => { void load(); }, [load]);
  const save = async () => { setSaving(true); setError(""); setMessage(""); try { if (!setting) throw new Error("Bank transfer setting is not available."); await founderAdmin.updatePlatformSettingV3(setting.id, details, "Bank transfer details shown on the customer payment page.", "billing"); setMessage("Bank transfer details updated."); } catch (err) { setError(errorMessage(err)); } finally { setSaving(false); } };
  if (loading) return <div className="grid h-40 place-items-center"><Loader2 className="animate-spin text-brand-accent" /></div>;
  return <section className="mt-6 rounded-xl border border-base-border bg-base-surface p-5 shadow-sm"><div><p className="text-xs font-bold uppercase tracking-wide text-brand-accent">Payment setup</p><h2 className="mt-1 text-lg font-bold">Bank transfer information</h2><p className="mt-1 text-sm text-ink-muted">These details appear live on every customer Payment page.</p></div>{error && <p className="mt-4 rounded-lg bg-danger/10 p-3 text-sm text-danger">{error}</p>}{message && <p className="mt-4 rounded-lg bg-emerald-500/10 p-3 text-sm text-emerald-700">{message}</p>}<div className="mt-5 grid gap-3 md:grid-cols-2"><Field label="Bank name" value={details.bank_name} onChange={(value) => setDetails((current) => ({ ...current, bank_name: value }))} /><Field label="Account name" value={details.account_name} onChange={(value) => setDetails((current) => ({ ...current, account_name: value }))} /><Field label="RIB" value={details.rib} onChange={(value) => setDetails((current) => ({ ...current, rib: value }))} /><Field label="IBAN" value={details.iban} onChange={(value) => setDetails((current) => ({ ...current, iban: value }))} /></div><label className="mt-3 block text-sm font-semibold">Instructions<textarea rows={3} value={details.instructions} onChange={(event) => setDetails((current) => ({ ...current, instructions: event.target.value }))} className="mt-2 w-full rounded-lg border border-base-border bg-base-raised p-3 text-sm" /></label><button type="button" disabled={saving} onClick={() => void save()} className="mt-4 inline-flex items-center gap-2 rounded-lg bg-brand-accent px-4 py-2 text-sm font-bold text-white disabled:opacity-60"><Save size={16} />{saving ? "Saving…" : "Save bank details"}</button></section>;
}
function Field({ label, value, onChange }: { label: string; value: string; onChange: (value: string) => void }) { return <label className="text-sm font-semibold">{label}<input value={value} onChange={(event) => onChange(event.target.value)} className="field mt-2 w-full" /></label>; }
