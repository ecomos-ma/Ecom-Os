import type { Profile, Workspace, TeamPermissions, AllowedSection } from "../lib/types";
import { buildPermissionsForOwner, buildPermissionsFromSections, isOwnerLikeRole } from "../lib/rbac";

export type DemoRole = "owner" | "agent";

export interface DemoSession {
  isActive: boolean;
  role: DemoRole;
  profile: Profile;
  workspace: Workspace;
  teamPermissions: TeamPermissions;
  enteredAt: number;
}

const DEMO_SESSION_KEY = "ecomos_demo_session";

// Demo workspace ID - isolated from production
const DEMO_WORKSPACE_ID = "demo-workspace-001";

// Demo profiles
const DEMO_OWNER_PROFILE: Profile = {
  id: "demo-owner-001",
  workspace_id: DEMO_WORKSPACE_ID,
  full_name: "Amine",
  role: "owner",
  email: "demo-owner@ecomos.demo",
  avatar_url: null,
  is_active: true,
  allowed_sections: null,
  created_at: new Date(Date.now() - 90 * 24 * 60 * 60 * 1000).toISOString(),
};

const DEMO_AGENT_PROFILE: Profile = {
  id: "demo-agent-001",
  workspace_id: DEMO_WORKSPACE_ID,
  full_name: "Sara",
  role: "agent",
  email: "demo-agent@ecomos.demo",
  avatar_url: null,
  is_active: true,
  allowed_sections: ["Dashboard", "Orders", "Confirmation", "Customers"],
  created_at: new Date(Date.now() - 60 * 24 * 60 * 60 * 1000).toISOString(),
};

// Demo workspace
const DEMO_WORKSPACE: Workspace = {
  id: DEMO_WORKSPACE_ID,
  name: "Nura Beauty Store",
  meta_access_token: "demo_token_never_use_real",
  meta_ad_account_id: "demo_ad_account",
  is_active: true,
  status: "active",
  plan: "premium",
  created_by: "demo-owner-001",
  created_at: new Date(Date.now() - 90 * 24 * 60 * 60 * 1000).toISOString(),
  shipping_enabled: true,
  show_shipping_column: true,
  business_delivery_fee: 25,
  business_confirmation_fee: 8,
  business_fulfillment_fee: 15,
  business_lead_fee: 5,
  business_product_cost: 45,
  google_sheet_url: "https://script.google.com/macros/s/demo",
  google_sheet_autosync: true,
  carrier: "coliaty",
  coliaty_enabled: true,
  coliaty_public_key: "demo_public_key",
  coliaty_secret_key: "demo_secret_key",
  coliaty_api_url: "https://api.coliaty.ma",
  language: "en",
  youcan_client_id: "demo_client_id",
  youcan_client_secret: "demo_secret",
  youcan_access_token: "demo_token",
  youcan_refresh_token: "demo_refresh",
  youcan_token_expires_at: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toISOString(),
  shopify_enabled: true,
  shopify_shop_domain: "nura-beauty.myshopify.com",
  shopify_access_token: "demo_shopify_token",
  shopify_refresh_token: "demo_refresh",
  shopify_expires_at: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toISOString(),
  shopify_scopes: "read_products,write_orders",
  shopify_connected_at: new Date(Date.now() - 45 * 24 * 60 * 60 * 1000).toISOString(),
  ozon_api_key: "demo_ozon_key",
  ozon_client_id: "demo_client",
  ozon_warehouse_id: "demo_warehouse",
};

let currentDemoSession: DemoSession | null = null;

export function createDemoSession(role: DemoRole): DemoSession {
  const profile = role === "owner" ? DEMO_OWNER_PROFILE : DEMO_AGENT_PROFILE;
  
  let teamPermissions: TeamPermissions;
  if (isOwnerLikeRole(profile.role)) {
    teamPermissions = buildPermissionsForOwner();
  } else {
    teamPermissions = buildPermissionsFromSections(profile.allowed_sections);
  }

  const session: DemoSession = {
    isActive: true,
    role,
    profile,
    workspace: DEMO_WORKSPACE,
    teamPermissions,
    enteredAt: Date.now(),
  };

  currentDemoSession = session;
  
  // Persist to sessionStorage for page refresh
  try {
    sessionStorage.setItem(DEMO_SESSION_KEY, JSON.stringify(session));
  } catch (e) {
    console.warn("Failed to persist demo session:", e);
  }

  return session;
}

export function getDemoSession(): DemoSession | null {
  if (currentDemoSession) {
    return currentDemoSession;
  }

  // Try to restore from sessionStorage
  try {
    const stored = sessionStorage.getItem(DEMO_SESSION_KEY);
    if (stored) {
      const parsed = JSON.parse(stored);
      currentDemoSession = parsed;
      return currentDemoSession;
    }
  } catch (e) {
    console.warn("Failed to restore demo session:", e);
  }

  return null;
}

export function clearDemoSession(): void {
  currentDemoSession = null;
  try {
    sessionStorage.removeItem(DEMO_SESSION_KEY);
  } catch (e) {
    console.warn("Failed to clear demo session:", e);
  }
}

export function isDemoMode(): boolean {
  return getDemoSession() !== null;
}

export function getDemoRole(): DemoRole | null {
  const session = getDemoSession();
  return session?.role ?? null;
}

export function isDemoOwner(): boolean {
  return getDemoRole() === "owner";
}

export function isDemoAgent(): boolean {
  return getDemoRole() === "agent";
}
