import {
  META_REQUIRED_SCOPES,
  MetaError,
  encryptSecret,
  fetchAllPages,
  metaRequest,
  requiredEnv,
  serviceClient,
  sha256,
} from "../_shared/meta.ts";
import { frontendAppUrl, isTrustedFrontendUrl } from "../_shared/app-url.ts";

type JsonObject = Record<string, unknown>;

function redirect(
  returnUrl: string,
  result: string,
  message?: string,
): Response {
  const target = new URL(
    isTrustedFrontendUrl(returnUrl)
      ? returnUrl
      : `${frontendAppUrl()}/settings?tab=integrations`,
  );
  target.searchParams.set("meta", result);
  if (message) target.searchParams.set("meta_message", message.slice(0, 160));
  return Response.redirect(target.toString(), 302);
}

async function persist(
  request: PromiseLike<{ error: unknown }>,
): Promise<void> {
  const { error } = await request;
  if (error) throw error;
}

async function discoverAssets(
  client: ReturnType<typeof serviceClient>,
  workspaceId: string,
  connectionId: string,
  token: string,
) {
  const me = await metaRequest<JsonObject>("me", {
    token,
    query: { fields: "id,name" },
    retries: 1,
  });
  const permissions = await metaRequest<{ data?: JsonObject[] }>(
    "me/permissions",
    { token, retries: 1 },
  );
  const granted = (permissions.data ?? [])
    .filter((row) => row.status === "granted")
    .map((row) => String(row.permission));
  const declined = (permissions.data ?? [])
    .filter((row) => row.status !== "granted")
    .map((row) => String(row.permission));
  const optional = async <T>(request: Promise<T>, fallback: T): Promise<T> => {
    try {
      return await request;
    } catch {
      return fallback;
    }
  };
  const [businesses, accounts, pages, debugPayload] = await Promise.all([
    optional(
      fetchAllPages<JsonObject>("me/businesses", {
        token,
        query: { fields: "id,name,verification_status", limit: 200 },
      }),
      [],
    ),
    optional(
      fetchAllPages<JsonObject>("me/adaccounts", {
        token,
        query: {
          fields:
            "id,account_id,name,currency,timezone_name,timezone_offset_hours_utc,account_status,disable_reason,amount_spent,balance,business",
          limit: 500,
        },
      }),
      [],
    ),
    optional(
      fetchAllPages<JsonObject>("me/accounts", {
        token,
        query: {
          fields:
            "id,name,category,picture{url},instagram_business_account{id,username,name,profile_picture_url,followers_count},connected_instagram_account{id,username,name,profile_picture_url,followers_count}",
          limit: 500,
        },
      }),
      [],
    ),
    optional(
      metaRequest<JsonObject>("debug_token", {
        token: `${requiredEnv("META_APP_ID")}|${requiredEnv("META_APP_SECRET")}`,
        query: { input_token: token },
        retries: 1,
      }),
      {},
    ),
  ]);
  const now = new Date().toISOString();
  await Promise.all([
    persist(
      client
        .from("meta_ad_accounts")
        .update({ is_default: false, is_enabled: false })
        .eq("workspace_id", workspaceId),
    ),
    persist(
      client
        .from("meta_pages")
        .update({ is_default: false })
        .eq("workspace_id", workspaceId),
    ),
    persist(
      client
        .from("meta_instagram_accounts")
        .update({ is_default: false })
        .eq("workspace_id", workspaceId),
    ),
    persist(
      client
        .from("meta_pixels")
        .update({ is_default: false })
        .eq("workspace_id", workspaceId),
    ),
  ]);
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
        accounts.map((row, index) => ({
          workspace_id: workspaceId,
          connection_id: connectionId,
          business_id:
            row.business && typeof row.business === "object"
              ? String((row.business as JsonObject).id ?? "") || null
              : null,
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
          is_default: index === 0,
          is_enabled: true,
          raw_data: row,
        })),
        { onConflict: "workspace_id,meta_ad_account_id" },
      ),
    );
  const igRows: JsonObject[] = [];
  if (pages.length) {
    await persist(
      client.from("meta_pages").upsert(
        pages.map((row, index) => {
          const picture =
            row.picture && typeof row.picture === "object"
              ? (row.picture as JsonObject)
              : {};
          const pictureData =
            picture.data && typeof picture.data === "object"
              ? (picture.data as JsonObject)
              : {};
          for (const key of [
            "instagram_business_account",
            "connected_instagram_account",
          ]) {
            const ig = row[key];
            if (ig && typeof ig === "object" && (ig as JsonObject).id)
              igRows.push({ ...(ig as JsonObject), page_id: row.id });
          }
          return {
            workspace_id: workspaceId,
            connection_id: connectionId,
            meta_page_id: String(row.id),
            name: String(row.name ?? row.id),
            category: row.category ? String(row.category) : null,
            picture_url: pictureData.url ? String(pictureData.url) : null,
            is_default: index === 0,
            raw_data: row,
            synced_at: now,
          };
        }),
        { onConflict: "workspace_id,meta_page_id" },
      ),
    );
  }
  const uniqueIg = [
    ...new Map(igRows.map((row) => [String(row.id), row])).values(),
  ];
  if (uniqueIg.length)
    await persist(
      client.from("meta_instagram_accounts").upsert(
        uniqueIg.map((row, index) => ({
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
          is_default: index === 0,
          raw_data: row,
          synced_at: now,
        })),
        { onConflict: "workspace_id,meta_instagram_account_id" },
      ),
    );
  const pixelGroups = await Promise.all(
    accounts.map(async (account) => {
      try {
        const payload = await fetchAllPages<JsonObject>(
          `${account.id}/adspixels`,
          {
            token,
            query: {
              fields: "id,name,last_fired_time,is_unavailable",
              limit: 200,
            },
          },
        );
        return payload.map((pixel) => ({
          ...pixel,
          ad_account_id: account.id,
        }));
      } catch {
        return [];
      }
    }),
  );
  const pixels = pixelGroups.flat() as JsonObject[];
  if (pixels.length)
    await persist(
      client.from("meta_pixels").upsert(
        pixels.map((row, index) => ({
          workspace_id: workspaceId,
          connection_id: connectionId,
          ad_account_id: String(row.ad_account_id),
          meta_pixel_id: String(row.id),
          name: String(row.name ?? row.id),
          last_fired_time: row.last_fired_time
            ? String(row.last_fired_time)
            : null,
          is_unavailable: row.is_unavailable === true,
          is_default: index === 0,
          raw_data: row,
          synced_at: now,
        })),
        { onConflict: "workspace_id,meta_pixel_id" },
      ),
    );
  const debugData =
    debugPayload.data && typeof debugPayload.data === "object"
      ? (debugPayload.data as JsonObject)
      : {};
  return {
    me,
    granted,
    declined,
    accounts,
    pages,
    uniqueIg,
    pixels,
    expiresAt: debugData.expires_at
      ? new Date(Number(debugData.expires_at) * 1000).toISOString()
      : null,
  };
}

Deno.serve(async (req) => {
  let fallback = `${frontendAppUrl()}/settings?tab=integrations`;
  try {
    if (req.method !== "GET")
      return new Response("Method not allowed", { status: 405 });
    const url = new URL(req.url);
    const state = url.searchParams.get("state");
    const code = url.searchParams.get("code");
    const denied =
      url.searchParams.get("error") ??
      url.searchParams.get("error_description");
    if (!state)
      return redirect(
        fallback,
        "error",
        "The authorization state was missing.",
      );
    const client = serviceClient();
    const { data: stateRow } = await client
      .from("meta_oauth_states")
      .select(
        "id,workspace_id,user_id,connection_id,return_url,expires_at,consumed_at",
      )
      .eq("state_hash", await sha256(state))
      .maybeSingle();
    if (
      !stateRow ||
      stateRow.consumed_at ||
      new Date(stateRow.expires_at).getTime() <= Date.now()
    )
      return redirect(
        fallback,
        "error",
        "The authorization request expired. Please reconnect.",
      );
    fallback = stateRow.return_url;
    const { data: consumed, error: consumeError } = await client
      .from("meta_oauth_states")
      .update({ consumed_at: new Date().toISOString() })
      .eq("id", stateRow.id)
      .is("consumed_at", null)
      .select("id")
      .maybeSingle();
    if (consumeError || !consumed)
      return redirect(
        fallback,
        "error",
        "This authorization request was already used.",
      );
    if (denied || !code) {
      await client
        .from("meta_connections")
        .update({
          status: "disconnected",
          disconnected_at: new Date().toISOString(),
          last_sync_error: "Authorization cancelled",
        })
        .eq("id", stateRow.connection_id)
        .eq("status", "connecting");
      return redirect(fallback, "error", "Meta authorization was cancelled.");
    }
    const shortToken = await metaRequest<{ access_token?: string }>(
      "oauth/access_token",
      {
        method: "POST",
        body: {
          client_id: requiredEnv("META_APP_ID"),
          client_secret: requiredEnv("META_APP_SECRET"),
          redirect_uri: requiredEnv("META_REDIRECT_URI"),
          code,
        },
        retries: 1,
      },
    );
    if (!shortToken.access_token)
      throw new Error("Meta did not return an access token");
    const longToken = await metaRequest<{
      access_token?: string;
      expires_in?: number;
    }>("oauth/access_token", {
      method: "POST",
      body: {
        grant_type: "fb_exchange_token",
        client_id: requiredEnv("META_APP_ID"),
        client_secret: requiredEnv("META_APP_SECRET"),
        fb_exchange_token: shortToken.access_token,
      },
      retries: 1,
    });
    const token = longToken.access_token ?? shortToken.access_token;
    const assets = await discoverAssets(
      client,
      stateRow.workspace_id,
      stateRow.connection_id,
      token,
    );
    const missing = META_REQUIRED_SCOPES.filter(
      (scope) => !assets.granted.includes(scope),
    );
    const defaults = {
      default_ad_account_id: assets.accounts[0]?.id
        ? String(assets.accounts[0].id)
        : null,
      default_page_id: assets.pages[0]?.id ? String(assets.pages[0].id) : null,
      default_instagram_account_id: assets.uniqueIg[0]?.id
        ? String(assets.uniqueIg[0].id)
        : null,
      default_pixel_id: assets.pixels[0]?.id
        ? String(assets.pixels[0].id)
        : null,
    };
    const { error: updateError } = await client
      .from("meta_connections")
      .update({
        meta_user_id: String(assets.me.id ?? ""),
        meta_user_name: String(assets.me.name ?? "Meta account"),
        access_token_encrypted: await encryptSecret(token),
        token_expires_at:
          assets.expiresAt ??
          (longToken.expires_in
            ? new Date(
                Date.now() + Number(longToken.expires_in) * 1000,
              ).toISOString()
            : null),
        granted_scopes: assets.granted,
        declined_scopes: assets.declined,
        status: missing.length
          ? "permission_required"
          : assets.accounts.length
            ? "connected"
            : "pending_asset_selection",
        ...defaults,
        last_health_check_at: new Date().toISOString(),
        last_sync_error: missing.length
          ? `Missing permissions: ${missing.join(", ")}`
          : null,
      })
      .eq("id", stateRow.connection_id);
    if (updateError) throw updateError;
    return redirect(
      fallback,
      assets.accounts.length ? "connected" : "select_assets",
      missing.length ? `Missing permissions: ${missing.join(", ")}` : undefined,
    );
  } catch (error) {
    return redirect(
      fallback,
      "error",
      error instanceof MetaError ? error.message : "Meta connection failed.",
    );
  }
});
