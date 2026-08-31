import { useCallback, useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import {
  Activity, Bot, CheckCircle2, Clock3, FileAudio, Headphones, Inbox,
  Loader2, MessageCircle, Mic, PauseCircle, PlayCircle, RefreshCw, Save,
  Send, ShieldCheck, Smartphone, Trash2, Upload, X,
} from "lucide-react";
import QRCode from "react-qr-code";
import { toast } from "../../../components/Toast";
import { useAuth } from "../../../hooks/useAuth";
import { supabase } from "../../../lib/supabase";
import { callWhatsAppWorker, connectWhatsApp, normalizeWhatsAppStatus, getWorkerHealth } from "../../../services/whatsappWorkerService";

// Use local worker in development
const useLocalWorker = import.meta.env.DEV;

const TABS = [
  ["connection", "Connection", Smartphone],
  ["automations", "Automations", Bot],
  ["confirmation", "Confirmation Messages", MessageCircle],
  ["delivery", "Delivery Messages", Send],
  ["audio", "Audio Recordings", Mic],
  ["replies", "Reply Actions", ShieldCheck],
  ["inbox", "Inbox", Inbox],
  ["schedule", "Sending Schedule", Clock3],
  ["logs", "Logs", Activity],
] as const;

type TabKey = typeof TABS[number][0];
type MessageStep = {
  id: string;
  type: "text" | "audio";
  text_template: string;
  audio_recording_id: string | null;
};
type Rule = {
  id?: string;
  event_type: "confirmation" | "delivery";
  enabled: boolean;
  status_source: "status" | "shipping_status" | "delivery_status" | "provider_status";
  trigger_statuses: string[];
  text_enabled: boolean;
  text_template: string;
  audio_enabled: boolean;
  audio_recording_id: string | null;
  fallback_text_enabled: boolean;
  fallback_text: string;
  channel_sequence: string[];
  message_steps: MessageStep[];
  delay_minutes: number;
  expires_after_minutes: number;
};
type ReplyAction = {
  id?: string;
  name: string;
  action_type: "confirm_order" | "set_order_status" | "request_callback" | "cancel_order" | "add_note" | "opt_out" | "reply_only";
  target_status?: string | null;
  priority: number;
  enabled: boolean;
  keywords: string[];
  response_template: string;
};

const CONFIRMATION_TEMPLATE = `السلام عليكم {{customer_name}} 👋

توصلنا بالطلب ديالك رقم {{order_number}} ✅

🛍 الطلب:
{{products}}

💰 المجموع: {{total}} DH
📍 المدينة: {{city}}

باش تأكد الطلب جاوب بـ 1
إلا بغيتي نعيطو ليك جاوب بـ 2`;

const DELIVERY_TEMPLATE = `السلام عليكم {{customer_name}} 👋

الطلب ديالك رقم {{order_number}} خرج للتوصيل 🚚
شركة التوصيل: {{shipping_company}}
رقم التتبع: {{tracking_number}}
المجموع: {{total}} DH`;

const DEFAULT_SETTINGS = {
  enabled: false,
  connection_status: "disconnected",
  connected_phone: null as string | null,
  timezone: "Africa/Casablanca",
  active_days: [0, 1, 2, 3, 4, 5, 6],
  quiet_hours_start: "22:00",
  quiet_hours_end: "08:00",
  minimum_interval_seconds: 5,
  hourly_rate_limit: 120,
  daily_rate_limit: 1000,
  retry_base_seconds: 60,
  retry_max_seconds: 3600,
  reply_context_hours: 72,
  callback_delay_minutes: 15,
  worker_last_seen_at: null as string | null,
  worker_version: null as string | null,
};

const DEFAULT_RULES: Record<Rule["event_type"], Rule> = {
  confirmation: {
    event_type: "confirmation", enabled: false, status_source: "status", trigger_statuses: ["pending", "new"],
    text_enabled: true, text_template: CONFIRMATION_TEMPLATE, audio_enabled: false, audio_recording_id: null,
    fallback_text_enabled: true, fallback_text: CONFIRMATION_TEMPLATE, channel_sequence: ["text"],
    message_steps: [{ id: "confirmation-text-1", type: "text", text_template: CONFIRMATION_TEMPLATE, audio_recording_id: null }], delay_minutes: 0, expires_after_minutes: 1440,
  },
  delivery: {
    event_type: "delivery", enabled: false, status_source: "shipping_status", trigger_statuses: ["OUT_FOR_DELIVERY"],
    text_enabled: true, text_template: DELIVERY_TEMPLATE, audio_enabled: false, audio_recording_id: null,
    fallback_text_enabled: true, fallback_text: DELIVERY_TEMPLATE, channel_sequence: ["text"],
    message_steps: [{ id: "delivery-text-1", type: "text", text_template: DELIVERY_TEMPLATE, audio_recording_id: null }], delay_minutes: 0, expires_after_minutes: 1440,
  },
};

const DEFAULT_ACTIONS: ReplyAction[] = [
  { id: "new_confirm", name: "Confirm order", action_type: "confirm_order", priority: 10, enabled: true, keywords: ["1", "1️⃣", "نعم", "confirm", "confirmer"], response_template: "شكراً {{customer_name}} ✅ تم تأكيد الطلب ديالك رقم {{order_number}}." },
  { id: "new_callback", name: "Request callback", action_type: "request_callback", priority: 20, enabled: true, keywords: ["2", "2️⃣", "عيط ليا", "اتصل بي", "callback", "rappel"], response_template: "توصلنا بطلب الاتصال ديالك 👍 غادي يعيط ليك الفريق قريباً." },
  { id: "new_opt_out", name: "Stop / Opt Out", action_type: "opt_out", priority: 0, enabled: true, keywords: ["stop", "توقف", "حبس", "désabonner"], response_template: "تم إيقاف رسائل واتساب لهاد الرقم. شكراً." },
];


const VARIABLES = ["customer_name", "order_number", "products", "total", "city", "phone", "address", "shipping_company", "tracking_number", "workspace_name", "status", "current_date", "current_time"];
const DAY_LABELS = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];

function messageStepsFor(rule: Partial<Rule>): MessageStep[] {
  const configured = Array.isArray(rule.message_steps)
    ? rule.message_steps.filter((step): step is MessageStep => Boolean(step) && (step.type === "text" || step.type === "audio"))
    : [];
  if (configured.length) return configured.map((step, index) => ({
    id: step.id || `${step.type}-${index + 1}`,
    type: step.type,
    text_template: step.text_template || "",
    audio_recording_id: step.audio_recording_id || null,
  }));

  const sequence = Array.isArray(rule.channel_sequence) && rule.channel_sequence.length ? rule.channel_sequence : ["text"];
  return sequence.filter((type): type is MessageStep["type"] => type === "text" || type === "audio").map((type, index) => ({
    id: `${type}-${index + 1}`,
    type,
    text_template: type === "text" ? (rule.text_template || "") : "",
    audio_recording_id: type === "audio" ? (rule.audio_recording_id || null) : null,
  }));
}

function FieldLabel({ children }: { children: ReactNode }) {
  return <label className="mb-1.5 block text-[12px] font-semibold text-ink">{children}</label>;
}

function Toggle({ checked, onChange, label, description }: { checked: boolean; onChange: (value: boolean) => void; label: string; description?: string }) {
  return (
    <label className="flex cursor-pointer items-center justify-between gap-4 rounded-xl border border-base-border bg-base-raised/30 p-4">
      <span><span className="block text-[13px] font-semibold text-ink">{label}</span>{description && <span className="mt-0.5 block text-[11.5px] text-ink-muted">{description}</span>}</span>
      <input type="checkbox" checked={checked} onChange={(event) => onChange(event.target.checked)} className="h-4 w-4 accent-[#25D366]" />
    </label>
  );
}

function TemplateEditor({ value, onChange }: { value: string; onChange: (value: string) => void }) {
  const [preview, setPreview] = useState(false);
  const rendered = value
    .replace(/{{customer_name}}/g, "Amine").replace(/{{order_number}}/g, "#500")
    .replace(/{{products}}/g, "• Abaya × 1").replace(/{{total}}/g, "349")
    .replace(/{{city}}/g, "Casablanca").replace(/{{tracking_number}}/g, "TRK-12345")
    .replace(/{{shipping_company}}/g, "Ameex");
  return (
    <div>
      <div className="mb-2 flex justify-end"><button onClick={() => setPreview((current) => !current)} className="text-[12px] font-semibold text-brand">{preview ? "Edit" : "Preview"}</button></div>
      {preview ? <div className="min-h-[180px] whitespace-pre-wrap rounded-xl border border-[#25D366]/20 bg-[#25D366]/5 p-4 text-[13px] leading-relaxed">{rendered}</div> :
        <textarea value={value} onChange={(event) => onChange(event.target.value)} className="h-[220px] w-full resize-y rounded-xl border border-base-border bg-base-raised/30 p-4 font-mono text-[13px] outline-none focus:border-brand/40" />}
      <div className="mt-3 rounded-xl border border-base-border bg-base-raised/20 p-2.5"><div className="mb-2 text-[10px] font-bold uppercase tracking-wide text-ink-muted">Insert order details</div><div className="flex flex-wrap gap-2">{VARIABLES.map((name) => <button key={name} onClick={() => onChange(`${value}${value.endsWith(" ") || !value ? "" : " "}{{${name}}}`)} className="min-h-8 rounded-lg border border-base-border bg-base-surface px-2.5 py-1 text-[10.5px] font-medium text-ink-muted hover:border-[#25D366]/40 hover:text-[#159447]">+ {`{{${name}}}`}</button>)}</div></div>
    </div>
  );
}

export default function WhatsAppSettingsModal({ isOpen, onClose, initialSettings }: { isOpen: boolean; onClose: () => void; initialSettings?: Record<string, unknown> | null }) {
  const { workspace, session } = useAuth();
  const [tab, setTab] = useState<TabKey>("connection");
  const [settings, setSettings] = useState<any>({ ...DEFAULT_SETTINGS, ...(initialSettings || {}) });
  const [rules, setRules] = useState<Record<Rule["event_type"], Rule>>(DEFAULT_RULES);
  const [actions, setActions] = useState<ReplyAction[]>([...DEFAULT_ACTIONS]);
  const [deletedActionIds, setDeletedActionIds] = useState<string[]>([]);
  const [orderStatuses, setOrderStatuses] = useState<any[]>([]);
  const [recordings, setRecordings] = useState<any[]>([]);
  const [logs, setLogs] = useState<any[]>([]);
  const [inboxMessages, setInboxMessages] = useState<any[]>([]);
  const [qrCode, setQrCode] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [loading, setLoading] = useState(true);
  const [modalError, setModalError] = useState<string | null>(null);
  const [testPhone, setTestPhone] = useState("");
  const [recording, setRecording] = useState(false);
  const [recordedBlob, setRecordedBlob] = useState<Blob | null>(null);
  const [recordedUrl, setRecordedUrl] = useState<string | null>(null);
  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const chunksRef = useRef<Blob[]>([]);
  const [editingAction, setEditingAction] = useState<Partial<ReplyAction> | null>(null);

  const status = normalizeWhatsAppStatus(settings.connection_status, "disconnected") || "disconnected";
  const connected = ["ready", "authenticated"].includes(status);

  const invokeWorker = useCallback(async (action: "connect" | "disconnect" | "status" | "test", extra: Record<string, unknown> = {}) => {
    if (!workspace?.id) throw new Error("Workspace not found");
    return callWhatsAppWorker({
      action,
      workspaceId: workspace.id,
      accessToken: session?.access_token || "",
      payload: extra,
    });
  }, [session?.access_token, workspace?.id]);

  const loadData = useCallback(async () => {
    if (!workspace?.id) {
      setModalError("No workspace is selected for the WhatsApp integration.");
      setLoading(false);
      return;
    }

    // Local development: auth not required for WhatsApp worker control
    if (!useLocalWorker && !session?.access_token) {
      setModalError("Your Ecom OS session expired. Please sign in again.");
      setLoading(false);
      return;
    }

    setLoading(true);
    setModalError(null);
    try {
      // In local development, also check worker health directly
      let workerHealthData: { version?: string } | null = null;
      if (useLocalWorker) {
        workerHealthData = await getWorkerHealth();
        if (workerHealthData) {
          const workerVersion = workerHealthData.version || null;
          setSettings((current: any) => ({
            ...current,
            worker_last_seen_at: new Date().toISOString(),
            worker_version: workerVersion,
          }));
        }
      }

      const [settingsResult, rulesResult, actionsResult, audioResult, queueResult, messagesResult, eventsResult, statusesResult, heartbeatResult] = await Promise.all([
        supabase.from("whatsapp_settings").select("*").eq("workspace_id", workspace.id).maybeSingle(),
        supabase.from("whatsapp_automation_rules").select("*").eq("workspace_id", workspace.id),
        supabase.from("whatsapp_reply_actions").select("*").eq("workspace_id", workspace.id),
        supabase.from("whatsapp_audio_recordings").select("*").eq("workspace_id", workspace.id).order("created_at", { ascending: false }),
        supabase.from("whatsapp_queue").select("id, order_id, message_type, status, phone, attempts, max_attempts, last_error, error_code, scheduled_for, sent_at, created_at").eq("workspace_id", workspace.id).order("created_at", { ascending: false }).limit(50),
        supabase.from("whatsapp_messages").select("id, order_id, direction, message_type, status, phone, body, created_at").eq("workspace_id", workspace.id).order("created_at", { ascending: false }).limit(50),
        supabase.from("whatsapp_events").select("id, order_id, event_type, severity, message, created_at").eq("workspace_id", workspace.id).order("created_at", { ascending: false }).limit(50),
        supabase.from("order_statuses").select("*").eq("workspace_id", workspace.id).order("position", { ascending: true }),
        !useLocalWorker ? supabase.from("whatsapp_worker_heartbeats").select("*").eq("workspace_id", workspace.id).maybeSingle() : Promise.resolve({ data: null, error: null }),
      ]);
      if (settingsResult.error) throw settingsResult.error;
      if (settingsResult.data) setSettings((current: any) => ({ ...current, ...settingsResult.data }));
      if (statusesResult && statusesResult.data) setOrderStatuses(statusesResult.data);
      const nextRules: Record<Rule["event_type"], Rule> = { confirmation: { ...DEFAULT_RULES.confirmation }, delivery: { ...DEFAULT_RULES.delivery } };
      for (const rule of rulesResult.data || []) {
        const event = rule.event_type as Rule["event_type"];
        const merged = { ...nextRules[event], ...rule } as Rule;
        nextRules[event] = { ...merged, message_steps: messageStepsFor(merged) };
      }
      setRules(nextRules);
      const nextActions = actionsResult.data && actionsResult.data.length > 0 ? actionsResult.data : [...DEFAULT_ACTIONS];
      setActions(nextActions);
      setDeletedActionIds([]);
      setRecordings(audioResult.data || []);
      setInboxMessages(messagesResult.data || []);
      const combined = [
        ...(queueResult.data || []).map((row) => ({ ...row, log_kind: "queue", log_date: row.created_at })),
        ...(messagesResult.data || []).map((row) => ({ ...row, log_kind: "message", log_date: row.created_at })),
        ...(eventsResult.data || []).map((row) => ({ ...row, log_kind: "event", log_date: row.created_at })),
      ].sort((a, b) => new Date(b.log_date).getTime() - new Date(a.log_date).getTime()).slice(0, 100);
      setLogs(combined);
      if (heartbeatResult.data && !useLocalWorker) setSettings((current: any) => ({ ...current, worker_last_seen_at: heartbeatResult.data.seen_at, worker_version: heartbeatResult.data.worker_version }));
    } catch (error: any) {
      const message = error?.message || "Could not load WhatsApp settings";
      setModalError(message);
      toast.error(message);
    } finally { setLoading(false); }
  }, [session?.access_token, workspace?.id]);

  useEffect(() => { if (isOpen) loadData(); }, [isOpen, loadData]);

  useEffect(() => {
    if (!isOpen) return;
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    const closeOnEscape = (event: KeyboardEvent) => event.key === "Escape" && onClose();
    window.addEventListener("keydown", closeOnEscape);
    return () => {
      document.body.style.overflow = previousOverflow;
      window.removeEventListener("keydown", closeOnEscape);
    };
  }, [isOpen, onClose]);

  useEffect(() => {
    if (!isOpen || !workspace?.id) return;

    let cancelled = false;
    let inFlight = false;
    const poll = async () => {
      if (inFlight) return;
      inFlight = true;
      try {
        const data = await invokeWorker("status");
        const nextStatus = normalizeWhatsAppStatus(data?.connection_status ?? data?.status ?? data?.state ?? data, settings.connection_status || "disconnected");
        if (!cancelled && nextStatus) {
          setSettings((current: any) => ({
            ...current,
            connection_status: nextStatus,
            connected_phone: data?.connected_phone ?? data?.phoneNumber ?? current.connected_phone,
            last_error: data?.last_error ?? current.last_error,
          }));
          setQrCode(["qr_required"].includes(nextStatus) ? (data?.qr || null) : null);
        }
      } catch (error) {
        console.warn("[WhatsApp][STATUS] poll failed, keeping previous state", error);
      } finally {
        if (!cancelled) {
          inFlight = false;
        }
      }
    };

    void poll();

    // Poll more frequently during connection states
    const shouldPollFrequently = ["initializing", "qr_required", "authenticated", "reconnecting"].includes(status);
    const intervalMs = shouldPollFrequently ? 1500 : 5000;

    const interval = window.setInterval(() => { void poll(); }, intervalMs);
    return () => {
      cancelled = true;
      window.clearInterval(interval);
    };
  }, [isOpen, invokeWorker, workspace?.id, status]);

  useEffect(() => () => {
    streamRef.current?.getTracks().forEach((track) => track.stop());
    if (recordedUrl) URL.revokeObjectURL(recordedUrl);
  }, [recordedUrl]);

  const save = async () => {
    if (!workspace?.id) return;
    setBusy(true);
    try {
      for (const rule of Object.values(rules)) {
        if (!rule.trigger_statuses.length) throw new Error(`${rule.event_type} needs at least one trigger status`);
        if (!messageStepsFor(rule).length) throw new Error(`${rule.event_type} needs at least one message step`);
      }
      if (!settings.active_days.length) throw new Error("Choose at least one active sending day");
      const confirmAction = actions.find(a => a.action_type === "confirm_order") || DEFAULT_ACTIONS.find(a => a.action_type === "confirm_order")!;
      const callbackAction = actions.find(a => a.action_type === "request_callback") || DEFAULT_ACTIONS.find(a => a.action_type === "request_callback")!;

      const settingsPayload = {
        workspace_id: workspace.id, enabled: connected || Boolean(settings.enabled), timezone: settings.timezone,
        active_days: settings.active_days, quiet_hours_start: settings.quiet_hours_start || null,
        quiet_hours_end: settings.quiet_hours_end || null, minimum_interval_seconds: Number(settings.minimum_interval_seconds),
        hourly_rate_limit: Number(settings.hourly_rate_limit), daily_rate_limit: Number(settings.daily_rate_limit),
        retry_base_seconds: Number(settings.retry_base_seconds), retry_max_seconds: Number(settings.retry_max_seconds),
        reply_context_hours: Number(settings.reply_context_hours), callback_delay_minutes: Number(settings.callback_delay_minutes),
        auto_confirmation: rules.confirmation.enabled, auto_order_confirmation: rules.confirmation.enabled,
        send_delay_minutes: rules.confirmation.delay_minutes, confirmation_message: rules.confirmation.text_template,
        confirmed_message: confirmAction.response_template, modification_message: callbackAction.response_template,
        allow_confirm: confirmAction.enabled, allow_modify: callbackAction.enabled,
      };
      const { error: settingsError } = await supabase.from("whatsapp_settings").upsert(settingsPayload, { onConflict: "workspace_id" });
      if (settingsError) throw settingsError;
      const rulesPayload = Object.values(rules).map(({ id: _id, ...rule }) => {
        const message_steps = messageStepsFor(rule);
        const firstText = message_steps.find((step) => step.type === "text");
        const firstAudio = message_steps.find((step) => step.type === "audio");
        return {
          ...rule,
          workspace_id: workspace.id,
          message_steps,
          channel_sequence: message_steps.map((step) => step.type),
          text_enabled: message_steps.some((step) => step.type === "text"),
          audio_enabled: message_steps.some((step) => step.type === "audio"),
          text_template: firstText?.text_template || "",
          audio_recording_id: firstAudio?.audio_recording_id || null,
        };
      });
      const { error: rulesError } = await supabase.from("whatsapp_automation_rules").upsert(rulesPayload, { onConflict: "workspace_id,event_type" });
      if (rulesError) throw rulesError;

      if (deletedActionIds.length > 0) {
        const { error: deleteError } = await supabase.from("whatsapp_reply_actions")
          .delete()
          .eq("workspace_id", workspace.id)
          .in("id", deletedActionIds);
        if (deleteError) throw deleteError;
      }

      const actionsPayload = actions.map(action => {
        const { id, ...rest } = action;
        const out: any = { ...rest, workspace_id: workspace.id, priority: rest.priority ?? 20 };
        out.action = ({
          confirm_order: "confirm",
          request_callback: "callback",
          opt_out: "opt_out",
          cancel_order: "callback",
          set_order_status: "callback",
          add_note: "callback",
          reply_only: "callback",
        } as const)[rest.action_type];
        if (id && !id.startsWith("new_")) out.id = id;
        return out;
      });

      const dedupedActionsPayload = Array.from(new Map(
        actionsPayload.map((action) => [action.action_type, action])
      ).values());

      if (dedupedActionsPayload.length > 0) {
        const { error: actionsError } = await supabase
          .from("whatsapp_reply_actions")
          .upsert(dedupedActionsPayload, { onConflict: "id" });
        if (actionsError) throw actionsError;
      }
      toast.success("WhatsApp automation saved");
      await loadData();
    } catch (error: any) { toast.error(error.message || "Could not save WhatsApp settings"); }
    finally { setBusy(false); }
  };

  const connect = async () => {
    if (!workspace?.id) return;
    setBusy(true);
    try {
      const data = await connectWhatsApp(workspace.id);
      const nextStatus = normalizeWhatsAppStatus(data?.connection_status ?? data?.status ?? data?.state ?? "disconnected", "disconnected");

      setSettings((current: any) => ({
        ...current,
        enabled: true,
        connection_status: nextStatus || current.connection_status || "disconnected",
        connected_phone: data?.connected_phone ?? data?.phoneNumber ?? current.connected_phone,
        last_error: data?.last_error ?? current.last_error ?? null,
      }));

      setQrCode(nextStatus === "qr_required" ? (data?.qr || null) : null);
      if (nextStatus === "qr_required") {
        toast.info("Scan the QR code with WhatsApp");
      } else if (nextStatus === "initializing") {
        toast.info("WhatsApp session is starting");
      } else {
        await loadData();
      }
    } catch (error: any) {
      setSettings((current: any) => ({ ...current, last_error: error.message || "Could not reach the WhatsApp worker" }));
      toast.error(error.message || "Could not reach the WhatsApp worker");
    }
    finally { setBusy(false); }
  };

  const disconnect = async () => {
    if (!confirm("Disconnect WhatsApp and revoke this browser session?")) return;
    setBusy(true);
    try {
      await invokeWorker("disconnect", { revoke_session: true });
      setSettings((current: any) => ({ ...current, connection_status: "disconnected", connected_phone: null, last_error: null }));
      setQrCode(null);
      toast.success("WhatsApp disconnected");
    } catch (error: any) { toast.error(error.message || "Disconnect failed"); }
    finally { setBusy(false); }
  };

  const sendTest = async () => {
    setBusy(true);
    try { await invokeWorker("test", { phone: testPhone, message: "Ecom OS WhatsApp test ✅" }); toast.success("Test message sent"); await loadData(); }
    catch (error: any) { toast.error(error.message || "Test message failed"); }
    finally { setBusy(false); }
  };

  const startRecording = async () => {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      const mimeType = ["audio/webm;codecs=opus", "audio/ogg;codecs=opus", "audio/webm"].find((type) => MediaRecorder.isTypeSupported(type)) || "";
      const recorder = new MediaRecorder(stream, mimeType ? { mimeType } : undefined);
      chunksRef.current = [];
      recorder.ondataavailable = (event) => { if (event.data.size) chunksRef.current.push(event.data); };
      recorder.onstop = () => {
        const blob = new Blob(chunksRef.current, { type: recorder.mimeType || "audio/webm" });
        if (recordedUrl) URL.revokeObjectURL(recordedUrl);
        setRecordedBlob(blob); setRecordedUrl(URL.createObjectURL(blob)); setRecording(false);
        stream.getTracks().forEach((track) => track.stop());
      };
      streamRef.current = stream; mediaRecorderRef.current = recorder; recorder.start(1000); setRecording(true);
    } catch (error: any) { toast.error(error.message || "Microphone access was denied"); }
  };

  const stopRecording = () => mediaRecorderRef.current?.state === "recording" && mediaRecorderRef.current.stop();

  const uploadAudio = async (blob: Blob, name = `Recording ${new Date().toLocaleString()}`) => {
    if (!workspace?.id || !session?.user.id) return;
    setBusy(true);
    const extension = blob.type.includes("ogg") ? "ogg" : blob.type.includes("mpeg") ? "mp3" : blob.type.includes("mp4") ? "m4a" : blob.type.includes("wav") ? "wav" : "webm";
    const path = `${workspace.id}/${crypto.randomUUID()}.${extension}`;
    try {
      const { error: uploadError } = await supabase.storage.from("whatsapp-audio").upload(path, blob, { contentType: blob.type, upsert: false });
      if (uploadError) throw uploadError;
      const { error: rowError } = await supabase.from("whatsapp_audio_recordings").insert({ workspace_id: workspace.id, name, storage_path: path, mime_type: blob.type || "audio/webm", file_size: blob.size, created_by: session.user.id });
      if (rowError) { await supabase.storage.from("whatsapp-audio").remove([path]); throw rowError; }
      toast.success("Audio recording uploaded privately"); setRecordedBlob(null); setRecordedUrl(null); await loadData();
    } catch (error: any) { toast.error(error.message || "Audio upload failed"); }
    finally { setBusy(false); }
  };

  const removeAudio = async (row: any) => {
    if (!confirm(`Delete “${row.name}”?`)) return;
    try {
      const { error: storageError } = await supabase.storage.from("whatsapp-audio").remove([row.storage_path]);
      if (storageError) throw storageError;
      const { error } = await supabase.from("whatsapp_audio_recordings").delete().eq("workspace_id", workspace?.id).eq("id", row.id);
      if (error) throw error;
      setRules((current) => Object.fromEntries(Object.entries(current).map(([key, rule]) => [key, rule.audio_recording_id === row.id ? { ...rule, audio_recording_id: null, audio_enabled: false } : rule])) as Record<Rule["event_type"], Rule>);
      await loadData();
    } catch (error: any) { toast.error(error.message || "Could not delete recording"); }
  };

  const playAudio = async (row: any) => {
    try {
      const { data, error } = await supabase.storage.from("whatsapp-audio").download(row.storage_path);
      if (error) throw error;
      const url = URL.createObjectURL(data);
      const audio = new Audio(url);
      audio.onended = () => URL.revokeObjectURL(url);
      audio.onerror = () => URL.revokeObjectURL(url);
      await audio.play();
    } catch (error: any) { toast.error(error.message || "Could not play recording"); }
  };

  const updateRule = (event: Rule["event_type"], patch: Partial<Rule>) => setRules((current) => ({ ...current, [event]: { ...current[event], ...patch } }));
  const updateAction = (id: string, patch: Partial<ReplyAction>) => setActions(current => current.map(a => a.id === id ? { ...a, ...patch } : a));
  const addAction = (action: ReplyAction) => {
    const errorMsg = validateKeywords(action.keywords, actions);
    if (errorMsg) return toast.error(errorMsg);
    setActions(current => [...current, { ...action, id: `new_${Date.now()}` }]);
    setEditingAction(null);
  };
  const removeAction = (id: string) => {
    if (!id.startsWith("new_")) setDeletedActionIds(curr => [...curr, id]);
    setActions(current => current.filter(a => a.id !== id));
  };

  const validateKeywords = (keywords: string[], currentActions: ReplyAction[], excludeId?: string) => {
    const normalized = keywords.map(k => k.trim().toLowerCase()).filter(Boolean);
    for (const a of currentActions) {
      if (a.id !== excludeId) {
        const intersection = a.keywords.map(k => k.trim().toLowerCase()).filter(k => normalized.includes(k));
        if (intersection.length > 0) return `Keywords conflict with action: ${a.name} (${intersection.join(', ')})`;
      }
    }
    return null;
  };
  const retryJob = async (jobId: string) => {
    try {
      const { error } = await supabase.rpc("retry_whatsapp_job", { p_job_id: jobId });
      if (error) throw error;
      toast.success("WhatsApp job safely requeued");
      await loadData();
    } catch (error: any) { toast.error(error.message || "Could not retry job"); }
  };

  const workerHealthy = useMemo(() => {
    if (useLocalWorker) {
      // In local development, trust the direct health check
      return settings.worker_last_seen_at && Date.now() - new Date(settings.worker_last_seen_at).getTime() < 120_000;
    }
    // Production: use database heartbeat
    return settings.worker_last_seen_at && Date.now() - new Date(settings.worker_last_seen_at).getTime() < 120_000;
  }, [settings.worker_last_seen_at]);

  if (!isOpen) return null;

  const ruleEditor = (event: Rule["event_type"]) => {
    const rule = rules[event];
    return <div className="space-y-5">
      <Toggle checked={rule.enabled} onChange={(enabled) => updateRule(event, { enabled })} label={`Enable ${event} automation`} description="A transition is queued only once per order and rule." />
      <div className="grid gap-4 md:grid-cols-2">
        <div><FieldLabel>Status field</FieldLabel><select value={rule.status_source} onChange={(e) => updateRule(event, { status_source: e.target.value as Rule["status_source"] })} className="w-full rounded-xl border border-base-border bg-base-surface px-3 py-2.5 text-[13px]"><option value="status">Confirmation status</option><option value="shipping_status">Shipping status</option><option value="delivery_status">Delivery status</option><option value="provider_status">Provider status</option></select></div>
        <div><FieldLabel>Trigger statuses (comma-separated)</FieldLabel><input value={rule.trigger_statuses.join(", ")} onChange={(e) => updateRule(event, { trigger_statuses: e.target.value.split(",").map((value) => value.trim()).filter(Boolean) })} className="w-full rounded-xl border border-base-border bg-base-surface px-3 py-2.5 text-[13px]" /></div>
        <div><FieldLabel>Delay (minutes)</FieldLabel><input type="number" min={0} max={10080} value={rule.delay_minutes} onChange={(e) => updateRule(event, { delay_minutes: Number(e.target.value) })} className="w-full rounded-xl border border-base-border bg-base-surface px-3 py-2.5 text-[13px]" /></div>
        <div><FieldLabel>Expire after (minutes)</FieldLabel><input type="number" min={5} max={10080} value={rule.expires_after_minutes} onChange={(e) => updateRule(event, { expires_after_minutes: Number(e.target.value) })} className="w-full rounded-xl border border-base-border bg-base-surface px-3 py-2.5 text-[13px]" /></div>
      </div>
    </div>;
  };

  const messageEditor = (event: Rule["event_type"]) => {
    const rule = rules[event];
    const steps = messageStepsFor(rule);
    const updateSteps = (nextSteps: MessageStep[]) => {
      const firstText = nextSteps.find((step) => step.type === "text");
      const firstAudio = nextSteps.find((step) => step.type === "audio");
      updateRule(event, {
        message_steps: nextSteps,
        channel_sequence: nextSteps.map((step) => step.type),
        text_enabled: nextSteps.some((step) => step.type === "text"),
        audio_enabled: nextSteps.some((step) => step.type === "audio"),
        text_template: firstText?.text_template || "",
        audio_recording_id: firstAudio?.audio_recording_id || null,
      });
    };
    const addStep = (type: MessageStep["type"]) => updateSteps([...steps, {
      id: `${type}-${crypto.randomUUID()}`,
      type,
      text_template: type === "text" ? "" : "",
      audio_recording_id: null,
    }]);
    const moveStep = (index: number, direction: -1 | 1) => {
      const nextIndex = index + direction;
      if (nextIndex < 0 || nextIndex >= steps.length) return;
      const next = [...steps];
      [next[index], next[nextIndex]] = [next[nextIndex], next[index]];
      updateSteps(next);
    };
    return <div className="space-y-5">
      <div className="flex flex-wrap items-center justify-between gap-3"><div><h3 className="text-[14px] font-bold">Message sequence</h3><p className="mt-1 text-[11.5px] text-ink-muted">Every step is sent in this exact order. Add two or three messages when you need them.</p></div><div className="flex gap-2"><button onClick={() => addStep("text")} className="rounded-xl border border-base-border px-3 py-2 text-[11px] font-bold hover:bg-base-raised">+ Text</button><button onClick={() => addStep("audio")} className="rounded-xl bg-[#25D366] px-3 py-2 text-[11px] font-bold text-white">+ Voice note</button></div></div>
      {steps.map((step, index) => <section key={step.id} className="rounded-2xl border border-base-border p-4"><div className="mb-3 flex flex-wrap items-center justify-between gap-2"><div className="text-[12px] font-bold">{index + 1}. {step.type === "text" ? "Text message" : "Voice note"}</div><div className="flex items-center gap-1"><button disabled={index === 0} onClick={() => moveStep(index, -1)} className="rounded-lg border border-base-border px-2 py-1 text-[10px] disabled:opacity-30">Move up</button><button disabled={index === steps.length - 1} onClick={() => moveStep(index, 1)} className="rounded-lg border border-base-border px-2 py-1 text-[10px] disabled:opacity-30">Move down</button><button disabled={steps.length === 1} onClick={() => updateSteps(steps.filter((item) => item.id !== step.id))} className="rounded-lg px-2 py-1 text-[10px] font-semibold text-danger disabled:opacity-30">Remove</button></div></div>{step.type === "text" ? <TemplateEditor value={step.text_template} onChange={(text_template) => updateSteps(steps.map((item) => item.id === step.id ? { ...item, text_template } : item))} /> : <div><FieldLabel>Voice recording</FieldLabel><select value={step.audio_recording_id || ""} onChange={(e) => updateSteps(steps.map((item) => item.id === step.id ? { ...item, audio_recording_id: e.target.value || null } : item))} className="w-full rounded-xl border border-base-border bg-base-surface px-3 py-2.5 text-[13px]"><option value="">Select a recording</option>{recordings.map((row) => <option key={row.id} value={row.id}>{row.name}</option>)}</select><p className="mt-2 text-[11px] text-ink-muted">A voice note is sent as a recorded WhatsApp message, not as a file attachment.</p></div>}</section>)}
      <Toggle checked={rule.fallback_text_enabled} onChange={(fallback_text_enabled) => updateRule(event, { fallback_text_enabled })} label="Use fallback text if media is unavailable" />
      {rule.fallback_text_enabled && <textarea value={rule.fallback_text} onChange={(e) => updateRule(event, { fallback_text: e.target.value })} className="h-24 w-full rounded-xl border border-base-border bg-base-raised/30 p-3 text-[13px]" />}
    </div>;
  };

  return (
    <div className="app-modal-backdrop fixed inset-0 flex items-center justify-center bg-black/45 p-0 backdrop-blur-sm md:p-3" role="dialog" aria-modal="true" aria-label="WhatsApp Automation settings">
      <div className="flex h-dvh w-full max-w-6xl overflow-hidden bg-base-surface shadow-2xl md:h-[min(900px,95dvh)] md:rounded-2xl md:border md:border-base-border">
        <aside className="hidden w-60 shrink-0 border-r border-base-border bg-base-raised/30 p-3 md:block">
          <div className="px-3 py-4"><div className="text-[15px] font-bold">WhatsApp Automation</div><div className="mt-1 text-[11px] text-ink-muted">Workspace-scoped controls</div></div>
          <nav className="space-y-1">{TABS.map(([key, label, Icon]) => <button key={key} onClick={() => setTab(key)} className={`flex w-full items-center gap-2.5 rounded-xl px-3 py-2.5 text-left text-[12.5px] font-semibold ${tab === key ? "bg-[#25D366]/12 text-[#159447]" : "text-ink-muted hover:bg-base-raised hover:text-ink"}`}><Icon size={15} />{label}</button>)}</nav>
        </aside>
        <div className="flex min-w-0 flex-1 flex-col">
          <header className="flex shrink-0 items-center justify-between border-b border-base-border px-4 pb-3 pt-[calc(.75rem+env(safe-area-inset-top))] md:px-5 md:py-4"><div className="min-w-0"><h2 className="truncate text-[16px] font-bold">{TABS.find(([key]) => key === tab)?.[1]}</h2><p className="mt-0.5 truncate text-[11px] text-ink-muted">Provider: whatsapp-web.js · tenant: {workspace?.name || "Workspace"}</p></div><button onClick={onClose} aria-label="Close WhatsApp settings" className="grid h-11 w-11 shrink-0 place-items-center rounded-xl hover:bg-base-raised"><X size={18} /></button></header>
          <div className="flex gap-2 overflow-x-auto border-b border-base-border p-2 md:hidden">{TABS.map(([key, label]) => <button key={key} onClick={() => setTab(key)} className={`whitespace-nowrap rounded-lg px-3 py-2 text-[11px] ${tab === key ? "bg-[#25D366]/10 text-[#159447]" : "text-ink-muted"}`}>{label}</button>)}</div>
          <main className="min-h-0 flex-1 overflow-y-auto overscroll-contain p-4 md:p-7">
            {modalError && (
              <div className="mb-4 rounded-xl border border-danger/40 bg-danger/10 p-3 text-[12px] text-danger">
                {modalError}
              </div>
            )}
            {loading ? <div className="flex h-full items-center justify-center"><Loader2 className="animate-spin text-[#25D366]" /></div> : <>
              {tab === "connection" && <div className="space-y-5">
                <div className="rounded-2xl border border-base-border p-5"><div className="flex flex-wrap items-center justify-between gap-4"><div><div className="text-[12px] text-ink-muted">Connection state</div><div className={`mt-1 flex items-center gap-2 text-[15px] font-bold ${connected ? "text-[#159447]" : status === "error" ? "text-danger" : "text-ink"}`}>{connected ? <CheckCircle2 size={17} /> : <PauseCircle size={17} />}{status.replace(/_/g, " ")}</div>{settings.connected_phone && <div className="mt-1 text-[12px] text-ink-muted">+{settings.connected_phone}</div>}</div><div className="flex gap-2">{connected ? <button onClick={disconnect} disabled={busy} className="rounded-xl border border-danger/30 px-4 py-2.5 text-[12px] font-semibold text-danger">Disconnect</button> : <button onClick={connect} disabled={busy} className="rounded-xl bg-[#25D366] px-4 py-2.5 text-[12px] font-semibold text-white">Connect WhatsApp</button>}<button onClick={loadData} className="rounded-xl border border-base-border p-2.5"><RefreshCw size={15} /></button></div></div></div>
                {qrCode && <div className="flex flex-col items-center rounded-2xl border border-base-border p-6"><div className="rounded-xl bg-white p-4"><QRCode value={qrCode} size={220} /></div><p className="mt-4 text-center text-[12px] text-ink-muted">Open WhatsApp → Linked devices → Link a device</p></div>}
                <div className="rounded-xl border border-base-border p-4"><div className="text-[11px] text-ink-muted">Worker health</div><div className={`mt-1 text-[13px] font-bold ${workerHealthy ? "text-[#159447]" : "text-danger"}`}>{workerHealthy ? "Healthy" : "No recent heartbeat"}</div><div className="mt-1 text-[10.5px] text-ink-muted">{settings.worker_version || "Version unavailable"}</div></div>
                <div className="rounded-xl border border-base-border p-4"><FieldLabel>Send a safe test</FieldLabel><div className="flex gap-2"><input value={testPhone} onChange={(e) => setTestPhone(e.target.value)} placeholder="06XXXXXXXX" className="min-w-0 flex-1 rounded-xl border border-base-border bg-base-raised/30 px-3 py-2.5 text-[13px]" /><button onClick={sendTest} disabled={busy || !connected} className="rounded-xl bg-ink px-4 py-2.5 text-[12px] font-semibold text-base-surface disabled:opacity-40"><PlayCircle size={14} className="mr-1 inline" />Test</button></div></div>
              </div>}
              {tab === "automations" && <div className="space-y-7">
                <div><h3 className="text-[14px] font-bold">Order automations</h3><p className="mt-1 text-[12px] text-ink-muted">A customer reply of 1 confirms the matching order immediately. Configure the outgoing message in Confirmation Messages.</p></div>
                <section><h3 className="mb-3 text-[13px] font-bold">Order confirmation trigger</h3>{ruleEditor("confirmation")}</section>
                <section className="border-t border-base-border pt-6"><h3 className="mb-3 text-[13px] font-bold">Delivery trigger</h3>{ruleEditor("delivery")}</section>
              </div>}
              {tab === "confirmation" && <div className="space-y-4"><div><h3 className="text-[14px] font-bold">Confirmation messages</h3><p className="mt-1 text-[12px] text-ink-muted">Add text and recorded voice notes in the exact order the customer should receive them.</p></div>{messageEditor("confirmation")}</div>}
              {tab === "delivery" && <div className="space-y-4"><div><h3 className="text-[14px] font-bold">Delivery messages</h3><p className="mt-1 text-[12px] text-ink-muted">Build the delivery update as one, two, or three messages.</p></div>{messageEditor("delivery")}</div>}
              {tab === "audio" && <div className="space-y-5"><div className="rounded-2xl border border-base-border p-5"><h3 className="text-[13px] font-bold">Record in the browser</h3><p className="mt-1 text-[11.5px] text-ink-muted">Each recording is sent as a WhatsApp voice note. Record it here or upload an audio file.</p><div className="mt-4 flex flex-wrap items-center gap-3">{recording ? <button onClick={stopRecording} className="rounded-xl bg-danger px-4 py-2.5 text-[12px] font-semibold text-white"><PauseCircle size={15} className="mr-1 inline" />Stop</button> : <button onClick={startRecording} className="rounded-xl bg-[#25D366] px-4 py-2.5 text-[12px] font-semibold text-white"><Mic size={15} className="mr-1 inline" />Record</button>}<label className="cursor-pointer rounded-xl border border-base-border px-4 py-2.5 text-[12px] font-semibold"><Upload size={15} className="mr-1 inline" />Upload file<input type="file" accept="audio/*" className="hidden" onChange={(e) => { const file = e.target.files?.[0]; if (file) uploadAudio(file, file.name); }} /></label>{recordedUrl && <audio controls src={recordedUrl} className="h-10" />}{recordedBlob && <button onClick={() => uploadAudio(recordedBlob)} disabled={busy} className="rounded-xl bg-ink px-4 py-2.5 text-[12px] font-semibold text-base-surface">Save recording</button>}</div></div><div className="space-y-2">{recordings.length === 0 ? <div className="rounded-xl border border-dashed border-base-border p-8 text-center text-[12px] text-ink-muted">No recordings yet.</div> : recordings.map((row) => <div key={row.id} className="flex items-center justify-between rounded-xl border border-base-border p-4"><div className="flex items-center gap-3"><FileAudio size={18} className="text-[#25D366]" /><div><div className="text-[12.5px] font-semibold">{row.name}</div><div className="text-[10.5px] text-ink-muted">{Math.ceil(row.file_size / 1024)} KB · {row.mime_type}</div></div></div><div className="flex gap-1"><button onClick={() => playAudio(row)} className="rounded-lg p-2 text-[#159447] hover:bg-[#25D366]/10"><PlayCircle size={15} /></button><button onClick={() => removeAudio(row)} className="rounded-lg p-2 text-danger hover:bg-danger/10"><Trash2 size={15} /></button></div></div>)}</div></div>}
              {tab === "replies" && <div className="mt-8 space-y-5 border-t border-base-border pt-6">
                <div className="flex items-center justify-between">
                  <div>
                    <h3 className="text-[14px] font-bold">Reply Actions</h3>
                    <p className="text-[12px] text-ink-muted">Configure how the system responds to customer replies</p>
                  </div>
                  <button onClick={() => setEditingAction({ name: "", action_type: "reply_only", keywords: [], response_template: "", enabled: true, priority: 30 })} className="rounded-xl bg-ink px-4 py-2 text-[12px] font-bold text-base-surface">
                    + Add reply action
                  </button>
                </div>
                {editingAction && (
                  <div className="rounded-2xl border-2 border-brand bg-brand/5 p-5">
                    <div className="mb-4 flex items-center justify-between border-b border-base-border/50 pb-2">
                      <h4 className="text-[13px] font-bold">New Reply Action</h4>
                      <button onClick={() => setEditingAction(null)} className="text-ink-muted hover:text-ink"><X size={16} /></button>
                    </div>
                    <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
                      <div><FieldLabel>Action Name</FieldLabel><input placeholder="e.g. Call me" value={editingAction.name} onChange={(e) => setEditingAction({ ...editingAction, name: e.target.value })} className="w-full rounded-xl border border-base-border bg-base-surface px-3 py-2.5 text-[13px] outline-none" /></div>
                      <div>
                        <FieldLabel>What should happen?</FieldLabel>
                        <select value={editingAction.action_type} onChange={(e) => setEditingAction({ ...editingAction, action_type: e.target.value as any })} className="w-full rounded-xl border border-base-border bg-base-surface px-3 py-2.5 text-[13px]">
                          <option value="confirm_order">Confirm order</option>
                          <option value="set_order_status">Change order status</option>
                          <option value="request_callback">Request callback</option>
                          <option value="cancel_order">Cancel order</option>
                          <option value="add_note">Add note</option>
                          <option value="opt_out">Opt out</option>
                          <option value="reply_only">Reply only</option>
                        </select>
                      </div>
                      {editingAction.action_type === "set_order_status" && (
                        <div>
                          <FieldLabel>Target Status</FieldLabel>
                          <input placeholder="e.g. Call me" value={editingAction.target_status || ""} onChange={(e) => setEditingAction({ ...editingAction, target_status: e.target.value })} className="w-full rounded-xl border border-base-border bg-base-surface px-3 py-2.5 text-[13px] outline-none" />
                        </div>
                      )}
                    </div>
                    <div className="mt-4">
                      <FieldLabel>Keywords (comma-separated)</FieldLabel>
                      <input placeholder="e.g. 3, عيط ليا, call me" value={editingAction.keywords?.join(", ")} onChange={(e) => setEditingAction({ ...editingAction, keywords: e.target.value.split(",").map(v => v.trim()).filter(Boolean) })} className="w-full rounded-xl border border-base-border bg-base-surface px-3 py-2.5 text-[13px] outline-none" />
                    </div>
                    <div className="mt-4">
                      <FieldLabel>Automatic reply</FieldLabel>
                      <textarea placeholder="The bot reply..." value={editingAction.response_template} onChange={(e) => setEditingAction({ ...editingAction, response_template: e.target.value })} className="h-24 w-full rounded-xl border border-base-border bg-base-surface p-3 text-[13px] outline-none" />
                    </div>
                    <div className="mt-4 flex justify-end">
                      <button onClick={() => addAction(editingAction as ReplyAction)} disabled={!editingAction.name || !editingAction.keywords?.length || !editingAction.response_template} className="rounded-xl bg-brand px-5 py-2 text-[12px] font-bold text-white disabled:opacity-50">Add this action</button>
                    </div>
                  </div>
                )}
                {actions.sort((a, b) => a.priority - b.priority).map((action) => (
                  <div key={action.id} className={`rounded-2xl border ${!action.id?.startsWith("new_") && action.action_type === "opt_out" ? "border-danger/30 bg-danger/5" : "border-base-border"} p-5`}>
                    <div className="mb-4 flex flex-wrap items-center justify-between gap-4 border-b border-base-border pb-4">
                      <div>
                        <h4 className="text-[14px] font-bold">{action.name}</h4>
                        <div className="mt-1 flex gap-2">
                          <span className="rounded bg-brand/10 px-2 py-0.5 text-[10px] font-bold text-brand">{action.action_type.replace(/_/g, " ")}</span>
                          {action.target_status && <span className="rounded bg-base-raised px-2 py-0.5 text-[10px] font-bold text-ink-muted">→ {action.target_status}</span>}
                        </div>
                      </div>
                      <div className="flex items-center gap-3">
                        <label className="flex items-center gap-2 text-[12px] font-semibold"><input type="checkbox" checked={action.enabled} onChange={(e) => updateAction(action.id!, { enabled: e.target.checked })} className="accent-brand" /> Enabled</label>
                        {(!action.id?.includes("confirm") && !action.id?.includes("callback") && !action.id?.includes("opt_out") && action.action_type !== "opt_out") && (
                          <button onClick={() => removeAction(action.id!)} className="rounded p-1 text-danger hover:bg-danger/10"><Trash2 size={15} /></button>
                        )}
                      </div>
                    </div>
                    <div className="grid gap-6 md:grid-cols-2">
                      <div>
                        <FieldLabel>Keywords (comma-separated)</FieldLabel>
                        <input value={action.keywords.join(", ")} onChange={(e) => updateAction(action.id!, { keywords: e.target.value.split(",").map(v => v.trim()).filter(Boolean) })} className="w-full rounded-xl border border-base-border bg-base-raised/30 px-3 py-2.5 text-[13px]" />
                        <div className="mt-2 flex flex-wrap gap-1">
                          {action.keywords.map((kw, i) => <span key={i} className="rounded-md border border-base-border bg-base-surface px-1.5 py-0.5 text-[10px] font-mono font-medium">{kw}</span>)}
                        </div>
                      </div>
                      <div>
                        <FieldLabel>Automatic reply</FieldLabel>
                        <textarea value={action.response_template} onChange={(e) => updateAction(action.id!, { response_template: e.target.value })} className="h-24 w-full rounded-xl border border-base-border bg-base-raised/30 p-3 text-[13px]" />
                      </div>
                    </div>
                  </div>
                ))}
              </div>}
              {tab === "schedule" && <div className="space-y-5"><div><FieldLabel>Timezone</FieldLabel><select value={settings.timezone} onChange={(e) => setSettings((current: any) => ({ ...current, timezone: e.target.value }))} className="w-full rounded-xl border border-base-border bg-base-surface px-3 py-2.5 text-[13px]"><option value="Africa/Casablanca">Africa/Casablanca</option></select></div><div><FieldLabel>Active sending days</FieldLabel><div className="flex flex-wrap gap-2">{DAY_LABELS.map((label, day) => <button key={label} onClick={() => setSettings((current: any) => ({ ...current, active_days: current.active_days.includes(day) ? current.active_days.filter((value: number) => value !== day) : [...current.active_days, day].sort() }))} className={`rounded-lg px-3 py-2 text-[11px] font-semibold ${settings.active_days.includes(day) ? "bg-[#25D366] text-white" : "bg-base-raised text-ink-muted"}`}>{label}</button>)}</div></div><div className="grid gap-4 md:grid-cols-2"><div><FieldLabel>Quiet hours start</FieldLabel><input type="time" value={settings.quiet_hours_start || ""} onChange={(e) => setSettings((current: any) => ({ ...current, quiet_hours_start: e.target.value }))} className="w-full rounded-xl border border-base-border bg-base-surface px-3 py-2.5 text-[13px]" /></div><div><FieldLabel>Quiet hours end</FieldLabel><input type="time" value={settings.quiet_hours_end || ""} onChange={(e) => setSettings((current: any) => ({ ...current, quiet_hours_end: e.target.value }))} className="w-full rounded-xl border border-base-border bg-base-surface px-3 py-2.5 text-[13px]" /></div>{[["Minimum interval (seconds)", "minimum_interval_seconds"], ["Hourly limit", "hourly_rate_limit"], ["Daily limit", "daily_rate_limit"], ["Reply context (hours)", "reply_context_hours"], ["Callback delay (minutes)", "callback_delay_minutes"], ["Retry base (seconds)", "retry_base_seconds"], ["Retry maximum (seconds)", "retry_max_seconds"]].map(([label, key]) => <div key={key}><FieldLabel>{label}</FieldLabel><input type="number" min={0} value={(settings as any)[key]} onChange={(e) => setSettings((current: any) => ({ ...current, [key]: Number(e.target.value) }))} className="w-full rounded-xl border border-base-border bg-base-surface px-3 py-2.5 text-[13px]" /></div>)}</div></div>}
              {tab === "inbox" && <div className="space-y-5">
                <div className="flex items-center justify-between gap-3"><div><h3 className="text-[14px] font-bold">Customer inbox</h3><p className="mt-1 text-[12px] text-ink-muted">Every message stays linked to its matching order.</p></div><button onClick={loadData} className="rounded-xl border border-base-border p-2.5"><RefreshCw size={15} /></button></div>
                <div className="overflow-hidden rounded-2xl border border-base-border">
                  {inboxMessages.length === 0 ? <div className="p-10 text-center text-[12px] text-ink-muted">No WhatsApp messages yet.</div> : inboxMessages.map((message) => <div key={message.id} className="flex gap-3 border-b border-base-border p-4 last:border-0"><div className={`mt-0.5 grid h-8 w-8 shrink-0 place-items-center rounded-full ${message.direction === "inbound" ? "bg-base-raised text-ink-muted" : "bg-[#25D366]/15 text-[#159447]"}`}><MessageCircle size={14} /></div><div className="min-w-0 flex-1"><div className="flex flex-wrap items-center justify-between gap-2"><div className="text-[12px] font-semibold">{message.direction === "inbound" ? "Customer" : "Automation"} · {message.phone || "Unknown number"}</div><time className="text-[10px] text-ink-faint">{new Date(message.created_at).toLocaleString()}</time></div><p className="mt-1 whitespace-pre-wrap break-words text-[12px] text-ink-muted">{message.body || "No text content"}</p>{message.order_id && <div className="mt-1 text-[10px] font-semibold text-[#159447]">Order {String(message.order_id).slice(0, 8)}</div>}</div></div>)}
                </div>
              </div>}
              {tab === "logs" && <div><div className="mb-3 flex items-center justify-between"><p className="text-[11.5px] text-ink-muted">Queue attempts, provider messages, receipts, errors and trigger events.</p><button onClick={loadData} className="rounded-lg border border-base-border p-2"><RefreshCw size={14} /></button></div><div className="overflow-hidden rounded-xl border border-base-border"><div className="max-h-[600px] overflow-auto">{logs.length === 0 ? <div className="p-10 text-center text-[12px] text-ink-muted">No WhatsApp activity yet.</div> : logs.map((row) => <div key={`${row.log_kind}-${row.id}`} className="border-b border-base-border p-3 last:border-0"><div className="flex items-start justify-between gap-3"><div><span className="mr-2 rounded bg-base-raised px-1.5 py-0.5 text-[9px] font-bold uppercase text-ink-muted">{row.log_kind}</span><span className="text-[11.5px] font-semibold">{row.event_type || row.message_type || row.direction || "activity"}</span><div className="mt-1 max-w-2xl truncate text-[11px] text-ink-muted">{row.message || row.body || row.last_error || row.status}</div></div><div className="flex items-center gap-2 text-right">{row.log_kind === "queue" && ["failed", "skipped", "cancelled"].includes(row.status) && <button onClick={() => retryJob(row.id)} className="rounded-lg border border-base-border px-2 py-1 text-[9px] font-bold text-brand hover:bg-base-raised">Retry</button>}<div><div className={`text-[10px] font-bold uppercase ${["failed", "error"].includes(row.status || row.severity) ? "text-danger" : "text-ink-muted"}`}>{row.status || row.severity || ""}</div><div className="mt-1 text-[9px] text-ink-faint">{new Date(row.log_date).toLocaleString()}</div></div></div></div></div>)}</div></div></div>}
            </>}
          </main>
          <footer className="flex shrink-0 items-center justify-end border-t border-base-border px-4 pb-[calc(.75rem+env(safe-area-inset-bottom))] pt-3 md:justify-between md:px-5 md:py-4"><div className="hidden text-[10.5px] text-ink-muted md:block"><Headphones size={13} className="mr-1 inline" />Inbound replies are matched by provider message or a single recent confirmation context.</div><div className="grid w-full grid-cols-2 gap-2 md:flex md:w-auto"><button onClick={onClose} className="min-h-11 rounded-xl px-4 py-2.5 text-[12px] font-semibold">Close</button>{tab !== "logs" && tab !== "connection" && <button onClick={save} disabled={busy} className="min-h-11 rounded-xl bg-ink px-5 py-2.5 text-[12px] font-semibold text-base-surface disabled:opacity-50">{busy ? <Loader2 size={14} className="mr-1 inline animate-spin" /> : <Save size={14} className="mr-1 inline" />}Save</button>}</div></footer>
        </div>
      </div>
    </div>
  );
}
