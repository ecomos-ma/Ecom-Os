import { useEffect, useState } from "react";
import { ExternalLink, Eye, Loader2, MessageSquareText, ShieldCheck } from "lucide-react";
import { Modal } from "../../../components/Modal";
import { toast } from "../../../components/Toast";
import { clientLicensing, type UnauthorizedThemeMessage, type UnauthorizedThemeMessageInput } from "../../../lib/clientLicensing";
import { fieldClass, labelClass, primaryButton, secondaryButton } from "./licenseUi";

type Props = {
  licenseId?: string;
  customMessage?: UnauthorizedThemeMessage | null;
  customEnabled?: boolean;
  onClose: () => void;
  onSaved?: (message: UnauthorizedThemeMessage) => void;
};

const emptyMessage: UnauthorizedThemeMessage = {
  title: "", message: "", primary_button_text: "", primary_button_url: "",
  secondary_button_text: null, secondary_button_url: null,
};

function errorMessage(error: unknown) { return error instanceof Error ? error.message : "Something went wrong"; }

export function UnauthorizedMessagePreview({ message, useCustom }: { message: UnauthorizedThemeMessage; useCustom?: boolean }) {
  return <div className="overflow-hidden rounded-2xl border border-base-border bg-base-raised/60 shadow-inner">
    <div className="flex items-center gap-2 border-b border-base-border bg-base-surface px-4 py-3 text-[10px] font-black uppercase tracking-[.14em] text-ink-faint"><Eye size={14} /> {useCustom ? "Client custom message" : "Global default message"}</div>
    <div className="p-5"><div className="grid h-10 w-10 place-items-center rounded-xl bg-brand-accent/10 text-brand-accent"><ShieldCheck size={19} /></div><h3 className="mt-4 text-xl font-black tracking-tight">{message.title}</h3><p className="mt-2 whitespace-pre-wrap text-sm leading-6 text-ink-muted">{message.message}</p><div className="mt-5 flex flex-wrap gap-2"><a href={message.primary_button_url} target="_blank" rel="noopener noreferrer" className={primaryButton}>{message.primary_button_text}<ExternalLink size={14} /></a>{message.secondary_button_text && message.secondary_button_url && <a href={message.secondary_button_url} target="_blank" rel="noopener noreferrer" className={secondaryButton}>{message.secondary_button_text}<ExternalLink size={14} /></a>}</div></div>
  </div>;
}

export function UnauthorizedMessageModal({ licenseId, customMessage, customEnabled = false, onClose, onSaved }: Props) {
  const [defaultMessage, setDefaultMessage] = useState<UnauthorizedThemeMessage | null>(null);
  const [enabled, setEnabled] = useState(customEnabled);
  const [form, setForm] = useState<UnauthorizedThemeMessage>(customMessage || emptyMessage);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [preview, setPreview] = useState(false);

  const globalMode = !licenseId;
  useEffect(() => {
    let mounted = true;
    void clientLicensing.getUnauthorizedMessageDefault().then(({ message }) => {
      if (!mounted) return;
      setDefaultMessage(message);
      if (globalMode) setForm(message);
      else if (!customMessage) setForm(message);
    }).catch((error) => toast.error(errorMessage(error))).finally(() => { if (mounted) setLoading(false); });
    return () => { mounted = false; };
  }, [customMessage, globalMode]);

  const set = (field: keyof UnauthorizedThemeMessage, value: string) => setForm((current) => ({ ...current, [field]: value }));
  const previewMessage = enabled || globalMode ? form : defaultMessage;
  const save = async () => {
    setSaving(true);
    try {
      if (globalMode) {
        const result = await clientLicensing.updateUnauthorizedMessageDefault(form);
        onSaved?.(result.message); toast.success("Global unauthorized theme message updated.");
      } else {
        const input: UnauthorizedThemeMessageInput = { ...form, has_custom_unauthorized_message: enabled };
        const result = await clientLicensing.updateUnauthorizedMessage(licenseId, input);
        onSaved?.(result.license.unauthorized_message || defaultMessage || form);
        toast.success(enabled ? "Custom unauthorized theme message updated." : "This client will now use the global default message.");
      }
      onClose();
    } catch (error) { toast.error(errorMessage(error)); }
    finally { setSaving(false); }
  };

  return <Modal title={globalMode ? "Global unauthorized theme message" : "Unauthorized theme message"} onClose={() => { if (!saving) onClose(); }}>
    <div className="mx-auto max-w-2xl py-1">
      <p className="text-sm leading-6 text-ink-muted">This plain-text message is returned only when theme authorization fails. It never exposes license, client, domain, or internal admin data.</p>
      {!globalMode && <label className="mt-5 flex cursor-pointer items-center justify-between gap-4 rounded-xl border border-base-border bg-base-raised/60 p-4"><span><span className="block text-sm font-black">Use a custom message for this client</span><span className="mt-1 block text-xs leading-5 text-ink-muted">When off, this license uses the global default message.</span></span><input type="checkbox" checked={enabled} onChange={(event) => setEnabled(event.target.checked)} className="h-5 w-5 accent-brand-accent" /></label>}
      {loading ? <div className="mt-5 h-64 animate-pulse rounded-2xl bg-base-raised" /> : <>
        <fieldset disabled={!globalMode && !enabled} className="mt-5 grid gap-4 disabled:opacity-50"><label className={labelClass}>Title<input className={fieldClass} maxLength={120} value={form.title || ""} onChange={(event) => set("title", event.target.value)} placeholder="Want This Theme?" /></label><label className={labelClass}>Message<textarea className={`${fieldClass} min-h-28 resize-y`} maxLength={1200} value={form.message || ""} onChange={(event) => set("message", event.target.value)} placeholder="This theme is not activated for this domain…" /></label><div className="grid gap-4 sm:grid-cols-2"><label className={labelClass}>Primary button text<input className={fieldClass} maxLength={80} value={form.primary_button_text || ""} onChange={(event) => set("primary_button_text", event.target.value)} placeholder="Purchase Theme" /></label><label className={labelClass}>Primary button URL<input type="url" className={fieldClass} maxLength={2048} value={form.primary_button_url || ""} onChange={(event) => set("primary_button_url", event.target.value)} placeholder="https://ecomos.ma" /></label></div><div className="grid gap-4 sm:grid-cols-2"><label className={labelClass}>Second button text <span className="normal-case text-ink-faint">(optional)</span><input className={fieldClass} maxLength={80} value={form.secondary_button_text || ""} onChange={(event) => set("secondary_button_text", event.target.value)} /></label><label className={labelClass}>Second button URL <span className="normal-case text-ink-faint">(optional)</span><input type="url" className={fieldClass} maxLength={2048} value={form.secondary_button_url || ""} onChange={(event) => set("secondary_button_url", event.target.value)} placeholder="https://" /></label></div></fieldset>
        {preview && previewMessage && <div className="mt-5"><UnauthorizedMessagePreview message={previewMessage} useCustom={enabled || globalMode} /></div>}
      </>}
      <div className="mt-6 flex flex-wrap justify-end gap-2"><button className={secondaryButton} disabled={!previewMessage} onClick={() => setPreview((current) => !current)}><MessageSquareText size={16} /> {preview ? "Hide preview" : "Preview"}</button><button className={secondaryButton} onClick={onClose}>Cancel</button><button className={primaryButton} disabled={loading || saving} onClick={() => void save()}>{saving && <Loader2 size={16} className="animate-spin" />}{globalMode ? "Save global default" : enabled ? "Save custom message" : "Use global default"}</button></div>
    </div>
  </Modal>;
}
