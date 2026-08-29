import { AlertTriangle, Lock, Zap } from "lucide-react";
import { Modal } from "./Modal";

export function PlanLimitBlockingModal({
  isOpen,
  onClose,
  blockReason,
  blockMessage,
  limit,
  used,
  periodEnd,
}: {
  isOpen: boolean;
  onClose: () => void;
  blockReason: string;
  blockMessage: string;
  limit?: number;
  used?: number;
  periodEnd?: string;
}) {
  if (!isOpen) return null;

  const isOrderLimitReached = blockReason === "order_limit_reached";
  const isSubscriptionExpired = blockReason === "subscription_expired" || blockReason === "grace_period";
  const isSubscriptionNotActive = blockReason === "subscription_pending_payment" || blockReason === "subscription_suspended";

  return (
    <Modal title="Plan Limit Reached" onClose={onClose}>
      <div className="space-y-4">
        {/* Icon and Alert */}
        <div className="flex items-start gap-4 rounded-lg border border-red-200 bg-red-50 p-4 dark:border-red-900/30 dark:bg-red-950/20">
          <div className="rounded-lg bg-red-100 p-2 text-red-600 dark:bg-red-900/40 dark:text-red-400">
            {isOrderLimitReached ? (
              <Zap size={20} />
            ) : (
              <Lock size={20} />
            )}
          </div>
          <div className="flex-1">
            <h3 className="font-semibold text-red-900 dark:text-red-200">
              {isOrderLimitReached
                ? "Monthly Order Limit Reached"
                : isSubscriptionExpired
                  ? "Subscription Expired"
                  : "Subscription Inactive"}
            </h3>
            <p className="mt-1 text-sm text-red-800 dark:text-red-300">{blockMessage}</p>
          </div>
        </div>

        {/* Usage Details */}
        {isOrderLimitReached && limit && used !== undefined && (
          <div className="grid gap-2 rounded-lg bg-base-raised p-4">
            <div className="flex items-center justify-between">
              <span className="text-sm text-ink-muted">Orders used this month:</span>
              <span className="font-semibold">{used} of {limit}</span>
            </div>
            <div className="h-2 w-full overflow-hidden rounded-full bg-base-border">
              <div
                className="h-full bg-red-600 transition-all"
                style={{ width: `${Math.min((used / limit) * 100, 100)}%` }}
              />
            </div>
            <p className="text-xs text-ink-faint">
              {limit - used <= 0
                ? "You have used all available orders for this billing cycle."
                : `${Math.max(0, limit - used)} orders remaining`}
            </p>
          </div>
        )}

        {/* Period End Info */}
        {periodEnd && (
          <div className="rounded-lg bg-amber-50 p-3 text-sm dark:bg-amber-950/20">
            <p className="text-amber-900 dark:text-amber-200">
              <span className="font-semibold">Next billing period:</span>{" "}
              {new Date(periodEnd).toLocaleDateString("en-US", {
                year: "numeric",
                month: "long",
                day: "numeric",
              })}
            </p>
          </div>
        )}

        {/* Explanation */}
        <div className="space-y-2 rounded-lg bg-base-raised p-4 text-sm">
          <p className="text-ink-muted">
            <span className="font-semibold text-ink">Your account is temporarily locked.</span> To continue using the
            platform, you must:
          </p>
          <ul className="space-y-1 pl-4 text-ink-muted">
            <li className="list-disc">
              {isOrderLimitReached
                ? "Wait for the next billing period, or upgrade to a higher plan"
                : "Submit a payment and wait for approval"}
            </li>
            <li className="list-disc">Contact support if you believe this is an error</li>
          </ul>
        </div>

        {/* Actions */}
        <div className="flex flex-wrap gap-2 pt-2">
          <button
            onClick={onClose}
            className="flex-1 rounded-lg border border-base-border px-4 py-2 text-sm font-semibold text-ink transition-colors hover:bg-base-raised"
          >
            Close
          </button>
          <a
            href="/settings/billing"
            className="flex-1 rounded-lg bg-brand-accent px-4 py-2 text-center text-sm font-semibold text-white transition-colors hover:bg-brand-accent/90"
          >
            {isOrderLimitReached ? "Upgrade Plan" : "Manage Subscription"}
          </a>
        </div>
      </div>
    </Modal>
  );
}
