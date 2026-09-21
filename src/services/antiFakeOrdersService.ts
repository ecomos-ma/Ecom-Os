import { supabase } from "../lib/supabase";

const PUBLIC_ECOMOS_ANTI_FAKE_ENDPOINT = "https://www.ecomos.ma/api/anti-fake-orders";

export type AntiFakeBlockMode = "message" | "cyber_prank";
export type AntiFakeRuleType = "ip" | "phone" | "name" | "address" | "address_contains";

export interface AntiFakeStore {
  id: string;
  workspace_id: string;
  store_url: string;
  hostname: string;
  site_key: string;
  enabled: boolean;
  customer_guard_enabled: boolean;
  default_block_mode: AntiFakeBlockMode;
  default_message: string;
  created_at: string;
  updated_at: string;
}

export interface AntiFakeRule {
  id: string;
  workspace_id: string;
  store_id: string;
  rule_type: AntiFakeRuleType;
  rule_value: string;
  normalized_value: string | null;
  ip_address: string | null;
  block_mode: AntiFakeBlockMode;
  message: string | null;
  note: string;
  enabled: boolean;
  starts_at: string;
  expires_at: string | null;
  hit_count: number;
  last_hit_at: string | null;
  created_at: string;
  updated_at: string;
}

export interface AntiFakeDashboard {
  store: AntiFakeStore | null;
  rules: AntiFakeRule[];
}

async function invoke<T>(body: Record<string, unknown>): Promise<T> {
  const { data: sessionData, error: sessionError } = await supabase.auth.getSession();
  const expiresAt = sessionData.session?.expires_at ?? 0;
  if (!sessionData.session || expiresAt * 1000 <= Date.now() + 60_000) {
    const refreshed = await supabase.auth.refreshSession();
    if (refreshed.error || !refreshed.data.session) {
      throw new Error("Your EcomOS session has expired. Please sign in again.");
    }
  } else if (sessionError) {
    throw new Error("Your EcomOS session could not be verified. Please sign in again.");
  }

  const { data, error } = await supabase.functions.invoke("anti-fake-orders", { body });
  if (error) {
    let message = error.message || "Anti-Fake Orders request failed";
    const context = (error as { context?: Response }).context;
    if (context) {
      try {
        const payload = await context.clone().json() as { error?: unknown };
        if (typeof payload.error === "string" && payload.error.trim()) message = payload.error.trim();
      } catch {
        // Keep the transport error if the Edge Function did not return JSON.
      }
    }
    throw new Error(message);
  }
  if (data?.error) throw new Error(String(data.error));
  return data as T;
}

export function antiFakeOrdersEndpoint(): string {
  return PUBLIC_ECOMOS_ANTI_FAKE_ENDPOINT;
}

function htmlAttributeValue(value: string): string {
  return value
    .replace(/&(?!(?:amp|lt|gt|quot|#39);)/g, "&amp;")
    .replace(/"/g, "&quot;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;");
}

export function buildYouCanGuardSnippet(store: AntiFakeStore): string {
  const endpoint = antiFakeOrdersEndpoint();
  const functionOrigin = new URL(endpoint).origin;
  const source = `${endpoint}?site_key=${encodeURIComponent(store.site_key)}&host=${encodeURIComponent(store.hostname)}`;
  const escapedSource = htmlAttributeValue(source);
  const escapedOrigin = htmlAttributeValue(functionOrigin);

  return `<!-- EcomOS Anti-Fake Orders — paste once in YouCan Additional header code -->
<link rel="preconnect" href="${escapedOrigin}" crossorigin>
<script async src="${escapedSource}"></script>`;
}

export const antiFakeOrdersService = {
  load: (workspaceId: string) => invoke<AntiFakeDashboard>({ action: "load", workspace_id: workspaceId }),
  saveStore: (workspaceId: string, input: {
    storeUrl: string;
    enabled: boolean;
    customerGuardEnabled: boolean;
    defaultBlockMode: AntiFakeBlockMode;
    defaultMessage: string;
  }) => invoke<{ store: AntiFakeStore }>({
    action: "save_store",
    workspace_id: workspaceId,
    store_url: input.storeUrl,
    enabled: input.enabled,
    customer_guard_enabled: input.customerGuardEnabled,
    default_block_mode: input.defaultBlockMode,
    default_message: input.defaultMessage,
  }),
  addRule: (workspaceId: string, input: {
    ruleType: AntiFakeRuleType;
    ruleValue: string;
    durationHours: number | null;
    blockMode: AntiFakeBlockMode;
    message?: string;
    note?: string;
  }) => invoke<{ rule: AntiFakeRule }>({
    action: "add_rule",
    workspace_id: workspaceId,
    rule_type: input.ruleType,
    rule_value: input.ruleValue,
    duration_hours: input.durationHours,
    block_mode: input.blockMode,
    message: input.message,
    note: input.note,
  }),
  setRuleEnabled: (workspaceId: string, ruleId: string, enabled: boolean) =>
    invoke<{ rule: AntiFakeRule }>({
      action: "set_rule_enabled",
      workspace_id: workspaceId,
      rule_id: ruleId,
      enabled,
    }),
  deleteRule: (workspaceId: string, ruleId: string) => invoke<{ success: boolean }>({
    action: "delete_rule",
    workspace_id: workspaceId,
    rule_id: ruleId,
  }),
};
