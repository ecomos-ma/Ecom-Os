import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { ArrowUpRight, Check, Sparkles, Zap } from "lucide-react";
import { fetchOfficialPlans, type PublicPlanRecord } from "../../../lib/planEngine";
import { formatMad } from "./billingShared";

/**
 * Upgrade section. Plan data comes from the same source as the landing pricing
 * (list_official_plans_v1 / subscription_plans), so admin plan changes are
 * reflected here automatically.
 */
export function UpgradePlans({
  currentPlanCode,
  currentMonthlyPrice,
  refreshKey,
}: {
  currentPlanCode: string | null;
  currentMonthlyPrice: number | null;
  refreshKey: number;
}) {
  const [plans, setPlans] = useState<PublicPlanRecord[]>([]);
  const [loading, setLoading] = useState(true);
  const [failed, setFailed] = useState(false);

  useEffect(() => {
    let active = true;
    setLoading(true);
    setFailed(false);
    fetchOfficialPlans()
      .then((data) => { if (active) setPlans(data); })
      .catch((error) => {
        console.error("[UpgradePlans] Failed to load plans", error);
        if (active) setFailed(true);
      })
      .finally(() => { if (active) setLoading(false); });
    return () => { active = false; };
  }, [refreshKey]);

  if (loading) {
    return (
      <section className="rounded-xl border border-base-border bg-base-surface p-5 shadow-card">
        <div className="mb-4 h-5 w-44 animate-pulse rounded-lg bg-base-raised" />
        <div className="grid gap-4 md:grid-cols-3">
          {Array.from({ length: 3 }).map((_, index) => <div key={index} className="h-44 animate-pulse rounded-xl bg-base-raised" />)}
        </div>
      </section>
    );
  }

  if (failed) return null;

  const purchasable = plans.filter((plan) => plan.monthlyPrice > 0 || plan.yearlyPrice > 0);
  const others = purchasable.filter((plan) => plan.code !== currentPlanCode);
  if (others.length === 0) return null;

  return (
    <section className="rounded-xl border border-base-border bg-base-surface shadow-card">
      <div className="flex items-center gap-2.5 border-b border-base-border p-5">
        <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-brand-accent/15 text-brand-accent"><Zap size={15} /></div>
        <div>
          <h3 className="text-[14px] font-semibold text-ink">Available plans</h3>
          <p className="text-[12px] text-ink-muted">Upgrade any time — your new plan starts after payment approval.</p>
        </div>
      </div>
      <div className="grid gap-4 p-5 md:grid-cols-2 xl:grid-cols-3">
        {others.map((plan) => (
          <PlanCard
            key={plan.code}
            plan={plan}
            isCurrentPrice={currentMonthlyPrice !== null && plan.monthlyPrice <= currentMonthlyPrice}
          />
        ))}
      </div>
    </section>
  );
}

function PlanCard({ plan, isCurrentPrice }: { plan: PublicPlanRecord; isCurrentPrice: boolean }) {
  const ordersCopy = plan.limits.ordersDaily
    ? `${plan.limits.ordersDaily.toLocaleString()} orders / day`
    : plan.limits.ordersMonthly
      ? `${plan.limits.ordersMonthly.toLocaleString()} orders / month`
      : "Unlimited orders";
  const workspaceCopy = plan.limits.workspaces === "unlimited" ? "Unlimited workspaces" : `${Number(plan.limits.workspaces).toLocaleString()} workspace${Number(plan.limits.workspaces) === 1 ? "" : "s"}`;
  const integrationsCopy = plan.limits.integrations === "unlimited" ? "All integrations" : `${Number(plan.limits.integrations).toLocaleString()} integrations`;

  return (
    <div className="relative flex flex-col rounded-xl border border-base-border bg-base-raised/40 p-4">
      {plan.isPopular && (
        <span className="absolute -top-2 right-4 inline-flex items-center gap-1 rounded-full bg-brand-accent px-2 py-0.5 text-[10px] font-bold uppercase tracking-wide text-white">
          <Sparkles size={10} /> Popular
        </span>
      )}
      <div className="flex items-baseline justify-between gap-2">
        <h4 className="text-[15px] font-bold text-ink">{plan.name}</h4>
      </div>
      <div className="mt-1.5 flex items-baseline gap-1.5">
        <span className="text-[20px] font-black tracking-tight text-ink">{formatMad(plan.monthlyPrice)}</span>
        <span className="text-[11.5px] font-medium text-ink-muted">/ month</span>
      </div>
      <ul className="mt-3.5 flex-1 space-y-2">
        {[
          ordersCopy,
          `${plan.limits.teamMembers.toLocaleString()} team members`,
          workspaceCopy,
          integrationsCopy,
        ].map((item) => (
          <li key={item} className="flex items-start gap-2 text-[12.5px] text-ink-muted">
            <Check size={13} className="mt-0.5 flex-none text-brand-accent" />
            <span>{item}</span>
          </li>
        ))}
      </ul>
      <Link
        to={`/payment?intent=upgrade&plan=${encodeURIComponent(plan.code)}&cycle=monthly`}
        className={`mt-4 inline-flex items-center justify-center gap-1.5 rounded-lg px-4 py-2.5 text-[12.5px] font-semibold transition-colors ${
          isCurrentPrice
            ? "border border-base-border bg-base-surface text-ink hover:border-brand-accent/40"
            : "bg-brand-accent text-white shadow-sm hover:bg-brand-accentHover"
        }`}
      >
        Upgrade to {plan.name} <ArrowUpRight size={13} />
      </Link>
    </div>
  );
}
