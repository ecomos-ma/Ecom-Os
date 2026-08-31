import {
  assertOnlyKeys,
  authenticate,
  authorizeWorkspace,
  corsHeaders,
  errorResponse,
  HttpError,
  json,
  requireUuid,
  serviceClient,
} from "../_shared/security.ts";

const WORKSPACE_BUCKETS = ["product-images", "call-recordings", "whatsapp-audio", "profile-images"] as const;
const STORAGE_PAGE_SIZE = 1000;

type ResetResult = {
  success: boolean;
  workspace_id: string;
  workspace_name: string;
  deleted_counts: Record<string, number>;
  deleted_total: number;
  database_verified_empty: boolean;
  integrations_disconnected: boolean;
  owner_preserved: boolean;
  subscription_preserved: boolean;
  reset_at: string;
};

async function listFiles(client: ReturnType<typeof serviceClient>, bucket: string, prefix: string): Promise<string[]> {
  const files: string[] = [];
  const pendingPrefixes = [prefix];

  while (pendingPrefixes.length > 0) {
    const currentPrefix = pendingPrefixes.pop()!;
    let offset = 0;

    while (true) {
      const { data, error } = await client.storage.from(bucket).list(currentPrefix, {
        limit: STORAGE_PAGE_SIZE,
        offset,
        sortBy: { column: "name", order: "asc" },
      });
      if (error) throw error;

      for (const item of data ?? []) {
        const path = `${currentPrefix}/${item.name}`;
        if (item.id) files.push(path);
        else pendingPrefixes.push(path);
      }

      if (!data || data.length < STORAGE_PAGE_SIZE) break;
      offset += data.length;
    }
  }

  return files;
}

async function removeWorkspaceFiles(client: ReturnType<typeof serviceClient>, workspaceId: string) {
  const deletedByBucket: Record<string, number> = {};

  for (const bucket of WORKSPACE_BUCKETS) {
    const paths = await listFiles(client, bucket, workspaceId);
    let removed = 0;
    for (let index = 0; index < paths.length; index += STORAGE_PAGE_SIZE) {
      const batch = paths.slice(index, index + STORAGE_PAGE_SIZE);
      const { error } = await client.storage.from(bucket).remove(batch);
      if (error) throw error;
      removed += batch.length;
    }
    deletedByBucket[bucket] = removed;
  }

  return deletedByBucket;
}

async function disconnectWhatsAppSession(workspaceId: string): Promise<string | null> {
  const workerUrl = Deno.env.get("WHATSAPP_WORKER_URL")?.trim();
  const workerSecret = Deno.env.get("WHATSAPP_WORKER_API_SECRET")?.trim();
  if (!workerUrl || !workerSecret) return "WhatsApp worker was not configured; local session data was removed.";

  try {
    const response = await fetch(new URL("disconnect", `${workerUrl.replace(/\/$/, "")}/`), {
      method: "POST",
      headers: { Authorization: `Bearer ${workerSecret}`, "Content-Type": "application/json" },
      body: JSON.stringify({ workspace_id: workspaceId, revoke_session: true }),
      signal: AbortSignal.timeout(20_000),
    });
    if (!response.ok) return "The WhatsApp worker did not confirm remote logout; local session data was removed.";
    return null;
  } catch {
    return "The WhatsApp worker could not be reached; local session data was removed.";
  }
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders(req) });
  if (req.method !== "POST") return json(req, { error: "Method not allowed" }, 405);

  try {
    const client = serviceClient();
    const user = await authenticate(req, client);
    const body = await req.json() as Record<string, unknown>;
    assertOnlyKeys(body, ["workspace_id", "confirmation"]);

    const workspaceId = requireUuid(body.workspace_id, "workspace_id");
    const confirmation = typeof body.confirmation === "string" ? body.confirmation : "";
    await authorizeWorkspace(client, user.id, workspaceId, ["owner"]);

    const { data: workspace, error: workspaceError } = await client
      .from("workspaces")
      .select("id, name")
      .eq("id", workspaceId)
      .maybeSingle();
    if (workspaceError || !workspace) throw new HttpError("Workspace not found", 404);
    if (confirmation !== `RESET ${workspace.name}`) throw new HttpError("Confirmation text does not match", 400);

    const warnings: string[] = [];
    const whatsAppWarning = await disconnectWhatsAppSession(workspaceId);
    if (whatsAppWarning) warnings.push(whatsAppWarning);

    const { data: resetData, error: resetError } = await client.rpc("reset_workspace_data_v2", {
      p_workspace_id: workspaceId,
      p_actor_id: user.id,
      p_confirmation: confirmation,
    });
    if (resetError) {
      console.error("[reset-workspace] database_reset_failed", resetError.code);
      throw new HttpError("Workspace data could not be reset", 500);
    }

    let storageDeleted: Record<string, number> = {};
    try {
      storageDeleted = await removeWorkspaceFiles(client, workspaceId);
    } catch (storageError) {
      console.error("[reset-workspace] storage_cleanup_failed", storageError);
      throw new HttpError("Workspace data was reset, but file cleanup is pending. Run reset again to finish.", 503);
    }

    return json(req, {
      ...(resetData as ResetResult),
      success: true,
      storage_verified: true,
      storage_deleted: storageDeleted,
      warnings,
    });
  } catch (error) {
    return errorResponse(req, error);
  }
});
