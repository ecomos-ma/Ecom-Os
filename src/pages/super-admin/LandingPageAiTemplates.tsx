import { ChangeEvent, FormEvent, useCallback, useEffect, useMemo, useState } from "react";
import { CheckCircle2, ImageIcon, ImagePlus, Loader2, Pencil, RefreshCw, ShieldCheck, Sparkles, Trash2, X } from "lucide-react";
import { supabase } from "../../lib/supabase";

const BUCKET = "landing-page-template-assets";
const ACCEPTED_TYPES = ["image/jpeg", "image/png", "image/webp"];
const MAX_FILE_BYTES = 3 * 1024 * 1024;

type Template = {
  id: string;
  name: string;
  style_instructions: string;
  fit_tags: string[];
  asset_path: string;
  asset_mime_type: string;
  quality_score: number;
  priority: number;
  enabled: boolean;
  last_used_at: string | null;
  preview_url: string;
};

type TemplateForm = {
  id: string;
  name: string;
  style_instructions: string;
  fit_tags: string;
  asset_path: string;
  asset_mime_type: string;
  quality_score: number;
  priority: number;
  enabled: boolean;
  preview_url: string;
};

const blankForm = (): TemplateForm => ({
  id: "", name: "", style_instructions: "", fit_tags: "", asset_path: "", asset_mime_type: "",
  quality_score: 80, priority: 100, enabled: true, preview_url: "",
});

export default function LandingPageAiTemplates() {
  const [templates, setTemplates] = useState<Template[]>([]);
  const [form, setForm] = useState<TemplateForm>(blankForm);
  const [file, setFile] = useState<File | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState("");

  const invoke = async (body: Record<string, unknown>) => {
    const { data, error } = await supabase.functions.invoke("landing-page-template-admin", { body });
    if (error) throw new Error(error.message);
    if (data?.error) throw new Error(data.error);
    return data;
  };

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const data = await invoke({ action: "list" });
      setTemplates(data.templates || []);
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Unable to load Landing Page AI templates.");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { void load(); }, [load]);

  const localPreview = useMemo(() => file ? URL.createObjectURL(file) : form.preview_url, [file, form.preview_url]);
  useEffect(() => () => { if (file && localPreview.startsWith("blob:")) URL.revokeObjectURL(localPreview); }, [file, localPreview]);

  const reset = () => {
    setForm(blankForm());
    setFile(null);
    setMessage("");
  };

  const edit = (template: Template) => {
    setForm({
      id: template.id, name: template.name, style_instructions: template.style_instructions,
      fit_tags: template.fit_tags.join(", "), asset_path: template.asset_path,
      asset_mime_type: template.asset_mime_type, quality_score: template.quality_score,
      priority: template.priority, enabled: template.enabled, preview_url: template.preview_url,
    });
    setFile(null);
    setMessage("Leave the image unchanged to retain this visual reference.");
  };

  const chooseFile = (event: ChangeEvent<HTMLInputElement>) => {
    const selected = event.target.files?.[0] || null;
    if (!selected) return;
    if (!ACCEPTED_TYPES.includes(selected.type) || selected.size > MAX_FILE_BYTES) {
      setMessage("Use a JPG, PNG, or WebP reference image smaller than 3 MB.");
      event.target.value = "";
      return;
    }
    setFile(selected);
  };

  const save = async (event: FormEvent) => {
    event.preventDefault();
    if (!form.id && !file) {
      setMessage("Upload a landing-page reference image first.");
      return;
    }
    setSaving(true);
    setMessage("");
    try {
      let assetPath = form.asset_path;
      let assetMimeType = form.asset_mime_type;
      if (file) {
        const upload = await invoke({ action: "create-upload", mime_type: file.type, size: file.size });
        const { error } = await supabase.storage.from(BUCKET)
          .uploadToSignedUrl(upload.path, upload.token, file, { contentType: file.type, upsert: false });
        if (error) throw new Error(error.message);
        assetPath = upload.path;
        assetMimeType = file.type;
      }
      await invoke({
        action: "save", id: form.id || undefined, name: form.name,
        style_instructions: form.style_instructions, fit_tags: form.fit_tags.split(",").map((tag) => tag.trim()).filter(Boolean),
        asset_path: assetPath, asset_mime_type: assetMimeType, quality_score: Number(form.quality_score),
        priority: Number(form.priority), enabled: form.enabled,
      });
      reset();
      await load();
      setMessage("Reference saved. Landing Page AI can now use this visual style for every user.");
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Could not save this reference.");
    } finally {
      setSaving(false);
    }
  };

  const remove = async (template: Template) => {
    if (!window.confirm(`Delete “${template.name}”? The screenshot and its style instructions will be removed.`)) return;
    try {
      await invoke({ action: "delete", id: template.id });
      if (form.id === template.id) reset();
      await load();
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Could not delete this reference.");
    }
  };

  const toggle = async (template: Template) => {
    try {
      await invoke({ action: "save", ...template, enabled: !template.enabled });
      await load();
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Could not update this reference.");
    }
  };

  return (
    <main className="mx-auto max-w-7xl space-y-6 p-4 md:p-8">
      <header className="rounded-2xl border border-slate-800 bg-slate-900 p-6 shadow-xl shadow-black/20">
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div className="flex max-w-3xl gap-4">
            <div className="rounded-xl bg-fuchsia-500/15 p-3 text-fuchsia-300"><ImageIcon size={25} /></div>
            <div>
              <h1 className="text-2xl font-bold text-white">Landing Page AI Studio</h1>
              <p className="mt-1 text-sm leading-6 text-slate-400">Upload the landing-page designs you want the AI to learn from. Gemini compares the enabled references, uses the most relevant visual language, and creates an original product-only page for every EcomOS user.</p>
            </div>
          </div>
          <button onClick={() => void load()} className="inline-flex items-center gap-2 rounded-lg border border-slate-700 px-3 py-2 text-sm text-slate-200 hover:bg-slate-800"><RefreshCw size={15} /> Refresh</button>
        </div>
        <div className="mt-5 flex gap-3 rounded-xl border border-emerald-500/20 bg-emerald-500/10 p-3 text-sm leading-6 text-emerald-100"><ShieldCheck size={18} className="mt-0.5 shrink-0" /><span>References are private. They are visible only to Super Admin and the server-side generator—never to normal users. Generated pages are constrained to product presentation only: no cart, checkout, payment, or customer-data form.</span></div>
      </header>

      {message && <div className="rounded-xl border border-slate-700 bg-slate-900 px-4 py-3 text-sm text-slate-200">{message}</div>}

      <section className="grid gap-6 xl:grid-cols-[minmax(0,1fr)_390px]">
        <div className="space-y-4">
          <div className="flex items-center justify-between"><div><h2 className="font-semibold text-white">Reference library</h2><p className="mt-1 text-sm text-slate-500">You can store any number of references. The three enabled styles with the highest quality and best priority are compared on each generation.</p></div><span className="rounded-full bg-slate-800 px-3 py-1 text-sm text-slate-300">{templates.length} styles</span></div>
          {loading ? <div className="flex h-64 items-center justify-center rounded-2xl border border-slate-800 bg-slate-900"><Loader2 className="animate-spin text-fuchsia-300" /></div> : templates.length === 0 ? <div className="rounded-2xl border border-dashed border-slate-700 bg-slate-900/60 p-10 text-center"><ImagePlus size={32} className="mx-auto mb-3 text-slate-600" /><p className="font-medium text-slate-300">No visual references yet</p><p className="mt-1 text-sm text-slate-500">Add a screenshot and tell the AI exactly what should inspire the output.</p></div> : <div className="grid gap-4 md:grid-cols-2">
            {templates.map((template) => <article key={template.id} className={`overflow-hidden rounded-2xl border bg-slate-900 ${template.enabled ? "border-slate-800" : "border-slate-800/60 opacity-65"}`}>
              <img src={template.preview_url} alt={`${template.name} reference`} className="aspect-[16/10] w-full object-cover bg-slate-800" />
              <div className="space-y-3 p-4">
                <div className="flex items-start justify-between gap-3"><div><h3 className="font-semibold text-white">{template.name}</h3><p className="mt-1 text-xs text-slate-500">Quality {template.quality_score}/100 · Priority {template.priority}</p></div><span className={`rounded-full px-2 py-1 text-[11px] font-medium ${template.enabled ? "bg-emerald-500/15 text-emerald-300" : "bg-slate-800 text-slate-400"}`}>{template.enabled ? "Enabled" : "Disabled"}</span></div>
                <p className="line-clamp-3 text-sm leading-5 text-slate-400">{template.style_instructions}</p>
                {template.fit_tags.length > 0 && <div className="flex flex-wrap gap-1.5">{template.fit_tags.map((tag) => <span key={tag} className="rounded-md border border-slate-700 bg-slate-800 px-2 py-1 text-[11px] text-slate-300">{tag}</span>)}</div>}
                <div className="flex items-center justify-between gap-2 border-t border-slate-800 pt-3"><span className="text-[11px] text-slate-500">{template.last_used_at ? `Last used ${new Date(template.last_used_at).toLocaleDateString()}` : "Not used yet"}</span><div className="flex gap-1"><button onClick={() => void toggle(template)} className="rounded-lg border border-slate-700 px-2 py-1.5 text-xs text-slate-300 hover:border-emerald-400 hover:text-emerald-300">{template.enabled ? "Disable" : "Enable"}</button><button onClick={() => edit(template)} className="rounded-lg border border-slate-700 p-1.5 text-slate-300 hover:border-fuchsia-400 hover:text-fuchsia-200" aria-label={`Edit ${template.name}`}><Pencil size={15} /></button><button onClick={() => void remove(template)} className="rounded-lg border border-slate-700 p-1.5 text-slate-300 hover:border-red-400 hover:text-red-300" aria-label={`Delete ${template.name}`}><Trash2 size={15} /></button></div></div>
              </div>
            </article>)}
          </div>}
        </div>

        <form onSubmit={save} className="h-fit rounded-2xl border border-slate-800 bg-slate-900 p-5 xl:sticky xl:top-6">
          <div className="mb-5 flex items-center justify-between"><div><h2 className="font-semibold text-white">{form.id ? "Edit reference" : "Add reference"}</h2><p className="mt-1 text-xs text-slate-500">A screenshot plus its design brief.</p></div>{form.id && <button type="button" onClick={reset} className="rounded-lg p-1.5 text-slate-400 hover:bg-slate-800 hover:text-white" aria-label="Cancel editing"><X size={18} /></button>}</div>
          <label className="mb-3 block text-sm text-slate-300">Reference name<input required value={form.name} onChange={(event) => setForm((old) => ({ ...old, name: event.target.value }))} placeholder="e.g. Beauty editorial mobile" className="mt-1.5 w-full rounded-lg border border-slate-700 bg-slate-950 px-3 py-2.5 text-white outline-none placeholder:text-slate-600 focus:border-fuchsia-400" /></label>
          <label className="mb-3 block text-sm text-slate-300">Visual design brief<textarea required rows={6} value={form.style_instructions} onChange={(event) => setForm((old) => ({ ...old, style_instructions: event.target.value }))} placeholder="Describe layout, mood, spacing, typography, colors, section order, image treatment, and what must not be copied." className="mt-1.5 w-full resize-y rounded-lg border border-slate-700 bg-slate-950 px-3 py-2.5 text-white outline-none placeholder:text-slate-600 focus:border-fuchsia-400" /></label>
          <label className="mb-3 block text-sm text-slate-300">Best-fit tags<input value={form.fit_tags} onChange={(event) => setForm((old) => ({ ...old, fit_tags: event.target.value }))} placeholder="beauty, skincare, premium" className="mt-1.5 w-full rounded-lg border border-slate-700 bg-slate-950 px-3 py-2.5 text-white outline-none placeholder:text-slate-600 focus:border-fuchsia-400" /></label>
          <div className="mb-4 grid grid-cols-2 gap-3"><label className="text-sm text-slate-300">Quality score<input type="number" min="1" max="100" value={form.quality_score} onChange={(event) => setForm((old) => ({ ...old, quality_score: Number(event.target.value) }))} className="mt-1.5 w-full rounded-lg border border-slate-700 bg-slate-950 px-3 py-2.5 text-white outline-none focus:border-fuchsia-400" /></label><label className="text-sm text-slate-300">Priority<input type="number" min="0" value={form.priority} onChange={(event) => setForm((old) => ({ ...old, priority: Number(event.target.value) }))} className="mt-1.5 w-full rounded-lg border border-slate-700 bg-slate-950 px-3 py-2.5 text-white outline-none focus:border-fuchsia-400" /></label></div>
          <label className="mb-4 flex cursor-pointer items-center gap-3 rounded-xl border border-dashed border-slate-700 bg-slate-950/60 p-3 hover:border-fuchsia-400"><input type="file" accept="image/jpeg,image/png,image/webp" onChange={chooseFile} className="sr-only" /><ImagePlus size={20} className="shrink-0 text-fuchsia-300" /><span className="min-w-0"><span className="block truncate text-sm text-slate-200">{file ? file.name : form.id ? "Replace reference screenshot (optional)" : "Upload reference screenshot"}</span><span className="mt-0.5 block text-xs text-slate-500">JPG, PNG, or WebP · max 3 MB</span></span></label>
          {localPreview && <img src={localPreview} alt="Reference upload preview" className="mb-4 aspect-[16/10] w-full rounded-xl border border-slate-700 object-cover" />}
          <label className="mb-5 flex items-center gap-2 text-sm text-slate-300"><input type="checkbox" checked={form.enabled} onChange={(event) => setForm((old) => ({ ...old, enabled: event.target.checked }))} className="h-4 w-4 rounded border-slate-600 bg-slate-950 text-fuchsia-500 focus:ring-fuchsia-500" /> Use this reference in generation</label>
          <button disabled={saving} type="submit" className="inline-flex w-full items-center justify-center gap-2 rounded-lg bg-fuchsia-500 px-4 py-3 text-sm font-semibold text-white hover:bg-fuchsia-400 disabled:cursor-not-allowed disabled:opacity-60">{saving ? <Loader2 size={16} className="animate-spin" /> : <Sparkles size={16} />}{saving ? "Saving reference…" : form.id ? "Save reference" : "Add reference"}</button>
          <div className="mt-4 flex gap-2 rounded-lg border border-slate-800 bg-slate-950/70 p-3 text-xs leading-5 text-slate-400"><CheckCircle2 size={15} className="mt-0.5 shrink-0 text-emerald-400" />The AI will use your product image as the hero and create a visual-only product page. Checkout and customer-data collection are blocked server-side.</div>
        </form>
      </section>
    </main>
  );
}
