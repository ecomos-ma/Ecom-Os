import { SUPABASE_ANON_KEY, SUPABASE_URL, supabase } from "../lib/supabase";

export type AmeexStatus = {
  connected: boolean;
  enabled?: boolean;
  client_id_last4: string | null;
  client_key_last4: string | null;
  open_on_delivery: boolean;
  try_on_delivery: boolean;
  fragile: boolean;
  last_tested_at: string | null;
  last_test_status: string | null;
};

export type AmeexCityMapping = {
  normalized_city: string;
  display_name: string;
  ameex_city_id: number;
  aliases: string[];
  updated_at: string;
};

export type AmeexShipmentStatus = "created" | "reconciled" | "already_linked" | "not_found" | "conflict" | "uncertain" | "failed";

export type AmeexShipmentResult = {
  status: Extract<AmeexShipmentStatus, "created" | "reconciled" | "already_linked">;
  code: string;
  provider: string;
  tracking_number: string;
  trackingNumber: string;
  shipping_status: string | null;
  raw_status: string | null;
  reconciled?: boolean;
  reconciled_after_create?: boolean;
  request_id?: string;
  message?: string;
};

export class AmeexApiError extends Error {
  readonly code?: string;
  readonly status?: AmeexShipmentStatus;
  readonly trackingNumber?: string;
  readonly requestId?: string;
  readonly httpStatus?: number;

  constructor(payload: { message?: unknown; code?: unknown; status?: unknown; trackingNumber?: unknown; tracking_number?: unknown; request_id?: unknown }, httpStatus?: number) {
    super(typeof payload?.message === "string" ? payload.message : "Ameex request failed.");
    this.name = "AmeexApiError";
    this.code = typeof payload?.code === "string" ? payload.code : undefined;
    this.status = typeof payload?.status === "string" ? payload.status as AmeexShipmentStatus : undefined;
    this.trackingNumber = typeof payload?.trackingNumber === "string"
      ? payload.trackingNumber
      : typeof payload?.tracking_number === "string"
        ? payload.tracking_number
        : undefined;
    this.requestId = typeof payload?.request_id === "string" ? payload.request_id : undefined;
    this.httpStatus = httpStatus;
  }
}

type AmeexResponse<T> = { success: boolean; message?: string; code?: string; status?: AmeexShipmentStatus } & T;

async function invoke<T>(body: Record<string, unknown>): Promise<AmeexResponse<T>> {
  const { data, error } = await supabase.functions.invoke("ameex-api", { body });
  if (error) {
    const response = (error as { context?: Response }).context;
    if (response instanceof Response) {
      const payload = await response.json().catch(() => null);
      if (payload && typeof payload === "object") throw new AmeexApiError(payload, response.status);
    }
    throw new Error(error.message || "Unable to contact Ameex.");
  }
  if (!data?.success) throw new AmeexApiError(data || {});
  return data as AmeexResponse<T>;
}

async function fetchPrintable(body: Record<string, unknown>) {
  const { data: { session } } = await supabase.auth.getSession();
  if (!session) throw new Error("Authentication is required.");
  const response = await fetch(`${SUPABASE_URL}/functions/v1/ameex-api`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${session.access_token}`,
      apikey: SUPABASE_ANON_KEY,
      "Content-Type": "application/json",
    },
    body: JSON.stringify(body),
  });
  if (!response.ok) {
    const payload = await response.json().catch(() => null);
    throw new Error(payload?.message || "Ameex could not prepare the printable document.");
  }
  return response.text();
}

export const getAmeexStatus = (workspaceId: string) => invoke<AmeexStatus>({ action: "status", workspace_id: workspaceId });
export const saveAmeexCredentials = (workspaceId: string, clientApiId: string, clientApiKey: string) =>
  invoke<Pick<AmeexStatus, "connected" | "client_id_last4" | "client_key_last4">>({ action: "set-credentials", workspace_id: workspaceId, client_api_id: clientApiId, client_api_key: clientApiKey });
export const testAmeexConnection = (workspaceId: string) => invoke<{ message: string; catalog_summary?: string }>({ action: "test-connection", workspace_id: workspaceId });
export const disconnectAmeex = (workspaceId: string) => invoke<{ connected: boolean }>({ action: "disconnect", workspace_id: workspaceId });
export const updateAmeexPreferences = (workspaceId: string, preferences: Pick<AmeexStatus, "open_on_delivery" | "try_on_delivery" | "fragile">) =>
  invoke<{}>({ action: "update-preferences", workspace_id: workspaceId, ...preferences });
export const createAmeexParcel = (workspaceId: string, orderId: string) =>
  invoke<AmeexShipmentResult>({ action: "create-parcel", workspace_id: workspaceId, order_id: orderId });
export const reconcileAmeexParcel = (workspaceId: string, orderId: string) =>
  invoke<AmeexShipmentResult>({ action: "reconcile-parcel", workspace_id: workspaceId, order_id: orderId });
export const syncAmeexTracking = (workspaceId: string, orderId: string) =>
  invoke<{ tracking_number: string; shipping_status: string | null; raw_status: string | null }>({ action: "tracking", workspace_id: workspaceId, order_id: orderId });
export const syncAmeexMassTracking = (workspaceId: string, orderIds: string[]) =>
  invoke<{ updated: number; failures: string[]; unmatched_codes: string[] }>({ action: "mass-tracking", workspace_id: workspaceId, order_ids: orderIds });
export const getAmeexParcelInfo = (workspaceId: string, orderId: string) => invoke<{ data: unknown }>({ action: "get-parcel-info", workspace_id: workspaceId, order_id: orderId });
export const editAmeexParcel = (workspaceId: string, orderId: string, changes: Record<string, unknown>) => invoke<{}>({ action: "edit-parcel", workspace_id: workspaceId, order_id: orderId, changes });
export const deleteAmeexParcel = (workspaceId: string, orderId: string) => invoke<{}>({ action: "delete-parcel", workspace_id: workspaceId, order_id: orderId });
export const relaunchAmeexParcel = (workspaceId: string, orderId: string) => invoke<{}>({ action: "relaunch", workspace_id: workspaceId, order_id: orderId });
export const relaunchAmeexParcelForNewCustomer = (workspaceId: string, orderId: string, changes: Record<string, unknown>) => invoke<{}>({ action: "relaunch-new", workspace_id: workspaceId, order_id: orderId, changes });
export const requestAmeexPickup = (workspaceId: string, pickup: { city: string; address: string; phone: string; note?: string }) => invoke<{}>({ action: "pickup", workspace_id: workspaceId, ...pickup });

export const printAmeexLabels = (workspaceId: string, orderIds: string[], labelType: "Label_100_100" | "Label_A4" | "Label_A4_8" = "Label_A4") =>
  fetchPrintable({ action: "print-labels-for-orders", workspace_id: workspaceId, order_ids: orderIds, label_type: labelType });
export const printAmeexDeliveryNote = (workspaceId: string, reference: string) =>
  fetchPrintable({ action: "print-note", workspace_id: workspaceId, reference });
