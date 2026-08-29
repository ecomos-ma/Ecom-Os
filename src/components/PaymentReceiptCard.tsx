import QRCode from "react-qr-code";
import { BadgeCheck, Building2, CalendarClock, CreditCard, Download, FileCheck2, Hash, ShieldCheck, UserRound } from "lucide-react";
import ecomosLogo from "../assets/ecomos_logo_137x32.png";
import { downloadPaymentReceiptPdf, receiptStatusCopy, receiptVerificationPayload, type PaymentReceiptData } from "../lib/paymentReceipt";

export function PaymentReceiptCard({ receipt, compact = false }: { receipt: PaymentReceiptData; compact?: boolean }) {
  const status = receiptStatusCopy(receipt.status);
  const submitted = new Intl.DateTimeFormat("en-MA", { dateStyle: "medium", timeStyle: "short", timeZone: "Africa/Casablanca" }).format(new Date(receipt.submittedAt));
  return (
    <article className={`relative overflow-hidden rounded-[28px] border border-[#e73773]/20 bg-white shadow-[0_28px_80px_rgba(115,28,66,0.13)] ${compact ? "p-4" : "p-5 sm:p-7"}`}>
      <div className="pointer-events-none absolute -end-16 -top-16 h-44 w-44 rounded-full bg-[#e73773]/10 blur-2xl" />
      <header className="relative flex flex-wrap items-start justify-between gap-4 border-b border-dashed border-[#e73773]/20 pb-5">
        <div><img src={ecomosLogo} alt="EcomOS" className="h-7 w-auto" /><p className="mt-3 text-[9px] font-black uppercase tracking-[0.18em] text-[#bd245a]">Payment proof receipt</p><h2 className="mt-1 text-xl font-black tracking-[-0.03em] text-[#321421]">Submission recorded</h2></div>
        <div className="rounded-2xl bg-[#fff0f5] px-4 py-3 text-end ring-1 ring-[#e73773]/15"><span className="block text-[8px] font-black uppercase tracking-[0.14em] text-[#b56a84]">Ticket ID</span><strong className="mt-1 block font-mono text-xs text-[#b52259]">{receipt.receiptNumber}</strong></div>
      </header>

      <div className="mt-5 flex items-start gap-3 rounded-2xl border border-[#e73773]/15 bg-[#fff7fa] p-4"><span className="grid h-10 w-10 shrink-0 place-items-center rounded-xl bg-[#e73773] text-white"><FileCheck2 size={19} /></span><div><p className="text-sm font-black text-[#321421]">{status.label}</p><p className="mt-1 text-xs leading-5 text-[#80576a]">{status.detail}</p></div></div>

      <div className={`mt-5 grid gap-3 ${compact ? "sm:grid-cols-2" : "sm:grid-cols-2"}`}>
        <ReceiptFact icon={UserRound} label="Customer" value={receipt.customerName || receipt.customerEmail} />
        <ReceiptFact icon={CreditCard} label="Amount submitted" value={`${receipt.amountMad.toLocaleString("en-US")} ${receipt.currency}`} strong />
        <ReceiptFact icon={BadgeCheck} label="Plan" value={`${receipt.planName} - ${receipt.billingCycle}`} />
        <ReceiptFact icon={Building2} label="Payment method" value={receipt.paymentMethod} />
        <ReceiptFact icon={Hash} label="Transfer reference" value={receipt.transactionReference || "Not provided"} mono />
        <ReceiptFact icon={CalendarClock} label="Submitted" value={submitted} />
      </div>

      {!compact && <div className="mt-5 grid items-center gap-4 rounded-2xl border border-[#e73773]/15 bg-white p-4 sm:grid-cols-[88px_1fr]"><div className="rounded-xl bg-white p-2 ring-1 ring-[#e73773]/15"><QRCode value={receiptVerificationPayload(receipt)} size={72} fgColor="#321421" bgColor="#ffffff" className="h-auto w-full" /></div><div><p className="flex items-center gap-2 text-xs font-black text-[#321421]"><ShieldCheck size={15} className="text-[#e73773]" />System verification payload</p><p className="mt-1.5 text-[10px] leading-4 text-[#80576a]">This ticket and its uploaded proof remain archived in EcomOS for the customer and billing team.</p><p className="mt-2 break-all font-mono text-[8px] text-[#ad8192]">{receipt.id}</p></div></div>}

      <div className="mt-5 rounded-xl border border-amber-200 bg-amber-50 px-3.5 py-3 text-[10px] leading-4 text-amber-800"><strong>Important:</strong> this receipt confirms proof submission. It does not confirm final bank-payment approval until EcomOS verifies the transfer.</div>
      <button type="button" onClick={() => void downloadPaymentReceiptPdf(receipt)} className="mt-4 flex min-h-11 w-full items-center justify-center gap-2 rounded-xl bg-[linear-gradient(105deg,#ed3b78,#cb245f)] px-4 text-xs font-black text-white shadow-[0_14px_28px_rgba(231,55,115,0.22)] transition hover:-translate-y-0.5 hover:brightness-105"><Download size={15} />Download official receipt PDF</button>
    </article>
  );
}

function ReceiptFact({ icon: Icon, label, value, strong = false, mono = false }: { icon: typeof UserRound; label: string; value: string; strong?: boolean; mono?: boolean }) {
  return <div className="flex min-w-0 items-start gap-3 rounded-xl border border-[#f0d9e2] bg-[#fffbfd] p-3"><span className="grid h-8 w-8 shrink-0 place-items-center rounded-lg bg-[#fff0f5] text-[#d52a66]"><Icon size={15} /></span><span className="min-w-0"><span className="block text-[8px] font-black uppercase tracking-[0.12em] text-[#b28193]">{label}</span><strong className={`mt-1 block break-words text-[11px] text-[#321421] ${strong ? "text-sm font-black" : "font-bold"} ${mono ? "font-mono" : ""}`}>{value}</strong></span></div>;
}
