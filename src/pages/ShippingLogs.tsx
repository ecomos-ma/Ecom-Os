import { useEffect, useState } from "react";
import { PageHeader } from "../components/PageHeader";
import { supabase } from "../lib/supabase";
import { EmptyState } from "../components/EmptyState";

export default function ShippingLogs() {
  const [logs, setLogs] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;
    async function load() {
      setLoading(true);
      const { data, error } = await supabase.from("shipping_logs").select("*, workspace_id").order("created_at", { ascending: false }).limit(200);
      if (!cancelled) {
        if (error) {
          console.error("Failed to load shipping logs", error);
          setLogs([]);
        } else {
          setLogs(data ?? []);
        }
        setLoading(false);
      }
    }
    load();
    return () => { cancelled = true; };
  }, []);

  return (
    <div>
      <PageHeader title="Shipping Logs" subtitle="All shipment attempts and provider responses." />
      <div className="mt-4">
        {loading ? (
          <div className="space-y-3">
            <div className="h-8 w-48 bg-base-raised rounded animate-pulse" />
            <div className="h-64 bg-base-raised rounded animate-pulse" />
          </div>
        ) : logs.length === 0 ? (
          <EmptyState title="No shipping logs" subtitle="Shipments will appear here after attempts." />
        ) : (
          <div className="rounded-xl border border-base-border bg-base-surface p-4">
            <table className="w-full text-[13px]">
              <thead>
                <tr className="text-left text-[12px] text-ink-muted border-b border-base-border">
                  <th className="p-2">Time</th>
                  <th className="p-2">Workspace</th>
                  <th className="p-2">Provider</th>
                  <th className="p-2">Order</th>
                  <th className="p-2">Action</th>
                  <th className="p-2">Status</th>
                </tr>
              </thead>
              <tbody>
                {logs.map((l) => (
                  <tr key={l.id} className="border-b border-base-border last:border-0">
                    <td className="p-2 text-ink-muted">{new Date(l.created_at).toLocaleString()}</td>
                    <td className="p-2 text-ink">{l.workspace_id}</td>
                    <td className="p-2 text-ink">{l.provider}</td>
                    <td className="p-2 text-ink">{l.order_number ?? "—"}</td>
                    <td className="p-2 text-ink-muted">{l.action}</td>
                    <td className="p-2 text-ink-muted">{l.http_status ?? (l.error ? "error" : "pending")}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
}
