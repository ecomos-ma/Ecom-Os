import {
  TikTokError,
  authenticateRequest,
  authorizeWorkspace,
  corsHeaders,
  encryptSecret,
  errorResponse,
  jsonResponse,
  serviceClient,
} from "../_shared/tiktok.ts";
import { syncWorkspace } from "../_shared/tiktok-sync.ts";

type AdvertiserAction = "select" | "toggle_account" | "remove_account" | "set_auto_sync" | "configure_events" | "set_workspace_currency";
interface AdvertiserBody {
  workspace_id?: string;
  action?: AdvertiserAction;
  advertiser_ids?: string[];
  advertiser_id?: string;
  enabled?: boolean;
  event_source_id?: string;
  events_access_token?: string;
  test_event_code?: string;
  connection_id?: string;
  reporting_currency?: string;
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  if (req.method !== "POST") return jsonResponse({ error: "Method not allowed" }, 405);
  try {
    const client = serviceClient();
    const user = await authenticateRequest(req, client);
    const body = await req.json() as AdvertiserBody;
    const workspaceId = body.workspace_id?.trim();
    if (!workspaceId || !body.action) return jsonResponse({ error: "workspace_id and action are required" }, 400);
    await authorizeWorkspace(client, user.id, workspaceId, true);

    if (body.action === "select") {
      const selected = [...new Set((body.advertiser_ids ?? []).map(String).filter(Boolean))];
      if (selected.length === 0) return jsonResponse({ error: "Select at least one advertiser account" }, 400);
      const { data: available } = await client.from("tiktok_ad_accounts").select("advertiser_id").eq("workspace_id", workspaceId).in("advertiser_id", selected);
      if ((available ?? []).length !== selected.length) throw new TikTokError("An advertiser account is no longer authorized", "permission", 403);
      await client.from("tiktok_ad_accounts").update({ is_enabled: false, reporting_sync_status: "disabled" }).eq("workspace_id", workspaceId);
      const { error } = await client.from("tiktok_ad_accounts").update({ is_enabled: true, reporting_sync_status: "pending", last_sync_error: null }).eq("workspace_id", workspaceId).in("advertiser_id", selected);
      if (error) throw error;
      await client.from("tiktok_connections").update({ status: "connected", last_sync_error: null }).eq("workspace_id", workspaceId).neq("status", "disconnected");
      const sync = await syncWorkspace(client, workspaceId, { days: 7 });
      return jsonResponse({ success: true, selected: selected.length, initial_sync: sync });
    }

    if (body.action === "toggle_account") {
      if (!body.advertiser_id || typeof body.enabled !== "boolean") return jsonResponse({ error: "advertiser_id and enabled are required" }, 400);
      const { error } = await client.from("tiktok_ad_accounts").update({ is_enabled: body.enabled, reporting_sync_status: body.enabled ? "pending" : "disabled", last_sync_error: null }).eq("workspace_id", workspaceId).eq("advertiser_id", body.advertiser_id);
      if (error) throw error;
      return jsonResponse({ success: true });
    }

    if (body.action === "remove_account") {
      if (!body.advertiser_id) return jsonResponse({ error: "advertiser_id is required" }, 400);
      const { error } = await client.from("tiktok_ad_accounts").delete().eq("workspace_id", workspaceId).eq("advertiser_id", body.advertiser_id);
      if (error) throw error;
      return jsonResponse({ success: true, historical_data_preserved: true });
    }

    if (body.action === "set_auto_sync") {
      if (typeof body.enabled !== "boolean") return jsonResponse({ error: "enabled is required" }, 400);
      const { error } = await client.from("tiktok_connections").update({ auto_sync_enabled: body.enabled }).eq("workspace_id", workspaceId).neq("status", "disconnected");
      if (error) throw error;
      return jsonResponse({ success: true });
    }

    if (body.action === "set_workspace_currency") {
      const currency = body.reporting_currency?.trim().toUpperCase() ?? "";
      if (!/^[A-Z]{3}$/.test(currency)) return jsonResponse({ error: "Enter a valid three-letter ISO currency code" }, 400);
      const { error } = await client.from("workspaces").update({ reporting_currency: currency }).eq("id", workspaceId);
      if (error) throw error;
      return jsonResponse({ success: true, reporting_currency: currency });
    }

    const { data: connection } = body.connection_id
      ? await client.from("tiktok_connections").select("id").eq("workspace_id", workspaceId).eq("id", body.connection_id).neq("status", "disconnected").maybeSingle()
      : await client.from("tiktok_connections").select("id").eq("workspace_id", workspaceId).neq("status", "disconnected").order("created_at", { ascending: false }).limit(1).maybeSingle();
    if (!connection) throw new TikTokError("Connect TikTok Ads before configuring Events API", "configuration", 409);
    const existing = await client.from("tiktok_events_config").select("access_token_encrypted").eq("workspace_id", workspaceId).maybeSingle();
    const encryptedToken = body.events_access_token?.trim()
      ? await encryptSecret(body.events_access_token.trim())
      : existing.data?.access_token_encrypted ?? null;
    if (body.enabled && (!body.event_source_id?.trim() || !encryptedToken)) {
      return jsonResponse({ error: "Event Source ID and access token are required when Events API is enabled" }, 400);
    }
    const { error } = await client.from("tiktok_events_config").upsert({
      workspace_id: workspaceId,
      connection_id: connection.id,
      event_source_id: body.event_source_id?.trim() || null,
      access_token_encrypted: encryptedToken,
      enabled: body.enabled === true,
      test_event_code: body.test_event_code?.trim() || null,
      last_error: null,
    }, { onConflict: "workspace_id" });
    if (error) throw error;
    return jsonResponse({ success: true });
  } catch (error) {
    return errorResponse(error);
  }
});
