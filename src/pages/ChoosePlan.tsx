import { useEffect, useState, type ReactNode } from "react";
import { Navigate, useNavigate } from "react-router-dom";
import { Check, Loader2 } from "lucide-react";
import { useAuth } from "../hooks/useAuth";
import { supabase } from "../lib/supabase";
import { fetchOfficialPlans, getPlanPrice, type PublicPlanRecord } from "../lib/planEngine";
import type { BillingPeriod, PlanTier } from "../config/pricing";

export default function ChoosePlan() {
  const { session, loading, operationalAccess } = useAuth();
  const navigate = useNavigate();
  const [billing, setBilling] = useState<BillingPeriod>("monthly");
  const [plans, setPlans] = useState<PublicPlanRecord[]>([]);
  const [selected, setSelected] = useState<PlanTier>("growth");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");

  useEffect(() => {
    void fetchOfficialPlans().then((data) => {
      setPlans(data);
      if (data.length > 0) {
        setSelected((current) => data.some((plan) => plan.code === current) ? current : data[0].code);
      }
    }).catch((loadError) => {
      setError(loadError instanceof Error ? loadError.message : "Unable to load plans.");
    });
  }, []);

  if (loading) return <Screen><Loader2 className="animate-spin text-brand-accent" /></Screen>;
  if (!session) return <Navigate to="/login?mode=signup" replace />;
  if (operationalAccess) return <Navigate to="/dashboard" replace />;

  const selectedPlan = plans.find((plan) => plan.code === selected) ?? plans[0];

  const choose = async () => {
    if (!selectedPlan) return;
    setSaving(true);
    setError("");
    const { error: requestError } = await supabase.rpc("create_subscription_payment_request_v1", {
      p_plan_code: selectedPlan.code,
      p_billing_cycle: billing === "yearly" ? "annual" : "monthly",
      p_request_type: "initial_activation",
      p_payment_method: "bank_transfer",
      p_transaction_reference: null,
      p_user_note: "Created from verified signup plan selection",
    });
    if (requestError && !requestError.message.includes("PAYMENT_REQUEST_ALREADY_UNDER_REVIEW")) {
      setError(requestError.message);
      setSaving(false);
      return;
    }
    navigate("/payment?from=landing", { replace: true });
  };

  return <Screen>
    <main className="w-full max-w-6xl px-4 py-10 md:px-8">
      <p className="text-xs font-bold uppercase tracking-[0.2em] text-brand-accent">EcomOS</p>
      <h1 className="mt-3 text-3xl font-bold text-ink md:text-4xl">Choose your plan</h1>
      <p className="mt-2 text-ink-muted">Select a plan to continue to secure bank-transfer payment.</p>
      <div className="mt-6 inline-flex rounded-xl border border-base-border bg-base-surface p-1">
        {(["monthly", "yearly"] as BillingPeriod[]).map((item) => <button key={item} type="button" onClick={() => setBilling(item)} className={`rounded-lg px-4 py-2 text-sm font-semibold ${billing === item ? "bg-brand-accent text-white" : "text-ink-muted"}`}>{item === "monthly" ? "Monthly" : "Annual"}</button>)}
      </div>
      <section className="mt-6 grid gap-4 md:grid-cols-2 xl:grid-cols-4">
        {plans.map((plan) => (
          <button key={plan.code} type="button" onClick={() => setSelected(plan.code)} className={`text-left rounded-2xl border p-5 transition ${selected === plan.code ? "border-brand-accent ring-2 ring-brand-accent/20" : "border-base-border"} bg-base-surface`}>
            <div className="flex items-center justify-between"><h2 className="text-lg font-bold">{plan.name}</h2>{selected === plan.code && <Check size={18} className="text-brand-accent" />}</div>
            <p className="mt-2 min-h-12 text-sm text-ink-muted">{plan.description}</p>
            <p className="mt-5 text-3xl font-bold">{getPlanPrice(plan, billing)}<span className="text-sm font-medium text-ink-muted"> MAD/{billing === "monthly" ? "month" : "year"}</span></p>
            <p className="mt-4 text-sm text-ink-muted">{plan.limits.teamMembers} team members · {plan.limits.workspaces === "unlimited" ? "Unlimited" : plan.limits.workspaces} workspace{plan.limits.workspaces === 1 ? "" : "s"}</p>
          </button>
        ))}
      </section>
      {error && <p className="mt-5 rounded-xl bg-danger/10 p-4 text-sm text-danger">{error}</p>}
      <button type="button" disabled={saving || !selectedPlan} onClick={() => void choose()} className="mt-7 rounded-xl bg-brand-accent px-5 py-3 text-sm font-bold text-white disabled:opacity-60">{saving ? "Preparing payment…" : "Continue to payment"}</button>
    </main>
  </Screen>;
}

function Screen({ children }: { children: ReactNode }) { return <div className="min-h-screen bg-base px-4 text-ink"><div className="mx-auto flex min-h-screen max-w-7xl items-start justify-center">{children}</div></div>; }
