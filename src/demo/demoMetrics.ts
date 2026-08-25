import type { Order, Product, Campaign, Expense, AdSpend } from "../lib/types";
import { isDeliveredStatus } from "../lib/metrics";

export interface DemoDashboardData {
  todaysOrders: number;
  confirmedCount: number;
  pending: number;
  cancelled: number;
  delivered: number;
  returned: number;
  refused: number;
  noAnswer: number;
  shipped: number;
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
  orders: Order[];
  adSpendRows: AdSpend[];
  productsList: Product[];
  expenses: Expense[];
  metaCampaigns: Campaign[];
  currency?: string | null;
}

function formatDateLocal(d: Date): string {
  const year = d.getFullYear();
  const month = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

export function calculateDemoDashboardMetrics(
  orders: Order[],
  products: Product[],
  campaigns: Campaign[],
  expenses: Expense[],
  adSpend: AdSpend[],
  startDate?: Date,
  endDate?: Date
): DemoDashboardData {
  // Filter orders by date range if provided
  let filteredOrders = orders;
  if (startDate || endDate) {
    filteredOrders = orders.filter((o) => {
      const orderDate = new Date(o.created_at);
      if (startDate && orderDate < startDate) return false;
      if (endDate && orderDate > endDate) return false;
      return true;
    });
  }

  // Calculate basic counts
  const todaysOrders = orders.filter((o) => {
    const today = new Date();
    const orderDate = new Date(o.created_at);
    return (
      orderDate.getDate() === today.getDate() &&
      orderDate.getMonth() === today.getMonth() &&
      orderDate.getFullYear() === today.getFullYear()
    );
  }).length;

  const confirmedCount = filteredOrders.filter((o) => o.status === "confirmed").length;
  const pending = filteredOrders.filter((o) => o.status === "pending").length;
  const cancelled = filteredOrders.filter((o) => o.status === "cancelled").length;
  const delivered = filteredOrders.filter((o) => isDeliveredStatus(o.status)).length;
  const returned = filteredOrders.filter((o) => o.status === "returned").length;
  const refused = filteredOrders.filter((o) => o.status === "refused").length;
  const noAnswer = filteredOrders.filter((o) => o.status === "no_answer").length;
  const shipped = filteredOrders.filter((o) => o.status === "shipped").length;

  // Calculate revenue
  const revenue = filteredOrders.reduce((sum, o) => sum + (o.total || 0), 0);

  // Calculate ad spend
  let filteredAdSpend = adSpend;
  if (startDate || endDate) {
    filteredAdSpend = adSpend.filter((a) => {
      const spendDate = new Date(a.date);
      if (startDate && spendDate < startDate) return false;
      if (endDate && spendDate > endDate) return false;
      return true;
    });
  }
  const adSpendTotal = filteredAdSpend.reduce((sum, a) => sum + (a.amount || 0), 0);

  // Calculate expenses
  let filteredExpenses = expenses;
  if (startDate || endDate) {
    filteredExpenses = expenses.filter((e) => {
      const expenseDate = new Date(e.date);
      if (startDate && expenseDate < startDate) return false;
      if (endDate && expenseDate > endDate) return false;
      return true;
    });
  }
  const expensesTotal = filteredExpenses.reduce((sum, e) => sum + (e.amount || 0), 0);

  // Calculate product costs
  const productCosts = filteredOrders.reduce((sum, o) => {
    const product = products.find((p) => p.sku === o.sku);
    return sum + (product?.cost || 0);
  }, 0);

  // Calculate shipping costs (using workspace defaults)
  const shippingCosts = filteredOrders.reduce((sum, o) => {
    if (isDeliveredStatus(o.status) || o.status === "shipped") {
      return sum + 25; // Demo shipping fee
    }
    return sum;
  }, 0);

  // Calculate net profit
  const netProfit = revenue - adSpendTotal - expensesTotal - productCosts - shippingCosts;

  // Calculate CPA
  const totalOrders = filteredOrders.length;
  const cpa = totalOrders > 0 ? adSpendTotal / totalOrders : 0;

  // Calculate delivery rate
  const deliveredAndRefused = delivered + refused;
  const totalDeliverable = filteredOrders.filter(
    (o) => ["confirmed", "shipped", "delivered", "refused", "returned"].includes(o.status)
  ).length;
  const deliveryRate = totalDeliverable > 0 ? (deliveredAndRefused / totalDeliverable) * 100 : 0;

  // Calculate confirmation rate
  const totalConfirmable = filteredOrders.filter(
    (o) => ["pending", "confirmed", "cancelled", "no_answer", "refused"].includes(o.status)
  ).length;
  const confirmationRate = totalConfirmable > 0 ? (confirmedCount / totalConfirmable) * 100 : 0;

  // Calculate profit margin
  const profitMargin = revenue > 0 ? (netProfit / revenue) * 100 : 0;

  // Calculate ROAS
  const roas = adSpendTotal > 0 ? revenue / adSpendTotal : 0;

  // Generate revenue vs ad spend by date
  const dateMap = new Map<string, { revenue: number; adSpend: number }>();
  
  filteredOrders.forEach((o) => {
    const date = formatDateLocal(new Date(o.created_at));
    if (!dateMap.has(date)) {
      dateMap.set(date, { revenue: 0, adSpend: 0 });
    }
    dateMap.get(date)!.revenue += o.total || 0;
  });

  filteredAdSpend.forEach((a) => {
    const date = formatDateLocal(new Date(a.date));
    if (!dateMap.has(date)) {
      dateMap.set(date, { revenue: 0, adSpend: 0 });
    }
    dateMap.get(date)!.adSpend += a.amount || 0;
  });

  const revenueVsAdSpend = Array.from(dateMap.entries())
    .map(([date, data]) => ({ date, revenue: data.revenue, adSpend: data.adSpend }))
    .sort((a, b) => a.date.localeCompare(b.date));

  // Calculate top cities
  const cityMap = new Map<string, number>();
  filteredOrders.forEach((o) => {
    if (o.city) {
      cityMap.set(o.city, (cityMap.get(o.city) || 0) + 1);
    }
  });
  const topCities = Array.from(cityMap.entries())
    .map(([city, orders]) => ({ city, orders }))
    .sort((a, b) => b.orders - a.orders)
    .slice(0, 10);

  // Calculate top products
  const productMap = new Map<string, { count: number; revenue: number }>();
  filteredOrders.forEach((o) => {
    const product = products.find((p) => p.sku === o.sku);
    if (product) {
      const existing = productMap.get(product.name) || { count: 0, revenue: 0 };
      productMap.set(product.name, {
        count: existing.count + 1,
        revenue: existing.revenue + o.total,
      });
    }
  });
  const topProducts = Array.from(productMap.entries())
    .map(([name, data]) => ({ name, count: data.count, revenue: data.revenue }))
    .sort((a, b) => b.count - a.count)
    .slice(0, 10);

  // Calculate top campaigns
  const campaignMap = new Map<string, number>();
  filteredOrders.forEach((o) => {
    if (o.campaign_id) {
      const campaign = campaigns.find((c) => c.id === o.campaign_id);
      if (campaign) {
        campaignMap.set(campaign.name, (campaignMap.get(campaign.name) || 0) + o.total);
      }
    }
  });
  const topCampaigns = Array.from(campaignMap.entries())
    .map(([name, revenue]) => ({ name, revenue }))
    .sort((a, b) => b.revenue - a.revenue)
    .slice(0, 10);

  // Active campaigns (all demo campaigns are "active")
  const activeCampaigns = campaigns.length;

  return {
    todaysOrders,
    confirmedCount,
    pending,
    cancelled,
    delivered,
    returned,
    refused,
    noAnswer,
    shipped,
    revenue,
    adSpend: adSpendTotal,
    netProfit,
    cpa,
    deliveryRate,
    confirmationRate,
    profitMargin,
    roas,
    revenueVsAdSpend,
    topCities,
    topProducts,
    topCampaigns,
    activeCampaigns,
    orders: filteredOrders,
    adSpendRows: filteredAdSpend,
    productsList: products,
    expenses: filteredExpenses,
    metaCampaigns: campaigns,
    currency: "MAD",
  };
}
