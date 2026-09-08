import {
  activeConnection,
  authenticateRequest,
  corsHeaders,
  errorResponse,
  fetchAllPages,
  jsonResponse,
  metaRequest,
  resolveActiveWorkspace,
  serviceClient,
} from "../_shared/meta.ts";

type AssetKind = "ad_account" | "page" | "instagram" | "pixel";
type JsonObject = Record<string, unknown>;

const assetConfig: Record<
  AssetKind,
  { table: string; id: string; connectionColumn: string }
> = {
  ad_account: {
    table: "meta_ad_accounts",
    id: "meta_ad_account_id",
    connectionColumn: "default_ad_account_id",
  },
  page: {
    table: "meta_pages",
    id: "meta_page_id",
    connectionColumn: "default_page_id",
  },
  instagram: {
    table: "meta_instagram_accounts",
    id: "meta_instagram_account_id",
    connectionColumn: "default_instagram_account_id",
  },
  pixel: {
    table: "meta_pixels",
    id: "meta_pixel_id",
    connectionColumn: "default_pixel_id",
  },
};

async function persist(
  request: PromiseLike<{ error: unknown }>,
): Promise<void> {
  const { error } = await request;
  if (error) throw error;
}

async function refreshAssets(
  client: ReturnType<typeof serviceClient>,
  workspaceId: string,
  connectionId: string,
  token: string,
) {
  const [accounts, pages, businesses] = await Promise.all([
    fetchAllPages<JsonObject>("me/adaccounts", {
      token,
      query: {
        fields:
          "id,name,currency,timezone_name,timezone_offset_hours_utc,account_status,disable_reason,amount_spent,balance,business",
        limit: 500,
      },
    }),
    fetchAllPages<JsonObject>("me/accounts", {
      token,
      query: {
        fields:
          "id,name,category,picture{url},instagram_business_account{id,username,name,profile_picture_url,followers_count},connected_instagram_account{id,username,name,profile_picture_url,followers_count}",
        limit: 500,
      },
    }),
    fetchAllPages<JsonObject>("me/businesses", {
      token,
      query: { fields: "id,name,verification_status", limit: 200 },
    }),
  ]);
  const now = new Date().toISOString();
  await persist(
    client
      .from("meta_ad_accounts")
      .update({ is_enabled: false })
      .eq("workspace_id", workspaceId),
  );
  if (businesses.length)
    await persist(
      client.from("meta_businesses").upsert(
        businesses.map((row) => ({
          workspace_id: workspaceId,
          connection_id: connectionId,
          meta_business_id: String(row.id),
          name: String(row.name ?? row.id),
          verification_status: row.verification_status
            ? String(row.verification_status)
            : null,
          raw_data: row,
          synced_at: now,
        })),
        { onConflict: "workspace_id,meta_business_id" },
      ),
    );
  if (accounts.length)
    await persist(
      client.from("meta_ad_accounts").upsert(
        accounts.map((row) => ({
          workspace_id: workspaceId,
          connection_id: connectionId,
          meta_ad_account_id: String(row.id),
          account_name: String(row.name ?? row.id),
          currency: row.currency ? String(row.currency).toUpperCase() : null,
          timezone_name: row.timezone_name ? String(row.timezone_name) : null,
          timezone_offset_hours:
            row.timezone_offset_hours_utc == null
              ? null
              : Number(row.timezone_offset_hours_utc),
          account_status:
            row.account_status == null ? null : Number(row.account_status),
          disable_reason:
            row.disable_reason == null ? null : Number(row.disable_reason),
          amount_spent:
            row.amount_spent == null ? null : Number(row.amount_spent) / 100,
          balance: row.balance == null ? null : Number(row.balance) / 100,
          is_enabled: true,
          raw_data: row,
        })),
        { onConflict: "workspace_id,meta_ad_account_id" },
      ),
    );
  const igRows: JsonObject[] = [];
  if (pages.length)
    await persist(
      client.from("meta_pages").upsert(
        pages.map((row) => {
          for (const key of [
            "instagram_business_account",
            "connected_instagram_account",
          ]) {
            const ig = row[key];
            if (ig && typeof ig === "object" && (ig as JsonObject).id)
              igRows.push({ ...(ig as JsonObject), page_id: row.id });
          }
          const picture =
            row.picture && typeof row.picture === "object"
              ? (row.picture as JsonObject)
              : {};
          const data =
            picture.data && typeof picture.data === "object"
              ? (picture.data as JsonObject)
              : {};
          return {
            workspace_id: workspaceId,
            connection_id: connectionId,
            meta_page_id: String(row.id),
            name: String(row.name ?? row.id),
            category: row.category ? String(row.category) : null,
            picture_url: data.url ? String(data.url) : null,
            raw_data: row,
            synced_at: now,
          };
        }),
        { onConflict: "workspace_id,meta_page_id" },
      ),
    );
  const uniqueIg = [
    ...new Map(igRows.map((row) => [String(row.id), row])).values(),
  ];
  if (uniqueIg.length)
    await persist(
      client.from("meta_instagram_accounts").upsert(
        uniqueIg.map((row) => ({
          workspace_id: workspaceId,
          connection_id: connectionId,
          meta_instagram_account_id: String(row.id),
          page_id: String(row.page_id),
          username: row.username ? String(row.username) : null,
          name: row.name ? String(row.name) : null,
          profile_picture_url: row.profile_picture_url
            ? String(row.profile_picture_url)
            : null,
          followers_count:
            row.followers_count == null ? null : Number(row.followers_count),
          raw_data: row,
          synced_at: now,
        })),
        { onConflict: "workspace_id,meta_instagram_account_id" },
      ),
    );
  const pixelGroups = await Promise.all(
    accounts.map(async (account) => {
      try {
        return await fetchAllPages<JsonObject>(`${account.id}/adspixels`, {
          token,
          query: {
            fields: "id,name,last_fired_time,is_unavailable",
            limit: 200,
          },
        }).then((rows) =>
          rows.map((row) => ({ ...row, ad_account_id: account.id })),
        );
      } catch {
        return [];
      }
    }),
  );
  const pixels = pixelGroups.flat() as JsonObject[];
  if (pixels.length)
    await persist(
      client.from("meta_pixels").upsert(
        pixels.map((row) => ({
          workspace_id: workspaceId,
          connection_id: connectionId,
          ad_account_id: String(row.ad_account_id),
          meta_pixel_id: String(row.id),
          name: String(row.name ?? row.id),
          last_fired_time: row.last_fired_time
            ? String(row.last_fired_time)
            : null,
          is_unavailable: row.is_unavailable === true,
          raw_data: row,
          synced_at: now,
        })),
        { onConflict: "workspace_id,meta_pixel_id" },
      ),
    );
  return {
    ad_accounts: accounts.length,
    pages: pages.length,
    instagram_accounts: uniqueIg.length,
    pixels: pixels.length,
  };
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS")
    return new Response("ok", { headers: corsHeaders(req) });
  if (req.method !== "POST")
    return jsonResponse(req, { error: "Method not allowed" }, 405);
  try {
    const client = serviceClient();
    const user = await authenticateRequest(req, client);
    const body = (await req.json().catch(() => ({}))) as {
      action?: string;
      kind?: AssetKind;
      asset_id?: string;
      enabled?: boolean;
    };
    const manage = body.action !== "status";
    const { workspaceId } = await resolveActiveWorkspace(
      client,
      user.id,
      manage,
    );
    if (!body.action || body.action === "status") {
      const { data, error } = await client.rpc("get_meta_integration_status", {
        p_workspace_id: workspaceId,
      });
      if (error) throw error;
      return jsonResponse(req, data);
    }
    const connection = await activeConnection(client, workspaceId);
    if (body.action === "refresh") {
      const counts = await refreshAssets(
        client,
        workspaceId,
        connection.id,
        connection.accessToken,
      );
      await metaRequest("me", {
        token: connection.accessToken,
        query: { fields: "id" },
        retries: 1,
      });
      await client
        .from("meta_connections")
        .update({
          last_health_check_at: new Date().toISOString(),
          status: "connected",
          last_sync_error: null,
        })
        .eq("id", connection.id);
      return jsonResponse(req, { success: true, ...counts });
    }
    if (body.action === "set_default") {
      if (!body.kind || !assetConfig[body.kind] || !body.asset_id)
        return jsonResponse(
          req,
          { error: "kind and asset_id are required" },
          400,
        );
      const config = assetConfig[body.kind];
      const { data: asset, error: assetError } = await client
        .from(config.table)
        .select(config.id)
        .eq("workspace_id", workspaceId)
        .eq("connection_id", connection.id)
        .eq(config.id, body.asset_id)
        .maybeSingle();
      if (assetError || !asset)
        return jsonResponse(
          req,
          { error: "Selected asset is not available in this workspace" },
          403,
        );
      await client
        .from(config.table)
        .update({ is_default: false })
        .eq("workspace_id", workspaceId);
      const { error: defaultError } = await client
        .from(config.table)
        .update({ is_default: true })
        .eq("workspace_id", workspaceId)
        .eq(config.id, body.asset_id);
      if (defaultError) throw defaultError;
      const { error: connectionError } = await client
        .from("meta_connections")
        .update({ [config.connectionColumn]: body.asset_id })
        .eq("id", connection.id);
      if (connectionError) throw connectionError;
      return jsonResponse(req, { success: true });
    }
    if (body.action === "set_auto_sync" || body.action === "set_automation") {
      if (typeof body.enabled !== "boolean")
        return jsonResponse(req, { error: "enabled is required" }, 400);
      const column =
        body.action === "set_auto_sync"
          ? "auto_sync_enabled"
          : "automation_enabled";
      const { error } = await client
        .from("meta_connections")
        .update({ [column]: body.enabled })
        .eq("id", connection.id);
      if (error) throw error;
      return jsonResponse(req, { success: true });
    }
    return jsonResponse(req, { error: "Unsupported action" }, 400);
  } catch (error) {
    return errorResponse(req, error);
  }
});
