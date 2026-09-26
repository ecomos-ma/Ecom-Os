import { ChangeEvent, useEffect, useMemo, useState, type ReactNode } from "react";
import { jsPDF } from "jspdf";
import { CheckCircle2, Download, FileText, Loader2, Plus, RefreshCw, Send } from "lucide-react";
import { EmptyState } from "../components/EmptyState";
import { PageHeader } from "../components/PageHeader";
import { useAuth } from "../hooks/useAuth";
import { isFounder } from "../lib/rbac";
import { supabase } from "../lib/supabase";
import {
  acknowledgePayment,
  attachPaymentProof,
  generatePayroll,
  getAgentPaymentProofUrl,
  loadInvoiceLines,
  loadPayrollSummary,
  PayrollSchemaUnavailableError,
  recordAgentPayment,
  type PayrollInvoice,
  type PayrollInvoiceLine,
  type PayrollPeriod,
  type PayrollSummary,
} from "../services/agentPayrollService";

const money = (amount: number) => `${Number(amount || 0).toLocaleString("fr-MA", { minimumFractionDigits: 2, maximumFractionDigits: 2 })} MAD`;
const dateOnly = (value: Date) => value.toISOString().slice(0, 10);
const label = (value: string) => value.replace(/_/g, " ");

function invoicePaid(invoice: PayrollInvoice, summary: PayrollSummary) {
  const activePayments = new Set(summary.payments.filter((payment) => payment.status === "recorded").map((payment) => payment.id));
  return summary.allocations.filter((item) => item.invoice_id === invoice.id && activePayments.has(item.payment_id)).reduce((total, item) => total + Number(item.amount || 0), 0);
}

function exportInvoice(invoice: PayrollInvoice, summary: PayrollSummary, agentName: string, lines: PayrollInvoiceLine[], period?: PayrollPeriod) {
  const pdf = new jsPDF({ unit: "mm", format: "a4" });
  const paid = invoicePaid(invoice, summary);
  pdf.setFontSize(21); pdf.text("EcomOS · Agent earnings statement", 16, 20);
  pdf.setFontSize(11);
  [`Invoice: ${invoice.invoice_number}`, `Agent: ${agentName}`, `Period: ${period ? `${new Date(period.starts_at).toLocaleDateString()} - ${new Date(period.ends_at).toLocaleDateString()}` : "Unavailable"}`, `Issued: ${new Date(invoice.issued_at).toLocaleDateString()}`, `Total earned: ${money(invoice.total_amount)}`, `Transfers recorded: ${money(paid)}`, `Outstanding: ${money(Math.max(0, invoice.total_amount - paid))}`, `Status: ${label(invoice.status)}`].forEach((line, index) => pdf.text(line, 16, 36 + index * 8));
  pdf.setFontSize(10); pdf.text("Commission and earnings breakdown", 16, 110);
  pdf.setFontSize(9);
  let y = 120;
  for (const line of lines) {
    const description = line.description || label(line.line_type);
    const paragraphs = pdf.splitTextToSize(`${description} · ${line.quantity} × ${money(line.unit_amount)} = ${money(line.amount)}`, 175) as string[];
    if (y + paragraphs.length * 5 > 275) { pdf.addPage(); y = 20; }
    pdf.text(paragraphs, 16, y);
    y += paragraphs.length * 5 + 3;
  }
  if (y > 266) { pdf.addPage(); y = 20; }
  pdf.text("Generated from EcomOS' earnings and payment ledgers.", 16, y + 7);
  pdf.save(`${invoice.invoice_number}.pdf`);
}

export default function AgentInvoices({ financeView = false }: { financeView?: boolean }) {
  const { workspace, profile, session } = useAuth();
  const founder = profile?.role === "owner" || isFounder(profile?.role, session?.user?.email);
  const [summary, setSummary] = useState<PayrollSummary | null>(null);
  const [names, setNames] = useState<Record<string, string>>({});
  const [loading, setLoading] = useState(true);
  const [setupRequired, setSetupRequired] = useState(false);
  const [error, setError] = useState("");
  const [generating, setGenerating] = useState(false);
  const [selectedInvoiceId, setSelectedInvoiceId] = useState("");
  const [paymentAmount, setPaymentAmount] = useState("");
  const [reference, setReference] = useState("");
  const [proof, setProof] = useState<File | null>(null);
  const [savingPayment, setSavingPayment] = useState(false);
  const [paymentStep, setPaymentStep] = useState("");
  const [acknowledging, setAcknowledging] = useState("");
  const [invoiceLines, setInvoiceLines] = useState<{ invoiceId: string; rows: PayrollInvoiceLine[] } | null>(null);
  const [loadingLines, setLoadingLines] = useState(false);
  const [online, setOnline] = useState(() => navigator.onLine);

  useEffect(() => {
    const update = () => setOnline(navigator.onLine);
    window.addEventListener("online", update);
    window.addEventListener("offline", update);
    return () => { window.removeEventListener("online", update); window.removeEventListener("offline", update); };
  }, []);

  const showError = (cause: unknown, fallback: string) => {
    if (cause instanceof PayrollSchemaUnavailableError) { setSetupRequired(true); setError(""); return; }
    setError(cause instanceof Error ? cause.message : fallback);
  };

  const refresh = async () => {
    if (!workspace?.id) return;
    setLoading(true); setError(""); setSetupRequired(false);
    try {
      const next = await loadPayrollSummary(workspace.id);
      setSummary(next);
      const ids = [...new Set(next.invoices.map((invoice) => invoice.agent_id))];
      if (!ids.length) { setNames({}); return; }
      const { data } = await supabase.from("profiles").select("id,full_name,email").in("id", ids);
      setNames(Object.fromEntries((data ?? []).map((row: { id: string; full_name: string | null; email: string | null }) => [row.id, row.full_name || row.email || row.id])));
    } catch (cause) { showError(cause, "We couldn't load agent payroll right now."); }
    finally { setLoading(false); }
  };

  useEffect(() => { void refresh(); }, [workspace?.id]);

  const invoices = useMemo(() => (summary?.invoices ?? []).filter((invoice) => founder || invoice.agent_id === session?.user?.id), [summary, founder, session?.user?.id]);
  const payments = useMemo(() => (summary?.payments ?? []).filter((payment) => founder || payment.agent_id === session?.user?.id), [summary, founder, session?.user?.id]);
  useEffect(() => { if (invoices.length && !invoices.some((invoice) => invoice.id === selectedInvoiceId)) setSelectedInvoiceId(invoices[0].id); }, [invoices, selectedInvoiceId]);
  useEffect(() => {
    if (!selectedInvoiceId) { setInvoiceLines(null); return; }
    let active = true;
    setLoadingLines(true);
    setInvoiceLines(null);
    void loadInvoiceLines(selectedInvoiceId).then((rows) => { if (active) setInvoiceLines({ invoiceId: selectedInvoiceId, rows }); }).catch((cause) => { if (active) showError(cause, "Could not load invoice details."); }).finally(() => { if (active) setLoadingLines(false); });
    return () => { active = false; };
  }, [selectedInvoiceId]);

  const totalEarned = invoices.reduce((sum, invoice) => sum + Number(invoice.total_amount || 0), 0);
  const totalPaid = payments.filter((payment) => payment.status === "recorded").reduce((sum, payment) => sum + Number(payment.amount || 0), 0);
  const awaiting = payments.filter((payment) => payment.status === "recorded" && !summary?.acknowledgments.some((acknowledgment) => acknowledgment.payment_id === payment.id)).reduce((sum, payment) => sum + Number(payment.amount || 0), 0);
  const selected = invoices.find((invoice) => invoice.id === selectedInvoiceId) ?? null;
  const agentPayables = founder ? Object.values(invoices.reduce<Record<string, { agentId: string; earned: number; paid: number; invoiceId: string }>>((result, invoice) => {
    const current = result[invoice.agent_id] ?? { agentId: invoice.agent_id, earned: 0, paid: 0, invoiceId: invoice.id };
    current.earned += Number(invoice.total_amount || 0);
    current.paid += invoicePaid(invoice, summary!);
    result[invoice.agent_id] = current;
    return result;
  }, {})).sort((a, b) => (b.earned - b.paid) - (a.earned - a.paid)) : [];
  const selectedPeriod = summary?.periods.find((period) => period.id === selected?.payroll_period_id);
  const selectedLines = invoiceLines && invoiceLines.invoiceId === selected?.id ? invoiceLines.rows : [];
  const outstanding = Math.max(0, totalEarned - totalPaid);
  const disputed = payments.filter((payment) => payment.status === "recorded" && summary?.disputes.some((item) => item.payment_id === payment.id && item.status === "open")).reduce((total, payment) => total + Number(payment.amount || 0), 0);

  const runPayroll = async () => {
    if (!workspace?.id) return;
    if (!navigator.onLine) { setError("Reconnect to generate payroll. No changes were saved."); return; }
    setGenerating(true); setError("");
    try {
      const end = new Date(); const start = new Date(end); start.setDate(start.getDate() - 7);
      await generatePayroll(workspace.id, `${dateOnly(start)}T00:00:00.000Z`, `${dateOnly(end)}T00:00:00.000Z`);
      await refresh();
    } catch (cause) { showError(cause, "Payroll could not be generated."); }
    finally { setGenerating(false); }
  };

  const savePayment = async () => {
    if (!workspace?.id || !summary || !selected) return;
    if (!navigator.onLine) { setError("Reconnect to record this transfer. No payment was saved."); return; }
    const amount = Number(paymentAmount);
    const remaining = Math.max(0, selected.total_amount - invoicePaid(selected, summary));
    if (!Number.isFinite(amount) || amount <= 0 || amount > remaining) { setError(`Enter an amount from 0.01 to ${money(remaining)}.`); return; }
    setSavingPayment(true); setPaymentStep("Recording transfer…"); setError("");
    try {
      const paymentId = await recordAgentPayment(workspace.id, selected.agent_id, amount, [{ payment_id: "", invoice_id: selected.id, amount }], { paymentMethod: "bank_transfer", reference });
      let proofWarning = "";
      if (proof) {
        setPaymentStep("Uploading private proof…");
        try { await attachPaymentProof(workspace.id, paymentId, proof); }
        catch (cause) {
          proofWarning = `Transfer was recorded, but the proof could not be attached. Do not record this payment again. ${cause instanceof Error ? cause.message : "Contact support."}`;
        }
      }
      setPaymentAmount(""); setReference(""); setProof(null); await refresh();
      if (proofWarning) setError(proofWarning);
    } catch (cause) { showError(cause, "Payment could not be saved."); }
    finally { setSavingPayment(false); setPaymentStep(""); }
  };

  const acknowledge = async (paymentId: string, outcome: "received_full" | "not_received" | "received_different", actualAmount?: number, explanation?: string) => {
    if (!navigator.onLine) { setError("Reconnect to submit your acknowledgment. No response was saved."); return; }
    setAcknowledging(paymentId); setError("");
    try { await acknowledgePayment(paymentId, outcome, actualAmount, explanation); await refresh(); }
    catch (cause) { showError(cause, "Payment acknowledgment could not be saved."); }
    finally { setAcknowledging(""); }
  };

  const openProof = async (storagePath: string) => {
    const tab = window.open("", "_blank");
    try {
      const url = await getAgentPaymentProofUrl(storagePath);
      if (tab) tab.location.href = url;
      else window.location.href = url;
    } catch (cause) {
      tab?.close();
      showError(cause, "Could not open the payment proof.");
    }
  };

  const title = financeView ? "Agent payments" : "Agent invoices";
  const subtitle = founder ? "Review earnings, pay agents, and keep an audit-ready transfer record." : "Review your earnings statements and recorded transfers.";
  const actions = <div className="flex items-center gap-2"><button onClick={() => void refresh()} disabled={!online} className="inline-flex items-center gap-2 rounded-md border border-base-border bg-base-surface px-3 py-2 text-sm font-medium text-ink hover:bg-base-raised disabled:opacity-50"><RefreshCw size={15} />Refresh</button>{founder && <button onClick={() => void runPayroll()} disabled={generating || !online} className="inline-flex items-center gap-2 rounded-md bg-brand px-3 py-2 text-sm font-semibold text-white disabled:cursor-not-allowed disabled:opacity-60"><Plus size={15} />{generating ? "Generating…" : "Generate payroll"}</button>}</div>;

  if (loading) return <div className="flex h-64 items-center justify-center"><Loader2 className="animate-spin text-brand" /></div>;
  if (setupRequired) return <div className="pb-12"><PageHeader title={title} subtitle={subtitle} action={actions} /><section className="mx-auto mt-8 max-w-2xl rounded-xl border border-base-border bg-base-surface p-8 text-center shadow-card"><div className="mx-auto flex h-11 w-11 items-center justify-center rounded-lg bg-amber-100 text-amber-700"><FileText size={21} /></div><h2 className="mt-4 text-lg font-semibold text-ink">Agent payroll needs a database update</h2><p className="mx-auto mt-2 max-w-lg text-sm leading-6 text-ink-muted">The payroll tables are not available in this workspace yet. Apply the EcomOS payroll migration, refresh the Supabase schema cache, then reload this page.</p><div className="mt-5 rounded-md border border-base-border bg-base-raised px-4 py-3 text-left font-mono text-xs text-ink">supabase/migrations/20260922120000_agent_payroll_and_exclusive_assignment.sql</div><button onClick={() => void refresh()} className="mt-5 inline-flex items-center gap-2 rounded-md border border-base-border px-3 py-2 text-sm font-medium text-ink hover:bg-base-raised"><RefreshCw size={15} />Check again</button></section></div>;
  if (!summary) return <div className="pb-12"><PageHeader title={title} subtitle={subtitle} action={actions} /><div role="alert" className="mt-5 rounded-lg border border-danger/20 bg-danger/5 px-4 py-3 text-sm text-danger">{error || "We couldn't load agent payroll right now."}</div></div>;

  const linkedPayments = selected ? payments.filter((payment) => summary.allocations.some((allocation) => allocation.payment_id === payment.id && allocation.invoice_id === selected.id)) : [];
  return <div className="pb-12">
    <PageHeader title={title} subtitle={subtitle} action={actions} />
    {!online && <div role="status" className="mt-4 rounded-lg border border-amber-300 bg-amber-50 px-4 py-3 text-sm text-amber-900">You are offline. Payroll, transfers, and acknowledgments are paused until you reconnect.</div>}
    {error && <div role="alert" className="mt-4 rounded-lg border border-danger/20 bg-danger/5 px-4 py-3 text-sm text-danger">{error}</div>}
    <section className="mt-5 grid grid-cols-2 gap-3 sm:grid-cols-3 xl:grid-cols-5"><SummaryStat label="Total earned" value={money(totalEarned)} /><SummaryStat label="Paid or transferred" value={money(totalPaid)} /><SummaryStat label="Remaining balance" value={money(outstanding)} /><SummaryStat label="Awaiting confirmation" value={money(awaiting)} /><SummaryStat label="Disputed transfers" value={money(disputed)} /></section>
    {founder && agentPayables.length > 0 && <section className="mt-5 rounded-xl border border-base-border bg-base-surface shadow-card"><div className="border-b border-base-border px-5 py-4"><h2 className="font-semibold text-ink">Agent payables</h2><p className="mt-1 text-sm text-ink-muted">Select an agent to review their invoices and transfer balance.</p></div><div className="grid gap-2 p-3 sm:grid-cols-2 xl:grid-cols-3">{agentPayables.map((payable) => <button key={payable.agentId} type="button" onClick={() => setSelectedInvoiceId(payable.invoiceId)} className="min-h-20 rounded-lg border border-base-border bg-base-raised p-3 text-left transition hover:border-brand/40"><p className="truncate text-sm font-semibold text-ink">{names[payable.agentId] || "Agent"}</p><p className="mt-1 text-xs text-ink-muted">Earned {money(payable.earned)} · Paid {money(payable.paid)}</p><p className="mt-1 text-sm font-semibold text-ink">Remaining {money(Math.max(0, payable.earned - payable.paid))}</p></button>)}</div></section>}
    <section className="mt-5 grid gap-5 xl:grid-cols-[minmax(0,1fr)_360px]">
      <div className="overflow-hidden rounded-xl border border-base-border bg-base-surface shadow-card"><div className="flex items-center justify-between border-b border-base-border px-5 py-4"><div><h2 className="font-semibold text-ink">Invoices</h2><p className="mt-1 text-sm text-ink-muted">Totals are generated from finalized, attributed earnings.</p></div><span className="rounded-full bg-base-raised px-2.5 py-1 text-xs font-medium text-ink-muted">{invoices.length} total</span></div>{invoices.length === 0 ? <div className="py-12"><EmptyState title="No payroll invoices yet" description={founder ? "Generate a payroll period once qualifying earnings exist." : "Your issued earnings statements will appear here."} compact /></div> : <InvoiceTable invoices={invoices} summary={summary} names={names} founder={founder} selectedId={selected?.id} onSelect={setSelectedInvoiceId} />}</div>
      <aside className="rounded-xl border border-base-border bg-base-surface shadow-card">
        <div className="border-b border-base-border px-5 py-4"><h2 className="font-semibold text-ink">{founder ? "Payment details" : "Invoice details"}</h2><p className="mt-1 text-sm text-ink-muted">{selected ? selected.invoice_number : "Choose an invoice to continue."}</p></div>
        {!selected ? <p className="p-5 text-sm text-ink-muted">Select an invoice to view its balance and transfers.</p> : <div className="space-y-5 p-5">
          <div className="grid grid-cols-2 gap-3"><Detail label="Invoice total" value={money(selected.total_amount)} /><Detail label="Remaining" value={money(Math.max(0, selected.total_amount - invoicePaid(selected, summary)))} /></div>
          <div className="rounded-md bg-base-raised px-3 py-3 text-xs text-ink-muted">Payroll period: {selectedPeriod ? `${new Date(selectedPeriod.starts_at).toLocaleDateString()} – ${new Date(selectedPeriod.ends_at).toLocaleDateString()}` : "Unavailable"}</div>
          <div><h3 className="text-sm font-semibold text-ink">Earnings breakdown</h3>{loadingLines ? <p className="mt-2 text-xs text-ink-muted">Loading invoice lines…</p> : selectedLines.length === 0 ? <p className="mt-2 text-xs text-ink-muted">No itemized earnings on this invoice.</p> : <div className="mt-2 divide-y divide-base-border rounded-lg border border-base-border">{selectedLines.map((line) => <div key={line.id} className="flex items-start justify-between gap-3 p-3 text-xs"><div className="min-w-0"><p className="font-semibold text-ink">{line.description || label(line.line_type)}</p><p className="mt-0.5 text-ink-muted">{label(line.line_type)} · {line.quantity} × {money(line.unit_amount)}</p></div><span className="shrink-0 font-semibold text-ink">{money(line.amount)}</span></div>)}</div>}</div>
          <button onClick={() => exportInvoice(selected, summary, names[selected.agent_id] || profile?.full_name || "Agent", selectedLines, selectedPeriod)} disabled={loadingLines} className="inline-flex min-h-11 w-full items-center justify-center gap-2 rounded-md border border-base-border px-3 py-2 text-sm font-medium text-ink hover:bg-base-raised disabled:opacity-50"><Download size={15} />Download statement</button>
          {founder ? <><SavedBankDetails account={summary.bankAccounts.find((account) => account.agent_id === selected.agent_id && account.is_default === true)} /><PaymentForm amount={paymentAmount} reference={reference} proof={proof} saving={savingPayment} online={online} step={paymentStep} onAmount={setPaymentAmount} onReference={setReference} onProof={setProof} onSave={savePayment} /></> : <AgentAcknowledgment payments={linkedPayments} summary={summary} acknowledging={acknowledging} online={online} onAcknowledge={acknowledge} />}
        </div>}
      </aside>
    </section>
    <section className="mt-5 overflow-hidden rounded-xl border border-base-border bg-base-surface shadow-card"><div className="flex items-center justify-between border-b border-base-border px-5 py-4"><div><h2 className="font-semibold text-ink">Transfers</h2><p className="mt-1 text-sm text-ink-muted">Every recorded transfer remains in the ledger, including disputes.</p></div><span className="rounded-full bg-base-raised px-2.5 py-1 text-xs font-medium text-ink-muted">{payments.length} total</span></div>{payments.length === 0 ? <div className="py-10"><EmptyState title="No transfers recorded" description="Transfers appear here as soon as a payment is recorded." compact /></div> : <div className="divide-y divide-base-border">{payments.map((payment) => { const acknowledged = summary.acknowledgments.find((item) => item.payment_id === payment.id); const proofFile = summary.proofs.find((item) => item.payment_id === payment.id); return <div key={payment.id} className="flex flex-wrap items-center justify-between gap-3 px-5 py-4"><div><p className="font-medium text-ink">{money(payment.amount)} <span className="font-normal text-ink-muted">· {label(payment.payment_method)}</span></p><p className="mt-1 text-xs text-ink-muted">{new Date(payment.paid_at).toLocaleString()}{payment.transaction_reference ? ` · ${payment.transaction_reference}` : ""}</p>{proofFile && <button type="button" onClick={() => void openProof(proofFile.storage_path)} className="mt-2 text-xs font-semibold text-brand underline">View transfer proof</button>}</div><StatusPill status={payment.status === "reversed" ? "reversed" : acknowledged?.outcome ?? "awaiting acknowledgment"} /></div>; })}</div>}</section>
  </div>;
}

function InvoiceTable({ invoices, summary, names, founder, selectedId, onSelect }: { invoices: PayrollInvoice[]; summary: PayrollSummary; names: Record<string, string>; founder: boolean; selectedId?: string; onSelect: (id: string) => void }) {
  return <>
    <div className="divide-y divide-base-border md:hidden">{invoices.map((invoice) => { const balance = Math.max(0, invoice.total_amount - invoicePaid(invoice, summary)); return <button key={invoice.id} onClick={() => onSelect(invoice.id)} className={`w-full px-4 py-4 text-left active:bg-base-raised ${selectedId === invoice.id ? "bg-brand/5" : ""}`}><div className="flex items-start justify-between gap-3"><div className="min-w-0"><p className="truncate text-sm font-semibold text-ink">{invoice.invoice_number}</p>{founder && <p className="mt-1 truncate text-xs text-ink-muted">{names[invoice.agent_id] || "Agent"}</p>}<p className="mt-1 text-xs text-ink-muted">{new Date(invoice.issued_at).toLocaleDateString()}</p></div><div className="shrink-0 text-right"><p className="text-sm font-semibold text-ink">{money(invoice.total_amount)}</p><p className="mt-1 text-xs text-ink-muted">Remaining {money(balance)}</p></div></div><div className="mt-3"><StatusPill status={invoice.status} /></div></button>; })}</div>
    <div className="hidden overflow-x-auto md:block"><table className="w-full min-w-[680px] text-left text-sm"><thead className="border-b border-base-border bg-base-raised text-xs font-semibold uppercase tracking-wide text-ink-muted"><tr><th className="px-5 py-3">Invoice</th>{founder && <th className="px-4 py-3">Agent</th>}<th className="px-4 py-3">Issued</th><th className="px-4 py-3">Status</th><th className="px-4 py-3 text-right">Total</th><th className="px-5 py-3 text-right">Balance</th></tr></thead><tbody className="divide-y divide-base-border">{invoices.map((invoice) => { const balance = Math.max(0, invoice.total_amount - invoicePaid(invoice, summary)); return <tr key={invoice.id} onClick={() => onSelect(invoice.id)} className={`cursor-pointer transition hover:bg-base-raised ${selectedId === invoice.id ? "bg-brand/5" : ""}`}><td className="px-5 py-4"><div className="flex items-center gap-2"><FileText size={16} className="text-ink-muted" /><span className="font-medium text-ink">{invoice.invoice_number}</span></div></td>{founder && <td className="px-4 py-4 text-ink-muted">{names[invoice.agent_id] || "Agent"}</td>}<td className="px-4 py-4 text-ink-muted">{new Date(invoice.issued_at).toLocaleDateString()}</td><td className="px-4 py-4"><StatusPill status={invoice.status} /></td><td className="px-4 py-4 text-right font-medium text-ink">{money(invoice.total_amount)}</td><td className="px-5 py-4 text-right font-medium text-ink">{money(balance)}</td></tr>; })}</tbody></table></div>
  </>;
}
function SummaryStat({ label, value }: { label: string; value: string }) { return <div className="min-w-0 rounded-xl border border-base-border bg-base-surface px-4 py-4 shadow-card"><p className="text-[10px] font-semibold uppercase tracking-wide text-ink-muted">{label}</p><p className="mt-1 break-words text-lg font-semibold tabular-nums text-ink">{value}</p></div>; }
function SavedBankDetails({ account }: { account?: Record<string, unknown> }) { return <div className="border-t border-base-border pt-4"><h3 className="text-sm font-semibold text-ink">Saved bank details</h3>{account ? <div className="mt-2 space-y-1 rounded-lg bg-base-raised p-3 text-xs text-ink"><p>{String(account.account_holder || "")}</p><p>{String(account.bank_name || "")}</p><p className="break-all font-mono">{String(account.rib_iban || "")}</p></div> : <p className="mt-2 text-xs text-ink-muted">No bank details saved for this agent.</p>}</div>; }
function Detail({ label, value }: { label: string; value: string }) { return <div className="rounded-md bg-base-raised px-3 py-3"><p className="text-xs text-ink-muted">{label}</p><p className="mt-1 text-sm font-semibold text-ink">{value}</p></div>; }
function Field({ label, children }: { label: string; children: ReactNode }) { return <label className="block text-xs font-medium text-ink-muted">{label}<span className="mt-1.5 block">{children}</span></label>; }
function StatusPill({ status }: { status: string }) { const value = status.toLowerCase(); const tone = value.includes("paid") || value.includes("acknowledged") || value === "received_full" ? "bg-emerald-50 text-emerald-700" : value.includes("disputed") || value.includes("not_received") || value.includes("different") || value === "reversed" ? "bg-red-50 text-red-700" : "bg-amber-50 text-amber-700"; return <span className={`inline-flex rounded-full px-2.5 py-1 text-xs font-medium capitalize ${tone}`}>{label(status)}</span>; }

function PaymentForm({ amount, reference, proof, saving, online, step, onAmount, onReference, onProof, onSave }: { amount: string; reference: string; proof: File | null; saving: boolean; online: boolean; step: string; onAmount: (value: string) => void; onReference: (value: string) => void; onProof: (value: File | null) => void; onSave: () => void }) { return <div className="border-t border-base-border pt-5"><p className="text-sm font-semibold text-ink">Record bank transfer</p><div className="mt-3 space-y-3"><Field label="Amount"><input value={amount} onChange={(event) => onAmount(event.target.value)} inputMode="decimal" placeholder="0.00" className="field" /></Field><Field label="Reference"><input value={reference} onChange={(event) => onReference(event.target.value)} placeholder="Bank reference" className="field" /></Field><Field label="Proof (optional)"><input type="file" accept="application/pdf,image/png,image/jpeg,image/webp" onChange={(event: ChangeEvent<HTMLInputElement>) => onProof(event.target.files?.[0] ?? null)} className="block w-full text-xs text-ink-muted" />{proof && <p className="mt-1 text-xs text-ink-muted">{proof.name}</p>}</Field>{saving && <p role="status" className="text-xs text-ink-muted">{step}</p>}<button onClick={onSave} disabled={saving || !online} className="inline-flex min-h-11 w-full items-center justify-center gap-2 rounded-md bg-brand px-3 py-2.5 text-sm font-semibold text-white disabled:cursor-not-allowed disabled:opacity-60"><Send size={15} />{saving ? "Processing…" : "Record payment"}</button></div></div>; }

function AgentAcknowledgment({ payments, summary, acknowledging, online, onAcknowledge }: { payments: PayrollSummary["payments"]; summary: PayrollSummary; acknowledging: string; online: boolean; onAcknowledge: (paymentId: string, outcome: "received_full" | "not_received" | "received_different", actualAmount?: number, explanation?: string) => void }) {
  const [differentPaymentId, setDifferentPaymentId] = useState("");
  const [actualAmount, setActualAmount] = useState("");
  const [explanation, setExplanation] = useState("");
  if (!payments.length) return <div className="border-t border-base-border pt-5"><p className="text-sm font-semibold text-ink">Transfer status</p><p className="mt-2 rounded-md bg-base-raised px-3 py-3 text-sm text-ink-muted">No transfer has been recorded for this invoice.</p></div>;
  return <div className="border-t border-base-border pt-5"><p className="text-sm font-semibold text-ink">Transfer status</p>{payments.map((payment) => {
    const acknowledgment = summary.acknowledgments.find((item) => item.payment_id === payment.id);
    const amount = Number(actualAmount);
    return <div key={payment.id} className="mt-3 rounded-md border border-base-border p-3"><div className="flex items-center justify-between gap-3"><p className="font-medium text-ink">{money(payment.amount)}</p>{acknowledgment && <span className="inline-flex items-center gap-1 text-xs font-medium text-ink-muted"><CheckCircle2 size={14} />{label(acknowledgment.outcome)}</span>}</div>
      {payment.status === "reversed" && <p className="mt-2 text-xs font-medium text-danger">This transfer was reversed and cannot be acknowledged.</p>}
      {!acknowledgment && payment.status === "recorded" && <div className="mt-3 grid grid-cols-2 gap-2"><button disabled={!online || acknowledging === payment.id} onClick={() => onAcknowledge(payment.id, "received_full")} className="min-h-11 rounded-md bg-emerald-600 px-2 py-2 text-xs font-semibold text-white disabled:opacity-60">Received full</button><button disabled={!online || acknowledging === payment.id} onClick={() => onAcknowledge(payment.id, "not_received")} className="min-h-11 rounded-md border border-base-border px-2 py-2 text-xs font-semibold text-ink disabled:opacity-50">Not received</button><button type="button" disabled={!online} onClick={() => setDifferentPaymentId(differentPaymentId === payment.id ? "" : payment.id)} className="col-span-2 min-h-11 rounded-md border border-base-border px-2 py-2 text-xs font-semibold text-ink disabled:opacity-50">Received different amount</button></div>}
      {!acknowledgment && payment.status === "recorded" && differentPaymentId === payment.id && <div className="mt-3 space-y-2"><Field label="Amount received"><input type="number" min="0" step="0.01" value={actualAmount} onChange={(event) => setActualAmount(event.target.value)} inputMode="decimal" className="field" /></Field><Field label="What differs"><textarea value={explanation} onChange={(event) => setExplanation(event.target.value)} maxLength={500} className="field min-h-20" /></Field><button type="button" disabled={!online || acknowledging === payment.id || !Number.isFinite(amount) || amount < 0 || !actualAmount || !explanation.trim()} onClick={() => onAcknowledge(payment.id, "received_different", amount, explanation.trim())} className="min-h-11 w-full rounded-md bg-brand px-3 text-sm font-semibold text-white disabled:opacity-50">Submit difference</button></div>}
    </div>;
  })}</div>;
}
