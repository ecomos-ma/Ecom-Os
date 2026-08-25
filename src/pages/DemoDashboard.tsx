import { useState, useMemo } from "react";
import { useNavigate } from "react-router-dom";
import {
  ShoppingCart,
  CheckCircle2,
  Clock,
  XCircle,
  PackageCheck,
  RotateCcw,
  DollarSign,
  TrendingUp,
  Target,
  Percent,
  Layers,
  ArrowLeft,
  BarChart3,
  Users,
  AlertCircle
} from "lucide-react";
import fakeData from "../../fake_dashboard_data.json";

function mad(n: number) {
  const value = Number(n || 0);
  return `MAD ${isFinite(value) ? value.toLocaleString("en-US", { maximumFractionDigits: 0 }) : "0"}`;
}

function fmtCur(n: number, dec = 2) {
  const value = Number(n || 0);
  if (!isFinite(value)) return "$0.00";
  return `MAD ${value.toLocaleString("en-US", { maximumFractionDigits: dec })}`;
}

export default function DemoDashboard() {
  const navigate = useNavigate();
  const [selectedStatus, setSelectedStatus] = useState<string>("all");
  const [searchTerm, setSearchTerm] = useState("");

  const orders = fakeData.orders || [];

  const filteredOrders = useMemo(() => {
    return orders.filter((order: any) => {
      const matchesStatus = selectedStatus === "all" || order.status === selectedStatus;
      const matchesSearch = searchTerm === "" || 
        order.customer_name?.toLowerCase().includes(searchTerm.toLowerCase()) ||
        order.phone?.includes(searchTerm) ||
        order.city?.toLowerCase().includes(searchTerm.toLowerCase()) ||
        order.id?.toLowerCase().includes(searchTerm.toLowerCase());
      return matchesStatus && matchesSearch;
    });
  }, [orders, selectedStatus, searchTerm]);

  const stats = useMemo(() => {
    const totalOrders = orders.length;
    const totalRevenue = orders.reduce((sum: number, order: any) => sum + (order.total || 0), 0);
    const delivered = orders.filter((o: any) => o.status === "delivered" || o.delivery_status?.includes("livré")).length;
    const pending = orders.filter((o: any) => o.status === "pending" || o.status === "confirme" || o.status === "confirmé").length;
    const cancelled = orders.filter((o: any) => o.status === "cancelled" || o.status === "returned").length;
    const shipped = orders.filter((o: any) => o.status === "shipped").length;

    return {
      totalOrders,
      totalRevenue,
      delivered,
      pending,
      cancelled,
      shipped,
      deliveryRate: totalOrders > 0 ? ((delivered / totalOrders) * 100).toFixed(1) : "0"
    };
  }, [orders]);

  const statusCounts = useMemo(() => {
    const counts: Record<string, number> = {};
    orders.forEach((order: any) => {
      const status = order.status || "unknown";
      counts[status] = (counts[status] || 0) + 1;
    });
    return counts;
  }, [orders]);

  const StatCard = ({ title, value, icon: Icon, color }: { title: string; value: string | number; icon: any; color: string }) => (
    <div className="rounded-xl border border-slate-200 bg-white p-6 shadow-sm dark:border-slate-700 dark:bg-slate-900">
      <div className="flex items-center justify-between">
        <div>
          <p className="text-sm font-medium text-slate-600 dark:text-slate-400">{title}</p>
          <p className="mt-2 text-2xl font-bold text-slate-900 dark:text-white">{value}</p>
        </div>
        <div className={`rounded-lg p-3 ${color}`}>
          <Icon className="h-6 w-6 text-white" />
        </div>
      </div>
    </div>
  );

  return (
    <div className="min-h-screen bg-slate-50 dark:bg-slate-950">
      {/* Header */}
      <div className="border-b border-slate-200 bg-white px-6 py-4 dark:border-slate-700 dark:bg-slate-900">
        <div className="mx-auto max-w-7xl">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-4">
              <button
                onClick={() => navigate("/login")}
                className="rounded-lg p-2 hover:bg-slate-100 dark:hover:bg-slate-800"
              >
                <ArrowLeft className="h-5 w-5 text-slate-600 dark:text-slate-400" />
              </button>
              <div>
                <h1 className="text-2xl font-bold text-slate-900 dark:text-white">Demo Dashboard</h1>
                <p className="text-sm text-slate-600 dark:text-slate-400">
                  Preview with {orders.length} fake orders
                </p>
              </div>
            </div>
            <div className="flex items-center gap-2">
              <span className="inline-flex items-center rounded-full bg-green-100 px-3 py-1 text-sm font-medium text-green-800 dark:bg-green-900/30 dark:text-green-400">
                <Layers className="mr-1 h-4 w-4" />
                Demo Mode
              </span>
            </div>
          </div>
        </div>
      </div>

      <div className="mx-auto max-w-7xl px-6 py-8">
        {/* Stats Grid */}
        <div className="grid gap-6 sm:grid-cols-2 lg:grid-cols-4">
          <StatCard
            title="Total Orders"
            value={stats.totalOrders.toLocaleString()}
            icon={ShoppingCart}
            color="bg-blue-500"
          />
          <StatCard
            title="Total Revenue"
            value={mad(stats.totalRevenue)}
            icon={DollarSign}
            color="bg-green-500"
          />
          <StatCard
            title="Delivered"
            value={`${stats.delivered} (${stats.deliveryRate}%)`}
            icon={CheckCircle2}
            color="bg-emerald-500"
          />
          <StatCard
            title="Pending"
            value={stats.pending}
            icon={Clock}
            color="bg-amber-500"
          />
        </div>

        {/* Additional Stats */}
        <div className="mt-6 grid gap-6 sm:grid-cols-2 lg:grid-cols-4">
          <StatCard
            title="Shipped"
            value={stats.shipped}
            icon={PackageCheck}
            color="bg-purple-500"
          />
          <StatCard
            title="Cancelled/Returned"
            value={stats.cancelled}
            icon={XCircle}
            color="bg-red-500"
          />
          <StatCard
            title="Average Order Value"
            value={mad(stats.totalOrders > 0 ? stats.totalRevenue / stats.totalOrders : 0)}
            icon={TrendingUp}
            color="bg-cyan-500"
          />
          <StatCard
            title="Success Rate"
            value={`${stats.deliveryRate}%`}
            icon={Target}
            color="bg-pink-500"
          />
        </div>

        {/* Status Breakdown */}
        <div className="mt-8 rounded-xl border border-slate-200 bg-white p-6 shadow-sm dark:border-slate-700 dark:bg-slate-900">
          <h2 className="mb-4 text-lg font-semibold text-slate-900 dark:text-white">Order Status Breakdown</h2>
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
            {Object.entries(statusCounts).map(([status, count]) => (
              <div key={status} className="flex items-center justify-between rounded-lg border border-slate-200 p-4 dark:border-slate-700">
                <div className="flex items-center gap-3">
                  <div className={`rounded-full p-2 ${
                    status === "delivered" ? "bg-green-100 text-green-600 dark:bg-green-900/30 dark:text-green-400" :
                    status === "pending" ? "bg-amber-100 text-amber-600 dark:bg-amber-900/30 dark:text-amber-400" :
                    status === "cancelled" ? "bg-red-100 text-red-600 dark:bg-red-900/30 dark:text-red-400" :
                    status === "shipped" ? "bg-blue-100 text-blue-600 dark:bg-blue-900/30 dark:text-blue-400" :
                    "bg-slate-100 text-slate-600 dark:bg-slate-800 dark:text-slate-400"
                  }`}>
                    {status === "delivered" ? <CheckCircle2 className="h-4 w-4" /> :
                     status === "pending" ? <Clock className="h-4 w-4" /> :
                     status === "cancelled" ? <XCircle className="h-4 w-4" /> :
                     status === "shipped" ? <PackageCheck className="h-4 w-4" /> :
                     <AlertCircle className="h-4 w-4" />}
                  </div>
                  <span className="capitalize text-sm font-medium text-slate-700 dark:text-slate-300">{status}</span>
                </div>
                <span className="text-lg font-bold text-slate-900 dark:text-white">{count}</span>
              </div>
            ))}
          </div>
        </div>

        {/* Orders Table */}
        <div className="mt-8 rounded-xl border border-slate-200 bg-white shadow-sm dark:border-slate-700 dark:bg-slate-900">
          <div className="flex items-center justify-between border-b border-slate-200 p-6 dark:border-slate-700">
            <h2 className="text-lg font-semibold text-slate-900 dark:text-white">Recent Orders</h2>
            <div className="flex items-center gap-4">
              <input
                type="text"
                placeholder="Search orders..."
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
                className="rounded-lg border border-slate-300 px-4 py-2 text-sm focus:border-pink-500 focus:outline-none focus:ring-2 focus:ring-pink-500/20 dark:border-slate-600 dark:bg-slate-800 dark:text-white"
              />
              <select
                value={selectedStatus}
                onChange={(e) => setSelectedStatus(e.target.value)}
                className="rounded-lg border border-slate-300 px-4 py-2 text-sm focus:border-pink-500 focus:outline-none focus:ring-2 focus:ring-pink-500/20 dark:border-slate-600 dark:bg-slate-800 dark:text-white"
              >
                <option value="all">All Status</option>
                <option value="delivered">Delivered</option>
                <option value="pending">Pending</option>
                <option value="shipped">Shipped</option>
                <option value="cancelled">Cancelled</option>
                <option value="returned">Returned</option>
              </select>
            </div>
          </div>

          <div className="overflow-x-auto">
            <table className="w-full">
              <thead className="bg-slate-50 dark:bg-slate-800">
                <tr>
                  <th className="px-6 py-3 text-left text-xs font-medium uppercase tracking-wider text-slate-500 dark:text-slate-400">Order ID</th>
                  <th className="px-6 py-3 text-left text-xs font-medium uppercase tracking-wider text-slate-500 dark:text-slate-400">Customer</th>
                  <th className="px-6 py-3 text-left text-xs font-medium uppercase tracking-wider text-slate-500 dark:text-slate-400">City</th>
                  <th className="px-6 py-3 text-left text-xs font-medium uppercase tracking-wider text-slate-500 dark:text-slate-400">Product</th>
                  <th className="px-6 py-3 text-left text-xs font-medium uppercase tracking-wider text-slate-500 dark:text-slate-400">Total</th>
                  <th className="px-6 py-3 text-left text-xs font-medium uppercase tracking-wider text-slate-500 dark:text-slate-400">Status</th>
                  <th className="px-6 py-3 text-left text-xs font-medium uppercase tracking-wider text-slate-500 dark:text-slate-400">Delivery</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-200 dark:divide-slate-700">
                {filteredOrders.slice(0, 50).map((order: any) => (
                  <tr key={order.id} className="hover:bg-slate-50 dark:hover:bg-slate-800">
                    <td className="px-6 py-4 whitespace-nowrap text-sm font-medium text-slate-900 dark:text-white">
                      {order.id}
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap">
                      <div className="text-sm text-slate-900 dark:text-white">{order.customer_name}</div>
                      <div className="text-xs text-slate-500 dark:text-slate-400">{order.phone}</div>
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap text-sm text-slate-600 dark:text-slate-400">
                      {order.city}
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap text-sm text-slate-600 dark:text-slate-400">
                      {order.product_variant}
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap text-sm font-medium text-slate-900 dark:text-white">
                      {mad(order.total)}
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap">
                      <span className={`inline-flex rounded-full px-2 py-1 text-xs font-medium ${
                        order.status === "delivered" ? "bg-green-100 text-green-800 dark:bg-green-900/30 dark:text-green-400" :
                        order.status === "pending" || order.status === "confirme" || order.status === "confirmé" ? "bg-amber-100 text-amber-800 dark:bg-amber-900/30 dark:text-amber-400" :
                        order.status === "shipped" ? "bg-blue-100 text-blue-800 dark:bg-blue-900/30 dark:text-blue-400" :
                        order.status === "cancelled" || order.status === "returned" ? "bg-red-100 text-red-800 dark:bg-red-900/30 dark:text-red-400" :
                        "bg-slate-100 text-slate-800 dark:bg-slate-800 dark:text-slate-400"
                      }`}>
                        {order.status}
                      </span>
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap text-sm text-slate-600 dark:text-slate-400">
                      {order.delivery_status}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          {filteredOrders.length === 0 && (
            <div className="p-12 text-center">
              <AlertCircle className="mx-auto h-12 w-12 text-slate-400" />
              <p className="mt-2 text-sm text-slate-600 dark:text-slate-400">No orders found matching your criteria</p>
            </div>
          )}

          <div className="border-t border-slate-200 bg-slate-50 px-6 py-4 dark:border-slate-700 dark:bg-slate-800">
            <p className="text-sm text-slate-600 dark:text-slate-400">
              Showing {Math.min(filteredOrders.length, 50)} of {filteredOrders.length} orders
            </p>
          </div>
        </div>

        {/* Back to Login Button */}
        <div className="mt-8 flex justify-center">
          <button
            onClick={() => navigate("/login")}
            className="flex items-center gap-2 rounded-lg border border-slate-300 bg-white px-6 py-3 text-sm font-medium text-slate-700 shadow-sm transition hover:bg-slate-50 dark:border-slate-600 dark:bg-slate-900 dark:text-slate-200 dark:hover:bg-slate-800"
          >
            <ArrowLeft className="h-4 w-4" />
            Back to Login
          </button>
        </div>
      </div>
    </div>
  );
}