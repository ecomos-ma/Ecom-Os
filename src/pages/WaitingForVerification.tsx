import { useEffect, useState } from "react";
import { Navigate, useNavigate } from "react-router-dom";
import { Clock3, Headphones, Loader2, LockKeyhole, ShieldCheck } from "lucide-react";
import { useAuth } from "../hooks/useAuth";
import { supabase } from "../lib/supabase";
import { PaymentReceiptCard } from "../components/PaymentReceiptCard";
import type { PaymentReceiptData } from "../lib/paymentReceipt";
import ecomosLogo from "../assets/ecomos_logo_137x32.png";

type PaymentRequest = {
  id: string;
  reference: string;
  requested_plan_id: string;
  billing_cycle: string;
  expected_amount_mad: number;
  currency: string;
  payment_method: string | null;
  transaction_reference: string | null;
  status: string;
  submitted_at: string | null;
  created_at: string;
};

const previewReceipt: PaymentReceiptData = {
  id: "6c86d29e-84f2-4a56-b557-92cbd967015e",
  receiptNumber: "ECOM-20260829-7F31A9C2",
  customerName: "Amine El Mansouri",
  customerEmail: "amine@ecomos.ma",
  planName: "Growth",
  billingCycle: "Monthly",
  amountMad: 399,
  currency: "MAD",
  paymentMethod: "Bank transfer",
  transactionReference: "TRX-CIH-8291047",
  submittedAt: "2026-08-29T19:42:00+01:00",
  status: "submitted",
};

export default function WaitingForVerification() {
  const { session, loading, operationalAccess } = useAuth();
  const navigate = useNavigate();
  const previewMode = import.meta.env.DEV && new URLSearchParams(window.location.search).get("preview") === "receipt";
  const [receipt, setReceipt] = useState<PaymentReceiptData | null>(previewMode ? previewReceipt : null);
  const [error, setError] = useState("");

  useEffect(() => {
    if (previewMode || !session?.user.id) return;
    let active = true;

    const load = async () => {
      const { data, error: requestError } = await supabase
        .from("subscription_payment_requests")
        .select("id,reference,requested_plan_id,billing_cycle,expected_amount_mad,currency,payment_method,transaction_reference,status,submitted_at,created_at")
        .eq("owner_user_id", session.user.id)
        .order("created_at", { ascending: false })
        .limit(1)
        .maybeSingle();
      if (!active) return;
      if (requestError) { setError(requestError.message); return; }
      if (!data) { navigate("/payment", { replace: true }); return; }

      const request = data as PaymentRequest;
      const normalizedStatus = String(request.status || "").toLowerCase();
      if (["rejected", "cancelled"].includes(normalizedStatus)) { navigate("/payment", { replace: true }); return; }

      const { data: plan } = await supabase.from("subscription_plans").select("code,name").eq("id", request.requested_plan_id).maybeSingle();
      if (!active) return;
      setReceipt({
        id: request.id,
        receiptNumber: request.reference,
        customerName: String(session.user.user_metadata?.full_name || session.user.email || "EcomOS customer"),
        customerEmail: session.user.email || "Not provided",
        planName: String(plan?.name || plan?.code || "EcomOS plan"),
        billingCycle: request.billing_cycle === "annual" ? "Annual" : "Monthly",
        amountMad: Number(request.expected_amount_mad || 0),
        currency: request.currency || "MAD",
        paymentMethod: formatPaymentMethod(request.payment_method),
        transactionReference: request.transaction_reference || "Not provided",
        submittedAt: request.submitted_at || request.created_at,
        status: request.status,
      });
    };

    void load();
    return () => { active = false; };
  }, [navigate, previewMode, session]);

  if (loading && !previewMode) return <Screen><Loader2 className="animate-spin text-[#e73773]" size={34} /></Screen>;
  if (!session && !previewMode) return <Navigate to="/login" replace />;
  if (operationalAccess && !previewMode) return <Navigate to="/dashboard" replace />;
  if (!receipt && !error) return <Screen><Loader2 className="animate-spin text-[#e73773]" size={34} /></Screen>;

  return (
    <Screen>
      <main className="mx-auto grid w-full max-w-[1180px] gap-6 py-8 lg:grid-cols-[0.72fr_1.28fr] lg:items-start lg:py-12">
        <section className="rounded-[28px] border border-[#e73773]/15 bg-[linear-gradient(145deg,#fff2f7,#ffffff)] p-6 shadow-[0_24px_70px_rgba(116,27,66,0.10)] sm:p-8 lg:sticky lg:top-8">
          <img src={ecomosLogo} alt="EcomOS" className="h-8 w-auto" />
          <span className="mt-8 inline-flex items-center gap-2 rounded-full border border-[#e73773]/15 bg-white px-3 py-1.5 text-[9px] font-black uppercase tracking-[0.14em] text-[#bd245a]"><Clock3 size={12} />Verification in progress</span>
          <h1 className="mt-4 text-3xl font-black leading-tight tracking-[-0.045em] text-[#321421]">Your proof is safely recorded.</h1>
          <p className="mt-3 text-sm leading-6 text-[#80576a]">The EcomOS billing team is checking the transfer details. Keep the official receipt beside you until your workspace is activated.</p>
          <div className="mt-7 space-y-3">
            <TrustRow icon={LockKeyhole} title="Private proof" copy="Your uploaded bank proof is visible only to authorized billing reviewers." />
            <TrustRow icon={ShieldCheck} title="Permanent ticket" copy="The ECOM ticket connects this receipt to the archived admin record." />
            <TrustRow icon={Headphones} title="Need help?" copy="Contact EcomOS billing support at 0770877821." />
          </div>
          {error && <p className="mt-5 rounded-xl border border-rose-200 bg-rose-50 p-3 text-xs text-rose-700">{error}</p>}
        </section>
        {receipt && <PaymentReceiptCard receipt={receipt} />}
      </main>
    </Screen>
  );
}

function TrustRow({ icon: Icon, title, copy }: { icon: typeof ShieldCheck; title: string; copy: string }) {
  return <div className="flex gap-3 rounded-2xl border border-[#edd7e0] bg-white/80 p-4"><span className="grid h-9 w-9 shrink-0 place-items-center rounded-xl bg-[#fff0f5] text-[#d52a66]"><Icon size={16} /></span><span><strong className="block text-xs text-[#321421]">{title}</strong><span className="mt-1 block text-[10px] leading-4 text-[#80576a]">{copy}</span></span></div>;
}

function Screen({ children }: { children: React.ReactNode }) {
  return <div className="min-h-screen bg-[radial-gradient(circle_at_12%_8%,rgba(231,55,115,0.12),transparent_28%),#fffafd] px-4 text-[#321421] sm:px-6">{children}</div>;
}

function formatPaymentMethod(value: string | null) {
  if (!value) return "Bank transfer";
  return value.split("_").map((part) => part.charAt(0).toUpperCase() + part.slice(1)).join(" ");
}
