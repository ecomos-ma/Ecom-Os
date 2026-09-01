export type OrderStatus =
  | "pending"
  | "confirmed"
  | "shipped"
  | "delivered"
  | "returned"
  | "cancelled"
  | "no_answer"
  | "scheduled"
  | "blacklisted"
  | "duplicate"
  | "unreachable"
  | "wrong_number"
  | "out_of_stock"
  | "refused"
  | "new";

export type ShippingCarrier = "ozon" | "coliaty" | "forcelog" | "ameex" | "sendit";

export interface Workspace {
  id: string;
  name: string;
  meta_access_token: string | null;
  meta_ad_account_id: string | null;
  meta_system_user_token?: string | null;
  is_active?: boolean | null;
  status?: "active" | "suspended" | "deleted";
  plan?: string | null;
  created_by?: string | null;
  created_at: string;
  shipping_enabled?: boolean;
  show_shipping_column?: boolean;
  primary_color?: string | null;
  reporting_currency?: string | null;
  // Legacy fee columns (preserved for backward compat)
  business_delivery_fee?: number | null;
  business_confirmation_fee?: number | null;
  business_fulfillment_fee?: number | null;
  business_lead_fee?: number | null;
  business_product_cost?: number | null;
  // Dual cost model
  business_cost_model?: 'seller' | 'affiliate' | null;
  affiliate_default_product_cost?: number | null;
  affiliate_default_shipping_cost?: number | null;
  affiliate_shipping_cost_source?: 'fixed' | 'provider' | null;
  // Other workspace fields
  google_sheet_url?: string | null;
  google_sheet_autosync?: boolean | null;
  carrier?: ShippingCarrier | null;
  ozon_enabled?: boolean | null;
  coliaty_enabled?: boolean | null;
  coliaty_api_key?: string | null; // Deprecated: replaced by public and secret keys
  coliaty_public_key?: string | null;
  coliaty_secret_key?: string | null;
  coliaty_api_url?: string | null;
  language: "en" | "fr";
  youcan_client_id?: string | null;
  youcan_client_secret?: string | null;
  youcan_access_token?: string | null;
  youcan_refresh_token?: string | null;
  youcan_token_expires_at?: string | null;
  shopify_enabled?: boolean | null;
  shopify_shop_domain?: string | null;
  shopify_access_token?: string | null;
  shopify_refresh_token?: string | null;
  shopify_expires_at?: string | null;
  shopify_scopes?: string | null;
  shopify_connected_at?: string | null;
  ozon_api_key?: string | null;
  ozon_client_id?: string | null;
  ozon_warehouse_id?: string | null;
}

// ─────────────────────────────────────────────────────────────
// Dual Profit System Types
// ─────────────────────────────────────────────────────────────

export interface WorkspaceCostRule {
  id: string;
  workspace_id: string;
  name: string;
  amount: number;
  trigger: 'entered' | 'confirmed' | 'delivered';
  enabled: boolean;
  sort_order: number;
  created_at: string;
  updated_at: string;
}

export interface WorkspaceAffiliateSKUCost {
  id: string;
  workspace_id: string;
  sku: string;
  cost: number;
  created_at: string;
  updated_at: string;
}

export type UserRole = "founder" | "super_admin" | "supervisor" | "manager" | "employee" | "user" | "owner" | "admin" | "viewer" | "agent";

export interface Profile {
  id: string;
  workspace_id: string | null;
  full_name: string | null;
  role: UserRole;
  email?: string | null;
  avatar_url?: string | null;
  is_active?: boolean | null;
  allowed_sections?: AllowedSection[] | null;
  last_login_at?: string | null;
  session_not_before?: string | null;
  deleted_at?: string | null;
  terms_version_accepted?: string | null;
  privacy_version_accepted?: string | null;
  created_at: string;
}

export interface Customer {
  id: string;
  workspace_id: string;
  name: string;
  phone: string | null;
  city: string | null;
  created_at: string;
}

export interface Product {
  id: string;
  workspace_id: string;
  name: string;
  sku: string | null;
  cost: number;
  price: number;
  stock: number;
  low_stock_threshold: number;
  status: "active" | "draft" | "archived";
  created_at: string;
}

export interface Campaign {
  id: string;
  workspace_id: string;
  name: string;
  platform: string | null;
  created_at: string;
}

export interface Order {
  id: string;
  workspace_id: string;
  order_number: string;
  customer_id: string | null;
  customer_name?: string | null;
  city: string | null;
  total: number;
  status: OrderStatus;
  delivery_status?: string | null;
  campaign_id: string | null;
  created_at: string;
  updated_at?: string;
  confirmed_at: string | null;
  delivered_at: string | null;
  cancelled_at: string | null;
  tracking_number?: string | null;
  coliaty_parcel_code?: string | null;
  shipment_id?: string | null;
  shipment_status?: string | null;
  shipping_provider?: string | null;
  shipping_status?: string | null;
  shipping_status_raw?: Record<string, any> | null;
  last_tracking_sync?: string | null;
  shipping_updated_at?: string | null;
  ozon_raw_response?: Record<string, any> | null;
  delivery_note_ref?: string | null;
  shipping_synced_at?: string | null;
  last_shipping_sync_at?: string | null;
  parcel_created_at?: string | null;
  shipping_company?: string | null;
  shipping_cost?: number | null;
  phone?: string | null;
  address?: string | null;
  variant_price?: number;
  variantPrice?: number;
  sku?: string | null;
  customer_ip?: string | null;
  customerIp?: string | null;
  product_variant?: string | null;
  ozon_city_id?: string | null;
  productVariant?: string | null;
  whatsapp_status?: string | null;
  whatsapp_last_change_at?: string | null;
  whatsapp_last_change_source?: "whatsapp" | "whatsapp_ai" | null;
  whatsapp_last_change_summary?: string | null;
  source?: "youcan" | "sheets" | "manual";
  source_platform?: string | null;
  utm_source?: string | null;
  utm_medium?: string | null;
  utm_campaign?: string | null;
  utm_content?: string | null;
  utm_term?: string | null;
  landing_page?: string | null;
  referrer?: string | null;
  ttclid?: string | null;
  tiktok_advertiser_id?: string | null;
  tiktok_campaign_id?: string | null;
  tiktok_adgroup_id?: string | null;
  tiktok_ad_id?: string | null;
  tiktok_creative_id?: string | null;
  tiktok_attribution_status?: "Exact" | "UTM matched" | "Source only" | "Unattributed" | null;
  cod_payment_collected?: boolean | null;
  // joined
  customer?: Customer | null;
  campaign?: Campaign | null;
}

export interface Expense {
  id: string;
  workspace_id: string;
  category: string;
  description: string | null;
  amount: number;
  date: string;
  created_at: string;
}

export interface AdSpend {
  id: string;
  workspace_id: string;
  campaign_id: string | null;
  date: string;
  amount: number;
}

export interface Shipment {
  id: string;
  workspace_id: string;
  order_id: string;
  carrier: string;
  tracking_number: string | null;
  pickup_status: string;
  delivery_status: string;
  created_at: string;
  order?: Order | null;
}

export interface IntegrationStatus {
  provider: "google" | "youcan";
  connected: boolean;
  connected_at: string | null;
}

// Team Management Types
export type TeamRole = "owner" | "supervisor" | "agent";

export type WorkspaceMemberStatus = "pending" | "active" | "disabled";

export type InvitationStatus = "pending" | "accepted" | "expired" | "revoked";

export type AllowedSection =
  | "Dashboard"
  | "Orders"
  | "Confirmation"
  | "Shipping"
  | "Customers"
  | "Products"
  | "Inventory"
  | "Ads Manager"
  | "TikTok Ads"
  | "Expenses"
  | "COD Scenarios"
  | "Analytics"
  | "Team"
  | "Settings";

export interface TeamPermissions {
  dashboard: boolean;
  orders: boolean;
  confirmation: boolean;
  shipping: boolean;
  customers: boolean;
  products: boolean;
  inventory: boolean;
  ads: boolean;
  tiktok_ads: boolean;
  expenses: boolean;
  codscenarios: boolean;
  analytics: boolean;
  reports: boolean;
  team: boolean;
  settings: boolean;
  admin: boolean;
  users: boolean;
  workspaces: boolean;
  subscriptions: boolean;
  logs: boolean;
}

export interface WorkspaceMember {
  id: string;
  workspace_id: string;
  auth_user_id: string | null;
  email: string;
  full_name: string | null;
  role: TeamRole;
  status: WorkspaceMemberStatus;
  allowed_sections: AllowedSection[];
  permissions?: TeamPermissions;
  invited_by: string | null;
  joined_at: string | null;
  created_at: string;
  updated_at: string;
  last_login_at?: string | null;
}

export interface WorkspaceInvitation {
  id: string;
  workspace_id: string;
  user_id?: string | null;
  email: string;
  role: TeamRole;
  allowed_sections: AllowedSection[];
  permissions?: TeamPermissions;
  status: InvitationStatus;
  invited_by: string | null;
  accepted_at: string | null;
  created_at: string;
  updated_at: string;
}

export interface PlatformMetrics {
  total_workspaces: number;
  active_workspaces: number;
  suspended_workspaces: number;
  total_users: number;
  owners: number;
  agents: number;
  orders_today: number;
  orders_this_month: number;
  revenue_this_month: number;
  total_products: number;
  total_customers: number;
  total_integrations: number;
  pending_invitations: number;
  active_sessions: number;
  platform_storage_gb: number;
  database_size_bytes: number;
  new_users_today: number;
  new_workspaces_today: number;
}

export interface SearchResult {
  kind: string;
  item_id: string;
  title: string;
  subtitle: string;
  details: Record<string, unknown>;
}

export interface PlatformSettings {
  id: string;
  settings_key: string;
  platform_name: string;
  logo_url: string | null;
  favicon_url: string | null;
  maintenance_mode: boolean;
  registration_enabled: boolean;
  invitations_enabled: boolean;
  max_workspaces: number;
  max_members: number;
  max_orders: number;
  max_products: number;
  default_plan: string;
  support_whatsapp: string | null;
  support_email: string | null;
  smtp_host: string | null;
  smtp_port: number | null;
  smtp_user: string | null;
  smtp_sender_email: string | null;
  feature_flags: Record<string, boolean>;
  storage_limit_gb: number;
  created_at: string;
  updated_at: string;
}

export interface PlatformNotification {
  id: string;
  title: string;
  message: string;
  audience_type: 'all' | 'workspace' | 'role' | 'user';
  audience_target?: string | null;
  audience_role?: string | null;
  priority: 'info' | 'warning' | 'critical';
  channel: 'toast' | 'banner' | 'persistent';
  start_at: string;
  end_at?: string | null;
  is_active: boolean;
  scheduled_at?: string | null;
  created_by?: string | null;
  created_at: string;
  updated_at: string;
}

export interface SubscriptionPlan {
  id: string;
  name: string;
  description: string | null;
  orders_limit: number;
  products_limit: number;
  members_limit: number;
  storage_limit_gb: number;
  integrations_limit: number;
  price_cents: number;
  currency: string;
  created_at: string;
  updated_at: string;
}

export interface WorkspaceSubscription {
  id: string;
  workspace_id: string;
  plan_id: string;
  status: 'active' | 'trial' | 'cancelled' | 'expired' | 'pending_activation';
  started_at: string;
  renews_at?: string | null;
  canceled_at?: string | null;
  created_at: string;
  updated_at: string;
  plan?: SubscriptionPlan;
  workspace?: {
    id: string;
    name: string;
    created_at: string;
  };
  profiles?: {
    id: string;
    full_name: string;
    email: string;
  };
}

export interface WorkspaceLimit {
  id: string;
  profile_id: string;
  plan: string;
  max_workspaces: number;
  created_at: string;
  updated_at: string;
}

export interface WorkspaceInvoice {
  id: string;
  workspace_id: string;
  amount_cents: number;
  currency: string;
  due_date: string;
  paid_at?: string | null;
  status: 'pending' | 'paid' | 'overdue' | 'cancelled';
  description: string | null;
  created_by?: string | null;
  created_at: string;
  updated_at: string;
}

// ─────────────────────────────────────────────────────────────
// Shipping Engine Types
// ─────────────────────────────────────────────────────────────

export type ShippingProviderKey = "amana" | "dhl" | "chronopost" | "aramex";

export type ShippingStatus =
  | "pending"
  | "registered"
  | "picked_up"
  | "in_transit"
  | "out_for_delivery"
  | "delivered"
  | "returned"
  | "refused"
  | "cancelled"
  | "unknown";

export interface ShippingProviderStatus {
  id: string;
  workspace_id: string;
  provider: ShippingProviderKey;
  is_active: boolean;
  last_tested_at: string | null;
  last_test_ok: boolean | null;
  last_test_error: string | null;
  created_at: string;
  updated_at: string;
}

export interface ShipmentRecord {
  id: string;
  workspace_id: string;
  order_id: string;
  provider: ShippingProviderKey;
  external_id: string | null;
  tracking_number: string | null;
  status: ShippingStatus;
  pickup_status: string | null;
  delivery_status: string | null;
  shipping_cost: number | null;
  recipient_name: string | null;
  recipient_phone: string | null;
  recipient_city: string | null;
  recipient_address: string | null;
  notes: string | null;
  picked_up_at: string | null;
  delivered_at: string | null;
  returned_at: string | null;
  last_synced_at: string | null;
  created_at: string;
  updated_at: string;
  order?: Order | null;
}

export interface ShipmentEvent {
  id: string;
  workspace_id: string;
  shipment_id: string;
  status: string;
  description: string | null;
  location: string | null;
  event_time: string;
  raw_payload: Record<string, unknown> | null;
  created_at: string;
}

export interface ShippingSyncLog {
  id: string;
  workspace_id: string;
  provider: ShippingProviderKey;
  operation: string;
  status: "success" | "error" | "partial";
  shipments_count: number;
  error_message: string | null;
  duration_ms: number | null;
  created_at: string;
}

export interface ShippingStats {
  workspace_id: string;
  provider: ShippingProviderKey;
  total_shipments: number;
  delivered: number;
  returned: number;
  pending: number;
  in_transit: number;
  total_shipping_cost: number;
  delivery_rate: number;
  last_synced_at: string | null;
}
