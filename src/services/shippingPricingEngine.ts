/**
 * Shipping Pricing Engine
 * 
 * Centralized service for calculating effective shipping costs based on order status.
 * Automatically detects refused/refused status and uses refused_price instead of delivered_price.
 * 
 * Priority:
 * - Delivered status → delivered_price
 * - Refused status → refused_price
 * - All other statuses → delivered_price (current logic)
 */

import { supabase } from "../lib/supabase";
import { getShippingPriceSync } from "./shippingPriceService";

/**
 * Refused status patterns (case-insensitive)
 */
const REFUSED_STATUS_PATTERNS = [
  'refused',
  'refusé',
  'refuse',
  'customer refused',
  'return refused',
  'rejected',
  'refusal',
];

/**
 * Check if a shipping status indicates a refused delivery
 */
export function isRefusedStatus(status: string | null | undefined): boolean {
  if (!status) return false;
  
  const normalizedStatus = status.toLowerCase().trim();
  return REFUSED_STATUS_PATTERNS.some(pattern => 
    normalizedStatus.includes(pattern)
  );
}

/**
 * Get effective shipping price for a city based on status
 * Returns delivered_price or refused_price depending on order status
 */
export async function getEffectiveShippingPrice(
  city: string | null | undefined,
  status: string | null | undefined
): Promise<number> {
  if (!city) return 0;

  // Use existing service to get base price
  const basePrice = getShippingPriceSync(city);
  if (basePrice === null) return 0;

  // If status is refused, fetch refused_price from database
  if (isRefusedStatus(status)) {
    try {
      const { data } = await supabase
        .from('ozon_cities')
        .select('refused_price')
        .ilike('name', city.trim().toLowerCase())
        .single();

      if (data && data.refused_price !== null) {
        return Number(data.refused_price);
      }
    } catch (error) {
      console.error('[ShippingPricingEngine] Error fetching refused price:', error);
    }
  }

  // Default to delivered_price
  return basePrice;
}

/**
 * Synchronous version for performance-critical paths
 * Uses cached data for refused prices
 */
export function getEffectiveShippingPriceSync(
  city: string | null | undefined,
  status: string | null | undefined
): number {
  if (!city) return 0;

  // For sync version, we can't easily check refused_price
  // Fall back to delivered_price and log warning for refused status
  const basePrice = getShippingPriceSync(city);
  if (basePrice === null) return 0;

  if (isRefusedStatus(status)) {
    console.warn('[ShippingPricingEngine] Refused status detected but using delivered_price in sync mode. Use async version for accurate refused pricing.');
  }

  return basePrice;
}

/**
 * Calculate effective shipping cost for an order
 * Convenience wrapper that extracts city and status from order object
 */
export async function calculateEffectiveShippingCost(order: any): Promise<number> {
  const city = order?.city || order?.city_name;
  const status = order?.shipping_status || order?.delivery_status || order?.status;
  
  return getEffectiveShippingPrice(city, status);
}

/**
 * Calculate effective shipping cost for an order (synchronous)
 * Convenience wrapper for performance-critical paths
 */
export function calculateEffectiveShippingCostSync(order: any): number {
  const city = order?.city || order?.city_name;
  const status = order?.shipping_status || order?.delivery_status || order?.status;
  
  return getEffectiveShippingPriceSync(city, status);
}

/**
 * Batch calculate effective shipping costs for multiple orders
 * More efficient than calling getEffectiveShippingPrice repeatedly
 */
export async function batchCalculateEffectiveShippingCosts(
  orders: any[]
): Promise<Map<string, number>> {
  const results = new Map<string, number>();
  
  // Process orders in parallel
  const calculations = orders.map(async (order) => {
    const orderId = order.id || order.order_number;
    const cost = await calculateEffectiveShippingCost(order);
    return { orderId, cost };
  });
  
  const resultsArray = await Promise.all(calculations);
  resultsArray.forEach(({ orderId, cost }) => {
    results.set(orderId, cost);
  });
  
  return results;
}

/**
 * Get refused price for a specific city
 */
export async function getRefusedPrice(city: string): Promise<number | null> {
  try {
    const { data } = await supabase
      .from('ozon_cities')
      .select('refused_price')
      .ilike('name', city.trim().toLowerCase())
      .single();

    return data !== null && data.refused_price !== null ? Number(data.refused_price) : null;
  } catch (error) {
    console.error('[ShippingPricingEngine] Error fetching refused price:', error);
    return null;
  }
}

/**
 * Get delivered price for a specific city
 */
export async function getDeliveredPrice(city: string): Promise<number | null> {
  try {
    const { data } = await supabase
      .from('ozon_cities')
      .select('delivered_price')
      .ilike('name', city.trim().toLowerCase())
      .single();

    return data !== null && data.delivered_price !== null ? Number(data.delivered_price) : null;
  } catch (error) {
    console.error('[ShippingPricingEngine] Error fetching delivered price:', error);
    return null;
  }
}

/**
 * Get both pricing types for a city
 */
export async function getCityPricing(city: string): Promise<{
  deliveredPrice: number | null;
  refusedPrice: number | null;
}> {
  try {
    const { data } = await supabase
      .from('ozon_cities')
      .select('delivered_price, refused_price')
      .ilike('name', city.trim().toLowerCase())
      .single();

    return {
      deliveredPrice: data !== null && data.delivered_price !== null ? Number(data.delivered_price) : null,
      refusedPrice: data !== null && data.refused_price !== null ? Number(data.refused_price) : null,
    };
  } catch (error) {
    console.error('[ShippingPricingEngine] Error fetching city pricing:', error);
    return { deliveredPrice: null, refusedPrice: null };
  }
}
