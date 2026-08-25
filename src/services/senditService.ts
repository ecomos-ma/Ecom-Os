import { supabase } from "../lib/supabase";

export type SenditStatus = {
  connected: boolean;
  enabled?: boolean;
  public_key_last4: string | null;
  secret_key_last4: string | null;
  pickup_district_id: number | null;
  allow_open: boolean;
  allow_try: boolean;
  packaging_id: number | null;
  last_tested_at: string | null;
  last_test_status: string | null;
};

export type SenditDistrict = {
  id: number | string;
  ville?: string;
  name: string;
  arabic_name?: string;
  price?: number | string | null;
  delais?: string | null;
  pickup_district?: number | string | null;
};

export type SenditPickupCity = { id: number; name: string; arabic_name?: string | null };
export type SenditPackaging = { id: number; code?: string; reference?: string; name: string; type?: string; size?: string };
export type SenditShipmentResult = {
  status: "created" | "already_linked";
  code?: string;
  provider: "sendit";
  tracking_number?: string;
  trackingNumber?: string;
  shipping_status?: string | null;
  raw_status?: string | null;
  fee?: number | null;
  message?: string;
  existing_provider?: string;
};

export class SenditApiError extends Error {
  readonly code?: string;
  readonly status?: string;
  readonly httpStatus?: number;
  constructor(payload: { message?: unknown; code?: unknown; status?: unknown }, httpStatus?: number) {
    super(typeof payload?.message === "string" ? payload.message : "Sendit request failed.");
    this.name = "SenditApiError";
    this.code = typeof payload?.code === "string" ? payload.code : undefined;
    this.status = typeof payload?.status === "string" ? payload.status : undefined;
    this.httpStatus = httpStatus;
  }
}

type ApiResponse<T> = { success: boolean; message?: string; code?: string; status?: string; provider?: "sendit" } & T;

async function invoke<T>(body: Record<string, unknown>): Promise<ApiResponse<T>> {
  const { data, error } = await supabase.functions.invoke("sendit-api", { body });
  if (error) {
    const response = (error as { context?: Response }).context;
    if (response instanceof Response) {
      const payload = await response.json().catch(() => null);
      if (payload && typeof payload === "object") throw new SenditApiError(payload, response.status);
    }
    throw new Error(error.message || "Unable to contact Sendit.");
  }
  if (!data?.success) throw new SenditApiError(data || {});
  return data as ApiResponse<T>;
}

export const getSenditStatus = (workspaceId: string) => invoke<SenditStatus>({ action: "status", workspace_id: workspaceId });
export const saveSenditCredentials = (workspaceId: string, publicKey: string, secretKey: string) =>
  invoke<Pick<SenditStatus, "connected" | "public_key_last4" | "secret_key_last4">>({ action: "set-credentials", workspace_id: workspaceId, public_key: publicKey, secret_key: secretKey });
export const testSenditConnection = (workspaceId: string) => invoke<{ connected: boolean; message: string }>({ action: "test-connection", workspace_id: workspaceId });
export const disconnectSendit = (workspaceId: string) => invoke<{ connected: boolean }>({ action: "disconnect", workspace_id: workspaceId });
export const updateSenditPreferences = (workspaceId: string, preferences: Partial<Pick<SenditStatus, "pickup_district_id" | "allow_open" | "allow_try" | "packaging_id">>) =>
  invoke<{}>({ action: "update-preferences", workspace_id: workspaceId, ...preferences });
export const getSenditPickupCities = (workspaceId: string) => invoke<{ data: SenditPickupCity[] }>({ action: "pickup-cities", workspace_id: workspaceId });
export const getSenditCities = (workspaceId: string, options: { query?: string; page?: number; pickupDistrictId?: number | null } = {}) =>
  invoke<{ data: SenditDistrict[]; total?: number; per_page?: number; current_page?: number; last_page?: number }>({ action: "cities", workspace_id: workspaceId, querystring: options.query || "", page: options.page || 1, pickup_district_id: options.pickupDistrictId || undefined });
export const getSenditCityDetails = (workspaceId: string, districtId: number | string) => invoke<{ data: SenditDistrict }>({ action: "city-details", workspace_id: workspaceId, district_id: districtId });
export const getSenditPackagings = (workspaceId: string, query = "") => invoke<{ data: SenditPackaging[] }>({ action: "packagings", workspace_id: workspaceId, querystring: query });
export const getSenditStatuses = (workspaceId: string) => invoke<{ data: Record<string, string> }>({ action: "statuses", workspace_id: workspaceId });
export const createSenditDelivery = (workspaceId: string, orderId: string) => invoke<SenditShipmentResult>({ action: "create-delivery", workspace_id: workspaceId, order_id: orderId });
export const syncSenditTracking = (workspaceId: string, orderId: string) => invoke<{ tracking_number: string; raw_status: string | null; shipping_status: string | null; changed: boolean }>({ action: "tracking", workspace_id: workspaceId, order_id: orderId });
export const syncSenditMassTracking = (workspaceId: string, orderIds: string[]) => invoke<{ updated: number; failures: string[]; skipped_terminal: number }>({ action: "mass-tracking", workspace_id: workspaceId, order_ids: orderIds });
export const getSenditDelivery = (workspaceId: string, orderId: string) => invoke<{ data: unknown }>({ action: "get-delivery", workspace_id: workspaceId, order_id: orderId });
export const updateSenditDelivery = (workspaceId: string, orderId: string, changes: Record<string, unknown>) => invoke<SenditShipmentResult>({ action: "update-delivery", workspace_id: workspaceId, order_id: orderId, changes });
export const deleteSenditDelivery = (workspaceId: string, orderId: string) => invoke<{ message: string }>({ action: "delete-delivery", workspace_id: workspaceId, order_id: orderId });
export const getSenditLabels = (workspaceId: string, orderIds: string[], printFormat = 1) => invoke<{ data: { filePrint?: boolean; fileUrl?: string } }>({ action: "labels", workspace_id: workspaceId, order_ids: orderIds, print_format: printFormat });
export const createSenditPickup = (workspaceId: string, payload: Record<string, unknown>) => invoke<{ data: unknown }>({ action: "create-pickup", workspace_id: workspaceId, payload });
export const listSenditPickups = (workspaceId: string) => invoke<{ data: unknown[] }>({ action: "pickups", workspace_id: workspaceId });
export const getSenditPickup = (workspaceId: string, code: string) => invoke<{ data: unknown }>({ action: "get-pickup", workspace_id: workspaceId, code });
export const createSenditReturn = (workspaceId: string, payload: Record<string, unknown>) => invoke<{ data: unknown }>({ action: "create-return", workspace_id: workspaceId, payload });
export const listSenditReturns = (workspaceId: string) => invoke<{ data: unknown[] }>({ action: "returns", workspace_id: workspaceId });
export const getSenditReturn = (workspaceId: string, code: string) => invoke<{ data: unknown }>({ action: "get-return", workspace_id: workspaceId, code });
