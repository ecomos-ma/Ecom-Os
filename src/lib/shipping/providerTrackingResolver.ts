import type { Order } from "../types";

/**
 * Provider-specific tracking identifier resolver
 * 
 * Different providers use different identifiers for tracking status lookups.
 * This function returns the exact identifier required by each provider's status API.
 * 
 * IMPORTANT: Do not assume tracking_number === parcel_code === shipment_id
 * These values may be different depending on the provider.
 */
export function getProviderTrackingIdentifier(order: Order, provider?: string): string | null {
  const providerLower = (provider || order.shipping_provider || "").toLowerCase();

  // Coliaty uses coliaty_parcel_code for tracking lookups
  if (providerLower === "coliaty") {
    return order.coliaty_parcel_code || order.tracking_number || null;
  }

  // ForceLog uses tracking_number (which is the parcel code returned by ForceLog)
  if (providerLower === "forcelog") {
    // ForceLog returns tracking_number as the parcel code in the API response
    // This is stored in both tracking_number and shipment_id after creation
    return order.tracking_number || order.shipment_id || null;
  }

  // Ameex uses tracking_number
  if (providerLower === "ameex") {
    return order.tracking_number || null;
  }

  // Sendit uses tracking_number
  if (providerLower === "sendit") {
    return order.tracking_number || null;
  }

  // Ozon uses tracking_number (ozon tracking number)
  if (providerLower === "ozon") {
    return order.tracking_number || null;
  }

  // Fallback: use tracking_number for unknown providers
  return order.tracking_number || null;
}

/**
 * Check if an order has a valid tracking identifier for the given provider
 */
export function hasValidTrackingIdentifier(order: Order, provider?: string): boolean {
  const identifier = getProviderTrackingIdentifier(order, provider);
  const providerLower = (provider || order.shipping_provider || "").toLowerCase();
  
  // Must have both provider and identifier
  if (!providerLower || !identifier) {
    return false;
  }

  return true;
}

/**
 * Get the tracking field name for a provider (for debugging/UI display)
 */
export function getProviderTrackingFieldName(provider?: string): string {
  const providerLower = (provider || "").toLowerCase();
  
  switch (providerLower) {
    case "coliaty":
      return "coliaty_parcel_code";
    case "forcelog":
      return "tracking_number";
    case "ameex":
      return "tracking_number";
    case "sendit":
      return "tracking_number";
    case "ozon":
      return "tracking_number";
    default:
      return "tracking_number";
  }
}
