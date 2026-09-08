import { FormEvent, useState } from "react";
import { Loader2 } from "lucide-react";
import { supabase } from "../lib/supabase";
import { LegalPage } from "../components/LegalPage";

export default function DataDeletion() {
  const [email, setEmail] = useState("");
  const [requestType, setRequestType] = useState("data_deletion");
  const [reason, setReason] = useState("");
  const [confirmation, setConfirmation] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState("");

  const submit = async (event: FormEvent) => {
    event.preventDefault();
    setError("");
    setConfirmation(null);
    setSubmitting(true);
    try {
      const { data, error: requestError } = await supabase.rpc("submit_public_data_deletion_request", {
        p_email: email.trim(), p_request_type: requestType, p_reason: reason.trim() || null,
      });
      if (requestError) throw requestError;
      setConfirmation(`Your request was received. Reference: ${data}`);
      setEmail(""); setReason("");
    } catch (requestError) {
      console.error(requestError);
      setError("We could not submit the request. Please try again later or email legal@ecomos.ma.");
    } finally { setSubmitting(false); }
  };

  return <LegalPage eyebrow="Privacy & compliance" title="Data Deletion" description="Use this page to request deletion of data held by Ecom OS or received through a connected integration. The page is available without signing in for provider callback and app-review workflows.">
    <h2>How deletion works</h2>
    <p>Logged-in users can submit a request from Settings, where the affected account and workspace are shown before confirmation. If you cannot access your account, use the form below. We review the request, revoke relevant connections, and process only the requested scope. We do not claim deletion until processing is complete.</p>
    <ol><li>Submit a request with an email address we can use to verify ownership.</li><li>We review the request and may ask for additional verification.</li><li>Approved requests are processed by an authorized administrator. Some financial, security, audit, or legally required records may be retained or anonymized.</li></ol>
    <h2>Public deletion request</h2>
    <form onSubmit={submit} className="not-prose max-w-xl space-y-4 rounded-xl border border-slate-200 p-5 dark:border-slate-700" noValidate>
      <div><label htmlFor="deletion-email" className="block text-sm font-semibold">Email address</label><input id="deletion-email" type="email" required value={email} onChange={(event) => setEmail(event.target.value)} className="mt-1 w-full rounded-lg border border-slate-300 bg-transparent px-3 py-2 dark:border-slate-600" /></div>
      <div><label htmlFor="deletion-type" className="block text-sm font-semibold">Request type</label><select id="deletion-type" value={requestType} onChange={(event) => setRequestType(event.target.value)} className="mt-1 w-full rounded-lg border border-slate-300 bg-transparent px-3 py-2 dark:border-slate-600"><option value="data_deletion">Delete personal data</option><option value="account_deletion">Delete account and associated workspace data</option></select></div>
      <div><label htmlFor="deletion-reason" className="block text-sm font-semibold">Explanation <span className="font-normal text-slate-500">(optional)</span></label><textarea id="deletion-reason" maxLength={1000} value={reason} onChange={(event) => setReason(event.target.value)} rows={4} className="mt-1 w-full rounded-lg border border-slate-300 bg-transparent px-3 py-2 dark:border-slate-600" /></div>
      <button type="submit" disabled={submitting} className="inline-flex items-center gap-2 rounded-lg bg-slate-950 px-4 py-2.5 text-sm font-semibold text-white disabled:opacity-60 dark:bg-white dark:text-slate-950">{submitting && <Loader2 size={16} className="animate-spin" />}Submit request</button>
      {error && <p role="alert" className="text-sm text-red-600">{error}</p>}
      {confirmation && <p role="status" className="text-sm font-semibold text-emerald-600">{confirmation}</p>}
    </form>
    <h2>Connected integrations</h2><p>For Meta, TikTok, Google, Shopify, YouCan, WhatsApp, shipping providers, or billing connections, include the relevant service in your explanation if known. You can also disconnect integrations from Settings before submitting a request.</p>
    <h2>Contact</h2><p>Questions about deletion can be sent to <a href="mailto:legal@ecomos.ma">legal@ecomos.ma</a>. We do not expose whether an email belongs to an Ecom OS account.</p>
  </LegalPage>;
}