import {
  TikTokError,
  authenticateRequest,
  authorizeWorkspace,
  corsHeaders,
  errorResponse,
  isCronRequest,
  jsonResponse,
  serviceClient,
} from "../_shared/tiktok.ts";
import { syncWorkspace } from "../_shared/tiktok-sync.ts";

interface SyncBody {
  workspace_id?: string;
  scheduled?: boolean;
  days?: number;
  start_date?: string;
  end_date?: string;
}

function validDate(value: string | undefined): boolean {
  return Boolean(value && /^\d{4}-\d{2}-\d{2}$/.test(value));
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  if (req.method !== "POST") return jsonResponse({ error: "Method not allowed" }, 405);
  try {
    const client = serviceClient();
    const body = await req.json().catch(() => ({})) as SyncBody;
    const scheduled = isCronRequest(req) && body.scheduled === true;
    const options = validDate(body.start_date) && validDate(body.end_date)
      ? { startDate: body.start_date, endDate: body.end_date }
      : { days: Math.max(1, Math.min(Number(body.days ?? 7), 180)) };

    if (scheduled) {
      const { data: connections, error } = await client
        .from("tiktok_connections")
        .select("workspace_id")
        .eq("auto_sync_enabled", true)
        .in("status", ["connected", "sync_failed"]);
      if (error) throw new TikTokError("Scheduled connections could not be loaded", "temporary", 500, true);
      const workspaceIds = [...new Set((connections ?? []).map((row) => String(row.workspace_id)))];
      const results: Record<string, unknown>[] = [];
      for (const workspaceId of workspaceIds) {
        try {
          results.push({ workspace_id: workspaceId, ...(await syncWorkspace(client, workspaceId, options)) });
        } catch (error) {
          results.push({ workspace_id: workspaceId, success: false, error: error instanceof TikTokError ? error.message : "Sync failed" });
        }
      }
      return jsonResponse({ success: true, scheduled: true, workspaces: results });
    }

    const user = await authenticateRequest(req, client);
    const workspaceId = body.workspace_id?.trim();
    if (!workspaceId) return jsonResponse({ error: "workspace_id is required" }, 400);
    await authorizeWorkspace(client, user.id, workspaceId);
    return jsonResponse(await syncWorkspace(client, workspaceId, options));
  } catch (error) {
    return errorResponse(error);
  }
});
