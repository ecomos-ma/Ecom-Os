import { useEffect, useState } from "react";
import { Check, Copy, Gift, Link2, Loader2, Users } from "lucide-react";
import { supabase } from "../../lib/supabase";
import { getAppUrlForPath } from "../../lib/appUrl";

type Referral = { id: string; status: string; reward_status: string; referred_email?: string; created_at: string };

export default function Referral() {
  const [code, setCode] = useState("");
  const [referrals, setReferrals] = useState<Referral[]>([]);
  const [referredBy, setReferredBy] = useState<{ status: string; discount_pct: number } | null>(null);
  const [copied, setCopied] = useState(false);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  const load = async () => {
    setLoading(true); setError("");
    const codeResult = await supabase.rpc("get_or_create_referral_code_v1");
    const overviewResult = await supabase.rpc("get_my_referral_overview_v1");
    if (codeResult.error || overviewResult.error) setError((codeResult.error || overviewResult.error)?.message || "Unable to load referrals.");
    else {
      setCode(String(codeResult.data || ""));
      const data = (overviewResult.data || {}) as { referrals?: Referral[]; referred_by?: { status: string; discount_pct: number } | null };
      setReferrals(data.referrals || []); setReferredBy(data.referred_by || null);
    }
    setLoading(false);
  };
  useEffect(() => { void load(); }, []);

  const link = code ? getAppUrlForPath(`/login?mode=signup&ref=${encodeURIComponent(code)}`) : "";
  const copy = async () => { if (!link) return; await navigator.clipboard.writeText(link); setCopied(true); window.setTimeout(() => setCopied(false), 1600); };

  return <div className="space-y-5">
    <section className="rounded-2xl border border-brand-accent/20 bg-gradient-to-br from-brand-accent/[0.08] to-base-surface p-6 shadow-card">
      <div className="flex items-start gap-4"><div className="grid h-11 w-11 shrink-0 place-items-center rounded-xl bg-brand-accent/15 text-brand-accent"><Gift size={21} /></div><div><h2 className="text-xl font-black text-ink">Refer a seller</h2><p className="mt-1 max-w-xl text-sm leading-6 text-ink-muted">Give a new seller 25% off their first payment. After their payment is approved, you earn 25% off your next renewal.</p></div></div>
      <div className="mt-5 flex flex-col gap-2 sm:flex-row"><div className="flex min-h-11 flex-1 items-center gap-2 rounded-xl border border-base-border bg-base-surface px-3 text-xs font-mono text-ink-muted"><Link2 size={15} className="shrink-0 text-brand-accent" /><span className="truncate">{loading ? "Generating your referral link…" : link}</span></div><button type="button" disabled={!link} onClick={() => void copy()} className="inline-flex items-center justify-center gap-2 rounded-xl bg-brand-accent px-4 py-2.5 text-sm font-bold text-white disabled:opacity-50">{copied ? <Check size={15} /> : <Copy size={15} />}{copied ? "Copied" : "Copy link"}</button></div>
      {error && <p className="mt-3 text-sm text-danger">{error}</p>}
    </section>

    {referredBy && <section className="rounded-2xl border border-base-border bg-base-surface p-5 shadow-card"><p className="text-xs font-black uppercase tracking-wide text-ink-faint">Your referral discount</p><div className="mt-2 flex items-center justify-between gap-3"><span className="text-sm font-semibold text-ink">Referred account · {referredBy.status}</span><span className="rounded-full bg-emerald-500/10 px-2.5 py-1 text-xs font-bold text-emerald-700">-25% first payment</span></div></section>}

    <section className="rounded-2xl border border-base-border bg-base-surface shadow-card"><div className="flex items-center gap-2 border-b border-base-border p-5"><Users size={17} className="text-brand-accent" /><div><h3 className="text-[14px] font-semibold text-ink">Your referrals</h3><p className="text-xs text-ink-muted">Rewards are earned only after an approved payment activates the account.</p></div></div>{loading ? <div className="flex justify-center p-10"><Loader2 className="animate-spin text-brand-accent" /></div> : referrals.length === 0 ? <p className="p-10 text-center text-sm text-ink-muted">No referrals yet. Share your link to get started.</p> : <div className="divide-y divide-base-border">{referrals.map((item) => <div key={item.id} className="flex flex-wrap items-center justify-between gap-3 p-4"><div><p className="text-sm font-semibold text-ink">{item.referred_email || "New seller"}</p><p className="text-xs text-ink-muted">{item.status}</p></div><span className={`rounded-full px-2.5 py-1 text-[11px] font-bold ${item.reward_status === "Earned" ? "bg-emerald-500/10 text-emerald-700" : item.reward_status === "Used" ? "bg-base-raised text-ink-muted" : "bg-amber-500/10 text-amber-700"}`}>Reward {item.reward_status}</span></div>)}</div>}</section>
  </div>;
}
