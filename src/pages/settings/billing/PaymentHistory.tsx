import { useEffect, useState } from "react";
import { ChevronLeft, ChevronRight, History, Receipt, RefreshCw } from "lucide-react";
import { fetchPaymentHistory, type PaymentRecord } from "../../../services/billingService";
import {
  formatDateTime, formatMad, formatPaymentMethod, paymentStatusBadge, requestTypeLabel,
  TONE_BADGE_CLASSES, TONE_DOT_CLASSES,
} from "./billingShared";
import { toDrawerData, type PaymentDrawerData } from "./PaymentDetailsDrawer";
import { reportError } from "../../../lib/errorHandling";

const PAGE_SIZE = 10;

export function PaymentHistory({ refreshKey, onSelect }: { refreshKey: number; onSelect: (payment: PaymentDrawerData) => void }) {
  const [page, setPage] = useState(1);
  const [rows, setRows] = useState<PaymentRecord[]>([]);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let active = true;
    setLoading(true);
    setError(null);
    fetchPaymentHistory(page, PAGE_SIZE)
      .then((data) => {
        console.log("[PaymentHistory] Payment history loaded:", data);
        if (!active) return;
        setRows(data.rows);
        setTotal(data.total);
        if (page > 1 && data.rows.length === 0) setPage(1);
      })
      .catch(async (loadError) => {
        console.error("[PaymentHistory] Failed to load payment history - FULL ERROR:", {
          message: loadError?.message,
          code: (loadError as any)?.code,
          details: (loadError as any)?.details,
          hint: (loadError as any)?.hint,
        });
        const safe = await reportError(loadError, "billing.payment_history", { action: "load_payment_history" });
        if (active) setError(safe.userMessage);
      })
      .finally(() => { if (active) setLoading(false); });
    return () => { active = false; };
  }, [page, refreshKey]);

  const totalPages = Math.max(1, Math.ceil(total / PAGE_SIZE));

  return (
    <section className="rounded-xl border border-base-border bg-base-surface shadow-card">
      <div className="flex items-center justify-between gap-3 border-b border-base-border p-5">
        <div className="flex items-center gap-2.5">
          <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-brand-accent/15 text-brand-accent"><History size={15} /></div>
          <div>
            <h3 className="text-[14px] font-semibold text-ink">Payment history</h3>
            <p className="text-[12px] text-ink-muted">All payments submitted for this account.</p>
          </div>
        </div>
        {total > 0 && <span className="flex-none text-[12px] text-ink-muted">{total} {total === 1 ? "record" : "records"}</span>}
      </div>

      {loading ? (
        <div className="space-y-2 p-5" aria-hidden>
          {Array.from({ length: 3 }).map((_, index) => <div key={index} className="h-14 animate-pulse rounded-lg bg-base-raised" />)}
        </div>
      ) : error ? (
        <div className="p-5">
          <div className="rounded-lg border border-danger/25 bg-danger/5 px-4 py-3 text-[12.5px] text-ink">
            We couldn't load your payment history.
          </div>
          <button
            type="button"
            onClick={() => setPage((value) => value)}
            className="mt-3 inline-flex items-center gap-1.5 rounded-lg border border-base-border bg-base-raised px-3 py-1.5 text-[12.5px] font-semibold text-ink hover:bg-base-surface"
          >
            <RefreshCw size={13} /> Retry
          </button>
        </div>
      ) : rows.length === 0 ? (
        <div className="flex flex-col items-center justify-center py-14 text-center">
          <div className="mb-3 flex h-11 w-11 items-center justify-center rounded-xl bg-base-raised text-ink-muted"><Receipt size={19} /></div>
          <div className="text-[14px] font-medium text-ink">No payments yet.</div>
          <p className="mt-1 text-[12.5px] text-ink-muted">Payments you submit will appear here with their approval status.</p>
        </div>
      ) : (
        <>
          {/* Desktop table */}
          <div className="hidden overflow-x-auto md:block">
            <table className="w-full min-w-[760px] border-collapse text-left">
              <thead>
                <tr className="border-b border-base-border text-[11px] font-semibold uppercase tracking-wide text-ink-faint">
                  <th className="px-5 py-3">Date</th>
                  <th className="px-3 py-3">Plan</th>
                  <th className="px-3 py-3">Amount</th>
                  <th className="px-3 py-3">Method</th>
                  <th className="px-3 py-3">Reference</th>
                  <th className="px-3 py-3">Status</th>
                  <th className="px-3 py-3">Proof</th>
                </tr>
              </thead>
              <tbody>
                {rows.map((row) => <HistoryRow key={row.id} row={row} onSelect={onSelect} />)}
              </tbody>
            </table>
          </div>

          {/* Mobile cards */}
          <div className="divide-y divide-base-border md:hidden">
            {rows.map((row) => <HistoryCard key={row.id} row={row} onSelect={onSelect} />)}
          </div>

          {totalPages > 1 && (
            <div className="flex items-center justify-between border-t border-base-border px-5 py-3">
              <span className="text-[12px] text-ink-muted">Page {page} of {totalPages}</span>
              <div className="flex gap-2">
                <button
                  type="button"
                  disabled={page <= 1}
                  onClick={() => setPage((value) => Math.max(1, value - 1))}
                  className="inline-flex items-center gap-1 rounded-lg border border-base-border bg-base-raised px-3 py-1.5 text-[12px] font-semibold text-ink hover:bg-base-surface disabled:cursor-not-allowed disabled:opacity-50"
                >
                  <ChevronLeft size={13} /> Prev
                </button>
                <button
                  type="button"
                  disabled={page >= totalPages}
                  onClick={() => setPage((value) => Math.min(totalPages, value + 1))}
                  className="inline-flex items-center gap-1 rounded-lg border border-base-border bg-base-raised px-3 py-1.5 text-[12px] font-semibold text-ink hover:bg-base-surface disabled:cursor-not-allowed disabled:opacity-50"
                >
                  Next <ChevronRight size={13} />
                </button>
              </div>
            </div>
          )}
        </>
      )}
    </section>
  );
}

function StatusPill({ status }: { status: string }) {
  const badge = paymentStatusBadge(status);
  return (
    <span className={`inline-flex items-center gap-1.5 whitespace-nowrap rounded-full border px-2 py-0.5 text-[11px] font-semibold ${TONE_BADGE_CLASSES[badge.tone]}`}>
      <span className={`h-1.5 w-1.5 rounded-full ${TONE_DOT_CLASSES[badge.tone]}`} />
      {badge.label}
    </span>
  );
}

function proofLabel(row: PaymentRecord): string | null {
  if (!row.proof_path) return null;
  return row.proof_mime_type === "application/pdf" ? "PDF" : "Image";
}

function HistoryRow({ row, onSelect }: { row: PaymentRecord; onSelect: (payment: PaymentDrawerData) => void }) {
  const handleClick = () => {
    const paymentData = toDrawerData(row);
    console.log("[PaymentHistory] HistoryRow clicked, mapping payment data:", paymentData);
    onSelect(paymentData);
  };
  
  return (
    <tr
      onClick={handleClick}
      className="cursor-pointer border-b border-base-border/60 text-[12.5px] text-ink transition-colors last:border-b-0 hover:bg-base-raised/50"
    >
      <td className="whitespace-nowrap px-5 py-3.5">
        <div className="font-medium">{formatDateTime(row.submitted_at ?? row.created_at)}</div>
        <div className="mt-0.5 text-[11px] text-ink-faint">{requestTypeLabel(row.request_type)}</div>
      </td>
      <td className="px-3 py-3.5 font-medium">{row.requested_plan_name ?? row.requested_plan ?? "—"}</td>
      <td className="whitespace-nowrap px-3 py-3.5 font-bold">{formatMad(row.expected_amount_mad)}</td>
      <td className="px-3 py-3.5 text-ink-muted">{formatPaymentMethod(row.payment_method)}</td>
      <td className="px-3 py-3.5 font-mono text-[11.5px] text-ink-muted">{row.reference}</td>
      <td className="px-3 py-3.5"><StatusPill status={row.status} /></td>
      <td className="px-3 py-3.5">
        <span className="text-[11.5px] font-medium text-brand-accent">{proofLabel(row) ?? "—"}</span>
      </td>
    </tr>
  );
}

function HistoryCard({ row, onSelect }: { row: PaymentRecord; onSelect: (payment: PaymentDrawerData) => void }) {
  const handleClick = () => {
    const paymentData = toDrawerData(row);
    console.log("[PaymentHistory] HistoryCard clicked, mapping payment data:", paymentData);
    onSelect(paymentData);
  };
  
  return (
    <button
      type="button"
      onClick={handleClick}
      className="flex w-full flex-col gap-2 p-4 text-left transition-colors hover:bg-base-raised/50"
    >
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <div className="truncate text-[13.5px] font-semibold text-ink">{row.requested_plan_name ?? row.requested_plan ?? "Payment"}</div>
          <div className="mt-0.5 text-[11.5px] text-ink-faint">{formatDateTime(row.submitted_at ?? row.created_at)}</div>
        </div>
        <StatusPill status={row.status} />
      </div>
      <div className="flex flex-wrap items-center gap-x-4 gap-y-1 text-[12px] text-ink-muted">
        <span className="font-bold text-ink">{formatMad(row.expected_amount_mad)}</span>
        <span>{requestTypeLabel(row.request_type)}</span>
        <span className="font-mono text-[11px]">{row.reference}</span>
        {row.proof_path ? <span className="font-medium text-brand-accent">{proofLabel(row)} proof</span> : null}
      </div>
    </button>
  );
}
