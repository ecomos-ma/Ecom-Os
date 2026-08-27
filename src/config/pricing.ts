export type PlanTier = "starter" | "growth" | "pro" | "scale";
export type BillingPeriod = "monthly" | "yearly";

export interface PricingPlan {
    id: PlanTier;
    name: string;
    description: string;
    monthlyPrice: number;
    yearlyPrice: number;
    limits: {
        ordersMonthly: number; // For starter this represents an equivalent or we handle it via 'ordersDaily'
        ordersDaily?: number;
        workspaces: number | "unlimited";
        teamMembers: number;
        integrations: number | "unlimited";
    };
    features: {
        mobileApp: boolean;
        whatsappAutomation: boolean;
        aiConfirmationAgent: boolean;
        sawtyOS: boolean;
        landingPageOS: boolean;
        premiumSupport: boolean;
    };
}

export const PRICING_PLANS: Record<PlanTier, PricingPlan> = {
    starter: {
        id: "starter",
        name: "Starter",
        description: "For sellers starting small.",
        monthlyPrice: 199,
        yearlyPrice: 1990,
        limits: {
            ordersMonthly: 450, // Conceptual for calculation
            ordersDaily: 15,
            workspaces: 1,
            teamMembers: 2,
            integrations: 2,
        },
        features: {
            mobileApp: false,
            whatsappAutomation: false,
            aiConfirmationAgent: false,
            sawtyOS: false,
            landingPageOS: false,
            premiumSupport: false,
        }
    },
    growth: {
        id: "growth",
        name: "Growth",
        description: "For growing e-commerce businesses.",
        monthlyPrice: 399,
        yearlyPrice: 3990,
        limits: {
            ordersMonthly: 5000,
            workspaces: 3,
            teamMembers: 10,
            integrations: "unlimited",
        },
        features: {
            mobileApp: true,
            whatsappAutomation: true,
            aiConfirmationAgent: true,
            sawtyOS: true,
            landingPageOS: true,
            premiumSupport: true,
        }
    },
    pro: {
        id: "pro",
        name: "Pro",
        description: "For larger operations that outgrow Growth capacity.",
        monthlyPrice: 799,
        yearlyPrice: 7990,
        limits: {
            ordersMonthly: 20000,
            workspaces: 10,
            teamMembers: 25,
            integrations: "unlimited",
        },
        features: {
            mobileApp: true,
            whatsappAutomation: true,
            aiConfirmationAgent: true,
            sawtyOS: true,
            landingPageOS: true,
            premiumSupport: true,
        }
    },
    scale: {
        id: "scale",
        name: "Scale",
        description: "For high-volume operations.",
        monthlyPrice: 1499,
        yearlyPrice: 14990,
        limits: {
            ordersMonthly: 50000,
            workspaces: "unlimited",
            teamMembers: 50,
            integrations: "unlimited",
        },
        features: {
            mobileApp: true,
            whatsappAutomation: true,
            aiConfirmationAgent: true,
            sawtyOS: true,
            landingPageOS: true,
            premiumSupport: true,
        }
    }
};

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

export function recommendPlan(reqs: PlanRequirements): RecommendationResult {
    const reasons: string[] = [];

    // Check if Growth+ features are required
    const requiresPremium = reqs.mobileApp || reqs.whatsappAutomation ||
        reqs.aiConfirmationAgent || reqs.sawtyOS ||
        reqs.landingPageOS || reqs.premiumSupport;

    if (requiresPremium) {
        if (reqs.whatsappAutomation) reasons.push("WhatsApp Automation");
        if (reqs.aiConfirmationAgent) reasons.push("AI Confirmation Agent");
        if (reqs.sawtyOS) reasons.push("Sawty.OS");
        if (reqs.landingPageOS) reasons.push("Landing Page.OS");
        if (reqs.mobileApp) reasons.push("Mobile App");
        if (reqs.premiumSupport) reasons.push("Premium Support");
    }

    // Evaluate Starter
    const starter = PRICING_PLANS.starter;
    if (!requiresPremium &&
        reqs.ordersMonthly <= (starter.limits.ordersDaily! * 30) &&
        reqs.workspaces <= (starter.limits.workspaces as number) &&
        reqs.teamMembers <= starter.limits.teamMembers &&
        reqs.integrations <= (starter.limits.integrations as number)
    ) {
        return {
            recommendedPlan: "starter",
            reasons: ["Fits your current usage and capacities."],
            isNearingLimit: reqs.ordersMonthly >= 350 || reqs.teamMembers === 2 || reqs.integrations === 2,
            nextPlan: "growth"
        };
    }

    // Evaluate Growth
    const growth = PRICING_PLANS.growth;
    if (
        reqs.ordersMonthly <= growth.limits.ordersMonthly &&
        reqs.workspaces <= (growth.limits.workspaces as number) &&
        reqs.teamMembers <= growth.limits.teamMembers
    ) {
        const growthReasons = [...reasons.slice(0, 2)];
        if (reqs.ordersMonthly > 450) growthReasons.push(`${reqs.ordersMonthly.toLocaleString()} Orders/month`);
        if (reqs.workspaces > 1) growthReasons.push(`${reqs.workspaces} Workspaces`);
        if (reqs.teamMembers > 2) growthReasons.push(`${reqs.teamMembers} Team Members`);
        if (reqs.integrations > 2) growthReasons.push(`${reqs.integrations} Integrations`);

        return {
            recommendedPlan: "growth",
            reasons: growthReasons.length > 0 ? growthReasons : ["Fits your current operational usage."],
            isNearingLimit: reqs.ordersMonthly >= 4500 || reqs.workspaces === 3 || reqs.teamMembers >= 9,
            nextPlan: "pro"
        };
    }

    // Evaluate Pro
    const pro = PRICING_PLANS.pro;
    if (
        reqs.ordersMonthly <= pro.limits.ordersMonthly &&
        reqs.workspaces <= (pro.limits.workspaces as number) &&
        reqs.teamMembers <= pro.limits.teamMembers
    ) {
        const proReasons = [];
        if (reqs.ordersMonthly > 5000) proReasons.push(`${reqs.ordersMonthly.toLocaleString()} Orders/month`);
        if (reqs.workspaces > 3) proReasons.push(`${reqs.workspaces} Workspaces`);
        if (reqs.teamMembers > 10) proReasons.push(`${reqs.teamMembers} Team Members`);

        return {
            recommendedPlan: "pro",
            reasons: proReasons.length > 0 ? proReasons : ["Fits your high-capacity operations."],
            isNearingLimit: reqs.ordersMonthly >= 18000 || reqs.workspaces >= 9 || reqs.teamMembers >= 22,
            nextPlan: "scale"
        };
    }

    // Evaluate Scale
    const scale = PRICING_PLANS.scale;
    if (
        reqs.ordersMonthly <= scale.limits.ordersMonthly &&
        reqs.teamMembers <= scale.limits.teamMembers
    ) {
        const scaleReasons = [];
        if (reqs.ordersMonthly > 20000) scaleReasons.push(`${reqs.ordersMonthly.toLocaleString()} Orders/month`);
        if (reqs.workspaces > 10) scaleReasons.push(`Unlimited Workspaces`);
        if (reqs.teamMembers > 25) scaleReasons.push(`${reqs.teamMembers} Team Members`);

        return {
            recommendedPlan: "scale",
            reasons: scaleReasons.length > 0 ? scaleReasons : ["Maximal capacity required."],
            isNearingLimit: reqs.ordersMonthly >= 45000 || reqs.teamMembers >= 45
        };
    }

    // Needs Custom
    return {
        recommendedPlan: "custom",
        reasons: ["Operations exceed standard plan limits."],
        isNearingLimit: false
    };
}
