// ═══════════════════════════════════════════════════════════════════════════
// Shared Profit Engine — metrics.ts
// Single source of truth for all profit/cost calculations.
// Used by: Dashboard, DashboardAnalytics
// ═══════════════════════════════════════════════════════════════════════════

import { normalizeStatus } from '../utils/status';

// ─── Types ────────────────────────────────────────────────────────────────────

export type FeeTrigger = 'entered' | 'confirmed' | 'delivered';

/** Meta stores spend in account currency units; no legacy multiplier is applied. */
export function convertAdSpend(value: number): number {
  return Number.isFinite(value) ? value : 0;
}

export type BusinessCostModel = 'seller' | 'affiliate';

export interface CostRule {
  id: string;
  name: string;
  amount: number;
  trigger: FeeTrigger;
  enabled: boolean;
}

export interface OrderItem {
  quantity: number;
  unit_price: number;
  sku?: string | null;
  products?: {
    name: string;
    cost: number;
  } | null;
}

export interface OrderForMetrics {
  id: string;
  total: number;
  status: string;
  delivery_status?: string | null;
  shipping_status?: string | null;
  city: string | null;
  created_at: string;
  sku?: string | null;
  shipping_cost?: number | null;
  order_items?: OrderItem[] | null;
}

/** Seller mode input */
export interface SellerProfitInput {
  mode: 'seller';
  orders: OrderForMetrics[];
  adSpend: number;
  skuCostMap: Map<string, number>;      // sku → unit cost from products table
  costRules: CostRule[];                // workspace_cost_rules
}

/** Affiliate mode input */
export interface AffiliateProfitInput {
  mode: 'affiliate';
  orders: OrderForMetrics[];
  adSpend: number;
  skuCostMap: Map<string, number>;      // Uses the same inventory source as seller mode
  costRules: CostRule[];                // workspace_cost_rules
}

export type ProfitEngineInput = SellerProfitInput | AffiliateProfitInput;

export interface FeeBreakdownItem {
  name: string;
  amount: number;       // total
  trigger: FeeTrigger;
  unitAmount: number;
  orderCount: number;
}

export interface MissingCostWarning {
  type: 'missing_product_cost' | 'missing_shipping_cost';
  message: string;
  count: number;
}

export interface ProfitResult {
  revenue: number;
  productCost: number;
  shippingCost: number;
  operationalFees: number;
  feeBreakdown: FeeBreakdownItem[];
  adSpend: number;
  totalCosts: number;
  netProfit: number;
  profitMargin: number;
  deliveryRate: number;
  confirmationRate: number;
  cpa: number;
  roas: number;
  // Order counts
  totalOrders: number;
  deliveredCount: number;
  confirmedCount: number;
  pendingCount: number;
  cancelledCount: number;
  returnedCount: number;
  shippedCount: number;
  // Warnings
  missingCostWarnings: MissingCostWarning[];
}

// ─── Status Helpers ───────────────────────────────────────────────────────────

export const isDeliveredStatus = (status: string): boolean =>
  normalizeStatus(status) === 'DELIVERED';

export const isConfirmedStatus = (status: string): boolean => {
  const norm = normalizeStatus(status);
  return norm === 'CONFIRMED' || norm === 'OUT_FOR_DELIVERY' || norm === 'DELIVERED' || norm === 'COMING_BACK';
};

export const isPendingStatus = (status: string): boolean =>
  normalizeStatus(status) === 'NEW';

export const isCancelledStatus = (status: string): boolean =>
  normalizeStatus(status) === 'COMING_BACK';

export const isReturnedStatus = (status: string): boolean =>
  normalizeStatus(status) === 'COMING_BACK';

/** Resolve the canonical status for an order (prefers shipping > delivery > status) */
function resolveOrderStatus(o: OrderForMetrics): string {
  return o.shipping_status || o.delivery_status || o.status || '';
}

// ─── Core Profit Engine ───────────────────────────────────────────────────────

export function calculateWorkspaceProfit(input: ProfitEngineInput): ProfitResult {
  const { orders, adSpend, costRules } = input;

  // ── Count orders by status ──
  let deliveredCount = 0;
  let confirmedCount = 0;
  let pendingCount = 0;
  let cancelledCount = 0;
  let returnedCount = 0;
  let shippedCount = 0;

  orders.forEach((o) => {
    const status = resolveOrderStatus(o);
    if (isDeliveredStatus(status)) deliveredCount++;
    if (isConfirmedStatus(status)) confirmedCount++;
    if (isPendingStatus(status)) pendingCount++;
    if (isCancelledStatus(status)) cancelledCount++;
    if (isReturnedStatus(status)) returnedCount++;
  });

  const totalOrders = orders.length;
  const missingCostWarnings: MissingCostWarning[] = [];

  // ── Revenue (delivered orders) ──
  const revenue = orders
    .filter((o) => isDeliveredStatus(resolveOrderStatus(o)))
    .reduce((sum, o) => sum + Number(o.total || 0), 0);

  // ── Product Cost ──
  // Both Seller and Affiliate modes now strictly use the `skuCostMap` from Products & Inventory.
  let productCost = 0;
  let missingProductCostCount = 0;

  const { skuCostMap } = input;
  orders.forEach((o) => {
    if (!isDeliveredStatus(resolveOrderStatus(o))) return;

    let orderCost = 0;
    let resolved = false;

    if (o.order_items && o.order_items.length > 0) {
      o.order_items.forEach((item) => {
        // Priority: item.products.cost → skuCostMap[item.sku] → skuCostMap[order.sku]
        const itemSku = item.sku || o.sku || null;
        const cost =
          item.products?.cost != null
            ? Number(item.products.cost)
            : itemSku
              ? (skuCostMap.get(itemSku) ?? null)
              : null;

        if (cost != null) {
          orderCost += Number(item.quantity || 1) * cost;
          resolved = true;
        } else {
          orderCost += 0; // zero but will warn
        }
      });
    } else if (o.sku) {
      const cost = skuCostMap.get(o.sku);
      if (cost != null) {
        orderCost += cost;
        resolved = true;
      }
    }

    if (!resolved) missingProductCostCount++;
    productCost += orderCost;
  });

  if (missingProductCostCount > 0) {
    missingCostWarnings.push({
      type: 'missing_product_cost',
      message: `${missingProductCostCount} delivered order${missingProductCostCount > 1 ? 's' : ''} have SKUs without a configured product cost.`,
      count: missingProductCostCount,
    });
  }

  // ── Shipping Cost ──
  let shippingCost = 0;
  let missingShippingCostCount = 0;

  if (input.mode === 'seller') {
    // Use actual shipping_cost per order from provider
    orders.forEach((o) => {
      if (!isDeliveredStatus(resolveOrderStatus(o))) return;

      if (o.shipping_cost != null && o.shipping_cost > 0) {
        shippingCost += Number(o.shipping_cost);
      } else {
        missingShippingCostCount++;
      }
    });

    if (missingShippingCostCount > 0) {
      missingCostWarnings.push({
        type: 'missing_shipping_cost',
        message: `${missingShippingCostCount} delivered order${missingShippingCostCount > 1 ? 's' : ''} could not resolve shipping cost from the provider. Configure Provider City pricing.`,
        count: missingShippingCostCount,
      });
    }
  } else {
    // Affiliate mode shipping costs are handled entirely through costRules (Service Fees)
    shippingCost = 0;
  }

  // ── Operational Fees (cost rules) ──
  const feeBreakdown: FeeBreakdownItem[] = [];
  let operationalFees = 0;

  costRules
    .filter((r) => r.enabled)
    .forEach((rule) => {
      // Prevent double billing for Seller mode accidentally using "Delivery" as a custom fee
      if (input.mode === 'seller' && /delivery|shipping|livraison/i.test(rule.name)) {
        return; // Skip mapping Provider automated cost twice
      }

      let orderCount = 0;
      switch (rule.trigger) {
        case 'entered':
          orderCount = totalOrders;
          break;
        case 'confirmed':
          // TODO (Team Payments Deduction)
          // When orders support `confirmation_agent_id` or similar team attribution, 
          // we would evaluate true `confirmedCount` by subtracting orders that 
          // fall into a Team Payment slice.
          orderCount = confirmedCount;
          break;
        case 'delivered':
          orderCount = deliveredCount;
          break;
      }
      const feeTotal = rule.amount * orderCount;
      operationalFees += feeTotal;
      feeBreakdown.push({
        name: rule.name,
        amount: feeTotal,
        trigger: rule.trigger,
        unitAmount: rule.amount,
        orderCount,
      });
    });

  // ── Final Calculations ──
  // Ad spend used directly — NO x10 multiplier
  const totalCosts = productCost + shippingCost + operationalFees + adSpend;
  const netProfit = revenue - totalCosts;
  const profitMargin = revenue > 0 ? (netProfit / revenue) * 100 : 0;
  const deliveryRate = confirmedCount > 0 ? (deliveredCount / confirmedCount) * 100 : 0;
  const confirmationRate = totalOrders > 0 ? (confirmedCount / totalOrders) * 100 : 0;
  const cpa = confirmedCount > 0 ? adSpend / confirmedCount : 0;
  const roas = adSpend > 0 ? revenue / adSpend : 0;

  return {
    revenue,
    productCost,
    shippingCost,
    operationalFees,
    feeBreakdown,
    adSpend,
    totalCosts,
    netProfit,
    profitMargin,
    deliveryRate,
    confirmationRate,
    cpa,
    roas,
    totalOrders,
    deliveredCount,
    confirmedCount,
    pendingCount,
    cancelledCount,
    returnedCount,
    shippedCount,
    missingCostWarnings,
  };
}

// ─── Legacy Compatibility Wrapper ─────────────────────────────────────────────
// Used by any old code that calls calculateDashboardMetrics with old signature.
// Maps old FeeConfig to CostRule[] and calls the new engine.

export interface FeeConfig {
  deliveryFee: number;
  confirmationFee: number;
  fulfillmentFee: number;
  leadFee?: number;
}

/** @deprecated Use calculateWorkspaceProfit instead */
export function calculateDashboardMetrics(
  orders: OrderForMetrics[],
  adSpend: number,
  skuToCostMap: Map<string, number>,
  feeConfig: FeeConfig = { deliveryFee: 35, confirmationFee: 11, fulfillmentFee: 2 },
  _startDate?: Date,
  _endDate?: Date
) {
  // Build cost rules from legacy config
  const costRules: CostRule[] = [
    { id: 'legacy-delivery', name: 'Delivery Fee', amount: feeConfig.deliveryFee, trigger: 'delivered', enabled: true },
    { id: 'legacy-confirmation', name: 'Confirmation Fee', amount: feeConfig.confirmationFee, trigger: 'confirmed', enabled: true },
    { id: 'legacy-fulfillment', name: 'Fulfillment Fee', amount: feeConfig.fulfillmentFee, trigger: 'delivered', enabled: true },
  ];

  const result = calculateWorkspaceProfit({
    mode: 'seller',
    orders,
    adSpend,
    skuCostMap: skuToCostMap,
    costRules,
  });

  // Return old shape so existing callers don't break
  return {
    revenue: result.revenue,
    deliveredCount: result.deliveredCount,
    confirmedCount: result.confirmedCount,
    pendingCount: result.pendingCount,
    cancelledCount: result.cancelledCount,
    returnedCount: result.returnedCount,
    totalProductCost: result.productCost,
    netProfit: result.netProfit,
    profitMargin: result.profitMargin,
    deliveryRate: result.deliveryRate,
    confirmationRate: result.confirmationRate,
    cpa: result.cpa,
  };
}
