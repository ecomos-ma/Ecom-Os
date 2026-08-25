import { useCallback, useEffect, useState } from "react";
import { AlertTriangle, ArrowRight, CheckCircle2, CircleHelp, Clock3, Database, KeyRound, Loader2, MessageSquareText, Send, ShieldCheck, type LucideIcon } from "lucide-react";
import { Link } from "react-router-dom";
import { supabase } from "../../../lib/supabase";
import { founderAdmin, type FounderEvent, type HealthOverview, type SupportTicket } from "../../../lib/founderAdmin";
import { EmptyState, EventLine, PageHeading, RefreshButton, StatusBadge, errorMessage, dateTime } from "./shared";

export function OperationsPage() {
  const [health, setHealth] = useState<HealthOverview | null>(null);
  const [events, setEvents] = useState<FounderEvent[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const load = useCallback(async () => {
    setLoading(true); setError("");
    try {
      const [overview, eventRes] = await Promise.all([founderAdmin.health(), supabase.from("founder_audit_events").select("id, action, target_type, target_id, reason, created_at").order("created_at", { ascending: false }).limit(25)]);
      if (eventRes.error) throw eventRes.error;
      setHealth(overview); setEvents((eventRes.data || []) as FounderEvent[]);
    } catch (err) { setError(errorMessage(err)); } finally { setLoading(false); }
  }, []);
  useEffect(() => { void load(); }, [load]);
  return <div className="mx-auto max-w-7xl p-4 md:p-6 lg:p-8">
    <PageHeading eyebrow="Operations" title="System Health & Problem Center" description="Live database and provider-pool checks. A healthy state is generated from live system records—not static UI values." action={<RefreshButton onClick={() => void load()} loading={loading} />} />
    {error ? <EmptyState title="Operations data is unavailable" copy={error} /> : <>
      <div className="grid gap-4 md:grid-cols-3"><HealthCard title="Database" value={health?.database.label || "Checking"} status={health?.database.status || "warning"} icon={Database} /><HealthCard title="Shared Tools" value={`${health?.tools.enabled_providers ?? 0} providers enabled`} status={health?.tools.status || "warning"} icon={KeyRound} /><HealthCard title="Provider failures · 24h" value={(health?.recent_failures ?? 0).toLocaleString()} status={(health?.recent_failures ?? 0) > 0 ? "warning" : "healthy"} icon={AlertTriangle} /></div>
      <div className="mt-6 grid gap-5 xl:grid-cols-[1.1fr_0.9fr]"><article className="rounded-xl border border-base-border bg-base-surface p-5 shadow-sm"><h3 className="font-bold">Activity & repair history</h3><p className="mt-1 text-sm text-ink-muted">Security-sensitive control actions and support access events.</p><div className="mt-5 space-y-3">{loading ? <Loader2 className="mx-auto my-10 animate-spin text-brand-accent" /> : events.length ? events.map((event) => <EventLine key={event.id} event={event} />) : <EmptyState title="No activity yet" copy="Founder actions will be recorded here." />}</div></article><article className="rounded-xl border border-base-border bg-base-surface p-5 shadow-sm"><h3 className="font-bold">Safe repair actions</h3><p className="mt-1 text-sm text-ink-muted">Only explicit, reversible actions are available from the console.</p><div className="mt-5 space-y-3"><Triage link="/admin/ai-tools/providers" icon={KeyRound} title="Review provider pool" detail={`${health?.recent_failures ?? 0} failed requests in the last 24 hours`} status={(health?.recent_failures ?? 0) ? "warning" : "healthy"} /><Triage link="/admin/support" icon={CircleHelp} title="Resolve support queue" detail={`${health?.open_tickets ?? 0} tickets need attention`} status={(health?.open_tickets ?? 0) ? "warning" : "healthy"} /><Triage link="/admin/workspaces" icon={ShieldCheck} title="Workspace intervention" detail="Use time-limited Support Mode or suspend a workspace with an audit reason." status="healthy" /></div></article></div>
    </>}
  </div>;
}

export function SupportPage() {
  const [tickets, setTickets] = useState<SupportTicket[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [activeSession, setActiveSession] = useState<{ id: string; workspace_name: string; expires_at: string } | null>(null);
  const [selectedTicket, setSelectedTicket] = useState<SupportTicket | null>(null);
  const load = useCallback(async () => { setLoading(true); setError(""); try { setTickets(await founderAdmin.tickets()); } catch (err) { setError(errorMessage(err)); } finally { setLoading(false); } }, []);
  useEffect(() => {
    void load();
    const raw = window.localStorage.getItem("ecomos-founder-support-session");
    if (!raw) return;
    try { const parsed = JSON.parse(raw); if (new Date(parsed.expires_at) > new Date()) setActiveSession(parsed); else window.localStorage.removeItem("ecomos-founder-support-session"); } catch { window.localStorage.removeItem("ecomos-founder-support-session"); }
  }, [load]);
  const endSession = async () => {
    if (!activeSession) return;
    try { await founderAdmin.endSupport(activeSession.id); window.localStorage.removeItem("ecomos-founder-support-session"); setActiveSession(null); } catch (err) { window.alert(errorMessage(err)); }
  };
  return <div className="mx-auto max-w-7xl p-4 md:p-6 lg:p-8">
    <PageHeading eyebrow="Support" title="Tickets & Support Mode" description="Support requests are real database records. Founder workspace sessions are audit logged, expire after 30 minutes, and can be terminated immediately." action={<RefreshButton onClick={() => void load()} loading={loading} />} />
    {activeSession && <div className="mb-5 flex flex-wrap items-center justify-between gap-3 rounded-xl border border-brand-accent/30 bg-brand-accent/10 p-4"><div className="flex gap-3"><ShieldCheck className="mt-0.5 text-brand-accent" size={20} /><div><p className="font-bold">Support Mode active: {activeSession.workspace_name}</p><p className="text-sm text-ink-muted">Automatically expires {dateTime.format(new Date(activeSession.expires_at))}.</p></div></div><button onClick={() => void endSession()} className="rounded-lg bg-base-surface px-3 py-2 text-sm font-bold text-danger shadow-sm">End session now</button></div>}
    {error ? <EmptyState title="Could not load tickets" copy={error} /> : <div className="grid gap-4 lg:grid-cols-2">{loading ? <div className="col-span-full grid h-52 place-items-center"><Loader2 className="animate-spin text-brand-accent" /></div> : tickets.length ? tickets.map((ticket) => <article key={ticket.id} className="rounded-xl border border-base-border bg-base-surface p-5 shadow-sm"><div className="flex flex-wrap items-start justify-between gap-3"><div className="min-w-0"><h3 className="truncate font-bold">{ticket.subject}</h3><p className="mt-1 text-xs text-ink-muted">{ticket.requester_email || "Unknown requester"} · {ticket.workspace_name || "No workspace"}</p></div><div className="flex gap-1.5"><StatusBadge value={ticket.priority} /><StatusBadge value={ticket.status} /></div></div><p className="mt-4 line-clamp-3 text-sm leading-6 text-ink-muted">{ticket.message}</p><div className="mt-5 flex items-center justify-between"><p className="text-xs text-ink-faint">Updated {dateTime.format(new Date(ticket.updated_at))}</p><button onClick={() => setSelectedTicket(ticket)} className="inline-flex items-center gap-1.5 rounded-lg bg-brand-accent px-3 py-2 text-xs font-bold text-white hover:bg-brand-accentHover"><MessageSquareText size={14} /> Manage</button></div></article>) : <div className="col-span-full"><EmptyState title="No support tickets" copy="Tickets submitted by your users will show up here." /></div>}</div>}
  </div>;
}

export function CommunicationsPage() {
  const [items, setItems] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [title, setTitle] = useState("");
  const [body, setBody] = useState("");
  const [saving, setSaving] = useState(false);
  const load = useCallback(async () => { setLoading(true); setError(""); try { const { data, error: queryError } = await supabase.from("founder_announcements").select("id, title, body, audience, status, publish_at, created_at").order("created_at", { ascending: false }).limit(50); if (queryError) throw queryError; setItems(data || []); } catch (err) { setError(errorMessage(err)); } finally { setLoading(false); } }, []);
  useEffect(() => { void load(); }, [load]);
  const publish = async (event: React.FormEvent) => { event.preventDefault(); if (!title.trim() || !body.trim()) return; setSaving(true); try { const { error: saveError } = await supabase.from("founder_announcements").insert({ title: title.trim(), body: body.trim(), status: "published", audience: "all", publish_at: new Date().toISOString() }); if (saveError) throw saveError; setTitle(""); setBody(""); await load(); } catch (err) { window.alert(errorMessage(err)); } finally { setSaving(false); } };
  return <div className="mx-auto max-w-7xl p-4 md:p-6 lg:p-8"><PageHeading eyebrow="Communications" title="Announcements" description="Publish real, database-backed announcements to all users. Existing messages remain available in the founder control plane." action={<RefreshButton onClick={() => void load()} loading={loading} />} />
    <div className="grid gap-5 xl:grid-cols-[0.85fr_1.15fr]"><form onSubmit={publish} className="h-fit rounded-xl border border-base-border bg-base-surface p-5 shadow-sm"><div className="flex items-center gap-3"><div className="rounded-lg bg-brand-accent/10 p-2 text-brand-accent"><Send size={18} /></div><div><h3 className="font-bold">New announcement</h3><p className="text-sm text-ink-muted">Sent to all workspaces immediately.</p></div></div><label className="mt-5 block text-xs font-bold uppercase tracking-wide text-ink-faint">Title<input value={title} onChange={(event) => setTitle(event.target.value)} maxLength={160} className="mt-2 w-full rounded-lg border border-base-border bg-base-raised px-3 py-2.5 text-sm outline-none focus:border-brand-accent/60" /></label><label className="mt-4 block text-xs font-bold uppercase tracking-wide text-ink-faint">Message<textarea value={body} onChange={(event) => setBody(event.target.value)} maxLength={5000} rows={5} className="mt-2 w-full resize-y rounded-lg border border-base-border bg-base-raised px-3 py-2.5 text-sm outline-none focus:border-brand-accent/60" /></label><button disabled={saving || !title.trim() || !body.trim()} className="mt-4 inline-flex items-center gap-2 rounded-lg bg-brand-accent px-3 py-2.5 text-sm font-bold text-white hover:bg-brand-accentHover disabled:opacity-50"><Send size={15} /> {saving ? "Publishing…" : "Publish announcement"}</button></form>
      <section className="rounded-xl border border-base-border bg-base-surface p-5 shadow-sm"><h3 className="font-bold">Communication history</h3><div className="mt-4 space-y-3">{loading ? <Loader2 className="mx-auto my-10 animate-spin text-brand-accent" /> : error ? <EmptyState title="Could not load announcements" copy={error} /> : items.length ? items.map((item) => <article key={item.id} className="rounded-lg bg-base-raised p-4"><div className="flex items-start justify-between gap-3"><div><p className="font-semibold">{item.title}</p><p className="mt-1 text-sm leading-5 text-ink-muted">{item.body}</p></div><StatusBadge value={item.status} /></div><p className="mt-3 text-xs text-ink-faint">{item.publish_at ? dateTime.format(new Date(item.publish_at)) : dateTime.format(new Date(item.created_at))} · {item.audience}</p></article>) : <EmptyState title="No announcements" copy="Your published messages will appear here." />}</div></section></div>
  </div>;
}

function HealthCard({ title, value, status, icon: Icon }: { title: string; value: string; status: string; icon: LucideIcon }) { return <article className="rounded-xl border border-base-border bg-base-surface p-5 shadow-sm"><div className="flex items-start justify-between"><div className="rounded-lg bg-brand-accent/10 p-2 text-brand-accent"><Icon size={18} /></div><StatusBadge value={status} /></div><p className="mt-5 text-lg font-bold">{value}</p><p className="mt-1 text-sm text-ink-muted">{title}</p></article>; }
function Triage({ icon: Icon, title, detail, status, link }: { icon: LucideIcon; title: string; detail: string; status: string; link: string }) { return <Link to={link} className="flex items-center gap-3 rounded-lg bg-base-raised p-3 transition hover:bg-brand-accent/5"><div className="rounded-lg bg-brand-accent/10 p-2 text-brand-accent"><Icon size={16} /></div><div className="min-w-0 flex-1"><p className="text-sm font-semibold">{title}</p><p className="text-xs text-ink-muted">{detail}</p></div><StatusBadge value={status} /><ArrowRight size={16} className="text-ink-faint" /></Link>; }
