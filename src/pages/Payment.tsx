import { useEffect, useState, type FormEvent, type ReactNode } from "react";
import { Navigate, useNavigate } from "react-router-dom";
import { FileUp, Loader2, Upload } from "lucide-react";
import { useAuth } from "../hooks/useAuth";
import { supabase } from "../lib/supabase";

type PaymentRequest = { id: string; reference: string; requested_plan_id: string; billing_cycle: string; expected_amount_mad: number; currency: string; payment_method: string | null; proof_path: string | null; proof_mime_type: string | null; status: string; admin_note: string | null; created_at: string };
type BankDetails = { bank_name?: string; account_name?: string; rib?: string; iban?: string; instructions?: string };

export default function Payment() {
  const { session, loading, operationalAccess } = useAuth();
  const navigate = useNavigate();
  const [request, setRequest] = useState<PaymentRequest | null>(null);
  const [bank, setBank] = useState<BankDetails>({});
  const [file, setFile] = useState<File | null>(null);
  const [reference, setReference] = useState("");
  const [busy, setBusy] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");

  useEffect(() => { if (!session?.user.id) return; let active = true; void Promise.all([
    supabase.from("subscription_payment_requests").select("id,reference,requested_plan_id,billing_cycle,expected_amount_mad,currency,payment_method,proof_path,proof_mime_type,status,admin_note,created_at").eq("owner_user_id", session.user.id).order("created_at", { ascending: false }).limit(1).maybeSingle(),
    supabase.rpc("get_bank_transfer_details_v1"),
  ]).then(([requestResult, bankResult]) => { if (!active) return; if (requestResult.error) setError(requestResult.error.message); setRequest(requestResult.data as PaymentRequest | null); setBank((bankResult.data || {}) as BankDetails); }).finally(() => { if (active) setBusy(false); }); return () => { active = false; }; }, [session?.user.id]);

  if (loading || busy) return <Screen><Loader2 className="animate-spin text-brand-accent" /></Screen>;
  if (!session) return <Navigate to="/login" replace />;
  if (operationalAccess) return <Navigate to="/dashboard" replace />;
  if (!request) return <Navigate to="/choose-plan" replace />;
  if (request.status === "submitted" || request.status === "reviewing") return <Navigate to="/waiting-verification" replace />;

  const uploadProof = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (!file) { setError("Choose your payment receipt first."); return; }
    if (!reference.trim()) { setError("Enter the bank transfer reference."); return; }
    setSaving(true); setError("");
    const extension = file.name.split(".").pop()?.toLowerCase() || "bin";
    const path = `${session.user.id}/${request.id}-${Date.now()}.${extension}`;
    const upload = await supabase.storage.from("subscription-proofs").upload(path, file, { contentType: file.type, cacheControl: "3600" });
    if (upload.error) { setError(upload.error.message); setSaving(false); return; }
    const referenceUpdate = await supabase.rpc("update_subscription_payment_reference_v1", { p_request_id: request.id, p_transaction_reference: reference.trim() });
    if (referenceUpdate.error) { await supabase.storage.from("subscription-proofs").remove([path]); setError(referenceUpdate.error.message); setSaving(false); return; }
    const result = await supabase.rpc("attach_subscription_payment_proof_v1", { p_request_id: request.id, p_proof_path: path, p_mime_type: file.type, p_size_bytes: file.size });
    if (result.error) { await supabase.storage.from("subscription-proofs").remove([path]); setError(result.error.message); setSaving(false); return; }
    navigate("/waiting-verification", { replace: true });
  };

  return <Screen><main className="w-full max-w-3xl px-4 py-10 md:px-8"><p className="text-xs font-bold uppercase tracking-[0.2em] text-brand-accent">Bank transfer payment</p><h1 className="mt-3 text-3xl font-bold text-ink">Complete your payment</h1><p className="mt-2 text-ink-muted">Your account remains locked until an admin verifies this payment.</p><section className="mt-7 rounded-2xl border border-base-border bg-base-surface p-5"><div className="flex flex-wrap justify-between gap-3"><div><p className="text-xs uppercase text-ink-faint">Payment reference</p><p className="mt-1 font-mono font-bold">{request.reference}</p></div><div className="text-right"><p className="text-xs uppercase text-ink-faint">Amount</p><p className="mt-1 text-2xl font-bold">{Number(request.expected_amount_mad).toLocaleString()} {request.currency}</p></div></div><div className="mt-6 grid gap-3 sm:grid-cols-2"><Detail label="Bank" value={bank.bank_name} /><Detail label="Account name" value={bank.account_name} /><Detail label="RIB" value={bank.rib} /><Detail label="IBAN" value={bank.iban} /></div><p className="mt-5 rounded-xl bg-base-raised p-4 text-sm text-ink-muted">{bank.instructions || "Make the bank transfer using the details above, then upload your receipt."}</p></section><form onSubmit={(event) => void uploadProof(event)} className="mt-5 rounded-2xl border border-base-border bg-base-surface p-5"><h2 className="text-lg font-bold">Upload payment proof</h2><p className="mt-1 text-sm text-ink-muted">Accepted: JPG, PNG, WebP, or PDF up to 10 MB.</p><label className="mt-5 block text-sm font-semibold">Transfer reference<input required value={reference} onChange={(event) => setReference(event.target.value)} className="field mt-2 w-full" placeholder="Bank transfer reference" /></label><label className="mt-4 flex cursor-pointer items-center gap-3 rounded-xl border border-dashed border-base-border bg-base-raised p-4 text-sm"><FileUp size={20} className="text-brand-accent" /><span className="min-w-0 flex-1">{file ? file.name : "Select receipt file"}</span><input required type="file" accept="image/jpeg,image/png,image/webp,application/pdf" className="sr-only" onChange={(event) => setFile(event.target.files?.[0] || null)} /></label>{error && <p className="mt-4 rounded-lg bg-danger/10 p-3 text-sm text-danger">{error}</p>}<button disabled={saving} className="mt-5 inline-flex items-center gap-2 rounded-xl bg-brand-accent px-5 py-3 text-sm font-bold text-white disabled:opacity-60"><Upload size={17} />{saving ? "Submitting…" : "Submit payment proof"}</button></form></main></Screen>;
}
function Detail({ label, value }: { label: string; value?: string }) { return <div className="rounded-xl bg-base-raised p-3"><p className="text-xs uppercase text-ink-faint">{label}</p><p className="mt-1 break-words font-mono text-sm font-semibold">{value || "Not configured"}</p></div>; }
function Screen({ children }: { children: ReactNode }) { return <div className="min-h-screen bg-base px-4 text-ink"><div className="mx-auto flex min-h-screen max-w-7xl items-start justify-center">{children}</div></div>; }
