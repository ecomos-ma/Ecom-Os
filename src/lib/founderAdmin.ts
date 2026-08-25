import { supabase } from "./supabase";

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
  status: "active" | "suspended" | "closed";
  reason: string | null;
  effective_until: string | null;
  last_active: string | null;
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
  user: FounderUserV2 & { user_message?: string | null };
  memberships: FounderMembership[];
  activity: FounderEvent[];
  notes: Array<{ id: string; body: string; created_at: string }>;
  tickets: Array<{ id: string; subject: string; status: string; priority: string; created_at: string }>;
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
