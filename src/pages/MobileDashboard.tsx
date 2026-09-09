import { useState, useMemo } from "react";
import { 
  DollarSign, 
  Package, 
  CheckCircle2, 
  Clock, 
  TrendingUp, 
  Target,
  BarChart3,
  ArrowUpRight,
  ArrowDownRight,
  Calendar,
  MapPin,
  Phone,
  AlertCircle
} from "lucide-react";
import { useDashboardData } from "../hooks/useDashboardData";
import { useAuth } from "../hooks/useAuth";
import { StatusBadge } from "../components/StatusBadge";

function formatCurrency(amount: number) {
  return `${Number(amount).toLocaleString("fr-MA", { maximumFractionDigits: 0 })} MAD`;
}

function formatPercent(value: number) {
  return `${value.toFixed(1)}%`;
}

export default function MobileDashboard() {
  const { workspace } = useAuth();
  const [selectedPeriod, setSelectedPeriod] = useState("today");
  const [customDate, setCustomDate] = useState("");
  
  // Calculate date range based on selected period
  const { start: startDate, end: endDate } = useMemo(() => {
    const end = new Date();
    end.setHours(23, 59, 59, 999);
    
    const start = new Date();
    start.setHours(0, 0, 0, 0);
    
    if (selectedPeriod === "today") {
      // Already set
    } else if (selectedPeriod === "yesterday") {
      start.setDate(start.getDate() - 1);
      end.setDate(end.getDate() - 1);
    } else if (selectedPeriod === "all") {
      start.setTime(0);
    } else if (selectedPeriod === "custom" && customDate) {
      const d = new Date(customDate);
      start.setTime(d.getTime());
      end.setTime(d.getTime());
      end.setHours(23, 59, 59, 999);
    }
    
    return { start, end };
  }, [selectedPeriod, customDate]);
  
  const d = useDashboardData(startDate, endDate);
  
  // Get greeting based on time
  const getGreeting = () => {
    const hour = new Date().getHours();
    if (hour < 12) return "Good Morning";
    if (hour < 18) return "Good Afternoon";
    return "Good Evening";
  };

  const kpiCards = [
    {
      title: "Revenue",
      value: formatCurrency(d.revenue || 0),
      icon: DollarSign,
      trend: "+12.5%",
      trendUp: true,
      color: "from-emerald-500 to-emerald-600",
      bgColor: "bg-emerald-500/10",
    },
    {
      title: "Orders",
      value: d.orders.length.toString(),
      icon: Package,
      trend: "+8.2%",
      trendUp: true,
      color: "from-blue-500 to-blue-600",
      bgColor: "bg-blue-500/10",
    },
    {
      title: "Confirmed",
      value: d.confirmedCount.toString(),
      icon: CheckCircle2,
      trend: "+15.3%",
      trendUp: true,
      color: "from-brand to-brand-accent",
      bgColor: "bg-brand/10",
    },
    {
      title: "Pending",
      value: d.pending.toString(),
      icon: Clock,
      trend: "-5.1%",
      trendUp: false,
      color: "from-amber-500 to-amber-600",
      bgColor: "bg-amber-500/10",
    },
    {
      title: "Delivered",
      value: d.delivered.toString(),
      icon: Package,
      trend: "+22.1%",
      trendUp: true,
      color: "from-purple-500 to-purple-600",
      bgColor: "bg-purple-500/10",
    },
    {
      title: "Cancelled",
      value: d.cancelled.toString(),
      icon: AlertCircle,
      trend: "-2.3%",
      trendUp: true,
      color: "from-red-500 to-red-600",
      bgColor: "bg-red-500/10",
    },
  ];

  return (
    <div className="min-h-screen bg-base-bg w-full overflow-x-hidden">
      {/* Greeting Card */}
      <div className="relative overflow-hidden rounded-[24px] bg-gradient-to-br from-brand via-brand-accent to-purple-600 p-6 mb-6 shadow-sm w-full">
        <div className="absolute top-0 right-0 w-64 h-64 bg-white/10 rounded-full blur-3xl -translate-y-1/2 translate-x-1/2" />
        <div className="absolute bottom-0 left-0 w-48 h-48 bg-white/10 rounded-full blur-3xl translate-y-1/2 -translate-x-1/2" />
        
        <div className="relative z-10">
          <p className="text-[15px] font-medium text-white/80 mb-1">{getGreeting()}</p>
          <h1 className="text-2xl font-bold text-white mb-4">{workspace?.name || "Workspace"}</h1>
          
          <div className="grid grid-cols-2 gap-4">
            <div className="bg-white/20 backdrop-blur-sm rounded-2xl p-4">
              <div className="flex items-center gap-2 mb-2">
                <DollarSign size={16} className="text-white" />
                <span className="text-[13px] font-medium text-white/80">Revenue</span>
              </div>
              <p className="text-2xl font-bold text-white">{formatCurrency(d.revenue || 0)}</p>
            </div>
            <div className="bg-white/20 backdrop-blur-sm rounded-2xl p-4">
              <div className="flex items-center gap-2 mb-2">
                <Package size={16} className="text-white" />
                <span className="text-[13px] font-medium text-white/80">Orders</span>
              </div>
              <p className="text-2xl font-bold text-white">{d.orders.length}</p>
            </div>
          </div>
        </div>
      </div>

      {/* Period Selector */}
      <div className="flex gap-2.5 mb-6 overflow-x-auto w-full px-4 pb-2 scrollbar-none items-center">
        <div className="relative flex-shrink-0">
          <input
            type="date"
            aria-label="Custom Date"
            value={customDate}
            className="absolute inset-0 w-full h-full opacity-0 cursor-pointer"
            onChange={(e) => {
              if (e.target.value) {
                setCustomDate(e.target.value);
                setSelectedPeriod("custom");
              }
            }}
          />
          <button
            type="button"
            className={`w-11 h-11 flex items-center justify-center rounded-2xl border ${selectedPeriod === 'custom' ? 'bg-[#d96b86]/10 border-[#d96b86]/30 text-[#d96b86]' : 'bg-base-surface border-base-border/70 text-ink-muted'} transition-colors pointer-events-none`}
          >
            <Calendar size={18} strokeWidth={2} />
          </button>
        </div>

        {[
          { id: "today", label: "Today" },
          { id: "yesterday", label: "Yesterday" },
          { id: "all", label: "All time" }
        ].map((period) => (
          <button
            key={period.id}
            onClick={() => setSelectedPeriod(period.id)}
            className={`h-11 px-5 rounded-2xl text-[14px] font-bold whitespace-nowrap transition-all flex-shrink-0 border ${
              selectedPeriod === period.id
                ? "bg-[#d96b86] text-white border-[#d96b86] shadow-sm shadow-[#d96b86]/30"
                : "bg-base-surface text-[#4a5568] border-base-border/70 hover:bg-base-raised"
            }`}
          >
            {period.label}
          </button>
        ))}
      </div>

      {/* KPI Cards */}
      <div className="grid grid-cols-2 gap-3 mb-6 px-4 w-full">
        {kpiCards.map((card, index) => {
          const Icon = card.icon;
          return (
            <div
              key={index}
              className="bg-base-surface rounded-[20px] p-4 border border-base-border shadow-sm active:scale-[0.98] transition-transform"
            >
              <div className={`w-10 h-10 rounded-xl ${card.bgColor} flex items-center justify-center mb-3`}>
                <Icon size={18} className={`bg-gradient-to-br ${card.color} bg-clip-text text-transparent`} />
              </div>
              <p className="text-[13px] font-medium text-ink-muted mb-1">{card.title}</p>
              <p className="text-xl font-bold text-ink mb-2">{card.value}</p>
              <div className={`flex items-center gap-1 text-[12px] font-medium ${
                card.trendUp ? "text-emerald-500" : "text-red-500"
              }`}>
                {card.trendUp ? <ArrowUpRight size={12} /> : <ArrowDownRight size={12} />}
                {card.trend}
              </div>
            </div>
          );
        })}
      </div>

      {/* Quick Actions */}
      <div className="px-4 mb-6 w-full">
        <h2 className="text-[17px] font-bold text-ink mb-3">Quick Actions</h2>
        <div className="grid grid-cols-4 gap-3">
          {[
            { icon: Package, label: "New Order", color: "bg-brand/10 text-brand" },
            { icon: Package, label: "Add Product", color: "bg-blue-500/10 text-blue-500" },
            { icon: DollarSign, label: "Expense", color: "bg-emerald-500/10 text-emerald-500" },
            { icon: BarChart3, label: "Report", color: "bg-purple-500/10 text-purple-500" },
          ].map((action, index) => {
            const Icon = action.icon;
            return (
              <button
                key={index}
                className="flex flex-col items-center gap-2 p-3 rounded-2xl bg-base-surface border border-base-border active:scale-[0.95] transition-transform"
              >
                <div className={`w-10 h-10 rounded-xl ${action.color} flex items-center justify-center`}>
                  <Icon size={18} />
                </div>
                <span className="text-[11px] font-medium text-ink">{action.label}</span>
              </button>
            );
          })}
        </div>
      </div>

      {/* Recent Orders */}
      <div className="px-4 mb-6 w-full">
        <div className="flex items-center justify-between mb-3">
          <h2 className="text-[17px] font-bold text-ink">Recent Orders</h2>
          <button className="text-[13px] font-medium text-brand">View All</button>
        </div>
        
        <div className="space-y-3">
          {d.orders.slice(0, 3).map((order: any, index: number) => (
            <div
              key={index}
              className="bg-base-surface rounded-[20px] p-4 border border-base-border active:scale-[0.98] transition-transform"
            >
              <div className="flex items-start justify-between mb-3">
                <div>
                  <p className="text-[15px] font-semibold text-ink mb-1">
                    {order.customer?.name || "Unknown"}
                  </p>
                  <p className="text-[13px] text-ink-muted">#{order.order_number}</p>
                </div>
                <div className="text-right">
                  <p className="text-[15px] font-bold text-brand-accent">
                    {formatCurrency(order.total)}
                  </p>
                  <p className="text-[11px] text-ink-muted">
                    {new Date(order.created_at).toLocaleDateString()}
                  </p>
                </div>
              </div>
              
              <div className="flex items-center gap-2">
                <StatusBadge status={order.status} size="sm" />
                <span className="text-[13px] text-ink-muted">
                  {order.city}
                </span>
              </div>
            </div>
          ))}
        </div>
      </div>

      {/* Geographic Performance */}
      <div className="px-4 mb-24 w-full">
        <h2 className="text-[17px] font-bold text-ink mb-3">Top Cities</h2>
        <div className="space-y-3">
          {d.topCities?.slice(0, 5).map((city: any, index: number) => (
            <div
              key={index}
              className="bg-base-surface rounded-[20px] p-4 border border-base-border"
            >
              <div className="flex items-center justify-between mb-2">
                <div className="flex items-center gap-3">
                  <div className="w-8 h-8 rounded-xl bg-brand/10 flex items-center justify-center">
                    <MapPin size={14} className="text-brand" />
                  </div>
                  <div>
                    <p className="text-[14px] font-semibold text-ink">{city.name}</p>
                    <p className="text-[12px] text-ink-muted">{city.orders} orders</p>
                  </div>
                </div>
                <div className="text-right">
                  <p className="text-[14px] font-bold text-brand-accent">
                    {formatCurrency(city.revenue)}
                  </p>
                  <p className="text-[11px] text-emerald-500">{city.deliveryRate}% delivered</p>
                </div>
              </div>
              <div className="h-1.5 bg-base-raised rounded-full overflow-hidden">
                <div
                  className="h-full bg-gradient-to-r from-brand to-brand-accent rounded-full transition-all duration-500"
                  style={{ width: `${city.deliveryRate}%` }}
                />
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
