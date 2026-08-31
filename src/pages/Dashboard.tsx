import { useState, useMemo, useEffect, useRef, Suspense, lazy } from "react";
import { useBusinessConfig } from "../hooks/useBusinessConfig";
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
  Loader2,
  Calendar,
  ScanLine
} from "lucide-react";
// Recharts imports removed — components are now lazy-loaded
import { PageHeader } from "../components/PageHeader";
import { getShippingPriceSync } from "../services/shippingPriceService";
import { StatCard } from "../components/StatCard";
import { calculateOrderShipping } from "../utils/shipping";
import { useCostRules } from "../hooks/useCostRules";
import { useAffiliateCosts } from "../hooks/useAffiliateCosts";
import { calculateWorkspaceProfit, type ProfitEngineInput } from "../lib/metrics";

const DashboardAnalytics = lazy(() => import("../components/DashboardAnalytics").then(m => ({ default: m.DashboardAnalytics })));
const DashboardRevenueChart = lazy(() => import("../components/DashboardRevenueChart"));
import { useTheme, THEME_COLORS } from "../hooks/useTheme";
import { useDashboardData } from "../hooks/useDashboardData";
import { useOrders } from "../hooks/useOrders";
import { useAuth } from "../hooks/useAuth";
import { normalizeStatus } from "../utils/status";

type RangeType = "today" | "yesterday" | "thisMonth" | "all" | "custom";

const getRangeDates = (type: RangeType, customFrom?: string, customTo?: string) => {
  const end = new Date();
  end.setHours(23, 59, 59, 999);

  const start = new Date();
  start.setHours(0, 0, 0, 0);

  if (type === "today") {
    // Start is already today 00:00:00
  } else if (type === "yesterday") {
    start.setDate(start.getDate() - 1);
    end.setDate(end.getDate() - 1);
  } else if (type === "thisMonth") {
    start.setDate(1); // First day of current month
    end.setMonth(end.getMonth() + 1, 0); // Last day of current month
  } else if (type === "all") {
    start.setTime(0);
  } else if (type === "custom") {
    if (customFrom) {
      const d = new Date(customFrom);
      d.setHours(0, 0, 0, 0);
      start.setTime(d.getTime());
    }
    if (customTo) {
      const d = new Date(customTo);
      d.setHours(23, 59, 59, 999);
      end.setTime(d.getTime());
    }
  }
  return { start, end };
};

function mad(n: number) {
  const value = Number(n || 0);
  return `MAD ${isFinite(value) ? value.toLocaleString("en-US", { maximumFractionDigits: 0 }) : "0"}`;
}

function fmtCur(n: number, dec = 2) {
  const value = Number(n || 0);
  if (!isFinite(value)) return "$0.00";
  const cur = (typeof window !== 'undefined' && (window as any).__meta_account_currency) ? (window as any).__meta_account_currency : 'USD';
  return `${cur} ${value.toLocaleString("en-US", { maximumFractionDigits: dec })}`;
}

interface DashboardProps {
  orders?: any[];
}

interface StatusItemProps {
  label: string;
  count: number;
  total: number;
  colorClass: string;
}

function StatusProgressItem({ label, count, total, colorClass }: StatusItemProps) {
  const percentage = total > 0 ? Math.round((count / total) * 100) : 0;
  const radius = 16;
  const circumference = 2 * Math.PI * radius;
  const strokeDashoffset = circumference - (percentage / 100) * circumference;

  return (
    <div className="flex items-center gap-4">
      <div className="relative flex items-center justify-center w-12 h-12">
        <svg className="w-full h-full transform -rotate-90" viewBox="0 0 40 40">
          <circle
            cx="20"
            cy="20"
            r={radius}
            className="text-gray-700/30"
            strokeWidth="3"
            stroke="currentColor"
            fill="transparent"
          />
          <circle
            cx="20"
            cy="20"
            r={radius}
            className={colorClass}
            strokeWidth="3"
            strokeDasharray={circumference}
            strokeDashoffset={strokeDashoffset}
            strokeLinecap="round"
            stroke="currentColor"
            fill="transparent"
          />
        </svg>
        <span className="absolute text-xs font-semibold text-slate-900 dark:text-white">{percentage}%</span>
      </div>
      <div className="flex flex-col">
        <span className="text-sm font-medium text-ink">{label}</span>
        <span className="text-xs text-ink-muted">{count} orders</span>
      </div>
    </div>
  );
}

export default function Dashboard({ orders: propOrders }: DashboardProps) {
  const [rangeType, setRangeType] = useState<RangeType>("thisMonth");
  const [customFrom, setCustomFrom] = useState<string>(() => {
    const d = new Date();
    d.setDate(1); // First day of current month
    return d.toISOString().slice(0, 10);
  });
  const [customTo, setCustomTo] = useState<string>(() => {
    const d = new Date();
    d.setMonth(d.getMonth() + 1, 0); // Last day of current month
    return d.toISOString().slice(0, 10);
  });
  const [showDatePicker, setShowDatePicker] = useState(false);

  const { workspace, loading: workspaceLoading } = useAuth();

  // Guard: don't render until workspace is loaded
  if (workspaceLoading) {
    return (
      <div className="flex min-h-screen items-center justify-center">
        <div className="flex flex-col items-center gap-3">
          <Loader2 className="h-8 w-8 animate-spin text-brand-accent" />
          <p className="text-sm text-ink-muted">Loading workspace data...</p>
        </div>
      </div>
    );
  }

  if (!workspace?.id) {
    return (
      <div className="flex min-h-screen items-center justify-center px-4">
        <div className="max-w-md rounded-2xl border border-base-border bg-base-surface p-8 text-center">
          <div className="mb-4 flex justify-center">
            <div className="flex h-12 w-12 items-center justify-center rounded-full bg-amber-100 dark:bg-amber-900/30">
              <Layers className="h-6 w-6 text-amber-600 dark:text-amber-400" />
            </div>
          </div>
          <h1 className="text-lg font-semibold text-ink mb-2">Workspace Not Available</h1>
          <p className="text-sm text-ink-muted mb-4">
            Unable to load workspace data. This may be due to permission settings or data synchronization issues.
          </p>
          <div className="space-y-3">
            <button
              onClick={() => window.location.reload()}
              className="w-full rounded-lg bg-brand px-4 py-2 text-sm font-medium text-white hover:bg-brand/90 transition-colors"
            >
              Refresh Page
            </button>
            <button
              onClick={() => window.location.href = '/settings'}
              className="w-full rounded-lg border border-base-border bg-base-surface px-4 py-2 text-sm font-medium text-ink hover:bg-base-raised transition-colors"
            >
              Go to Settings
            </button>
          </div>
          <p className="text-xs text-ink-muted mt-4">
            If this problem persists, please contact support with your user ID.
          </p>
        </div>
      </div>
    );
  }

  const { start: startDate, end: endDate } = useMemo(
    () => getRangeDates(rangeType, customFrom, customTo),
    [rangeType, customFrom, customTo]
  );
  const d = useDashboardData(startDate, endDate);
  const { config: businessConfig } = useBusinessConfig();
  const { rules: costRules } = useCostRules();
  const { settings: affiliateSettings, skuCosts: affiliateSkuCosts } = useAffiliateCosts() as any;
  const { mode } = useTheme();
  const chartColors = THEME_COLORS[mode];

  // Memoize date strings to prevent unnecessary effect triggers
  const dateStrings = useMemo(() => ({
    from: startDate.toISOString().slice(0, 10),
    to: endDate.toISOString().slice(0, 10),
    isoStart: startDate.toISOString(),
    isoEnd: endDate.toISOString()
  }), [startDate, endDate]);

  // Prevent duplicate event dispatching
  const lastDispatchedRangeRef = useRef<string | null>(null);

  // Persist dashboard date range to localStorage so AdsManager can sync to same dates
  useEffect(() => {
    const rangeKey = `${dateStrings.from}-${dateStrings.to}-${rangeType}`;

    // Only dispatch if the range actually changed
    if (lastDispatchedRangeRef.current === rangeKey) {
      return;
    }

    lastDispatchedRangeRef.current = rangeKey;

    localStorage.setItem("dashboard_date_from", dateStrings.from);
    localStorage.setItem("dashboard_date_to", dateStrings.to);
    localStorage.setItem("dashboard_range_type", rangeType);

    // Notify AdsManager if it's listening
    window.dispatchEvent(new CustomEvent("dashboard-date-changed", { detail: { from: dateStrings.from, to: dateStrings.to, rangeType } }));
  }, [dateStrings.from, dateStrings.to, rangeType]);


  // Flexible Date Parsing function
  const parseDateFlexible = (raw: any): Date | null => {
    if (!raw && raw !== 0) return null;
    if (raw instanceof Date) return isNaN(raw.getTime()) ? null : raw;
    const s = String(raw).trim();
    const isoMatch = s.match(/^\d{4}-\d{2}-\d{2}(?:[T\s].*)?$/);
    if (isoMatch) {
      const parts = s.split(/\s|T/)[0].split("-");
      const y = Number(parts[0]);
      const m = Number(parts[1]) - 1;
      const day = Number(parts[2]);
      const timePart = (s.split(/\s|T/)[1] || "");
      if (timePart) {
        const date = new Date(s);
        if (!isNaN(date.getTime())) return date;
      }
      return new Date(Date.UTC(y, m, day));
    }
    const dm = s.match(/^(\d{2})\/(\d{2})\/(\d{4})(?:\s.*)?$/);
    if (dm) {
      const day = Number(dm[1]);
      const month = Number(dm[2]) - 1;
      const year = Number(dm[3]);
      return new Date(Date.UTC(year, month, day));
    }
    const num = Number(s);
    if (!isNaN(num)) {
      const dateVal = new Date(num);
      return isNaN(dateVal.getTime()) ? null : dateVal;
    }
    const dateVal = new Date(s);
    return isNaN(dateVal.getTime()) ? null : dateVal;
  };

  const startInclusive = useMemo(() => {
    const d = new Date(startDate);
    d.setHours(0, 0, 0, 0);
    return d;
  }, [startDate]);

  const endInclusive = useMemo(() => {
    const d = new Date(endDate);
    d.setHours(23, 59, 59, 999);
    return d;
  }, [endDate]);

  const rawOrders = propOrders || d?.orders || [];

  // Filter orders matching the selected date range
  const filteredOrders = useMemo(() => {
    return rawOrders.filter((o: any) => {
      const rawDate = o?.created_at || o?.createdAt || o?.order_date;
      const od = parseDateFlexible(rawDate);
      if (!od) return false;
      return od >= startInclusive && od <= endInclusive;
    });
  }, [rawOrders, startInclusive, endInclusive]);

  // Reactive calculations for strict data accuracy & sync
  const metrics = useMemo(() => {
    const skuToCostMap = new Map<string, number>(
      (d?.productsList || []).map((p: any) => [p.sku, Number(p.cost || 0)])
    );

    // 1. All Orders: Simply filteredOrders.length (based on date range)
    const allOrders = filteredOrders.length;

    // 2. Today's Orders & Deliveries
    const today = new Date();
    const todayYear = today.getFullYear();
    const todayMonth = today.getMonth();
    const todayDate = today.getDate();

    const isToday = (od: Date) => (
      od.getFullYear() === todayYear &&
      od.getMonth() === todayMonth &&
      od.getDate() === todayDate
    );

    const todaysOrders = rawOrders.filter((o: any) => {
      const rawDate = o?.createdAt || o?.created_at;
      if (!rawDate) return false;
      const od = new Date(rawDate);
      if (isNaN(od.getTime())) return false;
      return isToday(od);
    }).length;

    const todaysConfirmed = rawOrders.filter((o: any) => {
      const rawDate = o?.createdAt || o?.created_at;
      if (!rawDate) return false;
      const od = new Date(rawDate);
      if (isNaN(od.getTime())) return false;
      const internalStatus = normalizeStatus(o?.status);
      return isToday(od) && (internalStatus === 'CONFIRMED' || internalStatus === 'OUT_FOR_DELIVERY' || internalStatus === 'DELIVERED' || internalStatus === 'COMING_BACK');
    }).length;

    const todaysDelivered = rawOrders.filter((o: any) => {
      const rawDate = o?.createdAt || o?.created_at;
      if (!rawDate) return false;
      const od = new Date(rawDate);
      if (isNaN(od.getTime())) return false;
      const dsInternal = o?.delivery_status ? normalizeStatus(o.delivery_status) : null;
      const sInternal = normalizeStatus(o?.status);
      const isDeliveredToday = dsInternal === 'DELIVERED' || (!o?.delivery_status && sInternal === 'DELIVERED');
      return isToday(od) && isDeliveredToday;
    }).length;

    const statusCounts = filteredOrders.reduce(
      (acc, o: any) => {
        const statusText = `${String(o?.status || "").toLowerCase()} ${String(o?.delivery_status || "").toLowerCase()}`;
        if (/confirm/.test(statusText)) {
          acc.confirmed += 1;
          return acc;
        }
        if (/cancel|canceled|injoignable|double|produit indisponible|blacklist|client pas sérieux/.test(statusText)) {
          acc.cancelled += 1;
          return acc;
        }
        if (/refus|returned|retour|return/.test(statusText)) {
          acc.refused += 1;
          return acc;
        }
        if (/no[_\-\s]?answer|no answer|no_answer|répond|wrong|faux|non\s?répondu|noresponse|no\s?response|busy/.test(statusText)) {
          acc.noAnswer += 1;
          return acc;
        }
        if (/pending|new/.test(statusText)) {
          acc.pending += 1;
          return acc;
        }
        if (/contact|appel|called|contacted|connect|lead/.test(statusText)) {
          acc.contacted += 1;
          return acc;
        }
        acc.other += 1;
        return acc;
      },
      { confirmed: 0, cancelled: 0, noAnswer: 0, contacted: 0, pending: 0, refused: 0, other: 0 }
    );
    const profitInput: ProfitEngineInput = businessConfig.businessCostModel === "affiliate"
      ? {
        mode: "affiliate",
        orders: filteredOrders,
        adSpend: d?.adSpend ?? 0,
        skuCostMap: affiliateSkuCosts || new Map(),
        costRules
      }
      : {
        mode: "seller",
        orders: filteredOrders,
        adSpend: d?.adSpend ?? 0,
        skuCostMap: skuToCostMap,
        costRules
      };

    const profitResult = calculateWorkspaceProfit(profitInput);

    const revenue = profitResult.revenue;
    const totalProductCost = profitResult.productCost;
    const totalShippingCost = profitResult.shippingCost;
    const activeShippingCost = profitResult.shippingCost;
    const adSpend = profitResult.adSpend;
    const netProfit = profitResult.netProfit;
    const profitMargin = profitResult.profitMargin;
    const cpa = profitResult.cpa;
    const deliveryRate = profitResult.deliveryRate;
    const confirmationRate = profitResult.confirmationRate;

    // Extracted counts from profit engine
    const delivered = profitResult.deliveredCount;
    const confirmed = profitResult.confirmedCount;
    const pending = profitResult.pendingCount;
    const cancelled = profitResult.cancelledCount;
    const returned = profitResult.returnedCount;

    const aov = delivered > 0 ? revenue / delivered : 0;
    const costPerDelivered = delivered > 0 ? adSpend / delivered : 0;
    const ndrNetDelivery = allOrders > 0 ? (delivered / allOrders) * 100 : 0;

    // Charts calculation
    const byDate = new Map<string, { revenue: number; adSpend: number; orders: number; confirmed: number; delivered: number }>();
    const tempDate = new Date(startInclusive);
    const formatDateUTC = (dateVal: Date) => {
      const y = dateVal.getUTCFullYear();
      const m = String(dateVal.getUTCMonth() + 1).padStart(2, "0");
      const dayComp = String(dateVal.getUTCDate()).padStart(2, "0");
      return `${y}-${m}-${dayComp}`;
    };

    let iterations = 0;
    while (tempDate <= endInclusive && iterations < 366) {
      const key = formatDateUTC(tempDate);
      byDate.set(key, { revenue: 0, adSpend: 0, orders: 0, confirmed: 0, delivered: 0 });
      tempDate.setDate(tempDate.getDate() + 1);
      iterations++;
    }

    // Count orders and revenue per day
    filteredOrders.forEach((o: any) => {
      const raw = o?.created_at || o?.createdAt || o?.order_date;
      if (!raw) return;
      const dVal = parseDateFlexible(raw);
      if (!dVal) return;
      const key = formatDateUTC(dVal);
      const bucket = byDate.get(key);
      if (!bucket) return;

      bucket.orders += 1;

      const internalStatus = normalizeStatus(o?.shipping_status || o?.delivery_status || o?.status);
      const isDelivered = internalStatus === 'DELIVERED';

      if (isDelivered) {
        bucket.delivered += 1;
        bucket.revenue += Number(o?.total || 0);
      }

      if (internalStatus === 'CONFIRMED' || internalStatus === 'OUT_FOR_DELIVERY' || internalStatus === 'DELIVERED' || internalStatus === 'COMING_BACK') {
        bucket.confirmed += 1;
      }
    });

    // Add ad spend rows
    (d?.adSpendRows || []).forEach((a: any) => {
      const raw = a?.date;
      if (!raw) return;
      let key = String(raw).slice(0, 10);
      try {
        const dVal = new Date(raw);
        if (!isNaN(dVal.getTime())) key = formatDateUTC(dVal);
      } catch {
        key = String(raw).slice(0, 10);
      }
      const bucket = byDate.get(key);
      if (bucket) bucket.adSpend += Number(a?.amount || 0);
    });

    const revenueVsAdSpend = Array.from(byDate.entries()).map(([date, v]) => ({
      date: date.slice(5),
      revenue: v.revenue,
      adSpend: v.adSpend,
      orders: v.orders,
      confirmed: v.confirmed,
      delivered: v.delivered,
    }));

    // City rankings
    const cityMap = new Map<string, number>();
    filteredOrders.forEach((o: any) => {
      if (!o?.city) return;
      cityMap.set(o.city, (cityMap.get(o.city) ?? 0) + 1);
    });
    const topCities = Array.from(cityMap.entries())
      .map(([city, count]) => ({ city, orders: count }))
      .sort((a, b) => b.orders - a.orders)
      .slice(0, 5);

    // Product rankings
    const productMap = new Map<string, { count: number; revenue: number }>();
    filteredOrders.forEach((o: any) => {
      (o?.order_items ?? []).forEach((it: any) => {
        const name = it?.products?.name || o.product_variant || o.sku || "Unknown";
        const quantity = Number(it?.quantity || 1);
        const revenue = Number(it?.unit_price || 0) * quantity;
        const existing = productMap.get(name) ?? { count: 0, revenue: 0 };
        productMap.set(name, {
          count: existing.count + quantity,
          revenue: existing.revenue + revenue,
        });
      });
    });
    const topProducts = Array.from(productMap.entries())
      .map(([name, stats]) => ({ name, count: stats.count, revenue: stats.revenue }))
      .sort((a, b) => b.count - a.count)
      .slice(0, 5);

    // Campaign rankings
    const campaignMap = new Map<string, number>();
    filteredOrders.forEach((o: any) => {
      const name = o?.campaigns?.name;
      if (!name) return;
      campaignMap.set(name, (campaignMap.get(name) ?? 0) + Number(o?.total || 0));
    });
    const topCampaigns = Array.from(campaignMap.entries())
      .map(([name, r]) => ({ name, revenue: r }))
      .sort((a, b) => b.revenue - a.revenue)
      .slice(0, 5);

    return {
      allOrders,
      todaysOrders,
      confirmed,
      pending,
      cancelled,
      delivered,
      shipped: profitResult.shippedCount || 0,
      returned,
      revenue,
      totalProductCost,
      totalShippingCost,
      activeShippingCost,
      adSpend,
      calculatedAdSpend: adSpend,
      netProfit,
      profitMargin,
      deliveryRate,
      confirmationRate,
      cpa,
      aov,
      costPerDelivered,
      ndrNetDelivery,
      todaysConfirmed,
      todaysDelivered,
      statusCounts,
      revenueVsAdSpend,
      topCities,
      topProducts,
      topCampaigns,
      activeCampaigns: d.activeCampaigns ?? 0,
      feeBreakdown: profitResult.feeBreakdown,
      missingCostWarnings: profitResult.missingCostWarnings,
    };
  }, [filteredOrders, rawOrders, d?.productsList, d?.adSpendRows, d?.adSpend, d?.cpa, startInclusive, endInclusive, businessConfig, affiliateSettings, affiliateSkuCosts, costRules]);


  const rangeLabels: Record<RangeType, string> = {
    today: "Today",
    yesterday: "Yesterday",
    thisMonth: "This Month",
    all: "All time",
    custom: "Custom",
  };

  const selectedLabel = rangeType === "custom"
    ? `Custom (${customFrom || "..."} to ${customTo || "..."})`
    : rangeLabels[rangeType];


  return (
    <div>
      <PageHeader
        title="Dashboard"
        subtitle={`Real-time overview of your COD operation — ${selectedLabel}`}
        badge={
          d.loading ? <Loader2 className="h-3.5 w-3.5 animate-spin text-ink-muted" /> : null
        }
        action={
          <div className="flex items-center gap-2">
            <div className="text-ink-muted flex items-center justify-center mr-1">
              <button
                onClick={() => setShowDatePicker(!showDatePicker)}
                className={`p-1 hover:bg-base-raised rounded transition-colors ${showDatePicker ? 'bg-base-raised text-brand' : ''}`}
                title="Select custom date range"
              >
                <Calendar size={18} />
              </button>
            </div>
            {(['today', 'yesterday', 'thisMonth', 'all'] as RangeType[]).map((type) => {
              const isActive = rangeType === type;
              return (
                <button
                  key={type}
                  onClick={() => {
                    setRangeType(type);
                    setShowDatePicker(false);
                  }}
                  className={`px-3.5 py-1.5 rounded-lg text-[13px] font-medium transition-colors ${isActive
                    ? "bg-brand-accent text-white border border-brand-accent"
                    : "bg-transparent text-text-muted border border-brand-border hover:border-text-muted/50 hover:text-text-main"
                    }`}
                >
                  {rangeLabels[type]}
                </button>
              );
            })}
          </div>
        }
      />

      {/* Custom Date Picker Dropdown - Rendered outside PageHeader */}
      {showDatePicker && (
        <div className="fixed left-3 right-3 top-[calc(var(--mobile-topbar-height)+var(--safe-top)+.75rem)] z-[5000] animate-in fade-in slide-in-from-top-2 duration-200 md:left-auto md:right-8 md:top-20">
          <div className="w-full rounded-xl border border-base-border bg-base-surface p-4 shadow-2xl backdrop-blur-sm md:min-w-[320px]">
            <div className="flex items-center justify-between mb-4">
              <h3 className="text-sm font-semibold text-ink">Custom Date Range</h3>
              <button
                onClick={() => setShowDatePicker(false)}
                className="p-1 hover:bg-base-raised rounded transition-colors"
              >
                <XCircle size={16} className="text-ink-muted" />
              </button>
            </div>

            <div className="space-y-4">
              {/* Start Date */}
              <div className="space-y-1.5">
                <label className="text-xs font-semibold uppercase tracking-wide text-ink-muted">Start Date</label>
                <div className="relative">
                  <input
                    type="date"
                    value={customFrom}
                    onChange={(e) => {
                      setCustomFrom(e.target.value);
                      setRangeType("custom");
                    }}
                    className="w-full rounded-lg border border-base-border bg-base-raised px-3 py-2.5 text-sm text-ink focus:border-brand-accent/50 focus:ring-2 focus:ring-brand-accent/10 outline-none transition-all"
                  />
                  <Calendar size={14} className="absolute right-3 top-1/2 -translate-y-1/2 text-ink-muted pointer-events-none" />
                </div>
              </div>

              {/* End Date */}
              <div className="space-y-1.5">
                <label className="text-xs font-semibold uppercase tracking-wide text-ink-muted">End Date</label>
                <div className="relative">
                  <input
                    type="date"
                    value={customTo}
                    onChange={(e) => {
                      setCustomTo(e.target.value);
                      setRangeType("custom");
                    }}
                    className="w-full rounded-lg border border-base-border bg-base-raised px-3 py-2.5 text-sm text-ink focus:border-brand-accent/50 focus:ring-2 focus:ring-brand-accent/10 outline-none transition-all"
                  />
                  <Calendar size={14} className="absolute right-3 top-1/2 -translate-y-1/2 text-ink-muted pointer-events-none" />
                </div>
              </div>

              {/* Quick Select Buttons */}
              <div className="pt-2 border-t border-base-border/50">
                <div className="text-xs font-semibold uppercase tracking-wide text-ink-muted mb-2">Quick Select</div>
                <div className="grid grid-cols-2 gap-2">
                  <button
                    onClick={() => {
                      const today = new Date();
                      setCustomFrom(today.toISOString().slice(0, 10));
                      setCustomTo(today.toISOString().slice(0, 10));
                      setRangeType("custom");
                    }}
                    className="px-3 py-2 rounded-lg bg-base-raised border border-base-border text-xs font-medium text-ink hover:border-brand/30 hover:text-brand transition-all"
                  >
                    Today
                  </button>
                  <button
                    onClick={() => {
                      const yesterday = new Date();
                      yesterday.setDate(yesterday.getDate() - 1);
                      setCustomFrom(yesterday.toISOString().slice(0, 10));
                      setCustomTo(yesterday.toISOString().slice(0, 10));
                      setRangeType("custom");
                    }}
                    className="px-3 py-2 rounded-lg bg-base-raised border border-base-border text-xs font-medium text-ink hover:border-brand/30 hover:text-brand transition-all"
                  >
                    Yesterday
                  </button>
                  <button
                    onClick={() => {
                      const today = new Date();
                      const weekAgo = new Date();
                      weekAgo.setDate(weekAgo.getDate() - 7);
                      setCustomFrom(weekAgo.toISOString().slice(0, 10));
                      setCustomTo(today.toISOString().slice(0, 10));
                      setRangeType("custom");
                    }}
                    className="px-3 py-2 rounded-lg bg-base-raised border border-base-border text-xs font-medium text-ink hover:border-brand/30 hover:text-brand transition-all"
                  >
                    Last 7 Days
                  </button>
                  <button
                    onClick={() => {
                      const today = new Date();
                      const monthAgo = new Date();
                      monthAgo.setDate(monthAgo.getDate() - 30);
                      setCustomFrom(monthAgo.toISOString().slice(0, 10));
                      setCustomTo(today.toISOString().slice(0, 10));
                      setRangeType("custom");
                    }}
                    className="px-3 py-2 rounded-lg bg-base-raised border border-base-border text-xs font-medium text-ink hover:border-brand/30 hover:text-brand transition-all"
                  >
                    Last 30 Days
                  </button>
                </div>
              </div>

              {/* Apply Button */}
              <button
                onClick={() => setShowDatePicker(false)}
                className="w-full px-4 py-2.5 rounded-lg bg-brand text-white text-sm font-semibold hover:bg-brand/90 transition-all shadow-sm"
              >
                Apply Date Range
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Row 1: All Orders, Today's Orders, Today Confirmed, Today Delivered */}
      <div className="mb-4 grid grid-cols-2 md:grid-cols-4 gap-3 max-md:gap-3.5">
        <StatCard
          icon={<Layers size={16} />}
          value={String(metrics.allOrders)}
          label="All Orders"
        />
        <StatCard
          icon={<ShoppingCart size={16} />}
          value={String(metrics.todaysOrders)}
          label="Today's Orders"
        />
        <StatCard
          icon={<CheckCircle2 size={16} />}
          value={String(metrics.todaysConfirmed)}
          label="Today Confirmed"
        />
        <StatCard
          icon={<PackageCheck size={16} />}
          value={String(metrics.todaysDelivered)}
          label="Today Delivered"
        />
      </div>

      {/* Row 2: Confirmed, Delivered, Returns/Cancellations, Pending Orders */}
      <div className="mb-4 grid grid-cols-2 md:grid-cols-4 gap-3 max-md:gap-3.5">
        <StatCard
          icon={<CheckCircle2 size={16} />}
          value={String(metrics.confirmed)}
          label="Confirmed"
        />
        <StatCard
          icon={<PackageCheck size={16} />}
          value={String(metrics.delivered)}
          label="Delivered"
        />
        <StatCard
          icon={<RotateCcw size={16} />}
          iconColor="text-warn"
          iconBg="bg-warn/15"
          value={String(metrics.returned)}
          label="Returns/Cancellations"
        />
        <StatCard
          icon={<Clock size={16} />}
          iconColor="text-warn"
          iconBg="bg-warn/15"
          value={String(metrics.pending)}
          label="Pending Orders"
        />
      </div>

      {/* Row 3: Delivery Rate, Confirmation Rate, NDR Net Delivery, Cost Per Delivered */}
      <div className="mb-4 grid grid-cols-2 md:grid-cols-4 gap-3 max-md:gap-3.5">
        <StatCard
          icon={<PackageCheck size={16} />}
          value={`${metrics.deliveryRate.toFixed(1)}%`}
          label="Delivery Rate"
        />
        <StatCard
          icon={<Percent size={16} />}
          value={`${metrics.confirmationRate.toFixed(1)}%`}
          label="Confirmation Rate"
        />
        <StatCard
          icon={<ScanLine size={16} />}
          value={`${metrics.ndrNetDelivery.toFixed(1)}%`}
          label="NDR Net Delivery"
        />
        <StatCard
          icon={<DollarSign size={16} />}
          value={`$${metrics.costPerDelivered.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`}
          label="Cost Per Delivered"
        />
      </div>

      {/* Row 4: Revenue, Ad Spend, CPA, Average Order Value, Profit Margin, Net Profit */}
      <div className="mb-6 grid grid-cols-2 md:grid-cols-6 gap-3 max-md:gap-3.5">
        <StatCard
          icon={<DollarSign size={16} />}
          value={mad(metrics.revenue)}
          label="Revenue"
        />
        <StatCard
          icon={<DollarSign size={16} />}
          value={`USD ${metrics.adSpend.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`}
          label="Ad Spend"
        />
        <StatCard
          icon={<DollarSign size={16} />}
          value={`$${metrics.cpa.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`}
          label="CPA"
        />
        <StatCard
          icon={<TrendingUp size={16} />}
          value={`MAD ${metrics.aov.toLocaleString('en-US', { minimumFractionDigits: 0, maximumFractionDigits: 0 })}`}
          label="Average Order Value"
        />
        <StatCard
          icon={<Percent size={16} />}
          value={`${metrics.profitMargin.toFixed(1)}%`}
          label="Profit Margin"
        />
        <StatCard
          icon={<TrendingUp size={16} />}
          value={mad(metrics.netProfit)}
          label="Net Profit"
          tooltip={`Revenue: +${mad(metrics.revenue)}\nProducts: -${mad(metrics.totalProductCost)}\nAd Spend: -$${metrics.adSpend.toFixed(2)}\nShipping: -${mad(metrics.activeShippingCost)}\n${metrics.feeBreakdown?.map(f => `${f.name}: -${mad(f.amount)} (${f.orderCount}x)`).join('\n')}\n= ${mad(metrics.netProfit)}`}
        />
      </div>

      {(metrics.missingCostWarnings?.length > 0) && (
        <div className="mb-6 flex flex-col gap-2">
          {metrics.missingCostWarnings.map((w: any, idx: number) => (
            <div key={idx} className="flex items-center gap-2 rounded-lg border border-warn/30 bg-warn/10 p-3 text-sm text-warn-dark">
              <span className="font-semibold px-2 py-0.5 rounded bg-warn/20 text-[11px] uppercase tracking-wide">Warning</span>
              {w.message} ({w.count} orders affected)
            </div>
          ))}
        </div>
      )}

      {/* Mode Indicator Badge (Top right of screen or above chart) */}
      <div className="mb-3 flex justify-end">
        <span className="inline-flex items-center gap-1.5 rounded-full border border-brand/20 bg-brand/10 px-3 py-1 text-[11px] font-semibold uppercase tracking-wider text-brand">
          Cost Model: {businessConfig.businessCostModel === "affiliate" ? "Affiliate Program" : "Seller / Own Inventory"}
        </span>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-3 gap-4 max-md:gap-6">
        <div className="md:col-span-2 rounded-2xl border border-base-border/50 bg-base-surface/80 p-5 shadow-sm backdrop-blur-sm max-md:p-6 max-md:bg-base-surface/60 max-md:backdrop-blur-xl relative overflow-hidden transition-all duration-300 hover:border-base-border hover:shadow-md">
          <div className="mb-4 flex items-center justify-between">
            <div>
              <div className="text-[15px] font-bold text-ink">Revenue vs Ad Spend</div>
              <div className="text-[12.5px] text-ink-muted">Historical volume & ad performance tracking</div>
            </div>
            <div className="flex gap-3 text-[11px] font-medium">
              <span className="flex items-center gap-1.5 text-brand-accent">
                <span className="h-2 w-2 rounded-full bg-brand-accent" /> Revenue
              </span>
              <span className="flex items-center gap-1.5 text-danger">
                <span className="h-2 w-2 rounded-full bg-danger" /> Ad Spend
              </span>
            </div>
          </div>
          <div className="w-full h-[280px]">
            <Suspense fallback={<div className="flex h-full w-full items-center justify-center"><Loader2 className="h-6 w-6 animate-spin text-brand-accent/50" /></div>}>
              <DashboardRevenueChart metrics={metrics} chartColors={chartColors} />
            </Suspense>
          </div>
        </div>

        <div className="rounded-xl border border-base-border bg-base-surface p-4 shadow-card max-md:border-none max-md:bg-base-surface/60 max-md:backdrop-blur-xl max-md:shadow-xl max-md:rounded-3xl max-md:p-6">
          <div className="mb-4">
            <div className="text-[13.5px] font-semibold text-ink">Orders Overview</div>
          </div>

          {/* Use shared useOrders hook with the same date range to ensure counts match Orders table */}
          {(() => {
            const { statusCounts: overviewStatusCounts, total: overviewTotal } = useOrders({ startDate: startInclusive, endDate: endInclusive });
            return (
              <>
                <div className="grid grid-cols-2 gap-x-8 gap-y-6">
                  <StatusProgressItem
                    label="Confirmed"
                    count={overviewStatusCounts.confirmed}
                    total={overviewTotal}
                    colorClass="text-emerald-500"
                  />
                  <StatusProgressItem
                    label="Cancelled"
                    count={overviewStatusCounts.cancelled}
                    total={overviewTotal}
                    colorClass="text-red-500"
                  />
                  <StatusProgressItem
                    label="No Answer"
                    count={overviewStatusCounts.noAnswer}
                    total={overviewTotal}
                    colorClass="text-amber-500"
                  />
                  <StatusProgressItem
                    label="Contacted"
                    count={overviewStatusCounts.contacted}
                    total={overviewTotal}
                    colorClass="text-blue-500"
                  />
                  <StatusProgressItem
                    label="Pending / Other"
                    count={overviewStatusCounts.pending + overviewStatusCounts.other}
                    total={overviewTotal}
                    colorClass="text-slate-400"
                  />
                  <StatusProgressItem
                    label="Refused / Returned"
                    count={overviewStatusCounts.refused}
                    total={overviewTotal}
                    colorClass="text-rose-600"
                  />
                </div>

                <div className="mt-6 pt-4 border-t border-base-border/50 text-center">
                  <span className="text-sm font-mono text-ink-muted">Total: {overviewTotal}</span>
                </div>
              </>
            );
          })()}
        </div>
      </div>

      <Suspense fallback={<div className="h-64 flex items-center justify-center rounded-2xl border border-base-border/50 bg-base-surface/80 shadow-sm mt-6"><Loader2 className="h-6 w-6 animate-spin text-brand-accent/50" /></div>}>
        <DashboardAnalytics data={d} metrics={metrics} startDate={startInclusive} endDate={endInclusive} />
      </Suspense>

    </div>
  );
}

































































