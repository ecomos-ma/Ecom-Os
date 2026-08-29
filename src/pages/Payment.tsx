import { useEffect, useState, type FormEvent, type ReactNode } from "react";
import { Navigate, useNavigate } from "react-router-dom";
import QRCode from "react-qr-code";
import { ArrowRight, BadgeCheck, Building2, Check, ChevronDown, Copy, CreditCard, FileUp, Headphones, Landmark, Loader2, LockKeyhole, QrCode, ShieldCheck, Sparkles } from "lucide-react";
import { useAuth } from "../hooks/useAuth";
import { supabase } from "../lib/supabase";
import { PRICING_PLANS, type BillingPeriod, type PlanTier } from "../config/pricing";
import { downloadPaymentReceiptPdf } from "../lib/paymentReceipt";
import ecomosLogo from "../assets/ecomos_logo_137x32.png";

type PaymentRequest = {
  id: string; reference: string; requested_plan_id: string; billing_cycle: string;
  expected_amount_mad: number; currency: string; payment_method: string | null;
  transaction_reference: string | null; submitted_at: string | null;
  proof_path: string | null; proof_mime_type: string | null; status: string;
  admin_note: string | null; created_at: string;
};

type PaymentMethod = {
  id: string; slug: string; display_name: string; bank_name: string | null;
  account_name: string | null; rib: string | null; iban: string | null;
  qr_code_path: string | null; instructions: string | null; is_active: boolean;
};

type CheckoutSettings = {
  headline: string; subheadline: string; accent_color: string; button_label: string;
  trust_note: string; support_whatsapp: string; default_plan: PlanTier;
  default_billing: BillingPeriod; show_card: boolean; show_paypal: boolean;
};

type PaymentMode = "bank_transfer" | "credit_card" | "paypal";

const checkoutDefaults: CheckoutSettings = {
  headline: "Choose the plan that fits your operation",
  subheadline: "Activate your Ecom OS workspace with a secure Moroccan bank transfer.",
  accent_color: "#e73773",
  button_label: "Confirm plan & continue",
  trust_note: "Your workspace activates after our team verifies your transfer.",
  support_whatsapp: "0770877821",
  default_plan: "growth",
  default_billing: "monthly",
  show_card: true,
  show_paypal: true,
};

const previewMethod: PaymentMethod = {
  id: "preview-bank",
  slug: "bank-transfer",
  display_name: "EcomOS bank transfer",
  bank_name: "CIH Bank",
  account_name: "ECOM OS SARL",
  rib: "230 780 1234567890123456 00",
  iban: "MA64 2307 8012 3456 7890 1234 560",
  qr_code_path: null,
  instructions: "Transfer the total to this account, then add your reference and receipt. Our team verifies it quickly.",
  is_active: true,
};

const inputClass = "h-12 w-full rounded-xl border border-slate-200 bg-white px-3.5 text-sm font-semibold text-slate-950 outline-none transition placeholder:text-slate-400 focus:border-pink-500 focus:ring-4 focus:ring-pink-500/10";
const planTiers = Object.keys(PRICING_PLANS) as PlanTier[];

export default function Payment() {
  const { session, loading, operationalAccess, subscriptionStatus } = useAuth();
  const navigate = useNavigate();
  const previewMode = import.meta.env.DEV && new URLSearchParams(window.location.search).get("preview") === "checkout";
  const [request, setRequest] = useState<PaymentRequest | null>(null);
  const [checkout, setCheckout] = useState<CheckoutSettings>(checkoutDefaults);
  const [methods, setMethods] = useState<PaymentMethod[]>(previewMode ? [previewMethod] : []);
  const [selectedMethod, setSelectedMethod] = useState(previewMode ? previewMethod.slug : "");
  const [file, setFile] = useState<File | null>(null);
  const [reference, setReference] = useState("");
  const [selectedPlan, setSelectedPlan] = useState<PlanTier>(checkoutDefaults.default_plan);
  const [billing, setBilling] = useState<BillingPeriod>(checkoutDefaults.default_billing);
  const [paymentMode, setPaymentMode] = useState<PaymentMode>("bank_transfer");
  const [copied, setCopied] = useState("");
  const [busy, setBusy] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");

  const normalizedBlockReason = subscriptionStatus === "pending_payment" ? "subscription_pending_payment" : subscriptionStatus === "expired" ? "subscription_expired" : subscriptionStatus === "grace" ? "grace_period" : subscriptionStatus;
  const blockMessage = normalizedBlockReason === "order_limit_reached" ? "Your current plan reached its monthly order limit. Complete a new payment to regain access." : normalizedBlockReason === "subscription_expired" ? "Your subscription expired. Complete a new payment to reactivate access." : normalizedBlockReason === "grace_period" ? "Your subscription is in its grace period until payment is resolved." : normalizedBlockReason === "subscription_suspended" ? "Your subscription is suspended. Complete a payment to restore access." : "Your workspace will activate after the payment is verified.";

  useEffect(() => {
    if (previewMode) { setBusy(false); return; }
    if (!session?.user.id) return;
    let active = true;
    void Promise.all([
      supabase.from("subscription_payment_requests").select("id,reference,requested_plan_id,billing_cycle,expected_amount_mad,currency,payment_method,transaction_reference,proof_path,proof_mime_type,status,admin_note,submitted_at,created_at").eq("owner_user_id", session.user.id).order("created_at", { ascending: false }).limit(1).maybeSingle(),
      supabase.from("payment_methods").select("id, slug, display_name, bank_name, account_name, rib, iban, qr_code_path, instructions, is_active").eq("is_active", true).order("sort_order", { ascending: true }).order("created_at", { ascending: true }),
      supabase.rpc("get_payment_checkout_settings_v1"),
    ]).then(([requestResult, methodsResult, settingsResult]) => {
      if (!active) return;
      if (requestResult.error) setError(requestResult.error.message);
      if (methodsResult.error) setError(methodsResult.error.message);
      const loadedSettings = settingsResult.data && typeof settingsResult.data === "object" ? { ...checkoutDefaults, ...(settingsResult.data as Partial<CheckoutSettings>) } : checkoutDefaults;
      setCheckout(loadedSettings);
      const loadedRequest = requestResult.data as PaymentRequest | null;
      setRequest(loadedRequest);
      setSelectedPlan(loadedRequest?.requested_plan_id && loadedRequest.requested_plan_id in PRICING_PLANS ? loadedRequest.requested_plan_id as PlanTier : loadedSettings.default_plan);
      setBilling(loadedRequest?.billing_cycle ? (["annual", "yearly"].includes(loadedRequest.billing_cycle.toLowerCase()) ? "yearly" : "monthly") : loadedSettings.default_billing);
      const availableMethods = (methodsResult.data as PaymentMethod[]) || [];
      setMethods(availableMethods);
      setSelectedMethod(loadedRequest?.payment_method || availableMethods[0]?.slug || "");
    }).finally(() => { if (active) setBusy(false); });
    return () => { active = false; };
  }, [previewMode, session?.user.id]);

  if (loading) return <Screen><Loader2 className="h-7 w-7 animate-spin text-[#e73773]" /></Screen>;
  if (!session && !previewMode) return <Navigate to="/login" replace />;
  if (busy) return <Screen><Loader2 className="h-7 w-7 animate-spin text-[#e73773]" /></Screen>;
  if (operationalAccess) return <Navigate to="/dashboard" replace />;

  const requestStatus = String(request?.status || "").toLowerCase();
  if (request && ["submitted", "reviewing", "under_review", "pending_payment", "awaiting_review", "awaiting_verification"].includes(requestStatus)) return <Navigate to="/waiting-verification" replace />;

  const selectedPlanData = PRICING_PLANS[selectedPlan];
  const monthlyEquivalent = billing === "monthly" ? selectedPlanData.monthlyPrice : Math.round(selectedPlanData.yearlyPrice / 12);
  const totalAmount = billing === "monthly" ? selectedPlanData.monthlyPrice : selectedPlanData.yearlyPrice;
  const annualSavings = (selectedPlanData.monthlyPrice * 12) - selectedPlanData.yearlyPrice;
  const selectedMethodData = methods.find((method) => method.slug === selectedMethod) || methods[0] || null;
  const paymentQrUrl = selectedMethodData?.qr_code_path ? paymentAssetUrl(selectedMethodData.qr_code_path) : "";
  const billedTo = String(session?.user.user_metadata?.full_name || session?.user.email || "Demo workspace");
  const workspaceCopy = selectedPlanData.limits.workspaces === "unlimited" ? "Unlimited workspaces" : `${selectedPlanData.limits.workspaces} workspace${selectedPlanData.limits.workspaces === 1 ? "" : "s"}`;
  const unlocks = [`${selectedPlanData.limits.ordersMonthly.toLocaleString()} orders per month`, `${selectedPlanData.limits.teamMembers} team members`, workspaceCopy, selectedPlanData.features.whatsappAutomation ? "WhatsApp automation + premium support" : "Core order and delivery tools"];
  const showBlockingMessage = operationalAccess === false && !!normalizedBlockReason && !["checking", "under_review", "active", "legacy_access_needs_plan_assignment", "workspace_missing", "missing_profile", "billing_unavailable", "unavailable"].includes(subscriptionStatus || "");

  const createRequest = async () => {
    if (!session) { setNotice("Checkout preview only. Sign in to create a real payment request."); return; }
    setSaving(true); setError(""); setNotice("");
    const { error: requestError } = await supabase.rpc("create_subscription_payment_request_v1", { p_plan_code: selectedPlan, p_billing_cycle: billing === "yearly" ? "annual" : "monthly", p_request_type: "initial_activation", p_payment_method: selectedMethodData?.slug || "bank_transfer", p_transaction_reference: null, p_user_note: "Created from unified payment checkout" });
    if (requestError && !requestError.message.includes("PAYMENT_REQUEST_ALREADY_UNDER_REVIEW")) { setError(requestError.message); setSaving(false); return; }
    const { data: latestRequest, error: fetchError } = await supabase.from("subscription_payment_requests").select("id,reference,requested_plan_id,billing_cycle,expected_amount_mad,currency,payment_method,transaction_reference,proof_path,proof_mime_type,status,admin_note,submitted_at,created_at").eq("owner_user_id", session.user.id).order("created_at", { ascending: false }).limit(1).maybeSingle();
    if (fetchError) setError(fetchError.message); else { setRequest((latestRequest as PaymentRequest | null) ?? null); setNotice("Plan reserved. Add your transfer reference and receipt, then submit for verification."); }
    setSaving(false);
  };

  const uploadProof = async () => {
    if (!session || !request || !selectedMethodData) { setError("No bank transfer method is available right now."); return; }
    if (!file) { setError("Choose your payment receipt first."); return; }
    if (!reference.trim()) { setError("Enter the bank transfer reference."); return; }
    setSaving(true); setError(""); setNotice("");
    const extension = file.name.split(".").pop()?.toLowerCase() || "bin";
    const path = `${session.user.id}/${request.id}-${Date.now()}.${extension}`;
    const upload = await supabase.storage.from("subscription-proofs").upload(path, file, { contentType: file.type, cacheControl: "3600" });
    if (upload.error) { setError(upload.error.message); setSaving(false); return; }
    const methodUpdate = await supabase.rpc("update_subscription_payment_method_v1", { p_request_id: request.id, p_payment_method: selectedMethodData.slug });
    if (methodUpdate.error) { await supabase.storage.from("subscription-proofs").remove([path]); setError(methodUpdate.error.message); setSaving(false); return; }
    const referenceUpdate = await supabase.rpc("update_subscription_payment_reference_v1", { p_request_id: request.id, p_transaction_reference: reference.trim() });
    if (referenceUpdate.error) { await supabase.storage.from("subscription-proofs").remove([path]); setError(referenceUpdate.error.message); setSaving(false); return; }
    const result = await supabase.rpc("attach_subscription_payment_proof_v1", { p_request_id: request.id, p_proof_path: path, p_mime_type: file.type, p_size_bytes: file.size });
    if (result.error) { await supabase.storage.from("subscription-proofs").remove([path]); setError(result.error.message); setSaving(false); return; }
    const submitted = result.data as { id?: string; reference?: string; status?: string; submitted_at?: string } | null;
    try {
      await downloadPaymentReceiptPdf({
        id: submitted?.id || request.id,
        receiptNumber: submitted?.reference || request.reference,
        customerName: billedTo,
        customerEmail: session.user.email || "Not provided",
        planName: selectedPlanData.name,
        billingCycle: billing === "yearly" ? "Annual" : "Monthly",
        amountMad: totalAmount,
        currency: request.currency || "MAD",
        paymentMethod: selectedMethodData.display_name || "Bank transfer",
        transactionReference: reference.trim(),
        submittedAt: submitted?.submitted_at || new Date().toISOString(),
        status: submitted?.status || "submitted",
      });
    } catch (receiptError) {
      console.warn("[Payment] Automatic receipt download failed", receiptError);
    }
    navigate("/waiting-verification", { replace: true });
  };

  const submitCheckout = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (previewMode) { setError(""); setNotice("Interactive checkout preview — no payment or account change was submitted."); return; }
    if (paymentMode !== "bank_transfer") { setError(""); setNotice(paymentMode === "paypal" ? "PayPal is a preview option and is not connected to a live processor yet." : "Credit card is a preview option and is not connected to a live processor yet."); return; }
    if (!request) await createRequest(); else await uploadProof();
  };

  const copyValue = async (label: string, value: string | null) => { if (!value) return; await navigator.clipboard.writeText(value); setCopied(label); window.setTimeout(() => setCopied(""), 1400); };
  const actionLabel = paymentMode !== "bank_transfer" ? paymentMode === "paypal" ? "Preview PayPal checkout" : "Preview card checkout" : request ? "Submit payment proof" : checkout.button_label;

  return <Screen><main className="min-h-screen w-full bg-white"><form onSubmit={(event) => void submitCheckout(event)} className="grid min-h-screen lg:grid-cols-[0.96fr_1.04fr]">
    <section className="relative overflow-hidden border-b border-slate-200 bg-[#fff9fc] lg:border-b-0 lg:border-e">
      <div className="pointer-events-none absolute -start-44 -top-44 h-[480px] w-[480px] rounded-full bg-[#e73773]/[0.08] blur-3xl" />
      <div className="relative mx-auto flex min-h-full w-full max-w-[680px] flex-col px-5 py-8 sm:px-10 sm:py-12 xl:px-16 xl:py-14">
        <img src={ecomosLogo} alt="EcomOS" className="h-8 w-auto self-start object-contain" />
        <span className="mt-8 inline-flex w-fit items-center gap-1.5 rounded-full border border-[#e73773]/15 bg-white px-3 py-1.5 text-[10px] font-black uppercase tracking-[0.14em] text-[#c92561]"><Sparkles size={12} /> One workspace. Every operation.</span>
        <h1 className="mt-4 max-w-xl text-[32px] font-black leading-[1.04] tracking-[-0.055em] text-slate-950 sm:text-[40px]">Activate your EcomOS workspace</h1>
        <p className="mt-3 max-w-xl text-sm leading-6 text-slate-500">{checkout.subheadline}</p>
        <div className="mt-8 flex items-center justify-between gap-4"><div><p className="text-[10px] font-black uppercase tracking-[0.14em] text-[#c92561]">Choose your offer</p><h2 className="mt-1 text-lg font-black text-slate-950">A plan built for your volume</h2></div><span className="hidden rounded-full bg-white px-3 py-1.5 text-[10px] font-bold text-slate-500 shadow-sm ring-1 ring-slate-200 sm:inline">Prices in MAD</span></div>
        <div className="mt-4 grid grid-cols-2 gap-2 sm:grid-cols-4">{planTiers.map((tier) => <PlanOption key={tier} tier={tier} active={selectedPlan === tier} onClick={() => setSelectedPlan(tier)} accent={checkout.accent_color} />)}</div>
        <div className="mt-5 space-y-3"><BillingChoice active={billing === "monthly"} onClick={() => setBilling("monthly")} title="Monthly plan" copy="Flexible billing. Change plans whenever your operation changes." price={selectedPlanData.monthlyPrice} suffix="/ month" accent={checkout.accent_color} /><BillingChoice active={billing === "yearly"} onClick={() => setBilling("yearly")} title="Annual plan" copy={`Pay yearly and keep ${annualSavings.toLocaleString()} MAD in your operation.`} price={Math.round(selectedPlanData.yearlyPrice / 12)} suffix="/ month" accent={checkout.accent_color} badge="Best value" /></div>
        <div className="mt-8 rounded-2xl border border-[#e73773]/10 bg-white/80 p-5 shadow-[0_18px_50px_rgba(92,28,57,0.06)] backdrop-blur"><div className="flex items-center justify-between"><h3 className="text-base font-black text-slate-950">What you’ll unlock</h3><span className="rounded-full bg-emerald-50 px-2.5 py-1 text-[9px] font-black uppercase tracking-wide text-emerald-700">Instant access</span></div><div className="mt-4 grid gap-2.5 sm:grid-cols-2">{unlocks.map((item) => <span key={item} className="flex items-center gap-2 text-xs font-bold text-slate-700"><span className="grid h-5 w-5 shrink-0 place-items-center rounded-full bg-[#e73773]/10 text-[#d32b68]"><Check size={12} strokeWidth={3} /></span>{item}</span>)}</div></div>
        <div className="mt-auto flex flex-wrap items-center gap-x-5 gap-y-2 pt-8 text-[10px] font-semibold text-slate-400"><span className="flex items-center gap-1.5"><BadgeCheck size={13} className="text-emerald-500" />No hidden setup fees</span><span className="flex items-center gap-1.5"><ShieldCheck size={13} className="text-[#e73773]" />Secure verification</span></div>
      </div>
    </section>

    <section className="bg-white"><div className="mx-auto flex min-h-full w-full max-w-[760px] flex-col px-5 py-8 sm:px-10 sm:py-12 xl:px-16 xl:py-14">
      <div className={`grid gap-1 rounded-xl bg-slate-100 p-1 ${checkout.show_card && checkout.show_paypal ? "grid-cols-3" : checkout.show_card || checkout.show_paypal ? "grid-cols-2" : "grid-cols-1"}`}><CheckoutTab active={paymentMode === "bank_transfer"} onClick={() => setPaymentMode("bank_transfer")} label="Bank transfer" accent={checkout.accent_color} />{checkout.show_card && <CheckoutTab active={paymentMode === "credit_card"} onClick={() => setPaymentMode("credit_card")} label="Pay by card" accent={checkout.accent_color} />}{checkout.show_paypal && <CheckoutTab active={paymentMode === "paypal"} onClick={() => setPaymentMode("paypal")} label="PayPal" accent={checkout.accent_color} />}</div>
      <label className="mt-7 block text-[10px] font-black uppercase tracking-[0.12em] text-slate-400">Billed to<input defaultValue={billedTo} className={`${inputClass} mt-2 normal-case tracking-normal`} /></label>
      <div className="mt-7 flex items-center justify-between gap-4"><div><p className="text-[10px] font-black uppercase tracking-[0.14em] text-[#c92561]">Secure checkout</p><h2 className="mt-1 text-xl font-black tracking-[-0.03em] text-slate-950">Payment detail</h2></div><span className="flex items-center gap-1.5 rounded-full bg-emerald-50 px-2.5 py-1.5 text-[9px] font-black text-emerald-700"><LockKeyhole size={11} />Protected</span></div>
      <div className="mt-4 flex-1">
        {paymentMode === "bank_transfer" ? <div className="space-y-3">
          {methods.length > 1 && <label className="block text-[10px] font-bold text-slate-500">Bank account<div className="relative mt-2"><select value={selectedMethod} onChange={(event) => setSelectedMethod(event.target.value)} className={`${inputClass} appearance-none pe-10 normal-case tracking-normal`}>{methods.map((method) => <option key={method.id} value={method.slug}>{method.display_name}</option>)}</select><ChevronDown className="pointer-events-none absolute end-3 top-4 h-4 w-4 text-slate-400" /></div></label>}
          {selectedMethodData ? <div className="overflow-hidden rounded-2xl border border-[#e73773]/15 bg-[#fffafd] shadow-[0_16px_44px_rgba(112,30,65,0.08)]">
            <div className="flex flex-wrap items-center justify-between gap-3 border-b border-[#e73773]/10 bg-white px-4 py-3.5 sm:px-5"><div className="flex items-center gap-3"><span className="grid h-10 w-10 place-items-center rounded-xl bg-[#e73773]/10 text-[#d72d69]"><Landmark size={18} /></span><div><p className="text-sm font-black text-slate-950">{selectedMethodData.bank_name || selectedMethodData.display_name}</p><p className="mt-0.5 text-[10px] font-semibold text-slate-400">Official EcomOS collection account</p></div></div><span className="inline-flex items-center gap-1 rounded-full bg-emerald-100 px-2.5 py-1 text-[9px] font-black uppercase tracking-wide text-emerald-700"><BadgeCheck size={11} />Recommended</span></div>
            <div className="grid md:grid-cols-[minmax(0,1fr)_164px]"><div className="divide-y divide-[#e73773]/10"><BankDetail label="Account holder" value={selectedMethodData.account_name || "Not configured"} onCopy={() => void copyValue("Account", selectedMethodData.account_name)} copied={copied === "Account"} /><BankDetail label="RIB" value={selectedMethodData.rib || "Not configured"} onCopy={() => void copyValue("RIB", selectedMethodData.rib)} copied={copied === "RIB"} featured /><BankDetail label="IBAN" value={selectedMethodData.iban || "Not configured"} onCopy={() => void copyValue("IBAN", selectedMethodData.iban)} copied={copied === "IBAN"} featured /></div><PaymentQr imageUrl={paymentQrUrl} previewMode={previewMode} value={selectedMethodData.iban || selectedMethodData.rib || selectedMethodData.slug} /></div>
          </div> : <div className="rounded-2xl border border-amber-200 bg-amber-50 p-4 text-xs font-semibold text-amber-800">No bank account is active yet. Please contact EcomOS support.</div>}
          <div className="grid gap-3 sm:grid-cols-[0.82fr_1.18fr]"><input value={reference} onChange={(event) => setReference(event.target.value)} placeholder="Bank transfer reference" className={inputClass} /><label className="flex h-12 cursor-pointer items-center justify-center gap-2 rounded-xl border border-dashed border-[#e73773]/35 bg-[#e73773]/[0.05] px-4 text-xs font-black text-[#cf2964] transition hover:bg-[#e73773]/10"><FileUp className="h-4 w-4" /><span className="max-w-64 truncate">{file ? file.name : "Upload payment receipt"}</span><input type="file" accept="image/jpeg,image/png,image/webp,application/pdf" className="hidden" onChange={(event) => setFile(event.target.files?.[0] || null)} /></label></div>
          <p className="rounded-xl bg-slate-50 px-3.5 py-3 text-[10px] leading-4 text-slate-500">{selectedMethodData?.instructions || "Upload JPG, PNG, WebP or PDF proof up to 10 MB."}</p>
        </div> : paymentMode === "credit_card" ? <div className="space-y-3 rounded-2xl border border-slate-200 bg-slate-50/70 p-4 sm:p-5"><div className="grid grid-cols-2 gap-3"><PaymentTypeCard icon={Building2} title="Bank transfer" onClick={() => setPaymentMode("bank_transfer")} /><PaymentTypeCard icon={CreditCard} title="Credit card" active accent={checkout.accent_color} /></div><div className="relative"><input inputMode="numeric" autoComplete="cc-number" placeholder="1234 5678 9012 3456" className={`${inputClass} pe-20`} /><span className="absolute inset-y-0 end-3 flex items-center text-[9px] font-black italic text-blue-800">VISA</span></div><div className="grid grid-cols-2 gap-3"><input inputMode="numeric" autoComplete="cc-exp" placeholder="MM / YY" className={inputClass} /><input inputMode="numeric" autoComplete="cc-csc" placeholder="CVV" className={inputClass} /></div><div className="relative"><select defaultValue="" className={`${inputClass} appearance-none pe-10`}><option value="" disabled>Choose country</option><option>Morocco</option><option>France</option><option>Spain</option></select><ChevronDown className="pointer-events-none absolute end-3 top-4 h-4 w-4 text-slate-400" /></div><div className="grid grid-cols-3 gap-3"><input placeholder="Enter city" className={inputClass} /><input placeholder="Enter state" className={inputClass} /><input placeholder="ZIP code" className={inputClass} /></div></div> : <div className="rounded-2xl border border-slate-200 bg-slate-50/70 p-5"><div className="rounded-xl bg-[#ffc439] px-6 py-3.5 text-center text-sm font-black italic text-[#003087]">PayPal</div><p className="mt-4 text-center text-xs leading-5 text-slate-500">Continue securely with PayPal to activate the {selectedPlanData.name} plan.</p></div>}
      </div>
      {request && <div className="mt-3 flex items-center justify-between rounded-lg bg-slate-100 px-3 py-2 text-[9px] text-slate-500"><span>Payment reference</span><strong className="font-mono text-slate-800">{request.reference}</strong></div>}
      {showBlockingMessage && <p className="mt-3 rounded-lg border border-amber-200 bg-amber-50 p-3 text-[10px] text-amber-800">{blockMessage}</p>}{error && <p className="mt-3 rounded-lg border border-rose-200 bg-rose-50 p-3 text-[10px] text-rose-700">{error}</p>}{notice && <p className="mt-3 rounded-lg border border-pink-200 bg-pink-50 p-3 text-[10px] text-pink-700">{notice}</p>}
      <div className="mt-6 flex items-end justify-between gap-4 border-t border-slate-100 pt-5"><span className="text-lg font-black text-slate-950">Total</span><span className="text-end"><strong className="text-2xl font-black tracking-[-0.04em] text-slate-950">{totalAmount.toLocaleString()} MAD</strong><small className="block text-[9px] font-semibold text-slate-400">{monthlyEquivalent.toLocaleString()} MAD / month{billing === "yearly" ? " · billed annually" : ""}</small></span></div>
      <button type="submit" disabled={saving || (paymentMode === "bank_transfer" && !selectedMethodData)} className="mt-3 flex min-h-[52px] w-full items-center justify-center gap-2 rounded-xl text-sm font-black text-white shadow-[0_16px_32px_rgba(231,55,115,0.24)] transition hover:-translate-y-0.5 hover:brightness-105 disabled:opacity-50" style={{ background: `linear-gradient(105deg, ${checkout.accent_color}, #c92561)` }}>{saving && <Loader2 className="h-4 w-4 animate-spin" />}{saving ? "Processing…" : actionLabel}<ArrowRight className="h-4 w-4" /></button>
      <div className="mt-3 flex flex-wrap items-center justify-between gap-2 text-[9px] text-slate-400"><span className="flex items-center gap-1.5"><ShieldCheck size={12} />{checkout.trust_note}</span>{checkout.support_whatsapp && <a href={`https://wa.me/${checkout.support_whatsapp.replace(/\D/g, "")}`} className="flex items-center gap-1.5 font-bold text-slate-500 hover:text-[#d52d69]"><Headphones size={12} />Need help? {checkout.support_whatsapp}</a>}</div>
    </div></section>
  </form></main></Screen>;
}

function PlanOption({ tier, active, onClick, accent }: { tier: PlanTier; active: boolean; onClick: () => void; accent: string }) {
  const plan = PRICING_PLANS[tier];
  return <button type="button" onClick={onClick} className={`relative min-h-[72px] rounded-xl border px-3 py-2.5 text-left transition ${active ? "bg-white shadow-[0_10px_24px_rgba(140,35,79,0.12)]" : "border-slate-200 bg-white/55 hover:bg-white"}`} style={active ? { borderColor: accent } : undefined}><span className="block text-xs font-black text-slate-950">{plan.name}</span><span className="mt-1 block text-[10px] font-bold text-slate-500">{plan.monthlyPrice.toLocaleString()} MAD</span>{tier === "growth" && <span className="absolute -top-2 end-2 rounded-full px-2 py-0.5 text-[7px] font-black uppercase tracking-wide text-white" style={{ backgroundColor: accent }}>Popular</span>}{active && <span className="absolute bottom-2.5 end-2.5 grid h-4 w-4 place-items-center rounded-full text-white" style={{ backgroundColor: accent }}><Check size={10} strokeWidth={3} /></span>}</button>;
}

function BillingChoice({ active, onClick, title, copy, price, suffix, accent, badge }: { active: boolean; onClick: () => void; title: string; copy: string; price: number; suffix: string; accent: string; badge?: string }) {
  return <button type="button" onClick={onClick} className={`flex min-h-[92px] w-full items-center gap-4 rounded-2xl border px-4 py-3.5 text-left transition ${active ? "bg-white shadow-[0_12px_28px_rgba(91,35,59,0.08)]" : "border-slate-200 bg-white/55 hover:bg-white"}`} style={active ? { borderColor: accent } : undefined}><span className="grid h-5 w-5 shrink-0 place-items-center rounded-full border-2" style={{ borderColor: active ? accent : "#cbd5e1" }}>{active && <span className="h-2.5 w-2.5 rounded-full" style={{ backgroundColor: accent }} />}</span><span className="min-w-0 flex-1"><span className="flex items-center gap-2"><strong className="text-sm font-black text-slate-950">{title}</strong>{badge && <span className="rounded-full bg-[#e73773]/10 px-2 py-0.5 text-[8px] font-black text-[#ca2862]">{badge}</span>}</span><span className="mt-1 block text-[10px] leading-4 text-slate-500">{copy}</span></span><span className="shrink-0 text-end"><strong className="text-lg font-black text-slate-950">{price.toLocaleString()} MAD</strong><small className="block text-[9px] text-slate-400">{suffix}</small></span></button>;
}

function CheckoutTab({ active, onClick, label, accent }: { active: boolean; onClick: () => void; label: string; accent: string }) {
  return <button type="button" onClick={onClick} className={`rounded-lg border px-2 py-2.5 text-[10px] font-black transition ${active ? "bg-white text-slate-950 shadow-sm" : "border-transparent text-slate-500 hover:text-slate-800"}`} style={active ? { borderColor: `${accent}55` } : undefined}>{label}</button>;
}

function PaymentTypeCard({ icon: Icon, title, active = false, accent = "#e73773", onClick }: { icon: typeof Building2; title: string; active?: boolean; accent?: string; onClick?: () => void }) {
  return <button type="button" onClick={onClick} className="relative min-h-[78px] rounded-xl border bg-white p-4 text-left" style={{ borderColor: active ? accent : "#cbd5e1" }}><Icon size={17} className="text-slate-700" /><span className="mt-3 block text-[11px] font-black text-slate-950">{title}</span>{active && <span className="absolute end-3 top-3 h-2.5 w-2.5 rounded-full" style={{ backgroundColor: accent }} />}</button>;
}

function BankDetail({ label, value, onCopy, copied, featured = false }: { label: string; value: string; onCopy: () => void; copied: boolean; featured?: boolean }) {
  return <div className="flex min-w-0 items-center justify-between gap-3 px-4 py-3.5 sm:px-5"><div className="min-w-0"><span className="block text-[8px] font-black uppercase tracking-[0.15em] text-slate-400">{label}</span><strong className={`mt-1.5 block break-all font-mono text-slate-900 ${featured ? "text-[12px] sm:text-[13px]" : "text-[11px]"}`}>{value}</strong></div><button type="button" onClick={onCopy} className="shrink-0 rounded-lg border border-[#e73773]/15 bg-white p-2 text-slate-400 transition hover:border-[#e73773]/35 hover:text-[#d32c68]" aria-label={`Copy ${label}`}>{copied ? <Check size={14} /> : <Copy size={14} />}</button></div>;
}

function PaymentQr({ imageUrl, previewMode, value }: { imageUrl: string; previewMode: boolean; value: string }) {
  return <div className="flex items-center justify-center border-t border-[#e73773]/10 bg-white p-4 md:border-s md:border-t-0"><div className="w-full max-w-[132px] text-center"><div className="mx-auto grid aspect-square w-full place-items-center overflow-hidden rounded-2xl border border-[#e73773]/15 bg-white p-2 shadow-sm">{imageUrl ? <img src={imageUrl} alt="Bank payment QR code" className="h-full w-full object-contain" /> : previewMode ? <QRCode value={`ECOMOS PAYMENT ${value}`} size={108} fgColor="#111827" bgColor="#ffffff" /> : <div className="text-center text-[#cf2964]"><QrCode className="mx-auto h-9 w-9" /><span className="mt-2 block text-[8px] font-black uppercase tracking-wide">QR not configured</span></div>}</div><p className="mt-2 text-[9px] font-black uppercase tracking-[0.12em] text-slate-400">Scan to pay</p></div></div>;
}

function paymentAssetUrl(path: string) { return supabase.storage.from("payment-method-assets").getPublicUrl(path).data.publicUrl; }
function Screen({ children }: { children: ReactNode }) { return <div className="flex min-h-screen items-center justify-center bg-white text-slate-950">{children}</div>; }
