import { useCallback, useEffect, useState } from "react";
import { Activity, ArrowRight, DatabaseZap, KeyRound, Loader2, Package, PanelTop, ShieldCheck, Sparkles } from "lucide-react";
import { Link } from "react-router-dom";
import { founderAdmin, type FounderEvent, type FounderSnapshot } from "../../../lib/founderAdmin";
import { EmptyState, EventLine, PageHeading, RefreshButton, StatusBadge, currency, dateTime, errorMessage } from "./shared";

export function IntelligencePage() {
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [campaigns, setCampaigns] = useState<any[]>([]);
  const [products, setProducts] = useState<any[]>([]);
  const load = useCallback(async () => {
    setLoading(true); setError("");
    try {
      const result = await founderAdmin.intelligence();
      setCampaigns(result.campaigns || []); setProducts(result.products || []);
    } catch (err) { setError(errorMessage(err)); } finally { setLoading(false); }
  }, []);
  useEffect(() => { void load(); }, [load]);
  return <div className="mx-auto max-w-7xl p-4 md:p-6 lg:p-8">
    <PageHeading eyebrow="Intelligence" title="Campaigns, Products & Sellers" description="Cross-workspace discovery based on genuine source records. When campaign spend or seller attribution is absent, the console intentionally shows that gap instead of inventing a score." action={<RefreshButton onClick={() => void load()} loading={loading} />} />
    {error ? <EmptyState title="Intelligence data is unavailable" copy={error} /> : <div className="grid gap-5 xl:grid-cols-2"><RecordPanel title="Recent campaigns" subtitle="Newest campaign records across EcomOS." icon={Activity} loading={loading} rows={campaigns.map((campaign) => ({ id: campaign.id, title: campaign.name, detail: `${campaign.platform || "Platform not recorded"} · ${dateTime.format(new Date(campaign.created_at))}`, status: campaign.platform || "unknown" }))} empty="Campaigns will appear here when they exist." /><RecordPanel title="Recent products" subtitle="Latest product records with current stock." icon={Package} loading={loading} rows={products.map((product) => ({ id: product.id, title: product.name, detail: `Stock ${product.stock ?? "—"} · ${currency.format(Number(product.price || 0))}`, status: product.status }))} empty="Products will appear here when they exist." /></div>}
    <article className="mt-5 rounded-xl border border-dashed border-base-border bg-base-surface p-5"><p className="font-bold">Advanced campaign metrics</p><p className="mt-1 text-sm leading-6 text-ink-muted">Spend, ROAS, CPA and seller rank filters activate only after a verified ad or seller integration supplies those fields. This prevents unreliable intelligence from being presented as fact.</p></article>
  </div>;
}

export function PlatformPage() {
  const [events, setEvents] = useState<FounderEvent[]>([]);
  const [plans, setPlans] = useState<any[]>([]);
  const [invoices, setInvoices] = useState<any[]>([]);
  const [settings, setSettings] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const load = useCallback(async () => { setLoading(true); setError(""); try {
    const result = await founderAdmin.platformOverview();
    setEvents(result.events || []);
    setPlans(result.plans || []);
    setInvoices(result.invoices || []);
    setSettings(result.settings || []);
  } catch (err) { setError(errorMessage(err)); } finally { setLoading(false); } }, []);
  useEffect(() => { void load(); }, [load]);
  return <div className="mx-auto max-w-7xl p-4 md:p-6 lg:p-8"><PageHeading eyebrow="Platform Control" title="Security, Plans & Audit" description="There is no browser service key or broad administrator role. Existing plan and billing records remain source-of-truth; the console enforces founder authorization before any global action." action={<RefreshButton onClick={() => void load()} loading={loading} />} />
    <div className="grid gap-4 md:grid-cols-3"><ControlCard icon={ShieldCheck} title="Founder lock" copy="Only the exact founder email plus the founder database role can open this console." /><ControlCard icon={KeyRound} title="Server-held secrets" copy="Tools provider credentials are encrypted and cannot be selected by a browser session." /><ControlCard icon={DatabaseZap} title="Tenant isolation" copy="Workspace data remains tenant-scoped; global reads use founder-only RPCs or policies." /></div>
    <section className="mt-6 grid gap-5 xl:grid-cols-2"><article className="rounded-xl border border-base-border bg-base-surface p-5 shadow-sm"><h3 className="font-bold">Plans & capacity</h3><p className="mt-1 text-sm text-ink-muted">Live plan records and their configured limits.</p><div className="mt-4 space-y-2">{loading ? <Loader2 className="mx-auto my-8 animate-spin text-brand-accent" /> : plans.length ? plans.map((plan) => <div key={plan.id} className="flex items-center justify-between gap-3 rounded-lg bg-base-raised px-3 py-3"><div><p className="text-sm font-semibold">{plan.name}</p><p className="text-xs text-ink-muted">{plan.orders_limit?.toLocaleString?.() || "—"} orders · {plan.members_limit || "—"} members</p></div><p className="text-sm font-bold">{new Intl.NumberFormat("en", { style: "currency", currency: plan.currency || "USD", maximumFractionDigits: 0 }).format(Number(plan.price_cents || 0) / 100)}</p></div>) : <p className="py-6 text-center text-sm text-ink-muted">No plan records available.</p>}</div></article><article className="rounded-xl border border-base-border bg-base-surface p-5 shadow-sm"><h3 className="font-bold">Billing signals</h3><p className="mt-1 text-sm text-ink-muted">Latest invoices from the platform billing table.</p><div className="mt-4 space-y-2">{loading ? <Loader2 className="mx-auto my-8 animate-spin text-brand-accent" /> : invoices.length ? invoices.map((invoice) => <div key={invoice.id} className="flex items-center justify-between gap-3 rounded-lg bg-base-raised px-3 py-3"><div><p className="text-sm font-semibold">{new Intl.NumberFormat("en", { style: "currency", currency: invoice.currency || "USD", maximumFractionDigits: 0 }).format(Number(invoice.amount_cents || 0) / 100)}</p><p className="text-xs text-ink-muted">Due {invoice.due_date || dateTime.format(new Date(invoice.created_at))}</p></div><StatusBadge value={invoice.status} /></div>) : <p className="py-6 text-center text-sm text-ink-muted">No invoice records available.</p>}</div></article></section>
    <section className="mt-6 grid gap-5 xl:grid-cols-2"><article className="rounded-xl border border-base-border bg-base-surface p-5 shadow-sm"><h3 className="font-bold">Platform settings</h3><p className="mt-1 text-sm text-ink-muted">Current source-of-truth settings, returned through the founder-only RPC.</p><div className="mt-4 space-y-2">{loading ? <Loader2 className="mx-auto my-8 animate-spin text-brand-accent" /> : settings.length ? settings.map((setting) => <div key={setting.id || setting.setting_key} className="rounded-lg bg-base-raised px-3 py-3"><p className="text-sm font-semibold">{setting.setting_key || setting.key || "Setting"}</p><p className="mt-1 break-words text-xs text-ink-muted">{typeof setting.value === "string" ? setting.value : JSON.stringify(setting.value)}</p></div>) : <p className="py-6 text-center text-sm text-ink-muted">No platform settings are available.</p>}</div></article><article className="rounded-xl border border-base-border bg-base-surface p-5 shadow-sm"><h3 className="font-bold">Audit trail</h3><p className="mt-1 text-sm text-ink-muted">Latest founder-controlled actions, including support sessions, access changes and repairs.</p><div className="mt-5 space-y-3">{loading ? <Loader2 className="mx-auto my-10 animate-spin text-brand-accent" /> : error ? <EmptyState title="Audit trail unavailable" copy={error} /> : events.length ? events.map((event) => <EventLine key={event.id} event={event} />) : <EmptyState title="No events recorded" copy="Actions from this console will appear here." />}</div></article></section>
  </div>;
}

export function AiToolsPage() {
  const [snapshot, setSnapshot] = useState<FounderSnapshot | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const load = useCallback(async () => { setLoading(true); setError(""); try { setSnapshot(await founderAdmin.snapshot()); } catch (err) { setError(errorMessage(err)); } finally { setLoading(false); } }, []);
  useEffect(() => { void load(); }, [load]);
  return <div className="mx-auto max-w-7xl p-4 md:p-6 lg:p-8"><PageHeading eyebrow="AI & Tools" title="Shared AI Control Plane" description="The whole platform uses a managed provider pool. Users do not paste keys and saved credentials never leave the server." action={<RefreshButton onClick={() => void load()} loading={loading} />} />
    {error ? <EmptyState title="AI control data is unavailable" copy={error} /> : <div className="grid gap-5 md:grid-cols-2"><Link to="/admin/ai-tools/providers" className="group rounded-xl border border-base-border bg-base-surface p-6 shadow-sm transition hover:border-brand-accent/40"><div className="flex items-start justify-between"><div className="rounded-xl bg-brand-accent/10 p-3 text-brand-accent"><KeyRound size={22} /></div><ArrowRight className="text-ink-faint transition group-hover:translate-x-1 group-hover:text-brand-accent" /></div><p className="mt-6 text-xl font-bold">Tools API Providers</p><p className="mt-2 text-sm leading-6 text-ink-muted">{snapshot?.enabled_tool_providers ?? 0} enabled provider keys. Configure rotation, priority and failover without exposing a credential.</p></Link><Link to="/admin/ai-tools/landing-page" className="group rounded-xl border border-base-border bg-base-surface p-6 shadow-sm transition hover:border-brand-accent/40"><div className="flex items-start justify-between"><div className="rounded-xl bg-violet-500/10 p-3 text-violet-600 dark:text-violet-300"><PanelTop size={22} /></div><ArrowRight className="text-ink-faint transition group-hover:translate-x-1 group-hover:text-brand-accent" /></div><p className="mt-6 text-xl font-bold">Landing Page AI Library</p><p className="mt-2 text-sm leading-6 text-ink-muted">Upload private design references and prompts. The generator creates a product visual page—never a checkout flow.</p></Link></div>}
  </div>;
}

function RecordPanel({ title, subtitle, icon: Icon, loading, rows, empty }: { title: string; subtitle: string; icon: typeof Activity; loading: boolean; rows: Array<{ id: string; title: string; detail: string; status: string }>; empty: string }) {
  return <article className="rounded-xl border border-base-border bg-base-surface p-5 shadow-sm"><div className="flex items-center gap-3"><div className="rounded-lg bg-brand-accent/10 p-2 text-brand-accent"><Icon size={18} /></div><div><h3 className="font-bold">{title}</h3><p className="text-sm text-ink-muted">{subtitle}</p></div></div><div className="mt-5 space-y-2">{loading ? <Loader2 className="mx-auto my-10 animate-spin text-brand-accent" /> : rows.length ? rows.map((row) => <div key={row.id} className="flex items-center justify-between gap-3 rounded-lg bg-base-raised px-3 py-3"><div className="min-w-0"><p className="truncate text-sm font-semibold">{row.title}</p><p className="text-xs text-ink-muted">{row.detail}</p></div><StatusBadge value={row.status} /></div>) : <EmptyState title="No data" copy={empty} />}</div></article>;
}
function ControlCard({ icon: Icon, title, copy }: { icon: typeof ShieldCheck; title: string; copy: string }) { return <article className="rounded-xl border border-base-border bg-base-surface p-5 shadow-sm"><div className="inline-flex rounded-lg bg-brand-accent/10 p-2 text-brand-accent"><Icon size={18} /></div><h3 className="mt-4 font-bold">{title}</h3><p className="mt-2 text-sm leading-6 text-ink-muted">{copy}</p></article>; }
