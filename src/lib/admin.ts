import { supabase } from "./supabase";
import type { PlatformMetrics, SearchResult, PlatformSettings, PlatformNotification, SubscriptionPlan, WorkspaceSubscription, WorkspaceInvoice } from "./types";

export async function fetchPlatformMetrics() {
  const { data, error } = await supabase.rpc("get_admin_platform_metrics");
  if (error) throw error;
  return data as PlatformMetrics;
}

export async function searchPlatform(query: string) {
  const { data, error } = await supabase.rpc("admin_search", { query });
  if (error) throw error;
  return data as SearchResult[];
}

export async function fetchPlatformSettings() {
  const { data, error } = await supabase.from("platform_settings").select("*").single();
  if (error) throw error;
  return data as PlatformSettings;
}

export async function updatePlatformSettings(settings: Partial<PlatformSettings>) {
  const { data, error } = await supabase.from("platform_settings").update(settings).match({ settings_key: "default" }).single();
  if (error) throw error;
  return data as PlatformSettings;
}

export async function fetchSubscriptionPlans() {
  const { data, error } = await supabase.from("subscription_plans").select("*");
  if (error) throw error;
  return data as SubscriptionPlan[];
}

export async function fetchWorkspaceSubscriptions() {
  const { data, error } = await supabase
    .from("workspace_subscriptions")
    .select("*, plan:subscription_plans(*), workspace:workspaces(id, name, created_at), profiles:profiles!inner(id, full_name, email)");
  if (error) throw error;
  return data as WorkspaceSubscription[];
}

export async function fetchWorkspaceInvoices() {
  const { data, error } = await supabase.from("workspace_invoices").select("*");
  if (error) throw error;
  return data as WorkspaceInvoice[];
}

export async function resetWorkspaceData(
  workspaceId: string, 
  userId: string,
  onProgress?: (stage: string, progress: number) => void
) {
  // Simple reset with fake progress for UI
  if (onProgress) {
    onProgress('disabling_integrations', 10);
    setTimeout(() => onProgress('deleting_storage', 20), 200);
    setTimeout(() => onProgress('deleting_data', 50), 400);
    setTimeout(() => onProgress('resetting_settings', 80), 600);
    setTimeout(() => onProgress('completing', 100), 800);
  }
  
  const { data, error } = await supabase.rpc("reset_workspace_simple", {
    p_workspace_id: workspaceId,
    p_user_id: userId
  });
  
  if (error) throw error;
  
  // Check if the function returned success
  if (data && data.success === false) {
    throw new Error(data.error || "Workspace reset failed");
  }
  
  return data;
}
