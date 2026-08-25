import { useEffect, useState, useCallback } from "react";
import { PageHeader } from "../../components/PageHeader";
import { supabase } from "../../lib/supabase";
import { toast } from "../../components/Toast";
import { RefreshCw, Loader2, ShieldAlert, Download } from "lucide-react";

type AuditLog = {
  id: string;
  actor_email: string | null;
  actor_role: string | null;
  action: string;
  target_type: string | null;
  target_name: string | null;
  ip_address: string | null;
  user_agent: string | null;
  created_at: string;
};

const ACTION_COLOR: Record<string, string> = {
  activate: "text-emerald-400 bg-emerald-500/10",
  activate_user: "text-emerald-400 bg-emerald-500/10",
  activate_workspace: "text-emerald-400 bg-emerald-500/10",
  disable: "text-amber-400 bg-amber-500/10",
  disable_user: "text-amber-400 bg-amber-500/10",
  suspend_workspace: "text-amber-400 bg-amber-500/10",
  delete: "text-red-400 bg-red-500/10",
  delete_user: "text-red-400 bg-red-500/10",
  delete_workspace: "text-red-400 bg-red-500/10",
  send_password_reset: "text-sky-400 bg-sky-500/10",
  change_role: "text-purple-400 bg-purple-500/10",
  force_logout: "text-orange-400 bg-orange-500/10",
  transfer_ownership: "text-blue-400 bg-blue-500/10",
};

function actionColor(action: string) {
  for (const key of Object.keys(ACTION_COLOR)) {
    if (action.toLowerCase().includes(key)) return ACTION_COLOR[key];
  }
  return "text-ink-muted bg-base-raised";
}

function exportCsv(logs: AuditLog[]) {
  const headers = ["ID", "Actor", "Role", "Action", "Target Type", "Target", "IP", "When"];
  const rows = logs.map(l => [
    l.id, l.actor_email ?? "", l.actor_role ?? "", l.action,
    l.target_type ?? "", l.target_name ?? "", l.ip_address ?? "",
    new Date(l.created_at).toLocaleString(),
  ].map(v => `"${v}"`).join(","));
  const csv = [headers.join(","), ...rows].join("\n");
  const blob = new Blob([csv], { type: "text/csv" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url; a.download = "audit_logs.csv"; a.click();
  URL.revokeObjectURL(url);
}

export default function AdminAudit() {
  const [logs, setLogs] = useState<AuditLog[]>([]);
  const [loading, setLoading] = useState(true);
  const [actionFilter, setActionFilter] = useState("");
  const [limit, setLimit] = useState(100);

  const load = useCallback(async () => {
    setLoading(true);
    let query = supabase
      .from("platform_audit_logs")
      .select("id, actor_email, actor_role, action, target_type, target_name, ip_address, user_agent, created_at")
      .order("created_at", { ascending: false })
      .limit(limit);

    const { data, error } = await query;
    if (error) {
      toast.error("Unable to load audit logs.");
      console.error(error);
    } else {
      setLogs(data ?? []);
    }
    setLoading(false);
  }, [limit]);

  useEffect(() => { load(); }, [load]);

  const filtered = actionFilter
    ? logs.filter(l => l.action.toLowerCase().includes(actionFilter.toLowerCase()))
    : logs;

  // Unique action types for filter
  const actionTypes = Array.from(new Set(logs.map(l => l.action))).sort();

  return (
    <div className="space-y-5">
      <PageHeader
        title="Audit Log"
        subtitle={`${logs.length} recent admin actions logged.`}
        action={
          <div className="flex items-center gap-2">
            <button
              onClick={() => exportCsv(filtered)}
              className="inline-flex items-center gap-1.5 rounded-lg border border-base-border px-3 py-1.5 text-[12.5px] text-ink-muted hover:bg-base-raised transition-colors"
            >
              <Download size={13} /> Export CSV
            </button>
            <button
              onClick={load}
              disabled={loading}
              className="inline-flex items-center gap-1.5 rounded-lg border border-base-border px-3 py-1.5 text-[12.5px] text-ink-muted hover:bg-base-raised transition-colors"
            >
              <RefreshCw size={13} className={loading ? "animate-spin" : ""} /> Refresh
            </button>
          </div>
        }
      />

      {/* Filters */}
      <div className="flex flex-wrap items-center gap-3">
        <select
          value={actionFilter}
          onChange={e => setActionFilter(e.target.value)}
          className="rounded-lg border border-base-border bg-base-surface px-3 py-2 text-[13px] text-ink focus:outline-none"
        >
          <option value="">All Actions</option>
          {actionTypes.map(a => <option key={a} value={a}>{a}</option>)}
        </select>
        <select
          value={limit}
          onChange={e => setLimit(Number(e.target.value))}
          className="rounded-lg border border-base-border bg-base-surface px-3 py-2 text-[13px] text-ink focus:outline-none"
        >
          <option value={50}>Last 50</option>
          <option value={100}>Last 100</option>
          <option value={500}>Last 500</option>
        </select>
        <span className="text-[12px] text-ink-muted">{filtered.length} entries</span>
      </div>

      {loading ? (
        <div className="flex items-center gap-2 rounded-xl border border-base-border bg-base-surface p-6 text-[13px] text-ink-muted">
          <Loader2 size={15} className="animate-spin" /> Loading audit logs…
        </div>
      ) : filtered.length === 0 ? (
        <div className="rounded-xl border border-base-border bg-base-surface p-10 text-center">
          <ShieldAlert size={32} className="mx-auto mb-3 text-ink-faint opacity-40" />
          <div className="text-[14px] font-medium text-ink-muted">No audit logs yet.</div>
          <div className="text-[12.5px] text-ink-faint mt-1">Admin actions will appear here automatically.</div>
        </div>
      ) : (
        <div className="overflow-hidden rounded-xl border border-base-border bg-base-surface shadow-card">
          {/* Header */}
          <div className="hidden md:grid grid-cols-[2fr_0.9fr_1.4fr_1fr_1fr_1.2fr] border-b border-base-border bg-base-raised/70 px-4 py-3 text-[11px] font-semibold uppercase tracking-[0.2em] text-ink-faint">
            <div>Actor</div>
            <div>Role</div>
            <div>Action</div>
            <div>Target</div>
            <div>Type</div>
            <div>When</div>
          </div>
          <div className="divide-y divide-base-border/50 max-h-[600px] overflow-y-auto">
            {filtered.map(log => (
              <div key={log.id} className="grid grid-cols-1 md:grid-cols-[2fr_0.9fr_1.4fr_1fr_1fr_1.2fr] items-center px-4 py-3 gap-1 md:gap-0 hover:bg-base-raised/20 transition-colors">
                <div className="text-[13px] text-ink truncate">{log.actor_email ?? <span className="text-ink-faint">System</span>}</div>
                <div>
                  {log.actor_role && (
                    <span className="rounded-md bg-base-raised px-2 py-0.5 text-[11.5px] text-ink-muted capitalize">{log.actor_role}</span>
                  )}
                </div>
                <div>
                  <span className={`inline-flex rounded-md px-2 py-0.5 text-[11.5px] font-medium ${actionColor(log.action)}`}>
                    {log.action}
                  </span>
                </div>
                <div className="text-[12.5px] text-ink-muted truncate">{log.target_name ?? "—"}</div>
                <div className="text-[12px] text-ink-faint capitalize">{log.target_type ?? "—"}</div>
                <div className="text-[12px] text-ink-faint whitespace-nowrap">{new Date(log.created_at).toLocaleString()}</div>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
