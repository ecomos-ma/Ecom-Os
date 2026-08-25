import { supabase } from "../lib/supabase";
import type { Order } from "../lib/types";
import { trackOzonParcel, validateOzonConfig } from "./ozonService";
import type { OzonConfig } from "../types/ozon";
import { normalizeShippingStatus } from "../lib/shippingStatus";

// Status mapping from Ozon statuses to internal shipping status codes
const OZON_STATUS_MAPPING: Record<string, string> = {
  "Nouveau Colis": "NEW_PARCEL",
  "Ramassé": "PICKED_UP",
  "En Transit": "IN_DISTRIBUTION",
  "En Livraison": "OUT_FOR_DELIVERY",
  "Livré": "DELIVERED",
  "Refusé": "REFUSED",
  "Retourné": "RETURNED_TO_SENDER",
  "Annulé": "CANCELED",
};

interface OzonTrackingResponse {
  status?: string;
  current_status?: string;
  state?: string;
  delivery_status?: string;
  lastEvent?: string;
  [key: string]: any;
}

interface TrackingSyncResult {
  orderId: string;
  orderNumber: string;
  trackingNumber: string;
  success: boolean;
  previousStatus?: string;
  newStatus?: string;
  error?: string;
}

/**
 * Map Ozon status to internal shipping status code
 */
export function mapOzonStatus(ozonStatus: string): string {
  // First try the direct mapping
  const mapped = OZON_STATUS_MAPPING[ozonStatus];
  if (mapped) return mapped;

  // Fall back to normalization
  const normalized = normalizeShippingStatus(ozonStatus);
  return normalized || ozonStatus;
}

/**
 * Fetch tracking information from Ozon Express API
 * Uses the ozonService directly for better error handling
 */
async function fetchOzonTracking(trackingNumber: string, config: OzonConfig): Promise<OzonTrackingResponse | null> {
  try {
    console.log("[OzonTrackingSync] Fetching tracking for:", trackingNumber);
    console.log("[OzonTrackingSync] Using config:", { clientId: config.clientId, hasApiKey: !!config.apiKey });

    const result = await trackOzonParcel(config, trackingNumber);

    if (!result.success) {
      console.error("[OzonTrackingSync] Ozon API error:", result.error);
      return null;
    }

    console.log("[OzonTrackingSync] Ozon response:", result.data);
    return result.data as OzonTrackingResponse;
  } catch (err) {
    console.error("[OzonTrackingSync] Error fetching tracking:", err);
    return null;
  }
}

/**
 * Sync tracking for a single order
 */
export async function syncOrderTracking(order: Order, workspaceId: string, carrier?: string, ozonConfig?: OzonConfig): Promise<TrackingSyncResult> {
  const result: TrackingSyncResult = {
    orderId: order.id,
    orderNumber: order.order_number,
    trackingNumber: order.tracking_number || "",
    success: false,
  };

  if (!order.tracking_number) {
    result.error = "No tracking number";
    return result;
  }

  const orderCarrier = carrier || order.shipping_provider || "ozon";
  if (orderCarrier !== "ozon") {
    result.error = "Not an Ozon order";
    return result;
  }

  // Use provided config or get from localStorage
  const config = ozonConfig || {
    clientId: localStorage.getItem("ozon_client_id")?.trim() || "",
    apiKey: localStorage.getItem("ozon_api_key")?.trim() || "",
  };

  const validation = validateOzonConfig(config);
  if (!validation.success) {
    console.warn("[OzonTrackingSync] Invalid Ozon config:", validation.error);
    result.previousStatus = order.shipping_status ?? undefined;
    // Do not fabricate a default when shipping_status is missing — preserve the DB value (may be null)
    result.newStatus = order.shipping_status ?? undefined;
    result.success = true;
    return result;
  }

  const ozonResponse = await fetchOzonTracking(order.tracking_number, config);
  if (!ozonResponse) {
    console.warn("[OzonTrackingSync] Failed to fetch from Ozon API, but will show current Supabase status");
    result.previousStatus = order.shipping_status ?? undefined;
    result.newStatus = order.shipping_status ?? undefined;
    result.success = true;
    return result;
  }

  console.log("[OzonTrackingSync] Ozon API response:", ozonResponse);

  // Extract status from Ozon response - check multiple possible fields
  const ozonStatus =
    ozonResponse.TRACKING?.LAST_TRACKING?.STATUT ||
    ozonResponse.TRACKING?.CURRENT_STATUS ||
    ozonResponse.status ||
    ozonResponse.current_status ||
    ozonResponse.state ||
    ozonResponse.delivery_status ||
    ozonResponse?.data?.status ||
    ozonResponse?.data?.current_status ||
    "Unknown";

  console.log("[OzonTrackingSync] Extracted Ozon status:", ozonStatus);

  // If API returns Unknown, keep current status from database
  if (ozonStatus === "Unknown" || !ozonStatus) {
    console.warn("[OzonTrackingSync] Ozon API returned no valid status, keeping current database status");
    result.previousStatus = order.shipping_status ?? undefined;
    result.newStatus = order.shipping_status ?? undefined;
    result.success = true;
    return result;
  }

  const mappedStatus = mapOzonStatus(ozonStatus);
  console.log("[OzonTrackingSync] Mapped status:", mappedStatus);

  result.previousStatus = order.shipping_status ?? undefined;
  result.newStatus = mappedStatus;

  // Update order with new tracking status
  const updatePayload = {
    // Update both shipping_status and delivery_status to maintain consistency
    shipping_status: mappedStatus,
    delivery_status: mappedStatus,
    shipping_status_raw: ozonResponse,
    last_tracking_sync: new Date().toISOString(),
    shipping_updated_at: new Date().toISOString(),
  };

  const orderId = order.id || (order as any)["Order ID"];
  const { error: updateError } = await supabase
    .from("orders")
    .update(updatePayload)
    .eq("Order ID", orderId);

  if (updateError) {
    console.error("[OzonTrackingSync] Failed to update order:", updateError);
    result.error = updateError.message;
    return result;
  }

  // Log the sync event
  await logTrackingSync({
    order_id: order.id,
    order_number: order.order_number,
    tracking_number: order.tracking_number,
    previous_status: order.shipping_status ?? undefined,
    new_status: mappedStatus,
    ozon_response: ozonResponse,
    success: true,
    workspace_id: workspaceId,
  });

  result.success = true;
  console.log("[OzonTrackingSync] Successfully synced order:", order.order_number, `${result.previousStatus} -> ${result.newStatus}`);
  return result;
}

/**
 * Sync tracking for multiple orders
 */
export async function syncMultipleOrdersTracking(orders: Order[], workspaceId: string): Promise<TrackingSyncResult[]> {
  const results: TrackingSyncResult[] = [];

  // Filter to only Ozon orders with tracking numbers
  // Allow orders without shipping_provider since this function is specifically for Ozon
  const ordersToSync = orders.filter((o) => o.tracking_number && (o.shipping_provider === "ozon" || !o.shipping_provider));

  if (ordersToSync.length === 0) {
    console.log("[OzonTrackingSync] No orders to sync");
    return results;
  }

  console.log("[OzonTrackingSync] Syncing", ordersToSync.length, "orders");

  for (const order of ordersToSync) {
    const result = await syncOrderTracking(order, workspaceId, "ozon");
    results.push(result);

    // Small delay between API calls to avoid rate limiting
    await new Promise((resolve) => setTimeout(resolve, 100));
  }

  return results;
}

/**
 * Log tracking sync events for audit trail
 */
async function logTrackingSync(data: {
  order_id: string;
  order_number: string;
  tracking_number: string;
  previous_status?: string;
  new_status?: string;
  ozon_response: any;
  success: boolean;
  error?: string;
  workspace_id: string;
}) {
  try {
    await supabase.from("shipping_logs").insert({
      order_id: data.order_id,
      order_number: data.order_number,
      tracking_number: data.tracking_number,
      event_type: "tracking_sync",
      event_data: {
        previous_status: data.previous_status,
        new_status: data.new_status,
        ozon_response: data.ozon_response,
      },
      success: data.success,
      error_message: data.error,
      workspace_id: data.workspace_id,
      created_at: new Date().toISOString(),
    });
  } catch (err) {
    console.error("[OzonTrackingSync] Failed to log sync event:", err);
  }
}

/**
 * Get pending tracking syncs (orders that haven't synced recently)
 */
export async function getPendingTrackingSyncs(workspaceId: string, hoursSinceLast: number = 6): Promise<Order[]> {
  const cutoffTime = new Date(Date.now() - hoursSinceLast * 60 * 60 * 1000).toISOString();

  const { data, error } = await supabase
    .from("orders")
    .select("*")
    .eq("workspace_id", workspaceId)
    .or("shipping_provider.eq.ozon,shipping_provider.is.null")
    .not("tracking_number", "is", null)
    .or(`last_tracking_sync.is.null,last_tracking_sync.lt.${cutoffTime}`);

  if (error) {
    console.error("[OzonTrackingSync] Failed to get pending syncs:", error);
    return [];
  }

  return data || [];
}
