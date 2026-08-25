import { useEffect, useState, useMemo, useRef, useCallback } from "react";
import { supabase } from "../lib/supabase";
import { useAuth } from "./useAuth";
import {
  calculateDashboardMetrics,
  isDeliveredStatus,
} from "../lib/metrics";
import { useBusinessConfig } from "./useBusinessConfig";
import { getDemoDataStore, shouldUseDemoData, calculateDemoDashboardMetrics } from "../demo/index";

export interface DashboardData {
  loading: boolean;
  todaysOrders: number;
  confirmedCount: number;
  pending: number;
  cancelled: number;
  delivered: number;
  returned: number;
  revenue: number;
  adSpend: number;
  netProfit: number;
  cpa: number;
  deliveryRate: number;
  confirmationRate: number;
  profitMargin: number;
  roas: number;
  revenueVsAdSpend: { date: string; revenue: number; adSpend: number }[];
  topCities: { city: string; orders: number }[];
  topProducts: { name: string; count: number; revenue: number }[];
  topCampaigns: { name: string; revenue: number }[];
  activeCampaigns: number;
  orders: any[];
  adSpendRows: any[];
  productsList: any[];
  expenses: any[];
  metaCampaigns: any[];
  currency?: string | null;
}

const EMPTY: DashboardData = {
  loading: true,
  todaysOrders: 0,
  confirmedCount: 0,
  pending: 0,
  cancelled: 0,
  delivered: 0,
  returned: 0,
  revenue: 0,
  adSpend: 0,
  netProfit: 0,
  cpa: 0,
  deliveryRate: 0,
  confirmationRate: 0,
  profitMargin: 0,
  roas: 0,
  revenueVsAdSpend: [],
  topCities: [],
  topProducts: [],
  topCampaigns: [],
  activeCampaigns: 0,
  orders: [],
  adSpendRows: [],
  productsList: [],
  expenses: [],
  metaCampaigns: [],
  currency: null,
};

function formatDateLocal(d: Date): string {
  const year = d.getFullYear();
  const month = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

function formatDateUTC(d: Date) {
  const y = d.getUTCFullYear();
  const m = String(d.getUTCMonth() + 1).padStart(2, "0");
  const day = String(d.getUTCDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}

/** Hoisted outside component — no GC pressure per render */
function parseDateFlexible(raw: any): Date | null {
  if (!raw && raw !== 0) return null;
  if (raw instanceof Date) return isNaN(raw.getTime()) ? null : raw;
  const s = String(raw).trim();
  const isoMatch = s.match(/^\d{4}-\d{2}-\d{2}(?:[T\s].*)?$/);
  if (isoMatch) {
    const parts = s.split(/\s|T/)[0].split("-");
    const y = Number(parts[0]);
    const m = Number(parts[1]) - 1;
    const d = Number(parts[2]);
    const timePart = s.split(/\s|T/)[1] || "";
    if (timePart) {
      const date = new Date(s);
      if (!isNaN(date.getTime())) return date;
    }
    return new Date(Date.UTC(y, m, d));
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
    const d = new Date(num);
    return isNaN(d.getTime()) ? null : d;
  }
  const d = new Date(s);
  return isNaN(d.getTime()) ? null : d;
}

export function useDashboardData(startDate?: Date, endDate?: Date): DashboardData {
  const { workspace } = useAuth();
  const { config } = useBusinessConfig();
  const [data, setData] = useState<DashboardData>(EMPTY);
  const debounceTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const defaultDates = useMemo(() => {
    const end = new Date();
    end.setHours(23, 59, 59, 999);
    const start = new Date();
    start.setHours(0, 0, 0, 0);
    start.setDate(start.getDate() - 30);
    return { start, end };
  }, []);

  const actualStart = startDate || defaultDates.start;
  const actualEnd = endDate || defaultDates.end;

  const load = useCallback(async (wid: string, cancelled: { current: boolean }) => {
    console.log("[Dashboard] load called with workspace:", wid);
    setData((d) => ({ ...d, loading: true }));

    // Use demo data if in demo mode
    if (shouldUseDemoData()) {
      const demoStore = getDemoDataStore();
      const demoOrders = demoStore.getOrders();
      const demoProducts = demoStore.getProducts();
      const demoCampaigns = demoStore.getCampaigns();
      const demoExpenses = demoStore.getExpenses();
      const demoAdSpend = demoStore.getAdSpend();

      const demoData = calculateDemoDashboardMetrics(
        demoOrders,
        demoProducts,
        demoCampaigns,
        demoExpenses,
        demoAdSpend,
        actualStart,
        actualEnd
      );

      setData({
        ...demoData,
        loading: false,
      });
      return;
    }

    const startDateStr = formatDateLocal(actualStart);
    const endDateStr = formatDateLocal(actualEnd);

    const startInclusive = new Date(Date.UTC(actualStart.getFullYear(), actualStart.getMonth(), actualStart.getDate(), 0, 0, 0, 0));
    const endInclusive = new Date(Date.UTC(actualEnd.getFullYear(), actualEnd.getMonth(), actualEnd.getDate(), 23, 59, 59, 999));

    const startParamDb = startInclusive.toISOString();
    const endParamDb = endInclusive.toISOString();

    const startOfToday = new Date();
    startOfToday.setHours(0, 0, 0, 0);

    // ── PARALLEL: all initial queries at once ──
    const [ordersRes, expensesRes, adSpendRes, productsRes, metaCampaignsRes] = await Promise.all([
      supabase
        .from("orders")
        .select('"Order ID", order_number, customer_id, city, city_name, address, total, status, delivery_status, shipping_status, phone, sku, product_variant, tracking_number, campaign_id, created_at, order_received_at, ozon_city_id, source')
        .eq("workspace_id", wid)
        .gte("created_at", startParamDb)
        .lte("created_at", endParamDb),
      supabase
        .from("expenses")
        .select("amount, date")
        .eq("workspace_id", wid)
        .gte("date", startDateStr)
        .lte("date", endDateStr),
      supabase
        .from("ad_spend")
        .select("amount, date, campaign_id")
        .eq("workspace_id", wid)
        .gte("date", startDateStr)
        .lte("date", endDateStr),
      supabase
        .from("products")
        .select("id, sku, cost, name, stock, low_stock_threshold")
        .eq("workspace_id", wid)
        .order("name")
        .limit(100), // ← Pagination: charge seulement 100 produits pour l'affichage initial
      supabase
        .from("meta_campaigns")
        .select("id, campaign_name, status, spend, results, cost_per_result")
        .eq("workspace_id", wid)
        .eq("status", "ACTIVE") // ← Filtre: seulement les campagnes actives
        .order("campaign_name")
        .limit(50), // ← Pagination: charge seulement 50 campagnes actives
    ]);

    console.log("[Dashboard] Orders query result:", ordersRes);
    console.log("[Dashboard] Date range:", { startParamDb, endParamDb, startDateStr, endDateStr });
    console.log("[Dashboard] Workspace ID:", wid);

    if (cancelled.current) return;

    let orders = ordersRes.data ?? [];
    console.log("[Dashboard] Orders count:", orders.length);

    if (ordersRes.error) {
      console.error("[Dashboard] Orders query error:", ordersRes.error);
      // Don't throw - allow dashboard to show what data we can get
    }

    const adSpendRows = adSpendRes.data ?? [];
    const productsList = productsRes.data ?? [];
    const expensesData = expensesRes.data ?? [];
    const activeMetaCampaigns = metaCampaignsRes.data ?? [];
    const activeCampaigns = activeMetaCampaigns.filter((c: any) => String(c.status || "").toUpperCase() === "ACTIVE").length;

    console.log("[Dashboard] Products count:", productsList.length);
    console.log("[Dashboard] Expenses count:", expensesData.length);
    console.log("[Dashboard] Ad spend rows:", adSpendRows.length);
    console.log("[Dashboard] Meta campaigns:", activeMetaCampaigns.length);

    if (productsRes.error) console.error("[Dashboard] Products error:", productsRes.error);
    if (expensesRes.error) console.error("[Dashboard] Expenses error:", expensesRes.error);
    if (adSpendRes.error) console.error("[Dashboard] Ad spend error:", adSpendRes.error);
    if (metaCampaignsRes.error) console.error("[Dashboard] Meta campaigns error:", metaCampaignsRes.error);

    if ((ordersRes as any)?.error) {
      console.log("[Dashboard] Attempting fallback orders query...");
      try {
        const fallback = await supabase
          .from("orders")
          .select('"Order ID", order_number, customer_id, city, city_name, address, total, status, delivery_status, shipping_status, phone, sku, product_variant, tracking_number, campaign_id, created_at, order_received_at, ozon_city_id, source')
          .eq("workspace_id", wid)
          .limit(5000);
        if (!(fallback as any)?.error) {
          orders = (fallback as any).data ?? [];
          console.log("[Dashboard] Fallback orders count:", orders.length);
        } else {
          console.error("[Dashboard] Fallback orders query also failed:", (fallback as any)?.error);
        }
      } catch (e) {
        console.error("[Dashboard] Fallback orders fetch exception:", e);
      }
    }

    const orderIds = orders.map((o: any) => o.id || o["Order ID"]).filter(Boolean);
    const campaignIds = Array.from(new Set(orders.map((o: any) => o.campaign_id).filter(Boolean)));

    // ── PARALLEL: order_items + campaigns ──
    const [orderItemsRes, campaignsRes] = await Promise.all([
      orderIds.length > 0
        ? supabase
          .from("order_items")
          .select("order_id, product_id, quantity, unit_price")
          .eq("workspace_id", wid)
          .in("order_id", orderIds)
        : { data: [], error: null },
      campaignIds.length > 0
        ? supabase
          .from("meta_campaigns")
          .select("id, campaign_name")
          .eq("workspace_id", wid)
          .in("id", campaignIds)
        : { data: [], error: null },
    ]);

    const orderItems = (orderItemsRes as any).data ?? [];
    const campaigns = (campaignsRes as any).data ?? [];

    const itemsByOrder = new Map<string, any[]>();
    orderItems.forEach((it: any) => {
      if (!itemsByOrder.has(it.order_id)) itemsByOrder.set(it.order_id, []);
      itemsByOrder.get(it.order_id)!.push(it);
    });

    const productById = new Map<string, any>();
    productsList.forEach((p: any) => productById.set(p.id, p));

    const campaignById = new Map<string, any>();
    campaigns.forEach((c: any) => campaignById.set(c.id, c));

    orders.forEach((o: any) => {
      const orderIdKey = o.id || o["Order ID"];
      const items = itemsByOrder.get(orderIdKey) ?? [];
      o.order_items = items.map((it: any) => {
        const prod = productById.get(it.product_id);
        return {
          quantity: Number(it.quantity || 0),
          unit_price: Number(it.unit_price || 0),
          products: prod ? { name: prod.name, cost: Number(prod.cost || 0) } : null,
        };
      });
      const camp = campaignById.get(o.campaign_id);
      if (camp) o.campaigns = { name: camp.campaign_name };
    });

    const skuToCostMap = new Map<string, number>(
      productsList.map((p: any) => [p.sku, Number(p.cost || 0)])
    );

    let metaTotalSpend = 0;
    let metaTotalResults = 0;
    (metaCampaignsRes.data ?? []).forEach((c: any) => {
      metaTotalSpend += Number(c.spend || 0);
      metaTotalResults += Number(c.results || 0);
    });

    const rawAdSpend =
      metaTotalSpend > 0
        ? metaTotalSpend
        : adSpendRows.reduce((sum: number, a: any) => sum + Number(a.amount || 0), 0);
    const adSpend = Number(rawAdSpend || 0);
    // IMPORTANT: adSpend is used directly — NO ×10 conversion
    const metaCpa = metaTotalResults > 0 ? adSpend / metaTotalResults : 0;


    const parsedOrders = orders.map((o: any) => ({ ...o, id: o.id || o["Order ID"] })).filter((o: any) => {
      // Use canonical business timestamp: order_received_at first, then fallback to created_at
      const raw = o.order_received_at || o.created_at;
      const d = parseDateFlexible(raw);
      if (!d) return false;
      return d >= startInclusive && d <= endInclusive;
    });

    console.log("[Dashboard] Raw orders count:", orders.length);
    console.log("[Dashboard] Parsed orders count (after date filter):", parsedOrders.length);

    let metrics;
    try {
      metrics = calculateDashboardMetrics(
        parsedOrders,
        adSpend,
        skuToCostMap,
        config,
        startInclusive,
        endInclusive
      );
      console.log("[Dashboard] Metrics calculated:", metrics);
    } catch (err) {
      console.error("[Dashboard] Metrics calculation error:", err);
      metrics = {
        revenue: 0,
        deliveredCount: 0,
        confirmedCount: 0,
        pendingCount: 0,
        cancelledCount: 0,
        returnedCount: 0,
        totalProductCost: 0,
        netProfit: 0,
        profitMargin: 0,
        deliveryRate: 0,
        confirmationRate: 0,
        cpa: 0,
      };
    }

    const todaysOrders = orders.filter((o: any) => {
      try {
        const d = new Date(o.order_received_at || o.created_at);
        if (isNaN(d.getTime())) return false;
        return d >= startOfToday;
      } catch {
        return false;
      }
    }).length;

    const byDate = new Map<string, { revenue: number; adSpend: number }>();
    const tempDate = new Date(actualStart);

    let iterations = 0;
    while (tempDate <= actualEnd && iterations < 366) {
      const key = formatDateUTC(tempDate);
      byDate.set(key, { revenue: 0, adSpend: 0 });
      tempDate.setDate(tempDate.getDate() + 1);
      iterations++;
    }

    orders
      .filter((o: any) => isDeliveredStatus(o.status))
      .forEach((o: any) => {
        const raw = o.order_received_at || o.created_at;
        const d = parseDateFlexible(raw);
        if (!d) return;
        const key = formatDateUTC(d);
        const bucket = byDate.get(key);
        if (bucket) bucket.revenue += Number(o.total || 0);
      });

    adSpendRows.forEach((a: any) => {
      const raw = a.date;
      if (!raw) return;
      let key = raw;
      try {
        const d = new Date(raw);
        if (!isNaN(d.getTime())) key = formatDateUTC(d);
        else key = String(raw).slice(0, 10);
      } catch {
        key = String(raw).slice(0, 10);
      }
      const bucket = byDate.get(key);
      if (bucket) bucket.adSpend += Number(a.amount || 0);
    });

    const revenueVsAdSpend = Array.from(byDate.entries()).map(([date, v]) => ({
      date: date.slice(5),
      ...v,
    }));

    const cityMap = new Map<string, number>();
    orders.forEach((o: any) => {
      if (!o.city) return;
      cityMap.set(o.city, (cityMap.get(o.city) ?? 0) + 1);
    });
    const topCities = Array.from(cityMap.entries())
      .map(([city, count]) => ({ city, orders: count }))
      .sort((a, b) => b.orders - a.orders)
      .slice(0, 5);

    const productMap = new Map<string, { count: number; revenue: number }>();
    orders.forEach((o: any) => {
      const items = o.order_items ?? [];
      if (items.length > 0) {
        items.forEach((it: any) => {
          const name = it.products?.name || o.product_variant || o.sku || "Unknown";
          const quantity = Number(it.quantity || 1);
          const revenue = Number(it.unit_price || 0) * quantity;
          const existing = productMap.get(name) ?? { count: 0, revenue: 0 };
          productMap.set(name, {
            count: existing.count + quantity,
            revenue: existing.revenue + revenue,
          });
        });
      } else {
        const name = o.product_variant || o.sku || "Unknown";
        const existing = productMap.get(name) ?? { count: 0, revenue: 0 };
        productMap.set(name, {
          count: existing.count + 1,
          revenue: existing.revenue + Number(o.total || 0),
        });
      }
    });
    const topProducts = Array.from(productMap.entries())
      .map(([name, stats]) => ({ name, count: stats.count, revenue: stats.revenue }))
      .sort((a, b) => b.count - a.count)
      .slice(0, 5);

    const topCampaigns = Array.from(activeMetaCampaigns)
      .map((c: any) => ({ name: c.campaign_name ?? "Unknown", revenue: Number(c.spend || 0) }))
      .sort((a, b) => b.revenue - a.revenue)
      .slice(0, 5);

    const calculatedFinalAdSpend = adSpend;
    const roas = calculatedFinalAdSpend > 0 ? metrics.revenue / calculatedFinalAdSpend : 0;


    if (!cancelled.current) {
      setData({
        loading: false,
        todaysOrders,
        confirmedCount: metrics.confirmedCount,
        pending: metrics.pendingCount,
        cancelled: metrics.cancelledCount,
        delivered: metrics.deliveredCount,
        returned: metrics.returnedCount,
        revenue: metrics.revenue,
        adSpend,
        netProfit: metrics.netProfit,
        cpa: metaTotalResults > 0 ? metaCpa : metrics.cpa,
        deliveryRate: metrics.deliveryRate,
        confirmationRate: metrics.confirmationRate,
        profitMargin: metrics.profitMargin,
        roas,
        revenueVsAdSpend,
        topCities,
        topProducts,
        topCampaigns,
        activeCampaigns,
        orders,
        adSpendRows,
        productsList,
        expenses: expensesData,
        metaCampaigns: activeMetaCampaigns,
      });
    }
  }, [actualStart, actualEnd, config]);

  useEffect(() => {
    if (!workspace?.id) {
      console.log("[Dashboard] No workspace ID, skipping load");
      setData({ ...EMPTY, loading: false });
      return;
    }

    const wid = workspace.id;
    console.log("[Dashboard] Workspace ID resolved:", wid);
    const cancelledRef = { current: false };

    load(wid, cancelledRef).catch((err) => {
      console.error("Failed to load dashboard data", err);
      if (!cancelledRef.current) setData((d) => ({ ...d, loading: false }));
    });

    // ── Debounced RT reload (1 second) — prevents cascade on rapid events ──
    const debouncedLoad = () => {
      if (debounceTimerRef.current) clearTimeout(debounceTimerRef.current);
      debounceTimerRef.current = setTimeout(() => {
        load(wid, cancelledRef).catch(console.error);
      }, 1000);
    };

    // ── Single RT channel for all dashboard tables ──
    const channel = supabase.channel(`dashboard-rt-${wid}`);
    try {
      channel.on(
        "postgres_changes",
        { event: "*", schema: "public", table: "orders", filter: `workspace_id=eq.${wid}` },
        debouncedLoad
      );
      channel.on(
        "postgres_changes",
        { event: "*", schema: "public", table: "ad_spend", filter: `workspace_id=eq.${wid}` },
        debouncedLoad
      );
      channel.on(
        "postgres_changes",
        { event: "*", schema: "public", table: "expenses", filter: `workspace_id=eq.${wid}` },
        debouncedLoad
      );
      channel.on(
        "postgres_changes",
        { event: "*", schema: "public", table: "meta_campaigns", filter: `workspace_id=eq.${wid}` },
        debouncedLoad
      );

      void channel.subscribe();
    } catch (error) {
      console.error("[useDashboardData] Realtime subscription failed:", error);
    }

    const handleSyncReload = () => debouncedLoad();
    window.addEventListener("trigger-order-reload", handleSyncReload);

    const metaHandler = (ev: Event) => {
      const detail = (ev as CustomEvent)?.detail;
      if (detail && detail.currency) {
        setData((d) => ({ ...d, currency: String(detail.currency) }));
      }
      handleSyncReload();
    };
    window.addEventListener("meta-sync-complete", metaHandler as EventListener);

    return () => {
      cancelledRef.current = true;
      if (debounceTimerRef.current) clearTimeout(debounceTimerRef.current);
      void channel.unsubscribe();
      supabase.removeChannel(channel);
      window.removeEventListener("trigger-order-reload", handleSyncReload);
      window.removeEventListener("meta-sync-complete", metaHandler as EventListener);
    };
  }, [workspace?.id, load]);

  return data;
}
