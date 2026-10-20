import { useEffect, useMemo, useState } from "react";
import { BadgeDollarSign, CalendarDays, LockKeyhole, Save } from "lucide-react";
import { supabase } from "../../lib/supabase";
import { toast } from "../../components/Toast";

type SupportedIntent = "per_confirmed_order" | "per_delivered_order" | "fixed_salary";
type RateKind = "fixed" | "percentage";

type StoredRule = {
  id: string;
  name: string;
  enabled: boolean;
  version?: {
    version_no: number;
    rule_type: string;
    amount_type: RateKind;
    amount: number;
    effective_from: string;
    period: string;
  };
};

const intentLabels: Record<SupportedIntent, string> = {
  per_confirmed_order: "Confirmed order",
  per_delivered_order: "Delivered order",
  fixed_salary: "Base salary",
};

function localDate(offsetDays = 0) {
  const date = new Date();
  date.setDate(date.getDate() + offsetDays);
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}-${String(date.getDate()).padStart(2, "0")}`;
}

function nextRateDate(previous?: string) {
  const tomorrow = localDate(1);
  if (!previous || previous < tomorrow) return tomorrow;
  const date = new Date(`${previous}T12:00:00`);
  date.setDate(date.getDate() + 1);
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}-${String(date.getDate()).padStart(2, "0")}`;
}

export function AgentCompensationEditor({ workspaceId, agentId }: { workspaceId: string; agentId: string }) {
  const [rules, setRules] = useState<StoredRule[]>([]);
  const [ready, setReady] = useState(false);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [intent, setIntent] = useState<SupportedIntent>("per_confirmed_order");
  const [rateKind, setRateKind] = useState<RateKind>("fixed");
  const [amount, setAmount] = useState("");
  const [effectiveFrom, setEffectiveFrom] = useState(localDate());

  useEffect(() => {
    let alive = true;
    setLoading(true);
    setRules([]);
    setReady(false);
    void (async () => {
      const [capabilities, headers] = await Promise.all([
        supabase.rpc("agent_compensation_capabilities_v1"),
        supabase.from("agent_payment_rules").select("id,name,enabled").eq("workspace_id", workspaceId).eq("agent_id", agentId),
      ]);
      if (!alive) return;
      setReady(!capabilities.error && capabilities.data === true);
      if (headers.error) {
        toast.error("Could not load this agent's compensation rules.");
        setLoading(false);
        return;
      }
      const rows = (headers.data ?? []) as Omit<StoredRule, "version">[];
      const ids = rows.map((row) => row.id);
      if (!ids.length) {
        setRules([]);
        setLoading(false);
        return;
      }
      const versions = await supabase.from("agent_payment_rule_versions")
        .select("rule_id,version_no,rule_type,amount_type,amount,effective_from,period")
        .eq("workspace_id", workspaceId).eq("agent_id", agentId).in("rule_id", ids)
        .order("version_no", { ascending: false });
      if (!alive) return;
      if (versions.error) {
        toast.error("Could not load this agent's pay-rate history.");
        setLoading(false);
        return;
      }
      const latest = new Map<string, StoredRule["version"]>();
      for (const row of versions.data ?? []) {
        if (!latest.has(row.rule_id)) latest.set(row.rule_id, row as StoredRule["version"]);
      }
      setRules(rows.map((row) => ({ ...row, version: latest.get(row.id) })));
      setLoading(false);
    })();
    return () => { alive = false; };
  }, [workspaceId, agentId]);

  const current = useMemo(() => rules.find((rule) => rule.version?.rule_type === intent), [rules, intent]);
  const duplicateCount = useMemo(() => rules.filter((rule) => rule.enabled && rule.version?.rule_type === intent).length, [rules, intent]);

  useEffect(() => {
    setAmount(current?.version ? String(current.version.amount) : "");
    setRateKind(intent === "fixed_salary" ? "fixed" : current?.version?.amount_type === "percentage" ? "percentage" : "fixed");
    setEffectiveFrom(current ? nextRateDate(current.version?.effective_from) : localDate());
  }, [current?.id, current?.version?.version_no, intent]);

  async function save() {
    const value = Number(amount);
    if (!ready) return toast.error("The compensation database update must be deployed before saving rates.");
    if (duplicateCount > 1) return toast.error("Multiple active rules already exist for this pay type. Resolve them before editing.");
    if (current && !current.enabled) return toast.error("This rate is disabled. Review its history before reactivating it.");
    if (!amount.trim() || !Number.isFinite(value) || value < 0 || (rateKind === "percentage" && value > 100)) {
      return toast.error("Enter a valid amount. Percentages must be between 0 and 100.");
    }
    const minimumDate = current ? nextRateDate(current.version?.effective_from) : localDate();
    if (effectiveFrom < minimumDate) return toast.error(`Choose ${minimumDate} or a later effective date.`);
    setSaving(true);
    const { error } = await supabase.rpc("save_agent_compensation_rule_v2", {
      p_workspace_id: workspaceId,
      p_agent_id: agentId,
      p_rule_id: current?.id ?? null,
      p_intent: intent,
      p_amount_type: intent === "fixed_salary" ? "fixed" : rateKind,
      p_amount: value,
      p_effective_from: effectiveFrom,
      p_enabled: true,
    });
    setSaving(false);
    if (error) return toast.error(error.message || "Could not save the pay rate.");
    toast.success("Pay rate saved. Existing invoice amounts remain unchanged.");
    // A fresh read also avoids displaying a locally invented version number.
    const { data: headers } = await supabase.from("agent_payment_rules").select("id,name,enabled").eq("workspace_id", workspaceId).eq("agent_id", agentId);
    const ids = (headers ?? []).map((row) => row.id);
    if (!ids.length) return;
    const { data: versions } = await supabase.from("agent_payment_rule_versions")
      .select("rule_id,version_no,rule_type,amount_type,amount,effective_from,period")
      .eq("workspace_id", workspaceId).eq("agent_id", agentId).in("rule_id", ids).order("version_no", { ascending: false });
    const latest = new Map<string, StoredRule["version"]>();
    for (const row of versions ?? []) if (!latest.has(row.rule_id)) latest.set(row.rule_id, row as StoredRule["version"]);
    setRules((headers ?? []).map((row) => ({ ...row, version: latest.get(row.id) })));
  }

  return (
    <section className="border-b border-base-border px-5 py-5" aria-label="Agent compensation">
      <div className="flex items-start justify-between gap-3">
        <div>
          <h3 className="text-[13px] font-semibold text-ink">Agent payment</h3>
          <p className="mt-1 text-[11px] leading-5 text-ink-muted">Set this agent's own pay rates. Existing invoice lines keep their original amounts.</p>
        </div>
        <BadgeDollarSign size={18} className="shrink-0 text-brand" />
      </div>
      {!ready && !loading && <p className="mt-3 rounded-lg border border-amber-300/50 bg-amber-50 px-3 py-2 text-[11px] text-amber-900">Compensation update pending: deploy the new database migration before editing pay rates. Existing rules are shown for review.</p>}
      {loading ? <div className="mt-4 h-24 animate-pulse rounded-xl bg-base-raised" /> : <>
        <div className="mt-4 grid grid-cols-2 gap-2 sm:grid-cols-3">
          {(Object.keys(intentLabels) as SupportedIntent[]).map((key) => {
            const existing = rules.find((rule) => rule.version?.rule_type === key);
            return <button key={key} type="button" onClick={() => setIntent(key)} className={`min-h-20 rounded-xl border p-3 text-left transition-colors ${intent === key ? "border-brand bg-brand/5" : "border-base-border bg-base-raised hover:border-brand/30"}`}>
              <span className="block text-[11px] font-semibold text-ink">{intentLabels[key]}</span>
              <span className="mt-1 block text-[11px] text-ink-muted">{existing?.version ? `${existing.version.amount}${existing.version.amount_type === "percentage" ? "%" : " MAD"}${key === "fixed_salary" ? " / invoice" : ""} · v${existing.version.version_no}${existing.enabled ? "" : " · off"}` : "Not configured"}</span>
            </button>;
          })}
        </div>
        <div className="mt-2 grid grid-cols-2 gap-2">
          {["Upsell", "Cross-sell"].map((label) => <div key={label} className="rounded-xl border border-dashed border-base-border px-3 py-2 text-[11px] text-ink-muted"><LockKeyhole size={12} className="mr-1 inline" />{label} · awaiting verified incremental order value</div>)}
        </div>
        {rules.some((rule) => !Object.keys(intentLabels).includes(rule.version?.rule_type ?? "")) && <p className="mt-2 text-[11px] text-amber-700">Older custom or upsell rules exist. Review them in payroll before issuing invoices; this editor will not rewrite their history.</p>}
        <div className="mt-4 rounded-xl border border-base-border bg-base-raised p-3">
          <div className="mb-3 flex items-center justify-between"><span className="text-xs font-semibold text-ink">{intentLabels[intent]} rate</span><span className="text-[10px] text-ink-muted">{current ? `Editing rule · v${current.version?.version_no ?? 1}` : "New rule"}</span></div>
          <div className="grid grid-cols-2 gap-2">
            <label className="text-[11px] text-ink-muted">Payment type
              <select value={rateKind} disabled={intent === "fixed_salary"} onChange={(event) => setRateKind(event.target.value as RateKind)} className="mt-1 w-full rounded-lg border border-base-border bg-base px-2 py-2 text-xs text-ink"><option value="fixed">Fixed MAD</option>{intent !== "fixed_salary" && <option value="percentage">% of order total</option>}</select>
            </label>
            <label className="text-[11px] text-ink-muted">{rateKind === "percentage" && intent !== "fixed_salary" ? "Rate (%)" : "Amount (MAD)"}
              <input value={amount} onChange={(event) => setAmount(event.target.value)} inputMode="decimal" type="number" min="0" max={rateKind === "percentage" ? "100" : undefined} step="0.01" placeholder="0.00" className="mt-1 w-full rounded-lg border border-base-border bg-base px-2 py-2 text-xs text-ink" />
            </label>
          </div>
          <label className="mt-3 block text-[11px] text-ink-muted"><CalendarDays size={12} className="mr-1 inline" />Effective from
            <input type="date" min={current ? nextRateDate(current.version?.effective_from) : localDate()} value={effectiveFrom} onChange={(event) => setEffectiveFrom(event.target.value)} className="mt-1 w-full rounded-lg border border-base-border bg-base px-2 py-2 text-xs text-ink" />
          </label>
          {current && !current.enabled && <p className="mt-2 text-[11px] text-amber-700">This rate is disabled. Reactivation needs payroll review so an old effective period is not reopened accidentally.</p>}
          <p className="mt-2 text-[10.5px] leading-4 text-ink-muted">{intent === "fixed_salary" ? "Salary is a fixed amount per generated payroll invoice; it is not prorated. Add confirmed or delivered rates separately for salary plus commission." : rateKind === "percentage" ? "Percentage uses the order total captured at the qualifying event, not the upsell increase." : "Paid once for each qualifying human-attributed order event."} Changes to an existing rule start no earlier than tomorrow.</p>
          {duplicateCount > 1 && <p className="mt-2 text-[11px] text-red-600">Multiple enabled rules exist for this intent. Saving is blocked to prevent double pay.</p>}
          <button type="button" onClick={() => void save()} disabled={!ready || saving || duplicateCount > 1 || Boolean(current && !current.enabled)} className="mt-3 flex w-full items-center justify-center gap-2 rounded-lg bg-brand px-3 py-2.5 text-xs font-semibold text-white disabled:cursor-not-allowed disabled:opacity-50"><Save size={13} />{saving ? "Saving…" : current ? "Save new rate version" : "Set pay rate"}</button>
        </div>
      </>}
    </section>
  );
}
