import { useCallback, useEffect, useState } from "react";
import { Eye, EyeOff, KeyRound, Loader2, Pencil, PlayCircle, Plus, RefreshCw, ShieldCheck, Trash2, X } from "lucide-react";
import { supabase } from "../../lib/supabase";

type ProviderKind = "gemini" | "groq" | "cloudflare_workers_ai" | "removebg" | "tiktok";
type Provider = {
  id: string;
  provider: ProviderKind;
  tool_scope: string;
  model: string;
  name: string;
  endpoint: string | null;
  priority: number;
  enabled: boolean;
  failure_count: number;
  credential_last4: string | null;
  health_status: "unknown" | "healthy" | "cooldown" | "unhealthy";
  last_error: string | null;
  cooldown_until: string | null;
  last_used_at: string | null;
  last_success_at: string | null;
};

const defaults: Record<ProviderKind, string> = {
  gemini: "https://generativelanguage.googleapis.com/v1beta",
  groq: "https://api.groq.com/openai/v1",
  cloudflare_workers_ai: "",
  removebg: "https://api.remove.bg/v1.0/removebg",
  tiktok: "https://www.tikwm.com/api/",
};

const blankForm = () => ({
  id: "", provider: "gemini" as ProviderKind, name: "", endpoint: defaults.gemini,
  credential: "", accountId: "", priority: 10, enabled: true, tool_scope: "whatsapp_ai", model: "gemini-3.6-flash",
});

export default function ToolsApiProviders() {
  const [providers, setProviders] = useState<Provider[]>([]);
  const [form, setForm] = useState(blankForm);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [showKey, setShowKey] = useState(false);
  const [testingId, setTestingId] = useState("");
  const [message, setMessage] = useState("");

  const invoke = async (body: Record<string, unknown>) => {
    const { data, error } = await supabase.functions.invoke("tools-provider-admin", { body });
    if (error) throw new Error(error.message);
    if (data?.error) throw new Error(data.error);
    return data;
  };

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const data = await invoke({ action: "list" });
      setProviders(data.providers || []);
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Unable to load provider configuration.");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { void load(); }, [load]);

  const edit = (provider: Provider) => {
    const accountId = provider.provider === "cloudflare_workers_ai" ? provider.endpoint?.match(/\/accounts\/([^/]+)\//)?.[1] || "" : "";
    setForm({
      id: provider.id, provider: provider.provider, name: provider.name,
      endpoint: provider.endpoint || defaults[provider.provider], credential: "",
      accountId, priority: provider.priority, enabled: provider.enabled, tool_scope: provider.tool_scope || "whatsapp_ai", model: provider.model && provider.model !== "default" ? provider.model : "gemini-3.6-flash",
    });
    setShowKey(false);
    setMessage("Leave the API key blank to retain the existing encrypted key.");
  };

  const reset = () => { setForm(blankForm()); setShowKey(false); setMessage(""); };

  const save = async (event: React.FormEvent) => {
    event.preventDefault();
    setSaving(true);
    setMessage("");
    try {
      await invoke({ action: "save", ...form });
      reset();
      await load();
      setMessage("Provider saved. Its secret is encrypted and is never returned to this page.");
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Could not save provider.");
    } finally {
      setSaving(false);
    }
  };

  const remove = async (provider: Provider) => {
    if (!window.confirm(`Remove ${provider.name}? This cannot be undone.`)) return;
    try {
      await invoke({ action: "delete", id: provider.id });
      if (form.id === provider.id) reset();
      await load();
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Could not remove provider.");
    }
  };

  const testConnection = async (provider: Provider) => {
    setTestingId(provider.id);
    setMessage("");
    try {
      const result = await invoke({ action: "test", id: provider.id });
      if (!result?.success) {
        setMessage(`${provider.name} test failed: ${result.reason || "provider_test_failed"}.`);
        await load();
        return;
      }
      setMessage(`${provider.name} connected successfully.`);
      await load();
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Provider connection failed.");
      await load();
    } finally {
      setTestingId("");
    }
  };

  const kindLabel: Record<ProviderKind, string> = { gemini: "Gemini AI", groq: "Groq", cloudflare_workers_ai: "Cloudflare Workers AI", removebg: "remove.bg", tiktok: "TikTok resolver" };
  const groupedProviders = providers.reduce<Record<string, Provider[]>>((groups, provider) => {
    (groups[provider.tool_scope || "legacy"] ||= []).push(provider);
    return groups;
  }, {});

  return (
    <main className="mx-auto max-w-6xl space-y-6 p-4 md:p-8">
      <header className="rounded-2xl border border-slate-800 bg-slate-900 p-6 shadow-xl shadow-black/20">
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div className="flex gap-4"><div className="rounded-xl bg-fuchsia-500/15 p-3 text-fuchsia-300"><KeyRound size={25} /></div><div>
            <h1 className="text-2xl font-bold text-white">Tools API providers</h1>
            <p className="mt-1 max-w-2xl text-sm leading-6 text-slate-400">One encrypted provider pool powers every EcomOS user. Add several keys per service and the server automatically rotates and fails over between them.</p>
          </div></div>
          <button onClick={() => void load()} className="inline-flex items-center gap-2 rounded-lg border border-slate-700 px-3 py-2 text-sm text-slate-200 hover:bg-slate-800"><RefreshCw size={15} /> Refresh</button>
        </div>
        <div className="mt-5 flex items-start gap-3 rounded-xl border border-emerald-500/20 bg-emerald-500/10 p-3 text-sm text-emerald-100"><ShieldCheck size={18} className="mt-0.5 shrink-0" /><span>Keys are encrypted before storage and can only be decrypted inside the server-side Tools proxy. This screen will never display a saved key again.</span></div>
      </header>

      <section className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_360px]">
        <div className="space-y-3">
          <div className="flex items-center justify-between"><h2 className="font-semibold text-white">Configured providers</h2><span className="text-sm text-slate-400">{providers.length} total</span></div>
          {loading ? <div className="flex h-36 items-center justify-center rounded-2xl border border-slate-800 bg-slate-900"><Loader2 className="animate-spin text-fuchsia-300" /></div> : providers.length === 0 ? <div className="rounded-2xl border border-dashed border-slate-700 bg-slate-900/60 p-8 text-center text-sm text-slate-400">No providers yet. Add a scoped provider key to activate a tool.</div> : Object.entries(groupedProviders).map(([scope, scopedProviders]) => <div key={scope} className="space-y-3"><div className="mt-5 flex items-center justify-between first:mt-0"><h3 className="text-sm font-bold uppercase tracking-wide text-fuchsia-200">{scope.replace(/_/g, " ")}</h3><span className="text-xs text-slate-500">{scopedProviders.length} key{scopedProviders.length === 1 ? "" : "s"}</span></div>{scopedProviders.map((provider) => <article key={provider.id} className="rounded-2xl border border-slate-800 bg-slate-900 p-5">
            <div className="flex flex-wrap items-start justify-between gap-4"><div><div className="flex flex-wrap items-center gap-2"><h3 className="font-semibold text-white">{provider.name}</h3><span className="rounded-full bg-fuchsia-500/15 px-2 py-0.5 text-xs text-fuchsia-200">{kindLabel[provider.provider]}</span><span className={`rounded-full px-2 py-0.5 text-xs font-medium ${provider.enabled ? "bg-emerald-500/15 text-emerald-300" : "bg-slate-700 text-slate-300"}`}>{provider.enabled ? "Active" : "Disabled"}</span><span className={`rounded-full px-2 py-0.5 text-xs font-medium ${provider.health_status === "healthy" ? "bg-emerald-500/15 text-emerald-300" : provider.health_status === "unhealthy" ? "bg-red-500/15 text-red-300" : provider.health_status === "cooldown" ? "bg-amber-500/15 text-amber-300" : "bg-slate-700 text-slate-300"}`}>{provider.health_status || "unknown"}</span></div><p className="mt-1 text-sm text-slate-400">Tool: {provider.tool_scope} · Model: {provider.model} · Secret ••••{provider.credential_last4 || "—"} · Priority: {provider.priority}</p><p className="mt-1 max-w-xl truncate text-xs text-slate-500">{provider.provider === "cloudflare_workers_ai" ? "Cloudflare Workers AI endpoint (account masked)" : provider.endpoint || defaults[provider.provider]}</p></div><div className="flex gap-2"><button onClick={() => void testConnection(provider)} disabled={testingId === provider.id} className="inline-flex items-center gap-1.5 rounded-lg border border-slate-700 px-2.5 py-2 text-xs text-slate-300 hover:border-emerald-400 hover:text-emerald-200 disabled:opacity-50" title="Test connection">{testingId === provider.id ? <Loader2 size={15} className="animate-spin" /> : <PlayCircle size={15} />} Test</button><button onClick={() => edit(provider)} className="rounded-lg border border-slate-700 p-2 text-slate-300 hover:border-fuchsia-400 hover:text-fuchsia-200" title="Edit provider"><Pencil size={16} /></button><button onClick={() => void remove(provider)} className="rounded-lg border border-slate-700 p-2 text-slate-300 hover:border-red-400 hover:text-red-300" title="Remove provider"><Trash2 size={16} /></button></div></div>
            <div className="mt-4 flex flex-wrap gap-x-5 gap-y-2 text-xs text-slate-500"><span>Failures: {provider.failure_count}</span><span>Last used: {provider.last_used_at ? new Date(provider.last_used_at).toLocaleString() : "Never"}</span><span>Last success: {provider.last_success_at ? new Date(provider.last_success_at).toLocaleString() : "Never"}</span>{provider.cooldown_until && <span>Cooldown until: {new Date(provider.cooldown_until).toLocaleString()}</span>}</div>{provider.last_error && <p className="mt-3 rounded-lg bg-red-500/10 p-2 text-xs text-red-200">{provider.last_error}</p>}
          </article>)}</div>)}</div>

        <form onSubmit={save} className="h-fit rounded-2xl border border-slate-800 bg-slate-900 p-5">
          <div className="mb-5 flex items-center justify-between"><h2 className="font-semibold text-white">{form.id ? "Edit provider" : "Add provider"}</h2>{form.id && <button type="button" onClick={reset} className="text-slate-400 hover:text-white"><X size={18} /></button>}</div>
          <label className="mb-3 block text-sm text-slate-300">Service<select value={form.provider} onChange={(event) => { const provider = event.target.value as ProviderKind; setForm((old) => ({ ...old, provider, endpoint: defaults[provider], accountId: "", model: provider === "gemini" ? "gemini-3.6-flash" : provider === "groq" ? "openai/gpt-oss-20b" : provider === "cloudflare_workers_ai" ? "@cf/meta/llama-3.1-8b-instruct" : old.model })); }} className="mt-1.5 w-full rounded-lg border border-slate-700 bg-slate-950 px-3 py-2.5 text-white outline-none focus:border-fuchsia-400"><optgroup label="AI"><option value="gemini">Gemini AI</option><option value="groq">Groq</option><option value="cloudflare_workers_ai">Cloudflare Workers AI</option></optgroup><optgroup label="Other services"><option value="removebg">remove.bg</option><option value="tiktok">TikTok resolver</option></optgroup></select></label>
          <label className="mb-3 block text-sm text-slate-300">Display name<input required value={form.name} onChange={(event) => setForm((old) => ({ ...old, name: event.target.value }))} placeholder="e.g. Gemini key #1" className="mt-1.5 w-full rounded-lg border border-slate-700 bg-slate-950 px-3 py-2.5 text-white outline-none placeholder:text-slate-600 focus:border-fuchsia-400" /></label>
          <div className="mb-3 grid grid-cols-2 gap-3"><label className="block text-sm text-slate-300">Tool scope<select value={form.tool_scope} onChange={(event) => setForm((old) => ({ ...old, tool_scope: event.target.value }))} className="mt-1.5 w-full rounded-lg border border-slate-700 bg-slate-950 px-3 py-2.5 text-white"><option value="whatsapp_ai">WhatsApp AI</option><option value="landing_page_ai">Landing Page AI</option>{!(["gemini", "groq", "cloudflare_workers_ai"].includes(form.provider)) && <><option value="background_removal">Background removal</option><option value="tiktok_resolver">TikTok resolver</option></>}</select></label><label className="block text-sm text-slate-300">Model<input required={form.provider !== "tiktok"} value={form.model} onChange={(event) => setForm((old) => ({ ...old, model: event.target.value }))} placeholder="e.g. @cf/meta/llama-3.1-8b-instruct" className="mt-1.5 w-full rounded-lg border border-slate-700 bg-slate-950 px-3 py-2.5 text-white" /></label></div>
          {form.provider === "cloudflare_workers_ai" && <label className="mb-3 block text-sm text-slate-300">Account ID<input required value={form.accountId} onChange={(event) => setForm((old) => ({ ...old, accountId: event.target.value }))} placeholder="Cloudflare account ID" className="mt-1.5 w-full rounded-lg border border-slate-700 bg-slate-950 px-3 py-2.5 text-white" /></label>}
          {form.provider !== "cloudflare_workers_ai" && form.provider !== "removebg" && form.provider !== "tiktok" && <label className="mb-3 block text-sm text-slate-300">API endpoint<input value={form.endpoint} onChange={(event) => setForm((old) => ({ ...old, endpoint: event.target.value }))} className="mt-1.5 w-full rounded-lg border border-slate-700 bg-slate-950 px-3 py-2.5 text-white outline-none placeholder:text-slate-600 focus:border-fuchsia-400" /></label>}
          <label className="mb-3 block text-sm text-slate-300">{form.provider === "cloudflare_workers_ai" ? "API Token" : form.provider === "tiktok" ? "API token (optional)" : form.id ? "New API key (optional)" : "API key"}<span className="relative mt-1.5 block"><input required={!form.id && form.provider !== "tiktok"} type={showKey ? "text" : "password"} value={form.credential} onChange={(event) => setForm((old) => ({ ...old, credential: event.target.value }))} placeholder={form.id ? "Leave blank to keep the saved secret" : "Paste the provider secret"} className="w-full rounded-lg border border-slate-700 bg-slate-950 px-3 py-2.5 pr-10 text-white outline-none placeholder:text-slate-600 focus:border-fuchsia-400" /><button type="button" onClick={() => setShowKey((value) => !value)} className="absolute right-3 top-2.5 text-slate-400 hover:text-white">{showKey ? <EyeOff size={17} /> : <Eye size={17} />}</button></span></label>
          <div className="mb-4 grid grid-cols-2 gap-3"><label className="block text-sm text-slate-300">Priority<input min="0" type="number" value={form.priority} onChange={(event) => setForm((old) => ({ ...old, priority: Number(event.target.value) }))} className="mt-1.5 w-full rounded-lg border border-slate-700 bg-slate-950 px-3 py-2.5 text-white outline-none focus:border-fuchsia-400" /></label><label className="flex items-end gap-2 pb-3 text-sm text-slate-300"><input type="checkbox" checked={form.enabled} onChange={(event) => setForm((old) => ({ ...old, enabled: event.target.checked }))} className="accent-fuchsia-500" /> Active</label></div>
          <p className="mb-4 text-xs leading-5 text-slate-500">Lower priority values are selected first. Equal priorities are shared by least-recently-used rotation.</p>
          <button disabled={saving || (["gemini", "groq", "cloudflare_workers_ai"].includes(form.provider) && (!form.model.trim() || form.model.trim() === "default"))} className="flex w-full items-center justify-center gap-2 rounded-lg bg-fuchsia-500 px-4 py-2.5 text-sm font-semibold text-white transition hover:bg-fuchsia-400 disabled:opacity-60">{saving ? <Loader2 className="animate-spin" size={16} /> : <Plus size={16} />}{form.id ? "Save provider" : "Add provider"}</button>
          {message && <p className="mt-4 rounded-lg bg-slate-950 p-3 text-xs leading-5 text-slate-300">{message}</p>}
        </form>
      </section>
    </main>
  );
}
