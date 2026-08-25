import { normalizeStatusOrNull } from "./statusEngine";
import { normalizeShippingStatus } from "./shippingStatus";

// ── Finance Engine V2 ─────────────────────────────────────────────────────────
// Pure computation utilities for the Business Control Center.
// Zero UI dependencies – only math and types.

export interface FinanceOrder {
    total: number;
    status: string;
    shipping_status?: string | null;
    delivery_status?: string | null;
    created_at: string;
}

export interface FinanceTransaction {
    type: "income" | "expense";
    category?: string | null;
    amount: number;
    status: string;
    date: string;
}

export interface ShippingPayout {
    amount: number;
    status: "pending" | "received";
    shipping_company: string;
    due_date?: string | null;
}

export interface RevenueBreakdown {
    gross: number;
    delivered: number;
    pending: number; // confirmed + shipped
    expected: number; // based on historical delivery rate
    cancelled: number;
    returned: number;
}

export interface CashFlowSummary {
    totalIn: number;
    totalOut: number;
    net: number;
    dailyBurn: number;
    cashRunwayDays: number;
}

export interface HealthScore {
    score: number; // 0–100
    grade: "A" | "B" | "C" | "D" | "F";
    factors: HealthFactor[];
}

export interface HealthFactor {
    name: string;
    score: number;
    maxScore: number;
    label: string;
}

export interface ReinvestmentPlan {
    availableCash: number;
    lockedCash: number;
    upcomingExpenses: number;
    safeReinvestment: number;
    recommendedAdsBudget: number;
    recommendedStockBudget: number;
}

export interface ForecastResult {
    expectedRevenue: number;
    expectedProfit: number;
    expectedCash: number;
    expectedDeliveries: number;
    expectedReturns: number;
    confidenceScore: number; // 0–100
}

// ── Status helpers ─────────────────────────────────────────────────────────────

const PENDING_SHIPPING_STATUSES = new Set([
    "NEW_PARCEL", "WAITING_PICKUP", "PICKED_UP", "RECEIVED_AT_WAREHOUSE",
    "IN_DISTRIBUTION", "IN_TRANSIT", "OUT_FOR_DELIVERY", "CUSTOMER_UNREACHABLE",
    "NO_ANSWER", "PHONE_OFF", "WRONG_ADDRESS", "RESCHEDULE_REQUESTED",
]);

const RETURNED_SHIPPING_STATUSES = new Set([
    "REFUSED", "DELIVERY_FAILED", "RETURNED_TO_AGENCY", "RETURN_TO_DEPOT",
    "RETURN_IN_PROGRESS", "RETURNED_TO_SENDER",
]);

function normalizedOrderStatus(order: FinanceOrder) {
    return normalizeStatusOrNull(order.status);
}

function normalizedShippingStatus(order: FinanceOrder) {
    return normalizeShippingStatus(order.shipping_status || order.delivery_status);
}

function orderDelivered(o: FinanceOrder) {
    return normalizedOrderStatus(o) === "delivered" || normalizedShippingStatus(o) === "DELIVERED";
}

function orderPending(o: FinanceOrder) {
    const orderStatus = normalizedOrderStatus(o);
    const shippingStatus = normalizedShippingStatus(o);
    return orderStatus === "confirmed" || orderStatus === "scheduled" || orderStatus === "shipped"
        || Boolean(shippingStatus && PENDING_SHIPPING_STATUSES.has(shippingStatus));
}

function orderCancelled(o: FinanceOrder) {
    return normalizedOrderStatus(o) === "cancelled" || normalizedShippingStatus(o) === "CANCELED";
}

function orderReturned(o: FinanceOrder) {
    const orderStatus = normalizedOrderStatus(o);
    const shippingStatus = normalizedShippingStatus(o);
    return orderStatus === "returned" || orderStatus === "refused"
        || Boolean(shippingStatus && RETURNED_SHIPPING_STATUSES.has(shippingStatus));
}

// ── Revenue Breakdown ──────────────────────────────────────────────────────────

export function computeRevenueBreakdown(
    orders: FinanceOrder[],
    deliveryRate?: number,
): RevenueBreakdown {
    const gross = orders.reduce((s, o) => s + (o.total ?? 0), 0);
    const delivered = orders
        .filter(orderDelivered)
        .reduce((s, o) => s + (o.total ?? 0), 0);
    const pending = orders
        .filter(orderPending)
        .reduce((s, o) => s + (o.total ?? 0), 0);
    const cancelled = orders
        .filter(orderCancelled)
        .reduce((s, o) => s + (o.total ?? 0), 0);
    const returned = orders
        .filter(orderReturned)
        .reduce((s, o) => s + (o.total ?? 0), 0);

    const effectiveDeliveryRate = deliveryRate ?? computeDeliveryRate(orders);
    const expected = pending * (effectiveDeliveryRate / 100);

    return { gross, delivered, pending, expected, cancelled, returned };
}

// ── Delivery Rate ──────────────────────────────────────────────────────────────

export function computeDeliveryRate(orders: FinanceOrder[]): number {
    const resolved = orders.filter(
        (o) => orderDelivered(o) || orderCancelled(o) || orderReturned(o),
    );
    if (resolved.length === 0) return 65; // default assumption
    return Math.round((resolved.filter(orderDelivered).length / resolved.length) * 100);
}

// ── Return Rate ────────────────────────────────────────────────────────────────

export function computeReturnRate(orders: FinanceOrder[]): number {
    const resolved = orders.filter(
        (o) => orderDelivered(o) || orderCancelled(o) || orderReturned(o),
    );
    if (resolved.length === 0) return 0;
    return Math.round((resolved.filter(orderReturned).length / resolved.length) * 100);
}

// ── Cash Flow ─────────────────────────────────────────────────────────────────

export function computeCashFlow(
    transactions: FinanceTransaction[],
    deliveredRevenue: number,
    days: number = 30,
): CashFlowSummary {
    const income = transactions
        .filter((t) => t.type === "income")
        .reduce((s, t) => s + t.amount, 0);
    const expenses = transactions
        .filter((t) => t.type === "expense")
        .reduce((s, t) => s + t.amount, 0);

    const totalIn = deliveredRevenue + income;
    const totalOut = expenses;
    const net = totalIn - totalOut;
    const dailyBurn = totalOut > 0 ? totalOut / days : 0;
    const cashRunwayDays = dailyBurn > 0 ? Math.floor(net / dailyBurn) : 999;

    return { totalIn, totalOut, net, dailyBurn, cashRunwayDays };
}

// ── Business Health Score ─────────────────────────────────────────────────────

export function computeHealthScore(
    orders: FinanceOrder[],
    transactions: FinanceTransaction[],
    payouts: ShippingPayout[],
): HealthScore {
    const deliveryRate = computeDeliveryRate(orders);
    const returnRate = computeReturnRate(orders);
    const revenue = orders.filter(orderDelivered).reduce((s, o) => s + (o.total ?? 0), 0);
    const expenses = transactions
        .filter((t) => t.type === "expense")
        .reduce((s, t) => s + t.amount, 0);
    const margin = revenue > 0 ? ((revenue - expenses) / revenue) * 100 : 0;
    const pendingPayouts = payouts
        .filter((p) => p.status === "pending")
        .reduce((s, p) => s + p.amount, 0);

    const factors: HealthFactor[] = [
        {
            name: "Delivery Rate",
            score: Math.round(Math.min(deliveryRate, 100) * 0.25),
            maxScore: 25,
            label: `${deliveryRate}%`,
        },
        {
            name: "Return Rate",
            score: Math.round(Math.max(0, (100 - returnRate * 3)) * 0.15),
            maxScore: 15,
            label: `${returnRate}%`,
        },
        {
            name: "Profit Margin",
            score: Math.round(Math.min(Math.max(margin, 0), 50) * 0.5),
            maxScore: 25,
            label: `${margin.toFixed(1)}%`,
        },
        {
            name: "Cash Flow",
            score: expenses > 0 && revenue > expenses ? 20 : revenue > 0 ? 10 : 0,
            maxScore: 20,
            label: revenue > expenses ? "Positive" : "Negative",
        },
        {
            name: "Pending Payouts",
            score: pendingPayouts > 500_000 ? 5 : pendingPayouts > 200_000 ? 10 : 15,
            maxScore: 15,
            label: `${pendingPayouts.toLocaleString()} MAD`,
        },
    ];

    const total = factors.reduce((s, f) => s + f.score, 0);
    const grade: HealthScore["grade"] =
        total >= 85 ? "A" : total >= 70 ? "B" : total >= 55 ? "C" : total >= 40 ? "D" : "F";

    return { score: total, grade, factors };
}

// ── Forecast Engine ───────────────────────────────────────────────────────────

export function computeForecast(
    orders: FinanceOrder[],
    transactions: FinanceTransaction[],
    daysAhead: number = 7,
): ForecastResult {
    const deliveryRate = computeDeliveryRate(orders);
    const returnRate = computeReturnRate(orders);
    const pendingOrders = orders.filter(orderPending);
    const pendingRevenue = pendingOrders.reduce((s, o) => s + (o.total ?? 0), 0);

    const avgOrderValue =
        orders.length > 0
            ? orders.reduce((s, o) => s + (o.total ?? 0), 0) / orders.length
            : 300;

    const dailyOrders = orders.length > 0 ? orders.length / 30 : 0;
    const projectedNewOrders = Math.round(dailyOrders * daysAhead);

    const expectedDeliveries =
        Math.round(pendingOrders.length * (deliveryRate / 100)) +
        Math.round(projectedNewOrders * (deliveryRate / 100));

    const expectedReturns = Math.round(
        pendingOrders.length * (returnRate / 100),
    );

    const expenses = transactions
        .filter((t) => t.type === "expense")
        .reduce((s, t) => s + t.amount, 0);
    
    // Calculate actual shipping cost per order using Smart Shipping Engine logic
    // For delivered orders, use city-based pricing; for others, use business delivery fee
    const deliveredOrders = orders.filter(orderDelivered);
    
    const totalActualShippingCost = deliveredOrders.reduce((sum: number, o: any) => {
        if (o.shipping_cost !== null) {
            return sum + Number(o.shipping_cost);
        }
        // Fallback to business fee if no shipping_cost
        return sum + 35; // Default fallback, should use actual business fee in production
    }, 0);
    
    const shippingCostPerOrder = deliveredOrders.length > 0 
        ? totalActualShippingCost / deliveredOrders.length 
        : (expenses > 0 ? expenses / Math.max(orders.length, 1) * 0.15 : 0);

    const expectedRevenue =
        pendingRevenue * (deliveryRate / 100) +
        projectedNewOrders * avgOrderValue * (deliveryRate / 100);

    const expectedProfit =
        expectedRevenue -
        expectedDeliveries * shippingCostPerOrder -
        (expenses / 30) * daysAhead;

    const expectedCash = Math.max(expectedRevenue, 0);

    // Confidence: drops when data is sparse
    const confidenceScore = Math.min(
        100,
        Math.max(
            30,
            orders.length > 200 ? 85 : orders.length > 50 ? 70 : orders.length > 10 ? 55 : 35,
        ),
    );

    return {
        expectedRevenue: Math.round(expectedRevenue),
        expectedProfit: Math.round(expectedProfit),
        expectedCash: Math.round(expectedCash),
        expectedDeliveries,
        expectedReturns,
        confidenceScore,
    };
}

// ── Reinvestment Center ──────────────────────────────────────────────────────

export function computeReinvestment(
    cashBalance: number,
    lockedInTransit: number,
    upcomingExpenses: number,
): ReinvestmentPlan {
    const safeReinvestment = Math.max(
        0,
        cashBalance - upcomingExpenses - cashBalance * 0.2, // keep 20% buffer
    );
    const recommendedAdsBudget = Math.round(safeReinvestment * 0.4);
    const recommendedStockBudget = Math.round(safeReinvestment * 0.45);

    return {
        availableCash: cashBalance,
        lockedCash: lockedInTransit,
        upcomingExpenses,
        safeReinvestment: Math.round(safeReinvestment),
        recommendedAdsBudget,
        recommendedStockBudget,
    };
}

// ── Money grouping by day/week/month ──────────────────────────────────────────

export function groupByPeriod(
    orders: FinanceOrder[],
    period: "day" | "week" | "month",
) {
    const map: Record<string, { revenue: number; count: number }> = {};

    for (const order of orders) {
        const d = new Date(order.created_at);
        let key: string;
        if (period === "day") {
            key = d.toLocaleDateString("en-US", { month: "short", day: "numeric" });
        } else if (period === "week") {
            const weekStart = new Date(d);
            weekStart.setDate(d.getDate() - d.getDay());
            key = weekStart.toLocaleDateString("en-US", { month: "short", day: "numeric" });
        } else {
            key = d.toLocaleDateString("en-US", { month: "short", year: "numeric" });
        }

        if (!map[key]) map[key] = { revenue: 0, count: 0 };
        map[key].revenue += order.total ?? 0;
        map[key].count += 1;
    }

    return Object.entries(map).map(([label, v]) => ({ label, ...v }));
}

// ── Smart Alerts ──────────────────────────────────────────────────────────────

export interface SmartAlert {
    type: "danger" | "warning" | "info";
    title: string;
    message: string;
}

export function computeSmartAlerts(
    orders: FinanceOrder[],
    transactions: FinanceTransaction[],
    payouts: ShippingPayout[],
    cashBalance: number,
): SmartAlert[] {
    const alerts: SmartAlert[] = [];
    const returnRate = computeReturnRate(orders);
    const deliveryRate = computeDeliveryRate(orders);
    const revenue = orders.filter(orderDelivered).reduce((s, o) => s + (o.total ?? 0), 0);
    const expenses = transactions
        .filter((t) => t.type === "expense")
        .reduce((s, t) => s + t.amount, 0);
    const adSpend = transactions
        .filter((t) => t.type === "expense" && t.category === "Marketing")
        .reduce((s, t) => s + t.amount, 0);
    const pendingPayouts = payouts
        .filter((p) => p.status === "pending")
        .reduce((s, p) => s + p.amount, 0);
    const dailyBurn = expenses / 30;

    if (returnRate > 35) {
        alerts.push({
            type: "danger",
            title: "High Return Rate",
            message: `Your return rate is ${returnRate}%. Review product quality and confirmation process.`,
        });
    }

    if (deliveryRate < 55) {
        alerts.push({
            type: "danger",
            title: "Low Delivery Rate",
            message: `Only ${deliveryRate}% of orders are being delivered successfully.`,
        });
    }

    if (revenue > 0 && adSpend / revenue > 0.5) {
        alerts.push({
            type: "warning",
            title: "High Ad Spend Ratio",
            message: `Ads are consuming more than 50% of delivered revenue. Consider optimizing campaigns.`,
        });
    }

    if (dailyBurn > 0 && cashBalance / dailyBurn < 10) {
        alerts.push({
            type: "danger",
            title: "Low Cash Runway",
            message: `Current cash covers only ${Math.floor(cashBalance / dailyBurn)} days of expenses.`,
        });
    }

    if (pendingPayouts > 300_000) {
        alerts.push({
            type: "warning",
            title: "Large Pending Payout",
            message: `${pendingPayouts.toLocaleString()} MAD is locked in pending shipping company payouts.`,
        });
    }

    if (alerts.length === 0) {
        alerts.push({
            type: "info",
            title: "Business is healthy",
            message: "No critical alerts. Keep monitoring key metrics daily.",
        });
    }

    return alerts;
}

// ── Daily AI Digest ───────────────────────────────────────────────────────────

export function generateAIDigest(
    orders: FinanceOrder[],
    transactions: FinanceTransaction[],
    payouts: ShippingPayout[],
    deliveryRate: number,
): string[] {
    const delivered = orders.filter(orderDelivered);
    const deliveredRevenue = delivered.reduce((s, o) => s + (o.total ?? 0), 0);
    const pending = orders.filter(orderPending);
    const pendingRevenue = pending.reduce((s, o) => s + (o.total ?? 0), 0);
    const expenses = transactions.filter((t) => t.type === "expense").reduce((s, t) => s + t.amount, 0);
    const adSpend = transactions
        .filter((t) => t.type === "expense" && t.category === "Marketing")
        .reduce((s, t) => s + t.amount, 0);
    const pendingPayouts = payouts
        .filter((p) => p.status === "pending")
        .reduce((s, p) => s + p.amount, 0);
    const expectedCash = Math.round(pendingRevenue * (deliveryRate / 100));

    const lines: string[] = [
        `Your business generated ${deliveredRevenue.toLocaleString()} MAD in confirmed revenue.`,
        `${pending.length} orders (${pendingRevenue.toLocaleString()} MAD) are currently in transit.`,
        `Based on your ${deliveryRate}% delivery rate, you can expect approximately ${expectedCash.toLocaleString()} MAD in incoming cash.`,
    ];

    if (pendingPayouts > 0) {
        lines.push(
            `Shipping companies still owe you ${pendingPayouts.toLocaleString()} MAD in pending payouts.`,
        );
    }

    if (adSpend > 0 && deliveredRevenue > 0) {
        const roas = deliveredRevenue / adSpend;
        lines.push(`Meta Ads recorded ${adSpend.toLocaleString()} MAD in spend with a ROAS of ${roas.toFixed(2)}x.`);
    }

    if (expenses > 0 && deliveredRevenue > 0) {
        const margin = ((deliveredRevenue - expenses) / deliveredRevenue) * 100;
        lines.push(`Estimated profit margin is ${margin.toFixed(1)}% after total expenses of ${expenses.toLocaleString()} MAD.`);
    }

    return lines;
}
