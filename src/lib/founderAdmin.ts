import { supabase } from "./supabase";
import type { PlatformAdminRole, PlatformPermission } from "./rbac";

export type PlatformAuthorization = {
  profile_id: string;
  email: string | null;
  is_root_founder: boolean;
  is_platform_admin: boolean;
  role: PlatformAdminRole | null;
  expires_at: string | null;
  permissions: PlatformPermission[];
};

export type PlatformAdminRoleDefinition = {
  role_key: PlatformAdminRole;
  display_name: string;
  description: string | null;
  is_system: boolean;
  permissions: PlatformPermission[];
};

export type PlatformAdminAssignment = {
  profile_id: string;
  full_name: string | null;
  email: string | null;
  role_key: Exclude<PlatformAdminRole, "root_founder">;
  status: "active" | "suspended" | "revoked";
  granted_at: string;
  expires_at: string | null;
  revoked_at: string | null;
  reason: string | null;
};

export type PlatformSupportSession = {
  id: string;
  admin_id: string;
  target_profile_id: string;
  workspace_id: string;
  mode: "read_only" | "read_write";
  started_at: string;
  expires_at: string;
  write_expires_at?: string | null;
};

export type PlatformSupportContext = {
  session: PlatformSupportSession & { reason: string };
  profile: {
    id: string;
    workspace_id: string;
    full_name: string | null;
    email: string | null;
    role: string;
    created_at: string;
    is_active: boolean;
    allowed_sections: string[];
    avatar_url: string | null;
  };
  workspace: { id: string; name: string; status: string; plan: string; created_at: string; language: "en" | "fr" };
  summary: { orders: number; products: number; members: number };
};

export type PlatformWorkspace = {
  id: string;
  name: string;
  status: string;
  plan: string;
  subscription_status: string;
  created_at: string;
  owner_profile_id: string | null;
  owner_name: string | null;
  owner_email: string | null;
  member_count: number;
  orders_today: number;
  orders_month: number;
  product_count: number;
  integration_count: number;
  confirmation_rate: number;
  delivery_rate: number;
  delivered_revenue_month: number;
  last_activity_at: string | null;
};

export type PlatformWorkspaceResult = PagedResult<PlatformWorkspace> & {
  page: number;
  page_size: number;
  timezone: string;
  period_start: string;
  period_end: string;
};

export type PlatformSeller = {
  id: string;
  full_name: string | null;
  email: string | null;
  avatar_url: string | null;
  created_at: string;
  last_active: string | null;
  primary_workspace_id: string | null;
  primary_workspace_name: string | null;
  account_state: string;
  plan_code: string | null;
  plan_name: string | null;
  subscription_status: string;
  billing_cycle: string | null;
  current_period_end: string | null;
  workspace_count: number;
  team_count: number;
  product_count: number;
  active_campaigns: number;
  orders: number;
  pending: number;
  confirmed: number;
  delivered: number;
  returned: number;
  cancelled: number;
  gross_order_value: number;
  confirmed_order_value: number;
  delivered_revenue: number;
  confirmation_rate: number;
  delivery_rate: number;
  health: "healthy" | "attention" | "critical";
};

export type PlatformSellerResult = PagedResult<PlatformSeller> & {
  page: number;
  page_size: number;
  range: { start_date: string; end_date: string; timezone: string };
  definitions: Record<string, string>;
};

export type PlatformProduct = {
  id: string;
  workspace_id: string;
  workspace_name: string;
  owner_user_id: string | null;
  seller_name: string | null;
  seller_email: string | null;
  name: string;
  sku: string | null;
  image_url: string | null;
  category: string | null;
  cost: number;
  price: number;
  stock: number;
  low_stock_threshold: number;
  status: string;
  created_at: string;
  units_sold: number;
  delivered_revenue: number;
  stock_state: "in_stock" | "low_stock" | "out_of_stock";
};

export type PlatformCampaign = {
  id: string;
  workspace_id: string;
  workspace_name: string;
  owner_user_id: string | null;
  seller_name: string | null;
  seller_email: string | null;
  platform: string;
  external_id: string;
  name: string;
  status: string;
  budget: number | null;
  spend: number | null;
  impressions: number | null;
  clicks: number | null;
  conversions: number | null;
  cost_per_result: number | null;
  attributed_revenue: number | null;
  roas: number | null;
  currency: string | null;
  updated_at: string;
  metrics_available: boolean;
  attribution_available: boolean;
};

export type PlatformCommandCenter = {
  range: { start_date: string; end_date: string; start_at: string; end_at: string; timezone: string };
  sellers: null | { total: number; active: number; suspended: number; active_today: number; new_today: number; new_month: number };
  users: null | { total: number; active_today: number; active_7_days: number; suspended: number; banned: number | null; registered_in_range: number };
  workspaces: null | { total: number; active: number; suspended: number; onboarding: number; without_active_subscription: number };
  orders: null | { total: number; pending_confirmation: number; confirmed: number; shipped: number; delivered: number; refused: number; returned: number; cancelled: number };
  business_volume: null | { gross_order_value: number; confirmed_order_value: number; delivered_revenue: number };
  rates: null | { confirmation_rate: number; delivery_rate: number; cancellation_rate: number; refusal_rate: number; return_rate: number };
  subscriptions: null | { active_count: number; pending_payment_count: number; under_review_count: number; grace_count: number; expiring_count: number; expired_count: number; suspended_count: number };
  support: null | { open_count: number; urgent_count: number; waiting_count: number; oldest_unresolved_at: string | null };
  system: null | { application: string; database: string; auth: string; realtime: string; storage: string; edge_functions: string; workers: string; note: string };
  attention: Array<{ kind: string; id: string; title: string; detail: string; href: string; created_at: string; priority: number }>;
  capabilities: { official_subscriptions: boolean; payments: boolean; measured_service_health: boolean; advertising_attribution: boolean };
};

export type PlatformBillingSummary = {
  active_count: number;
  pending_payment_count: number;
  under_review_count: number;
  grace_count: number;
  expiring_count: number;
  expired_count: number;
  suspended_count: number;
  unassigned_count: number;
  monthly_recurring_revenue_mad: number;
  annualized_recurring_revenue_mad: number;
  payments_awaiting_review: number;
  official_subscriptions: true;
  payments: true;
};

export type OfficialPlan = {
  id?: string;
  code: string;
  name: string;
  description: string | null;
  monthly_price_mad: number;
  annual_price_mad: number;
  order_limit: number | null;
  order_period: "day" | "month" | string | null;
  workspace_limit: number | null;
  team_member_limit: number | null;
  integration_limit: number | null;
  entitlements: Record<string, boolean>;
  is_popular: boolean;
  is_active: boolean;
  is_public: boolean;
  is_official?: boolean;
  display_order: number;
  badge_text?: string | null;
  cta_text?: string | null;
  monthly_billing_enabled?: boolean;
  annual_billing_enabled?: boolean;
  custom_limits?: Record<string, unknown> | null;
  custom_benefits?: unknown[] | null;
  metadata?: Record<string, unknown> | null;
  archived_at?: string | null;
};

export type PlatformPaymentRequest = {
  id: string;
  reference: string;
  owner_user_id: string;
  seller_name: string | null;
  seller_email: string | null;
  current_plan: string | null;
  requested_plan: string;
  request_type: string;
  billing_cycle: string;
  expected_amount_mad: number;
  amount_received_mad: number | null;
  currency: string;
  payment_method: string | null;
  transaction_reference: string | null;
  proof_path: string | null;
  proof_mime_type: string | null;
  proof_size_bytes: number | null;
  status: string;
  user_note: string | null;
  admin_note: string | null;
  submitted_at: string | null;
  reviewed_at: string | null;
  reviewer_email: string | null;
  created_at: string;
};

export type EffectiveSubscription = {
  owner_user_id: string;
  subscription_id: string | null;
  plan: { id: string; code: string; name: string } | null;
  billing_cycle?: string | null;
  status: string;
  payment_status: string;
  migration_state: string;
  current_period_start?: string | null;
  current_period_end?: string | null;
  grace_until?: string | null;
  timezone?: string;
  operational_access: boolean;
  access_reason: string;
  limits: null | { orders: number | null; order_period: string | null; workspaces: number | null; team_members: number | null; integrations: number | null };
  entitlements: Record<string, boolean>;
  usage: Record<string, number | string | null>;
};

export type PlatformSubscription = {
  id: string;
  owner_user_id: string;
  seller_name: string | null;
  seller_email: string | null;
  plan_code: string | null;
  plan_name: string | null;
  billing_cycle: string | null;
  status: string;
  payment_status: string;
  current_period_start: string | null;
  current_period_end: string | null;
  grace_until: string | null;
  timezone: string;
  migration_state: string;
  workspace_count: number;
  effective: EffectiveSubscription;
  created_at: string;
  updated_at: string;
};

export type FounderSnapshot = {
  users: number;
  active_users: number;
  workspaces: number;
  active_workspaces: number;
  orders_today: number;
  orders_month: number;
  revenue_month: number;
  products: number;
  open_tickets: number;
  enabled_tool_providers: number;
  recent_events: FounderEvent[];
};

export type FounderEvent = {
  id: string;
  action: string;
  target_type: string | null;
  target_id: string | null;
  reason: string | null;
  created_at: string;
};

export type FounderOrder = {
  id: string;
  order_number: string;
  status: string;
  total: number;
  phone: string | null;
  created_at: string;
  workspace_id: string;
  workspace_name: string | null;
};

export type FounderUser = {
  id: string;
  full_name: string | null;
  email: string | null;
  role: string;
  workspace_id: string | null;
  workspace_name: string | null;
  is_active: boolean;
  created_at: string;
};

export type FounderMembership = {
  workspace_id: string;
  workspace_name: string;
  workspace_status: string;
  plan: string;
  is_owner: boolean;
  member_role: string;
  orders: number;
  revenue: number;
  stage?: string;
};

export type FounderUserV2 = Omit<FounderUser, "workspace_name"> & {
  status: "active" | "suspended" | "closed" | "banned";
  reason: string | null;
  effective_until: string | null;
  last_active: string | null;
  last_login_at?: string | null;
  avatar_url?: string | null;
  banned?: boolean;
  subscription_status?: string | null;
  subscription_plan?: string | null;
  memberships: FounderMembership[];
};

export type PagedResult<T> = { rows: T[]; total: number };

export type FounderOrderV2 = FounderOrder & {
  customer_name?: string | null;
  city?: string | null;
  payment_method?: string | null;
};

export type FounderGlobalOrdersResult = {
  orders: FounderOrderV2[];
  total_count: number;
  page: number;
  page_size: number;
};

export type FounderPlatformSetting = {
  id: string;
  settings_key: string;
  value: unknown;
  is_sensitive: boolean;
  description: string | null;
  category: string | null;
  updated_at: string | null;
  updated_by: string | null;
};

export type FounderUser360 = {
  user: FounderUserV2 & { user_message?: string | null; force_logout_at?: string | null };
  memberships: FounderMembership[];
  activity: FounderEvent[];
  notes: Array<{ id: string; body: string; created_at: string }>;
  tickets: Array<{ id: string; subject: string; status: string; priority: string; created_at: string }>;
  owned_businesses?: Array<{ workspace_id: string; workspace_name: string; status: string }>;
  subscription?: EffectiveSubscription | null;
};

export type FounderNotification = {
  source: string;
  source_id: string;
  title: string;
  detail: string;
  created_at: string;
  severity: string;
  read: boolean;
};

export type FounderAnnouncement = {
  id: string;
  title: string;
  body: string;
  audience: "all" | "workspace" | "roles";
  workspace_id: string | null;
  audience_roles: string[];
  status: "draft" | "scheduled" | "published" | "archived";
  publish_at: string | null;
  dismissible: boolean;
  sticky: boolean;
  created_at: string;
  read_count: number;
  dismissed_count: number;
};

export type FounderAnnouncementV3 = Omit<FounderAnnouncement, "audience"> & {
  audience: "all" | "workspace" | "roles" | "user" | "plan";
  type: "info" | "success" | "warning" | "critical" | "security" | "maintenance" | "promotion" | "update";
  priority: number;
  target_profile_id: string | null;
  target_plan: string | null;
  cta_label: string | null;
  cta_url: string | null;
  start_at: string | null;
  end_at: string | null;
  is_active: boolean;
  language: string;
  updated_at: string | null;
};

export type UserAnnouncement = {
  id: string;
  title: string;
  body: string;
  dismissible: boolean;
  sticky: boolean;
  created_at: string;
  cta_label?: string | null;
  cta_url?: string | null;
};

export type FounderWorkspace = {
  id: string;
  name: string;
  status: string;
  plan: string | null;
  created_at: string;
  member_count: number;
  order_count: number;
};

export type SupportTicket = {
  id: string;
  subject: string;
  message: string;
  status: "open" | "in_progress" | "waiting_on_customer" | "resolved" | "closed";
  priority: "low" | "normal" | "high" | "urgent";
  workspace_id: string | null;
  workspace_name: string | null;
  requester_email: string | null;
  created_at: string;
  updated_at: string;
};

export type HealthOverview = {
  database: { status: "healthy" | "warning" | "critical"; label: string };
  tools: { status: "healthy" | "warning" | "critical"; enabled_providers: number };
  open_tickets: number;
  recent_failures: number;
};

async function rpc<T>(fn: string, args?: Record<string, unknown>) {
  const { data, error } = await supabase.rpc(fn, args);
  if (error) throw error;
  return data as T;
}

export const founderAdmin = {
  authorization: () => rpc<PlatformAuthorization>("platform_get_my_authorization_v1"),
  platformAdminRoles: () => rpc<PlatformAdminRoleDefinition[]>("platform_list_admin_roles_v1"),
  platformAdminAssignments: () => rpc<PlatformAdminAssignment[]>("platform_list_admin_assignments_v1"),
  setPlatformAdminAssignment: (profileId: string, role: Exclude<PlatformAdminRole, "root_founder">, reason: string, expiresAt?: string | null) => rpc<{ profile_id: string; role_key: string; status: string; expires_at: string | null }>("platform_set_admin_assignment_v1", {
    p_profile_id: profileId, p_role_key: role, p_reason: reason, p_expires_at: expiresAt || null,
  }),
  revokePlatformAdminAssignment: (profileId: string, reason: string) => rpc<void>("platform_revoke_admin_assignment_v1", { p_profile_id: profileId, p_reason: reason }),
  startPlatformSupportSession: (workspaceId: string, profileId: string, reason: string, durationMinutes = 30) => rpc<PlatformSupportSession>("platform_start_support_session_v1", {
    p_workspace_id: workspaceId, p_target_profile_id: profileId, p_reason: reason, p_duration_minutes: durationMinutes,
  }),
  elevatePlatformSupportSession: (sessionId: string, reason: string, durationMinutes = 10) => rpc<Pick<PlatformSupportSession, "id" | "mode" | "expires_at" | "write_expires_at">>("platform_elevate_support_session_v1", {
    p_session_id: sessionId, p_reason: reason, p_duration_minutes: durationMinutes,
  }),
  endPlatformSupportSession: (sessionId: string, reason = "admin_exit") => rpc<void>("platform_end_support_session_v1", { p_session_id: sessionId, p_reason: reason }),
  platformSupportContext: (sessionId: string) => rpc<PlatformSupportContext>("platform_get_support_context_v1", { p_session_id: sessionId }),
  platformWorkspaces: (args: { page?: number; pageSize?: number; query?: string; plan?: string; status?: string; subscriptionStatus?: string; ownerProfileId?: string } = {}) => rpc<PlatformWorkspaceResult>("platform_list_workspaces_v1", {
    p_page: args.page ?? 1,
    p_page_size: args.pageSize ?? 25,
    p_query: args.query || null,
    p_plan: args.plan || null,
    p_workspace_status: args.status || null,
    p_subscription_status: args.subscriptionStatus || null,
    p_owner_profile_id: args.ownerProfileId || null,
  }),
  platformSellers: (args: { page?: number; pageSize?: number; query?: string; plan?: string; subscriptionStatus?: string; health?: string; startDate?: string; endDate?: string } = {}) => rpc<PlatformSellerResult>("platform_list_sellers_v1", {
    p_page: args.page ?? 1, p_page_size: args.pageSize ?? 25, p_query: args.query || null,
    p_plan: args.plan || null, p_subscription_status: args.subscriptionStatus || null,
    p_health: args.health || null, p_start_date: args.startDate || null, p_end_date: args.endDate || null,
  }),
  platformProducts: (args: { page?: number; pageSize?: number; query?: string; status?: string; workspaceId?: string; stockState?: string } = {}) => rpc<PagedResult<PlatformProduct> & { page: number; page_size: number }>("platform_list_products_v1", {
    p_page: args.page ?? 1, p_page_size: args.pageSize ?? 25, p_query: args.query || null,
    p_status: args.status || null, p_workspace_id: args.workspaceId || null, p_stock_state: args.stockState || null,
  }),
  platformCampaigns: (args: { page?: number; pageSize?: number; query?: string; platform?: string; status?: string; workspaceId?: string } = {}) => rpc<PagedResult<PlatformCampaign> & { page: number; page_size: number; attribution_rule: string }>("platform_list_campaigns_v1", {
    p_page: args.page ?? 1, p_page_size: args.pageSize ?? 25, p_query: args.query || null,
    p_platform: args.platform || null, p_status: args.status || null, p_workspace_id: args.workspaceId || null,
  }),
  setPlatformWorkspaceStatus: (workspaceId: string, status: "active" | "suspended", reason: string) => rpc<void>("platform_set_workspace_status_v1", {
    p_workspace_id: workspaceId, p_status: status, p_reason: reason,
  }),
  deletePlatformWorkspace: (workspaceId: string, reason: string) => rpc<void>("platform_delete_workspace_v1", {
    p_workspace_id: workspaceId, p_reason: reason,
  }),
  commandCenter: (startDate?: string | null, endDate?: string | null) => rpc<PlatformCommandCenter>("platform_command_center_v1", {
    p_start_date: startDate || null, p_end_date: endDate || null,
  }),
  billingSummary: () => rpc<PlatformBillingSummary>("platform_billing_summary_v1"),
  officialPlans: () => rpc<OfficialPlan[]>("list_official_plans_v1"),
  paymentRequests: (args: { page?: number; pageSize?: number; status?: string; requestType?: string; query?: string } = {}) => rpc<PagedResult<PlatformPaymentRequest>>("platform_list_payment_requests_v1", {
    p_page: args.page ?? 1, p_page_size: args.pageSize ?? 25, p_status: args.status || null,
    p_request_type: args.requestType || null, p_query: args.query || null,
  }),
  reviewPaymentRequest: (requestId: string, decision: "approve" | "reject" | "waive", amountReceived?: number | null, adminNote?: string) => rpc<Record<string, unknown>>("platform_review_payment_request_v1", {
    p_request_id: requestId, p_decision: decision, p_amount_received_mad: amountReceived ?? null, p_admin_note: adminNote || null,
  }),
  subscriptions: (args: { page?: number; pageSize?: number; query?: string; status?: string; plan?: string; migrationState?: string } = {}) => rpc<PagedResult<PlatformSubscription>>("platform_list_subscriptions_v1", {
    p_page: args.page ?? 1, p_page_size: args.pageSize ?? 25, p_query: args.query || null,
    p_status: args.status || null, p_plan_code: args.plan || null, p_migration_state: args.migrationState || null,
  }),
  assignSubscription: (ownerUserId: string, planCode: OfficialPlan["code"], billingCycle: "monthly" | "annual", periodStart: string, periodEnd: string, reason: string) => rpc<EffectiveSubscription>("platform_assign_subscription_v1", {
    p_owner_user_id: ownerUserId, p_plan_code: planCode, p_billing_cycle: billingCycle,
    p_period_start: periodStart, p_period_end: periodEnd, p_reason: reason,
  }),
  grantSubscriptionGrace: (ownerUserId: string, graceUntil: string, reason: string) => rpc<EffectiveSubscription>("platform_grant_subscription_grace_v1", {
    p_owner_user_id: ownerUserId, p_grace_until: graceUntil, p_reason: reason,
  }),
  checkOrderCapacity: (workspaceId: string) => rpc<{
    allowed: boolean;
    reason: string;
    limit: number | null;
    used: number;
    remaining: number | null;
    period_start: string;
    period_end: string;
    effective_subscription?: Record<string, unknown>;
  }>("check_order_capacity_v1", { p_workspace_id: workspaceId }),
  checkSubscriptionBlocked: (workspaceId: string) => rpc<{
    blocked: boolean;
    reason: string;
    message: string;
    subscription?: Record<string, unknown>;
  }>("is_subscription_blocked_v1", { p_workspace_id: workspaceId }),
  snapshot: () => rpc<FounderSnapshot>("founder_admin_snapshot"),
  health: () => rpc<HealthOverview>("founder_health_overview"),
  orders: (args: { limit?: number; offset?: number; query?: string; status?: string; workspaceId?: string } = {}) => rpc<FounderOrder[]>("founder_list_orders", {
    p_limit: args.limit ?? 25, p_offset: args.offset ?? 0, p_query: args.query || null,
    p_status: args.status || null, p_workspace_id: args.workspaceId || null,
  }),
  users: (args: { limit?: number; offset?: number; query?: string } = {}) => rpc<FounderUser[]>("founder_list_users", {
    p_limit: args.limit ?? 50, p_offset: args.offset ?? 0, p_query: args.query || null,
  }),
  workspaces: (args: { limit?: number; offset?: number; query?: string } = {}) => rpc<FounderWorkspace[]>("founder_list_workspaces", {
    p_limit: args.limit ?? 50, p_offset: args.offset ?? 0, p_query: args.query || null,
  }),
  tickets: () => rpc<SupportTicket[]>("founder_list_support_tickets", { p_limit: 100 }),
  setUserActive: (profileId: string, active: boolean, reason: string) => rpc<void>("founder_set_profile_active", { p_profile_id: profileId, p_is_active: active, p_reason: reason }),
  setWorkspaceStatus: (workspaceId: string, status: "active" | "suspended", reason: string) => rpc<void>("founder_set_workspace_status", { p_workspace_id: workspaceId, p_status: status, p_reason: reason }),
  startSupport: (workspaceId: string, reason: string) => rpc<{ id: string; workspace_id: string; reason: string; expires_at: string }>("founder_start_support_mode", { p_workspace_id: workspaceId, p_reason: reason }),
  endSupport: (sessionId: string) => rpc<void>("founder_end_support_mode", { p_session_id: sessionId }),
  openSupportDashboard: (sessionId: string) => rpc<{
    workspace: { id: string; name: string; status: "active" | "suspended" | "deleted"; created_at: string; language: "en" | "fr" };
    profile: { id: string; workspace_id: string; full_name: string | null; email: string | null; role: string; created_at: string; is_active: boolean; allowed_sections: string[]; avatar_url: string | null };
  }>("founder_open_support_dashboard", { p_session_id: sessionId }),
  updateTicket: (ticketId: string, status: SupportTicket["status"], priority?: SupportTicket["priority"], reply?: string, internal = false) => rpc<void>("founder_update_support_ticket", {
    p_ticket_id: ticketId, p_status: status, p_priority: priority || null, p_reply: reply || null, p_internal: internal,
  }),
  usersV2: (args: { limit?: number; offset?: number; query?: string; role?: string; status?: string; plan?: string; hasWorkspace?: boolean } = {}) => rpc<PagedResult<FounderUserV2>>("founder_list_users_v2", {
    p_limit: args.limit ?? 50, p_offset: args.offset ?? 0, p_query: args.query || null, p_role: args.role || null,
    p_status: args.status || null, p_plan: args.plan || null, p_has_workspace: args.hasWorkspace ?? null,
  }),
  platformUsers: (args: { page?: number; pageSize?: number; query?: string; platformRole?: string; membershipRole?: string; accountState?: string; subscriptionStatus?: string; hasWorkspace?: boolean; createdFrom?: string; createdTo?: string } = {}) => rpc<PagedResult<FounderUserV2> & { page: number; page_size: number }>("platform_list_users_v1", {
    p_page: args.page ?? 1, p_page_size: args.pageSize ?? 30, p_query: args.query || null,
    p_platform_role: args.platformRole || null, p_membership_role: args.membershipRole || null,
    p_account_state: args.accountState || null, p_subscription_status: args.subscriptionStatus || null,
    p_has_workspace: args.hasWorkspace ?? null, p_created_from: args.createdFrom || null, p_created_to: args.createdTo || null,
  }),
  platformUser360: (profileId: string) => rpc<FounderUser360>("platform_get_user_360_v1", { p_profile_id: profileId }),
  platformAccountAction: async (profileId: string, action: "ban" | "unban" | "force_logout" | "hard_delete", reason: string, banDuration?: string) => {
    const { data, error } = await supabase.functions.invoke("platform-account-admin", { body: { target_profile_id: profileId, action, reason, ban_duration: banDuration || undefined } });
    if (error) throw error;
    if (data?.error) throw new Error(data.error);
    return data as { ok: true; action: string; target_profile_id: string };
  },
  user360: (profileId: string) => rpc<FounderUser360>("founder_get_user_360_v2", { p_profile_id: profileId }),
  addUserNote: (profileId: string, body: string) => rpc<void>("founder_add_user_note_v2", { p_profile_id: profileId, p_body: body }),
  setUserState: (profileId: string, state: "active" | "suspended" | "closed", reason: string, userMessage?: string, effectiveUntil?: string | null) => rpc<void>("founder_set_user_state_v2", {
    p_profile_id: profileId, p_state: state, p_reason: reason, p_user_message: userMessage || null, p_effective_until: effectiveUntil || null,
  }),
  startSupportV2: (workspaceId: string, profileId: string, reason: string) => rpc<{ id: string; workspace_id: string; profile_id: string; reason: string; expires_at: string }>("founder_start_support_mode_v2", { p_workspace_id: workspaceId, p_profile_id: profileId, p_reason: reason }),
  ordersV2: (args: { limit?: number; offset?: number; query?: string; status?: string; workspaceId?: string; from?: string; to?: string; sort?: string } = {}) => rpc<PagedResult<FounderOrderV2>>("founder_list_orders_v2", {
    p_limit: args.limit ?? 25, p_offset: args.offset ?? 0, p_query: args.query || null, p_status: args.status || null,
    p_workspace_id: args.workspaceId || null, p_from: args.from || null, p_to: args.to || null, p_sort: args.sort || "newest",
  }),
  orderDetail: (orderId: string) => rpc<{ order: Record<string, unknown>; workspace: { id: string; name: string } | null; items: Record<string, unknown>[] }>("founder_get_order_detail_v2", { p_order_id: orderId }),
  auditEvents: (args: { limit?: number; offset?: number } = {}) => rpc<PagedResult<FounderEvent>>("founder_list_audit_events_v2", { p_limit: args.limit ?? 50, p_offset: args.offset ?? 0 }),
  notifications: () => rpc<{ rows: FounderNotification[]; unread: number }>("founder_list_notifications_v2", { p_limit: 30 }),
  markNotificationRead: (source: string, sourceId: string) => rpc<void>("founder_mark_notification_read_v2", { p_source: source, p_source_id: sourceId }),
  globalSearch: (query: string) => rpc<Array<{ kind: string; id: string; title: string; detail: string; href: string }>>("founder_global_search_v2", { p_query: query }),
  announcements: () => rpc<FounderAnnouncement[]>("founder_list_announcements_v2", { p_limit: 100 }),
  saveAnnouncement: (item: Partial<FounderAnnouncement> & { title: string; body: string }) => rpc<{ id: string; status: string }>("founder_upsert_announcement_v2", {
    p_id: item.id || null, p_title: item.title, p_body: item.body, p_audience: item.audience || "all", p_workspace_id: item.workspace_id || null,
    p_audience_roles: item.audience_roles || [], p_status: item.status || "draft", p_publish_at: item.publish_at || null,
    p_dismissible: item.dismissible ?? true, p_sticky: item.sticky ?? false,
  }),
  myAnnouncements: () => rpc<UserAnnouncement[]>("founder_list_my_announcements_v2"),
  markAnnouncement: (announcementId: string, dismiss = false) => rpc<void>("founder_mark_announcement_v2", { p_announcement_id: announcementId, p_dismiss: dismiss }),
  intelligence: (query?: string, platform?: string) => rpc<{ campaigns: Array<Record<string, unknown>>; products: Array<Record<string, unknown>>; capabilities: Record<string, unknown> }>("founder_intelligence_v2", { p_query: query || null, p_platform: platform || null, p_limit: 24 }),
  platformOverview: () => rpc<{ plans: Array<Record<string, unknown>>; invoices: Array<Record<string, unknown>>; settings: Array<Record<string, unknown>>; events: FounderEvent[] }>("founder_platform_overview_v2"),
  touchLastActive: () => rpc<string>("touch_last_active"),
  touchLastLogin: () => rpc<string>("touch_last_login"),
  openWorkspaceDashboardV3: (workspaceId: string, profileId: string) => rpc<{ id: string; workspace_id: string; profile_id: string; expires_at: string }>("founder_open_workspace_dashboard_v3", { p_workspace_id: workspaceId, p_profile_id: profileId }),
  updateUserRoleV3: (profileId: string, platformRole?: string | null, workspaceId?: string | null, membershipRole?: string | null) => rpc<{ platform_role: string; membership_role: string | null }>("founder_update_user_role_v3", { p_profile_id: profileId, p_platform_role: platformRole || null, p_workspace_id: workspaceId || null, p_membership_role: membershipRole || null }),
  user360V3: (profileId: string) => rpc<{ user: Pick<FounderUserV2, "id" | "full_name" | "email" | "role" | "last_active" | "created_at"> & { last_login_at?: string | null }; memberships: FounderMembership[] }>("founder_get_user_360_v3", { p_profile_id: profileId }),
  globalOrdersV3: (args: { page?: number; pageSize?: number; search?: string; status?: string; workspaceId?: string; startDate?: string; endDate?: string; sort?: string } = {}) => rpc<FounderGlobalOrdersResult>("founder_global_orders_v3", {
    p_page: args.page ?? 1, p_page_size: args.pageSize ?? 25, p_search: args.search || null, p_status: args.status || null,
    p_workspace_id: args.workspaceId || null, p_start_date: args.startDate || null, p_end_date: args.endDate || null, p_sort: args.sort || "newest",
  }),
  platformSettingsV3: () => rpc<FounderPlatformSetting[]>("founder_list_platform_settings_v3"),
  updatePlatformSettingV3: (settingId: string, value: unknown, description?: string, category?: string) => rpc<FounderPlatformSetting>("founder_update_platform_setting_v3", { p_setting_id: settingId, p_value: value, p_description: description ?? null, p_category: category ?? null }),
  createPlatformSettingV3: (key: string, value: unknown, description?: string, category?: string) => rpc<FounderPlatformSetting>("founder_create_platform_setting_v3", { p_settings_key: key, p_value: value, p_description: description || null, p_category: category || "general" }),
  deletePlatformSettingV3: (settingId: string) => rpc<void>("founder_delete_platform_setting_v3", { p_setting_id: settingId }),
  announcementsV3: () => rpc<FounderAnnouncementV3[]>("founder_list_announcements_v3"),
  saveAnnouncementV3: (item: Partial<FounderAnnouncementV3> & { title: string; body: string }) => rpc<{ id: string; status: string; is_active: boolean }>("founder_save_announcement_v3", {
    p_id: item.id || null, p_title: item.title, p_body: item.body, p_type: item.type || "info", p_priority: item.priority ?? 0,
    p_audience: item.audience || "all", p_workspace_id: item.workspace_id || null, p_target_profile_id: item.target_profile_id || null, p_target_plan: item.target_plan || null,
    p_audience_roles: item.audience_roles || [], p_cta_label: item.cta_label || null, p_cta_url: item.cta_url || null,
    p_start_at: item.start_at || null, p_end_at: item.end_at || null, p_publish_at: item.publish_at || null, p_status: item.status || "published",
    p_is_active: item.is_active ?? true, p_sticky: item.sticky ?? false, p_dismissible: item.dismissible ?? true, p_language: item.language || "en",
  }),
  toggleAnnouncementV3: (id: string, active: boolean) => rpc<void>("founder_toggle_announcement_v3", { p_id: id, p_is_active: active }),
  duplicateAnnouncementV3: (id: string) => rpc<{ id: string }>("founder_duplicate_announcement_v3", { p_id: id }),
  deleteAnnouncementV3: (id: string) => rpc<void>("founder_delete_announcement_v3", { p_id: id }),
  myAnnouncementsV3: () => rpc<UserAnnouncement[]>("founder_list_my_announcements_v3"),
};
