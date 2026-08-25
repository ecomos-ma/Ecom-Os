import { CalendarClock, CheckCircle2, PhoneCall, Target, TimerReset, UsersRound } from "lucide-react";
import type { ReactNode } from "react";
import { normalizeStatus } from "../../lib/statusEngine";
import type { ConfirmationSummary } from "./types";

function countByStatus(summary: ConfirmationSummary | null, statuses: string[]) {
  return Object.entries(summary?.statusCounts ?? {}).reduce((total, [rawStatus, count]) => (
    statuses.includes(normalizeStatus(rawStatus)) ? total + Number(count) : total
  ), 0);
}

function Metric({ label, value, hint, icon, accent }: { label: string; value: string | number; hint: string; icon: ReactNode; accent: string }) {
  return (
    <div className="min-w-0 rounded-2xl border border-base-border bg-base-surface p-3.5 shadow-sm">
      <div className="flex items-start justify-between gap-2">
        <div>
          <div className="text-[10.5px] font-semibold uppercase tracking-[0.075em] text-ink-muted">{label}</div>
          <div className="mt-1.5 font-mono text-[22px] font-bold tracking-tight text-ink">{value}</div>
        </div>
        <span className={`flex h-8 w-8 shrink-0 items-center justify-center rounded-xl ${accent}`}>{icon}</span>
      </div>
      <div className="mt-1 text-[10.5px] text-ink-muted">{hint}</div>
    </div>
  );
}

export function ConfirmationMetrics({
  summary,
  loading,
  myView,
}: {
  summary: ConfirmationSummary | null;
  loading: boolean;
  myView: boolean;
}) {
  if (loading && !summary) {
    return <div className="grid grid-cols-2 gap-3 md:grid-cols-3 xl:grid-cols-6">{[...Array(6)].map((_, index) => <div key={index} className="h-[116px] animate-pulse rounded-2xl bg-base-raised" />)}</div>;
  }
  const waiting = countByStatus(summary, ["pending", "new"]);
  const noAnswer = countByStatus(summary, ["no_answer", "unreachable", "busy"]);
  const confirmed = countByStatus(summary, ["confirmed"]);
  const rate = summary?.totalOrders ? Math.round((confirmed / summary.totalOrders) * 100) : 0;
  return (
    <div className="grid grid-cols-2 gap-3 md:grid-cols-3 xl:grid-cols-6">
      <Metric label={myView ? "My remaining" : "To confirm"} value={myView ? summary?.remainingOrders ?? 0 : waiting} hint={myView ? "Assigned active workload" : "Pending and new orders"} icon={<Target size={16} />} accent="bg-brand/10 text-brand" />
      <Metric label="Confirmed today" value={summary?.confirmedToday ?? 0} hint="Based on saved confirmation time" icon={<CheckCircle2 size={16} />} accent="bg-emerald-500/10 text-emerald-500" />
      <Metric label="Callbacks due" value={summary?.callbacksDue ?? 0} hint={summary?.callbacksOverdue ? `${summary.callbacksOverdue} overdue` : "No overdue callbacks"} icon={<CalendarClock size={16} />} accent="bg-violet-500/10 text-violet-500" />
      <Metric label="No response" value={noAnswer} hint="Current confirmation outcomes" icon={<TimerReset size={16} />} accent="bg-amber-500/10 text-amber-500" />
      <Metric label="Confirmation rate" value={`${rate}%`} hint={`${confirmed} currently confirmed`} icon={<UsersRound size={16} />} accent="bg-sky-500/10 text-sky-500" />
      <Metric label="Actions today" value={summary?.actionsToday ?? 0} hint={`${summary?.handledToday ?? 0} orders handled · ${summary?.callsToday ?? 0} calls`} icon={<PhoneCall size={16} />} accent="bg-orange-500/10 text-orange-500" />
    </div>
  );
}
