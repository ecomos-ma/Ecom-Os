import type { ReactNode } from "react";
import { Activity, ArrowRight, Loader2, RefreshCw, type LucideIcon } from "lucide-react";
import { Link } from "react-router-dom";
import type { FounderEvent } from "../../../lib/founderAdmin";

export const currency = new Intl.NumberFormat("en-MA", {
  style: "currency", currency: "MAD", maximumFractionDigits: 0,
});
export const dateTime = new Intl.DateTimeFormat("en-GB", { dateStyle: "medium", timeStyle: "short" });

export function errorMessage(error: unknown) {
  return error instanceof Error ? error.message : "Unable to load this data.";
}

export function PageHeading({ eyebrow, title, description, action }: { eyebrow: string; title: string; description: string; action?: ReactNode }) {
  return <header className="mb-7 flex flex-wrap items-end justify-between gap-4">
    <div>
      <p className="mb-1 text-[11px] font-bold uppercase tracking-[0.18em] text-brand-accent">{eyebrow}</p>
      <h2 className="text-2xl font-bold tracking-tight md:text-3xl">{title}</h2>
      <p className="mt-2 max-w-3xl text-sm leading-6 text-ink-muted">{description}</p>
    </div>
    {action}
  </header>;
}

export function RefreshButton({ onClick, loading = false }: { onClick: () => void; loading?: boolean }) {
  return <button onClick={onClick} disabled={loading} className="inline-flex items-center gap-2 rounded-lg border border-base-border bg-base-surface px-3 py-2 text-sm font-semibold text-ink-muted shadow-sm transition hover:bg-base-raised disabled:opacity-60"><RefreshCw size={16} className={loading ? "animate-spin" : ""} /> Refresh</button>;
}

export function StatusBadge({ value }: { value: string | null | undefined }) {
  const normalized = value || "unknown";
  const copy = normalized.replace(/_/g, " ");
  const good = ["active", "healthy", "resolved", "delivered", "published", "open"].includes(normalized);
  const warning = ["warning", "suspended", "in_progress", "waiting_on_customer", "pending", "high", "urgent"].includes(normalized);
  return <span className={`inline-flex rounded-full px-2.5 py-1 text-[11px] font-bold capitalize ${good ? "bg-emerald-500/12 text-emerald-700 dark:text-emerald-300" : warning ? "bg-amber-500/12 text-amber-700 dark:text-amber-300" : "bg-base-raised text-ink-muted"}`}>{copy}</span>;
}

export function EmptyState({ title, copy }: { title: string; copy: string }) {
  return <div className="grid min-h-44 place-items-center rounded-xl border border-dashed border-base-border bg-base-surface p-6 text-center"><div><p className="font-semibold">{title}</p><p className="mt-1 text-sm text-ink-muted">{copy}</p></div></div>;
}

export function LoadingState() {
  return <div className="grid min-h-64 place-items-center"><Loader2 className="animate-spin text-brand-accent" /></div>;
}

export function MetricCard({ label, value, detail, icon: Icon, tone = "brand" }: { label: string; value: string | number; detail: string; icon: LucideIcon; tone?: "brand" | "green" | "amber" | "violet" }) {
  const tones = { brand: "bg-brand-accent/12 text-brand-accent", green: "bg-emerald-500/12 text-emerald-600 dark:text-emerald-300", amber: "bg-amber-500/12 text-amber-600 dark:text-amber-300", violet: "bg-violet-500/12 text-violet-600 dark:text-violet-300" };
  return <article className="rounded-xl border border-base-border bg-base-surface p-4 shadow-sm"><div className="flex items-start justify-between gap-3"><div><p className="text-xs font-semibold uppercase tracking-wide text-ink-faint">{label}</p><p className="mt-2 text-2xl font-bold tracking-tight">{value}</p><p className="mt-1 text-xs text-ink-muted">{detail}</p></div><div className={`grid h-10 w-10 place-items-center rounded-xl ${tones[tone]}`}><Icon size={19} /></div></div></article>;
}

export function EventLine({ event }: { event: FounderEvent }) {
  return <div className="flex gap-3"><div className="mt-0.5 grid h-7 w-7 shrink-0 place-items-center rounded-full bg-brand-accent/10 text-brand-accent"><Activity size={14} /></div><div className="min-w-0"><p className="text-sm font-semibold capitalize">{event.action.replace(/_/g, " ")}</p><p className="truncate text-xs text-ink-muted">{event.reason || event.target_type || "Platform action"} · {dateTime.format(new Date(event.created_at))}</p></div></div>;
}

export function QuickLink({ to, title, copy, icon: Icon }: { to: string; title: string; copy: string; icon: LucideIcon }) {
  return <Link to={to} className="group rounded-xl border border-base-border bg-base-surface p-5 shadow-sm transition hover:-translate-y-0.5 hover:border-brand-accent/40"><Icon className="text-brand-accent" size={20} /><p className="mt-4 font-bold">{title}</p><p className="mt-1 text-sm leading-5 text-ink-muted">{copy}</p><span className="mt-4 inline-flex items-center gap-1 text-sm font-semibold text-brand-accent">Open <ArrowRight size={15} className="transition group-hover:translate-x-1" /></span></Link>;
}
