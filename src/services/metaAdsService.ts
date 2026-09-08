import { supabase } from "../lib/supabase";

export interface MetaAsset { id: string; name?: string; username?: string; currency?: string; timezone?: string; is_default?: boolean; is_enabled?: boolean; last_sync_at?: string | null; last_sync_error?: string | null; [key: string]: unknown }
export interface MetaConnectionStatus {
  state: string;
  connection: null | {
    id: string; status: string; meta_user_id?: string; meta_user_name?: string; granted_scopes?: string[]; declined_scopes?: string[];
    default_ad_account_id?: string | null; default_page_id?: string | null; default_instagram_account_id?: string | null; default_pixel_id?: string | null;
    auto_sync_enabled?: boolean; automation_enabled?: boolean; token_expires_at?: string | null; last_health_check_at?: string | null; last_sync_at?: string | null; last_successful_sync_at?: string | null; last_sync_error?: string | null;
  };
  businesses: MetaAsset[];
  ad_accounts: MetaAsset[];
  pages: MetaAsset[];
  instagram_accounts: MetaAsset[];
  pixels: MetaAsset[];
}

async function invoke<T>(name: string, body: Record<string, unknown>): Promise<T> {
  const { data, error } = await supabase.functions.invoke(name, { body });
  if (error) throw new Error(error.message || `${name} failed`);
  if (data?.error) throw new Error(String(data.error));
  return data as T;
}

export const metaAdsService = {
  status: () => invoke<MetaConnectionStatus>("meta-assets", { action: "status" }),
  connect: async (returnUrl = window.location.href) => {
    const data = await invoke<{ authorize_url: string }>("meta-auth-start", { return_url: returnUrl });
    window.location.assign(data.authorize_url);
  },
  disconnect: () => invoke<{ success: boolean }>("meta-disconnect", {}),
  refreshAssets: () => invoke("meta-assets", { action: "refresh" }),
  setDefault: (kind: "ad_account" | "page" | "instagram" | "pixel", assetId: string) => invoke("meta-assets", { action: "set_default", kind, asset_id: assetId }),
  setAutoSync: (enabled: boolean) => invoke("meta-assets", { action: "set_auto_sync", enabled }),
  setAutomation: (enabled: boolean) => invoke("meta-assets", { action: "set_automation", enabled }),
  sync: (input: { days?: number; since?: string; until?: string; ad_account_id?: string }) => invoke<any>("meta-sync", input),
  manage: (action: string, input: { entity_type?: string; entity_id?: string; ad_account_id?: string; payload?: Record<string, unknown> }) => invoke<any>("meta-manage", { action, ...input }),
  bulk: (body: Record<string, unknown>) => invoke<any>("meta-bulk", body),
  runRule: (ruleId: string, dryRun = false) => invoke<any>("meta-rules", { action: dryRun ? "test" : "run", rule_id: ruleId, dry_run: dryRun }),
};

export async function uploadMetaCreativeFiles(workspaceId: string, files: File[], onProgress?: (completed: number, total: number) => void) {
  if (files.length > 1000) throw new Error("A batch can contain at most 1000 creative files.");
  const queue = files.map((file, index) => ({ file, index }));
  const results: Array<{ name: string; source_url: string; media_type: "image" | "video" }> = new Array(files.length);
  let completed = 0;
  const worker = async () => {
    for (;;) {
      const next = queue.shift(); if (!next) return;
      const safeName = next.file.name.replace(/[^A-Za-z0-9._-]+/g, "-").slice(-120);
      const path = `${workspaceId}/${crypto.randomUUID()}-${safeName}`;
      const { error } = await supabase.storage.from("meta-creatives").upload(path, next.file, { cacheControl: "3600", upsert: false });
      if (error) throw error;
      const { data, error: signedError } = await supabase.storage.from("meta-creatives").createSignedUrl(path, 24 * 60 * 60);
      if (signedError || !data?.signedUrl) throw signedError ?? new Error("Creative upload URL could not be created");
      results[next.index] = { name: next.file.name, source_url: data.signedUrl, media_type: next.file.type.startsWith("video/") ? "video" : "image" };
      completed += 1; onProgress?.(completed, files.length);
    }
  };
  await Promise.all(Array.from({ length: Math.min(4, files.length) }, worker));
  return results;
}
