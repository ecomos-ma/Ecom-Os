import { CalendarDays, Headphones, RefreshCw, ShieldCheck } from "lucide-react";
import { useCallback, useEffect, useMemo, useState } from "react";
import { getConfirmationRecordingUrl } from "../../services/confirmationCrmService";
import { SecureRecordingPlayer } from "./CallRecorder";
import type { ConfirmationAgent, ConfirmationRecording } from "./types";
import { useI18n } from "../../i18n";

type ReviewRow = ConfirmationRecording & { orderNumber: string };

export function CallReviewPanel({
  workspaceId,
  agents,
  onOpenOrder,
}: {
  workspaceId: string;
  agents: ConfirmationAgent[];
  onOpenOrder: (orderId: string) => void;
}) {
  const { formatDateTime } = useI18n();
  const dateTime = (value: string) => formatDateTime(value);
  const [rows, setRows] = useState<ReviewRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [agentId, setAgentId] = useState("");
  const [urls, setUrls] = useState<Record<string, string>>({});

  const agentsById = useMemo(() => new Map(agents.map((agent) => [agent.id, agent])), [agents]);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const { supabase } = await import("../../lib/supabase");
      let query = supabase
        .from("confirmation_call_recordings")
        .select("id, order_id, storage_path, duration_seconds, mime_type, file_size, recording_source, started_at, ended_at, created_at, expires_at, expired_at, agent_id")
        .eq("workspace_id", workspaceId)
        .order("created_at", { ascending: false })
        .limit(100);
      if (agentId) query = query.eq("agent_id", agentId);
      const { data: recordings, error: recordingsError } = await query;
      if (recordingsError) throw recordingsError;
      const orderIds = Array.from(new Set((recordings ?? []).map((recording: any) => recording.order_id)));
      const { data: orders, error: ordersError } = orderIds.length
        ? await supabase.from("orders").select('"Order ID", order_number').eq("workspace_id", workspaceId).in("Order ID", orderIds)
        : { data: [], error: null };
      if (ordersError) throw ordersError;
      const orderNumbers = new Map((orders ?? []).map((order: any) => [order["Order ID"], order.order_number]));
      setRows((recordings ?? []).map((recording: any) => ({
        id: recording.id,
        orderId: recording.order_id,
        storagePath: recording.storage_path,
        durationSeconds: Number(recording.duration_seconds || 0),
        mimeType: recording.mime_type ?? null,
        fileSize: recording.file_size === null || recording.file_size === undefined ? null : Number(recording.file_size),
        recordingSource: recording.recording_source,
        startedAt: recording.started_at ?? null,
        endedAt: recording.ended_at ?? null,
        createdAt: recording.created_at,
        expiresAt: recording.expires_at ?? null,
        expiredAt: recording.expired_at ?? null,
        agentId: recording.agent_id,
        agentName: agentsById.get(recording.agent_id)?.fullName ?? "Agent",
        orderNumber: orderNumbers.get(recording.order_id) || recording.order_id,
      })));
    } catch (loadError: any) {
      setError(loadError?.message || "Could not load call recordings.");
    } finally {
      setLoading(false);
    }
  }, [workspaceId, agentId, agentsById]);

  useEffect(() => { void load(); }, [load]);

  const loadUrl = async (recording: ConfirmationRecording) => {
    if (urls[recording.id]) return;
    try {
      const url = await getConfirmationRecordingUrl(recording);
      setUrls((current) => ({ ...current, [recording.id]: url }));
    } catch (urlError: any) {
      setError(urlError?.message || "Could not open the recording securely.");
    }
  };

  return (
    <div className="overflow-hidden rounded-2xl border border-base-border bg-base-surface">
      <div className="flex flex-wrap items-center justify-between gap-3 border-b border-base-border px-5 py-4">
        <div className="flex items-center gap-2"><span className="flex h-8 w-8 items-center justify-center rounded-xl bg-violet-500/10 text-violet-500"><Headphones size={16} /></span><div><h2 className="text-[14px] font-semibold text-ink">Call review</h2><p className="text-[10.5px] text-ink-muted">Private recordings are limited to workspace managers and the recording agent.</p></div></div>
        <div className="flex items-center gap-2"><select value={agentId} onChange={(event) => setAgentId(event.target.value)} className="h-8 rounded-lg border border-base-border bg-base-raised px-2 text-[11px] text-ink outline-none"><option value="">All agents</option>{agents.map((agent) => <option key={agent.id} value={agent.id}>{agent.fullName}</option>)}</select><button onClick={() => void load()} className="rounded-lg border border-base-border bg-base-raised p-2 text-ink-muted hover:text-ink"><RefreshCw size={13} /></button></div>
      </div>
      {error && <div className="m-4 rounded-xl border border-danger/20 bg-danger/5 p-3 text-[11.5px] text-danger">{error}</div>}
      {loading ? <div className="space-y-px">{[...Array(4)].map((_, index) => <div key={index} className="h-16 animate-pulse bg-base-raised/40" />)}</div> : !rows.length ? <div className="px-6 py-14 text-center"><ShieldCheck size={28} className="mx-auto text-ink-faint" /><p className="mt-3 text-[12px] font-semibold text-ink">No accessible recordings yet</p><p className="mt-1 text-[11px] text-ink-muted">Recordings will appear after an agent explicitly records and securely saves permitted microphone audio.</p></div> : <div className="divide-y divide-base-border/60">{rows.map((recording) => <div key={recording.id} className="flex flex-wrap items-center justify-between gap-3 px-5 py-3"><div className="min-w-[190px]"><div className="text-[12px] font-semibold text-ink">{recording.agentName || "Agent"} <span className="font-normal text-ink-muted">· #{recording.orderNumber}</span></div><div className="mt-1 flex items-center gap-1.5 text-[10.5px] text-ink-muted"><CalendarDays size={11} /> {dateTime(recording.createdAt)} · {recording.recordingSource === "browser_microphone" ? "Microphone" : "Provider"}</div></div><div className="flex items-center gap-2">{recording.expiredAt || !recording.storagePath || (recording.expiresAt && new Date(recording.expiresAt).getTime() <= Date.now()) ? <span className="rounded-lg bg-base-raised px-2.5 py-1.5 text-[11px] text-ink-muted">Expired after 7 days</span> : urls[recording.id] ? <SecureRecordingPlayer src={urls[recording.id]} durationSeconds={recording.durationSeconds} /> : <button onClick={() => void loadUrl(recording)} className="rounded-lg border border-base-border bg-base-raised px-2.5 py-1.5 text-[11px] font-semibold text-ink hover:border-brand/30">Load securely</button>}<button onClick={() => onOpenOrder(recording.orderId)} className="rounded-lg border border-base-border bg-base-raised px-2.5 py-1.5 text-[11px] font-semibold text-ink hover:border-brand/30">View order</button></div></div>)}</div>}
    </div>
  );
}
