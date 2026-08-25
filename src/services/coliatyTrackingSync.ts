import { supabase } from "../lib/supabase";
import type { Order } from "../lib/types";
import { SUPABASE_URL } from "../lib/supabase";
import { normalizeShippingStatus } from "../lib/shippingStatus";

export interface ColiatyTrackingSyncResult {
  orderId: string;
  orderNumber: string;
  parcelCode: string;
  success: boolean;
  newStatus?: string;
  error?: string;
}

/**
 * Sync tracking for a single Coliaty order
 */
export async function syncColiatyTracking(order: Order, workspaceId: string): Promise<ColiatyTrackingSyncResult> {
  const result: ColiatyTrackingSyncResult = {
    orderId: order.id,
    orderNumber: order.order_number,
    parcelCode: order.coliaty_parcel_code || "",
    success: false,
  };

  if (!order.coliaty_parcel_code) {
    result.error = "No Coliaty parcel code";
    return result;
  }

  const { data: { session } } = await supabase.auth.getSession();
  if (!session) {
    result.error = "Authentication required";
    return result;
  }

  try {
    const response = await fetch(
      `${SUPABASE_URL}/functions/v1/coliaty-api/parcel-status?parcel_code=${order.coliaty_parcel_code}&workspace_id=${workspaceId}`,
      {
        method: "GET",
        headers: {
          "Authorization": `Bearer ${session.access_token}`,
        },
      }
    );

    if (!response.ok) {
      const errorData = await response.json();
      result.error = `Coliaty API error: ${errorData.error || "Unknown error"}`;
      return result;
    }

    const data = await response.json();
    
    if (!data.success) {
      result.error = "Coliaty API returned unsuccessful response";
      return result;
    }

    // Extract status from Coliaty response - nested at data.data.data.status.code
    const coliatyStatus = data.data?.data?.status?.code;
    
    if (!coliatyStatus) {
      result.error = "No status in Coliaty response";
      return result;
    }

    // Map Coliaty status codes to internal shipping status codes
    const statusMap: Record<string, string> = {
      "NEW_PARCEL": "NEW_PARCEL",
      "pending": "WAITING_PICKUP",
      "en_attente": "WAITING_PICKUP",
      "picked_up": "PICKED_UP",
      "ramasse": "PICKED_UP",
      "in_transit": "IN_DISTRIBUTION",
      "en_cours": "IN_DISTRIBUTION",
      "out_for_delivery": "OUT_FOR_DELIVERY",
      "en_livraison": "OUT_FOR_DELIVERY",
      "delivered": "DELIVERED",
      "livre": "DELIVERED",
      "no_answer": "NO_ANSWER",
      "pas_de_reponse": "NO_ANSWER",
      "refused": "REFUSED",
      "refuse": "REFUSED",
      "returned": "RETURNED_TO_SENDER",
      "retour": "RETURNED_TO_SENDER",
      "cancelled": "CANCELED",
      "annule": "CANCELED",
    };

    const newStatus = statusMap[coliatyStatus] || normalizeShippingStatus(coliatyStatus) || coliatyStatus;

    // Update order in database — update both shipping_status and delivery_status for consistency
    const { error: updateError } = await supabase
      .from("orders")
      .update({
        shipping_status: newStatus,
        delivery_status: newStatus,
        shipping_status_raw: data.data,
        last_tracking_sync: new Date().toISOString(),
        shipping_updated_at: new Date().toISOString(),
      })
      .eq("order_number", order.order_number)
      .eq("workspace_id", workspaceId);

    if (updateError) {
      result.error = `Failed to update order: ${updateError.message}`;
      return result;
    }

    result.success = true;
    result.newStatus = newStatus;
    return result;
  } catch (err: any) {
    result.error = `Network error: ${err?.message || String(err)}`;
    return result;
  }
}

/**
 * Sync tracking for multiple Coliaty orders
 */
export async function syncMultipleColiatyTracking(orders: Order[], workspaceId: string): Promise<ColiatyTrackingSyncResult[]> {
  const results: ColiatyTrackingSyncResult[] = [];

  // Filter to only Coliaty orders with parcel codes
  const ordersToSync = orders.filter((o) => o.coliaty_parcel_code);

  console.log("[ColiatyTrackingSync] Syncing", ordersToSync.length, "Coliaty orders");

  for (const order of ordersToSync) {
    const result = await syncColiatyTracking(order, workspaceId);
    results.push(result);

    // Small delay between API calls to avoid rate limiting
    await new Promise((resolve) => setTimeout(resolve, 200));
  }

  return results;
}
