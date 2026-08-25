import { supabase } from "../../lib/supabase";

export class ShippingRepository {
  async logRequest(workspaceId: string, provider: string, orderId: string | undefined | null, orderNumber: string | undefined | null, action: string, payload: any) {
    const { data, error } = await supabase.from("shipping_logs").insert({
      workspace_id: workspaceId,
      provider,
      order_id: orderId,
      order_number: orderNumber,
      action,
      request_payload: payload,
    }).select("id").single();

    if (error) {
      console.error("ShippingRepository.logRequest error:", error);
      return null as any;
    }
    return data.id;
  }

  async logResponse(logId: string | null, httpStatus: number, responsePayload: any, errorText?: string | null) {
    if (!logId) return null;
    const { error } = await supabase.from("shipping_logs").update({
      response_payload: responsePayload,
      http_status: httpStatus,
      error: errorText ?? null,
      updated_at: new Date().toISOString(),
    }).eq("id", logId);

    if (error) console.error("ShippingRepository.logResponse error:", error);
    return true;
  }
}

export default ShippingRepository;
