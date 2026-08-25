import { useCallback, useEffect, useState } from "react";
import { KeyRound, PanelTop, Sparkles } from "lucide-react";
import { useSearchParams } from "react-router-dom";
import ToolsApiProviders from "../../super-admin/ToolsApiProviders";
import LandingPageAiTemplates from "../../super-admin/LandingPageAiTemplates";
import { founderAdmin, type FounderSnapshot } from "../../../lib/founderAdmin";
import { EmptyState, MetricCard, PageHeading, RefreshButton, errorMessage } from "./shared";

type ToolsTab = "overview" | "providers" | "landing";
const tabs: Array<{ id: ToolsTab; label: string }> = [
  { id: "overview", label: "Overview" }, { id: "providers", label: "API Providers" }, { id: "landing", label: "Landing Page AI" },
];

export function AiToolsConsole() {
  const [params, setParams] = useSearchParams();
  const active: ToolsTab = params.get("tab") === "providers" ? "providers" : params.get("tab") === "landing" ? "landing" : "overview";
  const [snapshot, setSnapshot] = useState<FounderSnapshot | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const load = useCallback(async () => { setLoading(true); setError(""); try { setSnapshot(await founderAdmin.snapshot()); } catch (err) { setError(errorMessage(err)); } finally { setLoading(false); } }, []);
  useEffect(() => { if (active === "overview") void load(); }, [active, load]);
  const select = (tab: ToolsTab) => { const next = new URLSearchParams(params); if (tab === "overview") next.delete("tab"); else next.set("tab", tab); setParams(next, { replace: true }); };
  return <div className="mx-auto max-w-7xl p-4 md:p-6 lg:p-8"><PageHeading eyebrow="AI & Tools" title="Shared AI Control Plane" description="One protected provider pool serves every EcomOS user. Credentials and template assets remain server-held; no browser session can read a saved key." action={active === "overview" ? <RefreshButton onClick={() => void load()} loading={loading} /> : undefined} /><div className="mb-6 flex flex-wrap gap-1 border-b border-base-border pb-3">{tabs.map((tab) => <button key={tab.id} onClick={() => select(tab.id)} className={`rounded-lg px-3 py-2 text-sm font-semibold ${active === tab.id ? "bg-brand-accent text-white" : "text-ink-muted hover:bg-base-raised hover:text-ink"}`}>{tab.label}</button>)}</div>{active === "overview" && (error ? <EmptyState title="AI control data is unavailable" copy={error} /> : <div className="grid gap-4 md:grid-cols-3"><MetricCard label="Enabled providers" value={snapshot?.enabled_tool_providers ?? 0} detail="Encrypted keys available to server routes" icon={KeyRound} /><article className="rounded-xl border border-base-border bg-base-surface p-5 shadow-sm"><PanelTop className="text-violet-500" size={22} /><p className="mt-5 font-bold">Landing Page AI</p><p className="mt-1 text-sm leading-6 text-ink-muted">Private visual references guide product-only generated output. Cart, checkout, payment, and customer fields are prohibited.</p><button onClick={() => select("landing")} className="mt-4 text-sm font-bold text-brand-accent">Manage templates</button></article><article className="rounded-xl border border-base-border bg-base-surface p-5 shadow-sm"><Sparkles className="text-brand-accent" size={22} /><p className="mt-5 font-bold">No-key user experience</p><p className="mt-1 text-sm leading-6 text-ink-muted">Users access Tools through authenticated EcomOS services; rotation and failover happen without exposing a provider key.</p><button onClick={() => select("providers")} className="mt-4 text-sm font-bold text-brand-accent">Manage providers</button></article></div>)}{active === "providers" && <div className="admin-tool-shell"><ToolsApiProviders /></div>}{active === "landing" && <div className="admin-tool-shell"><LandingPageAiTemplates /></div>}</div>;
}
