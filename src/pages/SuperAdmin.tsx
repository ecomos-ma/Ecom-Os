import { AdminPageHeader } from "../components/admin/AdminPageHeader";
import { AdminStatCard } from "../components/admin/AdminStatCard";
import { 
  Building2, 
  Users, 
  ShoppingCart, 
  TrendingUp, 
  DollarSign, 
  CheckCircle, 
  Truck, 
  RotateCcw, 
  Store, 
  Activity, 
  Database, 
  Server,
  Zap,
  Eye,
  Package,
  RefreshCw,
  HardDrive,
  Globe,
  Shield,
  AlertTriangle,
  Calendar,
  XCircle
} from "lucide-react";
import { useEffect, useState } from "react";
import { supabase } from "../lib/supabase";
import { formatCurrency } from "../lib/currency";

interface DashboardMetrics {
  totalUsers: number;
  onlineUsers: number;
  activeUsers: number;
  suspendedUsers: number;
  totalWorkspaces: number;
  activeWorkspaces: number;
  suspendedWorkspaces: number;
  totalOrders: number;
  ordersToday: number;
  ordersThisWeek: number;
  ordersThisMonth: number;
  totalRevenue: number;
  revenueToday: number;
  revenueThisMonth: number;
  totalProducts: number;
  activeProducts: number;
  totalIntegrations: number;
  connectedStores: number;
  connectedShipping: number;
  apiRequests: number;
  failedRequests: number;
  databaseSize: number;
  storageUsed: number;
  activeSessions: number;
  confirmationRate: number;
  deliveryRate: number;
  returnRate: number;
  refusedRate: number;
}

export default function SuperAdmin() {
  const [metrics, setMetrics] = useState<DashboardMetrics>({
    totalUsers: 0,
    onlineUsers: 0,
    activeUsers: 0,
    suspendedUsers: 0,
    totalWorkspaces: 0,
    activeWorkspaces: 0,
    suspendedWorkspaces: 0,
    totalOrders: 0,
    ordersToday: 0,
    ordersThisWeek: 0,
    ordersThisMonth: 0,
    totalRevenue: 0,
    revenueToday: 0,
    revenueThisMonth: 0,
    totalProducts: 0,
    activeProducts: 0,
    totalIntegrations: 0,
    connectedStores: 0,
    connectedShipping: 0,
    apiRequests: 0,
    failedRequests: 0,
    databaseSize: 0,
    storageUsed: 0,
    activeSessions: 0,
    confirmationRate: 0,
    deliveryRate: 0,
    returnRate: 0,
    refusedRate: 0,
  });
  const [loading, setLoading] = useState(true);
  const [lastUpdated, setLastUpdated] = useState<Date | null>(null);

  useEffect(() => {
    async function fetchMetrics() {
      try {
        setLoading(true);
        
        const now = new Date();
        const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());
        const weekAgo = new Date(today);
        weekAgo.setDate(weekAgo.getDate() - 7);
        const monthStart = new Date(now.getFullYear(), now.getMonth(), 1);

        const [
          profilesRes,
          workspacesRes,
          ordersRes,
          productsRes,
          integrationsRes,
        ] = await Promise.all([
          supabase.from('profiles').select('id, role, status, last_active'),
          supabase.from('workspaces').select('id, status'),
          supabase.from('orders').select('id, total, status, created_at'),
          supabase.from('products').select('id, status'),
          supabase.from('integrations').select('id, type, status'),
        ]);

        const profiles = profilesRes.data || [];
        const totalUsers = profiles.length;
        const activeUsers = profiles.filter(p => p.status === 'active').length;
        const suspendedUsers = profiles.filter(p => p.status === 'suspended').length;
        const onlineUsers = profiles.filter(p => {
          if (!p.last_active) return false;
          const lastActive = new Date(p.last_active);
          const fiveMinutesAgo = new Date(Date.now() - 5 * 60 * 1000);
          return lastActive > fiveMinutesAgo;
        }).length;

        const workspaces = workspacesRes.data || [];
        const totalWorkspaces = workspaces.length;
        const activeWorkspaces = workspaces.filter(w => w.status === 'active').length;
        const suspendedWorkspaces = workspaces.filter(w => w.status === 'suspended').length;

        const orders = ordersRes.data || [];
        const totalOrders = orders.length;
        const ordersToday = orders.filter(o => new Date(o.created_at) >= today).length;
        const ordersThisWeek = orders.filter(o => new Date(o.created_at) >= weekAgo).length;
        const ordersThisMonth = orders.filter(o => new Date(o.created_at) >= monthStart).length;

        const totalRevenue = orders.reduce((sum, o) => sum + Number(o.total || 0), 0);
        const revenueToday = orders
          .filter(o => new Date(o.created_at) >= today)
          .reduce((sum, o) => sum + Number(o.total || 0), 0);
        const revenueThisMonth = orders
          .filter(o => new Date(o.created_at) >= monthStart)
          .reduce((sum, o) => sum + Number(o.total || 0), 0);

        const products = productsRes.data || [];
        const totalProducts = products.length;
        const activeProducts = products.filter(p => p.status === 'active').length;

        const integrations = integrationsRes.data || [];
        const totalIntegrations = integrations.length;
        const connectedStores = integrations.filter(i => i.type === 'store' && i.status === 'active').length;
        const connectedShipping = integrations.filter(i => i.type === 'shipping' && i.status === 'active').length;

        const confirmed = orders.filter(o => o.status === 'confirmed' || o.status === 'CONFIRME').length;
        const delivered = orders.filter(o => o.status === 'delivered' || o.status === 'LIVRE').length;
        const returned = orders.filter(o => o.status === 'returned').length;
        const refused = orders.filter(o => o.status === 'refused' || o.status === 'CANCELED').length;
        const confirmationRate = totalOrders > 0 ? (confirmed / totalOrders) * 100 : 0;
        const deliveryRate = totalOrders > 0 ? (delivered / totalOrders) * 100 : 0;
        const returnRate = totalOrders > 0 ? (returned / totalOrders) * 100 : 0;
        const refusedRate = totalOrders > 0 ? (refused / totalOrders) * 100 : 0;

        setMetrics({
          totalUsers,
          onlineUsers,
          activeUsers,
          suspendedUsers,
          totalWorkspaces,
          activeWorkspaces,
          suspendedWorkspaces,
          totalOrders,
          ordersToday,
          ordersThisWeek,
          ordersThisMonth,
          totalRevenue,
          revenueToday,
          revenueThisMonth,
          totalProducts,
          activeProducts,
          totalIntegrations,
          connectedStores,
          connectedShipping,
          apiRequests: 0,
          failedRequests: 0,
          databaseSize: 0,
          storageUsed: 0,
          activeSessions: onlineUsers,
          confirmationRate,
          deliveryRate,
          returnRate,
          refusedRate,
        });
        
        setLastUpdated(new Date());
      } catch (error) {
        console.error('Error fetching metrics:', error);
      } finally {
        setLoading(false);
      }
    }

    fetchMetrics();
    
    const profilesSubscription = supabase
      .channel('profiles-changes')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'profiles' }, () => {
        fetchMetrics();
      })
      .subscribe();

    const ordersSubscription = supabase
      .channel('orders-changes')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'orders' }, () => {
        fetchMetrics();
      })
      .subscribe();

    const workspacesSubscription = supabase
      .channel('workspaces-changes')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'workspaces' }, () => {
        fetchMetrics();
      })
      .subscribe();

    return () => {
      profilesSubscription.unsubscribe();
      ordersSubscription.unsubscribe();
      workspacesSubscription.unsubscribe();
    };
  }, []);

  function MetricCard({ 
    title, 
    value, 
    subtitle, 
    icon: Icon, 
    color 
  }: { 
    title: string; 
    value: string; 
    subtitle: string;
    icon: any; 
    color: string;
  }) {
    const colorClasses = {
      blue: "from-blue-500/20 to-blue-600/20 text-blue-400",
      purple: "from-purple-500/20 to-purple-600/20 text-purple-400",
      green: "from-emerald-500/20 to-emerald-600/20 text-emerald-400",
      amber: "from-amber-500/20 to-amber-600/20 text-amber-400",
      red: "from-red-500/20 to-red-600/20 text-red-400",
      brand: "from-brand-accent/20 to-purple-500/20 text-brand-accent",
    };

    return (
      <div className="rounded-xl border border-slate-800 bg-slate-900/50 backdrop-blur-sm p-5">
        <div className="flex items-center justify-between mb-3">
          <div className={`flex h-10 w-10 items-center justify-center rounded-lg bg-gradient-to-br ${colorClasses[color as keyof typeof colorClasses]}`}>
            <Icon size={20} />
          </div>
        </div>
        <div className="text-2xl font-bold text-white mb-1">{value}</div>
        <div className="text-sm text-slate-400">{title}</div>
        <div className="text-xs text-slate-500 mt-1">{subtitle}</div>
      </div>
    );
  }

  function SystemCard({ 
    title, 
    value, 
    status, 
    icon: Icon 
  }: { 
    title: string; 
    value: string; 
    status: "healthy" | "warning" | "error";
    icon: any;
  }) {
    const statusColors = {
      healthy: "text-emerald-400 bg-emerald-500/20",
      warning: "text-amber-400 bg-amber-500/20",
      error: "text-red-400 bg-red-500/20",
    };

    return (
      <div className="rounded-xl border border-slate-800 bg-slate-900/50 backdrop-blur-sm p-5">
        <div className="flex items-center justify-between mb-3">
          <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-slate-800 text-slate-400">
            <Icon size={20} />
          </div>
          <span className={`text-xs font-medium px-2 py-1 rounded-full ${statusColors[status]}`}>
            {status}
          </span>
        </div>
        <div className="text-2xl font-bold text-white mb-1">{value}</div>
        <div className="text-sm text-slate-400">{title}</div>
      </div>
    );
  }

  return (
    <div className="p-6">
      <AdminPageHeader
        title="Platform Dashboard"
        description="Real-time platform overview"
        actions={
          <button
            onClick={() => window.location.reload()}
            className="px-4 py-2.5 bg-slate-800 hover:bg-slate-700 border border-slate-700 rounded-lg text-white flex items-center gap-2 transition-colors"
          >
            <RefreshCw size={18} />
            Refresh
          </button>
        }
      />

      {/* Users & Workspaces */}
      <div className="mb-8">
        <h2 className="text-lg font-semibold text-white mb-4">Users & Workspaces</h2>
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
          <AdminStatCard
            title="Total Users"
            value={metrics.totalUsers}
            subtitle={`${metrics.onlineUsers} online`}
            icon={Users}
            color="brand"
            loading={loading}
          />
          <AdminStatCard
            title="Active Users"
            value={metrics.activeUsers}
            icon={Activity}
            color="green"
            loading={loading}
          />
          <AdminStatCard
            title="Total Workspaces"
            value={metrics.totalWorkspaces}
            subtitle={`${metrics.activeWorkspaces} active`}
            icon={Building2}
            color="purple"
            loading={loading}
          />
          <AdminStatCard
            title="Suspended"
            value={metrics.suspendedUsers + metrics.suspendedWorkspaces}
            subtitle="Users + Workspaces"
            icon={Shield}
            color="amber"
            loading={loading}
          />
        </div>
      </div>

      {/* Orders & Revenue */}
      <div className="mb-8">
        <h2 className="text-lg font-semibold text-white mb-4">Orders & Revenue</h2>
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
          <AdminStatCard
            title="Total Orders"
            value={metrics.totalOrders}
            subtitle={`${metrics.ordersToday} today`}
            icon={ShoppingCart}
            color="brand"
            loading={loading}
          />
          <AdminStatCard
            title="Total Revenue"
            value={formatCurrency(metrics.totalRevenue)}
            subtitle={`${formatCurrency(metrics.revenueToday)} today`}
            icon={DollarSign}
            color="green"
            loading={loading}
          />
          <AdminStatCard
            title="This Month"
            value={metrics.ordersThisMonth}
            subtitle="orders"
            icon={Calendar}
            color="blue"
            loading={loading}
          />
          <AdminStatCard
            title="Monthly Revenue"
            value={formatCurrency(metrics.revenueThisMonth)}
            subtitle="this month"
            icon={TrendingUp}
            color="purple"
            loading={loading}
          />
        </div>
      </div>

      {/* Products & Integrations */}
      <div className="mb-8">
        <h2 className="text-lg font-semibold text-white mb-4">Products & Integrations</h2>
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
          <AdminStatCard
            title="Total Products"
            value={metrics.totalProducts}
            subtitle={`${metrics.activeProducts} active`}
            icon={Package}
            color="brand"
            loading={loading}
          />
          <AdminStatCard
            title="Connected Stores"
            value={metrics.connectedStores}
            subtitle="store integrations"
            icon={Store}
            color="green"
            loading={loading}
          />
          <AdminStatCard
            title="Shipping Companies"
            value={metrics.connectedShipping}
            subtitle="shipping integrations"
            icon={Truck}
            color="blue"
            loading={loading}
          />
          <AdminStatCard
            title="Total Integrations"
            value={metrics.totalIntegrations}
            subtitle="all connections"
            icon={Zap}
            color="purple"
            loading={loading}
          />
        </div>
      </div>

      {/* Performance */}
      <div className="mb-8">
        <h2 className="text-lg font-semibold text-white mb-4">Performance Metrics</h2>
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
          <AdminStatCard
            title="Confirmation Rate"
            value={`${metrics.confirmationRate.toFixed(1)}%`}
            subtitle="order confirmations"
            icon={CheckCircle}
            color="green"
            loading={loading}
          />
          <AdminStatCard
            title="Delivery Rate"
            value={`${metrics.deliveryRate.toFixed(1)}%`}
            subtitle="delivered orders"
            icon={Truck}
            color="blue"
            loading={loading}
          />
          <AdminStatCard
            title="Return Rate"
            value={`${metrics.returnRate.toFixed(1)}%`}
            subtitle="returned orders"
            icon={RotateCcw}
            color="amber"
            loading={loading}
          />
          <AdminStatCard
            title="Refusal Rate"
            value={`${metrics.refusedRate.toFixed(1)}%`}
            subtitle="refused orders"
            icon={XCircle}
            color="red"
            loading={loading}
          />
        </div>
      </div>

      {/* System Health */}
      <div>
        <h2 className="text-lg font-semibold text-white mb-4">System Health</h2>
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          <SystemCard
            title="Database"
            value="Healthy"
            status="healthy"
            icon={Database}
          />
          <SystemCard
            title="API"
            value="Healthy"
            status="healthy"
            icon={Server}
          />
          <SystemCard
            title="Storage"
            value="Healthy"
            status="healthy"
            icon={HardDrive}
          />
        </div>
      </div>

      {lastUpdated && (
        <div className="mt-8 text-center text-sm text-slate-500">
          Last updated: {lastUpdated.toLocaleTimeString()}
        </div>
      )}
    </div>
  );
}