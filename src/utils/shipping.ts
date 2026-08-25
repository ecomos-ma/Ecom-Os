import { normalizeStatus } from "./status";
import { getShippingPriceSync } from "../services/shippingPriceService";
import { getShippingCostSync as getSmartShippingCostSync } from "../services/smartShippingEngine";
import { isRefusedStatus, getEffectiveShippingPriceSync } from "../services/shippingPricingEngine";

/**
 * Single source of truth for calculating the shipping cost of an order.
 * Follows the rule: Only "Delivered" orders get charged.
 * Everything else contributes 0.
 * 
 * Uses Smart Shipping Engine for provider pricing with fallback to business fees.
 * Automatically uses refused_price for refused orders.
 */
export function calculateOrderShipping(order: any, workspaceId?: string): number {
    const internalStatus = normalizeStatus(order?.shipping_status || order?.delivery_status || order?.status);

    // As explicitly requested: only calculate shipping cost for "Delivered" orders
    if (internalStatus === 'DELIVERED') {
        const rawShippingCost = order?.shipping_cost;
        const persistedShippingCost = rawShippingCost === null || rawShippingCost === undefined || rawShippingCost === ""
            ? null
            : Number(rawShippingCost);
        if (persistedShippingCost !== null && Number.isFinite(persistedShippingCost) && persistedShippingCost >= 0) {
            return persistedShippingCost;
        }
        // Use Smart Shipping Engine if workspaceId is provided
        if (workspaceId) {
            const result = getSmartShippingCostSync({
                workspaceId,
                city: order?.city || order?.city_name,
                providerId: order?.shipping_provider || null,
                status: order?.shipping_status || order?.delivery_status || order?.status
            });
            return result.cost;
        }
        
        // Fallback to original logic for backward compatibility
        return Number(getShippingPriceSync(order?.city) || 0);
    }

    // Everything else contributes 0
    return 0;
}

/**
 * Calculate effective shipping cost considering refused status
 * This includes refused orders in calculations with refused pricing
 */
export function calculateEffectiveShippingCost(order: any, workspaceId?: string): number {
    const internalStatus = normalizeStatus(order?.shipping_status || order?.delivery_status || order?.status);

    // Calculate for both delivered and refused orders
    if (internalStatus === 'DELIVERED' || isRefusedStatus(order?.shipping_status || order?.delivery_status || order?.status)) {
        // Use Shipping Pricing Engine for accurate refused pricing
        return getEffectiveShippingPriceSync(
            order?.city || order?.city_name,
            order?.shipping_status || order?.delivery_status || order?.status
        );
    }

    // Everything else contributes 0
    return 0;
}
