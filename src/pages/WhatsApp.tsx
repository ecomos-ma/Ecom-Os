import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  Archive,
  Bot,
  Check,
  CheckCheck,
  ChevronLeft,
  FileText,
  Image as ImageIcon,
  Mic,
  MoreVertical,
  Paperclip,
  Search,
  Send,
  Settings,
  Smile,
  UserRound,
  Users,
  X,
} from "lucide-react";
import { useNavigate } from "react-router-dom";
import { useAuth } from "../hooks/useAuth";
import { supabase } from "../lib/supabase";
import { callWhatsAppWorker } from "../services/whatsappWorkerService";
import { toast } from "../components/Toast";
import whatsappLogo from "../assets/integrationicon/imgi_37_whatssap.png";

type Contact = {
  id: string;
  phone_number: string | null;
  display_name: string | null;
  remote_jid: string | null;
  customer_id: string | null;
  order_id: string | null;
  assigned_agent_id: string | null;
  unread_count: number;
  last_message: string | null;
  last_message_at: string | null;
  last_message_direction: string | null;
  ai_enabled: boolean;
  archived_at: string | null;
  avatar_url: string | null;
};
type Message = {
  id: string;
  body: string | null;
  direction: string;
  message_type: string;
  status: string | null;
  created_at: string;
  sent_by_user_id: string | null;
  reply_to_message_id: string | null;
  media_url: string | null;
};

const commonEmoji = ["😀", "😂", "🥰", "😍", "😊", "🙏", "👍", "❤️", "🔥", "🎉", "✅", "📦", "🚚", "💰", "🇲🇦", "وعليكم السلام"];
const acceptedMediaTypes = new Set([
  "image/jpeg", "image/png", "image/webp", "image/gif", "application/pdf",
  "application/msword", "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
  "application/vnd.ms-excel", "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
  "application/zip", "text/plain",
]);
const isImageMessage = (message: Message) => message.message_type === "image" || /\.(?:jpe?g|png|webp|gif)$/i.test(message.media_url || "");

const timeFormatter = new Intl.DateTimeFormat(undefined, {
  hour: "2-digit",
  minute: "2-digit",
});
const dayFormatter = new Intl.DateTimeFormat(undefined, {
  weekday: "short",
  day: "2-digit",
  month: "short",
});
const safeDate = (value?: string | null) => {
  if (!value) return null;
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? null : date;
};
const formatTime = (value?: string | null) => {
  const date = safeDate(value);
  return date ? timeFormatter.format(date) : "";
};
const formatDay = (value?: string | null) => {
  const date = safeDate(value);
  return date ? dayFormatter.format(date) : "";
};

const contactName = (contact: Contact) =>
  contact.display_name?.trim() || contact.phone_number?.trim() || "Unknown contact";

function RoundIconButton({
  label,
  children,
  onClick,
}: {
  label: string;
  children: React.ReactNode;
  onClick?: () => void;
}) {
  return (
    <button
      type="button"
      aria-label={label}
      title={label}
      onClick={onClick}
      className="grid h-10 w-10 shrink-0 place-items-center rounded-full text-[#54656f] transition hover:bg-black/[0.06] active:bg-black/10 dark:text-slate-300 dark:hover:bg-white/10"
    >
      {children}
    </button>
  );
}

function Avatar({ name, src, large = false }: { name?: string | null; src?: string | null; large?: boolean }) {
  const safeName = name?.trim() || "Unknown contact";
  const initials = safeName
    .split(/\s+/)
    .slice(0, 2)
    .map((part) => part[0])
    .join("")
    .toUpperCase();
  return (
    <span
      className={`${large ? "h-20 w-20 text-xl" : "h-11 w-11 text-sm"} relative grid shrink-0 place-items-center overflow-hidden rounded-full bg-[#dfe5e7] font-semibold text-[#667781] dark:bg-[#6a7175] dark:text-slate-100`}
    >
      {initials || <UserRound size={large ? 28 : 19} />}
      {src && <img src={src} alt="" className="absolute inset-0 h-full w-full rounded-full object-cover" onError={(event) => { event.currentTarget.style.display = "none"; }} />}
    </span>
  );
}

export default function WhatsApp() {
  const { workspace, profile } = useAuth();
  const navigate = useNavigate();
  const workspaceId = workspace?.id;
  const [contacts, setContacts] = useState<Contact[]>([]);
  const [messages, setMessages] = useState<Message[]>([]);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [query, setQuery] = useState("");
  const [filter, setFilter] = useState<
    "all" | "unread" | "assigned" | "ai" | "archived"
  >("all");
  const [draft, setDraft] = useState("");
  const [sending, setSending] = useState(false);
  const [recording, setRecording] = useState(false);
  const [sendingAudio, setSendingAudio] = useState(false);
  const [sendingAttachment, setSendingAttachment] = useState(false);
  const [emojiOpen, setEmojiOpen] = useState(false);
  const [messageMediaUrls, setMessageMediaUrls] = useState<Record<string, string>>({});
  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const audioStreamRef = useRef<MediaStream | null>(null);
  const audioChunksRef = useRef<Blob[]>([]);
  const recordingStartedAtRef = useRef(0);
  const attachmentInputRef = useRef<HTMLInputElement | null>(null);
  const textareaRef = useRef<HTMLTextAreaElement | null>(null);
  const requestedAvatarsRef = useRef(new Set<string>());
  const [detailsOpen, setDetailsOpen] = useState(false);
  const [agents, setAgents] = useState<
    Array<{ id: string; full_name: string | null }>
  >([]);
  const selected =
    contacts.find((contact) => contact.id === selectedId) ?? null;

  const loadContacts = useCallback(async () => {
    if (!workspaceId) return;
    const { data, error } = await supabase
      .from("whatsapp_contacts")
      .select(
        "id,phone_number,display_name,remote_jid,customer_id,order_id,assigned_agent_id,unread_count,last_message,last_message_at,last_message_direction,ai_enabled,archived_at,avatar_url",
      )
      .eq("workspace_id", workspaceId)
      .order("last_message_at", { ascending: false, nullsFirst: false });
    if (error) {
      toast.error("Could not load WhatsApp conversations");
      return;
    }
    const nextContacts = (data ?? []) as Contact[];
    setContacts(nextContacts);
    setSelectedId((current) =>
      current && nextContacts.some((contact) => contact.id === current)
        ? current
        : window.innerWidth >= 768
          ? (nextContacts[0]?.id ?? null)
          : null,
    );
  }, [workspaceId]);

  const loadMessages = useCallback(
    async (contact: Contact | null) => {
      if (!workspaceId || !contact) {
        setMessages([]);
        return;
      }
      const { data, error } = await supabase
        .from("whatsapp_messages")
        .select(
          "id,body,direction,message_type,status,created_at,sent_by_user_id,reply_to_message_id,media_url",
        )
        .eq("workspace_id", workspaceId)
        .eq("conversation_id", contact.id)
        .order("created_at", { ascending: true });
      if (!error) {
        const nextMessages = (data ?? []) as Message[];
        setMessages(nextMessages);
        const storedMedia = nextMessages.filter((message) => message.media_url && !/^https?:\/\//i.test(message.media_url));
        if (storedMedia.length) {
          const { data: signed } = await supabase.storage
            .from("whatsapp-media")
            .createSignedUrls(storedMedia.map((message) => message.media_url as string), 3600);
          const signedByPath = new Map((signed ?? []).map((item) => [item.path, item.signedUrl]));
          setMessageMediaUrls(Object.fromEntries(nextMessages.flatMap((message) => {
            if (!message.media_url) return [];
            const url = /^https?:\/\//i.test(message.media_url) ? message.media_url : signedByPath.get(message.media_url);
            return url ? [[message.id, url]] : [];
          })));
        } else {
          setMessageMediaUrls({});
        }
      }
      await supabase
        .from("whatsapp_contacts")
        .update({ unread_count: 0 })
        .eq("id", contact.id)
        .eq("workspace_id", workspaceId);
      setContacts((current) =>
        current.map((item) =>
          item.id === contact.id ? { ...item, unread_count: 0 } : item,
        ),
      );
    },
    [workspaceId],
  );

  useEffect(() => {
    void loadContacts();
  }, [loadContacts]);
  useEffect(() => {
    void loadMessages(selected);
  }, [loadMessages, selectedId]);
  useEffect(() => {
    if (!workspaceId) return;
    const channel = supabase
      .channel(`whatsapp-inbox-${workspaceId}`)
      .on(
        "postgres_changes",
        {
          event: "*",
          schema: "public",
          table: "whatsapp_contacts",
          filter: `workspace_id=eq.${workspaceId}`,
        },
        () => void loadContacts(),
      )
      .on(
        "postgres_changes",
        {
          event: "*",
          schema: "public",
          table: "whatsapp_messages",
          filter: `workspace_id=eq.${workspaceId}`,
        },
        () => {
          void loadContacts();
          if (selected) void loadMessages(selected);
        },
      )
      .subscribe();
    return () => {
      void supabase.removeChannel(channel);
    };
  }, [workspaceId, selectedId, loadContacts, loadMessages]);
  useEffect(() => {
    if (!workspaceId) return;
    void supabase
      .from("profiles")
      .select("id,full_name")
      .eq("workspace_id", workspaceId)
      .eq("is_active", true)
      .order("full_name")
      .then(({ data }) =>
        setAgents(
          (data ?? []) as Array<{ id: string; full_name: string | null }>,
        ),
      );
  }, [workspaceId]);

  useEffect(() => {
    if (!workspaceId) return;
    const missing = contacts
      .filter((contact) => contact.phone_number && !contact.avatar_url && !requestedAvatarsRef.current.has(contact.id))
      .slice(0, 24);
    if (!missing.length) return;
    missing.forEach((contact) => requestedAvatarsRef.current.add(contact.id));
    let cancelled = false;
    void Promise.allSettled(missing.map(async (contact) => {
      const result = await callWhatsAppWorker({
        action: "profile_photo",
        workspaceId,
        payload: { phone: contact.phone_number },
      });
      const avatarUrl = typeof result?.avatar_url === "string" ? result.avatar_url : null;
      if (!avatarUrl || cancelled) return;
      await supabase.from("whatsapp_contacts").update({ avatar_url: avatarUrl }).eq("id", contact.id).eq("workspace_id", workspaceId);
      if (!cancelled) setContacts((current) => current.map((item) => item.id === contact.id ? { ...item, avatar_url: avatarUrl } : item));
    }));
    return () => { cancelled = true; };
  }, [contacts, workspaceId]);

  const visibleContacts = useMemo(
    () =>
      contacts.filter((contact) => {
        const haystack =
          `${contact.display_name ?? ""} ${contact.phone_number} ${contact.last_message ?? ""}`.toLowerCase();
        if (query && !haystack.includes(query.trim().toLowerCase()))
          return false;
        if (filter === "unread" && !contact.unread_count) return false;
        if (filter === "assigned" && contact.assigned_agent_id !== profile?.id)
          return false;
        if (filter === "ai" && !contact.ai_enabled) return false;
        if (filter === "archived" ? !contact.archived_at : contact.archived_at)
          return false;
        return true;
      }),
    [contacts, filter, profile?.id, query],
  );

  const sendMessage = async () => {
    if (!selected || !draft.trim() || !workspaceId || sending) return;
    if (!selected.phone_number) {
      toast.error("This conversation has no valid WhatsApp number");
      return;
    }
    setSending(true);
    try {
      await callWhatsAppWorker({
        action: "send",
        workspaceId,
        payload: { phone: selected.phone_number, message: draft.trim() },
      });
      setDraft("");
      await loadContacts();
      await loadMessages(selected);
    } catch (error) {
      toast.error(
        error instanceof Error ? error.message : "Unable to send message",
      );
    } finally {
      setSending(false);
    }
  };

  const sendVoiceMessage = async (
    blob: Blob,
    contact: Contact,
    durationSeconds: number,
  ) => {
    if (!workspaceId || !contact.phone_number || !contact.order_id) return;
    const mimeType = (blob.type || "audio/webm").toLowerCase();
    const extension = mimeType.includes("ogg") ? "ogg" : "webm";
    const storagePath = `${workspaceId}/${crypto.randomUUID()}.${extension}`;
    setSendingAudio(true);
    try {
      const { error: uploadError } = await supabase.storage
        .from("whatsapp-audio")
        .upload(storagePath, blob, {
          contentType: mimeType.split(";", 1)[0],
          upsert: false,
        });
      if (uploadError) throw uploadError;
      await callWhatsAppWorker({
        action: "send_audio",
        workspaceId,
        payload: {
          phone: contact.phone_number,
          order_id: contact.order_id,
          storage_path: storagePath,
          mime_type: mimeType,
          file_size: blob.size,
          duration_seconds: durationSeconds,
        },
      });
      toast.success("Voice message queued");
    } catch (error) {
      await supabase.storage.from("whatsapp-audio").remove([storagePath]);
      toast.error(
        error instanceof Error ? error.message : "Unable to send voice message",
      );
    } finally {
      setSendingAudio(false);
    }
  };

  const stopVoiceRecording = () => {
    if (mediaRecorderRef.current?.state === "recording") {
      mediaRecorderRef.current.stop();
    }
  };

  const startVoiceRecording = async () => {
    if (!selected || !workspaceId || sendingAudio) return;
    if (!selected.phone_number) {
      toast.error("This conversation has no valid WhatsApp number");
      return;
    }
    if (!selected.order_id) {
      toast.error("Voice messages require a conversation linked to an order");
      return;
    }
    if (!navigator.mediaDevices?.getUserMedia || typeof MediaRecorder === "undefined") {
      toast.error("Audio recording is not supported in this browser");
      return;
    }

    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      const mimeType = [
        "audio/webm;codecs=opus",
        "audio/ogg;codecs=opus",
        "audio/webm",
      ].find((type) => MediaRecorder.isTypeSupported(type));
      const recorder = new MediaRecorder(
        stream,
        mimeType ? { mimeType } : undefined,
      );
      const recordingContact = selected;
      audioChunksRef.current = [];
      recorder.ondataavailable = (event) => {
        if (event.data.size) audioChunksRef.current.push(event.data);
      };
      recorder.onstop = () => {
        const durationSeconds = Math.max(
          1,
          Math.round((Date.now() - recordingStartedAtRef.current) / 1000),
        );
        const blob = new Blob(audioChunksRef.current, {
          type: recorder.mimeType || "audio/webm",
        });
        stream.getTracks().forEach((track) => track.stop());
        audioStreamRef.current = null;
        mediaRecorderRef.current = null;
        setRecording(false);
        if (!blob.size) {
          toast.error("The voice recording was empty");
          return;
        }
        void sendVoiceMessage(blob, recordingContact, durationSeconds);
      };
      audioStreamRef.current = stream;
      mediaRecorderRef.current = recorder;
      recordingStartedAtRef.current = Date.now();
      recorder.start(500);
      setRecording(true);
    } catch {
      toast.error("Microphone access was denied");
    }
  };

  const insertEmoji = (emoji: string) => {
    const textarea = textareaRef.current;
    const start = textarea?.selectionStart ?? draft.length;
    const end = textarea?.selectionEnd ?? draft.length;
    setDraft(`${draft.slice(0, start)}${emoji}${draft.slice(end)}`);
    setEmojiOpen(false);
    requestAnimationFrame(() => {
      textarea?.focus();
      textarea?.setSelectionRange(start + emoji.length, start + emoji.length);
    });
  };

  const sendAttachment = async (file: File) => {
    if (!selected || !workspaceId || !selected.phone_number || sendingAttachment) return;
    if (!acceptedMediaTypes.has(file.type)) {
      toast.error("Use an image, PDF, Word, Excel, ZIP, or text file");
      return;
    }
    if (!file.size || file.size > 16 * 1024 * 1024) {
      toast.error("Attachment must be smaller than 16 MB");
      return;
    }
    const safeName = file.name.replace(/[^a-zA-Z0-9._-]+/g, "_").slice(-120) || "attachment";
    const storagePath = `${workspaceId}/${crypto.randomUUID()}-${safeName}`;
    setSendingAttachment(true);
    try {
      const { error: uploadError } = await supabase.storage.from("whatsapp-media").upload(storagePath, file, {
        contentType: file.type,
        upsert: false,
      });
      if (uploadError) throw uploadError;
      await callWhatsAppWorker({
        action: "send_media",
        workspaceId,
        payload: {
          phone: selected.phone_number,
          order_id: selected.order_id,
          storage_path: storagePath,
          mime_type: file.type,
          file_size: file.size,
          file_name: file.name,
          kind: file.type.startsWith("image/") ? "image" : "document",
        },
      });
      toast.success(file.type.startsWith("image/") ? "Image sent" : "File sent");
      await loadContacts();
      await loadMessages(selected);
    } catch (error) {
      await supabase.storage.from("whatsapp-media").remove([storagePath]);
      toast.error(error instanceof Error ? error.message : "Unable to send attachment");
    } finally {
      setSendingAttachment(false);
      if (attachmentInputRef.current) attachmentInputRef.current.value = "";
    }
  };

  useEffect(() => () => {
    const recorder = mediaRecorderRef.current;
    if (recorder?.state === "recording") {
      recorder.onstop = null;
      recorder.stop();
    }
    audioStreamRef.current?.getTracks().forEach((track) => track.stop());
  }, []);

  const updateContact = async (patch: Partial<Contact>) => {
    if (!selected || !workspaceId) return;
    const { error } = await supabase
      .from("whatsapp_contacts")
      .update(patch)
      .eq("id", selected.id)
      .eq("workspace_id", workspaceId);
    if (error) toast.error(error.message);
    else await loadContacts();
  };

  return (
    <section className="relative h-full min-h-0 w-full overflow-hidden bg-[#f0f2f5] text-[#111b21] dark:bg-[#111b21] dark:text-[#e9edef]">
      <div
        className={`grid h-full min-h-0 w-full grid-cols-1 overflow-hidden bg-white dark:bg-[#111b21] ${detailsOpen && selected ? "md:grid-cols-[minmax(310px,34%)_minmax(0,1fr)] xl:grid-cols-[360px_minmax(420px,1fr)_340px]" : "md:grid-cols-[minmax(320px,38%)_minmax(0,1fr)] lg:grid-cols-[400px_minmax(0,1fr)]"}`}
      >
        <aside
          className={`${selected ? "hidden md:flex" : "flex"} min-h-0 min-w-0 flex-col border-r border-[#d8dfe3] bg-white dark:border-[#222d34] dark:bg-[#111b21]`}
        >
          <header className="flex h-[60px] shrink-0 items-center gap-3 bg-[#f0f2f5] px-4 dark:bg-[#202c33]">
            <img
              src={whatsappLogo}
              alt="WhatsApp"
              className="h-10 w-10 rounded-full object-cover shadow-sm"
            />
            <div className="min-w-0 flex-1">
              <strong className="block truncate text-[15px]">WhatsApp</strong>
              <span className="block truncate text-[11px] text-[#667781] dark:text-[#8696a0]">
                {workspace?.name || "Business inbox"}
              </span>
            </div>
            <RoundIconButton
              label="Automations"
              onClick={() => navigate("/settings?tab=integrations")}
            >
              <Bot size={20} />
            </RoundIconButton>
            <RoundIconButton
              label="WhatsApp settings"
              onClick={() => navigate("/settings?tab=integrations")}
            >
              <MoreVertical size={20} />
            </RoundIconButton>
          </header>
          <div className="border-b border-[#e9edef] bg-white px-3 py-2 dark:border-[#222d34] dark:bg-[#111b21]">
            <div className="relative">
              <Search
                size={17}
                className="pointer-events-none absolute left-4 top-1/2 -translate-y-1/2 text-[#667781]"
              />
              <input
                value={query}
                onChange={(event) => setQuery(event.target.value)}
                placeholder="Search or start new chat"
                className="h-9 w-full rounded-lg border-0 bg-[#f0f2f5] pl-11 pr-4 text-[13px] outline-none placeholder:text-[#667781] dark:bg-[#202c33] dark:placeholder:text-[#8696a0]"
              />
            </div>
            <div className="mt-2 flex gap-1.5 overflow-x-auto pb-0.5">
              {(["all", "unread", "assigned", "ai", "archived"] as const).map(
                (item) => (
                  <button
                    type="button"
                    key={item}
                    onClick={() => setFilter(item)}
                    className={`shrink-0 rounded-full border px-3 py-1.5 text-xs font-medium transition ${filter === item ? "border-[#d9fdd3] bg-[#e7fce3] text-[#008069] dark:border-[#005c4b] dark:bg-[#005c4b] dark:text-[#e9edef]" : "border-[#e1e5e7] bg-white text-[#54656f] hover:bg-[#f5f6f6] dark:border-[#2a3942] dark:bg-[#111b21] dark:text-[#8696a0] dark:hover:bg-[#202c33]"}`}
                  >
                    {item === "assigned"
                      ? "Assigned to me"
                      : item[0].toUpperCase() + item.slice(1)}
                  </button>
                ),
              )}
            </div>
          </div>
          <div className="min-h-0 flex-1 overflow-y-auto">
            {visibleContacts.map((contact) => {
              const name = contactName(contact);
              return (
                <button
                  type="button"
                  key={contact.id}
                  onClick={() => {
                    setSelectedId(contact.id);
                    setDetailsOpen(false);
                  }}
                  className={`group flex w-full items-center gap-3 px-3 text-left transition hover:bg-[#f5f6f6] dark:hover:bg-[#202c33] ${selectedId === contact.id ? "bg-[#f0f2f5] dark:bg-[#2a3942]" : ""}`}
                >
                  <Avatar name={name} src={contact.avatar_url} />
                  <span className="min-w-0 flex-1 border-b border-[#e9edef] py-3 pr-2 dark:border-[#222d34]">
                    <span className="flex items-center justify-between gap-3">
                      <strong className="truncate text-[15px] font-normal">
                        {name}
                      </strong>
                      <small
                        className={`shrink-0 text-[11px] ${contact.unread_count ? "font-semibold text-[#1fa855]" : "text-[#667781] dark:text-[#8696a0]"}`}
                      >
                        {formatTime(contact.last_message_at)}
                      </small>
                    </span>
                    <span className="mt-0.5 flex items-center gap-1.5">
                      {contact.last_message_direction === "outbound" && (
                        <CheckCheck
                          size={15}
                          className="shrink-0 text-[#53bdeb]"
                        />
                      )}
                      <span className="min-w-0 flex-1 truncate text-[13px] text-[#667781] dark:text-[#8696a0]">
                        {contact.last_message || "No messages yet"}
                      </span>
                      {contact.ai_enabled && (
                        <Bot size={14} className="shrink-0 text-[#00a884]" />
                      )}
                      {contact.unread_count > 0 && (
                        <b className="grid h-[19px] min-w-[19px] place-items-center rounded-full bg-[#25d366] px-1 text-[10px] text-white">
                          {contact.unread_count}
                        </b>
                      )}
                    </span>
                  </span>
                </button>
              );
            })}
            {!visibleContacts.length && (
              <div className="px-8 py-16 text-center text-sm text-[#667781] dark:text-[#8696a0]">
                <img
                  src={whatsappLogo}
                  alt=""
                  className="mx-auto mb-4 h-14 w-14 rounded-full opacity-80"
                />
                <p className="font-medium text-[#3b4a54] dark:text-[#d1d7db]">
                  No conversations found
                </p>
                <p className="mt-1 text-xs">
                  New messages from your connected worker will appear here.
                </p>
              </div>
            )}
          </div>
        </aside>

        <main
          className={`${selected ? "flex" : "hidden md:flex"} min-h-0 min-w-0 flex-col bg-[#efeae2] dark:bg-[#0b141a]`}
        >
          {selected ? (
            <>
              <header className="z-10 flex h-[60px] shrink-0 items-center gap-3 border-b border-[#d8dfe3] bg-[#f0f2f5] px-3 dark:border-[#222d34] dark:bg-[#202c33]">
                <button
                  type="button"
                  aria-label="Back to conversations"
                  onClick={() => setSelectedId(null)}
                  className="grid h-10 w-10 place-items-center rounded-full text-[#54656f] md:hidden"
                >
                  <ChevronLeft size={22} />
                </button>
                <button
                  type="button"
                  onClick={() => setDetailsOpen(true)}
                  className="flex min-w-0 flex-1 items-center gap-3 text-left"
                >
                  <Avatar
                    name={contactName(selected)}
                    src={selected.avatar_url}
                  />
                  <span className="min-w-0">
                    <strong className="block truncate text-[15px] font-normal">
                      {contactName(selected)}
                    </strong>
                    <span className="block truncate text-xs text-[#667781] dark:text-[#8696a0]">
                      {selected.phone_number}
                    </span>
                  </span>
                </button>
                <RoundIconButton label="Search in conversation">
                  <Search size={19} />
                </RoundIconButton>
                <RoundIconButton label="Conversation menu">
                  <MoreVertical size={20} />
                </RoundIconButton>
              </header>
              <div
                className="min-h-0 flex-1 overflow-y-auto px-[5%] py-5 lg:px-[8%]"
                style={{
                  backgroundImage:
                    "radial-gradient(circle at 18px 18px, rgba(84,101,111,.055) 1.2px, transparent 1.2px)",
                  backgroundSize: "36px 36px",
                }}
              >
                {messages.map((message, index) => {
                  const previous = messages[index - 1];
                  const currentDay = formatDay(message.created_at);
                  const showDay = Boolean(currentDay) &&
                    (!previous || formatDay(previous.created_at) !== currentDay);
                  const outbound = message.direction === "outbound";
                  return (
                    <div key={message.id}>
                      {showDay && (
                        <div className="my-4 flex justify-center">
                          <span className="rounded-lg bg-white px-3 py-1.5 text-[11px] font-medium uppercase tracking-wide text-[#54656f] shadow-sm dark:bg-[#182229] dark:text-[#8696a0]">
                            {currentDay}
                          </span>
                        </div>
                      )}
                      <div
                        className={`mb-1.5 flex ${outbound ? "justify-end" : "justify-start"}`}
                      >
                        <div
                          className={`relative max-w-[82%] rounded-lg px-2.5 pb-1.5 pt-1.5 text-[14px] leading-5 shadow-sm md:max-w-[68%] ${outbound ? "rounded-tr-none bg-[#d9fdd3] dark:bg-[#005c4b]" : "rounded-tl-none bg-white dark:bg-[#202c33]"}`}
                        >
                          {messageMediaUrls[message.id] && isImageMessage(message) && (
                            <a href={messageMediaUrls[message.id]} target="_blank" rel="noreferrer" className="mb-1 block overflow-hidden rounded-md">
                              <img src={messageMediaUrls[message.id]} alt={message.body || "WhatsApp image"} className="max-h-80 w-full object-cover" />
                            </a>
                          )}
                          {messageMediaUrls[message.id] && !isImageMessage(message) && (
                            <a href={messageMediaUrls[message.id]} target="_blank" rel="noreferrer" className="mb-1 flex min-w-[220px] items-center gap-3 rounded-md bg-black/[0.06] p-3 hover:bg-black/10 dark:bg-white/10">
                              <FileText size={25} className="shrink-0" />
                              <span className="min-w-0 flex-1 truncate">{message.body || "Open attachment"}</span>
                            </a>
                          )}
                          {(!message.media_url || (isImageMessage(message) && message.body)) && (
                            <p className="whitespace-pre-wrap break-words pr-12">
                              {message.body || `[${message.message_type}]`}
                            </p>
                          )}
                          <span className="absolute bottom-1 right-1.5 flex items-center gap-0.5 text-[10px] text-[#667781] dark:text-[#aebac1]">
                            {formatTime(message.created_at)}
                            {outbound &&
                              (message.status === "read" ? (
                                <CheckCheck
                                  size={15}
                                  className="text-[#53bdeb]"
                                />
                              ) : message.status === "delivered" ? (
                                <CheckCheck size={15} />
                              ) : (
                                <Check size={15} />
                              ))}
                          </span>
                        </div>
                      </div>
                    </div>
                  );
                })}
                {!messages.length && (
                  <div className="grid h-full place-items-center">
                    <span className="rounded-lg bg-[#ffeecd] px-4 py-2 text-center text-xs text-[#54656f] shadow-sm dark:bg-[#182229] dark:text-[#8696a0]">
                      Messages are managed by your connected open-source worker.
                    </span>
                  </div>
                )}
              </div>
              <footer className="sticky bottom-0 z-20 flex min-h-[62px] shrink-0 items-end gap-1 border-t border-[#d8dfe3] bg-[#f0f2f5] px-2 py-2 dark:border-[#222d34] dark:bg-[#202c33] md:px-3">
                {emojiOpen && (
                  <div className="absolute bottom-[58px] left-2 z-30 grid w-[280px] grid-cols-8 gap-1 rounded-xl border border-[#d8dfe3] bg-white p-2 shadow-xl dark:border-[#374045] dark:bg-[#202c33]">
                    {commonEmoji.map((emoji) => <button key={emoji} type="button" onClick={() => insertEmoji(emoji)} className="grid h-8 place-items-center rounded-lg text-lg hover:bg-black/[0.06] dark:hover:bg-white/10">{emoji}</button>)}
                  </div>
                )}
                <RoundIconButton label="Emoji" onClick={() => setEmojiOpen((open) => !open)}>
                  <Smile size={23} />
                </RoundIconButton>
                <RoundIconButton label="Attach image or file" onClick={() => attachmentInputRef.current?.click()}>
                  <Paperclip size={22} />
                </RoundIconButton>
                <input
                  ref={attachmentInputRef}
                  type="file"
                  className="hidden"
                  accept="image/jpeg,image/png,image/webp,image/gif,application/pdf,.doc,.docx,.xls,.xlsx,.zip,.txt"
                  onChange={(event) => { const file = event.target.files?.[0]; if (file) void sendAttachment(file); }}
                />
                <textarea
                  ref={textareaRef}
                  value={draft}
                  onChange={(event) => setDraft(event.target.value)}
                  disabled={recording || sendingAudio || sendingAttachment}
                  onKeyDown={(event) => {
                    if (event.key === "Enter" && !event.shiftKey) {
                      event.preventDefault();
                      void sendMessage();
                    }
                  }}
                  rows={1}
                  placeholder={recording ? "Recording… click the microphone to send" : sendingAudio ? "Sending voice message…" : sendingAttachment ? "Sending attachment…" : "Type a message"}
                  aria-label="Message"
                  className="max-h-28 min-h-[42px] flex-1 resize-none rounded-lg border-0 bg-white px-3 py-2.5 text-[14px] outline-none placeholder:text-[#667781] dark:bg-[#2a3942] dark:placeholder:text-[#8696a0]"
                />
                {draft.trim() ? (
                  <button
                    type="button"
                    disabled={sending}
                    onClick={() => void sendMessage()}
                    className="grid h-10 w-10 shrink-0 place-items-center rounded-full text-[#54656f] hover:bg-black/[0.06] disabled:opacity-40 dark:text-[#aebac1]"
                    aria-label="Send message"
                  >
                    <Send size={22} />
                  </button>
                ) : (
                  <button
                    type="button"
                    disabled={sendingAudio}
                    onClick={() => recording ? stopVoiceRecording() : void startVoiceRecording()}
                    className={`grid h-10 w-10 shrink-0 place-items-center rounded-full transition disabled:opacity-40 ${recording ? "animate-pulse bg-red-500 text-white" : "text-[#54656f] hover:bg-black/[0.06] dark:text-[#aebac1]"}`}
                    aria-label={recording ? "Stop and send voice message" : "Record voice message"}
                    title={recording ? "Stop and send" : "Record voice message"}
                  >
                    <Mic size={22} />
                  </button>
                )}
              </footer>
            </>
          ) : (
            <div className="grid h-full place-items-center border-b-[6px] border-[#25d366] bg-[#f8f9fa] px-8 text-center dark:bg-[#222e35]">
              <div className="max-w-md">
                <img
                  src={whatsappLogo}
                  alt="WhatsApp"
                  className="mx-auto h-24 w-24 rounded-full shadow-lg"
                />
                <h2 className="mt-7 text-[28px] font-light text-[#41525d] dark:text-[#e9edef]">
                  WhatsApp for Ecom OS
                </h2>
                <p className="mt-3 text-sm leading-6 text-[#667781] dark:text-[#8696a0]">
                  Select a conversation to view messages and help customers from
                  your desktop.
                </p>
                <div className="mx-auto mt-8 h-px max-w-xs bg-[#e1e5e7] dark:bg-[#374045]" />
                <p className="mt-5 flex items-center justify-center gap-2 text-xs text-[#8696a0]">
                  <img
                    src={whatsappLogo}
                    alt=""
                    className="h-4 w-4 rounded-full"
                  />
                  Connected through your open-source WhatsApp worker
                </p>
              </div>
            </div>
          )}
        </main>

        {selected && detailsOpen && (
          <aside className="fixed inset-0 z-40 min-h-0 overflow-y-auto bg-white dark:bg-[#111b21] md:absolute md:left-auto md:right-0 md:top-0 md:w-[340px] md:border-l md:border-[#d8dfe3] xl:static xl:z-auto xl:w-auto dark:md:border-[#222d34]">
            <header className="flex h-[60px] items-center gap-5 bg-[#f0f2f5] px-4 dark:bg-[#202c33]">
              <RoundIconButton
                label="Close contact info"
                onClick={() => setDetailsOpen(false)}
              >
                <X size={21} />
              </RoundIconButton>
              <span className="text-[15px]">Contact info</span>
            </header>
            <div className="border-b border-[#e9edef] bg-white px-5 py-7 text-center shadow-sm dark:border-[#222d34] dark:bg-[#111b21]">
              <div className="flex justify-center">
                <Avatar
                  name={contactName(selected)}
                  src={selected.avatar_url}
                  large
                />
              </div>
              <h2 className="mt-4 text-xl font-normal">
                {selected.display_name || "Unknown customer"}
              </h2>
              <p className="mt-1 text-sm text-[#667781] dark:text-[#8696a0]">
                {selected.phone_number}
              </p>
            </div>
            <div className="mt-2 border-y border-[#e9edef] bg-white p-4 dark:border-[#222d34] dark:bg-[#111b21]">
              <div className="flex items-center justify-between">
                <span className="flex items-center gap-3 text-sm">
                  <Bot size={19} className="text-[#00a884]" /> AI assistant
                </span>
                <button
                  type="button"
                  onClick={() =>
                    void updateContact({ ai_enabled: !selected.ai_enabled })
                  }
                  className={`relative h-5 w-9 rounded-full transition ${selected.ai_enabled ? "bg-[#00a884]" : "bg-[#8696a0]"}`}
                  aria-label="Toggle AI assistant"
                >
                  <span
                    className={`absolute top-0.5 h-4 w-4 rounded-full bg-white shadow transition ${selected.ai_enabled ? "left-[18px]" : "left-0.5"}`}
                  />
                </button>
              </div>
            </div>
            <div className="mt-2 border-y border-[#e9edef] bg-white p-4 dark:border-[#222d34] dark:bg-[#111b21]">
              <label className="text-xs text-[#667781] dark:text-[#8696a0]">
                Assigned agent
              </label>
              <div className="mt-2 flex items-center gap-3">
                <Users size={19} className="text-[#667781]" />
                <select
                  value={selected.assigned_agent_id ?? ""}
                  onChange={(event) =>
                    void updateContact({
                      assigned_agent_id: event.target.value || null,
                    })
                  }
                  className="h-9 min-w-0 flex-1 border-0 border-b border-[#d8dfe3] bg-transparent text-sm outline-none focus:border-[#00a884] dark:border-[#374045]"
                >
                  <option value="">Unassigned</option>
                  {agents.map((agent) => (
                    <option key={agent.id} value={agent.id}>
                      {agent.full_name || agent.id}
                    </option>
                  ))}
                </select>
              </div>
            </div>
            <div className="mt-2 grid bg-white dark:bg-[#111b21]">
              <button
                type="button"
                onClick={() => navigate("/customers")}
                className="flex items-center gap-5 border-b border-[#e9edef] px-5 py-4 text-left text-sm hover:bg-[#f5f6f6] dark:border-[#222d34] dark:hover:bg-[#202c33]"
              >
                <UserRound size={20} /> Open customer
              </button>
              <button
                type="button"
                onClick={() => navigate("/orders")}
                className="flex items-center gap-5 border-b border-[#e9edef] px-5 py-4 text-left text-sm hover:bg-[#f5f6f6] dark:border-[#222d34] dark:hover:bg-[#202c33]"
              >
                <FileText size={20} /> Open order
              </button>
              <button
                type="button"
                onClick={() => navigate("/settings?tab=integrations")}
                className="flex items-center gap-5 border-b border-[#e9edef] px-5 py-4 text-left text-sm hover:bg-[#f5f6f6] dark:border-[#222d34] dark:hover:bg-[#202c33]"
              >
                <Settings size={20} /> Automation settings
              </button>
              <button
                type="button"
                onClick={() =>
                  void updateContact({
                    archived_at: selected.archived_at
                      ? null
                      : new Date().toISOString(),
                  })
                }
                className="flex items-center gap-5 px-5 py-4 text-left text-sm text-red-600 hover:bg-red-50 dark:hover:bg-red-950/20"
              >
                <Archive size={20} />{" "}
                {selected.archived_at ? "Unarchive chat" : "Archive chat"}
              </button>
            </div>
          </aside>
        )}
      </div>
    </section>
  );
}
