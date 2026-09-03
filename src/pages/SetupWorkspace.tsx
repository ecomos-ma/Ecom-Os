import { useEffect, useState } from "react";
import { ArrowRight, Check, Circle, ExternalLink, PlayCircle, Store, Truck, Users, Sparkles, LayoutDashboard } from "lucide-react";
import { useNavigate } from "react-router-dom";
import { useAuth } from "../hooks/useAuth";
import { supabase } from "../lib/supabase";

type SetupProgress = { store: boolean; shipping: boolean; team: boolean };

const tutorialUrl = (topic: string) => `https://www.youtube.com/results?search_query=${encodeURIComponent(`EcomOS ${topic} setup`)}`;

export default function SetupWorkspace() {
  const navigate = useNavigate();
  const { profile, workspace } = useAuth();
  const [progress, setProgress] = useState<SetupProgress | null>(null);

  useEffect(() => {
    if (!workspace?.id) return;
    let cancelled = false;
    void Promise.all([
      supabase.rpc("get_store_integration_status_v1", { p_workspace_id: workspace.id, p_provider: "youcan" }),
      supabase.from("google_sheets_credentials").select("workspace_id").eq("workspace_id", workspace.id).limit(1),
      supabase.from("workspace_shipping_providers").select("workspace_id").eq("workspace_id", workspace.id).limit(1),
      supabase.from("profile_workspaces").select("profile_id", { count: "exact", head: true }).eq("workspace_id", workspace.id).eq("status", "active"),
    ]).then(([youcan, sheets, shipping, team]) => {
      if (cancelled) return;
      setProgress({
        store: Boolean(youcan.data?.connected) || Boolean(sheets.data?.length),
        shipping: Boolean(shipping.data?.length) || Boolean(workspace.ozon_enabled || workspace.coliaty_enabled),
        team: Number(team.count ?? 0) > 1,
      });
    }).catch(() => { if (!cancelled) setProgress({ store: false, shipping: false, team: false }); });
    return () => { cancelled = true; };
  }, [workspace?.coliaty_enabled, workspace?.id, workspace?.ozon_enabled]);

  const steps = [
    { title: "Account", copy: "Your EcomOS account is ready.", done: Boolean(profile?.id), icon: Check, to: "/settings?tab=Profile", topic: "account" },
    { title: "Business workspace", copy: "Choose its name and appearance.", done: Boolean(workspace?.id), icon: Sparkles, to: "/settings?tab=Workspace", topic: "workspace" },
    { title: "Connect your store", copy: "Import orders from YouCan or Google Sheets.", done: Boolean(progress?.store), icon: Store, to: "/settings/integrations", topic: "store integration" },
    { title: "Set up shipping", copy: "Choose a carrier before sending orders.", done: Boolean(progress?.shipping), icon: Truck, to: "/settings/integrations", topic: "shipping integration" },
    { title: "Invite your team", copy: "Give teammates only the access they need.", done: Boolean(progress?.team), icon: Users, to: "/team", topic: "team" },
  ];
  const completed = steps.filter((step) => step.done).length;
  const completeSetup = () => {
    if (workspace?.id) localStorage.setItem(`ecomos:workspace-setup-completed:${workspace.id}`, "true");
    navigate("/dashboard");
  };

  return (
    <div className="mx-auto w-full max-w-6xl py-2 sm:py-6">
      <section className="relative overflow-hidden rounded-[30px] border border-pink-500/15 bg-[linear-gradient(135deg,#fff4f8_0%,#ffffff_50%,#f8f5ff_100%)] px-5 py-8 shadow-[0_24px_70px_rgba(107,31,64,0.10)] sm:px-10 sm:py-12">
        <div className="pointer-events-none absolute -right-24 -top-28 h-80 w-80 rounded-full bg-pink-300/20 blur-3xl" />
        <div className="pointer-events-none absolute -bottom-32 left-1/4 h-64 w-64 rounded-full bg-violet-200/25 blur-3xl" />
        <div className="relative mx-auto max-w-2xl text-center">
          <span className="inline-flex items-center gap-2 rounded-full border border-pink-500/15 bg-white/90 px-3 py-1.5 text-[10px] font-bold uppercase tracking-[0.15em] text-pink-700"><Sparkles size={13} />Welcome to {workspace?.name || "your workspace"}</span>
          <h1 className="mt-5 text-3xl font-bold tracking-[-0.04em] text-ink sm:text-5xl">Let’s make this workspace ready for real orders.</h1>
          <p className="mx-auto mt-4 max-w-xl text-sm leading-6 text-ink-muted sm:text-base">Complete the essentials once. Every step opens the exact screen you need, and each video icon opens a matching tutorial.</p>
          <div className="mx-auto mt-7 h-2 max-w-md overflow-hidden rounded-full bg-pink-100"><div className="h-full rounded-full bg-gradient-to-r from-pink-500 to-violet-500 transition-all" style={{ width: `${(completed / steps.length) * 100}%` }} /></div>
          <p className="mt-2 text-xs font-semibold text-ink-muted">{completed} of {steps.length} essentials complete</p>
        </div>

        <div className="relative mx-auto mt-9 grid max-w-4xl gap-3">
          {steps.map((step, index) => {
            const Icon = step.icon;
            return (
              <article key={step.title} className={`group flex flex-col gap-4 rounded-2xl border p-4 transition sm:flex-row sm:items-center sm:p-5 ${step.done ? "border-emerald-500/20 bg-emerald-500/[0.045]" : "border-base-border bg-base-surface/90 hover:border-pink-500/30 hover:shadow-lg"}`}>
                <span className={`grid h-11 w-11 shrink-0 place-items-center rounded-2xl ${step.done ? "bg-emerald-500 text-white" : "bg-pink-500/10 text-pink-600"}`}>{step.done ? <Check size={21} strokeWidth={3} /> : <Icon size={20} />}</span>
                <div className="min-w-0 flex-1"><div className="flex items-center gap-2"><span className="text-[11px] font-bold text-ink-faint">0{index + 1}</span><h2 className="font-semibold text-ink">{step.title}</h2>{step.done && <span className="rounded-full bg-emerald-500/10 px-2 py-0.5 text-[10px] font-bold text-emerald-600">Done</span>}</div><p className="mt-1 text-sm text-ink-muted">{step.copy}</p></div>
                <div className="flex items-center gap-2 sm:shrink-0"><a href={tutorialUrl(step.topic)} target="_blank" rel="noreferrer" title={`Watch ${step.title} tutorial`} className="inline-flex h-10 w-10 items-center justify-center rounded-xl border border-base-border text-ink-muted transition hover:border-pink-500/30 hover:bg-pink-500/10 hover:text-pink-600"><PlayCircle size={18} /></a><button onClick={() => step.to.startsWith("/settings") ? window.location.assign(step.to) : navigate(step.to)} className={`inline-flex h-10 items-center gap-2 rounded-xl px-4 text-sm font-semibold transition ${step.done ? "border border-base-border bg-base-surface text-ink hover:bg-base-raised" : "bg-pink-500 text-white shadow-sm shadow-pink-500/20 hover:bg-pink-600"}`}>{step.done ? "Review" : "Set up"}<ArrowRight size={15} /></button></div>
              </article>
            );
          })}
        </div>
        <div className="relative mt-8 flex flex-col items-center justify-center gap-3 sm:flex-row"><button onClick={completeSetup} className="inline-flex items-center gap-2 rounded-xl px-4 py-2.5 text-sm font-semibold text-ink-muted transition hover:bg-white/70 hover:text-ink"><LayoutDashboard size={16} />Go to dashboard</button>{completed === steps.length && <span className="inline-flex items-center gap-2 rounded-xl bg-emerald-500 px-4 py-2.5 text-sm font-semibold text-white"><Check size={16} />Your workspace is ready</span>}</div>
      </section>
    </div>
  );
}
