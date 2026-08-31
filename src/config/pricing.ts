export type BillingPeriod = "monthly" | "yearly";
export type PlanTier = string;

export interface PlanRequirements {
    ordersMonthly: number;
    workspaces: number;
    teamMembers: number;
    integrations: number;
    mobileApp: boolean;
    whatsappAutomation: boolean;
    aiConfirmationAgent: boolean;
    sawtyOS: boolean;
    landingPageOS: boolean;
    premiumSupport: boolean;
}

export interface RecommendationResult {
    recommendedPlan: PlanTier | "custom";
    reasons: string[];
    isNearingLimit: boolean;
    nextPlan?: PlanTier;
}

export function recommendPlan(_reqs: PlanRequirements): RecommendationResult {
    return {
        recommendedPlan: "custom",
        reasons: ["Plan recommendation is resolved from the live Supabase catalog."],
        isNearingLimit: false,
    };
}
