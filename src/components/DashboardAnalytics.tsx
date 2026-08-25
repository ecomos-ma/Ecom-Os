import React, { useMemo } from "react";
import { DashboardData } from "../hooks/useDashboardData";
import {
    TrendingUp, TrendingDown, MapPin, Package, PhoneCall, Truck,
    HelpCircle, Megaphone, Boxes, Calculator, Clock, AlertTriangle,
    ArrowRight, Activity, Percent
} from "lucide-react";
import {
    AreaChart, Area, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer,
    PieChart, Pie, Cell, BarChart, Bar, Legend, LineChart, Line, ComposedChart
} from "recharts";
import { useTheme, THEME_COLORS } from "../hooks/useTheme";
import { useOrderTimeAnalytics } from "../hooks/useOrderTimeAnalytics";
import { useBusinessConfig } from "../hooks/useBusinessConfig";
import { StatCard } from "./StatCard";
import { normalizeStatusOrNull } from "../lib/statusEngine";
import { normalizeShippingStatus } from "../lib/shippingStatus";

interface DashboardAnalyticsProps {
    data: DashboardData;
    metrics?: any;
    startDate?: Date;
    endDate?: Date;
}

const COLORS = ["#10B981", "#3B82F6", "#F59E0B", "#EF4444", "#8B5CF6", "#06B6D4", "#EC4899", "#14B8A6"];

function SectionHeader({ title, icon, desc }: { title: string; icon: React.ReactNode; desc: string }) {
    return (
        <div className="mb-4">
            <div className="flex items-center gap-2 text-ink">
                <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-base-raised text-brand-accent">
                    {icon}
                </div>
                <h2 className="text-lg font-bold">{title}</h2>
            </div>
            <p className="mt-1 text-[13px] text-ink-muted pl-10">{desc}</p>
        </div>
    );
}

function SectionContainer({ children }: { children: React.ReactNode }) {
    return (
        <div className="mt-8 rounded-2xl border border-base-border bg-base-surface/40 p-4 shadow-sm md:p-6 mb-8 relative overflow-hidden">
            {children}
        </div>
    );
}

function EmptyState({ msg = "No data available in this date range" }: { msg?: string }) {
    return (
        <div className="flex h-48 w-full items-center justify-center rounded-xl border border-dashed border-base-border bg-base-raised/30 text-[13px] text-ink-muted">
            {msg}
        </div>
    );
}

export function DashboardAnalytics({ data, metrics, startDate, endDate }: DashboardAnalyticsProps) {
    const { mode } = useTheme();
    const themeColors = THEME_COLORS[mode];
    const { config: businessConfig } = useBusinessConfig();
    const currency = data.currency || "MAD";

    const { orders, expenses, metaCampaigns, adSpendRows, adSpend, productsList, loading } = data;

    console.log("Orders:", orders);

    const N = orders.length;
    const noOrders = N === 0;

    const analyticsStartDate = startDate ? new Date(startDate) : (() => {
        const d = new Date();
        d.setDate(d.getDate() - 30);
        d.setHours(0, 0, 0, 0);
        return d;
    })();

    const analyticsEndDate = endDate ? new Date(endDate) : (() => {
        const d = new Date();
        d.setHours(23, 59, 59, 999);
        return d;
    })();

    const { data: hourlyData, peak, loading: hourlyLoading } = useOrderTimeAnalytics(analyticsStartDate, analyticsEndDate);

    const daysCount: Record<string, number> = {};
    orders.forEach(o => {
        const raw = o.created_at || o.order_date;
        if (!raw) return;
        const dt = new Date(raw);
        if (isNaN(dt.getTime())) return;
        const day = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"][dt.getDay()];
        daysCount[day] = (daysCount[day] || 0) + 1;
    });
    const dayData = Object.entries(daysCount).map(([day, count]) => ({ day, count }));

    // ─────────────────────────────────────────────────────────────
    // ADVANCED METRICS AGGREGATION
    // ─────────────────────────────────────────────────────────────
    const analytics = useMemo(() => {
        if (loading || N === 0) return null;

        // Helper functions
        const isConf = (s: string) => normalizeStatusOrNull(s) === "confirmed";
        const isPend = (s: string) => ["pending", "new"].includes(normalizeStatusOrNull(s) || "");
        const isDeliv = (s: string) => normalizeStatusOrNull(s) === "delivered" || normalizeShippingStatus(s) === "DELIVERED";
        const isShip = (s: string) => {
            const shipping = normalizeShippingStatus(s);
            return normalizeStatusOrNull(s) === "shipped" || Boolean(shipping && [
                "NEW_PARCEL", "WAITING_PICKUP", "PICKED_UP", "RECEIVED_AT_WAREHOUSE",
                "IN_DISTRIBUTION", "IN_TRANSIT", "OUT_FOR_DELIVERY",
            ].includes(shipping));
        };
        const isCanc = (s: string) => ["cancelled", "unreachable", "duplicate", "out_of_stock", "blacklisted"].includes(normalizeStatusOrNull(s) || "") || normalizeShippingStatus(s) === "CANCELED";
        const isRet = (s: string) => ["returned", "refused"].includes(normalizeStatusOrNull(s) || "") || [
            "REFUSED", "DELIVERY_FAILED", "RETURNED_TO_AGENCY", "RETURN_TO_DEPOT",
            "RETURN_IN_PROGRESS", "RETURNED_TO_SENDER",
        ].includes(normalizeShippingStatus(s) || "");

        const parseDates = (raw: string) => { const d = new Date(raw); return isNaN(d.getTime()) ? 0 : d.getTime(); };
        const getCost = (sku: string) => { const p = productsList.find(p => p.sku === sku); return p ? Number(p.cost || 0) : 0; };

        // SECTION 1: BUSINESS PERFORMANCE
        let totalRevenue = 0;
        let totalProductCost = 0;
        orders.forEach(o => {
            if (isDeliv(o.delivery_status) || isDeliv(o.status)) {
                totalRevenue += Number(o.total || 0);

                if (o.order_items?.length) {
                    o.order_items.forEach((it: any) => {
                        const cost = Number(it?.products?.cost || getCost(o.sku));
                        totalProductCost += cost * Number(it.quantity || 1);
                    });
                } else {
                    totalProductCost += getCost(o.sku);
                }
            }
        });

        const deliveredCount = orders.filter(o => isDeliv(o.delivery_status) || isDeliv(o.status)).length;
        const confirmedCount = orders.filter(o => isConf(o.status)).length;

        // Override with canonical values from ProfitEngine (Dashboard props)
        const totalAdSpend = metrics?.adSpend ?? (adSpend ?? 0);
        let netProfit = metrics?.netProfit ?? (totalRevenue - totalProductCost - totalAdSpend);
        let profitMargin = metrics?.profitMargin ?? (totalRevenue > 0 ? (netProfit / totalRevenue) * 100 : 0);
        let aov = metrics?.aov ?? (deliveredCount > 0 ? totalRevenue / deliveredCount : 0);

        if (metrics) {
            totalRevenue = metrics.revenue;
            totalProductCost = metrics.totalProductCost;
        }

        // SECTION 2: TOP CITIES
        const cityMap: Record<string, { orders: number, revenue: number, delivered: number, cancelled: number, confirmCount: number }> = {};
        orders.forEach(o => {
            const c = o.city || "Unknown";
            if (!cityMap[c]) cityMap[c] = { orders: 0, revenue: 0, delivered: 0, cancelled: 0, confirmCount: 0 };
            cityMap[c].orders++;
            if (isDeliv(o.delivery_status) || isDeliv(o.status)) {
                cityMap[c].delivered++;
                cityMap[c].revenue += Number(o.total || 0);
            }
            if (isCanc(o.status)) cityMap[c].cancelled++;
            if (isConf(o.status)) cityMap[c].confirmCount++;
        });

        const topCities = Object.entries(cityMap)
            .map(([city, v]) => ({ city, ...v, confRate: v.orders > 0 ? (v.confirmCount / v.orders) * 100 : 0 }))
            .sort((a, b) => b.orders - a.orders)
            .slice(0, 10);

        // SECTION 3: PRODUCTS ANALYTICS
        const prodMap: Record<string, { count: number, revenue: number, returned: number, cost: number }> = {};
        orders.forEach(o => {
            const items = o.order_items?.length ? o.order_items : [{ products: { name: o.product_variant || o.sku }, quantity: 1, unit_price: o.total }];
            items.forEach((it: any) => {
                const name = it.products?.name || "Unknown Product";
                const q = Number(it.quantity || 1);
                const rev = Number(it.unit_price || 0) * q;
                const c = Number(it.products?.cost || getCost(o.sku)) * q;

                if (!prodMap[name]) prodMap[name] = { count: 0, revenue: 0, returned: 0, cost: 0 };
                prodMap[name].count += q;
                prodMap[name].revenue += rev;
                prodMap[name].cost += c;
                if (isRet(o.status) || isRet(o.delivery_status)) prodMap[name].returned += q;
            });
        });
        const topProducts = Object.entries(prodMap)
            .map(([name, v]) => ({
                name,
                count: v.count,
                revenue: v.revenue,
                returned: v.returned,
                margin: v.revenue > 0 ? ((v.revenue - v.cost) / v.revenue) * 100 : 0
            })).sort((a, b) => b.count - a.count);

        // SECTION 4: CONFIRMATION
        const confStatuses: Record<string, number> = { Pending: 0, Confirmed: 0, Rejected: 0, Busy: 0, WrongNum: 0, NoAnswer: 0 };
        let confTimesMs = 0;
        let confTimeCount = 0;
        orders.forEach(o => {
            const st = o.status || "";
            const canonical = normalizeStatusOrNull(st);
            if (isPend(st)) confStatuses.Pending++;
            else if (isConf(st)) confStatuses.Confirmed++;
            else if (canonical === "refused" || canonical === "blacklisted") confStatuses.Rejected++;
            else if (canonical === "busy") confStatuses.Busy++;
            else if (canonical === "wrong_number") confStatuses.WrongNum++;
            else if (canonical === "no_answer") confStatuses.NoAnswer++;

            if (isConf(st) && o.confirmed_at && o.created_at) {
                const diff = parseDates(o.confirmed_at) - parseDates(o.created_at);
                if (diff > 0) { confTimesMs += diff; confTimeCount++; }
            }
        });
        const avgConfTimeMs = confTimeCount > 0 ? confTimesMs / confTimeCount : 0;
        const avgConfTimeH = (avgConfTimeMs / (1000 * 60 * 60)).toFixed(1);

        // SECTION 5: SHIPPING & DELIVERY
        const shipStatuses: Record<string, number> = { Shipped: 0, Delivered: 0, Returned: 0, Cancelled: 0 };
        let delivTimesMs = 0;
        let delivTimeCount = 0;
        orders.forEach(o => {
            if (isShip(o.status) || isShip(o.delivery_status)) shipStatuses.Shipped++;
            else if (isDeliv(o.status) || isDeliv(o.delivery_status)) shipStatuses.Delivered++;
            else if (isRet(o.status) || isRet(o.delivery_status)) shipStatuses.Returned++;
            else if (isCanc(o.status)) shipStatuses.Cancelled++;

            if ((isDeliv(o.status) || isDeliv(o.delivery_status)) && o.delivered_at && o.created_at) {
                const diff = parseDates(o.delivered_at) - parseDates(o.created_at);
                if (diff > 0) { delivTimesMs += diff; delivTimeCount++; }
            }
        });
        const avgDelivTimeMs = delivTimeCount > 0 ? delivTimesMs / delivTimeCount : 0;
        const avgDelivTimeD = (avgDelivTimeMs / (1000 * 60 * 60 * 24)).toFixed(1);

        // SECTION 6: RETURNS
        const returnReasons: Record<string, number> = {};
        orders.forEach(o => {
            if (isRet(o.status) || isRet(o.delivery_status)) {
                const reason = o.shipping_status || "Customer Refused";
                returnReasons[reason] = (returnReasons[reason] || 0) + 1;
            }
        });

        // SECTION 7: ADS
        const campData = metaCampaigns.map(c => {
            const sp = Number(c.spend || 0);
            // NO ×10 conversion here — display raw CPA in ad currency
            const res = Number(c.results || 0);
            return {
                name: c.campaign_name,
                status: c.status,
                spend: sp,
                cpa: res > 0 ? sp / res : 0,
                results: res
            };
        }).sort((a, b) => b.spend - a.spend);


        // SECTION 8: INVENTORY
        const inventoryStats = productsList.map(p => {
            const sold = prodMap[p.name]?.count || 0;
            const stock = Number(p.stock || 0);
            const lowThresh = Number(p.low_stock_threshold || 10);
            const health = stock > lowThresh ? 'Healthy' : stock > 0 ? 'Low Stock' : 'Out of Stock';
            // Estimate days remaining from average daily sold in this period (naive approach)
            const periodDays = N > 0 ? Math.max(1, (parseDates(orders[0]?.created_at) - parseDates(orders[N - 1]?.created_at)) / (1000 * 60 * 60 * 24)) : 1;
            const dailyVelocity = sold / (periodDays || 1);
            const daysRemaining = dailyVelocity > 0 ? Math.floor(stock / dailyVelocity) : 999;
            return { name: p.name, stock, sold, health, daysRemaining, lowThresh };
        }).sort((a, b) => a.stock - b.stock);

        // SECTION 9: CASH FLOW
        const totalExpenses = expenses.reduce((sum, e) => sum + Number(e.amount || 0), 0);
        const pendingCod = orders.filter(o => isDeliv(o.delivery_status) || isDeliv(o.status)).reduce((s, o) => s + Number(o.total || 0), 0);
        const expectedCash = pendingCod - totalExpenses; // rough proxy

        // SECTION 10: TIME ANALYTICS uses useOrderTimeAnalytics hook at component top level
        // SECTION 11: ALERTS
        const alerts: { type: "danger" | "warn" | "info"; msg: string }[] = [];
        if (shipStatuses.Returned > 0 && N > 0 && shipStatuses.Returned / N > 0.3) {
            alerts.push({ type: "danger", msg: `High Return Rate detected (${((shipStatuses.Returned / N) * 100).toFixed(1)}%)` });
        }
        if (profitMargin < 10 && profitMargin !== 0) {
            alerts.push({ type: "warn", msg: `Low Profit Margin (${profitMargin.toFixed(1)}%). Consider adjusting ad spend or product cost.` });
        }
        if (N > 0 && confStatuses.Confirmed / N < 0.4) {
            alerts.push({ type: "warn", msg: `Confirmation rate is below 40% (${((confStatuses.Confirmed / N) * 100).toFixed(1)}%)` });
        }
        campData.filter(c => c.cpa > 15 && c.status === "ACTIVE").forEach(c => {
            alerts.push({ type: "danger", msg: `Campaign "${c.name}" has unusually high CPA (${c.cpa.toFixed(2)} ${currency})` });
        });
        inventoryStats.forEach(inv => {
            if (inv.health === "Out of Stock") alerts.push({ type: "danger", msg: `Product "${inv.name}" is OUT OF STOCK!` });
            else if (inv.health === "Low Stock") alerts.push({ type: "warn", msg: `Low stock alert for "${inv.name}" (${inv.stock} items left, ~${inv.daysRemaining} days)` });
        });

        return {
            revenue: totalRevenue,
            netProfit,
            aov,
            profitMargin,
            totalAdSpend,
            topCities,
            topProducts,
            confStatuses,
            avgConfTimeH,
            shipStatuses,
            avgDelivTimeD,
            returnReasons: Object.entries(returnReasons).map(([r, c]) => ({ reason: r, count: c })).sort((a, b) => b.count - a.count),
            inventoryStats,
            campData,
            totalExpenses,
            expectedCash,
            hourlyData,
            hourlyLoading,
            peak,
            dayData,
            alerts
        };
    }, [orders, expenses, metaCampaigns, adSpendRows, adSpend, productsList, businessConfig, loading, hourlyData, hourlyLoading, peak]);

    console.log("Chart Data:", hourlyData);

    if (loading) {
        return (
            <div className="mt-8 space-y-6 opacity-60 pointer-events-none transition-opacity duration-300">
                <div className="h-8 w-64 bg-base-raised rounded-lg animate-pulse" />
                <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                    <div className="h-28 bg-base-surface border border-base-border rounded-xl animate-pulse" />
                    <div className="h-28 bg-base-surface border border-base-border rounded-xl animate-pulse" />
                    <div className="h-28 bg-base-surface border border-base-border rounded-xl animate-pulse" />
                    <div className="h-28 bg-base-surface border border-base-border rounded-xl animate-pulse" />
                </div>
                <div className="h-64 mt-4 bg-base-surface border border-base-border rounded-xl animate-pulse" />
            </div>
        );
    }

    if (noOrders || !analytics) {
        return (
            <div className="mt-8 text-center border border-dashed border-base-border bg-base-surface/50 rounded-2xl p-10 animate-in fade-in duration-500">
                <Activity size={32} className="mx-auto text-ink-muted mb-3" />
                <div className="text-[14px] font-semibold text-ink">No Analytics Available</div>
                <p className="text-[13px] text-ink-muted mt-1">Change dates or add orders to see deep analytics.</p>
            </div>
        );
    }

    return (
        <div className="mt-10 animate-in fade-in duration-500 pb-12">
            <div className="flex items-center gap-3 mb-8 pb-4 border-b border-base-border">
                <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-gradient-to-br from-brand-accent to-brand-panel text-white shadow-xl">
                    <Activity size={20} />
                </div>
                <div>
                    <h1 className="text-xl font-bold text-ink">Analytics Center</h1>
                    <div className="text-[13px] text-ink-muted">Deep dive into 10 key business areas</div>
                </div>
            </div>

            {/* 11. Alerts Center (Top priority if any) */}
            {analytics.alerts.length > 0 && (
                <div className="mb-8 p-4 rounded-xl border border-amber-500/20 bg-amber-500/5 space-y-2">
                    <div className="flex items-center gap-2 text-[13px] font-bold uppercase tracking-wider text-amber-500 mb-2">
                        <AlertTriangle size={16} /> Attention Required
                    </div>
                    {analytics.alerts.map((a, i) => (
                        <div key={i} className={`text-[13px] font-medium flex items-center gap-2 ${a.type === "danger" ? "text-red-400" : "text-amber-400"}`}>
                            <div className={`w-1.5 h-1.5 rounded-full ${a.type === "danger" ? "bg-red-400" : "bg-amber-400"}`} />
                            {a.msg}
                        </div>
                    ))}
                </div>
            )}

            {/* 1. Business Performance */}
            <SectionContainer>
                <SectionHeader title="Business Performance" icon={<TrendingUp size={16} />} desc="Revenue, profitability, and operational margins at scale." />
                <div className="grid grid-cols-2 md:grid-cols-4 gap-3 mb-6">
                    <StatCard label="Avg Order Value" value={`${analytics.aov.toLocaleString("en-US", { maximumFractionDigits: 0 })} ${currency}`} icon={<Calculator size={14} />} />
                    <StatCard label="Net Profit" value={`${analytics.netProfit.toLocaleString("en-US", { maximumFractionDigits: 0 })} ${currency}`} icon={<TrendingUp size={14} />} iconColor={analytics.netProfit >= 0 ? "text-emerald-400" : "text-red-400"} />
                    <StatCard label="Total Ad Spend" value={`${analytics.totalAdSpend.toLocaleString("en-US", { maximumFractionDigits: 0 })} USD`} icon={<Megaphone size={14} />} iconColor="text-pink-400" />
                    <StatCard label="Profit Margin" value={`${analytics.profitMargin.toFixed(1)}%`} icon={<Percent size={14} />} iconColor="text-amber-400" />
                </div>
                <div className="h-64 w-full">
                    <ResponsiveContainer width="100%" height="100%">
                        <ComposedChart data={data.revenueVsAdSpend} margin={{ top: 10, right: 0, left: -20, bottom: 0 }}>
                            <CartesianGrid strokeDasharray="3 3" vertical={false} stroke={themeColors.grid} />
                            <XAxis dataKey="date" tick={{ fill: themeColors.muted, fontSize: 10 }} axisLine={false} tickLine={false} />
                            <YAxis tick={{ fill: themeColors.muted, fontSize: 10 }} axisLine={false} tickLine={false} tickFormatter={v => `${v}`} />
                            <Tooltip
                                contentStyle={{ backgroundColor: themeColors.tooltipBg, borderColor: themeColors.tooltipBorder, borderRadius: 8 }}
                                formatter={(value: any, name: any) => {
                                    if (name === "Ad Spend") return [`-USD ${Number(value).toFixed(2)}`, "Ad Spend"];
                                    if (name === "Revenue") return [`${Number(value).toLocaleString()} ${currency}`, "Revenue"];
                                    return [value, name];
                                }}
                            />
                            <Legend wrapperStyle={{ fontSize: 12 }} />
                            <Bar dataKey="revenue" fill={themeColors.accent} radius={[4, 4, 0, 0]} name="Revenue" />
                            <Line type="monotone" dataKey="adSpend" stroke="#ef4444" strokeWidth={2} name="Ad Spend" dot={false} />
                        </ComposedChart>
                    </ResponsiveContainer>
                </div>
            </SectionContainer>

            {/* 2. Top Cities */}
            <div className="grid md:grid-cols-2 gap-6 mb-8">
                <SectionContainer>
                    <SectionHeader title="Geographic Performance" icon={<MapPin size={16} />} desc="Order volume and confirmation by city." />
                    {analytics.topCities.length === 0 ? <EmptyState /> : (
                        <div className="space-y-4">
                            {analytics.topCities.slice(0, 5).map(c => (
                                <div key={c.city} className="flex items-center gap-3">
                                    <div className="flex-1">
                                        <div className="flex justify-between text-[13px] mb-1.5">
                                            <span className="font-semibold text-ink">{c.city}</span>
                                            <span className="text-ink-muted">{c.orders} orders</span>
                                        </div>
                                        <div className="h-1.5 w-full bg-base-raised rounded-full overflow-hidden flex">
                                            <div className="bg-brand-accent h-full" style={{ width: `${(c.orders / analytics.topCities[0].orders) * 100}%` }} />
                                        </div>
                                        <div className="text-[11px] text-ink-faint mt-1 flex gap-3">
                                            <span>Conf: {c.confRate.toFixed(0)}%</span>
                                            <span>Deliv: {c.delivered}</span>
                                        </div>
                                    </div>
                                </div>
                            ))}
                        </div>
                    )}
                </SectionContainer>

                {/* 4. Confirmation Analytics */}
                <SectionContainer>
                    <SectionHeader title="Call Center Stats" icon={<PhoneCall size={16} />} desc="Confirmation workflow efficiency." />
                    <div className="grid grid-cols-2 gap-4 mb-4">
                        <div className="p-4 rounded-xl border border-base-border bg-base-raised/30">
                            <div className="text-[11px] text-ink-muted uppercase tracking-wider mb-1">Avg Answer Time</div>
                            <div className="text-xl font-bold text-ink">{analytics.avgConfTimeH}h</div>
                        </div>
                        <div className="p-4 rounded-xl border border-base-border bg-base-raised/30">
                            <div className="text-[11px] text-ink-muted uppercase tracking-wider mb-1">Confirmed</div>
                            <div className="text-xl font-bold text-emerald-400">{analytics.confStatuses.Confirmed}</div>
                        </div>
                    </div>
                    <div className="h-40 w-full">
                        <ResponsiveContainer width="100%" height="100%">
                            <PieChart>
                                <Pie
                                    data={[
                                        { name: "Confirmed", value: analytics.confStatuses.Confirmed },
                                        { name: "Pending", value: analytics.confStatuses.Pending },
                                        { name: "Rejected", value: analytics.confStatuses.Rejected },
                                    ]}
                                    innerRadius={45}
                                    outerRadius={65}
                                    paddingAngle={5}
                                    dataKey="value"
                                >
                                    {COLORS.map((c, i) => <Cell key={i} fill={c} />)}
                                </Pie>
                                <Tooltip />
                            </PieChart>
                        </ResponsiveContainer>
                    </div>
                </SectionContainer>
            </div>

            {/* 3. Product Analytics */}
            <SectionContainer>
                <SectionHeader title="Product Matrix" icon={<Package size={16} />} desc="Best sellers and margin dominators." />
                <div className="overflow-x-auto">
                    <table className="w-full whitespace-nowrap text-[13px] text-left">
                        <thead className="border-b border-base-border text-ink-muted">
                            <tr>
                                <th className="font-medium px-2 py-2">Product</th>
                                <th className="font-medium px-2 py-2">Units Sold</th>
                                <th className="font-medium px-2 py-2">Revenue Gen</th>
                                <th className="font-medium px-2 py-2">Returns</th>
                                <th className="font-medium px-2 py-2">% Margin</th>
                            </tr>
                        </thead>
                        <tbody className="divide-y divide-base-border">
                            {analytics.topProducts.slice(0, 6).map(p => (
                                <tr key={p.name} className="hover:bg-base-raised/40 transition-colors">
                                    <td className="px-2 py-3 font-semibold text-ink">{p.name}</td>
                                    <td className="px-2 py-3 text-brand-accent font-mono">{p.count}</td>
                                    <td className="px-2 py-3 font-mono text-emerald-400">{p.revenue.toLocaleString()}</td>
                                    <td className="px-2 py-3 text-red-400">{p.returned}</td>
                                    <td className="px-2 py-3">
                                        <div className="flex items-center gap-2">
                                            <div className="w-16 h-1.5 bg-base-raised rounded-full">
                                                <div className="h-full bg-amber-400 rounded-full" style={{ width: `${Math.max(0, p.margin)}%` }} />
                                            </div>
                                            <span className="text-[11px] font-mono text-ink-muted">{p.margin.toFixed(0)}%</span>
                                        </div>
                                    </td>
                                </tr>
                            ))}
                        </tbody>
                    </table>
                </div>
            </SectionContainer>

            {/* 5 & 6. Shipping & Returns */}
            <div className="grid md:grid-cols-2 gap-6 mb-8">
                <SectionContainer>
                    <SectionHeader title="Shipping Pipeline" icon={<Truck size={16} />} desc="Logistics lifecycle and transit speeds." />
                    <div className="flex gap-4 items-center justify-between p-4 mb-4 bg-base-raised/30 rounded-xl border border-base-border">
                        <div>
                            <div className="text-[11px] text-ink-muted">Avg Transit Time</div>
                            <div className="text-xl font-bold text-ink">{analytics.avgDelivTimeD} Days</div>
                        </div>
                        <div>
                            <div className="text-[11px] text-ink-muted">Shipped</div>
                            <div className="text-xl font-bold text-sky-400">{analytics.shipStatuses.Shipped}</div>
                        </div>
                        <div>
                            <div className="text-[11px] text-ink-muted">Delivered</div>
                            <div className="text-xl font-bold text-emerald-400">{analytics.shipStatuses.Delivered}</div>
                        </div>
                    </div>
                    <div className="h-3 bg-base-raised rounded-full overflow-hidden flex">
                        <div className="bg-sky-400" title="Shipped" style={{ width: `${(analytics.shipStatuses.Shipped / N) * 100}%` }} />
                        <div className="bg-emerald-400" title="Delivered" style={{ width: `${(analytics.shipStatuses.Delivered / N) * 100}%` }} />
                        <div className="bg-red-400" title="Returned" style={{ width: `${(analytics.shipStatuses.Returned / N) * 100}%` }} />
                    </div>
                </SectionContainer>

                <SectionContainer>
                    <SectionHeader title="Return Analysis" icon={<TrendingDown size={16} />} desc="Why shipments fail delivery." />
                    {analytics.returnReasons.length === 0 ? <EmptyState msg="No returned orders in range" /> : (
                        <div className="space-y-3 mt-4">
                            {analytics.returnReasons.slice(0, 4).map((r, i) => (
                                <div key={i} className="flex justify-between items-center text-[13px]">
                                    <span className="text-ink">{r.reason}</span>
                                    <div className="flex items-center gap-3">
                                        <div className="w-24 h-1.5 bg-base-raised rounded-full">
                                            <div className="h-full bg-red-400 rounded-full" style={{ width: `${(r.count / analytics.shipStatuses.Returned) * 100}%` }} />
                                        </div>
                                        <span className="text-red-400 font-mono w-6 text-right">{r.count}</span>
                                    </div>
                                </div>
                            ))}
                        </div>
                    )}
                </SectionContainer>
            </div>

            {/* 8. Inventory Analytics */}
            <SectionContainer>
                <SectionHeader title="Inventory Health" icon={<Boxes size={16} />} desc="Real-time stock monitoring & runway estimations." />
                {analytics.inventoryStats.length === 0 ? <EmptyState msg="No products tracked in inventory" /> : (
                    <div className="grid md:grid-cols-2 gap-4">
                        {analytics.inventoryStats.slice(0, 4).map(inv => (
                            <div key={inv.name} className="p-4 rounded-xl border border-base-border bg-base-raised/20 flex flex-col justify-between">
                                <div className="flex justify-between items-start mb-3">
                                    <div className="text-[13.5px] font-semibold text-ink truncate pr-3">{inv.name}</div>
                                    <span className={`text-[11px] font-medium px-2 py-0.5 rounded-md ${inv.health === "Healthy" ? "bg-emerald-500/10 text-emerald-500" : inv.health === "Low Stock" ? "bg-amber-500/10 text-amber-500" : "bg-red-500/10 text-red-500"}`}>{inv.health}</span>
                                </div>
                                <div className="flex justify-between items-end">
                                    <div>
                                        <div className="text-[11px] text-ink-muted">In Stock</div>
                                        <div className={`text-xl font-bold font-mono ${inv.stock === 0 ? "text-red-400" : "text-ink"}`}>{inv.stock}</div>
                                    </div>
                                    <div className="text-right">
                                        <div className="text-[11px] text-ink-muted">Runway</div>
                                        <div className="text-[13px] font-mono text-ink">~{inv.daysRemaining === 999 ? "∞" : inv.daysRemaining} days</div>
                                    </div>
                                </div>
                            </div>
                        ))}
                    </div>
                )}
            </SectionContainer>

            {/* 7 & 9. Ads & Cash Flow */}
            <div className="grid md:grid-cols-2 gap-6 mb-8">
                <SectionContainer>
                    <SectionHeader title="Ads Performance" icon={<Megaphone size={16} />} desc="Campaign ROAS and spend." />
                    {analytics.campData.length === 0 ? <EmptyState /> : (
                        <div className="space-y-3">
                            {analytics.campData.slice(0, 4).map((c, i) => (
                                <div key={i} className="flex items-center justify-between p-3 rounded-xl bg-base-raised/20 border border-base-border">
                                    <div className="flex-1 truncate pr-2">
                                        <div className="text-[13px] font-medium text-ink truncate">{c.name}</div>
                                        <div className="text-[11px] text-ink-muted flex gap-2">
                                            <span className={c.status === "ACTIVE" ? "text-emerald-400" : ""}>{c.status}</span>
                                            <span>• {c.results} Res</span>
                                        </div>
                                    </div>
                                    <div className="text-right shrink-0">
                                        <div className="text-[13px] font-mono text-ink">{c.spend.toLocaleString()} USD</div>
                                        <div className="text-[11px] text-pink-400">CPA {c.cpa.toFixed(1)}</div>
                                    </div>
                                </div>
                            ))}
                        </div>
                    )}
                </SectionContainer>

                <SectionContainer>
                    <SectionHeader title="Cash Flow" icon={<Calculator size={16} />} desc="Inflow, outflow, and expected pending COD." />
                    <div className="space-y-4">
                        <div className="flex justify-between items-end border-b border-base-border pb-3">
                            <div>
                                <div className="text-[11px] text-ink-muted uppercase">Gross Revenue</div>
                                <div className="text-2xl font-bold text-emerald-400 mt-1">{analytics.revenue.toLocaleString()} {currency}</div>
                            </div>
                        </div>
                        <div className="flex justify-between text-[13px]">
                            <span className="text-ink-muted flex items-center gap-1.5"><ArrowRight size={13} /> Total Operating Costs</span>
                            <span className="font-mono text-red-400">-{analytics.totalExpenses.toLocaleString()} {currency}</span>
                        </div>
                        <div className="flex justify-between text-[13px]">
                            <span className="text-ink-muted flex items-center gap-1.5"><ArrowRight size={13} /> Pending COD Balance</span>
                            <span className="font-mono text-amber-400">~{analytics.expectedCash.toLocaleString()} {currency}</span>
                        </div>
                    </div>
                </SectionContainer>
            </div>

            {/* 10. Time Analytics */}
            <SectionContainer>
                <SectionHeader title="Chronology & Peak Discovery" icon={<Clock size={16} />} desc="When orders hit the system." />
                <div className="h-48 w-full mt-6">
                    <ResponsiveContainer width="100%" height="100%">
                        <BarChart data={analytics.hourlyData}>
                            <CartesianGrid strokeDasharray="3 3" vertical={false} stroke={themeColors.grid} />
                            <XAxis dataKey="hour" tick={{ fill: themeColors.muted, fontSize: 10 }} axisLine={false} tickLine={false} />
                            <YAxis tick={{ fill: themeColors.muted, fontSize: 10 }} axisLine={false} tickLine={false} width={30} />
                            <Tooltip cursor={{ fill: themeColors.grid }} contentStyle={{ backgroundColor: themeColors.tooltipBg, borderColor: themeColors.tooltipBorder, borderRadius: 8 }} />
                            <Bar dataKey="orders" fill={themeColors.accent} radius={[4, 4, 0, 0]} name="Orders" />
                        </BarChart>
                    </ResponsiveContainer>
                </div>
            </SectionContainer>

        </div>
    );
}
