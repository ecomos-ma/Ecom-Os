import type { AllowedSection, TeamPermissions, TeamRole } from "./types";

export const ALL_ALLOWED_SECTIONS: AllowedSection[] = [
  "Dashboard",
  "Orders",
  "Confirmation",
  "Shipping",
  "Customers",
  "Products",
  "Inventory",
  "Ads Manager",
  "TikTok Ads",
  "Expenses",
  "COD Scenarios",
  "Analytics",
  "Team",
  "Settings",
];

export const TEAM_SECTION_ROUTES: Record<AllowedSection, string> = {
  Dashboard: "/dashboard",
  Orders: "/orders",
  Confirmation: "/confirmation",
  Shipping: "/shipping",
  Customers: "/customers",
  Products: "/products",
  Inventory: "/inventory",
  "Ads Manager": "/ads-manager",
  "TikTok Ads": "/tiktok-ads",
  Expenses: "/expenses",
  "COD Scenarios": "/cod-scenarios",
  Analytics: "/dashboard",
  Team: "/team",
  Settings: "/settings",
};

export const TEAM_SECTION_LABELS: Record<AllowedSection, string> = {
  Dashboard: "Dashboard",
  Orders: "Orders",
  Confirmation: "Confirmation",
  Shipping: "Shipping",
  Customers: "Customers",
  Products: "Products",
  Inventory: "Inventory",
  "Ads Manager": "Ads Manager",
  "TikTok Ads": "TikTok Ads",
  Expenses: "Expenses",
  "COD Scenarios": "COD Scenarios",
  Analytics: "Analytics",
  Team: "Team",
  Settings: "Settings",
};

// Founder-only administration. This is intentionally an exact-email allowlist;
// database RPCs and Edge Functions enforce the same rule independently.
export const FOUNDER_EMAIL = "amineelaaouamecom@gmail.com";

export function isFounder(role: string | null | undefined, email: string | null | undefined): boolean {
  return role === "founder" && email?.trim().toLowerCase() === FOUNDER_EMAIL;
}

/** @deprecated Kept as a compatibility alias while legacy admin screens are retired. */
export const SUPER_ADMIN_EMAIL = FOUNDER_EMAIL;

/** @deprecated Use isFounder for all new authorization checks. */
export function isSuperAdmin(role: string | null | undefined, email: string | null | undefined): boolean {
  return isFounder(role, email);
}

export const TEAM_SECTION_PERMISSION_KEY: Record<AllowedSection, keyof TeamPermissions> = {
  Dashboard: "dashboard",
  Orders: "orders",
  Confirmation: "confirmation",
  Shipping: "shipping",
  Customers: "customers",
  Products: "products",
  Inventory: "inventory",
  "Ads Manager": "ads",
  "TikTok Ads": "tiktok_ads",
  Expenses: "expenses",
  "COD Scenarios": "codscenarios",
  Analytics: "analytics",
  Team: "team",
  Settings: "settings",
};

export const ALL_TEAM_PERMISSIONS: TeamPermissions = {
  dashboard: true,
  orders: true,
  confirmation: true,
  shipping: true,
  customers: true,
  products: true,
  inventory: true,
  ads: true,
  tiktok_ads: true,
  expenses: true,
  codscenarios: true,
  analytics: true,
  reports: true,
  team: true,
  settings: true,
  admin: true,
  users: true,
  workspaces: true,
  subscriptions: true,
  logs: true,
};

export const DEFAULT_TEAM_PERMISSIONS: TeamPermissions = {
  dashboard: true,
  orders: false,
  confirmation: false,
  shipping: false,
  customers: false,
  products: false,
  inventory: false,
  ads: false,
  tiktok_ads: false,
  expenses: false,
  codscenarios: false,
  analytics: false,
  reports: false,
  team: false,
  settings: false,
  admin: false,
  users: false,
  workspaces: false,
  subscriptions: false,
  logs: false,
};

export const ROLE_LABELS: Record<TeamRole, string> = {
  owner: "Owner",
  supervisor: "Supervisor",
  agent: "Agent",
};

export const ROLE_OPTIONS: Array<{ value: TeamRole; label: string }> = [
  { value: "agent", label: "Agent" },
  { value: "supervisor", label: "Supervisor" },
];

export function normalizeAllowedSections(values: string[] | null | undefined): AllowedSection[] {
  if (!Array.isArray(values)) {
    return [];
  }

  const normalized = values
    .map((value) => (typeof value === "string" ? value.trim() : ""))
    .filter(Boolean);

  return normalized.filter((value): value is AllowedSection => ALL_ALLOWED_SECTIONS.includes(value as AllowedSection));
}

export function buildPermissionsFromSections(sections: string[] | null | undefined): TeamPermissions {
  const normalized = normalizeAllowedSections(sections);

  return ALL_ALLOWED_SECTIONS.reduce((permissions, section) => {
    const key = TEAM_SECTION_PERMISSION_KEY[section];
    permissions[key] = normalized.includes(section);
    return permissions;
  }, { ...DEFAULT_TEAM_PERMISSIONS });
}

export function buildPermissionsForOwner(): TeamPermissions {
  return { ...ALL_TEAM_PERMISSIONS };
}

export function getFirstAllowedRoute(sections: string[] | null | undefined): string | null {
  const normalized = normalizeAllowedSections(sections);

  for (const section of ALL_ALLOWED_SECTIONS) {
    if (normalized.includes(section)) {
      return TEAM_SECTION_ROUTES[section];
    }
  }

  return null;
}

export function getDefaultAllowedSections(role: TeamRole | string | null | undefined): AllowedSection[] {
  if (role === "owner" || role === "supervisor") {
    return ALL_ALLOWED_SECTIONS;
  }

  return ["Dashboard"];
}

export function isOwnerLikeRole(role: string | null | undefined): boolean {
  return role === "owner" || role === "supervisor";
}

export function isAgentRole(role: string | null | undefined): boolean {
  return role === "agent";
}
