import type { ClientLicenseStatus, LicenseDomainStatus } from "../../../lib/clientLicensing";

export function formatDate(value: string | null, withTime = false) {
  if (!value) return "Never";
  return new Intl.DateTimeFormat(undefined, withTime
    ? { dateStyle: "medium", timeStyle: "short" }
    : { day: "2-digit", month: "short", year: "numeric" }).format(new Date(value));
}

export function relativeTime(value: string | null) {
  if (!value) return "Never";
  const delta = Date.now() - new Date(value).getTime();
  if (delta < 60_000) return "Just now";
  const minutes = Math.floor(delta / 60_000);
  if (minutes < 60) return `${minutes} min ago`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours} hr ago`;
  const days = Math.floor(hours / 24);
  if (days < 30) return `${days} day${days === 1 ? "" : "s"} ago`;
  return formatDate(value);
}

export function formatMoney(value: number, currency: string) {
  try { return new Intl.NumberFormat(undefined, { style: "currency", currency, maximumFractionDigits: 2 }).format(value); }
  catch { return `${currency} ${value.toFixed(2)}`; }
}

const licenseColors: Record<ClientLicenseStatus, string> = {
  active: "border-emerald-200 bg-emerald-50 text-emerald-700 dark:border-emerald-500/25 dark:bg-emerald-500/10 dark:text-emerald-300",
  disabled: "border-amber-200 bg-amber-50 text-amber-700 dark:border-amber-500/25 dark:bg-amber-500/10 dark:text-amber-300",
  archived: "border-slate-200 bg-slate-100 text-slate-600 dark:border-slate-500/25 dark:bg-slate-500/10 dark:text-slate-300",
  revoked: "border-red-200 bg-red-50 text-red-700 dark:border-red-500/25 dark:bg-red-500/10 dark:text-red-300",
};

const domainColors: Record<LicenseDomainStatus, string> = {
  active: licenseColors.active,
  disabled: licenseColors.disabled,
  removed: licenseColors.archived,
};

export function StatusBadge({ status }: { status: ClientLicenseStatus }) {
  return <span className={`inline-flex rounded-full border px-2.5 py-1 text-[10px] font-black uppercase tracking-[0.12em] ${licenseColors[status]}`}>{status}</span>;
}

export function DomainStatusBadge({ status }: { status: LicenseDomainStatus }) {
  return <span className={`inline-flex rounded-full border px-2 py-0.5 text-[9px] font-black uppercase tracking-[0.1em] ${domainColors[status]}`}>{status}</span>;
}

export const fieldClass = "mt-1.5 w-full rounded-xl border border-base-border bg-base-raised px-3 py-2.5 text-sm text-ink outline-none transition focus:border-brand-accent focus:ring-2 focus:ring-brand-accent/10";
export const labelClass = "block text-[11px] font-black uppercase tracking-[0.12em] text-ink-muted";
export const primaryButton = "inline-flex min-h-10 items-center justify-center gap-2 rounded-xl bg-brand-accent px-4 py-2 text-sm font-black text-white transition hover:brightness-105 disabled:cursor-not-allowed disabled:opacity-50";
export const secondaryButton = "inline-flex min-h-10 items-center justify-center gap-2 rounded-xl border border-base-border bg-base-surface px-4 py-2 text-sm font-bold text-ink transition hover:bg-base-raised disabled:cursor-not-allowed disabled:opacity-50";
export const dangerButton = "inline-flex min-h-10 items-center justify-center gap-2 rounded-xl border border-red-200 bg-red-50 px-4 py-2 text-sm font-bold text-red-700 transition hover:bg-red-100 disabled:opacity-50 dark:border-red-500/25 dark:bg-red-500/10 dark:text-red-300";
