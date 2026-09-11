import {
  actionValue,
  authenticateRequest,
  corsHeaders,
  decryptSecret,
  encryptSecret,
  errorResponse,
  fetchAllPages,
  jsonResponse,
  type JsonObject,
  MetaError,
  metaRequest,
  normalizeAdAccountId,
  resolveActiveWorkspace,
  sanitizeText,
  serviceClient,
} from "../_shared/meta.ts";

type LegacyAction =
  | "status"
  | "connect"
  | "sync"
  | "report"
  | "campaign_detail"
  | "disconnect";

type LegacyConnection = {
  id: string;
  workspace_id: string;
  ad_account_id: string;
  access_token_encrypted: string | null;
  account_name: string | null;
  currency: string | null;
  timezone_name: string | null;
  account_status: number | null;
  status: string;
  token_checked_at: string | null;
  last_sync_at: string | null;
  last_successful_sync_at: string | null;
  last_sync_error: string | null;
};

const DATE_PRESETS = new Set([
  "today",
  "yesterday",
  "last_3d",
  "last_7d",
  "last_14d",
  "last_30d",
  "maximum",
]);

const RESULT_ACTIONS = [
  "lead",
  "purchase",
  "omni_purchase",
  "complete_registration",
];

function publicConnection(row: LegacyConnection | null) {
  if (!row) return null;
  return {
    id: row.id,
    ad_account_id: row.ad_account_id,
    account_name: row.account_name,
    currency: row.currency,
    timezone_name: row.timezone_name,
    account_status: row.account_status,
    status: row.status,
    token_checked_at: row.token_checked_at,
    last_sync_at: row.last_sync_at,
    last_successful_sync_at: row.last_successful_sync_at,
    last_sync_error: row.last_sync_error,
  };
}

function validDate(value: unknown): string | undefined {
  if (value == null || value === "") return undefined;
  const date = String(value);
  if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) {
    throw new MetaError("Date must use YYYY-MM-DD", 400, "validation");
  }
  return date;
}

function dateSelection(body: Record<string, unknown>) {
  const datePreset = String(body.date_preset ?? "last_7d");
  const since = validDate(body.since);
  const until = validDate(body.until);
  if ((!since && until) || (since && !until)) {
    throw new MetaError("Choose both custom dates", 400, "validation");
  }
  if (!since && !DATE_PRESETS.has(datePreset)) {
    throw new MetaError("Date preset is invalid", 400, "validation");
  }
  return { datePreset, since, until };
}

function objectValue(value: unknown): JsonObject {
  return value && typeof value === "object" && !Array.isArray(value)
    ? value as JsonObject
    : {};
}

function safeHttpUrl(value: unknown): string | null {
  if (typeof value !== "string" || !value.trim()) return null;
  try {
    const url = new URL(value);
    if (url.protocol !== "https:" && url.protocol !== "http:") return null;
    url.searchParams.delete("access_token");
    url.searchParams.delete("appsecret_proof");
    return url.toString();
  } catch {
    return null;
  }
}

function collectNestedValues(
  value: unknown,
  keys: Set<string>,
  output: unknown[] = [],
  depth = 0,
): unknown[] {
  if (depth > 7 || value == null) return output;
  if (Array.isArray(value)) {
    value.forEach((item) => collectNestedValues(item, keys, output, depth + 1));
    return output;
  }
  if (typeof value !== "object") return output;
  Object.entries(value as JsonObject).forEach(([key, nested]) => {
    if (keys.has(key)) output.push(nested);
    collectNestedValues(nested, keys, output, depth + 1);
  });
  return output;
}

function destinationUrls(creative: JsonObject): string[] {
  return [...new Set(
    collectNestedValues(
      creative,
      new Set(["link", "website_url", "deeplink_url", "carousel_see_more_url"]),
    )
      .map(safeHttpUrl)
      .filter((url): url is string => Boolean(url)),
  )];
}

function videoIds(creative: JsonObject): string[] {
  return [...new Set(
    collectNestedValues(creative, new Set(["video_id"]))
      .map((value) => String(value ?? "").trim())
      .filter((value) => /^\d{5,40}$/.test(value)),
  )];
}

async function loadConnection(
  client: ReturnType<typeof serviceClient>,
  workspaceId: string,
): Promise<LegacyConnection | null> {
  const { data, error } = await client
    .from("meta_legacy_connections")
    .select(
      "id,workspace_id,ad_account_id,access_token_encrypted,account_name,currency,timezone_name,account_status,status,token_checked_at,last_sync_at,last_successful_sync_at,last_sync_error",
    )
    .eq("workspace_id", workspaceId)
    .maybeSingle();
  if (error) throw error;
  return (data as LegacyConnection | null) ?? null;
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders(req) });
  }
  if (req.method !== "POST") {
    return jsonResponse(req, { error: "Method not allowed" }, 405);
  }

  let syncWorkspaceId: string | null = null;
  try {
    const body = (await req.json().catch(() => ({}))) as Record<string, unknown>;
    const action = String(body.action ?? "status") as LegacyAction;
    if (
      ![
        "status",
        "connect",
        "sync",
        "report",
        "campaign_detail",
        "disconnect",
      ].includes(action)
    ) {
      throw new MetaError("Unsupported legacy Meta action", 400, "validation");
    }

    const client = serviceClient();
    const user = await authenticateRequest(req, client);
    const manage = action === "connect" || action === "disconnect";
    const { workspaceId } = await resolveActiveWorkspace(client, user.id, manage);
    syncWorkspaceId = workspaceId;

    if (action === "status") {
      const connection = await loadConnection(client, workspaceId);
      const connected = Boolean(
        connection?.access_token_encrypted &&
          ["connected", "syncing", "sync_failed"].includes(connection.status),
      );
      return jsonResponse(req, {
        connected,
        state: connection?.status ?? "not_connected",
        connection: publicConnection(connection),
      });
    }

    if (action === "connect") {
      const accessToken = String(body.access_token ?? "").trim();
      if (!accessToken || accessToken.length > 4096) {
        throw new MetaError("A valid Meta access token is required", 400, "validation");
      }
      const adAccountId = normalizeAdAccountId(body.ad_account_id);

      // Manual system-user tokens may belong to the seller's own Meta app, so
      // this compatibility flow uses a Bearer header without Ecom OS appsecret_proof.
      // OAuth V2 keeps its stronger default proof behavior unchanged.
      const account = await metaRequest<JsonObject>(adAccountId, {
        token: accessToken,
        query: {
          fields: "id,name,account_id,currency,timezone_name,account_status",
        },
        retries: 1,
        appSecretProof: false,
      });
      const returnedId = normalizeAdAccountId(account.id ?? adAccountId);
      if (returnedId !== adAccountId) {
        throw new MetaError("The token cannot access this ad account", 403, "permission");
      }

      const now = new Date().toISOString();
      const encrypted = await encryptSecret(accessToken);
      const { data, error } = await client
        .from("meta_legacy_connections")
        .upsert(
          {
            workspace_id: workspaceId,
            configured_by: user.id,
            ad_account_id: adAccountId,
            access_token_encrypted: encrypted,
            account_name: account.name ? String(account.name) : adAccountId,
            currency: account.currency ? String(account.currency) : null,
            timezone_name: account.timezone_name
              ? String(account.timezone_name)
              : null,
            account_status: account.account_status == null
              ? null
              : Number(account.account_status),
            status: "connected",
            token_checked_at: now,
            last_sync_error: null,
            disconnected_at: null,
          },
          { onConflict: "workspace_id" },
        )
        .select(
          "id,workspace_id,ad_account_id,access_token_encrypted,account_name,currency,timezone_name,account_status,status,token_checked_at,last_sync_at,last_successful_sync_at,last_sync_error",
        )
        .single();
      if (error) throw error;

      return jsonResponse(req, {
        success: true,
        connected: true,
        state: "connected",
        connection: publicConnection(data as LegacyConnection),
      });
    }

    if (action === "disconnect") {
      const connection = await loadConnection(client, workspaceId);
      if (connection) {
        const { error } = await client
          .from("meta_legacy_connections")
          .update({
            access_token_encrypted: null,
            status: "disconnected",
            last_sync_error: null,
            disconnected_at: new Date().toISOString(),
          })
          .eq("id", connection.id)
          .eq("workspace_id", workspaceId);
        if (error) throw error;
      }
      return jsonResponse(req, {
        success: true,
        connected: false,
        historical_data_preserved: true,
      });
    }

    const connection = await loadConnection(client, workspaceId);
    if (!connection?.access_token_encrypted) {
      if (action === "report") {
        return jsonResponse(req, {
          connected: false,
          spend: 0,
          results: 0,
          currency: null,
          since: null,
          until: null,
          daily: [],
        });
      }
      throw new MetaError(
        "Connect the Legacy Ads Manager before syncing",
        409,
        "configuration",
      );
    }

    const token = await decryptSecret(connection.access_token_encrypted);

    if (action === "campaign_detail") {
      const campaignId = String(body.campaign_id ?? "").trim();
      if (!/^\d{5,40}$/.test(campaignId)) {
        throw new MetaError("Campaign ID is invalid", 400, "validation");
      }

      const campaign = await metaRequest<JsonObject>(campaignId, {
        token,
        query: { fields: "id,name,account_id" },
        appSecretProof: false,
      });
      const campaignAccountId = normalizeAdAccountId(campaign.account_id);
      if (
        String(campaign.id ?? "") !== campaignId ||
        campaignAccountId !== connection.ad_account_id
      ) {
        throw new MetaError(
          "Campaign is not available in this workspace ad account",
          403,
          "permission",
        );
      }

      const ads = await fetchAllPages<JsonObject>(`${campaignId}/ads`, {
        token,
        query: {
          fields:
            "id,name,status,effective_status,creative{id,name,title,body,thumbnail_url,image_url,video_id,object_story_spec,asset_feed_spec}",
          limit: 100,
        },
        maxPages: 10,
        appSecretProof: false,
      });

      const allVideoIds = [...new Set(
        ads.flatMap((ad) => videoIds(objectValue(ad.creative))).slice(0, 20),
      )];
      const videoEntries = await Promise.all(
        allVideoIds.map(async (videoId) => {
          try {
            const video = await metaRequest<JsonObject>(videoId, {
              token,
              query: { fields: "id,source,picture,permalink_url,title" },
              retries: 1,
              appSecretProof: false,
            });
            return [videoId, video] as const;
          } catch {
            return [videoId, {} as JsonObject] as const;
          }
        }),
      );
      const videos = new Map(videoEntries);

      const creatives = ads.map((ad) => {
        const creative = objectValue(ad.creative);
        const linkedVideo = videoIds(creative)
          .map((id) => videos.get(id))
          .find((video) => Boolean(video && Object.keys(video).length));
        const destinations = destinationUrls(creative);
        return {
          creative_id: String(creative.id ?? ""),
          ad_id: String(ad.id ?? ""),
          ad_name: String(ad.name ?? "Untitled ad").slice(0, 240),
          title: creative.title == null
            ? null
            : String(creative.title).slice(0, 500),
          body: creative.body == null
            ? null
            : String(creative.body).slice(0, 2000),
          thumbnail_url:
            safeHttpUrl(creative.thumbnail_url) ??
            safeHttpUrl(linkedVideo?.picture) ??
            null,
          image_url: safeHttpUrl(creative.image_url),
          video_url: safeHttpUrl(linkedVideo?.source),
          video_permalink_url: safeHttpUrl(linkedVideo?.permalink_url),
          destination_urls: destinations,
        };
      });

      return jsonResponse(req, {
        campaign: {
          id: campaignId,
          name: String(campaign.name ?? "Untitled campaign").slice(0, 240),
        },
        creatives,
        destination_urls: [...new Set(
          creatives.flatMap((creative) => creative.destination_urls),
        )],
      });
    }

    const { datePreset, since, until } = dateSelection(body);

    if (action === "report") {
      const explicitDays = since && until
        ? Math.ceil(
          (Date.parse(`${until}T00:00:00Z`) -
            Date.parse(`${since}T00:00:00Z`)) /
            86_400_000,
        ) + 1
        : null;
      const insights = await fetchAllPages<JsonObject>(
        `${connection.ad_account_id}/insights`,
        {
          token,
          query: {
            level: "account",
            fields: "spend,actions,date_start,date_stop",
            time_increment:
              datePreset === "maximum" || (explicitDays != null && explicitDays > 366)
                ? "all_days"
                : 1,
            limit: 200,
            ...(since && until
              ? { time_range: { since, until } }
              : { date_preset: datePreset }),
          },
          appSecretProof: false,
        },
      );
      const daily = new Map<string, number>();
      let spend = 0;
      let results = 0;
      insights.forEach((row) => {
        const amount = Number(row.spend ?? 0);
        spend += amount;
        results += actionValue(row.actions, RESULT_ACTIONS);
        const date = String(row.date_start ?? "");
        if (/^\d{4}-\d{2}-\d{2}$/.test(date)) {
          daily.set(date, (daily.get(date) ?? 0) + amount);
        }
      });

      return jsonResponse(req, {
        connected: true,
        spend,
        results,
        currency: connection.currency,
        since: since ?? (String(insights.at(0)?.date_start ?? "") || null),
        until: until ?? (String(insights.at(-1)?.date_stop ?? "") || null),
        daily: [...daily.entries()].map(([date, amount]) => ({ date, amount })),
      });
    }

    await client
      .from("meta_legacy_connections")
      .update({ status: "syncing", last_sync_error: null })
      .eq("id", connection.id)
      .eq("workspace_id", workspaceId);

    const insightsQuery: Record<string, unknown> = {
      level: "campaign",
      fields:
        "campaign_id,campaign_name,spend,reach,impressions,clicks,ctr,cpc,cpm,frequency,actions,cost_per_action_type",
      limit: 200,
      ...(since && until
        ? { time_range: { since, until } }
        : { date_preset: datePreset }),
    };

    const [campaigns, insights] = await Promise.all([
      fetchAllPages<JsonObject>(`${connection.ad_account_id}/campaigns`, {
        token,
        query: {
          fields: "id,name,status,effective_status,daily_budget,lifetime_budget",
          limit: 200,
        },
        appSecretProof: false,
      }),
      fetchAllPages<JsonObject>(`${connection.ad_account_id}/insights`, {
        token,
        query: insightsQuery,
        appSecretProof: false,
      }),
    ]);

    const insightByCampaign = new Map(
      insights.map((row) => [String(row.campaign_id ?? ""), row]),
    );
    const now = new Date().toISOString();
    const rows = campaigns.map((campaign) => {
      const campaignId = String(campaign.id ?? "");
      const insight = insightByCampaign.get(campaignId) ?? {};
      const results = actionValue(insight.actions, RESULT_ACTIONS);
      const providerCost = actionValue(
        insight.cost_per_action_type,
        RESULT_ACTIONS,
      );
      const budgetMinor = campaign.daily_budget ?? campaign.lifetime_budget;
      const spend = Number(insight.spend ?? 0);
      return {
        workspace_id: workspaceId,
        connection_id: connection.id,
        meta_campaign_id: campaignId,
        campaign_name: String(campaign.name ?? "Untitled campaign"),
        status: String(
          campaign.effective_status ?? campaign.status ?? "UNKNOWN",
        ),
        budget: budgetMinor == null ? null : Number(budgetMinor) / 100,
        spend,
        reach: Number(insight.reach ?? 0),
        impressions: Number(insight.impressions ?? 0),
        clicks: Number(insight.clicks ?? 0),
        ctr: Number(insight.ctr ?? 0),
        cpc: Number(insight.cpc ?? 0),
        cpm: Number(insight.cpm ?? 0),
        frequency: Number(insight.frequency ?? 0),
        results,
        cost_per_result: providerCost || (results > 0 ? spend / results : 0),
        synced_at: now,
      };
    });

    if (rows.some((row) => !row.meta_campaign_id)) {
      throw new MetaError("Meta returned an invalid campaign", 502, "temporary", true);
    }
    if (rows.length) {
      const { error } = await client
        .from("meta_legacy_campaigns")
        .upsert(rows, { onConflict: "workspace_id,meta_campaign_id" });
      if (error) throw error;
    }

    const { error: statusError } = await client
      .from("meta_legacy_connections")
      .update({
        status: "connected",
        last_sync_at: now,
        last_successful_sync_at: now,
        last_sync_error: null,
      })
      .eq("id", connection.id)
      .eq("workspace_id", workspaceId);
    if (statusError) throw statusError;

    return jsonResponse(req, {
      success: true,
      synced: rows.length,
      currency: connection.currency,
      last_sync_at: now,
    });
  } catch (error) {
    if (syncWorkspaceId) {
      try {
        const client = serviceClient();
        const message = sanitizeText(
          error instanceof Error ? error.message : "Legacy Meta sync failed",
        );
        await client
          .from("meta_legacy_connections")
          .update({
            status: error instanceof MetaError && error.category === "authentication"
              ? "reauth_required"
              : "sync_failed",
            last_sync_error: message,
            last_sync_at: new Date().toISOString(),
          })
          .eq("workspace_id", syncWorkspaceId)
          .eq("status", "syncing");
      } catch {
        // Preserve the original error response.
      }
    }
    return errorResponse(req, error);
  }
});
