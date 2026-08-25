/**
 * Smart Shipping Engine
 * 
 * Centralized service for calculating shipping costs across the entire EcomOS platform.
 * Automatically detects active shipping provider integrations and uses their city pricing.
 * Falls back to Business Expenses → Delivery Fee when no provider pricing is available.
 * 
 * Supports refused pricing based on order status.
 * 
 * Priority Rules:
 * 1. Provider Smart Pricing (city price from active integration)
 *    - Delivered status → delivered_price
 *    - Refused status → refused_price
 * 2. Business Expenses → Delivery Fee (global fallback)
 */

import { supabase } from "../lib/supabase";
import { getShippingPriceSync } from "./shippingPriceService";
import { isRefusedStatus, getRefusedPrice } from "./shippingPricingEngine";

interface ShippingCostRequest {
  workspaceId: string;
  city: string | null | undefined;
  // Optional: force a specific provider instead of auto-detection
  providerId?: string | null;
  // Optional: order status for refused pricing detection
  status?: string | null | undefined;
}

interface ShippingProvider {
  id: string;
  name: string;
  isActive: boolean;
  hasCityPricing: boolean;
}

interface ShippingCostResult {
  cost: number;
  source: 'provider' | 'business_fallback';
  providerName?: string;
  cityName?: string;
}

/**
 * Get active shipping providers for a workspace
 */
async function getActiveProviders(workspaceId: string): Promise<ShippingProvider[]> {
  try {
    const { data, error } = await supabase
      .from('workspace_shipping_providers')
      .select('provider, is_active')
      .eq('workspace_id', workspaceId)
      .eq('is_active', true);

    if (error || !data) {
      return [];
    }

    // Map to standardized provider format
    return data.map((row: any) => ({
      id: row.provider,
      name: getProviderDisplayName(row.provider),
      isActive: row.is_active,
      hasCityPricing: providerHasCityPricing(row.provider)
    }));
  } catch (error) {
    console.error('[SmartShippingEngine] Error fetching active providers:', error);
    return [];
  }
}

/**
 * Get human-readable provider name
 */
function getProviderDisplayName(providerId: string): string {
  const names: Record<string, string> = {
    'ozon': 'Ozon Express',
    'coliaty': 'Coliaty',
    'forcelog': 'ForceLog',
    'ameex': 'Ameex',
    'sendit': 'Sendit',
    'amana': 'Amana',
    'jibli': 'Jibli',
    'cathedis': 'Cathedis',
  };
  return names[providerId] || providerId;
}

/**
 * Check if a provider has city pricing capability
 */
function providerHasCityPricing(providerId: string): boolean {
  // Currently only Ozon has comprehensive city pricing
  // This can be extended as more providers are integrated
  const providersWithPricing = ['ozon'];
  return providersWithPricing.includes(providerId.toLowerCase());
}

/**
 * Get shipping cost from provider (Smart Pricing)
 * Uses refused_price for refused orders, delivered_price otherwise
 */
async function getProviderShippingCost(
  providerId: string,
  city: string,
  status?: string | null
): Promise<number | null> {
  if (!city || city.trim() === '') {
    return null;
  }

  // For Ozon, use the existing shipping price service with refused detection
  if (providerId.toLowerCase() === 'ozon') {
    // If status is refused, try to get refused_price
    if (isRefusedStatus(status)) {
      const refusedPrice = await getRefusedPrice(city);
      if (refusedPrice !== null && refusedPrice !== 0) {
        return refusedPrice;
      }
    }

    // Default to delivered_price
    return getShippingPriceSync(city);
  }

  // Future providers can be added here with their own pricing logic
  // Example:
  // if (providerId.toLowerCase() === 'coliaty') {
  //   return getColiatyShippingPrice(city, status);
  // }

  return null;
}

/**
 * Get business delivery fee as fallback
 */
async function getBusinessDeliveryFee(workspaceId: string): Promise<number> {
  try {
    const { data, error } = await supabase
      .from('workspaces')
      .select('business_delivery_fee')
      .eq('id', workspaceId)
      .single();

    if (error || !data) {
      return 35; // Default fallback
    }

    return Number(data.business_delivery_fee ?? 35);
  } catch (error) {
    console.error('[SmartShippingEngine] Error fetching business delivery fee:', error);
    return 35; // Default fallback
  }
}

/**
 * Main function: Calculate shipping cost with smart detection
 * 
 * Algorithm:
 * 1. Detect active shipping providers for workspace
 * 2. If specific provider requested, use it
 * 3. If no provider requested, auto-detect from active integrations
 * 4. Try to get provider pricing (uses refused_price for refused status)
 * 5. If provider pricing found, return it
 * 6. If no provider pricing, fallback to business delivery fee
 * 7. Never return null/0 unless delivery fee is actually 0
 */
export async function getShippingCost(request: ShippingCostRequest): Promise<ShippingCostResult> {
  const { workspaceId, city, providerId, status } = request;

  // Step 1: Get active providers
  const activeProviders = await getActiveProviders(workspaceId);

  // Step 2: Determine which provider to use
  let targetProvider: ShippingProvider | null = null;

  if (providerId) {
    // Use requested provider if specified
    targetProvider = activeProviders.find(p => p.id === providerId) || null;
  } else if (activeProviders.length > 0) {
    // Auto-detect: use first active provider with city pricing
    targetProvider = activeProviders.find(p => p.hasCityPricing) || activeProviders[0];
  }

  // Step 3: Try provider pricing if available
  if (targetProvider && targetProvider.hasCityPricing && city) {
    const providerCost = await getProviderShippingCost(targetProvider.id, city, status);
    if (providerCost !== null && providerCost > 0) {
      return {
        cost: providerCost,
        source: 'provider',
        providerName: targetProvider.name,
        cityName: city
      };
    }
  }

  // Step 4: Fallback to business delivery fee
  const businessFee = await getBusinessDeliveryFee(workspaceId);

  return {
    cost: businessFee,
    source: 'business_fallback',
    cityName: city ?? undefined
  };
}

/**
 * Synchronous version for performance-critical paths
 * Uses cached provider info and city prices
 * Note: Cannot reliably use refused pricing in sync mode
 */
export function getShippingCostSync(request: ShippingCostRequest): ShippingCostResult {
  const { city, providerId, status } = request;

  // For sync version, we prioritize Ozon pricing (most common)
  // In a full implementation, this would use cached provider detection
  if (city && (!providerId || providerId.toLowerCase() === 'ozon')) {
    const ozonPrice = getShippingPriceSync(city);
    if (ozonPrice !== null && ozonPrice > 0) {
      // Log warning for refused status in sync mode
      if (isRefusedStatus(status)) {
        console.warn('[SmartShippingEngine] Refused status detected but using delivered_price in sync mode. Use async version for accurate refused pricing.');
      }

      return {
        cost: ozonPrice,
        source: 'provider',
        providerName: 'Ozon Express',
        cityName: city
      };
    }
  }

  // Fallback to default (can't fetch business fee synchronously)
  // In production, this should be cached
  return {
    cost: 35, // Default fallback
    source: 'business_fallback',
    cityName: city ?? undefined
  };
}

/**
 * Calculate shipping cost for an order object
 * Convenience wrapper for common use case
 */
export async function calculateOrderShippingCost(order: any, workspaceId: string): Promise<number> {
  const city = order?.city || order?.city_name;
  const status = order?.shipping_status || order?.delivery_status || order?.status;

  const result = await getShippingCost({
    workspaceId,
    city,
    providerId: order?.shipping_provider || null,
    status
  });

  return result.cost;
}

/**
 * Calculate shipping cost for an order object (synchronous)
 * Convenience wrapper for performance-critical paths
 */
export function calculateOrderShippingCostSync(order: any, workspaceId: string): number {
  const city = order?.city || order?.city_name;
  const status = order?.shipping_status || order?.delivery_status || order?.status;

  const result = getShippingCostSync({
    workspaceId,
    city,
    providerId: order?.shipping_provider || null,
    status
  });

  return result.cost;
}

/**
 * Batch calculate shipping costs for multiple orders
 * More efficient than calling getShippingCost repeatedly
 */
export async function batchCalculateShippingCosts(
  orders: any[],
  workspaceId: string
): Promise<Map<string, number>> {
  const results = new Map<string, number>();

  // Get active providers once for all orders
  const activeProviders = await getActiveProviders(workspaceId);
  const hasProviderPricing = activeProviders.some(p => p.hasCityPricing);

  // Process orders in parallel
  const calculations = orders.map(async (order) => {
    const orderId = order.id || order.order_number;
    const city = order?.city || order?.city_name;

    if (!city) {
      // Use business fee for orders without city
      const businessFee = await getBusinessDeliveryFee(workspaceId);
      return { orderId, cost: businessFee };
    }

    // Try provider pricing first
    if (hasProviderPricing && city) {
      const providerCost = await getProviderShippingCost(activeProviders[0].id, city);
      if (providerCost !== null && providerCost > 0) {
        return { orderId, cost: providerCost };
      }
    }

    // Fallback to business fee
    const businessFee = await getBusinessDeliveryFee(workspaceId);
    return { orderId, cost: businessFee };
  });

  const resultsArray = await Promise.all(calculations);
  resultsArray.forEach(({ orderId, cost }) => {
    results.set(orderId, cost);
  });

  return results;
}
