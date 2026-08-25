import { useEffect, useState } from "react";
import { PageHeader } from "../../components/PageHeader";
import { fetchSubscriptionPlans, fetchWorkspaceSubscriptions } from "../../lib/admin";
import type { SubscriptionPlan, WorkspaceSubscription } from "../../lib/types";
import { toast } from "../../components/Toast";
import { supabase } from "../../lib/supabase";
import { Check, Clock } from "lucide-react";

export default function AdminSubscriptions() {
  const [plans, setPlans] = useState<SubscriptionPlan[]>([]);
  const [subscriptions, setSubscriptions] = useState<WorkspaceSubscription[]>([]);
  const [loading, setLoading] = useState(true);
  const [filter, setFilter] = useState<'all' | 'pending' | 'active'>('all');

  useEffect(() => {
    const load = async () => {
      setLoading(true);
      try {
        const [plansData, subsData] = await Promise.all([fetchSubscriptionPlans(), fetchWorkspaceSubscriptions()]);
        setPlans(plansData);
        setSubscriptions(subsData);
      } catch (error) {
        console.error(error);
      } finally {
        setLoading(false);
      }
    };

    load();
  }, []);

  const handleAcceptActivation = async (subscription: WorkspaceSubscription) => {
    try {
      const { error } = await supabase
        .from("workspace_subscriptions")
        .update({ status: 'active' })
        .eq("id", subscription.id);
      
      if (error) throw error;
      
      setSubscriptions((current) => 
        current.map((item) => (item.id === subscription.id ? { ...item, status: 'active' } : item))
      );
      toast.success("Workspace activated successfully.");
    } catch (error) {
      console.error(error);
      toast.error("Unable to activate workspace.");
    }
  };

  const filteredSubscriptions = subscriptions.filter(sub => {
    if (filter === 'all') return true;
    if (filter === 'pending') return sub.status === 'pending_activation';
    if (filter === 'active') return sub.status === 'active';
    return true;
  });

  const handleChangePlan = async (subscription: WorkspaceSubscription, planId: string) => {
    try {
      const { error } = await supabase.from("workspace_subscriptions").update({ plan_id: planId }).eq("id", subscription.id);
      if (error) throw error;
      setSubscriptions((current) => current.map((item) => (item.id === subscription.id ? { ...item, plan_id: planId } : item)));
      toast.success("Subscription plan updated.");
    } catch (error) {
      console.error(error);
      toast.error("Unable to update subscription plan.");
    }
  };

  const handleToggleStatus = async (subscription: WorkspaceSubscription) => {
    try {
      const nextStatus = subscription.status === "active" ? "cancelled" : "active";
      const { error } = await supabase.from("workspace_subscriptions").update({ status: nextStatus }).eq("id", subscription.id);
      if (error) throw error;
      setSubscriptions((current) => current.map((item) => (item.id === subscription.id ? { ...item, status: nextStatus } : item)));
      toast.success(`Subscription ${nextStatus === "active" ? "reactivated" : "cancelled"}.`);
    } catch (error) {
      console.error(error);
      toast.error("Unable to update subscription status.");
    }
  };

  return (
    <div className="space-y-6">
      <PageHeader title="Subscriptions" subtitle="Manage plan assignments, billing cadence, and workspace entitlements." />

      {loading ? (
        <div className="rounded-3xl border border-base-border bg-base-surface p-6 text-sm text-ink-muted">Loading subscriptions…</div>
      ) : (
        <div className="grid gap-4 xl:grid-cols-[1.2fr_0.8fr]">
          <div className="space-y-4">
            <div className="rounded-3xl border border-base-border bg-base-surface p-6 shadow-card">
              <div className="text-sm font-semibold text-ink">Plans</div>
              <div className="mt-4 grid gap-3">
                {plans.map((plan) => (
                  <div key={plan.id} className="rounded-3xl border border-base-border bg-base-raised p-4">
                    <div className="flex items-center justify-between gap-3">
                      <div>
                        <div className="text-base font-semibold text-ink">{plan.name}</div>
                        <div className="text-sm text-ink-muted">{plan.description}</div>
                      </div>
                      <div className="text-right text-ink-muted">
                        <div className="text-lg font-semibold">${(plan.price_cents / 100).toFixed(2)}</div>
                        <div className="text-[11px] uppercase tracking-[0.24em]">{plan.currency}</div>
                      </div>
                    </div>
                    <div className="mt-4 grid gap-2 text-sm text-ink-muted">
                      <div>Orders: {plan.orders_limit}</div>
                      <div>Products: {plan.products_limit}</div>
                      <div>Members: {plan.members_limit}</div>
                      <div>Storage: {plan.storage_limit_gb} GB</div>
                      <div>Integrations: {plan.integrations_limit}</div>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          </div>

          <div className="rounded-3xl border border-base-border bg-base-surface p-6 shadow-card">
            <div className="flex items-center justify-between mb-4">
              <div className="text-sm font-semibold text-ink">Workspace subscriptions</div>
              <div className="flex gap-2">
                <button
                  onClick={() => setFilter('all')}
                  className={`px-3 py-1 rounded-lg text-xs font-medium transition-colors ${
                    filter === 'all' ? 'bg-brand text-white' : 'bg-base-raised text-ink-muted hover:text-ink'
                  }`}
                >
                  All
                </button>
                <button
                  onClick={() => setFilter('pending')}
                  className={`px-3 py-1 rounded-lg text-xs font-medium transition-colors ${
                    filter === 'pending' ? 'bg-amber-500 text-white' : 'bg-base-raised text-ink-muted hover:text-ink'
                  }`}
                >
                  Pending
                </button>
                <button
                  onClick={() => setFilter('active')}
                  className={`px-3 py-1 rounded-lg text-xs font-medium transition-colors ${
                    filter === 'active' ? 'bg-emerald-500 text-white' : 'bg-base-raised text-ink-muted hover:text-ink'
                  }`}
                >
                  Active
                </button>
              </div>
            </div>
            <div className="mt-4 space-y-3">
              {filteredSubscriptions.length === 0 ? (
                <div className="text-center py-8 text-sm text-ink-muted">
                  {filter === 'pending' ? 'No pending activation requests' : 'No subscriptions found'}
                </div>
              ) : (
                filteredSubscriptions.map((subscription) => (
                  <div key={subscription.id} className="rounded-3xl border border-base-border bg-base-raised p-4">
                    <div className="flex flex-wrap items-center justify-between gap-3">
                      <div className="flex items-center gap-2">
                        {subscription.status === 'pending_activation' ? (
                          <Clock size={16} className="text-amber-500" />
                        ) : (
                          <Check size={16} className="text-emerald-500" />
                        )}
                        <div>
                          <div className="text-sm font-semibold text-ink">
                            {subscription.workspace?.name || `Workspace ${subscription.workspace_id}`}
                          </div>
                          <div className="text-[12px] text-ink-muted">
                            {subscription.profiles?.email || 'No email'}
                          </div>
                          <div className="text-[12px] text-ink-muted">
                            Status: <span className={subscription.status === 'pending_activation' ? 'text-amber-500' : 'text-emerald-500'}>
                              {subscription.status === 'pending_activation' ? 'Pending Activation' : subscription.status}
                            </span>
                          </div>
                        </div>
                      </div>
                      <div className="text-right text-ink-muted">
                        <div>Started: {new Date(subscription.started_at).toLocaleDateString()}</div>
                      </div>
                    </div>
                    <div className="mt-4 grid gap-2 text-sm">
                      <label className="text-[12px] uppercase tracking-[0.2em] text-ink-faint">Plan</label>
                      <select
                        value={subscription.plan_id}
                        onChange={(event) => handleChangePlan(subscription, event.target.value)}
                        className="w-full rounded-xl border border-base-border bg-base-background px-3 py-2 text-sm text-ink"
                      >
                        {plans.map((plan) => (
                          <option key={plan.id} value={plan.id}>{plan.name}</option>
                        ))}
                      </select>
                      {subscription.status === 'pending_activation' ? (
                        <button
                          onClick={() => handleAcceptActivation(subscription)}
                          className="rounded-xl bg-emerald-500 px-3 py-2 text-sm font-medium text-white hover:bg-emerald-600"
                        >
                          Accept Activation
                        </button>
                      ) : (
                        <button
                          onClick={() => handleToggleStatus(subscription)}
                          className="rounded-xl bg-brand px-3 py-2 text-sm font-medium text-white hover:bg-brand/90"
                        >
                          {subscription.status === "active" ? "Cancel Subscription" : "Reactivate Subscription"}
                        </button>
                      )}
                    </div>
                  </div>
                ))
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
