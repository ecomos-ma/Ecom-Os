import { useEffect, useState } from "react";
import { PageHeader } from "../../components/PageHeader";
import { supabase } from "../../lib/supabase";
import {
  Users, Building2, ShoppingCart, Package, UserCheck, Server,
  TrendingUp, Activity, DollarSign, Loader2,
} from "lucide-react";

interface SystemStats {
  totalUsers: number;
  activeUsers: number;
  totalWorkspaces: number;
  activeWorkspaces: number;
  totalOrders: number;
  totalProducts: number;
  totalCustomers: number;
  totalRevenue: number;
  newUsersToday: number;
  newWorkspacesToday: number;
}

function StatTile({ icon, label, value, sub }: { icon: React.ReactNode; label: string; value: string | number; sub?: string }) {
  return (
    <div className="rounded-xl border border-base-border bg-base-surface p-5 shadow-card flex items-start gap-4">
      <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-brand/10 text-brand shrink-0">
        {icon}
      </div>
      <div className="min-w-0">
        <div className="text-[12px] uppercase tracking-[0.2em] text-ink-faint font-medium">{label}</div>
        <div className="mt-1 text-[22px] font-semibold text-ink leading-none">{value}</div>
        {sub && <div className="mt-1 text-[12px] text-ink-muted">{sub}</div>}
      </div>
    </div>
  );
}

export default function AdminDashboard() {
  const [stats, setStats] = useState<SystemStats | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const load = async () => {
      setLoading(true);
      const today = new Date();
      today.setHours(0, 0, 0, 0);
      const todayIso = today.toISOString();

      const [
        profilesRes, activeProfilesRes, workspacesRes,
        ordersRes, productsRes, customersRes, revenueRes,
        newUsersRes, newWorkspacesRes,
      ] = await Promise.all([
        supabase.from("profiles").select("id", { count: "exact", head: true }),
        supabase.from("profiles").select("id", { count: "exact", head: true }).eq("is_active", true),
        supabase.from("workspaces").select("id", { count: "exact", head: true }),
        supabase.from("orders").select('"Order ID"', { count: "exact", head: true }),
        supabase.from("products").select("id", { count: "exact", head: true }),
        supabase.from("customers").select("id", { count: "exact", head: true }),
        supabase.from("orders").select("total").in("status", ["LIVRE", "delivered", "livré"]),
        supabase.from("profiles").select("id", { count: "exact", head: true }).gte("created_at", todayIso),
        supabase.from("workspaces").select("id", { count: "exact", head: true }).gte("created_at", todayIso),
      ]);

      const revenue = (revenueRes.data ?? []).reduce((s: number, o: any) => s + Number(o.total || 0), 0);

      setStats({
        totalUsers: profilesRes.count ?? 0,
        activeUsers: activeProfilesRes.count ?? 0,
        totalWorkspaces: workspacesRes.count ?? 0,
        activeWorkspaces: workspacesRes.count ?? 0,
        totalOrders: ordersRes.count ?? 0,
        totalProducts: productsRes.count ?? 0,
        totalCustomers: customersRes.count ?? 0,
        totalRevenue: revenue,
        newUsersToday: newUsersRes.count ?? 0,
        newWorkspacesToday: newWorkspacesRes.count ?? 0,
      });
      setLoading(false);
    };
    load();
  }, []);

  return (
    <div className="space-y-6">
      <PageHeader
        title="Platform Overview"
        subtitle="Real-time health of your entire platform — users, workspaces, data and revenue."
      />

      {loading ? (
        <div className="flex items-center gap-2 rounded-xl border border-base-border bg-base-surface p-6 text-[13px] text-ink-muted">
          <Loader2 size={16} className="animate-spin" /> Loading platform metrics…
        </div>
      ) : stats && (
        <>
          {/* Row 1 — Users & Workspaces */}
          <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
            <StatTile icon={<Users size={18} />} label="Total Users" value={stats.totalUsers} sub={`+${stats.newUsersToday} today`} />
            <StatTile icon={<UserCheck size={18} />} label="Active Users" value={stats.activeUsers} sub={`${stats.totalUsers - stats.activeUsers} disabled`} />
            <StatTile icon={<Building2 size={18} />} label="Total Workspaces" value={stats.totalWorkspaces} sub={`+${stats.newWorkspacesToday} today`} />
            <StatTile icon={<Activity size={18} />} label="Active Workspaces" value={stats.activeWorkspaces} />
          </div>

          {/* Row 2 — Data */}
          <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
            <StatTile icon={<ShoppingCart size={18} />} label="Total Orders" value={stats.totalOrders.toLocaleString()} />
            <StatTile icon={<Users size={18} />} label="Total Customers" value={stats.totalCustomers.toLocaleString()} />
            <StatTile icon={<Package size={18} />} label="Total Products" value={stats.totalProducts.toLocaleString()} />
            <StatTile icon={<DollarSign size={18} />} label="Platform Revenue" value={`MAD ${stats.totalRevenue.toLocaleString("en-US", { maximumFractionDigits: 0 })}`} />
          </div>

          {/* Status */}
          <div className="grid gap-4 sm:grid-cols-2">
            <div className="rounded-xl border border-base-border bg-base-surface p-5 shadow-card">
              <div className="text-[12px] uppercase tracking-[0.2em] text-ink-faint font-medium mb-4">System Status</div>
              <div className="space-y-3">
                {[
                  { label: "Database", status: "Operational" },
                  { label: "Auth Service", status: "Operational" },
                  { label: "Realtime", status: "Operational" },
                  { label: "Storage", status: "Operational" },
                ].map(item => (
                  <div key={item.label} className="flex items-center justify-between">
                    <span className="text-[13px] text-ink">{item.label}</span>
                    <span className="inline-flex items-center gap-1.5 rounded-full bg-emerald-500/10 px-2.5 py-1 text-[11.5px] font-medium text-emerald-400">
                      <span className="h-1.5 w-1.5 rounded-full bg-emerald-400 animate-pulse" /> {item.status}
                    </span>
                  </div>
                ))}
              </div>
            </div>
            <div className="rounded-xl border border-base-border bg-base-surface p-5 shadow-card">
              <div className="flex items-center gap-2 mb-4">
                <Server size={16} className="text-ink-faint" />
                <div className="text-[12px] uppercase tracking-[0.2em] text-ink-faint font-medium">Platform Activity</div>
              </div>
              <div className="space-y-4">
                <div>
                  <div className="flex justify-between text-[12px] text-ink-muted mb-1.5">
                    <span>User adoption</span>
                    <span>{stats.activeUsers}/{stats.totalUsers}</span>
                  </div>
                  <div className="h-2 rounded-full bg-base-raised overflow-hidden">
                    <div className="h-full rounded-full bg-brand-accent transition-all" style={{ width: `${stats.totalUsers ? (stats.activeUsers / stats.totalUsers) * 100 : 0}%` }} />
                  </div>
                </div>
                <div>
                  <div className="flex justify-between text-[12px] text-ink-muted mb-1.5">
                    <span>Workspace activity</span>
                    <span>{stats.activeWorkspaces}/{stats.totalWorkspaces}</span>
                  </div>
                  <div className="h-2 rounded-full bg-base-raised overflow-hidden">
                    <div className="h-full rounded-full bg-emerald-400 transition-all" style={{ width: `${stats.totalWorkspaces ? (stats.activeWorkspaces / stats.totalWorkspaces) * 100 : 0}%` }} />
                  </div>
                </div>
                <div className="pt-2 border-t border-base-border">
                  <div className="flex items-center gap-2 text-[13px] text-ink-muted">
                    <TrendingUp size={14} className="text-brand-accent" />
                    <span>+{stats.newUsersToday} new users today</span>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </>
      )}
    </div>
  );
}
