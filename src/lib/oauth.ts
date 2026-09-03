// Only CLIENT IDs and redirect URIs are used here — both are public values
// safe to ship to the browser. The matching CLIENT SECRETs are only ever
// read server-side, inside the Supabase Edge Functions that exchange the
// authorization code for a token (see supabase/functions/*-oauth-callback).

import { supabase } from "./supabase";

const YOUCAN_REDIRECT_URI = import.meta.env.VITE_YOUCAN_REDIRECT_URI?.trim() as string;

export async function youcanAuthorizeUrl(workspaceId: string): Promise<string> {
  const { data, error } = await supabase.functions.invoke('youcan-generate-state', {
    body: { workspace_id: workspaceId }
  });
  
  if (error) throw error;
  
  const state = data.state;
  const clientId = data.client_id;
  
  if (!clientId) {
    throw new Error("Missing client_id from generate-state response");
  }
  
  const params = new URLSearchParams({
    client_id: clientId,
    redirect_uri: YOUCAN_REDIRECT_URI,
    response_type: "code",
    state: state,
  });
  const scopes = [
    "read-orders",
    "read-customers",
    "read-products",
    "view-store-info",
    "read-rest-hooks",
    "edit-rest-hooks",
    "delete-rest-hooks",
  ];
  params.append("scope", scopes.join(" "));
  return `https://seller-area.youcan.shop/admin/oauth/authorize?${params.toString()}`;
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
