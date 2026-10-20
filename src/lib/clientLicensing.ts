import { supabase } from "./supabase";

export type ClientLicenseStatus = "active" | "disabled" | "archived" | "revoked";
export type LicenseDomainStatus = "active" | "disabled" | "removed";

export type LicenseDomain = {
  id: string;
  hostname: string;
  status: LicenseDomainStatus;
  created_at: string;
  updated_at: string;
  last_check_at: string | null;
  disabled_at: string | null;
  removed_at: string | null;
};

export type LicenseEvent = {
  id: number;
  event_type: string;
  hostname: string | null;
  metadata: Record<string, unknown>;
  created_at: string;
  actor_id: string | null;
};

export type UnauthorizedThemeMessage = {
  title: string;
  message: string;
  primary_button_text: string;
  primary_button_url: string;
  secondary_button_text: string | null;
  secondary_button_url: string | null;
};

export type UnauthorizedThemeMessageInput = UnauthorizedThemeMessage & {
  has_custom_unauthorized_message?: boolean;
};

export type ClientLicense = {
  id: string;
  client_name: string;
  phone: string;
  email: string | null;
  theme_name: string;
  license_display: string;
  license_key?: string | null;
  price: number;
  currency: string;
  status: ClientLicenseStatus;
  notes: string | null;
  order_reference: string | null;
  payment_notes: string | null;
  created_at: string;
  updated_at: string;
  disabled_at: string | null;
  archived_at: string | null;
  revoked_at: string | null;
  last_check_at: string | null;
  has_custom_unauthorized_message: boolean;
  unauthorized_message: UnauthorizedThemeMessage | null;
  domains: LicenseDomain[];
  events?: LicenseEvent[];
};

export type LicenseStats = {
  total_clients: number;
  active_licenses: number;
  authorized_domains: number;
  total_revenue: Record<string, number>;
  disabled_licenses: number;
  archived_licenses: number;
};

export type ClientLicenseInput = {
  client_name: string;
  phone: string;
  email: string;
  theme_name: string;
  price: number | string;
  currency: string;
  notes: string;
  order_reference: string;
  payment_notes: string;
  domains?: string[];
};

export type LicenseFilters = {
  search?: string;
  status?: ClientLicenseStatus | "all";
  currency?: string;
  date_from?: string;
  date_to?: string;
};

async function call<T>(body: Record<string, unknown>): Promise<T> {
  const { data, error } = await supabase.functions.invoke("theme-domain-licensing", { body });
  if (data?.error) throw new Error(String(data.error));
  if (error) {
    const context = (error as { context?: Response }).context;
    if (context && typeof context.clone === "function") {
      try {
        const payload = await context.clone().json() as { error?: string };
        if (payload.error) throw new Error(payload.error);
      } catch (contextError) {
        if (contextError instanceof Error && contextError.message !== "Unexpected end of JSON input") throw contextError;
      }
    }
    throw error;
  }
  return data as T;
}

export const clientLicensing = {
  list: (filters: LicenseFilters = {}) => call<{ licenses: ClientLicense[]; stats: LicenseStats; currencies: string[] }>({ action: "list", ...filters }),
  get: (id: string) => call<{ license: ClientLicense }>({ action: "get", id }),
  create: (input: ClientLicenseInput) => call<{ license: ClientLicense; code: string }>({ action: "create", ...input }),
  update: (id: string, input: ClientLicenseInput) => call<{ license: ClientLicense }>({ action: "update", id, ...input }),
  setStatus: (id: string, action: "disable" | "enable" | "archive" | "restore" | "revoke") => call<{ license: ClientLicense }>({ action, id }),
  domainAction: (id: string, hostname: string, domainAction: "add" | "disable" | "enable" | "remove") => call<{ license: ClientLicense }>({ action: "domain_action", id, hostname, domain_action: domainAction }),
  rotate: (id: string) => call<{ license: ClientLicense; code: string }>({ action: "rotate", id }),
  lookup: (license: string) => call<{ found: boolean; license?: ClientLicense }>({ action: "lookup", license }),
  getUnauthorizedMessageDefault: () => call<{ message: UnauthorizedThemeMessage }>({ action: "get_unauthorized_message_default" }),
  updateUnauthorizedMessage: (id: string, message: UnauthorizedThemeMessageInput) => call<{ license: ClientLicense }>({ action: "update_unauthorized_message", id, unauthorized_message: message }),
  updateUnauthorizedMessageDefault: (message: UnauthorizedThemeMessage) => call<{ message: UnauthorizedThemeMessage }>({ action: "update_unauthorized_message_default", unauthorized_message: message }),
};
