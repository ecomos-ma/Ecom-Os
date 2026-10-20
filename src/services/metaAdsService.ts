import { supabase } from "../lib/supabase";

async function ensureSession() {
  const { data, error } = await supabase.auth.getSession();
  if (error) throw new Error("Your EcomOS session could not be verified. Please sign in again.");
  if (!data.session || (data.session.expires_at ?? 0) * 1000 <= Date.now() + 60_000) {
    const refreshed = await supabase.auth.refreshSession();
    if (refreshed.error || !refreshed.data.session)
      throw new Error("Your EcomOS session has expired. Please sign in again.");
  }
}

async function functionError(error: { message?: string; context?: unknown }, fallback: string): Promise<Error> {
  let message = error.message || fallback;
  if (error.context instanceof Response) {
    try {
      const payload = await error.context.clone().json() as { error?: unknown };
      if (typeof payload.error === "string" && payload.error.trim()) message = payload.error.trim();
    } catch { /* Preserve the transport error when the response is not JSON. */ }
  }
  return new Error(message);
}

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
  await ensureSession();
  const { data, error } = await supabase.functions.invoke(name, { body });
  if (error) throw await functionError(error, `${name} failed`);
  if (data?.error) throw new Error(String(data.error));
  return data as T;
}

export const metaAdsService = {
  status: () => invoke<MetaConnectionStatus>("meta-assets", { action: "status" }),
  connect: async (returnUrl = window.location.href) => {
    const data = await invoke<{ authorization_url?: string; authorize_url?: string }>("meta-auth-start", { return_url: returnUrl });
    const authorizationUrl = data.authorization_url ?? data.authorize_url;
    if (!authorizationUrl) throw new Error("Meta authorization URL was not returned");
    window.location.assign(authorizationUrl);
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

async function invokeMediaForm(form: FormData) {
  await ensureSession();
  const { data, error } = await supabase.functions.invoke("meta-media-upload", { body: form });
  if (error) throw await functionError(error, "Creative upload failed");
  if (data?.error || !data?.success) throw new Error(String(data?.error ?? "Creative upload failed"));
  return data;
}

async function uploadVideoInChunks(adAccountId: string, file: File, source: "oauth" | "legacy") {
  if (!file.size || file.size > 1024 * 1024 * 1024) throw new Error("Videos must be 1 GB or smaller.");
  const startForm = new FormData();
  startForm.set("phase", "start"); startForm.set("ad_account_id", adAccountId); startForm.set("file_size", String(file.size)); startForm.set("source", source);
  const started = await invokeMediaForm(startForm);
  const ticket = String(started.ticket ?? "");
  if (!ticket) throw new Error("Meta did not open a video upload session.");
  let offset = Number(started.start_offset);
  let end = Number(started.end_offset);
  for (let part = 0; offset !== end && part < 10000; part += 1) {
    if (!Number.isSafeInteger(offset) || !Number.isSafeInteger(end) || offset < 0 || end <= offset || end > file.size || end - offset > 18 * 1024 * 1024)
      throw new Error("Meta returned an invalid video chunk range.");
    const transfer = new FormData();
    transfer.set("phase", "transfer"); transfer.set("ad_account_id", adAccountId); transfer.set("source", source);
    transfer.set("ticket", ticket); transfer.set("start_offset", String(offset));
    transfer.set("file", new File([file.slice(offset, end)], file.name, { type: file.type }));
    const next = await invokeMediaForm(transfer);
    const nextOffset = Number(next.start_offset);
    const nextEnd = Number(next.end_offset);
    if (nextOffset <= offset) throw new Error("Meta did not advance the video upload.");
    offset = nextOffset; end = nextEnd;
  }
  if (offset !== end || offset !== file.size) throw new Error("Video upload did not complete.");
  const finish = new FormData();
  finish.set("phase", "finish"); finish.set("ad_account_id", adAccountId); finish.set("source", source);
  finish.set("ticket", ticket); finish.set("name", file.name);
  return invokeMediaForm(finish);
}

export async function uploadMetaCreativeFiles(adAccountId: string, files: File[], onProgress?: (completed: number, total: number) => void, source: "oauth" | "legacy" = "oauth") {
  if (files.length > 1000) throw new Error("A batch can contain at most 1000 creative files.");
  const queue = files.map((file, index) => ({ file, index }));
  const results: Array<{ name: string; image_hash?: string; video_id?: string; media_type: "image" | "video" }> = new Array(files.length);
  let completed = 0;
  const worker = async () => {
    for (;;) {
      const next = queue.shift(); if (!next) return;
      let data;
      if (next.file.type.startsWith("video/")) data = await uploadVideoInChunks(adAccountId, next.file, source);
      else {
        const form = new FormData();
        form.set("ad_account_id", adAccountId);
        form.set("source", source);
        form.set("file", next.file);
        data = await invokeMediaForm(form);
      }
      results[next.index] = { name: String(data.name), image_hash: data.image_hash, video_id: data.video_id, media_type: data.media_type };
      completed += 1; onProgress?.(completed, files.length);
    }
  };
  await Promise.all(Array.from({ length: Math.min(4, files.length) }, worker));
  return results;
}
