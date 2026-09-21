import { FormEvent, useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  AlertTriangle,
  Ban,
  Check,
  Clock3,
  Code2,
  Copy,
  ExternalLink,
  Globe2,
  Loader2,
  Plus,
  RefreshCw,
  Save,
  Shield,
  Store,
  Terminal,
  Trash2,
  UserRoundX,
  Zap,
} from "lucide-react";
import { PageContent } from "../components/PageContent";
import { PageHeader } from "../components/PageHeader";
import { toast } from "../components/Toast";
import { useAuth } from "../hooks/useAuth";
import {
  antiFakeOrdersService,
  buildYouCanGuardSnippet,
  type AntiFakeBlockMode,
  type AntiFakeRule,
  type AntiFakeRuleType,
  type AntiFakeStore,
} from "../services/antiFakeOrdersService";

type RuleTab = "ip" | "customer";

const inputClass = "min-h-10 w-full rounded-xl border border-base-border bg-base-surface px-3 text-[13px] text-ink outline-none transition focus:border-brand/60 focus:ring-2 focus:ring-brand/10";
const cardClass = "rounded-2xl border border-base-border bg-base-surface shadow-sm";

function Toggle({ checked, onChange, disabled = false }: { checked: boolean; onChange: (next: boolean) => void; disabled?: boolean }) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={checked}
      disabled={disabled}
      onClick={() => onChange(!checked)}
      className={`relative h-6 w-11 shrink-0 rounded-full transition ${checked ? "bg-emerald-500" : "bg-slate-300 dark:bg-slate-600"} disabled:cursor-not-allowed disabled:opacity-50`}
    >
      <span className={`absolute top-0.5 h-5 w-5 rounded-full bg-white shadow transition-transform ${checked ? "translate-x-5" : "translate-x-0.5"}`} />
    </button>
  );
}

function formatDate(value: string | null): string {
  if (!value) return "Lifetime";
  return new Intl.DateTimeFormat(undefined, { dateStyle: "medium", timeStyle: "short" }).format(new Date(value));
}

function isActive(rule: AntiFakeRule): boolean {
  return rule.enabled && (!rule.expires_at || Date.parse(rule.expires_at) > Date.now());
}

function remainingLabel(rule: AntiFakeRule): string {
  if (!rule.enabled) return "Paused";
  if (!rule.expires_at) return "Lifetime";
  const milliseconds = Date.parse(rule.expires_at) - Date.now();
  if (milliseconds <= 0) return "Expired";
  const hours = Math.ceil(milliseconds / 3_600_000);
  if (hours < 48) return `${hours}h left`;
  return `${Math.ceil(hours / 24)}d left`;
}

function BlockPreview({ mode, message }: { mode: AntiFakeBlockMode; message: string }) {
  const cyber = mode === "cyber_prank";
  return (
    <div className={`relative min-h-[250px] overflow-hidden rounded-2xl border ${cyber ? "border-emerald-500/40 bg-black text-emerald-300" : "border-base-border bg-slate-50 text-slate-900 dark:bg-slate-950 dark:text-slate-100"}`}>
      {cyber ? (
        <div className="relative min-h-[250px] bg-black/95 font-mono text-[10px] leading-5">
          <div className="border-b border-red-900 bg-red-600 px-4 py-2 text-center font-black uppercase tracking-[0.18em] text-white">⚠ SYSTEM BREACH DETECTED — CRITICAL ALERT ⚠</div>
          <div className="pointer-events-none absolute inset-0 opacity-20" style={{ backgroundImage: "repeating-linear-gradient(0deg, rgba(255,255,255,.1) 0, rgba(255,255,255,.1) 1px, transparent 1px, transparent 4px)" }} />
          <div className="relative grid gap-4 p-5 sm:grid-cols-[1.5fr_1fr]">
            <div className="space-y-1 text-right sm:text-left">
              <div className="text-emerald-400">...Initializing security scan &lt;</div>
              <div className="text-emerald-400">Analyzing visitor IP................. [MATCHED] &lt;</div>
              <div className="text-red-400">Threat level: [CRITICAL] &lt;</div>
              <div className="text-emerald-400">Store access gate................... [CLOSED] &lt;</div>
              <div className="text-emerald-400">Session request..................... [DENIED] &lt;</div>
              <div className="text-emerald-400">Device access....................... [NONE] &lt;</div>
              <div className="text-emerald-400">Data collection..................... [DISABLED] &lt;</div>
              <div className="text-emerald-400">Visual simulation................... [ACTIVE] &lt;</div>
              <div className="text-red-400">.WARNING: Store access has been blocked &lt;</div>
              <div className="text-emerald-400">.This is a browser prank simulation &lt;</div>
              <div className="text-emerald-400">.No device data was accessed &lt;</div>
            </div>
            <div className="flex items-end justify-end text-red-400">...CLOSING STOREFRONT SESSION &lt;</div>
          </div>
          <div className="mx-5 h-2 bg-lime-500 shadow-[0_0_10px_#22c55e]" />
          <div className="mt-3 border-t border-emerald-500 px-4 py-3 text-center text-red-400">💀 STOREFRONT ACCESS BLOCKED — SIMULATION ONLY 💀</div>
          <div className="text-center text-emerald-400">.Session closed | {message}</div>
        </div>
      ) : (
        <div className="flex min-h-[250px] items-center justify-center p-5">
          <div className="w-full max-w-sm rounded-2xl border border-slate-200 bg-white p-6 text-center shadow-xl dark:border-slate-700 dark:bg-slate-900">
            <p className="text-[10px] font-black uppercase tracking-[0.18em] text-brand">Access restricted</p>
            <h3 className="mt-3 text-xl font-black">This store is unavailable</h3>
            <p className="mt-3 whitespace-pre-wrap text-xs leading-5 text-slate-500 dark:text-slate-400">{message}</p>
          </div>
        </div>
      )}
    </div>
  );
}

function StoreSetup({ workspaceId, onSaved }: { workspaceId: string; onSaved: (store: AntiFakeStore) => void }) {
  const [storeUrl, setStoreUrl] = useState("");
  const [saving, setSaving] = useState(false);

  const submit = async (event: FormEvent) => {
    event.preventDefault();
    setSaving(true);
    try {
      const result = await antiFakeOrdersService.saveStore(workspaceId, {
        storeUrl,
        enabled: true,
        customerGuardEnabled: true,
        defaultBlockMode: "message",
        defaultMessage: "Access to this store is restricted. Please contact the store if you believe this is a mistake.",
      });
      onSaved(result.store);
      toast.success("Store protection created.");
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "The store could not be saved.");
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="mx-auto mt-8 max-w-3xl">
      <section className={`${cardClass} overflow-hidden`}>
        <div className="border-b border-base-border bg-gradient-to-r from-brand/10 via-brand/5 to-transparent px-6 py-7 sm:px-8">
          <div className="flex items-start gap-4">
            <div className="grid h-12 w-12 shrink-0 place-items-center rounded-2xl bg-brand text-white shadow-lg shadow-brand/20"><Store size={22} /></div>
            <div>
              <p className="text-[11px] font-black uppercase tracking-[0.14em] text-brand">Step 1 of 2</p>
              <h2 className="mt-1 text-xl font-black text-ink">Connect your public YouCan store</h2>
              <p className="mt-2 max-w-2xl text-sm leading-6 text-ink-muted">Enter the address customers use to open your store. EcomOS uses the hostname to ensure the protection script only answers for this storefront.</p>
            </div>
          </div>
        </div>
        <form onSubmit={submit} className="space-y-5 p-6 sm:p-8">
          <label className="block">
            <span className="mb-2 block text-xs font-bold text-ink">Public store URL</span>
            <div className="relative">
              <Globe2 className="absolute left-3 top-1/2 -translate-y-1/2 text-ink-faint" size={17} />
              <input required value={storeUrl} onChange={(event) => setStoreUrl(event.target.value)} className={`${inputClass} pl-10`} placeholder="https://your-store.youcan.store" />
            </div>
            <span className="mt-2 block text-[11px] text-ink-faint">Use the storefront URL, not seller-area.youcan.shop.</span>
          </label>
          <button disabled={saving} className="inline-flex min-h-11 items-center justify-center gap-2 rounded-xl bg-brand px-5 text-sm font-bold text-white shadow-sm transition hover:brightness-105 disabled:opacity-60">
            {saving ? <Loader2 className="animate-spin" size={17} /> : <Shield size={17} />}
            Create protection
          </button>
        </form>
      </section>
      <div className="mt-4 flex gap-3 rounded-xl border border-amber-300/50 bg-amber-50 px-4 py-3 text-xs leading-5 text-amber-900 dark:border-amber-500/20 dark:bg-amber-500/10 dark:text-amber-100">
        <AlertTriangle className="mt-0.5 shrink-0" size={16} />
        <p>This is a browser-side visual restriction for YouCan. It blocks ordinary interaction but can be bypassed by a determined visitor who disables JavaScript. Network-level blocking requires a reverse proxy or WAF.</p>
      </div>
    </div>
  );
}

export default function AntiFakeOrders() {
  const { workspace } = useAuth();
  const workspaceId = workspace?.id ?? null;
  const [store, setStore] = useState<AntiFakeStore | null>(null);
  const [rules, setRules] = useState<AntiFakeRule[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [refreshing, setRefreshing] = useState(false);
  const [tab, setTab] = useState<RuleTab>("ip");
  const [copied, setCopied] = useState(false);
  const [savingStore, setSavingStore] = useState(false);
  const [addingRule, setAddingRule] = useState(false);
  const [busyRuleId, setBusyRuleId] = useState<string | null>(null);

  const [storeUrl, setStoreUrl] = useState("");
  const [storeEnabled, setStoreEnabled] = useState(true);
  const [customerGuardEnabled, setCustomerGuardEnabled] = useState(true);
  const [defaultMode, setDefaultMode] = useState<AntiFakeBlockMode>("message");
  const [defaultMessage, setDefaultMessage] = useState("Access to this store is restricted.");

  const [ruleType, setRuleType] = useState<AntiFakeRuleType>("ip");
  const [ruleValue, setRuleValue] = useState("");
  const [duration, setDuration] = useState("24");
  const [ruleMode, setRuleMode] = useState<AntiFakeBlockMode>("message");
  const [ruleMessage, setRuleMessage] = useState("");
  const [note, setNote] = useState("");
  const initialLoadStarted = useRef(false);

  const hydrateStoreForm = useCallback((next: AntiFakeStore) => {
    setStoreUrl(next.store_url);
    setStoreEnabled(next.enabled);
    setCustomerGuardEnabled(next.customer_guard_enabled);
    setDefaultMode(next.default_block_mode);
    setDefaultMessage(next.default_message);
  }, []);

  const load = useCallback(async (quiet = false) => {
    if (!workspaceId) return;
    quiet ? setRefreshing(true) : setLoading(true);
    setLoadError(null);
    try {
      const result = await antiFakeOrdersService.load(workspaceId);
      setStore(result.store);
      setRules(result.rules);
      if (result.store) hydrateStoreForm(result.store);
    } catch (error) {
      const message = error instanceof Error ? error.message : "Anti-Fake Orders could not be loaded.";
      setLoadError(message);
      toast.error(message);
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, [hydrateStoreForm, workspaceId]);

  useEffect(() => {
    if (initialLoadStarted.current) return;
    initialLoadStarted.current = true;
    void load();
  }, [load]);

  useEffect(() => {
    setRuleType(tab === "ip" ? "ip" : "phone");
    setRuleValue("");
  }, [tab]);

  const filteredRules = useMemo(
    () => rules.filter((rule) => tab === "ip" ? rule.rule_type === "ip" : rule.rule_type !== "ip"),
    [rules, tab],
  );
  const activeCount = rules.filter(isActive).length;
  const lifetimeCount = rules.filter((rule) => isActive(rule) && !rule.expires_at).length;
  const totalHits = rules.reduce((sum, rule) => sum + Number(rule.hit_count || 0), 0);
  const snippet = store ? buildYouCanGuardSnippet(store) : "";

  const saveStore = async () => {
    if (!workspaceId) return;
    setSavingStore(true);
    try {
      const result = await antiFakeOrdersService.saveStore(workspaceId, {
        storeUrl,
        enabled: storeEnabled,
        customerGuardEnabled,
        defaultBlockMode: defaultMode,
        defaultMessage,
      });
      setStore(result.store);
      hydrateStoreForm(result.store);
      toast.success("Protection settings saved.");
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Settings could not be saved.");
    } finally {
      setSavingStore(false);
    }
  };

  const addRule = async (event: FormEvent) => {
    event.preventDefault();
    if (!workspaceId) return;
    setAddingRule(true);
    try {
      const result = await antiFakeOrdersService.addRule(workspaceId, {
        ruleType,
        ruleValue,
        durationHours: duration === "lifetime" ? null : Number(duration),
        blockMode: ruleMode,
        message: ruleMessage || undefined,
        note: note || undefined,
      });
      setRules((current) => [result.rule, ...current]);
      setRuleValue("");
      setRuleMessage("");
      setNote("");
      toast.success("Block rule added.");
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "The block rule could not be added.");
    } finally {
      setAddingRule(false);
    }
  };

  const toggleRule = async (rule: AntiFakeRule) => {
    if (!workspaceId) return;
    setBusyRuleId(rule.id);
    try {
      const result = await antiFakeOrdersService.setRuleEnabled(workspaceId, rule.id, !rule.enabled);
      setRules((current) => current.map((item) => item.id === rule.id ? result.rule : item));
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "The rule could not be updated.");
    } finally {
      setBusyRuleId(null);
    }
  };

  const deleteRule = async (rule: AntiFakeRule) => {
    if (!workspaceId || !window.confirm(`Delete the block for ${rule.rule_value}?`)) return;
    setBusyRuleId(rule.id);
    try {
      await antiFakeOrdersService.deleteRule(workspaceId, rule.id);
      setRules((current) => current.filter((item) => item.id !== rule.id));
      toast.success("Block rule deleted.");
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "The rule could not be deleted.");
    } finally {
      setBusyRuleId(null);
    }
  };

  const copySnippet = async () => {
    try {
      await navigator.clipboard.writeText(snippet);
      setCopied(true);
      window.setTimeout(() => setCopied(false), 1800);
      toast.success("YouCan code copied.");
    } catch {
      toast.error("Copy failed. Select the code and copy it manually.");
    }
  };

  if (loading) {
    return <PageContent><div className="grid min-h-[420px] place-items-center"><Loader2 className="animate-spin text-brand" size={26} /></div></PageContent>;
  }
  if (!workspaceId) {
    return <PageContent><div className={`${cardClass} p-8 text-center text-sm text-ink-muted`}>Select a workspace to configure Anti-Fake Orders.</div></PageContent>;
  }
  if (loadError && !store) {
    return (
      <PageContent>
        <PageHeader title="Anti-Fake Orders" subtitle="Protect your YouCan storefront from repeat fake-order visitors." />
        <div className="mx-auto mt-8 max-w-2xl rounded-2xl border border-rose-300/60 bg-rose-50 p-6 text-center dark:border-rose-500/20 dark:bg-rose-500/10">
          <div className="mx-auto grid h-11 w-11 place-items-center rounded-2xl bg-rose-500/10 text-rose-600"><AlertTriangle size={20} /></div>
          <h2 className="mt-3 text-base font-black text-ink">Protection service unavailable</h2>
          <p className="mx-auto mt-2 max-w-lg text-sm leading-6 text-ink-muted">{loadError}</p>
          <button onClick={() => void load()} className="mt-5 inline-flex min-h-10 items-center gap-2 rounded-xl bg-brand px-4 text-xs font-bold text-white"><RefreshCw size={15} /> Try again</button>
        </div>
      </PageContent>
    );
  }
  if (!store) {
    return (
      <PageContent>
        <PageHeader title="Anti-Fake Orders" subtitle="Protect your YouCan storefront from repeat fake-order visitors." />
        <StoreSetup workspaceId={workspaceId} onSaved={(next) => { setStore(next); hydrateStoreForm(next); }} />
      </PageContent>
    );
  }

  return (
    <PageContent className="space-y-5">
      <PageHeader
        title="Anti-Fake Orders"
        subtitle="IP and customer restrictions for your YouCan storefront."
        badge={<span className={`rounded-full px-2.5 py-1 text-[10px] font-black uppercase tracking-wide ${store.enabled ? "bg-emerald-500/10 text-emerald-600" : "bg-slate-500/10 text-slate-500"}`}>{store.enabled ? "Protection on" : "Protection off"}</span>}
        action={
          <div className="flex items-center gap-2">
            <a href={store.store_url} target="_blank" rel="noreferrer" className="inline-flex min-h-10 items-center gap-2 rounded-xl border border-base-border bg-base-surface px-3 text-xs font-bold text-ink transition hover:bg-base-raised"><ExternalLink size={15} /> Open store</a>
            <button onClick={() => void load(true)} disabled={refreshing} className="inline-flex min-h-10 items-center gap-2 rounded-xl border border-base-border bg-base-surface px-3 text-xs font-bold text-ink transition hover:bg-base-raised disabled:opacity-60"><RefreshCw className={refreshing ? "animate-spin" : ""} size={15} /> Refresh</button>
          </div>
        }
      />

      <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
        {[
          { label: "Active blocks", value: activeCount, icon: Ban, tone: "text-rose-600 bg-rose-500/10" },
          { label: "Lifetime blocks", value: lifetimeCount, icon: Clock3, tone: "text-violet-600 bg-violet-500/10" },
          { label: "Blocked checks", value: totalHits, icon: Shield, tone: "text-emerald-600 bg-emerald-500/10" },
          { label: "Store", value: store.hostname, icon: Globe2, tone: "text-blue-600 bg-blue-500/10" },
        ].map((stat) => (
          <div key={stat.label} className={`${cardClass} flex min-w-0 items-center gap-3 p-4`}>
            <div className={`grid h-10 w-10 shrink-0 place-items-center rounded-xl ${stat.tone}`}><stat.icon size={18} /></div>
            <div className="min-w-0"><p className="text-[10px] font-bold uppercase tracking-wider text-ink-faint">{stat.label}</p><p className="mt-1 truncate text-lg font-black text-ink">{stat.value}</p></div>
          </div>
        ))}
      </div>

      <div className="grid gap-5 xl:grid-cols-[minmax(0,1.2fr)_minmax(360px,.8fr)]">
        <section className={`${cardClass} overflow-hidden`}>
          <div className="flex items-start justify-between gap-4 border-b border-base-border px-5 py-4">
            <div><div className="flex items-center gap-2"><Store className="text-brand" size={18} /><h2 className="text-sm font-black text-ink">Store protection</h2></div><p className="mt-1 text-xs text-ink-muted">Settings apply without changing the pasted code.</p></div>
            <Toggle checked={storeEnabled} onChange={setStoreEnabled} />
          </div>
          <div className="grid gap-4 p-5 md:grid-cols-2">
            <label className="md:col-span-2"><span className="mb-1.5 block text-xs font-bold text-ink">Public store URL</span><input value={storeUrl} onChange={(event) => setStoreUrl(event.target.value)} className={inputClass} /></label>
            <label><span className="mb-1.5 block text-xs font-bold text-ink">Default blocked screen</span><select value={defaultMode} onChange={(event) => setDefaultMode(event.target.value as AntiFakeBlockMode)} className={inputClass}><option value="message">Clean message</option><option value="cyber_prank">Hack prank (visual only)</option></select></label>
            <div className="flex items-center justify-between rounded-xl border border-base-border bg-base-raised/40 px-3 py-2.5"><div><p className="text-xs font-bold text-ink">Customer form guard</p><p className="mt-0.5 text-[10px] text-ink-faint">Check phone, name and address at submit.</p></div><Toggle checked={customerGuardEnabled} onChange={setCustomerGuardEnabled} /></div>
            <label className="md:col-span-2"><span className="mb-1.5 block text-xs font-bold text-ink">Default message</span><textarea rows={3} maxLength={500} value={defaultMessage} onChange={(event) => setDefaultMessage(event.target.value)} className={`${inputClass} resize-y py-2.5`} /></label>
            <div className="md:col-span-2"><button onClick={() => void saveStore()} disabled={savingStore} className="inline-flex min-h-10 items-center gap-2 rounded-xl bg-brand px-4 text-xs font-bold text-white transition hover:brightness-105 disabled:opacity-60">{savingStore ? <Loader2 className="animate-spin" size={15} /> : <Save size={15} />} Save settings</button></div>
          </div>
        </section>

        <section className={`${cardClass} overflow-hidden`}>
          <div className="flex items-start gap-3 border-b border-base-border px-5 py-4"><div className="grid h-9 w-9 place-items-center rounded-xl bg-slate-900 text-emerald-300"><Terminal size={17} /></div><div><h2 className="text-sm font-black text-ink">Blocked-screen preview</h2><p className="mt-1 text-xs text-ink-muted">The cyber option is a harmless visual effect.</p></div></div>
          <div className="p-4"><BlockPreview mode={defaultMode} message={defaultMessage} /></div>
        </section>
      </div>

      <section className={`${cardClass} overflow-hidden`}>
        <div className="flex flex-col gap-3 border-b border-base-border px-5 py-4 sm:flex-row sm:items-center sm:justify-between">
          <div className="flex items-start gap-3"><div className="grid h-9 w-9 place-items-center rounded-xl bg-blue-500/10 text-blue-600"><Code2 size={17} /></div><div><h2 className="text-sm font-black text-ink">YouCan installation code</h2><p className="mt-1 text-xs text-ink-muted">Paste once into Online settings → CSS/JavaScript configs → Additional header code.</p></div></div>
          <button onClick={() => void copySnippet()} className="inline-flex min-h-10 items-center justify-center gap-2 rounded-xl bg-blue-600 px-4 text-xs font-bold text-white transition hover:bg-blue-700">{copied ? <Check size={15} /> : <Copy size={15} />}{copied ? "Copied" : "Copy code"}</button>
        </div>
        <div className="bg-slate-950 p-4 sm:p-5"><pre className="overflow-x-auto whitespace-pre-wrap break-all font-mono text-[11px] leading-5 text-emerald-300">{snippet}</pre></div>
        <div className="flex items-start gap-2 border-t border-base-border bg-emerald-500/5 px-5 py-3 text-[11px] leading-5 text-ink-muted"><Zap className="mt-0.5 shrink-0 text-emerald-600" size={14} /><p>The script loads asynchronously and performs one lightweight background request. It never hides or delays the page for normal visitors; if EcomOS is unavailable, the store stays open.</p></div>
      </section>

      <section className={`${cardClass} overflow-hidden`}>
        <div className="border-b border-base-border px-4 pt-4 sm:px-5">
          <div className="flex gap-1 rounded-xl bg-base-raised p-1 sm:w-fit">
            <button onClick={() => setTab("ip")} className={`flex min-h-9 flex-1 items-center justify-center gap-2 rounded-lg px-4 text-xs font-bold transition sm:flex-none ${tab === "ip" ? "bg-base-surface text-brand shadow-sm" : "text-ink-muted"}`}><Globe2 size={15} /> IP blocks</button>
            <button onClick={() => setTab("customer")} className={`flex min-h-9 flex-1 items-center justify-center gap-2 rounded-lg px-4 text-xs font-bold transition sm:flex-none ${tab === "customer" ? "bg-base-surface text-brand shadow-sm" : "text-ink-muted"}`}><UserRoundX size={15} /> Customer info</button>
          </div>
          <p className="py-3 text-xs text-ink-muted">{tab === "ip" ? "Block a visitor by IPv4 or IPv6 address as soon as the background check completes." : "Stop order submission when the entered phone, name, or address matches a rule."}</p>
        </div>

        <form onSubmit={addRule} className="grid gap-3 border-b border-base-border bg-base-raised/30 p-4 sm:p-5 lg:grid-cols-12">
          {tab === "customer" && <label className="lg:col-span-2"><span className="mb-1.5 block text-[11px] font-bold text-ink">Match by</span><select value={ruleType} onChange={(event) => setRuleType(event.target.value as AntiFakeRuleType)} className={inputClass}><option value="phone">Phone</option><option value="name">Full name</option><option value="address">Exact address</option><option value="address_contains">Address contains</option></select></label>}
          <label className={tab === "ip" ? "lg:col-span-4" : "lg:col-span-3"}><span className="mb-1.5 block text-[11px] font-bold text-ink">{tab === "ip" ? "IP address" : "Customer value"}</span><input required value={ruleValue} onChange={(event) => setRuleValue(event.target.value)} className={inputClass} placeholder={tab === "ip" ? "196.118.93.179" : ruleType === "phone" ? "0612345678" : "Customer name or address"} /></label>
          <label className="lg:col-span-2"><span className="mb-1.5 block text-[11px] font-bold text-ink">Duration</span><select value={duration} onChange={(event) => setDuration(event.target.value)} className={inputClass}><option value="1">1 hour</option><option value="24">24 hours</option><option value="168">7 days</option><option value="720">30 days</option><option value="2160">90 days</option><option value="lifetime">Lifetime</option></select></label>
          <label className="lg:col-span-2"><span className="mb-1.5 block text-[11px] font-bold text-ink">Screen</span><select value={ruleMode} onChange={(event) => setRuleMode(event.target.value as AntiFakeBlockMode)} className={inputClass}><option value="message">Clean message</option><option value="cyber_prank">Hack prank</option></select></label>
          <label className="lg:col-span-3"><span className="mb-1.5 block text-[11px] font-bold text-ink">Private note</span><input value={note} maxLength={500} onChange={(event) => setNote(event.target.value)} className={inputClass} placeholder="Fake orders, repeated refusals…" /></label>
          <label className="lg:col-span-9"><span className="mb-1.5 block text-[11px] font-bold text-ink">Custom blocked message <span className="font-normal text-ink-faint">(optional)</span></span><input value={ruleMessage} maxLength={500} onChange={(event) => setRuleMessage(event.target.value)} className={inputClass} placeholder="Leave empty to use the store default message" /></label>
          <div className="flex items-end lg:col-span-3"><button disabled={addingRule} className="inline-flex min-h-10 w-full items-center justify-center gap-2 rounded-xl bg-brand px-4 text-xs font-bold text-white transition hover:brightness-105 disabled:opacity-60">{addingRule ? <Loader2 className="animate-spin" size={15} /> : <Plus size={15} />} Add block</button></div>
        </form>

        <div className="overflow-x-auto">
          <table className="w-full min-w-[820px] text-left">
            <thead className="bg-base-raised/60 text-[10px] font-black uppercase tracking-wider text-ink-faint"><tr><th className="px-5 py-3">Rule</th><th className="px-4 py-3">Response</th><th className="px-4 py-3">Duration</th><th className="px-4 py-3">Hits</th><th className="px-4 py-3">Last blocked</th><th className="px-5 py-3 text-right">Control</th></tr></thead>
            <tbody className="divide-y divide-base-border">
              {filteredRules.map((rule) => (
                <tr key={rule.id} className="text-xs text-ink">
                  <td className="px-5 py-3.5"><p className="font-bold">{rule.rule_value}</p><p className="mt-1 max-w-xs truncate text-[10px] text-ink-faint">{rule.note || (rule.rule_type === "ip" ? "IP address" : rule.rule_type.replace("_", " "))}</p></td>
                  <td className="px-4 py-3.5"><span className={`rounded-full px-2 py-1 text-[10px] font-bold ${rule.block_mode === "cyber_prank" ? "bg-emerald-500/10 text-emerald-600" : "bg-blue-500/10 text-blue-600"}`}>{rule.block_mode === "cyber_prank" ? "Hack prank" : "Message"}</span></td>
                  <td className="px-4 py-3.5"><p className={`font-bold ${isActive(rule) ? "text-emerald-600" : "text-ink-faint"}`}>{remainingLabel(rule)}</p><p className="mt-1 text-[10px] text-ink-faint">{rule.expires_at ? formatDate(rule.expires_at) : "No expiry"}</p></td>
                  <td className="px-4 py-3.5 font-bold">{Number(rule.hit_count || 0).toLocaleString()}</td>
                  <td className="px-4 py-3.5 text-ink-muted">{rule.last_hit_at ? formatDate(rule.last_hit_at) : "Never"}</td>
                  <td className="px-5 py-3.5"><div className="flex items-center justify-end gap-3"><Toggle checked={rule.enabled} disabled={busyRuleId === rule.id} onChange={() => void toggleRule(rule)} /><button type="button" onClick={() => void deleteRule(rule)} disabled={busyRuleId === rule.id} aria-label={`Delete ${rule.rule_value}`} className="grid h-8 w-8 place-items-center rounded-lg text-rose-500 transition hover:bg-rose-500/10 disabled:opacity-40">{busyRuleId === rule.id ? <Loader2 className="animate-spin" size={14} /> : <Trash2 size={14} />}</button></div></td>
                </tr>
              ))}
            </tbody>
          </table>
          {filteredRules.length === 0 && <div className="grid min-h-44 place-items-center px-5 py-8 text-center"><div><div className="mx-auto grid h-11 w-11 place-items-center rounded-2xl bg-base-raised text-ink-faint"><Ban size={19} /></div><p className="mt-3 text-sm font-bold text-ink">No {tab === "ip" ? "IP" : "customer"} blocks yet</p><p className="mt-1 text-xs text-ink-muted">Create the first rule with the form above.</p></div></div>}
        </div>
      </section>

      <div className="flex gap-3 rounded-xl border border-amber-300/50 bg-amber-50 px-4 py-3 text-[11px] leading-5 text-amber-900 dark:border-amber-500/20 dark:bg-amber-500/10 dark:text-amber-100"><AlertTriangle className="mt-0.5 shrink-0" size={15} /><p>The “Hack prank” is intentionally visual only. It does not claim to access the visitor’s camera, microphone, files, or device, and it never collects credentials.</p></div>
    </PageContent>
  );
}
