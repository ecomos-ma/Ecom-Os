// Shared display logic for the Billing Center. All values derive from the real
// subscription/payment backend — plan names, prices and limits are never hardcoded.

export type StatusTone = "success" | "warning" | "danger" | "info" | "neutral";

export interface DisplayStatus {
  key: "active" | "expiring" | "grace" | "pending" | "expired" | "suspended" | "cancelled" | "none";
  label: string;
  tone: StatusTone;
}

export function formatMad(amount: number | null | undefined): string {
  const value = Number(amount ?? 0);
  return `${value.toLocaleString()} MAD`;
}

export function formatDate(value: string | null | undefined): string {
  if (!value) return "—";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "—";
  return date.toLocaleDateString(undefined, { day: "numeric", month: "short", year: "numeric" });
}

export function formatDateTime(value: string | null | undefined): string {
  if (!value) return "—";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "—";
  return date.toLocaleString(undefined, { day: "numeric", month: "short", year: "numeric", hour: "2-digit", minute: "2-digit" });
}

export function daysUntil(value: string | null | undefined): number | null {
  if (!value) return null;
  const end = new Date(value).getTime();
  if (Number.isNaN(end)) return null;
  return Math.ceil((end - Date.now()) / 86_400_000);
}

const SUBSCRIPTION_LABELS: Record<string, string> = {
  active: "Active",
  grace: "Grace period",
  expired: "Expired",
  suspended: "Suspended",
  pending_payment: "Pending",
  under_review: "Pending",
  cancelled: "Cancelled",
};

/** Canonical display status derived from the effective subscription (single source of truth). */
export function deriveDisplayStatus(subscription: {
  status: string;
  current_period_end: string | null;
} | null | undefined): DisplayStatus {
  if (!subscription) return { key: "none", label: "No subscription", tone: "neutral" };
  const raw = String(subscription.status || "").toLowerCase();

  if (raw === "active") {
    const days = daysUntil(subscription.current_period_end);
    if (days !== null && days < 0) {
      return { key: "expired", label: "Expired", tone: "danger" };
    }
    if (days !== null && days <= 7) {
      return { key: "expiring", label: days === 0 ? "Expiring today" : `Expiring in ${days} day${days === 1 ? "" : "s"}`, tone: "warning" };
    }
    return { key: "active", label: "Active", tone: "success" };
  }
  if (raw === "grace") return { key: "grace", label: "Grace period", tone: "warning" };
  if (raw === "expired") return { key: "expired", label: "Expired", tone: "danger" };
  if (raw === "suspended") return { key: "suspended", label: "Suspended", tone: "danger" };
  if (raw === "pending_payment" || raw === "under_review") return { key: "pending", label: "Pending", tone: "info" };
  if (raw === "cancelled") return { key: "cancelled", label: "Cancelled", tone: "neutral" };
  return { key: "none", label: SUBSCRIPTION_LABELS[raw] ?? "Unknown", tone: "neutral" };
}

export function paymentStatusBadge(status: string | null | undefined): { label: string; tone: StatusTone } {
  const raw = String(status || "").toLowerCase();
  if (raw === "paid") return { label: "Approved", tone: "success" };
  if (raw === "submitted" || raw === "reviewing" || raw === "under_review") return { label: "Pending", tone: "info" };
  if (raw === "rejected") return { label: "Rejected", tone: "danger" };
  if (raw === "waived") return { label: "Waived", tone: "neutral" };
  if (raw === "unpaid") return { label: "Draft", tone: "neutral" };
  return { label: raw ? raw.charAt(0).toUpperCase() + raw.slice(1) : "Unknown", tone: "neutral" };
}

export const TONE_BADGE_CLASSES: Record<StatusTone, string> = {
  success: "bg-emerald-500/10 text-emerald-600 border-emerald-500/25",
  warning: "bg-warn/10 text-warn border-warn/25",
  danger: "bg-danger/10 text-danger border-danger/25",
  info: "bg-info/10 text-info border-info/25",
  neutral: "bg-base-raised text-ink-muted border-base-border",
};

export const TONE_DOT_CLASSES: Record<StatusTone, string> = {
  success: "bg-emerald-500",
  warning: "bg-warn",
  danger: "bg-danger",
  info: "bg-info",
  neutral: "bg-ink-faint",
};

export function requestTypeLabel(type: string | null | undefined): string {
  switch (String(type || "").toLowerCase()) {
    case "initial_activation": return "Initial activation";
    case "renewal": return "Renewal";
    case "upgrade": return "Upgrade";
    case "downgrade": return "Downgrade";
    case "billing_cycle_change": return "Billing cycle change";
    default: return "Payment";
  }
}

export function billingCycleLabel(cycle: string | null | undefined): string {
  return String(cycle || "").toLowerCase() === "annual" ? "Annual" : "Monthly";
}

export function formatPaymentMethod(method: string | null | undefined): string {
  const raw = String(method || "").trim();
  if (!raw) return "—";
  return raw.replace(/[-_]/g, " ").replace(/\b\w/g, (c) => c.toUpperCase());
}

export function formatLimitValue(limit: number | null | undefined | 'unlimited'): string {
  if (limit === null || limit === undefined || limit === 'unlimited') return "Unlimited";
  return Number(limit).toLocaleString();
}
