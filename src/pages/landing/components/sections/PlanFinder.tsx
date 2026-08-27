import { useState } from "react";
import { Link } from "react-router-dom";
import { Check, Crown, Minus, ShieldCheck, Sparkles } from "lucide-react";
import { LandingLanguage, i18n } from "../../i18n";
import { BillingPeriod, PlanTier, PRICING_PLANS } from "../../../../config/pricing";

const planOrder: PlanTier[] = ["starter", "growth", "pro", "scale"];

const copy = {
    en: {
        eyebrow: "Simple, transparent pricing",
        subtitle: "Start lean, then scale without moving your operation to another platform.",
        monthly: "Monthly",
        yearly: "Yearly",
        save: "Save 2 months",
        mostPopular: "Most popular",
        billed: "billed annually",
        perMonth: "/mo",
        perYear: "/yr",
        capacity: "Capacity",
        premium: "Premium modules",
        cta: "Start with",
        reassurance: "14-day free trial · No card required · Cancel anytime",
        descriptions: {
            starter: "For solo sellers getting started with COD.",
            growth: "For growing stores scaling their COD volume.",
            pro: "For established operations with high order volume.",
            scale: "For agencies and multi-brand COD operations.",
        },
    },
    fr: {
        eyebrow: "Tarification simple et transparente",
        subtitle: "Démarrez léger puis évoluez sans changer de plateforme.",
        monthly: "Mensuel",
        yearly: "Annuel",
        save: "2 mois offerts",
        mostPopular: "Le plus populaire",
        billed: "facturé annuellement",
        perMonth: "/mois",
        perYear: "/an",
        capacity: "Capacité",
        premium: "Modules premium",
        cta: "Choisir",
        reassurance: "Essai gratuit de 14 jours · Sans carte · Résiliable à tout moment",
        descriptions: {
            starter: "Pour les vendeurs COD qui se lancent.",
            growth: "Pour les boutiques COD en pleine croissance.",
            pro: "Pour les opérations établies à fort volume.",
            scale: "Pour les agences et opérations multi-marques.",
        },
    },
    ar: {
        eyebrow: "أسعار بسيطة وواضحة",
        subtitle: "ابدأ بخفة ثم توسع دون نقل عملياتك إلى منصة أخرى.",
        monthly: "شهري",
        yearly: "سنوي",
        save: "شهران مجاناً",
        mostPopular: "الأكثر شعبية",
        billed: "تدفع سنوياً",
        perMonth: "/شهر",
        perYear: "/سنة",
        capacity: "السعة",
        premium: "الوحدات المميزة",
        cta: "ابدأ بخطة",
        reassurance: "تجربة مجانية 14 يوماً · بدون بطاقة · إلغاء في أي وقت",
        descriptions: {
            starter: "للبائعين المستقلين في بداية الدفع عند الاستلام.",
            growth: "للمتاجر النامية التي توسع حجم طلباتها.",
            pro: "للعمليات المستقرة ذات حجم الطلبات الكبير.",
            scale: "للوكالات وعمليات التجارة متعددة العلامات.",
        },
    },
};

const premiumFeatures = [
    { key: "mobileApp", label: "Mobile App" },
    { key: "whatsappAutomation", label: "WhatsApp Automation" },
    { key: "aiConfirmationAgent", label: "AI WhatsApp Agent" },
    { key: "sawtyOS", label: "Sawty.OS" },
    { key: "landingPageOS", label: "Landing Page.OS" },
    { key: "premiumSupport", label: "Premium Support" },
] as const;

function formatLimit(value: number | "unlimited") {
    return value === "unlimited" ? "Unlimited" : value.toLocaleString("en-US");
}

export function PlanFinder({ lang }: { lang: LandingLanguage }) {
    const t = i18n[lang];
    const c = copy[lang];
    const [billing, setBilling] = useState<BillingPeriod>("monthly");

    return (
        <section className="relative overflow-hidden border-t border-[#35131e]/[0.07] bg-[#fcfafb] py-24 sm:py-28">
            <div className="pointer-events-none absolute left-1/2 top-0 h-80 w-[900px] -translate-x-1/2 rounded-full bg-[#f9dce6]/50 blur-3xl" />
            <div className="relative mx-auto max-w-[1420px] px-4 sm:px-6 lg:px-8">
                <div className="mx-auto mb-10 max-w-3xl text-center">
                    <div className="mb-4 inline-flex items-center gap-2 rounded-full border border-[#DB6A8F]/15 bg-white px-3 py-1.5 text-xs font-bold text-[#a82855] shadow-sm">
                        <Sparkles className="h-3.5 w-3.5" /> {c.eyebrow}
                    </div>
                    <h2 className="text-balance text-4xl font-bold tracking-[-0.04em] text-[#21161a] sm:text-5xl">{t.pricing.title}</h2>
                    <p className="mx-auto mt-5 max-w-2xl text-base leading-7 text-slate-600 sm:text-lg">{c.subtitle}</p>
                </div>

                <div className="mb-12 flex justify-center">
                    <div className="inline-flex rounded-full border border-slate-200 bg-white p-1.5 shadow-sm">
                        <button onClick={() => setBilling("monthly")} className={`rounded-full px-5 py-2.5 text-sm font-bold transition ${billing === "monthly" ? "bg-slate-950 text-white shadow" : "text-slate-500 hover:text-slate-900"}`}>
                            {c.monthly}
                        </button>
                        <button onClick={() => setBilling("yearly")} className={`flex items-center gap-2 rounded-full px-4 py-2.5 text-sm font-bold transition ${billing === "yearly" ? "bg-slate-950 text-white shadow" : "text-slate-500 hover:text-slate-900"}`}>
                            {c.yearly}
                            <span className={`rounded-full px-2 py-0.5 text-[10px] font-extrabold uppercase ${billing === "yearly" ? "bg-[#DB3F73] text-white" : "bg-emerald-100 text-emerald-700"}`}>{c.save}</span>
                        </button>
                    </div>
                </div>

                <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4 xl:gap-3">
                    {planOrder.map((tier) => {
                        const plan = PRICING_PLANS[tier];
                        const popular = tier === "growth";
                        const price = billing === "monthly" ? plan.monthlyPrice : plan.yearlyPrice;
                        const capacity = [
                            plan.limits.ordersDaily
                                ? `${plan.limits.ordersDaily} orders / day`
                                : `${plan.limits.ordersMonthly.toLocaleString("en-US")} orders / month`,
                            `${formatLimit(plan.limits.workspaces)} ${plan.limits.workspaces === 1 ? "workspace" : "workspaces"}`,
                            `${plan.limits.teamMembers} team members`,
                            `${formatLimit(plan.limits.integrations)} integrations`,
                        ];

                        return (
                            <article key={tier} className={`relative flex min-h-[690px] flex-col rounded-[24px] bg-white p-5 transition duration-300 hover:-translate-y-1 sm:p-6 ${popular ? "border-2 border-[#DB3F73] shadow-[0_22px_60px_rgba(168,40,85,0.16)]" : "border border-slate-200 shadow-[0_8px_30px_rgba(30,20,24,0.04)] hover:shadow-[0_18px_45px_rgba(30,20,24,0.09)]"}`}>
                                {popular && (
                                    <div className="absolute -top-3.5 left-1/2 flex -translate-x-1/2 items-center gap-1.5 whitespace-nowrap rounded-full bg-[#DB3F73] px-4 py-1.5 text-[10px] font-black uppercase tracking-[0.12em] text-white shadow-lg shadow-[#DB3F73]/20">
                                        <Crown className="h-3 w-3" /> {c.mostPopular}
                                    </div>
                                )}

                                <div className="min-h-[132px] border-b border-slate-100 pb-5 pt-2">
                                    <div className="mb-2 flex items-center justify-between gap-3">
                                        <h3 className="text-xl font-bold tracking-tight text-slate-950">{plan.name}</h3>
                                        {tier === "scale" && <ShieldCheck className="h-5 w-5 text-[#DB3F73]" />}
                                    </div>
                                    <p className="min-h-10 text-sm leading-5 text-slate-500">{c.descriptions[tier]}</p>
                                    <div className="mt-5 flex items-end gap-1.5" dir="ltr">
                                        <span className="pb-1.5 text-xs font-bold uppercase tracking-wider text-slate-500">MAD</span>
                                        <span className="text-[2.75rem] font-bold leading-none tracking-[-0.05em] text-[#171116]">{price.toLocaleString("en-US")}</span>
                                        <span className="pb-1 text-xs font-semibold text-slate-500">{billing === "monthly" ? c.perMonth : c.perYear}</span>
                                    </div>
                                    {billing === "yearly" && <p className="mt-2 text-[11px] font-semibold text-emerald-600">{c.billed} · {c.save}</p>}
                                </div>

                                <Link to={`/login?mode=signup&plan=${tier}&billing=${billing}`} className={`mt-5 flex h-11 items-center justify-center rounded-xl text-sm font-bold transition ${popular ? "bg-[#DB3F73] text-white shadow-lg shadow-[#DB3F73]/20 hover:bg-[#c93265]" : "border border-slate-300 bg-white text-slate-900 hover:border-[#DB3F73] hover:bg-[#fff6f9] hover:text-[#b12958]"}`}>
                                    {c.cta} {plan.name}
                                </Link>

                                <div className="mt-5 border-b border-slate-100 pb-5">
                                    <p className="mb-3 text-[10px] font-bold uppercase tracking-[0.16em] text-slate-400">{c.capacity}</p>
                                    <ul className="space-y-2.5">
                                        {capacity.map((item) => (
                                            <li key={item} className="flex items-start gap-2 text-xs font-medium text-slate-700">
                                                <span className="mt-0.5 flex h-4 w-4 shrink-0 items-center justify-center rounded-full bg-emerald-50"><Check className="h-3 w-3 text-emerald-600" /></span>
                                                {item}
                                            </li>
                                        ))}
                                    </ul>
                                </div>

                                <div className="mt-5">
                                    <p className="mb-3 text-[10px] font-bold uppercase tracking-[0.16em] text-slate-400">{c.premium}</p>
                                    <ul className="space-y-2.5">
                                        {premiumFeatures.map((feature) => {
                                            const enabled = plan.features[feature.key];
                                            return (
                                                <li key={feature.key} className={`flex items-center gap-2 text-xs font-medium ${enabled ? "text-slate-700" : "text-slate-400"}`}>
                                                    <span className={`flex h-4 w-4 shrink-0 items-center justify-center rounded-full ${enabled ? "bg-emerald-50" : "bg-slate-100"}`}>
                                                        {enabled ? <Check className="h-3 w-3 text-emerald-600" /> : <Minus className="h-3 w-3 text-slate-300" />}
                                                    </span>
                                                    {feature.label}
                                                </li>
                                            );
                                        })}
                                    </ul>
                                </div>
                            </article>
                        );
                    })}
                </div>

                <div className="mt-8 flex items-center justify-center gap-2 text-center text-xs font-semibold text-slate-500">
                    <ShieldCheck className="h-4 w-4 text-emerald-500" /> {c.reassurance}
                </div>
            </div>
        </section>
    );
}
