import { SUPABASE_ANON_KEY, SUPABASE_URL, supabase } from "../lib/supabase";

export type ForceLogStatus = {
  connected: boolean;
  key_last4: string | null;
  last_tested_at: string | null;
  last_test_status: string | null;
};

type ForceLogResponse<T> = { success: boolean; message?: string; code?: string } & T;

async function invoke<T>(body: Record<string, unknown>): Promise<ForceLogResponse<T>> {
  const { data, error } = await supabase.functions.invoke("forcelog-api", { body });
  if (error) {
    const response = (error as { context?: Response }).context;
    if (response instanceof Response) {
      const payload = await response.json().catch(() => null);
      if (payload?.message) throw new Error(payload.message);
    }
    throw new Error(error.message || "Unable to contact ForceLog.");
  }
  if (!data?.success) throw new Error(data?.message || "ForceLog request failed.");
  return data as ForceLogResponse<T>;
}

export const getForceLogStatus = (workspaceId: string) => invoke<ForceLogStatus>({ action: "status", workspace_id: workspaceId });
export const saveForceLogKey = (workspaceId: string, apiKey: string) => invoke<{ connected: boolean; key_last4: string }>({ action: "set-credentials", workspace_id: workspaceId, api_key: apiKey });
export const testForceLogConnection = (workspaceId: string) => invoke<{ message: string }>({ action: "test-connection", workspace_id: workspaceId });
export const disconnectForceLog = (workspaceId: string) => invoke<{ connected: boolean }>({ action: "disconnect", workspace_id: workspaceId });
export const refreshForceLogCities = (workspaceId: string) => invoke<{ cities: Array<{ provider_city_id: number; code: string; name: string }> }>({ action: "cities", workspace_id: workspaceId });
export const createForceLogParcel = (workspaceId: string, orderId: string) => invoke<{ tracking_number: string; order: { tracking_number: string; shipping_status: string; shipping_provider: string } }>({ action: "create-parcel", workspace_id: workspaceId, order_id: orderId });
export const syncForceLogTracking = (workspaceId: string, orderId: string) => invoke<{ tracking_number: string; shipping_status: string }>({ action: "tracking", workspace_id: workspaceId, order_id: orderId });

export async function getForceLogPdf(workspaceId: string, orderId: string, type: "label" | "sticker" = "label") {
  const { data: { session } } = await supabase.auth.getSession();
  if (!session) throw new Error("Authentication is required.");

  const response = await fetch(`${SUPABASE_URL}/functions/v1/forcelog-api`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${session.access_token}`,
      apikey: SUPABASE_ANON_KEY,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({ action: type, workspace_id: workspaceId, order_id: orderId }),
  });
  if (!response.ok) {
    const payload = await response.json().catch(() => null);
    throw new Error(payload?.message || "ForceLog could not generate the PDF.");
  }
  return response.blob();
}
