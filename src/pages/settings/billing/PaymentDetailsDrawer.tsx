import { useEffect, useState } from "react";
import { CheckCircle2, ExternalLink, FileText, ImageIcon, Loader2, Receipt, XCircle } from "lucide-react";
import { Modal } from "../../../components/Modal";
import { fetchProofSignedUrl } from "../../../services/billingService";
import {
  billingCycleLabel, formatDateTime, formatMad, formatPaymentMethod, paymentStatusBadge,
  requestTypeLabel, TONE_BADGE_CLASSES, TONE_DOT_CLASSES,
} from "./billingShared";

export interface PaymentDrawerData {
  id: string;
  reference: string;
  requestType: string;
  planName: string | null;
  billingCycle: string;
  amountMad: number;
  currency: string;
  paymentMethod: string | null;
  transactionReference: string | null;
  submittedAt: string | null;
  reviewedAt: string | null;
  createdAt: string;
  status: string;
  rejectionReason: string | null;
  proofPath: string | null;
  proofMimeType: string | null;
  proofSizeBytes: number | null;
}

/** Map a snake_case payment record (service/RPC shape) to drawer display data. */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export function toDrawerData(raw: Record<string, any>): PaymentDrawerData {
  console.log("[PaymentDetailsDrawer] toDrawerData called with raw data:", raw);
  
  const result = {
    id: String(raw.id ?? ""),
    reference: String(raw.reference ?? ""),
    requestType: String(raw.request_type ?? raw.requestType ?? ""),
    planName: raw.requested_plan_name ?? raw.planName ?? null,
    billingCycle: String(raw.billing_cycle ?? raw.billingCycle ?? "monthly"),
    amountMad: Number(raw.expected_amount_mad ?? raw.amountMad ?? 0),
    currency: String(raw.currency ?? "MAD"),
    paymentMethod: raw.payment_method ?? raw.paymentMethod ?? null,
    transactionReference: raw.transaction_reference ?? raw.transactionReference ?? null,
    submittedAt: raw.submitted_at ?? raw.submittedAt ?? null,
    reviewedAt: raw.reviewed_at ?? raw.reviewedAt ?? null,
    createdAt: String(raw.created_at ?? raw.createdAt ?? ""),
    status: String(raw.status ?? ""),
    rejectionReason: raw.rejection_reason ?? raw.rejectionReason ?? null,
    proofPath: raw.proof_path ?? raw.proofPath ?? null,
    proofMimeType: raw.proof_mime_type ?? raw.proofMimeType ?? null,
    proofSizeBytes: raw.proof_size_bytes != null ? Number(raw.proof_size_bytes) : null,
  };
  
  console.log("[PaymentDetailsDrawer] toDrawerData mapped result:", result);
  return result;
}

export function PaymentDetailsDrawer({ payment, onClose }: { payment: PaymentDrawerData | null; onClose: () => void }) {
  // Never open modal without valid payment data
  if (!payment) {
    console.warn("[PaymentDetailsDrawer] Attempted to open modal without payment data - preventing open");
    return null;
  }
  return <Modal title="Payment details" onClose={onClose}><PaymentDetails payment={payment} /></Modal>;
}

function PaymentDetails({ payment }: { payment: PaymentDrawerData }) {
  const badge = paymentStatusBadge(payment.status);

  return (
    <div className="flex flex-col gap-4 pb-2">
      <div className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-base-border bg-base-raised/40 p-4">
        <div className="min-w-0">
          <div className="text-[11px] font-semibold uppercase tracking-wide text-ink-faint">Reference</div>
          <div className="mt-0.5 font-mono text-[13.5px] font-semibold text-ink">{payment.reference}</div>
        </div>
        <span className={`inline-flex items-center gap-1.5 rounded-full border px-2.5 py-1 text-[11.5px] font-semibold ${TONE_BADGE_CLASSES[badge.tone]}`}>
          <span className={`h-1.5 w-1.5 rounded-full ${TONE_DOT_CLASSES[badge.tone]}`} />
          {badge.label}
        </span>
      </div>

      <dl className="grid grid-cols-1 gap-x-6 gap-y-3.5 sm:grid-cols-2">
        <DetailRow label="Plan" value={payment.planName ?? "—"} />
        <DetailRow label="Amount" value={formatMad(payment.amountMad)} strong />
        <DetailRow label="Billing cycle" value={billingCycleLabel(payment.billingCycle)} />
        <DetailRow label="Type" value={requestTypeLabel(payment.requestType)} />
        <DetailRow label="Payment method" value={formatPaymentMethod(payment.paymentMethod)} />
        <DetailRow label="Transfer reference" value={payment.transactionReference || "—"} mono={!!payment.transactionReference} />
        <DetailRow label="Submitted" value={formatDateTime(payment.submittedAt ?? payment.createdAt)} />
        <DetailRow
          label={payment.status === "rejected" ? "Rejected on" : "Reviewed"}
          value={payment.reviewedAt ? formatDateTime(payment.reviewedAt) : "—"}
        />
      </dl>

      {payment.status === "rejected" && (
        <div className="rounded-xl border border-danger/25 bg-danger/5 p-4">
          <div className="flex items-start gap-2.5">
            <XCircle size={16} className="mt-0.5 flex-none text-danger" />
            <div>
              <div className="text-[13px] font-semibold text-danger">Payment rejected</div>
              <p className="mt-1 text-[12.5px] leading-5 text-ink-muted">
                {payment.rejectionReason?.trim()
                  ? payment.rejectionReason
                  : "Our team could not verify this payment. Submit a new payment to activate your subscription."}
              </p>
            </div>
          </div>
        </div>
      )}

      {["submitted", "reviewing", "under_review"].includes(payment.status.toLowerCase()) && (
        <div className="flex items-start gap-2.5 rounded-xl border border-info/25 bg-info/5 p-4">
          <CheckCircle2 size={16} className="mt-0.5 flex-none text-info" />
          <p className="text-[12.5px] leading-5 text-ink-muted">
            Your payment is waiting for Admin approval. Your subscription activates automatically once it is approved.
          </p>
        </div>
      )}

      <ProofSection payment={payment} />
    </div>
  );
}

function DetailRow({ label, value, strong = false, mono = false }: { label: string; value: string; strong?: boolean; mono?: boolean }) {
  return (
    <div className="min-w-0">
      <dt className="text-[11px] font-semibold uppercase tracking-wide text-ink-faint">{label}</dt>
      <dd className={`mt-0.5 break-words text-[13px] text-ink ${strong ? "font-bold" : "font-medium"} ${mono ? "font-mono" : ""}`}>{value}</dd>
    </div>
  );
}

function ProofSection({ payment }: { payment: PaymentDrawerData }) {
  const [url, setUrl] = useState<string | null>(null);
  const [isPdf, setIsPdf] = useState(false);
  const [loading, setLoading] = useState(false);
  const [failed, setFailed] = useState(false);

  useEffect(() => {
    let active = true;
    if (!payment.proofPath) { setUrl(null); setIsPdf(false); setFailed(false); setLoading(false); return; }
    setLoading(true);
    setFailed(false);
    fetchProofSignedUrl(payment.proofPath)
      .then(({ url: signedUrl, isPdf: pdf }) => {
        if (!active) return;
        if (!signedUrl) { setFailed(true); return; }
        setUrl(signedUrl);
        setIsPdf(pdf || payment.proofMimeType === "application/pdf");
      })
      .catch((error) => {
        console.error("[PaymentDetailsDrawer] Failed to sign proof URL", error);
        if (active) setFailed(true);
      })
      .finally(() => { if (active) setLoading(false); });
    return () => { active = false; };
  }, [payment.proofPath, payment.proofMimeType]);

  if (!payment.proofPath) {
    return (
      <div className="rounded-xl border border-base-border bg-base-raised/40 p-4">
        <div className="flex items-center gap-2 text-[13px] font-medium text-ink-muted">
          <Receipt size={15} className="flex-none" />
          No proof of payment was uploaded for this request.
        </div>
      </div>
    );
  }

  return (
    <div className="rounded-xl border border-base-border bg-base-raised/40 p-4">
      <div className="mb-3 flex items-center justify-between gap-3">
        <div className="flex items-center gap-2 text-[13px] font-semibold text-ink">
          {isPdf ? <FileText size={15} className="text-ink-muted" /> : <ImageIcon size={15} className="text-ink-muted" />}
          Proof of payment
        </div>
        {payment.proofSizeBytes ? (
          <span className="text-[11.5px] text-ink-faint">{Math.max(1, Math.round(payment.proofSizeBytes / 1024))} KB</span>
        ) : null}
      </div>

      {loading ? (
        <div className="flex h-48 items-center justify-center rounded-lg border border-base-border bg-base-surface">
          <Loader2 size={20} className="animate-spin text-brand-accent" />
        </div>
      ) : failed || !url ? (
        <div className="rounded-lg border border-warn/25 bg-warn/5 px-4 py-3 text-[12.5px] text-warn">
          The proof file could not be opened right now. Please try again later.
        </div>
      ) : isPdf ? (
        <a
          href={url}
          target="_blank"
          rel="noreferrer"
          className="inline-flex items-center gap-1.5 rounded-lg border border-base-border bg-base-surface px-3.5 py-2.5 text-[12.5px] font-semibold text-ink hover:border-brand-accent/40"
        >
          <FileText size={14} className="text-brand-accent" /> Open PDF proof <ExternalLink size={12} />
        </a>
      ) : (
        <a href={url} target="_blank" rel="noreferrer" className="block overflow-hidden rounded-lg border border-base-border bg-base-surface">
          <img src={url} alt="Payment proof" className="max-h-[420px] w-full object-contain" />
        </a>
      )}
    </div>
  );
}
