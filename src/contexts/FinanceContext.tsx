import { createContext, useContext, useEffect, useMemo, useState, ReactNode } from "react";
import { supabase } from "../lib/supabase";
import { useAuth } from "../hooks/useAuth";
import { useOrders } from "../hooks/useOrders";
import {
    computeRevenueBreakdown,
    computeDeliveryRate,
    computeReturnRate,
    computeCashFlow,
    computeHealthScore,
    computeForecast,
    computeReinvestment,
    computeSmartAlerts,
    generateAIDigest,
    FinanceTransaction,
    ShippingPayout,
    RevenueBreakdown,
    CashFlowSummary,
    HealthScore,
    ForecastResult,
    ReinvestmentPlan,
    SmartAlert,
} from "../lib/financeEngine";

interface FinanceContextValue {
    // Data
    transactions: FinanceTransaction[];
    payouts: ShippingPayout[];
    loading: boolean;

    // Computed
    revenue: RevenueBreakdown;
    cashFlow: CashFlowSummary;
    health: HealthScore;
    forecast: ForecastResult;
    reinvestment: ReinvestmentPlan;
    alerts: SmartAlert[];
    aiDigest: string[];

    // Rates
    deliveryRate: number;
    returnRate: number;

    // Shipping Costs
    totalShippingCost: number;
    averageShippingCost: number;

    // Actions
    addTransaction: (tx: Omit<FinanceTransaction, "id">) => Promise<void>;
    refetchTransactions: () => Promise<void>;
    refetchPayouts: () => Promise<void>;
    updatePayoutStatus: (id: string, status: "pending" | "received") => Promise<void>;
}

const FinanceContext = createContext<FinanceContextValue | null>(null);

export function useFinance() {
    const ctx = useContext(FinanceContext);
    if (!ctx) throw new Error("useFinance must be used within FinanceProvider");
    return ctx;
}

export function FinanceProvider({ children }: { children: ReactNode }) {
    const { workspace } = useAuth();
    const { orders } = useOrders();
    const [transactions, setTransactions] = useState<FinanceTransaction[]>([]);
    const [payouts, setPayouts] = useState<ShippingPayout[]>([]);
    const [loading, setLoading] = useState(true);

    const fetchTransactions = async () => {
        if (!workspace?.id) return;
        const { data, error } = await supabase
            .from("transactions")
            .select("*")
            .eq("workspace_id", workspace.id)
            .order("date", { ascending: false });

        if (!error && data) {
            setTransactions(
                data.map((d) => ({
                    type: d.type,
                    category: d.category,
                    amount: d.amount,
                    status: d.status,
                    date: d.date,
                })),
            );
        }
    };

    const fetchPayouts = async () => {
        if (!workspace?.id) return;
        const { data, error } = await supabase
            .from("shipping_payouts")
            .select("*")
            .eq("workspace_id", workspace.id)
            .order("due_date", { ascending: true });

        if (!error && data) {
            setPayouts(
                data.map((d) => ({
                    id: d.id,
                    amount: d.amount,
                    status: d.status,
                    shipping_company: d.shipping_company,
                    due_date: d.due_date,
                } as any)),
            );
        }
    };

    const load = async () => {
        setLoading(true);
        await Promise.all([fetchTransactions(), fetchPayouts()]);
        setLoading(false);
    };

    useEffect(() => {
        if (workspace?.id) load();
    }, [workspace?.id]);

    const ordersAsFinance = useMemo(
        () =>
            (orders ?? []).map((o) => ({
                total: o.total ?? 0,
                status: o.status ?? "",
                delivery_status: (o as any).delivery_status ?? null,
                created_at: o.created_at ?? new Date().toISOString(),
            })),
        [orders],
    );

    const deliveryRate = useMemo(
        () => computeDeliveryRate(ordersAsFinance),
        [ordersAsFinance],
    );
    const returnRate = useMemo(
        () => computeReturnRate(ordersAsFinance),
        [ordersAsFinance],
    );

    const revenue = useMemo(
        () => computeRevenueBreakdown(ordersAsFinance, deliveryRate),
        [ordersAsFinance, deliveryRate],
    );

    const cashFlow = useMemo(
        () => computeCashFlow(transactions, revenue.delivered),
        [transactions, revenue.delivered],
    );

    const health = useMemo(
        () => computeHealthScore(ordersAsFinance, transactions, payouts),
        [ordersAsFinance, transactions, payouts],
    );

    const forecast = useMemo(
        () => computeForecast(ordersAsFinance, transactions),
        [ordersAsFinance, transactions],
    );

    // Estimate upcoming expenses as next 7 days of burn rate
    const cashBalance = cashFlow.net;
    const upcomingExpenses = cashFlow.dailyBurn * 7;
    const reinvestment = useMemo(
        () =>
            computeReinvestment(
                Math.max(cashBalance, 0),
                revenue.pending,
                upcomingExpenses,
            ),
        [cashBalance, revenue.pending, upcomingExpenses],
    );

    const alerts = useMemo(
        () =>
            computeSmartAlerts(
                ordersAsFinance,
                transactions,
                payouts,
                Math.max(cashBalance, 0),
            ),
        [ordersAsFinance, transactions, payouts, cashBalance],
    );

    const aiDigest = useMemo(
        () => generateAIDigest(ordersAsFinance, transactions, payouts, deliveryRate),
        [ordersAsFinance, transactions, payouts, deliveryRate],
    );

    // Calculate shipping costs from orders
    const totalShippingCost = useMemo(() => {
        const deliveredOrders = (orders ?? []).filter((o: any) => {
            const status = o?.shipping_status || o?.delivery_status || o?.status;
            const normalizedStatus = status?.toLowerCase().trim();
            return normalizedStatus?.includes('delivered');
        });
        
        return deliveredOrders.reduce((sum: number, o: any) => {
            if (o.shipping_cost !== null) {
                return sum + Number(o.shipping_cost);
            }
            return sum;
        }, 0);
    }, [orders]);

    const averageShippingCost = useMemo(() => {
        const deliveredOrders = (orders ?? []).filter((o: any) => {
            const status = o?.shipping_status || o?.delivery_status || o?.status;
            const normalizedStatus = status?.toLowerCase().trim();
            return normalizedStatus?.includes('delivered');
        });
        
        if (deliveredOrders.length === 0) return 0;
        
        const totalWithShipping = deliveredOrders.filter((o: any) => o.shipping_cost !== null);
        if (totalWithShipping.length === 0) return 0;
        
        const total = totalWithShipping.reduce((sum: number, o: any) => sum + Number(o.shipping_cost || 0), 0);
        return total / totalWithShipping.length;
    }, [orders]);

    const addTransaction = async (tx: Omit<FinanceTransaction, "id">) => {
        if (!workspace?.id) return;
        const { error } = await supabase.from("transactions").insert({
            workspace_id: workspace.id,
            type: tx.type,
            category: tx.category,
            amount: tx.amount,
            status: tx.status,
            date: tx.date,
        });
        if (!error) await fetchTransactions();
    };

    const updatePayoutStatus = async (
        id: string,
        status: "pending" | "received",
    ) => {
        if (!workspace?.id) return;
        await supabase
            .from("shipping_payouts")
            .update({ status })
            .eq("id", id)
            .eq("workspace_id", workspace.id);
        await fetchPayouts();
    };

    const value: FinanceContextValue = {
        transactions,
        payouts,
        loading,
        revenue,
        cashFlow,
        health,
        forecast,
        reinvestment,
        alerts,
        aiDigest,
        deliveryRate,
        returnRate,
        totalShippingCost,
        averageShippingCost,
        addTransaction,
        refetchTransactions: fetchTransactions,
        refetchPayouts: fetchPayouts,
        updatePayoutStatus,
    };

    return (
        <FinanceContext.Provider value={value}>{children}</FinanceContext.Provider>
    );
}
