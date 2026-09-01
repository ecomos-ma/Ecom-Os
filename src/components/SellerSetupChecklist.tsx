import { useEffect, useState } from "react";
import { CheckCircle2, Circle, Store, Truck, Users, ArrowRight } from "lucide-react";
import { useNavigate } from "react-router-dom";
import { useAuth } from "../hooks/useAuth";
import { supabase } from "../lib/supabase";

type SetupState = { store: boolean; shipping: boolean; team: boolean };

export function SellerSetupChecklist() {
  const navigate = useNavigate();
  const { profile, workspace } = useAuth();
  const [state, setState] = useState<SetupState | null>(null);

  useEffect(() => {
    let cancelled = false;
    if (!workspace?.id) return;
    void Promise.all([
      supabase.rpc("get_store_integration_status_v1", { p_workspace_id: workspace.id, p_provider: "youcan" }),
      supabase.from("google_sheets_credentials").select("workspace_id").eq("workspace_id", workspace.id).limit(1),
      supabase.from("workspace_shipping_providers").select("workspace_id").eq("workspace_id", workspace.id).limit(1),
      supabase.from("profile_workspaces").select("profile_id", { count: "exact", head: true }).eq("workspace_id", workspace.id).eq("status", "active"),
    ]).then(([youcan, sheets, shipping, team]) => {
      if (cancelled) return;
      setState({
        store: Boolean(youcan.data?.connected) || Boolean(sheets.data?.length),
        shipping: Boolean(shipping.data?.length) || Boolean(workspace.ozon_enabled || workspace.coliaty_enabled),
        team: Number(team.count ?? 0) > 1,
      });
    });
    return () => { cancelled = true; };
  }, [workspace?.coliaty_enabled, workspace?.id, workspace?.ozon_enabled]);

  if (!state || !workspace) return null;
  const ready = state.store && state.shipping;
  const steps = [
    { label: "Account", done: Boolean(profile?.id), action: "/settings", icon: CheckCircle2 },
    { label: "Workspace", done: Boolean(workspace.id), action: "/settings", icon: CheckCircle2 },
    { label: "Connect Store", done: state.store, action: "/settings", icon: Store },
    { label: "Shipping", done: state.shipping, action: "/settings", icon: Truck },
    { label: "Team", done: state.team, action: "/team", icon: Users },
    { label: "Ready", done: ready, action: ready ? "/orders" : "/settings", icon: CheckCircle2 },
  ];
  const completed = steps.filter((step) => step.done).length;
  if (ready && state.team) return null;

  return (
    <section className="mb-5 rounded-2xl border border-base-border bg-base-surface p-4 shadow-card sm:p-5">
      <div className="flex items-start justify-between gap-4">
        <div>
          <h2 className="text-sm font-bold text-ink">Set up this workspace</h2>
          <p className="mt-1 text-xs text-ink-muted">Live progress from your workspace configuration — no demo data.</p>
        </div>
        <span className="shrink-0 rounded-full bg-base-raised px-2.5 py-1 text-xs font-semibold text-ink-muted">{completed} / {steps.length}</span>
      </div>
      <div className="mt-4 grid gap-2 sm:grid-cols-2 xl:grid-cols-3">
        {steps.map((step) => {
          const Icon = step.icon;
          return (
            <button key={step.label} onClick={() => navigate(step.action)} className="flex min-h-11 items-center gap-3 rounded-xl border border-base-border bg-base-raised/50 px-3 py-2 text-left transition-colors hover:border-brand/30 hover:bg-base-raised">
              {step.done ? <CheckCircle2 size={17} className="shrink-0 text-emerald-500" /> : <Circle size={17} className="shrink-0 text-ink-faint" />}
              <Icon size={15} className="shrink-0 text-ink-muted" />
              <span className="min-w-0 flex-1 truncate text-sm font-semibold text-ink">{step.label}</span>
              {!step.done && <ArrowRight size={14} className="shrink-0 text-ink-faint" />}
            </button>
          );
        })}
      </div>
    </section>
  );
}
