import { Check, MessageCircle, Truck, X } from "lucide-react";
import { LandingLanguage } from "../../i18n";
import { integrationLogos } from "../../../../lib/integrationLogos";
import ecomosLogo from "../../../../assets/ecomos_logo_137x32.png";
import { Reveal } from "../motion/Reveal";

const copy = {
    en: {
        eyebrow: "Why Ecom OS",
        title: "Ecom OS vs. the old way",
        subtitle: "Stop stitching together chats, spreadsheets and carrier portals. Run the complete Moroccan COD workflow in one connected system.",
        feature: "What your operation needs",
        oldWay: "WhatsApp + sheets + portals",
        included: "Built in",
        fragmented: "Fragmented",
        rows: [
            "One pipeline for every order and sales channel",
            "Team roles, permissions and clear ownership",
            "Confirmation and WhatsApp updates linked to each order",
            "Moroccan carrier tracking in the same workspace",
            "Full customer history during every conversation",
            "Delivered-cost, return and margin metrics",
        ],
    },
    fr: {
        eyebrow: "Pourquoi Ecom OS",
        title: "Ecom OS face à l'ancienne méthode",
        subtitle: "Ne reliez plus manuellement les chats, feuilles de calcul et portails transporteurs. Pilotez tout le flux COD marocain dans un système connecté.",
        feature: "Ce dont votre opération a besoin",
        oldWay: "WhatsApp + feuilles + portails",
        included: "Intégré",
        fragmented: "Fragmenté",
        rows: [
            "Un seul pipeline pour chaque commande et canal",
            "Rôles, permissions et responsabilités d'équipe",
            "Confirmation et mises à jour WhatsApp liées à la commande",
            "Suivi des transporteurs marocains dans le même espace",
            "Historique client complet pendant chaque échange",
            "Coût livré, retours et marge clairement mesurés",
        ],
    },
    ar: {
        eyebrow: "لماذا Ecom OS",
        title: "Ecom OS مقارنة بالطريقة القديمة",
        subtitle: "توقف عن ربط المحادثات والجداول وبوابات شركات التوصيل يدوياً. أدر مسار الدفع عند الاستلام المغربي كاملاً داخل نظام واحد مترابط.",
        feature: "ما تحتاجه عملياتك",
        oldWay: "واتساب + جداول + بوابات",
        included: "مدمج",
        fragmented: "مشتت",
        rows: [
            "مسار واحد لكل طلب وقناة بيع",
            "أدوار وصلاحيات ومسؤوليات واضحة للفريق",
            "ربط التأكيد وتحديثات واتساب بكل طلب",
            "تتبع شركات التوصيل المغربية في نفس المساحة",
            "سجل العميل كاملاً أثناء كل محادثة",
            "قياس تكلفة التوصيل والمرتجعات وهامش الربح",
        ],
    },
} as const;

function StatusIcon({ positive, label }: { positive: boolean; label: string }) {
    return positive ? (
        <span className="inline-flex items-center gap-2 text-xs font-black text-emerald-700"><span className="flex h-7 w-7 items-center justify-center rounded-full bg-emerald-500 text-white shadow-sm shadow-emerald-500/20"><Check className="h-4 w-4 stroke-[3]" /></span><span className="hidden xl:inline">{label}</span></span>
    ) : (
        <span className="inline-flex items-center gap-2 text-xs font-black text-rose-600"><span className="flex h-7 w-7 items-center justify-center rounded-full bg-rose-500 text-white shadow-sm shadow-rose-500/20"><X className="h-4 w-4 stroke-[3]" /></span><span className="hidden xl:inline">{label}</span></span>
    );
}

export function EcomOSComparison({ lang }: { lang: LandingLanguage }) {
    const c = copy[lang];
    const isRtl = lang === "ar";

    return (
        <section className={`relative overflow-hidden border-t border-slate-200 bg-[#f8f5ff] py-24 sm:py-32 ${isRtl ? "rtl" : ""}`}>
            <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(circle_at_20%_10%,rgba(219,63,115,0.10),transparent_35%),radial-gradient(circle_at_85%_80%,rgba(124,58,237,0.10),transparent_38%)]" />
            <div className="relative mx-auto max-w-7xl px-4 sm:px-6 lg:px-8">
                <Reveal>
                    <div className="mx-auto mb-12 max-w-3xl text-center">
                        <div className="mb-4 inline-flex items-center gap-2 rounded-full border border-violet-200 bg-white/80 px-3.5 py-2 text-xs font-bold text-violet-700 shadow-sm"><span className="h-1.5 w-1.5 rounded-full bg-[#DB3F73]" />{c.eyebrow}</div>
                        <h2 className="text-balance text-4xl font-bold tracking-[-0.05em] text-[#21161a] sm:text-6xl">{c.title}</h2>
                        <p className="mx-auto mt-5 max-w-2xl text-base leading-7 text-slate-600 sm:text-lg sm:leading-8">{c.subtitle}</p>
                    </div>
                </Reveal>

                <Reveal delay={0.08}>
                    <div className="hidden overflow-hidden rounded-[28px] border border-violet-200/80 bg-white shadow-[0_28px_80px_rgba(63,35,97,0.14)] md:block">
                        <div className="grid grid-cols-[1.45fr_.85fr_.9fr] border-b border-violet-200 bg-white">
                            <div className="flex items-center px-6 py-5 text-sm font-black text-slate-900">{c.feature}</div>
                            <div className="flex items-center justify-center border-x border-emerald-200 bg-emerald-50/80 px-4 py-5"><img src={ecomosLogo} alt="Ecom OS" className="h-7 w-auto" /></div>
                            <div className="flex items-center justify-center gap-2 bg-rose-50/70 px-4 py-5" aria-label={c.oldWay}>
                                <span className="flex h-8 w-8 items-center justify-center rounded-lg bg-white shadow-sm"><img src={integrationLogos.whatsapp} alt="WhatsApp" className="h-5 w-5 rounded" /></span>
                                <span className="flex h-8 w-8 items-center justify-center rounded-lg bg-white shadow-sm"><img src={integrationLogos.google_sheets} alt="Google Sheets" className="h-5 w-5 rounded object-contain" /></span>
                                <span className="flex h-8 w-8 items-center justify-center rounded-lg bg-white text-sky-600 shadow-sm"><Truck className="h-5 w-5" /></span>
                            </div>
                        </div>
                        {c.rows.map((row, index) => (
                            <div key={row} className={`grid grid-cols-[1.45fr_.85fr_.9fr] ${index < c.rows.length - 1 ? "border-b border-violet-200/70" : ""}`}>
                                <div className="flex items-center px-6 py-5 text-sm font-semibold leading-6 text-slate-700">{row}</div>
                                <div className="flex items-center justify-center border-x border-emerald-200 bg-emerald-50/65 px-4 py-5"><StatusIcon positive label={c.included} /></div>
                                <div className="flex items-center justify-center bg-rose-50/55 px-4 py-5"><StatusIcon positive={false} label={c.fragmented} /></div>
                            </div>
                        ))}
                    </div>

                    <div className="space-y-3 md:hidden">
                        {c.rows.map((row) => (
                            <article key={row} className="overflow-hidden rounded-2xl border border-violet-200 bg-white shadow-[0_12px_35px_rgba(63,35,97,0.08)]">
                                <h3 className="px-4 py-4 text-sm font-black leading-6 text-slate-900">{row}</h3>
                                <div className="grid grid-cols-2 border-t border-violet-100">
                                    <div className="flex items-center justify-center gap-2 bg-emerald-50 px-3 py-3"><img src={ecomosLogo} alt="Ecom OS" className="h-5 w-auto" /><Check className="h-4 w-4 stroke-[3] text-emerald-600" /></div>
                                    <div className="flex items-center justify-center gap-2 bg-rose-50 px-3 py-3"><MessageCircle className="h-4 w-4 text-slate-500" /><X className="h-4 w-4 stroke-[3] text-rose-500" /></div>
                                </div>
                            </article>
                        ))}
                    </div>
                </Reveal>
            </div>
        </section>
    );
}
