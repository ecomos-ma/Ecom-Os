import { useCallback, useEffect, useState } from "react";
import { Bell, X } from "lucide-react";
import { founderAdmin, type UserAnnouncement } from "../lib/founderAdmin";
import { supabase } from "../lib/supabase";

export function AnnouncementTray() {
  const [items, setItems] = useState<UserAnnouncement[]>([]);
  const load = useCallback(async () => {
    try { setItems(await founderAdmin.myAnnouncementsV3()); } catch { setItems([]); }
  }, []);
  useEffect(() => {
    void load();
    const timer = window.setInterval(() => void load(), 60_000);
    const channel = supabase.channel("user-announcements-live")
      .on("postgres_changes", { event: "*", schema: "public", table: "founder_announcements" }, () => void load())
      .subscribe();
    return () => { window.clearInterval(timer); void channel.unsubscribe(); };
  }, [load]);
  const dismiss = async (id: string) => {
    setItems((current) => current.filter((item) => item.id !== id));
    try { await founderAdmin.markAnnouncement(id, true); } catch { void load(); }
  };
  const read = (id: string) => { void founderAdmin.markAnnouncement(id, false); };
  if (!items.length) return null;
  return <div className="space-y-2 border-b border-base-border bg-base-surface px-4 py-2 md:px-6">
    {items.map((item) => <div key={item.id} onMouseEnter={() => read(item.id)} className={`flex items-start gap-3 rounded-lg border px-3 py-2.5 ${item.sticky ? "border-brand-accent/30 bg-brand-accent/10" : "border-base-border bg-base-raised"}`}><Bell size={16} className="mt-0.5 shrink-0 text-brand-accent" /><div className="min-w-0 flex-1"><p className="text-sm font-semibold">{item.title}</p><p className="mt-0.5 text-xs leading-5 text-ink-muted">{item.body}</p>{item.cta_url && <a href={item.cta_url} className="mt-2 inline-block text-xs font-bold text-brand-accent hover:underline">{item.cta_label || "Open"}</a>}</div>{item.dismissible && <button onClick={() => void dismiss(item.id)} className="rounded-md p-1 text-ink-faint hover:bg-base-surface hover:text-ink" aria-label={`Dismiss ${item.title}`}><X size={15} /></button>}</div>)}
  </div>;
}
