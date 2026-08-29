import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { AnimatePresence, motion, useReducedMotion } from "framer-motion";
import { ArrowRight, Check, Menu, Play, Sparkles, X } from "lucide-react";
import { LandingLanguage, i18n } from "./landing/i18n";
import { Reveal } from "./landing/components/motion/Reveal";
import { HeroCommandCenter } from "./landing/components/sections/HeroCommandCenter";
import { IntegrationTrustBar } from "./landing/components/sections/IntegrationTrustBar";
import { ShippingCarrierMarquee, StoreTrustMarquee } from "./landing/components/sections/CommerceMarquees";
import { CostPerDeliveredDemo } from "./landing/components/sections/CostPerDeliveredDemo";
import { OperatingSystemMap } from "./landing/components/sections/OperatingSystemMap";
import { TeamManagementSection } from "./landing/components/sections/TeamManagementSection";
import { WhatsAppAutomationSection } from "./landing/components/sections/WhatsAppAutomationSection";
import { ReturnsScannerSection } from "./landing/components/sections/ReturnsScannerSection";
import { EcomOSComparison } from "./landing/components/sections/EcomOSComparison";
import { PlanFinder } from "./landing/components/sections/PlanFinder";
import { TestimonialsAndFAQ } from "./landing/components/sections/TestimonialsAndFAQ";
import { FinalCTA } from "./landing/components/sections/FinalCTA";
import { LandingFooter } from "./landing/components/sections/LandingFooter";
import ecomosLogo from "../assets/ecomos_logo_137x32.png";

const heroCopy = {
    en: {
        eyebrow: "Built for Morocco's COD operations",
        lineOne: "Run your entire",
        highlights: ["e-commerce operation", "order pipeline", "delivery workflow", "profit reporting"],
        lineTwo: "from one calm workspace.",
        proof: ["No credit card", "Set up in minutes", "Cancel anytime"],
        demo: "Watch product tour",
        activity: "Live order status across one Moroccan workspace",
    },
    fr: {
        eyebrow: "Conçu pour les opérations COD au Maroc",
        lineOne: "Pilotez toute votre",
        highlights: ["activité e-commerce", "gestion des commandes", "chaîne de livraison", "croissance rentable"],
        lineTwo: "depuis un espace clair.",
        proof: ["Sans carte bancaire", "Prêt en quelques minutes", "Résiliable à tout moment"],
        demo: "Voir la démo produit",
        activity: "Statut des commandes en direct dans un espace marocain",
    },
    ar: {
        eyebrow: "مصمم لعمليات الدفع عند الاستلام في المغرب",
        lineOne: "أدر كل",
        highlights: ["عمليات تجارتك الإلكترونية", "طلباتك", "شحناتك", "أرباحك"],
        lineTwo: "من مساحة عمل واحدة وهادئة.",
        proof: ["بدون بطاقة بنكية", "جاهز في دقائق", "إلغاء في أي وقت"],
        demo: "شاهد جولة المنتج",
        activity: "حالة الطلبات مباشرة داخل مساحة عمل مغربية واحدة",
    },
};

export default function LandingV3() {
    const [lang, setLang] = useState<LandingLanguage>("en");
    const [mobileMenuOpen, setMobileMenuOpen] = useState(false);
    const [activeHighlight, setActiveHighlight] = useState(0);
    const prefersReducedMotion = useReducedMotion();

    useEffect(() => {
        const savedLang = localStorage.getItem("preferred_landing_lang") as LandingLanguage;
        if (savedLang && ["ar", "en", "fr"].includes(savedLang)) setLang(savedLang);
    }, []);

    const toggleLanguage = (newLang: LandingLanguage) => {
        setLang(newLang);
        localStorage.setItem("preferred_landing_lang", newLang);
    };

    useEffect(() => {
        document.documentElement.lang = lang;
        document.documentElement.dir = lang === "ar" ? "rtl" : "ltr";
    }, [lang]);

    useEffect(() => {
        setActiveHighlight(0);
        if (prefersReducedMotion) return;

        const rotation = window.setInterval(() => {
            setActiveHighlight((current) => (current + 1) % heroCopy[lang].highlights.length);
        }, 3000);

        return () => window.clearInterval(rotation);
    }, [lang, prefersReducedMotion]);

    const t = i18n[lang];
    const h = heroCopy[lang];
    const isRtl = lang === "ar";
    const navItems = [
        { label: t.nav.product, href: "#product" },
        { label: t.nav.solutions, href: "#solutions" },
        { label: t.nav.integrations, href: "#integrations" },
        { label: t.nav.pricing, href: "#pricing" },
    ];

    return (
        <div className="min-h-screen overflow-x-hidden bg-[#fffdfd] text-slate-950 selection:bg-[#f4cedb] selection:text-[#21161a]">
            <nav className="fixed inset-x-0 top-0 z-50 border-b border-[#3b1420]/[0.07] bg-white/85 backdrop-blur-xl">
                <div className="mx-auto flex h-[72px] max-w-[1360px] items-center justify-between px-4 sm:px-6 lg:px-8">
                    <a href="#product" aria-label="Ecom OS home" className="flex shrink-0 items-center">
                        <img src={ecomosLogo} alt="Ecom OS" width={137} height={32} className="h-8 w-auto" />
                    </a>

                    <div className="hidden items-center gap-1 rounded-full border border-slate-200/80 bg-slate-50/80 p-1 lg:flex">
                        {navItems.map((item) => (
                            <a key={item.href} href={item.href} className="rounded-full px-4 py-2 text-sm font-semibold text-slate-600 transition hover:bg-white hover:text-slate-950 hover:shadow-sm">
                                {item.label}
                            </a>
                        ))}
                    </div>

                    <div className="flex items-center gap-2 sm:gap-3">
                        <div className="hidden items-center rounded-full border border-slate-200 bg-white p-1 sm:flex" aria-label="Language selector">
                            {(["en", "fr", "ar"] as LandingLanguage[]).map((option) => (
                                <button
                                    key={option}
                                    type="button"
                                    onClick={() => toggleLanguage(option)}
                                    className={`min-w-9 rounded-full px-2 py-1.5 text-[11px] font-bold uppercase transition ${lang === option ? "bg-slate-950 text-white" : "text-slate-500 hover:text-slate-900"}`}
                                >
                                    {option}
                                </button>
                            ))}
                        </div>
                        <Link to="/login" className="hidden px-2 text-sm font-semibold text-slate-700 transition hover:text-[#c93569] md:block">
                            {t.nav.login}
                        </Link>
                        <Link to="/login?mode=signup&plan=growth&billing=monthly" className="hidden h-10 items-center justify-center rounded-full bg-[#DB3F73] px-5 text-sm font-bold text-white shadow-[0_8px_24px_rgba(219,63,115,0.22)] transition hover:-translate-y-0.5 hover:bg-[#c93265] sm:inline-flex">
                            {t.nav.startFree}
                        </Link>
                        <button
                            type="button"
                            aria-label="Toggle navigation"
                            aria-expanded={mobileMenuOpen}
                            onClick={() => setMobileMenuOpen((open) => !open)}
                            className="flex h-10 w-10 items-center justify-center rounded-full border border-slate-200 text-slate-700 lg:hidden"
                        >
                            {mobileMenuOpen ? <X size={18} /> : <Menu size={18} />}
                        </button>
                    </div>
                </div>

                {mobileMenuOpen && (
                    <div className="border-t border-slate-100 bg-white px-4 py-4 shadow-xl lg:hidden">
                        <div className="mx-auto flex max-w-[1360px] flex-col gap-1">
                            {navItems.map((item) => (
                                <a key={item.href} href={item.href} onClick={() => setMobileMenuOpen(false)} className="rounded-xl px-4 py-3 text-sm font-semibold text-slate-700 hover:bg-slate-50">
                                    {item.label}
                                </a>
                            ))}
                            <div className="mt-3 flex gap-2 sm:hidden">
                                {(["en", "fr", "ar"] as LandingLanguage[]).map((option) => (
                                    <button key={option} onClick={() => { toggleLanguage(option); setMobileMenuOpen(false); }} className={`flex-1 rounded-xl py-2 text-xs font-bold uppercase ${lang === option ? "bg-slate-950 text-white" : "bg-slate-100 text-slate-600"}`}>
                                        {option}
                                    </button>
                                ))}
                            </div>
                            <Link to="/login?mode=signup&plan=growth&billing=monthly" className="mt-2 flex h-12 items-center justify-center rounded-xl bg-[#DB3F73] text-sm font-bold text-white sm:hidden">
                                {t.nav.startFree}
                            </Link>
                        </div>
                    </div>
                )}
            </nav>

            <main id="product" className="relative overflow-hidden pb-24 pt-32 sm:pt-40">
                <div className="pointer-events-none absolute inset-x-0 top-0 h-[720px] bg-[radial-gradient(circle_at_50%_15%,rgba(238,122,158,0.18),transparent_42%),linear-gradient(to_bottom,#fff7fa_0%,#fffdfd_70%)]" />
                <div className="pointer-events-none absolute left-[8%] top-40 h-24 w-24 rounded-full border border-[#DB6A8F]/20 bg-white/40 blur-[1px]" />
                <div className="pointer-events-none absolute right-[7%] top-56 h-40 w-40 rounded-full bg-[#DB6A8F]/[0.06] blur-2xl" />

                <section className="relative mx-auto max-w-7xl px-5 text-center sm:px-6">
                    <Reveal delay={0.05}>
                        <div className="mx-auto mb-6 inline-flex items-center gap-2 rounded-full border border-[#DB6A8F]/20 bg-white/80 px-3.5 py-2 text-xs font-bold text-[#a82855] shadow-sm backdrop-blur">
                            <Sparkles className="h-3.5 w-3.5" />
                            {h.eyebrow}
                            <span className="rounded-full bg-[#FCE7EF] px-2 py-0.5 text-[10px] uppercase tracking-wide">2026</span>
                        </div>
                    </Reveal>
                    <Reveal delay={0.1}>
                        <h1 className="mx-auto max-w-6xl text-[clamp(1.8rem,8.6vw,5.4rem)] font-bold leading-[0.96] tracking-[-0.055em] text-[#21161a]">
                            <span className="sr-only">{h.lineOne} {h.highlights[0]} {h.lineTwo}</span>
                            <span aria-hidden="true" className="block">
                                <span className="block">{h.lineOne}</span>
                                <span className="relative my-[0.08em] block h-[1.08em] overflow-visible">
                                    <AnimatePresence initial={false}>
                                        <motion.span
                                            key={`${lang}-${activeHighlight}`}
                                            initial={prefersReducedMotion ? false : { opacity: 0, y: "20%" }}
                                            animate={{ opacity: 1, y: 0 }}
                                            exit={prefersReducedMotion ? { opacity: 0 } : { opacity: 0, y: "-16%" }}
                                            transition={{ duration: prefersReducedMotion ? 0 : 0.38, ease: [0.22, 1, 0.36, 1] }}
                                            className="absolute inset-0 flex items-center justify-center whitespace-nowrap"
                                        >
                                            <span className="relative inline-block bg-gradient-to-r from-[#bd285b] via-[#e34d7e] to-[#a5214c] bg-clip-text px-[0.05em] text-transparent">
                                                {h.highlights[activeHighlight]}
                                                <span className="absolute inset-x-[4%] -bottom-[0.08em] h-[0.07em] rounded-full bg-gradient-to-r from-transparent via-[#e98cab]/70 to-transparent" />
                                            </span>
                                        </motion.span>
                                    </AnimatePresence>
                                </span>
                                <span className="block">{h.lineTwo}</span>
                            </span>
                        </h1>
                    </Reveal>
                    <Reveal delay={0.18}>
                        <p className="mx-auto mt-7 max-w-2xl text-pretty text-base leading-7 text-slate-600 sm:text-lg sm:leading-8">
                            {t.hero.subtitle}
                        </p>
                    </Reveal>
                    <Reveal delay={0.25}>
                        <div className="mt-9 flex flex-col items-center justify-center gap-3 sm:flex-row">
                            <Link to="/login?mode=signup&plan=growth&billing=monthly" className="group inline-flex h-14 w-full items-center justify-center gap-2 rounded-full bg-[#DB3F73] px-8 text-base font-bold text-white shadow-[0_14px_35px_rgba(207,49,101,0.25)] transition hover:-translate-y-1 hover:bg-[#c93265] sm:w-auto">
                                {t.hero.primary}
                                <ArrowRight className={`h-4 w-4 transition-transform group-hover:translate-x-1 ${isRtl ? "rotate-180" : ""}`} />
                            </Link>
                            <a href="#demo" className="inline-flex h-14 w-full items-center justify-center gap-2 rounded-full border border-slate-200 bg-white px-7 text-base font-bold text-slate-800 shadow-sm transition hover:border-slate-300 hover:bg-slate-50 sm:w-auto">
                                <span className="flex h-7 w-7 items-center justify-center rounded-full bg-[#FCE7EF] text-[#c93265]"><Play className="ml-0.5 h-3 w-3 fill-current" /></span>
                                {h.demo}
                            </a>
                        </div>
                        <div className="mt-5 flex flex-wrap items-center justify-center gap-x-5 gap-y-2 text-xs font-medium text-slate-500">
                            {h.proof.map((item) => (
                                <span key={item} className="flex items-center gap-1.5"><Check className="h-3.5 w-3.5 text-emerald-500" />{item}</span>
                            ))}
                        </div>
                    </Reveal>

                    <div id="demo" className="relative mx-auto mt-12 max-w-6xl sm:mt-16">
                        <div className="absolute -inset-5 -z-10 rounded-[2.5rem] bg-gradient-to-b from-[#FADDE7]/70 to-transparent blur-xl" />
                        <HeroCommandCenter lang={lang} />
                        <div className="mx-auto mt-6 inline-flex items-center gap-2 rounded-full border border-slate-200 bg-white px-4 py-2 text-xs font-semibold text-slate-500 shadow-sm">
                            <span className="relative flex h-2 w-2"><span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-emerald-400 opacity-75" /><span className="relative inline-flex h-2 w-2 rounded-full bg-emerald-500" /></span>
                            {h.activity}
                        </div>
                    </div>
                </section>
            </main>

            <ShippingCarrierMarquee lang={lang} />
            <IntegrationTrustBar lang={lang} />
            <div id="solutions" className="scroll-mt-[72px]"><OperatingSystemMap lang={lang} /></div>
            <TeamManagementSection lang={lang} />
            <CostPerDeliveredDemo lang={lang} />
            <div id="integrations" className="scroll-mt-[72px]"><WhatsAppAutomationSection lang={lang} /></div>
            <ReturnsScannerSection lang={lang} />
            <EcomOSComparison lang={lang} />
            <TestimonialsAndFAQ lang={lang} />
            <div id="pricing" className="scroll-mt-[72px]"><PlanFinder lang={lang} /></div>
            <FinalCTA lang={lang} />
            <StoreTrustMarquee lang={lang} />
            <LandingFooter lang={lang} />
        </div>
    );
}
