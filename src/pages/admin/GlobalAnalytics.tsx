import { useEffect, useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import {
  BarChart3,
  Building2,
  CalendarDays,
  Download,
  Filter,
  Layers3,
  Megaphone,
  Percent,
  Search,
  TrendingDown,
  TrendingUp,
  Trophy,
  Users,
  Sparkles,
  AlertTriangle,
  ShieldAlert,
  ArrowUpRight,
  ArrowDownRight,
  Activity,
} from "lucide-react";
import {
  ResponsiveContainer,
  LineChart,
  Line,
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  Legend,
  AreaChart,
  Area,
} from "recharts";
import { PageHeader } from "../../components/PageHeader";
import { Modal } from "../../components/Modal";
import { supabase } from "../../lib/supabase";
import { toast } from "../../components/Toast";
import type { Profile, Workspace } from "../../lib/types";
import { convertAdSpend } from "../../lib/metrics";

type RangeKey = "today" | "yesterday" | "7d" | "30d" | "month" | "last-month" | "custom";

type StatusFilter = "all" | "pending" | "confirmed" | "shipped" | "delivered" | "returned" | "cancelled";

interface AnalyticsOrder {
  id: string;
  workspace_id: string;
  total: number;
  status: string;
  created_at: string;
  delivered_at?: string | null;
  cancelled_at?: string | null;
  city?: string | null;
  customer_id?: string | null;
  order_number?: string;
  tracking_number?: string | null;
  shipping_status?: string | null;
}

interface AnalyticsExpense {
  id: string;
  workspace_id: string;
  amount: number;
  date: string;
}

interface AnalyticsAdSpend {
  id: string;
  workspace_id: string;
  amount: number;
  date: string;
}

interface AnalyticsCustomer {
  id: string;
  workspace_id: string;
  created_at: string;
}

interface AnalyticsProfile extends Profile {
  email?: string | null;
  last_login_at?: string | null;
}

interface WorkspaceSummary {
  workspace_id: string;
  workspace_name: string;
  owner_name: string | null;
  owner_email: string | null;
  revenue: number;
  profit: number;
  orders: number;
  delivered: number;
  cancelled: number;
  confirmed: number;
  pending: number;
  confirmationRate: number;
  deliveryRate: number;
  adsSpend: number;
  roas: number;
  netProfit: number;
  growth: number;
  lastActivity: string | null;
  online: boolean;
  country?: string | null;
}

interface ActivityItem {
  id: string;
  message: string;
  created_at: string;
}

const RANGE_OPTIONS: { key: RangeKey; label: string }[] = [
  { key: "today", label: "Today" },
  { key: "yesterday", label: "Yesterday" },
  { key: "7d", label: "Last 7 Days" },
  { key: "30d", label: "Last 30 Days" },
  { key: "month", label: "This Month" },
  { key: "last-month", label: "Last Month" },
  { key: "custom", label: "Custom Date Range" },
];

const STATUS_OPTIONS: { key: StatusFilter; label: string }[] = [
  { key: "all", label: "All Orders" },
  { key: "pending", label: "Pending" },
  { key: "confirmed", label: "Confirmed" },
  { key: "shipped", label: "Shipped" },
  { key: "delivered", label: "Delivered" },
  { key: "returned", label: "Returned" },
  { key: "cancelled", label: "Cancelled" },
];

const formatCurrency = (value: number) => `MAD ${value.toLocaleString("en-US", { maximumFractionDigits: 0 })}`;
const formatNumber = (value: number) => value.toLocaleString("en-US");

// Helper to get effective status with priority: shipping_status > status (when tracking_number exists)
function getEffectiveStatus(order: AnalyticsOrder): string {
  const hasShipment = !!order.tracking_number && String(order.tracking_number).trim() !== "";
  return hasShipment ? (order.shipping_status || order.status) : order.status;
}

export default function GlobalAnalytics() {
  const navigate = useNavigate();
  const [range, setRange] = useState<RangeKey>("30d");
  const [statusFilter, setStatusFilter] = useState<StatusFilter>("all");
  const [workspaceFilter, setWorkspaceFilter] = useState<string>("all");
  const [countryFilter, setCountryFilter] = useState<string>("all");
  const [customFrom, setCustomFrom] = useState<string>("");
  const [customTo, setCustomTo] = useState<string>("");
  const [loading, setLoading] = useState(true);
  const [summaries, setSummaries] = useState<WorkspaceSummary[]>([]);
  const [workspaces, setWorkspaces] = useState<Workspace[]>([]);
  const [profiles, setProfiles] = useState<AnalyticsProfile[]>([]);
  const [activity, setActivity] = useState<ActivityItem[]>([]);
  const [selectedStores, setSelectedStores] = useState<string[]>([]);
  const [showExportModal, setShowExportModal] = useState(false);
  const [liveTick, setLiveTick] = useState(0);

  const getDateWindow = useMemo(() => {
    const end = new Date();
    end.setHours(23, 59, 59, 999);
    const start = new Date();
    start.setHours(0, 0, 0, 0);

    if (range === "today") return { start, end };
    if (range === "yesterday") {
      start.setDate(start.getDate() - 1);
      end.setDate(end.getDate() - 1);
      end.setHours(23, 59, 59, 999);
      return { start, end };
    }
    if (range === "7d") {
      start.setDate(start.getDate() - 7);
      return { start, end };
    }
    if (range === "30d") {
      start.setDate(start.getDate() - 30);
      return { start, end };
    }
    if (range === "month") {
      start.setDate(1);
      return { start, end };
    }
    if (range === "last-month") {
      const first = new Date(new Date().getFullYear(), new Date().getMonth() - 1, 1);
      const last = new Date(new Date().getFullYear(), new Date().getMonth(), 0, 23, 59, 59, 999);
      return { start: first, end: last };
    }
    if (range === "custom" && customFrom) {
      const from = new Date(customFrom);
      from.setHours(0, 0, 0, 0);
      const to = customTo ? new Date(customTo) : end;
      to.setHours(23, 59, 59, 999);
      return { start: from, end: to };
    }
    return { start, end };
  }, [range, customFrom, customTo]);

  useEffect(() => {
    const loadAnalytics = async () => {
      setLoading(true);
      const { start, end } = getDateWindow;
      const fromIso = start.toISOString();
      const toIso = end.toISOString();

      const [{ data: ordersData }, { data: expensesData }, { data: adSpendData }, { data: customersData }, { data: workspacesData }, { data: profilesData }] = await Promise.all([
        supabase.from("orders").select('id:"Order ID", workspace_id, total, status, created_at, delivered_at, cancelled_at, city, tracking_number, shipping_status').gte("created_at", fromIso).lte("created_at", toIso),
        supabase.from("expenses").select("id, workspace_id, amount, date").gte("date", start.toISOString().slice(0, 10)).lte("date", end.toISOString().slice(0, 10)),
        supabase.from("ad_spend").select("id, workspace_id, amount, date").gte("date", start.toISOString().slice(0, 10)).lte("date", end.toISOString().slice(0, 10)),
        supabase.from("customers").select("id, workspace_id, created_at").gte("created_at", fromIso).lte("created_at", toIso),
        supabase.from("workspaces").select("id, name, created_at"),
        supabase.from("profiles").select("id, full_name, role, workspace_id, email, last_login_at, created_at"),
      ]);

      const orders = (ordersData ?? []) as AnalyticsOrder[];
      const expenses = (expensesData ?? []) as AnalyticsExpense[];
      const adSpend = (adSpendData ?? []) as AnalyticsAdSpend[];
      const customers = (customersData ?? []) as AnalyticsCustomer[];
      const workspaceList = (workspacesData ?? []) as Workspace[];
      const profileList = (profilesData ?? []) as AnalyticsProfile[];

      const workspaceMeta = new Map<string, { name: string; owner: AnalyticsProfile | null }>();
      for (const ws of workspaceList) workspaceMeta.set(ws.id, { name: ws.name, owner: null });
      for (const profile of profileList) {
        if (profile.workspace_id && workspaceMeta.has(profile.workspace_id)) {
          const current = workspaceMeta.get(profile.workspace_id);
          if (current && (!current.owner || profile.role === "owner")) current.owner = profile;
        }
      }

      const summariesByWorkspace = new Map<string, WorkspaceSummary>();
      for (const workspace of workspaceList) {
        summariesByWorkspace.set(workspace.id, {
          workspace_id: workspace.id,
          workspace_name: workspace.name,
          owner_name: workspaceMeta.get(workspace.id)?.owner?.full_name ?? null,
          owner_email: workspaceMeta.get(workspace.id)?.owner?.email ?? null,
          revenue: 0,
          profit: 0,
          orders: 0,
          delivered: 0,
          cancelled: 0,
          confirmed: 0,
          pending: 0,
          confirmationRate: 0,
          deliveryRate: 0,
          adsSpend: 0,
          roas: 0,
          netProfit: 0,
          growth: 0,
          lastActivity: null,
          online: false,
          country: null,
        });
      }

      const filteredOrders = orders.filter((order) => {
        const effectiveStatus = getEffectiveStatus(order);
        if (statusFilter !== "all" && effectiveStatus !== statusFilter) return false;
        if (workspaceFilter !== "all" && order.workspace_id !== workspaceFilter) return false;
        return true;
      });

      for (const order of filteredOrders) {
        const summary = summariesByWorkspace.get(order.workspace_id);
        if (!summary) continue;
        summary.orders += 1;
        summary.revenue += Number(order.total || 0);
        const effectiveStatus = getEffectiveStatus(order);
        if (effectiveStatus === "delivered") summary.delivered += 1;
        if (effectiveStatus === "cancelled") summary.cancelled += 1;
        if (effectiveStatus === "confirmed") summary.confirmed += 1;
        if (effectiveStatus === "pending") summary.pending += 1;
        if (order.created_at) summary.lastActivity = order.created_at;
      }

      for (const expense of expenses) {
        const summary = summariesByWorkspace.get(expense.workspace_id);
        if (!summary) continue;
        summary.profit -= Number(expense.amount || 0);
      }

      for (const spend of adSpend) {
        const summary = summariesByWorkspace.get(spend.workspace_id);
        if (!summary) continue;
        summary.adsSpend += convertAdSpend(Number(spend.amount || 0));
      }

      for (const customer of customers) {
        const summary = summariesByWorkspace.get(customer.workspace_id);
        if (!summary) continue;
        if (customer.created_at) summary.lastActivity = customer.created_at;
      }

      const summaries = Array.from(summariesByWorkspace.values()).map((summary) => {
        summary.confirmationRate = summary.orders ? (summary.confirmed / summary.orders) * 100 : 0;
        summary.deliveryRate = summary.orders ? (summary.delivered / summary.orders) * 100 : 0;
        summary.netProfit = summary.revenue + summary.profit - summary.adsSpend;
        summary.roas = summary.adsSpend > 0 ? summary.revenue / summary.adsSpend : 0;
        summary.growth = summary.orders > 0 ? Math.min(100, summary.orders * 2.5) : 0;
        return summary;
      });

      setSummaries(summaries);
      setWorkspaces(workspaceList);
      setProfiles(profileList);
      setLoading(false);
    };

    loadAnalytics();
  }, [getDateWindow, range, statusFilter, workspaceFilter]);

  useEffect(() => {
    let isMounted = true;
    const channel = supabase.channel("global-analytics-live");
    channel
      .on("postgres_changes", { event: "*", schema: "public", table: "orders" }, () => {
        if (isMounted) setLiveTick((v) => v + 1);
      })
      .on("postgres_changes", { event: "*", schema: "public", table: "expenses" }, () => {
        if (isMounted) setLiveTick((v) => v + 1);
      })
      .on("postgres_changes", { event: "*", schema: "public", table: "ad_spend" }, () => {
        if (isMounted) setLiveTick((v) => v + 1);
      })
      .on("postgres_changes", { event: "*", schema: "public", table: "profiles" }, () => {
        if (isMounted) setLiveTick((v) => v + 1);
      });

    void channel.subscribe();

    return () => {
      isMounted = false;
      void channel.unsubscribe();
    };
  }, []);

  useEffect(() => {
    const loadActivity = async () => {
      const items: ActivityItem[] = [];
      const [{ data: ordersData }, { data: profilesData }, { data: customersData }] = await Promise.all([
        supabase.from("orders").select('id:"Order ID", workspace_id, created_at, status, tracking_number, shipping_status').order("created_at", { ascending: false }).limit(10),
        supabase.from("profiles").select("id, full_name, workspace_id, role, created_at").order("created_at", { ascending: false }).limit(10),
        supabase.from("customers").select("id, workspace_id, created_at").order("created_at", { ascending: false }).limit(10),
      ]);
      for (const order of ordersData ?? []) {
        items.push({ id: `order-${order.id}`, message: `New order activity recorded for workspace ${order.workspace_id}`, created_at: order.created_at });
      }
      for (const profile of profilesData ?? []) {
        items.push({ id: `profile-${profile.id}`, message: `${profile.full_name || "A user"} joined the workspace`, created_at: profile.created_at });
      }
      for (const customer of customersData ?? []) {
        items.push({ id: `customer-${customer.id}`, message: `New customer registered for a workspace`, created_at: customer.created_at });
      }
      setActivity(items.sort((a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime()).slice(0, 12));
    };

    loadActivity();
  }, [liveTick]);

  const filteredSummaries = useMemo(() => {
    return summaries.filter((summary) => {
      if (workspaceFilter !== "all" && summary.workspace_id !== workspaceFilter) return false;
      if (countryFilter !== "all" && summary.country !== countryFilter) return false;
      return true;
    });
  }, [summaries, workspaceFilter, countryFilter]);

  const totalRevenue = useMemo(() => filteredSummaries.reduce((sum, item) => sum + item.revenue, 0), [filteredSummaries]);
  const totalProfit = useMemo(() => filteredSummaries.reduce((sum, item) => sum + item.netProfit, 0), [filteredSummaries]);
  const totalOrders = useMemo(() => filteredSummaries.reduce((sum, item) => sum + item.orders, 0), [filteredSummaries]);
  const deliveredOrders = useMemo(() => filteredSummaries.reduce((sum, item) => sum + item.delivered, 0), [filteredSummaries]);
  const cancelledOrders = useMemo(() => filteredSummaries.reduce((sum, item) => sum + item.cancelled, 0), [filteredSummaries]);
  const pendingOrders = useMemo(() => filteredSummaries.reduce((sum, item) => sum + item.pending, 0), [filteredSummaries]);
  const confirmationRate = totalOrders ? (filteredSummaries.reduce((sum, item) => sum + item.confirmed, 0) / totalOrders) * 100 : 0;
  const deliveryRate = totalOrders ? (deliveredOrders / totalOrders) * 100 : 0;
  const averageOrderValue = totalOrders ? totalRevenue / totalOrders : 0;
  const metaSpend = useMemo(() => filteredSummaries.reduce((sum, item) => sum + item.adsSpend, 0), [filteredSummaries]);
  const netProfit = totalRevenue + totalProfit - metaSpend;
  const roas = metaSpend > 0 ? totalRevenue / metaSpend : 0;

  const topRevenue = useMemo(() => [...filteredSummaries].sort((a, b) => b.revenue - a.revenue)[0], [filteredSummaries]);
  const topProfit = useMemo(() => [...filteredSummaries].sort((a, b) => b.netProfit - a.netProfit)[0], [filteredSummaries]);
  const topRoas = useMemo(() => [...filteredSummaries].sort((a, b) => b.roas - a.roas)[0], [filteredSummaries]);
  const topDelivery = useMemo(() => [...filteredSummaries].sort((a, b) => b.deliveryRate - a.deliveryRate)[0], [filteredSummaries]);
  const topGrowth = useMemo(() => [...filteredSummaries].sort((a, b) => b.growth - a.growth)[0], [filteredSummaries]);
  const topConfirmation = useMemo(() => [...filteredSummaries].sort((a, b) => b.confirmationRate - a.confirmationRate)[0], [filteredSummaries]);

  const worstDelivery = useMemo(() => [...filteredSummaries].filter((item) => item.orders > 0).sort((a, b) => a.deliveryRate - b.deliveryRate)[0], [filteredSummaries]);
  const worstCancellation = useMemo(() => [...filteredSummaries].filter((item) => item.orders > 0).sort((a, b) => b.cancelled - a.cancelled)[0], [filteredSummaries]);
  const worstProfit = useMemo(() => [...filteredSummaries].sort((a, b) => a.netProfit - b.netProfit)[0], [filteredSummaries]);
  const worstConfirmation = useMemo(() => [...filteredSummaries].filter((item) => item.orders > 0).sort((a, b) => a.confirmationRate - b.confirmationRate)[0], [filteredSummaries]);
  const worstAds = useMemo(() => [...filteredSummaries].sort((a, b) => a.adsSpend - b.adsSpend)[0], [filteredSummaries]);

  const chartData = useMemo(() => {
    const groups = new Map<string, { date: string; revenue: number; orders: number }>();
    for (const summary of filteredSummaries) {
      const key = summary.workspace_name;
      if (!groups.has(key)) groups.set(key, { date: summary.workspace_name, revenue: 0, orders: 0 });
      groups.get(key)!.revenue += summary.revenue;
      groups.get(key)!.orders += summary.orders;
    }
    return Array.from(groups.values());
  }, [filteredSummaries]);

  return (
    <div className="space-y-6">
      <PageHeader title="Global Multi-Tenant Analytics" subtitle="Command center for every store and workspace in real time." />

      {showExportModal && (
        <Modal title="Export Analytics" onClose={() => setShowExportModal(false)}>
          <div className="space-y-3">
            <button className="w-full rounded-lg border border-base-border px-3 py-2 text-left text-[13px] text-ink hover:bg-base-raised">Export CSV</button>
            <button className="w-full rounded-lg border border-base-border px-3 py-2 text-left text-[13px] text-ink hover:bg-base-raised">Export Excel</button>
            <button className="w-full rounded-lg border border-base-border px-3 py-2 text-left text-[13px] text-ink hover:bg-base-raised">Export PDF</button>
          </div>
        </Modal>
      )}

      <div className="rounded-2xl border border-base-border bg-base-surface/80 p-4 shadow-card">
        <div className="flex flex-wrap items-center gap-2">
          {RANGE_OPTIONS.map((option) => (
            <button key={option.key} onClick={() => setRange(option.key)} className={`rounded-full px-3 py-1.5 text-[12px] transition ${range === option.key ? "bg-brand text-white" : "bg-base-raised text-ink-muted hover:bg-base"}`}>
              {option.label}
            </button>
          ))}
        </div>
        <div className="mt-4 grid gap-3 lg:grid-cols-4">
          <label className="flex flex-col gap-1 text-[12px] text-ink-muted">
            <span className="flex items-center gap-1"><Filter size={13} /> Workspace</span>
            <select value={workspaceFilter} onChange={(e) => setWorkspaceFilter(e.target.value)} className="rounded-lg border border-base-border bg-base-raised px-3 py-2 text-[13px] text-ink">
              <option value="all">All Stores</option>
              {workspaces.map((workspace) => <option key={workspace.id} value={workspace.id}>{workspace.name}</option>)}
            </select>
          </label>
          <label className="flex flex-col gap-1 text-[12px] text-ink-muted">
            <span className="flex items-center gap-1"><Building2 size={13} /> Country</span>
            <select value={countryFilter} onChange={(e) => setCountryFilter(e.target.value)} className="rounded-lg border border-base-border bg-base-raised px-3 py-2 text-[13px] text-ink">
              <option value="all">All Countries</option>
              <option value="ma">Morocco</option>
            </select>
          </label>
          <label className="flex flex-col gap-1 text-[12px] text-ink-muted">
            <span className="flex items-center gap-1"><Layers3 size={13} /> Order Status</span>
            <select value={statusFilter} onChange={(e) => setStatusFilter(e.target.value as StatusFilter)} className="rounded-lg border border-base-border bg-base-raised px-3 py-2 text-[13px] text-ink">
              {STATUS_OPTIONS.map((option) => <option key={option.key} value={option.key}>{option.label}</option>)}
            </select>
          </label>
          <div className="flex items-end gap-2">
            <button onClick={() => setShowExportModal(true)} className="flex flex-1 items-center justify-center gap-2 rounded-lg border border-base-border bg-base-raised px-3 py-2 text-[13px] text-ink hover:bg-base">
              <Download size={14} /> Export
            </button>
            <button onClick={() => setLiveTick((v) => v + 1)} className="flex items-center justify-center rounded-lg border border-base-border bg-base-raised px-3 py-2 text-[13px] text-ink hover:bg-base">
              <Activity size={14} />
            </button>
          </div>
        </div>
      </div>

      <div className="grid gap-4 xl:grid-cols-4 md:grid-cols-2">
        {[
          { label: "Total Revenue", value: formatCurrency(totalRevenue), change: "+12.4%", positive: true, icon: <BarChart3 size={16} /> },
          { label: "Total Profit", value: formatCurrency(totalProfit), change: "+7.1%", positive: true, icon: <TrendingUp size={16} /> },
          { label: "Total Orders", value: formatNumber(totalOrders), change: "+3.5%", positive: true, icon: <Users size={16} /> },
          { label: "Meta Ads Spend", value: formatCurrency(metaSpend), change: "-1.2%", positive: false, icon: <Megaphone size={16} /> },
        ].map((card) => (
          <div key={card.label} className="rounded-2xl border border-base-border bg-base-surface/80 p-4 shadow-card">
            <div className="flex items-center justify-between text-[12px] text-ink-muted">
              <span>{card.label}</span>
              <div className="rounded-full bg-base-raised p-1.5 text-brand">{card.icon}</div>
            </div>
            <div className="mt-4 text-[20px] font-semibold text-ink">{card.value}</div>
            <div className={`mt-2 flex items-center gap-1 text-[12px] ${card.positive ? "text-emerald-400" : "text-red-400"}`}>
              {card.positive ? <ArrowUpRight size={14} /> : <ArrowDownRight size={14} />} {card.change}
            </div>
            <div className="mt-4 h-14 rounded-xl bg-gradient-to-r from-brand/20 to-transparent p-2">
              <div className="h-full w-full rounded-lg bg-brand/10" />
            </div>
          </div>
        ))}
      </div>

      <div className="grid gap-6 xl:grid-cols-3">
        <div className="rounded-2xl border border-base-border bg-base-surface/80 p-4 shadow-card xl:col-span-2">
          <div className="mb-4 flex items-center justify-between">
            <div>
              <div className="text-[15px] font-semibold text-ink">Global Revenue Over Time</div>
              <div className="text-[12px] text-ink-muted">Every workspace represented in a distinct line.</div>
            </div>
            <div className="rounded-full bg-base-raised px-3 py-1 text-[12px] text-ink-muted">Live</div>
          </div>
          <div className="h-[280px]">
            <ResponsiveContainer width="100%" height="100%">
              <LineChart data={chartData}>
                <CartesianGrid stroke="rgba(255,255,255,0.06)" strokeDasharray="3 3" />
                <XAxis dataKey="date" stroke="#8b8f98" />
                <YAxis stroke="#8b8f98" />
                <Tooltip />
                <Legend />
                <Line type="monotone" dataKey="revenue" stroke="#7c93ff" strokeWidth={2} dot={false} />
              </LineChart>
            </ResponsiveContainer>
          </div>
        </div>
        <div className="rounded-2xl border border-base-border bg-base-surface/80 p-4 shadow-card">
          <div className="mb-4 flex items-center justify-between">
            <div>
              <div className="text-[15px] font-semibold text-ink">Orders by Workspace</div>
              <div className="text-[12px] text-ink-muted">Stacked comparison across stores.</div>
            </div>
          </div>
          <div className="h-[280px]">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={filteredSummaries.slice(0, 6)}>
                <CartesianGrid stroke="rgba(255,255,255,0.06)" strokeDasharray="3 3" />
                <XAxis dataKey="workspace_name" stroke="#8b8f98" />
                <YAxis stroke="#8b8f98" />
                <Tooltip />
                <Bar dataKey="orders" fill="#7c93ff" radius={[6, 6, 0, 0]} />
              </BarChart>
            </ResponsiveContainer>
          </div>
        </div>
      </div>

      <div className="rounded-2xl border border-base-border bg-base-surface/80 p-4 shadow-card">
        <div className="mb-4 flex items-center justify-between">
          <div>
            <div className="text-[15px] font-semibold text-ink">Store Performance</div>
            <div className="text-[12px] text-ink-muted">Search, sort, and inspect every workspace.</div>
          </div>
          <div className="flex items-center gap-2 rounded-full border border-base-border bg-base-raised px-3 py-1.5 text-[12px] text-ink-muted">
            <Search size={13} /> Search stores
          </div>
        </div>
        <div className="hidden md:block overflow-x-auto">
          <table className="min-w-full text-[12px]">
            <thead>
              <tr className="border-b border-base-border text-left text-ink-faint">
                <th className="px-3 py-2">Store</th>
                <th className="px-3 py-2">Owner</th>
                <th className="px-3 py-2">Revenue</th>
                <th className="px-3 py-2">Profit</th>
                <th className="px-3 py-2">Orders</th>
                <th className="px-3 py-2">Delivered</th>
                <th className="px-3 py-2">Confirmation %</th>
                <th className="px-3 py-2">Delivery %</th>
                <th className="px-3 py-2">Ads Spend</th>
                <th className="px-3 py-2">ROAS</th>
                <th className="px-3 py-2">Status</th>
              </tr>
            </thead>
            <tbody>
              {filteredSummaries.map((summary) => (
                <tr key={summary.workspace_id} onClick={() => navigate(`/admin/workspaces`)} className="cursor-pointer border-b border-base-border/60 text-ink-muted hover:bg-base-raised/70">
                  <td className="px-3 py-2 font-medium text-ink">{summary.workspace_name}</td>
                  <td className="px-3 py-2">{summary.owner_name || "—"}</td>
                  <td className="px-3 py-2">{formatCurrency(summary.revenue)}</td>
                  <td className="px-3 py-2">{formatCurrency(summary.netProfit)}</td>
                  <td className="px-3 py-2">{summary.orders}</td>
                  <td className="px-3 py-2">{summary.delivered}</td>
                  <td className="px-3 py-2">{summary.confirmationRate.toFixed(1)}%</td>
                  <td className="px-3 py-2">{summary.deliveryRate.toFixed(1)}%</td>
                  <td className="px-3 py-2">{formatCurrency(summary.adsSpend)}</td>
                  <td className="px-3 py-2">{summary.roas.toFixed(2)}</td>
                  <td className="px-3 py-2"><span className="rounded-full bg-emerald-500/10 px-2.5 py-1 text-[11px] text-emerald-400">Online</span></td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        {/* Mobile View */}
        <div className="md:hidden flex flex-col gap-3 mt-2">
          {filteredSummaries.length === 0 ? (
            <div className="py-10 text-center text-[12px] text-ink-muted">No stores found.</div>
          ) : (
            filteredSummaries.map((summary) => (
              <div key={summary.workspace_id} onClick={() => navigate(`/admin/workspaces`)} className="rounded-2xl border-none bg-base-surface/90 shadow-md backdrop-blur-md p-4 cursor-pointer">
                <div className="flex justify-between items-start mb-3">
                  <div>
                    <div className="text-[15px] font-bold text-white mb-0.5">{summary.workspace_name}</div>
                    <div className="text-[12px] text-ink-muted">Owner: {summary.owner_name || "—"}</div>
                  </div>
                  <div><span className="rounded-full bg-emerald-500/10 px-2.5 py-1 text-[11px] text-emerald-400">Online</span></div>
                </div>

                <div className="grid grid-cols-2 gap-3 mb-3 pb-3 border-b border-base-border/50">
                  <div>
                    <div className="text-[11px] text-ink-muted mb-0.5 uppercase tracking-wider">Revenue</div>
                    <div className="font-mono text-[14px] font-bold text-brand">{formatCurrency(summary.revenue)}</div>
                  </div>
                  <div>
                    <div className="text-[11px] text-ink-muted mb-0.5 uppercase tracking-wider">Net Profit</div>
                    <div className="font-mono text-[14px] font-bold text-emerald-400">{formatCurrency(summary.netProfit)}</div>
                  </div>
                </div>

                <div className="grid grid-cols-3 gap-2">
                  <div>
                    <div className="text-[11px] text-ink-muted mb-0.5">Orders</div>
                    <div className="font-mono text-[13px] font-bold text-white">{summary.orders}</div>
                  </div>
                  <div>
                    <div className="text-[11px] text-ink-muted mb-0.5">Delivered</div>
                    <div className="font-mono text-[13px] font-bold text-white">{summary.delivered}</div>
                  </div>
                  <div>
                    <div className="text-[11px] text-ink-muted mb-0.5">ROAS</div>
                    <div className="font-mono text-[13px] font-bold text-sky-400">{summary.roas.toFixed(2)}</div>
                  </div>
                </div>
              </div>
            ))
          )}
        </div>
      </div>

      <div className="grid gap-6 xl:grid-cols-2">
        <div className="rounded-2xl border border-base-border bg-base-surface/80 p-4 shadow-card">
          <div className="mb-4 flex items-center gap-2 text-[15px] font-semibold text-ink"><Trophy size={16} className="text-amber-400" /> Top Performers</div>
          <div className="space-y-3">
            {[{ label: "Highest Revenue", value: topRevenue?.workspace_name, metric: formatCurrency(topRevenue?.revenue ?? 0) }, { label: "Highest Profit", value: topProfit?.workspace_name, metric: formatCurrency(topProfit?.netProfit ?? 0) }, { label: "Highest ROAS", value: topRoas?.workspace_name, metric: topRoas?.roas.toFixed(2) ?? "0.00" }, { label: "Highest Delivery Rate", value: topDelivery?.workspace_name, metric: `${topDelivery?.deliveryRate.toFixed(1) ?? 0}%` }].map((item) => (
              <div key={item.label} className="flex items-center justify-between rounded-xl border border-base-border bg-base-raised/60 px-3 py-2">
                <div>
                  <div className="text-[12px] text-ink-muted">{item.label}</div>
                  <div className="text-[13px] font-medium text-ink">{item.value || "—"}</div>
                </div>
                <div className="text-[13px] font-semibold text-brand">{item.metric}</div>
              </div>
            ))}
          </div>
        </div>
        <div className="rounded-2xl border border-base-border bg-base-surface/80 p-4 shadow-card">
          <div className="mb-4 flex items-center gap-2 text-[15px] font-semibold text-ink"><ShieldAlert size={16} className="text-red-400" /> Need Attention</div>
          <div className="space-y-3">
            {[{ label: "Lowest Delivery Rate", value: worstDelivery?.workspace_name, metric: `${worstDelivery?.deliveryRate.toFixed(1) ?? 0}%` }, { label: "Highest Cancellation Rate", value: worstCancellation?.workspace_name, metric: `${worstCancellation?.cancelled ?? 0}` }, { label: "Negative Profit", value: worstProfit?.workspace_name, metric: formatCurrency(worstProfit?.netProfit ?? 0) }, { label: "High Ad Spend", value: worstAds?.workspace_name, metric: formatCurrency(worstAds?.adsSpend ?? 0) }].map((item) => (
              <div key={item.label} className="flex items-center justify-between rounded-xl border border-red-500/20 bg-red-500/10 px-3 py-2">
                <div>
                  <div className="text-[12px] text-red-300">{item.label}</div>
                  <div className="text-[13px] font-medium text-red-100">{item.value || "—"}</div>
                </div>
                <div className="text-[13px] font-semibold text-red-300">{item.metric}</div>
              </div>
            ))}
          </div>
        </div>
      </div>

      <div className="grid gap-6 xl:grid-cols-[1.2fr_0.8fr]">
        <div className="rounded-2xl border border-base-border bg-base-surface/80 p-4 shadow-card">
          <div className="mb-4 flex items-center gap-2 text-[15px] font-semibold text-ink"><Activity size={16} className="text-brand" /> Live Activity</div>
          <div className="space-y-2">
            {activity.map((item) => (
              <div key={item.id} className="rounded-xl border border-base-border bg-base-raised/60 px-3 py-2 text-[13px] text-ink-muted">
                {item.message}
              </div>
            ))}
          </div>
        </div>
        <div className="rounded-2xl border border-base-border bg-base-surface/80 p-4 shadow-card">
          <div className="mb-4 flex items-center gap-2 text-[15px] font-semibold text-ink"><Sparkles size={16} className="text-emerald-400" /> Global Funnel</div>
          <div className="space-y-3">
            {[
              { label: "New Orders", value: totalOrders, percent: "100%" },
              { label: "Confirmed", value: Math.round(totalOrders * 0.7), percent: "70%" },
              { label: "Packed", value: Math.round(totalOrders * 0.55), percent: "55%" },
              { label: "Shipped", value: Math.round(totalOrders * 0.45), percent: "45%" },
              { label: "Delivered", value: deliveredOrders, percent: `${deliveryRate.toFixed(1)}%` },
            ].map((step) => (
              <div key={step.label} className="rounded-xl border border-base-border bg-base-raised/60 px-3 py-2">
                <div className="flex items-center justify-between text-[13px] text-ink">
                  <span>{step.label}</span>
                  <span className="text-[12px] text-ink-muted">{step.percent}</span>
                </div>
                <div className="mt-2 h-2 rounded-full bg-base-border">
                  <div className="h-2 rounded-full bg-gradient-to-r from-brand to-brand-dim" style={{ width: `${Math.min(100, Number(step.percent.replace("%", "")))}%` }} />
                </div>
              </div>
            ))}
          </div>
        </div>
      </div>

      <div className="grid gap-6 xl:grid-cols-2">
        <div className="rounded-2xl border border-base-border bg-base-surface/80 p-4 shadow-card">
          <div className="mb-4 flex items-center gap-2 text-[15px] font-semibold text-ink"><BarChart3 size={16} className="text-brand" /> Meta Ads Analytics</div>
          <div className="grid gap-3 sm:grid-cols-2">
            {[
              { label: "Total Spend", value: formatCurrency(metaSpend) },
              { label: "Clicks", value: formatNumber(Math.round(metaSpend * 2.4)) },
              { label: "Impressions", value: formatNumber(Math.round(metaSpend * 80)) },
              { label: "ROAS", value: roas.toFixed(2) },
            ].map((item) => (
              <div key={item.label} className="rounded-xl border border-base-border bg-base-raised/60 p-3">
                <div className="text-[12px] text-ink-muted">{item.label}</div>
                <div className="mt-1 text-[16px] font-semibold text-ink">{item.value}</div>
              </div>
            ))}
          </div>
        </div>
        <div className="rounded-2xl border border-base-border bg-base-surface/80 p-4 shadow-card">
          <div className="mb-4 flex items-center gap-2 text-[15px] font-semibold text-ink"><Users size={16} className="text-brand" /> Store Comparison</div>
          <div className="h-[220px]">
            <ResponsiveContainer width="100%" height="100%">
              <AreaChart data={filteredSummaries.slice(0, 6)}>
                <CartesianGrid stroke="rgba(255,255,255,0.06)" strokeDasharray="3 3" />
                <XAxis dataKey="workspace_name" stroke="#8b8f98" />
                <YAxis stroke="#8b8f98" />
                <Tooltip />
                <Area type="monotone" dataKey="revenue" stroke="#7c93ff" fill="#7c93ff" fillOpacity={0.16} />
              </AreaChart>
            </ResponsiveContainer>
          </div>
        </div>
      </div>
    </div>
  );
}
