import { supabase } from './supabase.ts';

export type BillingPeriod = 'monthly' | 'yearly';

export type PlanFeatureKey =
  | 'mobile_app'
  | 'whatsapp_automation'
  | 'ai_whatsapp_confirmation_agent'
  | 'sawty_os'
  | 'landing_page_os'
  | 'premium_support';

export type PlanLimitKey =
  | 'orders'
  | 'workspaces'
  | 'team_members'
  | 'integrations';

export interface PlanFeatureSet {
  mobileApp: boolean;
  whatsappAutomation: boolean;
  aiConfirmationAgent: boolean;
  sawtyOS: boolean;
  landingPageOS: boolean;
  premiumSupport: boolean;
}

export interface PlanLimitSet {
  ordersMonthly: number | null;
  ordersDaily?: number | null;
  workspaces: number | 'unlimited';
  teamMembers: number | 'unlimited';
  integrations: number | 'unlimited';
}

export interface PublicPlanRecord {
  id: string | null;
  code: string;
  name: string;
  description: string;
  monthlyPrice: number;
  yearlyPrice: number;
  currency: string;
  billingEnabled: { monthly: boolean; annual: boolean };
  isActive: boolean;
  isPublic: boolean;
  isInternal: boolean;
  isPopular: boolean;
  displayOrder: number;
  badgeText: string;
  ctaText: string;
  limits: PlanLimitSet;
  features: PlanFeatureSet;
}

const DEFAULT_FEATURES: PlanFeatureSet = {
  mobileApp: false,
  whatsappAutomation: false,
  aiConfirmationAgent: false,
  sawtyOS: false,
  landingPageOS: false,
  premiumSupport: false,
};

function asNumber(value: unknown, fallback = 0) {
  const parsed = Number(value ?? fallback);
  return Number.isFinite(parsed) ? parsed : fallback;
}

function readJsonObject(value: unknown, fallback: Record<string, unknown> = {}) {
  if (value == null) return fallback;
  if (typeof value === 'string') {
    try { return JSON.parse(value) as Record<string, unknown>; } catch { return fallback; }
  }
  if (typeof value === 'object') return value as Record<string, unknown>;
  return fallback;
}

function readJsonArray(value: unknown, fallback: unknown[] = []) {
  if (value == null) return fallback;
  if (typeof value === 'string') {
    try { const parsed = JSON.parse(value); return Array.isArray(parsed) ? parsed : fallback; } catch { return fallback; }
  }
  if (Array.isArray(value)) return value;
  return fallback;
}

export function getPlanPrice(plan: Pick<PublicPlanRecord, 'monthlyPrice' | 'yearlyPrice'>, billing: BillingPeriod) {
  return billing === 'yearly' ? plan.yearlyPrice : plan.monthlyPrice;
}

export function getPriceForBilling(
  plan: Pick<PublicPlanRecord, 'monthlyPrice' | 'yearlyPrice'>,
  billing: BillingPeriod | string | null | undefined,
) {
  return billing === 'yearly' ? plan.yearlyPrice : plan.monthlyPrice;
}

export function normalizePlanRecord(input: any): PublicPlanRecord {
  const normalizedCode = String(input?.code || input?.slug || input?.id || 'plan').toLowerCase();
  const orderLimit = asNumber(input?.order_limit ?? input?.orders_limit ?? input?.limits?.orders ?? null, 0);
  const orderPeriod = String(input?.order_period ?? input?.period ?? 'month').toLowerCase();
  const monthlyPrice = asNumber(input?.monthly_price_mad ?? input?.monthly_price ?? input?.monthlyPrice ?? input?.price_mad ?? 0, 0);
  const yearlyPrice = asNumber(input?.annual_price_mad ?? input?.annual_price ?? input?.yearlyPrice ?? monthlyPrice * 10, monthlyPrice * 10);
  const workspaceLimit = input?.workspace_limit ?? input?.workspaces_limit ?? input?.limits?.workspaces;
  const teamMemberLimit = input?.team_member_limit ?? input?.members_limit ?? input?.team_members ?? input?.limits?.teamMembers;
  const integrationLimit = input?.integration_limit ?? input?.integrations_limit ?? input?.limits?.integrations ?? null;
  const entitlementObject = readJsonObject(input?.entitlements, {});
  const featureObject = readJsonObject(input?.features, {});
  const featureEnabled = (camelKey: keyof PlanFeatureSet, snakeKey: PlanFeatureKey) => Boolean(
    featureObject[camelKey] ?? featureObject[snakeKey] ?? entitlementObject[snakeKey] ?? entitlementObject[camelKey] ?? DEFAULT_FEATURES[camelKey],
  );
  const normalizedFeatures = {
    ...DEFAULT_FEATURES,
    mobileApp: featureEnabled('mobileApp', 'mobile_app'),
    whatsappAutomation: featureEnabled('whatsappAutomation', 'whatsapp_automation'),
    aiConfirmationAgent: featureEnabled('aiConfirmationAgent', 'ai_whatsapp_confirmation_agent'),
    sawtyOS: featureEnabled('sawtyOS', 'sawty_os'),
    landingPageOS: featureEnabled('landingPageOS', 'landing_page_os'),
    premiumSupport: featureEnabled('premiumSupport', 'premium_support'),
  };

  const ordersMonthly = orderPeriod === 'day' ? Math.max(0, Math.round(orderLimit * 30)) : orderLimit;
  const limitValues: PlanLimitSet = {
    ordersMonthly: ordersMonthly || null,
    ordersDaily: orderPeriod === 'day' ? Math.max(0, orderLimit) : null,
    workspaces: workspaceLimit == null || workspaceLimit === 'unlimited' || workspaceLimit === 'null' ? 'unlimited' : Number(workspaceLimit),
    teamMembers: teamMemberLimit == null || teamMemberLimit === 'unlimited' || teamMemberLimit === 'null'
      ? 'unlimited'
      : Math.max(0, Number(teamMemberLimit || 0)),
    integrations: integrationLimit == null || integrationLimit === 'unlimited' || integrationLimit === 'null' ? 'unlimited' : Number(integrationLimit),
  };

  const displayOrder = asNumber(input?.display_order ?? 100, 100);
  const badgeText = input?.badge_text || input?.badgeText || (Boolean(input?.is_popular) ? 'Most popular' : '');

  return {
    id: input?.id ?? null,
    code: normalizedCode,
    name: String(input?.name || normalizedCode),
    description: String(input?.description || ''),
    monthlyPrice: monthlyPrice,
    yearlyPrice: yearlyPrice,
    currency: String(input?.currency || 'MAD'),
    billingEnabled: {
      monthly: Boolean(input?.billing_enabled_monthly ?? input?.billing_enabled?.monthly ?? input?.monthly_billing_enabled ?? true),
      annual: Boolean(input?.billing_enabled_annual ?? input?.billing_enabled?.annual ?? input?.annual_billing_enabled ?? true),
    },
    isActive: Boolean(input?.is_active ?? true),
    isPublic: Boolean(input?.is_public ?? input?.is_official ?? true),
    isInternal: Boolean(input?.is_internal ?? false),
    isPopular: Boolean(input?.is_popular ?? false),
    displayOrder,
    badgeText,
    ctaText: String(input?.cta_text || input?.ctaText || `Start with ${input?.name || normalizedCode}`),
    limits: limitValues,
    features: normalizedFeatures,
  };
}

export function sortPlansByDisplay(plans: PublicPlanRecord[]) {
  return [...plans].sort((left, right) => {
    const leftIndex = Number(left.displayOrder ?? 100);
    const rightIndex = Number(right.displayOrder ?? 100);
    return leftIndex - rightIndex;
  });
}

export async function fetchOfficialPlans(client = supabase) {
  let data: any[] = [];

  try {
    const { data: rpcData, error } = await client.rpc('list_official_plans_v1');
    if (error) throw error;

    if (Array.isArray(rpcData)) {
      data = rpcData;
    } else if (rpcData && typeof rpcData === 'object') {
      const candidate = (rpcData as any).plans ?? (rpcData as any).data ?? (rpcData as any).rows ?? [];
      data = Array.isArray(candidate) ? candidate : [];
    }
  } catch {
    const { data: tableData, error: tableError } = await client
      .from('subscription_plans')
      .select('*')
      .eq('is_official', true)
      .eq('is_active', true)
      .order('display_order', { ascending: true });

    if (tableError) throw tableError;
    data = Array.isArray(tableData) ? tableData : [];
  }

  return sortPlansByDisplay(data.filter(Boolean).map(normalizePlanRecord)).filter((plan) => plan.isPublic && plan.isActive);
}

export const LANDING_PREMIUM_FEATURES = [
  { key: 'mobileApp', label: 'Mobile App' },
  { key: 'whatsappAutomation', label: 'WhatsApp Automation' },
  { key: 'aiConfirmationAgent', label: 'AI WhatsApp Agent' },
  { key: 'sawtyOS', label: 'Sawty.OS' },
  { key: 'landingPageOS', label: 'Landing Page.OS' },
  { key: 'premiumSupport', label: 'Premium Support' },
] as const;
