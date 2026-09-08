import { authenticateRequest, corsHeaders, errorResponse, isCronRequest, jsonResponse, resolveActiveWorkspace, serviceClient } from "../_shared/meta.ts";
import { syncWorkspace } from "../_shared/meta-sync.ts";

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders(req) });
  if (req.method !== "POST") return jsonResponse(req, { error: "Method not allowed" }, 405);
  try {
    const client = serviceClient();
    const body = await req.json().catch(() => ({})) as { scheduled?: boolean; days?: number; since?: string; until?: string; time_range?: { since?: string; until?: string }; date_preset?: string; ad_account_id?: string };
    if (body.scheduled && isCronRequest(req)) {
      const { data: connections } = await client.from("meta_connections").select("workspace_id").eq("auto_sync_enabled", true).in("status", ["connected", "syncing", "sync_failed"]);
      const results = [];
      for (const row of connections ?? []) {
        try { results.push({ workspace_id: row.workspace_id, ...(await syncWorkspace(client, String(row.workspace_id), { days: body.days ?? 3 })) }); }
        catch (error) { results.push({ workspace_id: row.workspace_id, success: false, error: error instanceof Error ? error.message : "Sync failed" }); }
      }
      return jsonResponse(req, { success: true, workspaces: results });
    }
    const user = await authenticateRequest(req, client);
    const { workspaceId } = await resolveActiveWorkspace(client, user.id, false);
    const presetDays: Record<string, number> = { today: 1, yesterday: 2, last_3d: 3, last_7d: 7, last_14d: 14, last_30d: 30, maximum: 90 };
    const result = await syncWorkspace(client, workspaceId, {
      days: body.days ?? presetDays[body.date_preset ?? ""] ?? 3,
      since: body.time_range?.since ?? body.since,
      until: body.time_range?.until ?? body.until,
      adAccountId: body.ad_account_id,
    });
    const totals = result.results.reduce((acc, row) => ({ campaigns: acc.campaigns + row.campaigns, adsets: acc.adsets + row.adsets, ads: acc.ads + row.ads, creatives: acc.creatives + row.creatives, insights: acc.insights + row.insights }), { campaigns: 0, adsets: 0, ads: 0, creatives: 0, insights: 0 });
    return jsonResponse(req, { ...result, ...totals, synced: totals.campaigns });
  } catch (error) { return errorResponse(req, error); }
});
