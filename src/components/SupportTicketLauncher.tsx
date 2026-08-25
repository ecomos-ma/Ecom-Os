import { useState, type FormEvent } from "react";
import { Loader2, MessageCircleQuestion, Send, X } from "lucide-react";
import { supabase } from "../lib/supabase";
import { useAuth } from "../hooks/useAuth";
import { toast } from "./Toast";

/** Small tenant-facing entry point for the founder-managed support ticket queue. */
export function SupportTicketLauncher() {
  const { session, workspace } = useAuth();
  const [open, setOpen] = useState(false);
  const [subject, setSubject] = useState("");
  const [message, setMessage] = useState("");
  const [priority, setPriority] = useState("normal");
  const [saving, setSaving] = useState(false);

  if (!session) return null;

  const submit = async (event: FormEvent) => {
    event.preventDefault();
    if (!subject.trim() || !message.trim()) return;
    setSaving(true);
    const { error } = await supabase.from("support_tickets").insert({
      created_by: session.user.id,
      workspace_id: workspace?.id || null,
      subject: subject.trim(),
      message: message.trim(),
      priority,
    });
    setSaving(false);
    if (error) { toast.error(error.message); return; }
    setSubject(""); setMessage(""); setPriority("normal"); setOpen(false);
    toast.success("Support ticket sent. We will reply in EcomOS.");
  };

  return <>
    <button onClick={() => setOpen(true)} className="fixed bottom-5 right-5 z-30 inline-flex h-11 items-center gap-2 rounded-full bg-brand-accent px-4 text-sm font-bold text-white shadow-lg shadow-brand-accent/25 transition hover:bg-brand-accentHover" aria-label="Open support ticket form"><MessageCircleQuestion size={18} /><span className="hidden sm:inline">Support</span></button>
    {open && <div className="fixed inset-0 z-50 grid place-items-end bg-slate-950/35 p-4 sm:place-items-center" role="dialog" aria-modal="true" aria-label="Contact support"><form onSubmit={submit} className="w-full max-w-md rounded-2xl border border-base-border bg-base-surface p-5 shadow-2xl"><div className="flex items-start justify-between gap-3"><div><h2 className="font-bold">Contact EcomOS support</h2><p className="mt-1 text-sm text-ink-muted">Your workspace and account are attached automatically.</p></div><button type="button" onClick={() => setOpen(false)} className="rounded-lg p-2 text-ink-muted hover:bg-base-raised"><X size={18} /></button></div><label className="mt-5 block text-xs font-bold uppercase tracking-wide text-ink-faint">Subject<input value={subject} onChange={(event) => setSubject(event.target.value)} required minLength={3} maxLength={180} className="mt-2 w-full rounded-lg border border-base-border bg-base-raised px-3 py-2.5 text-sm outline-none focus:border-brand-accent/60" /></label><label className="mt-4 block text-xs font-bold uppercase tracking-wide text-ink-faint">Priority<select value={priority} onChange={(event) => setPriority(event.target.value)} className="mt-2 w-full rounded-lg border border-base-border bg-base-raised px-3 py-2.5 text-sm outline-none focus:border-brand-accent/60"><option value="low">Low</option><option value="normal">Normal</option><option value="high">High</option><option value="urgent">Urgent</option></select></label><label className="mt-4 block text-xs font-bold uppercase tracking-wide text-ink-faint">How can we help?<textarea value={message} onChange={(event) => setMessage(event.target.value)} required minLength={3} maxLength={5000} rows={5} className="mt-2 w-full resize-y rounded-lg border border-base-border bg-base-raised px-3 py-2.5 text-sm outline-none focus:border-brand-accent/60" /></label><button disabled={saving || !subject.trim() || !message.trim()} className="mt-5 inline-flex w-full items-center justify-center gap-2 rounded-lg bg-brand-accent px-3 py-2.5 text-sm font-bold text-white hover:bg-brand-accentHover disabled:opacity-50">{saving ? <Loader2 className="animate-spin" size={16} /> : <Send size={16} />}{saving ? "Sending…" : "Send ticket"}</button></form></div>}
  </>;
}
