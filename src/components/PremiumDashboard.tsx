import React, { useState, useMemo } from "react";
import { useDashboardData } from "../hooks/useDashboardData";
import {
  TrendingUp, DollarSign, Users, ShoppingCart,
  Package, Truck, AlertCircle, CheckCircle,
  Clock, ArrowUpRight, ArrowDownRight, Calendar,
  Filter, Search, MoreVertical, Settings
} from "lucide-react";

// ─── PREMIUM COMPONENT DEFINITIONS ───

interface GlassCardProps {
  children: React.ReactNode;
  className?: string;
  gradient?: "brand" | "purple" | "emerald" | "amber" | "red";
  hover?: boolean;
}

function GlassCard({ children, className = "", gradient = "brand", hover = true }: GlassCardProps) {
  const gradientColors = {
    brand: "from-brand-accent/5 via-transparent to-purple-500/5",
    purple: "from-purple-500/5 via-transparent to-pink-500/5",
    emerald: "from-emerald-500/5 via-transparent to-teal-500/5",
    amber: "from-amber-500/5 via-transparent to-orange-500/5",
    red: "from-red-500/5 via-transparent to-rose-500/5",
  };

  return (
    <div
      className={`relative overflow-hidden rounded-3xl border border-white/10 bg-gradient-to-br from-white/5 to-white/[0.02] p-6 shadow-xl backdrop-blur-xl transition-all duration-500 ${hover ? "hover:border-white/20 hover:shadow-2xl hover:-translate-y-1" : ""
        } dark:from-white/5 dark:to-white/[0.02] dark:border-white/10 ${hover ? "dark:hover:border-white/20" : ""} ${className}`}
    >
      <div className={`absolute inset-0 bg-gradient-to-br ${gradientColors[gradient]} opacity-50`} />
      <div className="absolute inset-0 bg-[url('data:image/svg+xml;base64,PHN2ZyB3aWR0aD0iNDAiIGhlaWdodD0iNDAiIHhtbG5zPSJodHRwOi8vd3d3LnczLm9yZy8yMDAwL3N2ZyI+PGNpcmNsZSBjeD0iMiIgY3k9IjIiIHI9IjEiIGZpbGw9InJnYmEoMjU1LDI1NSwyNTUsMC4wMykiLz48L3N2Zz4=')] opacity-40" />
      <div className="relative z-10">{children}</div>
    </div>
  );
}

interface PremiumIconProps {
  icon: React.ElementType;
  size?: number;
  variant?: "default" | "brand" | "emerald" | "amber" | "red";
  background?: boolean;
  className?: string;
}

function PremiumIcon({ icon: Icon, size = 16, variant = "default", background = true, className = "" }: PremiumIconProps) {
  const variantClasses = {
    default: "bg-white/10 text-ink dark:text-white border border-white/20",
    brand: "bg-gradient-to-br from-brand-accent/20 to-purple-500/20 text-brand-accent border border-brand-accent/30 shadow-lg shadow-brand-accent/30",
    emerald: "bg-gradient-to-br from-emerald-500/20 to-teal-500/20 text-emerald-400 border border-emerald-500/30 shadow-lg shadow-emerald-400/30",
    amber: "bg-gradient-to-br from-amber-500/20 to-orange-500/20 text-amber-400 border border-amber-500/30 shadow-lg shadow-amber-400/30",
    red: "bg-gradient-to-br from-red-500/20 to-rose-500/20 text-red-400 border border-red-500/30 shadow-lg shadow-red-400/30",
  };

  if (background) {
    return (
      <div className={`p-3 rounded-2xl ${variantClasses[variant]} ${className}`}>
        <Icon size={size} />
      </div>
    );
  }

  return <Icon size={size} className={className} />;
}

interface PremiumBadgeProps {
  children: React.ReactNode;
  variant?: "success" | "warning" | "error" | "info" | "brand";
  size?: "sm" | "md";
  className?: string;
}

function PremiumBadge({ children, variant = "info", size = "md", className = "" }: PremiumBadgeProps) {
  const variantClasses = {
    success: "bg-emerald-500/20 text-emerald-400 border border-emerald-500/30",
    warning: "bg-amber-500/20 text-amber-400 border border-amber-500/30",
    error: "bg-red-500/20 text-red-400 border border-red-500/30",
    info: "bg-blue-500/20 text-blue-400 border border-blue-500/30",
    brand: "bg-brand-accent/20 text-brand-accent border border-brand-accent/30",
  };

  const sizeClasses = {
    sm: "text-xs px-2 py-0.5 rounded-lg",
    md: "text-xs px-3 py-1 rounded-xl",
  };

  return (
    <span className={`inline-flex items-center font-semibold ${variantClasses[variant]} ${sizeClasses[size]} ${className}`}>
      {children}
    </span>
  );
}

interface PremiumProgressProps {
  value: number;
  max?: number;
  color?: "brand" | "emerald" | "amber" | "red";
  size?: "sm" | "md" | "lg";
  showLabel?: boolean;
  className?: string;
}

function PremiumProgress({ value, max = 100, color = "brand", size = "md", showLabel = false, className = "" }: PremiumProgressProps) {
  const percentage = Math.min(Math.max((value / max) * 100, 0), 100);

  const colorClasses = {
    brand: "from-brand-accent to-brand-accent/80 shadow-brand-accent/30 group-hover:shadow-brand-accent/50",
    emerald: "from-emerald-400 to-emerald-500 shadow-emerald-400/30 group-hover:shadow-emerald-400/50",
    amber: "from-amber-400 to-orange-400 shadow-amber-400/30 group-hover:shadow-amber-400/50",
    red: "from-red-400 to-red-500 shadow-red-400/30 group-hover:shadow-red-400/50",
  };

  const sizeClasses = {
    sm: "h-1.5",
    md: "h-2",
    lg: "h-3",
  };

  return (
    <div className={`w-full ${className}`}>
      <div className={`w-full ${sizeClasses[size]} bg-white/10 rounded-full overflow-hidden`}>
        <div
          className={`h-full bg-gradient-to-r ${colorClasses[color]} rounded-full shadow-lg transition-all duration-500`}
          style={{ width: `${percentage}%` }}
        />
      </div>
      {showLabel && (
        <div className="text-xs text-ink-muted/70 dark:text-white/60 mt-1 font-mono">
          {percentage.toFixed(0)}%
        </div>
      )}
    </div>
  );
}

interface PremiumSectionHeaderProps {
  title: string;
  description?: string;
  icon?: React.ElementType;
  iconVariant?: "brand" | "emerald" | "amber" | "red";
  action?: React.ReactNode;
  className?: string;
}

function PremiumSectionHeader({ title, description, icon: Icon, iconVariant = "brand", action, className = "" }: PremiumSectionHeaderProps) {
  const iconVariantClasses = {
    brand: "bg-gradient-to-br from-brand-accent/20 to-purple-500/20 text-brand-accent border border-brand-accent/30 shadow-lg shadow-brand-accent/30",
    emerald: "bg-gradient-to-br from-emerald-500/20 to-teal-500/20 text-emerald-400 border border-emerald-500/30 shadow-lg shadow-emerald-400/30",
    amber: "bg-gradient-to-br from-amber-500/20 to-orange-500/20 text-amber-400 border border-amber-500/30 shadow-lg shadow-amber-400/30",
    red: "bg-gradient-to-br from-red-500/20 to-rose-500/20 text-red-400 border border-red-500/30 shadow-lg shadow-red-400/30",
  };

  return (
    <div className={`flex items-center justify-between mb-6 ${className}`}>
      <div className="flex items-center gap-4">
        {Icon && (
          <div className={`p-3 rounded-2xl ${iconVariantClasses[iconVariant]}`}>
            <Icon size={18} />
          </div>
        )}
        <div>
          <div className="text-lg font-bold bg-gradient-to-r from-ink to-ink/70 dark:from-white dark:to-white/70 bg-clip-text text-transparent">
            {title}
          </div>
          {description && (
            <div className="text-sm text-ink-muted/70 dark:text-white/60">{description}</div>
          )}
        </div>
      </div>
      {action && <div>{action}</div>}
    </div>
  );
}

// ─── DASHBOARD COMPONENT ───

export function PremiumDashboard() {
  const [selectedRange, setSelectedRange] = useState("30d");

  const { startDate, endDate } = useMemo(() => {
    const end = new Date();
    const start = new Date();
    start.setHours(0, 0, 0, 0);
    if (selectedRange === "7d") start.setDate(end.getDate() - 7);
    else if (selectedRange === "30d") start.setDate(end.getDate() - 30);
    else if (selectedRange === "90d") start.setDate(end.getDate() - 90);
    else if (selectedRange === "1y") start.setDate(end.getDate() - 365);
    return { startDate: start, endDate: end };
  }, [selectedRange]);

  const d = useDashboardData(startDate, endDate);

  const stats = [
    { icon: DollarSign, label: "Total Revenue", value: `$${d.revenue.toLocaleString()}`, trend: "", trendUp: true, color: "brand" },
    { icon: Users, label: "Total CPA", value: `$${d.cpa.toFixed(2)}`, trend: "", trendUp: true, color: "emerald" },
    { icon: ShoppingCart, label: "Total Orders", value: (d.confirmedCount + d.pending + d.delivered + d.returned + d.cancelled).toLocaleString(), trend: "", trendUp: true, color: "amber" },
    { icon: Package, label: "Net Profit", value: `$${d.netProfit.toLocaleString()}`, trend: "", trendUp: d.netProfit >= 0, color: "emerald" },
  ];

  const recentOrders = (d.orders || []).slice(0, 5).map((o: any) => ({
    id: o.id || o["Order ID"],
    customer: o.customer_id || "Customer",
    amount: `$${Number(o.total || 0).toLocaleString()}`,
    status: o.status,
    date: new Date(o.created_at || new Date()).toLocaleDateString(),
  }));

  const topProductsList = d.topProducts.map((p) => ({
    name: p.name,
    sales: p.count,
    revenue: `$${p.revenue.toLocaleString()}`,
    trend: "",
  }));

  const alerts = [
    d.pending > 0 ? { type: "warning", message: `${d.pending} Orders Pending Confirmation`, time: "Now" } : null,
    d.cancelled > 10 ? { type: "error", message: `High Cancel Rate (${d.cancelled} today)`, time: "Recent" } : null,
    d.deliveryRate > 70 ? { type: "success", message: `Excellent Delivery Rate (${(d.deliveryRate * 100).toFixed(1)}%)`, time: "Continuous" } : null,
  ].filter(Boolean) as { type: string; message: string; time: string; }[];

  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-50 to-slate-100 dark:from-slate-950 dark:to-slate-900 p-6">
      {/* Header */}
      <div className="mb-8">
        <div className="flex items-center justify-between mb-4">
          <div>
            <h1 className="text-3xl font-bold bg-gradient-to-r from-slate-900 to-slate-700 dark:from-white dark:to-white/70 bg-clip-text text-transparent mb-2">
              Dashboard
            </h1>
            <p className="text-slate-600 dark:text-slate-400">
              Welcome back! Here's what's happening with your business today.
            </p>
          </div>
          <div className="flex items-center gap-3">
            <button className="p-2 rounded-xl bg-white/10 border border-white/20 hover:bg-white/20 transition-all">
              <Search size={20} className="text-slate-600 dark:text-slate-300" />
            </button>
            <button className="p-2 rounded-xl bg-white/10 border border-white/20 hover:bg-white/20 transition-all">
              <Settings size={20} className="text-slate-600 dark:text-slate-300" />
            </button>
          </div>
        </div>

        {/* Date Range Selector */}
        <div className="flex items-center gap-2">
          {["7d", "30d", "90d", "1y"].map((range) => (
            <button
              key={range}
              onClick={() => setSelectedRange(range)}
              className={`px-4 py-2 rounded-xl text-sm font-semibold transition-all duration-300 ${selectedRange === range
                ? "bg-gradient-to-r from-brand-accent to-brand-accent/80 text-white shadow-lg shadow-brand-accent/30 border border-brand-accent/50"
                : "bg-white/5 text-slate-600 dark:text-slate-300 border border-white/10 hover:border-white/20 hover:bg-white/10"
                }`}
            >
              {range === "7d" ? "7 Days" : range === "30d" ? "30 Days" : range === "90d" ? "90 Days" : "1 Year"}
            </button>
          ))}
          <div className="flex items-center gap-2 ml-4">
            <input
              type="date"
              className="px-3 py-2 rounded-xl border border-white/10 bg-white/5 text-slate-600 dark:text-slate-300 text-sm focus:border-brand-accent/50 focus:ring-2 focus:ring-brand-accent/20 transition-all"
            />
            <span className="text-slate-400">to</span>
            <input
              type="date"
              className="px-3 py-2 rounded-xl border border-white/10 bg-white/5 text-slate-600 dark:text-slate-300 text-sm focus:border-brand-accent/50 focus:ring-2 focus:ring-brand-accent/20 transition-all"
            />
          </div>
        </div>
      </div>

      {/* Stats Grid */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-6 mb-8">
        {stats.map((stat, index) => (
          <GlassCard key={index} gradient={stat.color as any} hover>
            <div className="flex items-center justify-between mb-4">
              <PremiumIcon icon={stat.icon} variant={stat.color as any} />
              <div className={`flex items-center gap-1 text-xs font-semibold ${stat.trendUp ? "text-emerald-400" : "text-red-400"}`}>
                {stat.trendUp ? <ArrowUpRight size={14} /> : <ArrowDownRight size={14} />}
                {stat.trend}
              </div>
            </div>
            <div className="text-2xl font-bold text-slate-900 dark:text-white mb-1">{stat.value}</div>
            <div className="text-sm text-slate-600 dark:text-slate-400">{stat.label}</div>
          </GlassCard>
        ))}
      </div>

      {/* Main Content Grid */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6 mb-8">
        {/* Revenue Chart */}
        <GlassCard gradient="brand" className="lg:col-span-2">
          <PremiumSectionHeader
            title="Revenue Overview"
            description="Monthly revenue performance"
            icon={TrendingUp}
            iconVariant="brand"
            action={
              <button className="p-2 rounded-lg hover:bg-white/10 transition-colors">
                <MoreVertical size={18} className="text-slate-600 dark:text-slate-300" />
              </button>
            }
          />
          <div className="h-[300px] flex items-center justify-center">
            <div className="text-center">
              <div className="text-6xl font-bold bg-gradient-to-r from-brand-accent to-purple-500 bg-clip-text text-transparent mb-2">
                ${d.revenue.toLocaleString()}
              </div>
              <div className="text-sm text-slate-600 dark:text-slate-400">
                Total revenue this period
              </div>
              <div className="mt-4 flex items-center justify-center gap-2">
                <PremiumBadge variant="success">ROAS: {d.roas.toFixed(2)}x</PremiumBadge>
                <span className="text-xs text-slate-500 dark:text-slate-500">vs ad spend</span>
              </div>
            </div>
          </div>
        </GlassCard>

        {/* Alerts */}
        <GlassCard gradient="amber">
          <PremiumSectionHeader
            title="Alerts"
            description="Recent notifications"
            icon={AlertCircle}
            iconVariant="amber"
          />
          <div className="space-y-3">
            {alerts.map((alert, index) => (
              <div key={index} className="flex items-start gap-3 p-3 rounded-xl bg-white/5 border border-white/10">
                <PremiumIcon
                  icon={alert.type === "success" ? CheckCircle : alert.type === "warning" ? Clock : AlertCircle}
                  variant={alert.type === "success" ? "emerald" : alert.type === "warning" ? "amber" : "red"}
                  background
                  size={14}
                />
                <div className="flex-1">
                  <div className="text-sm font-semibold text-slate-900 dark:text-white mb-1">{alert.message}</div>
                  <div className="text-xs text-slate-500 dark:text-slate-500">{alert.time}</div>
                </div>
              </div>
            ))}
          </div>
        </GlassCard>
      </div>

      {/* Orders and Products */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 mb-8">
        {/* Recent Orders */}
        <GlassCard gradient="brand">
          <PremiumSectionHeader
            title="Recent Orders"
            description="Latest customer orders"
            icon={ShoppingCart}
            iconVariant="brand"
            action={
              <button className="text-sm text-brand-accent font-semibold hover:underline">
                View All
              </button>
            }
          />
          <div className="space-y-3">
            {recentOrders.map((order) => {
              // Priority: shipping_status > status (when tracking_number exists)
              const hasShipment = !!(order as any).tracking_number && (order as any).tracking_number.trim() !== "";
              const displayStatus = hasShipment ? (order as any).shipping_status : order.status;
              return (
                <div key={order.id} className="flex items-center gap-4 p-3 rounded-xl bg-white/5 border border-white/10 hover:bg-white/10 transition-colors">
                  <div className="flex-1">
                    <div className="flex items-center justify-between mb-1">
                      <div className="font-semibold text-slate-900 dark:text-white">{order.customer}</div>
                      <PremiumBadge
                        variant={displayStatus === "completed" ? "success" : displayStatus === "pending" ? "warning" : displayStatus === "processing" ? "info" : "error"}
                        size="sm"
                      >
                        {displayStatus}
                      </PremiumBadge>
                    </div>
                    <div className="flex items-center justify-between">
                      <div className="text-sm text-slate-600 dark:text-slate-400">{order.id}</div>
                      <div className="text-sm font-mono text-slate-900 dark:text-white">{order.amount}</div>
                    </div>
                  </div>
                  <div className="text-xs text-slate-500 dark:text-slate-500">{order.date}</div>
                </div>
              );
            })}
          </div>
        </GlassCard>

        {/* Top Products */}
        <GlassCard gradient="emerald">
          <PremiumSectionHeader
            title="Top Products"
            description="Best performing items"
            icon={Package}
            iconVariant="emerald"
            action={
              <button className="text-sm text-emerald-400 font-semibold hover:underline">
                View All
              </button>
            }
          />
          <div className="space-y-3">
            {topProductsList.map((product, index) => (
              <div key={index} className="flex items-center gap-4 p-3 rounded-xl bg-white/5 border border-white/10 hover:bg-white/10 transition-colors">
                <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-emerald-500/20 to-teal-500/20 border border-emerald-500/30 flex items-center justify-center">
                  <Package size={18} className="text-emerald-400" />
                </div>
                <div className="flex-1">
                  <div className="flex items-center justify-between mb-1">
                    <div className="font-semibold text-slate-900 dark:text-white">{product.name}</div>
                  </div>
                  <div className="flex items-center justify-between">
                    <div className="text-sm text-slate-600 dark:text-slate-400">{product.sales} sales</div>
                    <div className="text-sm font-mono text-slate-900 dark:text-white">{product.revenue}</div>
                  </div>
                </div>
              </div>
            ))}
          </div>
        </GlassCard>
      </div>

      {/* Performance Metrics */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
        <GlassCard gradient="brand">
          <PremiumSectionHeader
            title="Conversion Rate"
            description="Visitor to customer ratio"
            icon={TrendingUp}
            iconVariant="brand"
          />
          <div className="text-center py-4">
            <div className="text-4xl font-bold bg-gradient-to-r from-brand-accent to-purple-500 bg-clip-text text-transparent mb-2">
              {(d.confirmationRate * 100).toFixed(1)}%
            </div>
            <div className="text-sm text-slate-600 dark:text-slate-400 mb-4">Confirmed total orders</div>
            <PremiumProgress value={d.confirmationRate * 100} color="brand" size="lg" showLabel />
          </div>
        </GlassCard>

        <GlassCard gradient="emerald">
          <PremiumSectionHeader
            title="Customer Satisfaction"
            description="Average rating score"
            icon={CheckCircle}
            iconVariant="emerald"
          />
          <div className="text-center py-4">
            <div className="text-4xl font-bold bg-gradient-to-r from-emerald-400 to-teal-500 bg-clip-text text-transparent mb-2">
              {(d.deliveryRate * 100).toFixed(1)}%
            </div>
            <div className="text-sm text-slate-600 dark:text-slate-400 mb-4">Delivered successfully</div>
            <PremiumProgress value={d.deliveryRate * 100} color="emerald" size="lg" showLabel />
          </div>
        </GlassCard>

        <GlassCard gradient="amber">
          <PremiumSectionHeader
            title="Delivery Time"
            description="Average shipping duration"
            icon={Truck}
            iconVariant="amber"
          />
          <div className="text-center py-4">
            <div className="text-4xl font-bold bg-gradient-to-r from-amber-400 to-orange-500 bg-clip-text text-transparent mb-2">
              ${d.adSpend.toLocaleString()}
            </div>
            <div className="text-sm text-slate-600 dark:text-slate-400 mb-4">Meta Campaigns Total</div>
            <PremiumProgress value={100} color="amber" size="lg" showLabel />
          </div>
        </GlassCard>
      </div>
    </div>
  );
}
