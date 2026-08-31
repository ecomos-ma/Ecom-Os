import {
  CalendarClock,
  Check,
  CheckCircle2,
  Clipboard,
  Clock3,
  Copy,
  ExternalLink,
  FileText,
  History,
  LoaderCircle,
  MessageCircle,
  Package,
  Phone,
  Plus,
  Save,
  UserRound,
  X,
} from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import { StatusBadge } from "../../components/StatusBadge";
import { StatusSelect } from "../../components/StatusSelect";
import { toast } from "../../components/Toast";
import { normalizeStatus, type StatusLanguage } from "../../lib/statusEngine";
import {
  addConfirmationActivity,
  addConfirmationNote,
  assignConfirmationOrder,
  completeConfirmationCallback,
  getConfirmationOrderDetails,
  getConfirmationRecordingUrl,
  scheduleConfirmationCallback,
  uploadConfirmationRecording,
} from "../../services/confirmationCrmService";
import { CallRecorder, SecureRecordingPlayer } from "./CallRecorder";
import type {
  ConfirmationAgent,
  ConfirmationOrder,
  ConfirmationOrderDetails,
  ConfirmationRecording,
} from "./types";
import { useI18n } from "../../i18n";

type DrawerTab = "overview" | "history" | "calls";

function age(value: string) {
  const milliseconds = Date.now() - new Date(value).getTime();
  const hours = Math.max(0, Math.floor(milliseconds / 3_600_000));
  return hours < 24 ? `${hours || 1}h old` : `${Math.floor(hours / 24)}d old`;
}

function toLocalDateTimeInput(date: Date) {
  const offset = date.getTimezoneOffset() * 60_000;
  return new Date(date.getTime() - offset).toISOString().slice(0, 16);
}

function phoneForWhatsApp(phone: string | null) {
  const digits = (phone || "").replace(/\D/g, "");
  if (digits.startsWith("0") && digits.length === 10) return `212${digits.slice(1)}`;
  if (digits.length === 9 && /^[67]/.test(digits)) return `212${digits}`;
  return digits;
}

function ConfirmationMethodBadge({ method }: { method: string | null | undefined }) {
  if (!method) return null;
  if (method === 'whatsapp') return <span className="inline-flex items-center gap-1 w-fit whitespace-nowrap rounded-md bg-[#25D366]/10 px-2 py-1 text-[11px] font-semibold text-[#25D366]" title="Confirmed via WhatsApp"><MessageCircle size={12} /></span>;
  if (method === 'call') return <span className="inline-flex items-center gap-1 w-fit whitespace-nowrap rounded-md bg-blue-500/10 px-2 py-1 text-[11px] font-semibold text-blue-500" title="Confirmed via phone call"><Phone size={12} /></span>;
  return null;
}

function RecordingAccess({
  recording,
  url,
  onLoad,
}: {
  recording: ConfirmationRecording;
  url?: string;
  onLoad: () => void;
}) {
  const expired = Boolean(
    recording.expiredAt
    || !recording.storagePath
    || (recording.expiresAt && new Date(recording.expiresAt).getTime() <= Date.now())
  );
  if (expired) {
    return <span className="rounded-lg bg-base-raised px-2.5 py-1.5 text-[11px] font-medium text-ink-muted">Recording expired after 7 days</span>;
  }
  if (url) return <SecureRecordingPlayer src={url} durationSeconds={recording.durationSeconds} />;
  return <button onClick={onLoad} className="inline-flex items-center gap-1.5 rounded-lg border border-base-border bg-base-raised px-2.5 py-1.5 text-[11px] font-semibold text-ink hover:border-brand/30"><Clock3 size={12} /> Load securely</button>;
}

export function ConfirmationOrderDrawer({
  workspaceId,
  userId,
  order,
  agents,
  canManage,
  language,
  onClose,
  onOrderSaved,
  onSaveStatus,
  onOpenRelatedOrder,
  onSaveAndNext,
}: {
  workspaceId: string;
  userId: string;
  order: ConfirmationOrder;
  agents: ConfirmationAgent[];
  canManage: boolean;
  language: StatusLanguage;
  onClose: () => void;
  onOrderSaved: () => Promise<void>;
  onSaveStatus: (status: string) => Promise<void>;
  onOpenRelatedOrder: (orderId: string) => void;
  onSaveAndNext: () => void;
}) {
  const { formatCurrency, formatDateTime } = useI18n();
  const money = (value: number) => formatCurrency(Number(value || 0));
  const dateTime = (value: string | null | undefined) => value ? formatDateTime(value) : "—";
  const [tab, setTab] = useState<DrawerTab>("overview");
  const [details, setDetails] = useState<ConfirmationOrderDetails | null>(null);
  const [loadingDetails, setLoadingDetails] = useState(true);
  const [detailsError, setDetailsError] = useState<string | null>(null);
  const [status, setStatus] = useState(normalizeStatus(order.status));
  const [savingStatus, setSavingStatus] = useState(false);
  const [note, setNote] = useState("");
  const [savingNote, setSavingNote] = useState(false);
  const [callbackAt, setCallbackAt] = useState(() => {
    const nextHour = new Date(Date.now() + 60 * 60 * 1000);
    nextHour.setMinutes(0, 0, 0);
    return toLocalDateTimeInput(nextHour);
  });
  const [callbackNote, setCallbackNote] = useState("");
  const [savingCallback, setSavingCallback] = useState(false);
  const [assignment, setAssignment] = useState(order.assignedAgent?.id || "");
  const [savingAssignment, setSavingAssignment] = useState(false);
  const [recordingUrls, setRecordingUrls] = useState<Record<string, string>>({});

  const refreshDetails = async () => {
    setLoadingDetails(true);
    setDetailsError(null);
    try {
      const nextDetails = await getConfirmationOrderDetails(workspaceId, order);
      setDetails(nextDetails);
    } catch (error: any) {
      setDetailsError(error?.message || "Could not load this order’s CRM details.");
    } finally {
      setLoadingDetails(false);
    }
  };

  useEffect(() => {
    setStatus(normalizeStatus(order.status));
    setAssignment(order.assignedAgent?.id || "");
    setTab("overview");
    setRecordingUrls({});
    void refreshDetails();
  }, [order.id]);

  useEffect(() => {
    const closeOnEscape = (event: KeyboardEvent) => {
      if (event.key === "Escape") onClose();
    };
    document.addEventListener("keydown", closeOnEscape);
    return () => document.removeEventListener("keydown", closeOnEscape);
  }, [onClose]);

  const activeCallback = useMemo(
    () => details?.callbacks.find((callback) => callback.status === "scheduled") ?? null,
    [details]
  );

  const saveStatus = async (andNext = false) => {
    if (savingStatus) return;
    setSavingStatus(true);
    try {
      await onSaveStatus(status);
      toast.success("Confirmation status saved.");
      await Promise.all([refreshDetails(), onOrderSaved()]);
      if (andNext) onSaveAndNext();
    } catch (error: any) {
      toast.error(error?.message || "Could not save the confirmation status.");
      setStatus(normalizeStatus(order.status));
    } finally {
      setSavingStatus(false);
    }
  };

  const addNote = async () => {
    if (savingNote || !note.trim()) return;
    setSavingNote(true);
    try {
      await addConfirmationNote(workspaceId, order, userId, note);
      setNote("");
      toast.success("Note added to the order timeline.");
      await Promise.all([refreshDetails(), onOrderSaved()]);
    } catch (error: any) {
      toast.error(error?.message || "Could not save this note.");
    } finally {
      setSavingNote(false);
    }
  };

  const scheduleCallback = async () => {
    if (savingCallback) return;
    setSavingCallback(true);
    try {
      await scheduleConfirmationCallback(workspaceId, order, userId, callbackAt, callbackNote);
      setCallbackNote("");
      toast.success("Callback scheduled.");
      await Promise.all([refreshDetails(), onOrderSaved()]);
    } catch (error: any) {
      toast.error(error?.message || "Could not schedule this callback.");
    } finally {
      setSavingCallback(false);
    }
  };

  const completeCallback = async (callbackId: string) => {
    try {
      await completeConfirmationCallback(workspaceId, order, userId, callbackId);
      toast.success("Callback marked complete.");
      await Promise.all([refreshDetails(), onOrderSaved()]);
    } catch (error: any) {
      toast.error(error?.message || "Could not complete this callback.");
    }
  };

  const saveAssignment = async () => {
    if (!assignment || assignment === order.assignedAgent?.id || savingAssignment) return;
    setSavingAssignment(true);
    try {
      await assignConfirmationOrder(workspaceId, order, assignment, userId);
      toast.success("Confirmation agent assigned.");
      await onOrderSaved();
    } catch (error: any) {
      toast.error(error?.message || "Could not assign this order.");
      setAssignment(order.assignedAgent?.id || "");
    } finally {
      setSavingAssignment(false);
    }
  };

  const copyPhone = async () => {
    if (!order.phone) return;
    try {
      await navigator.clipboard.writeText(order.phone);
      toast.success("Phone number copied.");
    } catch {
      toast.error("Could not copy the phone number.");
    }
  };

  const startPhoneCall = async () => {
    if (!order.phone) return;
    try {
      await addConfirmationActivity(workspaceId, order, userId, "CALL_STARTED", { source: "device_phone_handler" });
    } catch {
      // A supported phone action remains available even if the non-critical audit insert fails.
    }
    window.location.href = `tel:${order.phone}`;
  };

  const saveRecording = async ({ recordingId, blob, startedAt, endedAt }: { recordingId: string; blob: Blob; startedAt: Date; endedAt: Date }) => {
    await uploadConfirmationRecording(workspaceId, order, userId, blob, startedAt, endedAt, recordingId);
    toast.success("Recording saved securely.");
    await Promise.all([refreshDetails(), onOrderSaved()]);
  };

  const loadRecording = async (recording: ConfirmationRecording) => {
    if (recordingUrls[recording.id]) return;
    try {
      const signedUrl = await getConfirmationRecordingUrl(recording);
      setRecordingUrls((current) => ({ ...current, [recording.id]: signedUrl }));
    } catch (error: any) {
      toast.error(error?.message || "Could not open this recording.");
    }
  };

  return (
    <div className="fixed inset-0 z-[70] flex justify-end bg-ink/25 backdrop-blur-[1px] max-md:items-end" role="dialog" aria-modal="true" aria-label={`Confirmation CRM for ${order.orderNumber}`}>
      <button onClick={onClose} aria-label="Close order drawer" className="absolute inset-0 cursor-default" />
      <aside className="relative flex h-full w-full max-w-[850px] flex-col border-l border-base-border bg-base-surface shadow-2xl max-md:mt-[calc(env(safe-area-inset-top)+.75rem)] max-md:h-[calc(100dvh-env(safe-area-inset-top)-.75rem)] max-md:max-w-none max-md:rounded-t-[28px] max-md:border-l-0 max-md:border-t max-md:pb-[env(safe-area-inset-bottom)]">
        <header className="shrink-0 border-b border-base-border bg-base-surface px-5 py-4 max-md:px-4">
          <div className="flex items-start justify-between gap-3">
            <div className="min-w-0">
              <div className="flex flex-wrap items-center gap-2">
                <h2 className="truncate text-[18px] font-semibold text-ink">{order.customerName}</h2>
                <StatusBadge status={order.status} size="sm" />
                <ConfirmationMethodBadge method={(order as any).confirmation_method} />
              </div>
              <div className="mt-1 flex flex-wrap items-center gap-x-3 gap-y-1 text-[11.5px] text-ink-muted">
                <span className="font-mono font-semibold text-ink">#{order.orderNumber}</span>
                <span>{order.city || "City unavailable"}</span>
                <span>{age(order.createdAt)}</span>
                <span>{money(order.total)}</span>
              </div>
            </div>
            <button onClick={onClose} className="rounded-xl p-2 text-ink-muted transition-colors hover:bg-base-raised hover:text-ink"><X size={18} /></button>
          </div>
          <div className="mt-3 flex flex-wrap items-center gap-2">
            <button onClick={() => void startPhoneCall()} disabled={!order.phone} className="inline-flex min-h-11 items-center gap-1.5 rounded-lg bg-brand px-3 py-2 text-[11.5px] font-semibold text-white shadow-sm hover:bg-brand/90 disabled:cursor-not-allowed disabled:opacity-50 max-md:flex-1 max-md:justify-center"><Phone size={13} /> Call customer</button>
            <a href={order.phone ? `https://wa.me/${phoneForWhatsApp(order.phone)}` : undefined} target="_blank" rel="noreferrer" onClick={(event) => { if (!order.phone) event.preventDefault(); }} className="inline-flex min-h-11 items-center gap-1.5 rounded-lg border border-base-border bg-base-raised px-3 py-2 text-[11.5px] font-semibold text-ink hover:border-brand/25 disabled:opacity-50 max-md:flex-1 max-md:justify-center"><MessageCircle size={13} className="text-emerald-500" /> WhatsApp</a>
            <button onClick={() => void copyPhone()} disabled={!order.phone} className="inline-flex min-h-11 items-center gap-1.5 rounded-lg border border-base-border bg-base-raised px-3 py-2 text-[11.5px] font-semibold text-ink hover:border-brand/25 disabled:opacity-50 max-md:flex-1 max-md:justify-center"><Copy size={13} /> Copy phone</button>
            {activeCallback && <span className="inline-flex items-center gap-1.5 rounded-lg bg-violet-500/10 px-2.5 py-2 text-[11px] font-semibold text-violet-600 dark:text-violet-300"><CalendarClock size={13} /> Callback {dateTime(activeCallback.scheduledAt)}</span>}
          </div>
        </header>

        <nav className="flex shrink-0 gap-1 border-b border-base-border px-5 max-md:px-4">
          {([
            ["overview", "Overview", Clipboard],
            ["history", "History", History],
            ["calls", "Calls", Phone],
          ] as const).map(([id, label, Icon]) => (
            <button key={id} onClick={() => setTab(id)} className={`inline-flex items-center gap-1.5 border-b-2 px-3 py-3 text-[12px] font-semibold transition-colors ${tab === id ? "border-brand text-brand" : "border-transparent text-ink-muted hover:text-ink"}`}><Icon size={13} /> {label}</button>
          ))}
        </nav>

        <div className="min-h-0 flex-1 overflow-y-auto px-5 py-5 max-md:px-4 max-md:pb-[calc(1.25rem+env(safe-area-inset-bottom))]">
          {tab === "overview" && (
            <div className="space-y-5">
              <section className="grid gap-3 md:grid-cols-[1.1fr_0.9fr]">
                <div className="rounded-2xl bg-base-raised/65 p-4">
                  <div className="text-[10.5px] font-semibold uppercase tracking-[0.08em] text-ink-muted">Confirmation outcome</div>
                  <div className="mt-2 flex gap-2">
                    <StatusSelect value={status} onChange={setStatus} language={language} disabled={savingStatus} className="min-w-0 flex-1" />
                    <button onClick={() => void saveStatus(false)} disabled={savingStatus || status === normalizeStatus(order.status)} className="inline-flex items-center gap-1.5 rounded-lg bg-brand px-3 py-2 text-[11.5px] font-semibold text-white disabled:cursor-not-allowed disabled:opacity-45"><Save size={13} /> {savingStatus ? "Saving" : "Save"}</button>
                  </div>
                  <button onClick={() => void saveStatus(true)} disabled={savingStatus} className="mt-2 inline-flex w-full items-center justify-center gap-1.5 rounded-lg border border-brand/25 bg-brand/10 px-3 py-2 text-[11.5px] font-semibold text-brand hover:bg-brand/15 disabled:opacity-50"><CheckCircle2 size={13} /> Save & next</button>
                </div>
                <div className="rounded-2xl border border-base-border p-4">
                  <div className="text-[10.5px] font-semibold uppercase tracking-[0.08em] text-ink-muted">Customer</div>
                  <div className="mt-2 flex items-center gap-2 text-[12px] text-ink"><UserRound size={14} className="text-ink-muted" /> {order.customerName}</div>
                  <div className="mt-1.5 flex items-center gap-2 text-[12px] text-ink"><Phone size={14} className="text-ink-muted" /> {order.phone || "No phone"}</div>
                  <div className="mt-1.5 flex items-start gap-2 text-[12px] text-ink"><ExternalLink size={14} className="mt-0.5 shrink-0 text-ink-muted" /> <span>{order.address || order.city || "No address saved"}</span></div>
                </div>
              </section>

              <section>
                <div className="mb-2 flex items-center justify-between"><h3 className="text-[13px] font-semibold text-ink">Ordered products</h3><span className="text-[11px] text-ink-muted">{order.products.length} item{order.products.length === 1 ? "" : "s"}</span></div>
                <div className="space-y-2">
                  {order.products.map((product, index) => (
                    <div key={`${product.id || product.sku || product.name}-${index}`} className="flex gap-3 rounded-2xl border border-base-border bg-base-surface p-3">
                      <div className="h-20 w-20 shrink-0 overflow-hidden rounded-xl bg-base-raised">
                        {product.imageUrl ? <img src={product.imageUrl} alt={product.name} className="h-full w-full object-cover" /> : <span className="flex h-full w-full items-center justify-center text-ink-faint"><Package size={20} /></span>}
                      </div>
                      <div className="min-w-0 flex-1">
                        <div className="truncate text-[13px] font-semibold text-ink">{product.name}</div>
                        <div className="mt-1 flex flex-wrap gap-x-3 gap-y-1 text-[11px] text-ink-muted"><span>SKU: {product.sku || "—"}</span>{product.variant && <span>{product.variant}</span>}{product.stock !== null && <span>Stock: {product.stock}</span>}</div>
                        <div className="mt-3 flex items-center justify-between text-[12px]"><span className="text-ink-muted">Qty {product.quantity} × {money(product.unitPrice)}</span><span className="font-mono font-bold text-ink">{money(product.quantity * product.unitPrice)}</span></div>
                      </div>
                    </div>
                  ))}
                </div>
              </section>

              {canManage && (
                <section className="rounded-2xl border border-base-border p-3.5">
                  <div className="flex flex-wrap items-end gap-2">
                    <div className="min-w-[190px] flex-1"><label className="text-[10.5px] font-semibold uppercase tracking-[0.08em] text-ink-muted">Assigned confirmation agent</label><select value={assignment} onChange={(event) => setAssignment(event.target.value)} className="mt-1.5 w-full rounded-lg border border-base-border bg-base-raised px-3 py-2 text-[12px] text-ink focus:border-brand/50 focus:outline-none"><option value="">Unassigned</option>{agents.map((agent) => <option key={agent.id} value={agent.id}>{agent.fullName}</option>)}</select></div>
                    <button onClick={() => void saveAssignment()} disabled={!assignment || assignment === order.assignedAgent?.id || savingAssignment} className="rounded-lg border border-base-border bg-base-raised px-3 py-2 text-[11.5px] font-semibold text-ink hover:border-brand/30 disabled:opacity-45">{savingAssignment ? "Saving" : "Assign"}</button>
                  </div>
                </section>
              )}

              <section className="grid gap-3 md:grid-cols-2">
                <div className="rounded-2xl border border-base-border p-3.5">
                  <div className="flex items-center gap-2 text-[12.5px] font-semibold text-ink"><CalendarClock size={15} className="text-violet-500" /> Schedule callback</div>
                  <input type="datetime-local" value={callbackAt} onChange={(event) => setCallbackAt(event.target.value)} className="mt-3 w-full rounded-lg border border-base-border bg-base-raised px-3 py-2 text-[12px] text-ink focus:border-brand/50 focus:outline-none" />
                  <input value={callbackNote} onChange={(event) => setCallbackNote(event.target.value)} placeholder="Optional callback note" className="mt-2 w-full rounded-lg border border-base-border bg-base-raised px-3 py-2 text-[12px] text-ink placeholder:text-ink-faint focus:border-brand/50 focus:outline-none" />
                  <button onClick={() => void scheduleCallback()} disabled={savingCallback} className="mt-2 inline-flex items-center gap-1.5 rounded-lg bg-violet-500 px-3 py-2 text-[11.5px] font-semibold text-white hover:bg-violet-600 disabled:opacity-50"><Plus size={13} /> {savingCallback ? "Scheduling" : "Schedule callback"}</button>
                  {activeCallback && <button onClick={() => void completeCallback(activeCallback.id)} className="ml-2 mt-2 inline-flex items-center gap-1.5 rounded-lg border border-emerald-500/25 bg-emerald-500/10 px-3 py-2 text-[11.5px] font-semibold text-emerald-600 dark:text-emerald-300"><Check size={13} /> Complete</button>}
                </div>
                <div className="rounded-2xl border border-base-border p-3.5">
                  <div className="flex items-center gap-2 text-[12.5px] font-semibold text-ink"><FileText size={15} className="text-brand" /> Agent notes</div>
                  <textarea value={note} onChange={(event) => setNote(event.target.value)} placeholder="Add a useful confirmation note…" rows={3} className="mt-3 w-full resize-none rounded-lg border border-base-border bg-base-raised px-3 py-2 text-[12px] text-ink placeholder:text-ink-faint focus:border-brand/50 focus:outline-none" />
                  <button onClick={() => void addNote()} disabled={savingNote || !note.trim()} className="mt-2 inline-flex items-center gap-1.5 rounded-lg bg-brand px-3 py-2 text-[11.5px] font-semibold text-white disabled:opacity-50"><Plus size={13} /> {savingNote ? "Saving" : "Add note"}</button>
                </div>
              </section>

              <section>
                <h3 className="mb-2 text-[13px] font-semibold text-ink">Recent notes</h3>
                {loadingDetails ? <div className="h-20 animate-pulse rounded-2xl bg-base-raised" /> : details?.notes.length ? <div className="space-y-2">{details.notes.slice(0, 3).map((item) => <div key={item.id} className="rounded-xl bg-base-raised/65 p-3"><p className="text-[12px] leading-relaxed text-ink">{item.body}</p><p className="mt-1.5 text-[10.5px] text-ink-muted">{item.authorName || "Agent"} · {dateTime(item.createdAt)}</p></div>)}</div> : <p className="rounded-xl bg-base-raised/45 px-3 py-4 text-[11.5px] text-ink-muted">No notes have been added yet.</p>}
              </section>
            </div>
          )}

          {tab === "history" && (
            <div className="space-y-5">
              <section>
                <div className="mb-2 flex items-center justify-between"><h3 className="text-[13px] font-semibold text-ink">Customer history</h3><span className="text-[11px] text-ink-muted">Same customer ID or normalized phone</span></div>
                {loadingDetails ? <div className="h-28 animate-pulse rounded-2xl bg-base-raised" /> : details?.history.length ? <div className="space-y-2">{details.history.map((historicOrder) => <button key={historicOrder.id} onClick={() => onOpenRelatedOrder(historicOrder.id)} className="flex w-full items-center justify-between gap-3 rounded-xl border border-base-border p-3 text-left transition-colors hover:border-brand/30 hover:bg-base-raised/50"><div className="min-w-0"><div className="font-mono text-[12px] font-bold text-ink">#{historicOrder.orderNumber}</div><div className="mt-0.5 truncate text-[11px] text-ink-muted">{historicOrder.productVariant || historicOrder.sku || "Product unavailable"} · {dateTime(historicOrder.createdAt)}</div></div><div className="flex shrink-0 items-center gap-2"><span className="font-mono text-[11px] font-semibold text-ink">{money(historicOrder.total)}</span><StatusBadge status={historicOrder.status} size="sm" /></div></button>)}</div> : <p className="rounded-xl bg-base-raised/45 px-3 py-4 text-[11.5px] text-ink-muted">No prior workspace orders were found for this customer.</p>}
              </section>
              <section>
                <h3 className="mb-2 text-[13px] font-semibold text-ink">Order timeline</h3>
                {loadingDetails ? <div className="h-40 animate-pulse rounded-2xl bg-base-raised" /> : details?.timeline.length ? <div className="space-y-0">{details.timeline.map((entry, index) => <div key={entry.id} className="relative flex gap-3 pb-4 last:pb-0"><div className="flex flex-col items-center"><span className="mt-0.5 h-2.5 w-2.5 rounded-full bg-brand ring-4 ring-brand/10" />{index < details.timeline.length - 1 && <span className="mt-1 h-full w-px bg-base-border" />}</div><div className="min-w-0 pb-0.5"><div className="text-[12px] font-medium text-ink">{entry.actorName ? `${entry.actorName} · ` : ""}{entry.text}</div>{entry.previousValue !== null && entry.nextValue !== null && <div className="mt-0.5 text-[11px] text-ink-muted">{entry.previousValue} → {entry.nextValue}</div>}<div className="mt-1 text-[10.5px] text-ink-faint">{dateTime(entry.createdAt)}</div></div></div>)}</div> : <p className="rounded-xl bg-base-raised/45 px-3 py-4 text-[11.5px] text-ink-muted">No confirmation activity has been recorded yet.</p>}
              </section>
            </div>
          )}

          {tab === "calls" && (
            <div className="space-y-5">
              <CallRecorder onUpload={saveRecording} onActivity={(activity, metadata) => addConfirmationActivity(workspaceId, order, userId, activity, metadata)} />
              <section>
                <div className="mb-2 flex items-center justify-between"><h3 className="text-[13px] font-semibold text-ink">Secure recordings</h3><span className="text-[11px] text-ink-muted">Owner/admin and recording agent only</span></div>
                {loadingDetails ? <div className="h-24 animate-pulse rounded-2xl bg-base-raised" /> : details?.recordings.length ? <div className="space-y-2">{details.recordings.map((recording) => <div key={recording.id} className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-base-border p-3"><div><div className="text-[12px] font-semibold text-ink">{recording.recordingSource === "browser_microphone" ? "Microphone recording" : "Provider recording"}</div><div className="mt-0.5 text-[10.5px] text-ink-muted">{recording.agentName || "Agent"} · {dateTime(recording.createdAt)}</div></div><RecordingAccess recording={recording} url={recordingUrls[recording.id]} onLoad={() => void loadRecording(recording)} /></div>)}</div> : <p className="rounded-xl bg-base-raised/45 px-3 py-4 text-[11.5px] text-ink-muted">No recordings have been saved for this order.</p>}
              </section>
            </div>
          )}

          {detailsError && <div className="mt-5 rounded-xl border border-danger/20 bg-danger/5 p-3 text-[11.5px] text-danger">{detailsError}</div>}
        </div>
      </aside>
    </div>
  );
}
