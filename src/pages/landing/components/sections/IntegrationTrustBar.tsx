import { motion } from "framer-motion";
import { ArrowUpRight, PlugZap } from "lucide-react";
import { LandingLanguage, i18n } from "../../i18n";
import { integrationLogos, type IntegrationLogoKey } from "../../../../lib/integrationLogos";

const providers: { id: IntegrationLogoKey; name: string; group: string }[] = [
    { id: "meta", name: "Meta", group: "Ads" },
    { id: "tiktok", name: "TikTok", group: "Ads" },
    { id: "shopify", name: "Shopify", group: "Store" },
    { id: "youcan", name: "YouCan", group: "Store" },
    { id: "google_sheets", name: "Google Sheets", group: "Data" },
    { id: "whatsapp", name: "WhatsApp", group: "Messaging" },
    { id: "ozon", name: "Ozon Express", group: "Shipping" },
    { id: "ameex", name: "Ameex", group: "Shipping" },
    { id: "coliaty", name: "Coliaty", group: "Shipping" },
    { id: "forcelog", name: "ForceLog", group: "Shipping" },
    { id: "sendit", name: "Sendit", group: "Shipping" },
];

const copy = {
    en: { eyebrow: "Connections for Moroccan commerce", title: "Your tools, finally working as one.", subtitle: "Bring orders, campaigns, messages, spreadsheets and Moroccan shipping updates into one live operating system.", action: "Explore connections" },
    fr: { eyebrow: "Connexions pour le commerce marocain", title: "Tous vos outils travaillent enfin ensemble.", subtitle: "Centralisez commandes, campagnes, messages, feuilles de calcul et livraisons marocaines dans un système vivant.", action: "Voir les connexions" },
    ar: { eyebrow: "ربط للتجارة المغربية", title: "كل أدواتك تعمل أخيراً كنظام واحد.", subtitle: "اجمع الطلبات والحملات والرسائل والجداول وتحديثات الشحن المغربية داخل نظام تشغيل حي واحد.", action: "استكشف عمليات الربط" },
};

export function IntegrationTrustBar({ lang }: { lang: LandingLanguage }) {
    const t = i18n[lang];
    const c = copy[lang];

    return (
        <section className="relative overflow-hidden border-y border-[#35131e]/[0.06] bg-white py-20 sm:py-24">
            <div className="pointer-events-none absolute left-1/2 top-0 h-56 w-[800px] -translate-x-1/2 rounded-full bg-[#FCE7EF]/60 blur-3xl" />
            <div className="relative mx-auto max-w-7xl px-5 sm:px-6">
                <div className="mx-auto mb-12 max-w-3xl text-center">
                    <div className="mb-4 inline-flex items-center gap-2 rounded-full bg-[#FCE7EF] px-3 py-1.5 text-xs font-bold text-[#a82855]">
                        <PlugZap className="h-3.5 w-3.5" /> {c.eyebrow}
                    </div>
                    <h2 className="text-balance text-3xl font-bold tracking-[-0.035em] text-[#21161a] sm:text-5xl">{c.title}</h2>
                    <p className="mx-auto mt-5 max-w-2xl text-base leading-7 text-slate-600 sm:text-lg">{c.subtitle}</p>
                </div>

                <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-6">
                    {providers.map((provider, index) => (
                        <motion.div
                            key={provider.id}
                            initial={{ opacity: 0, y: 12 }}
                            whileInView={{ opacity: 1, y: 0 }}
                            viewport={{ once: true, margin: "-40px" }}
                            transition={{ delay: Math.min(index * 0.035, 0.25) }}
                            className="group flex min-h-28 items-center gap-3 rounded-2xl border border-slate-200/80 bg-white p-3.5 shadow-[0_2px_12px_rgba(30,20,24,0.03)] transition duration-300 hover:-translate-y-1 hover:border-[#DB6A8F]/35 hover:shadow-[0_12px_30px_rgba(125,35,67,0.10)]"
                        >
                            <span className="flex h-12 w-12 shrink-0 items-center justify-center overflow-hidden rounded-xl border border-slate-100 bg-white p-1.5 shadow-sm">
                                <img src={integrationLogos[provider.id]} alt={`${provider.name} logo`} className="h-full w-full object-contain" loading="lazy" />
                            </span>
                            <span className="min-w-0 text-left rtl:text-right">
                                <span className="block truncate text-sm font-bold text-slate-900">{provider.name}</span>
                                <span className="mt-0.5 block text-[11px] font-medium text-slate-400">{provider.group}</span>
                            </span>
                        </motion.div>
                    ))}
                    <a href="#integrations" className="group flex min-h-28 items-center justify-center gap-2 rounded-2xl border border-dashed border-[#DB6A8F]/35 bg-[#fff8fa] p-4 text-sm font-bold text-[#b12b59] transition hover:border-[#DB6A8F] hover:bg-[#FCE7EF]">
                        {c.action} <ArrowUpRight className="h-4 w-4 transition-transform group-hover:-translate-y-0.5 group-hover:translate-x-0.5" />
                    </a>
                </div>

                <p className="mt-8 text-center text-xs font-semibold uppercase tracking-[0.14em] text-slate-400">
                    {t.trust.title} {lang === "ar" ? "يعتمد التوفر على صلاحية حساب المزود." : lang === "fr" ? "La disponibilité dépend de l'accès à votre compte fournisseur." : "Availability depends on access to your provider account."}
                </p>
            </div>
        </section>
    );
}
