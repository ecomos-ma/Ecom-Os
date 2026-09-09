// Only CLIENT IDs and redirect URIs are used here — both are public values
// safe to ship to the browser. The matching CLIENT SECRETs are only ever
// read server-side, inside the Supabase Edge Functions that exchange the
// authorization code for a token (see supabase/functions/*-oauth-callback).

import { supabase } from "./supabase";

export async function youcanAuthorizeUrl(workspaceId: string): Promise<string> {
  const { data, error } = await supabase.functions.invoke('youcan-generate-state', {
    body: { workspace_id: workspaceId }
  });

  if (error) throw error;

  const authorizeUrl = typeof data?.authorization_url === "string" ? data.authorization_url : "";
  let parsed: URL;
  try {
    parsed = new URL(authorizeUrl);
  } catch {
    throw new Error("YouCan returned an invalid authorization URL");
  }
  if (
    parsed.protocol !== "https:" ||
    parsed.hostname !== "seller-area.youcan.shop" ||
    parsed.pathname !== "/admin/oauth/authorize"
  ) {
    throw new Error("YouCan returned an invalid authorization URL");
  }

  return parsed.toString();
}

export async function shopifyAuthorizeUrl(workspaceId: string, shopDomain: string): Promise<string> {
  const { data, error } = await supabase.functions.invoke('shopify-generate-state', {
    body: { workspace_id: workspaceId, shop_domain: shopDomain }
  });

  if (error) throw error;

  const authorizeUrl = data.authorize_url;

  if (!authorizeUrl) {
    throw new Error("Missing authorize_url from generate-state response");
  }

  return authorizeUrl;
}
