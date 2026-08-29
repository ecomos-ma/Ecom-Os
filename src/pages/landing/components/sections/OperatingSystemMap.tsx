import { useEffect, useState } from "react";
import { AnimatePresence, motion, useReducedMotion } from "framer-motion";
import type { LucideIcon } from "lucide-react";
import {
    Activity,
    ArrowLeft,
    ArrowRight,
    BarChart3,
    Check,
    CheckCircle2,
    Megaphone,
    MessageCircleMore,
    PackageCheck,
    Pause,
    Play,
    ShoppingBag,
    Sparkles,
    Truck,
    Zap,
} from "lucide-react";
import { LandingLanguage } from "../../i18n";
import { integrationLogos } from "../../../../lib/integrationLogos";
import ecomosLogo from "../../../../assets/ecomos_logo_137x32.png";

type FlowId = "orders" | "ads" | "confirmation" | "delivery";

interface FlowItem {
    id: FlowId;
    icon: LucideIcon;
    title: string;
    short: string;
    description: string;
    sources: Array<{ name: string; logo: string }>;
    outcomes: Array<{ title: string; detail: string }>;
    event: string;
    metric: string;
    metricLabel: string;
    accent: string;
}

const localizedCopy = {
    en: {
        eyebrow: "The control layer for Moroccan COD",
        title: "One live workflow. Zero blind handoffs.",
        subtitle: "Watch Ecom OS connect every operational stage—from the first store order to delivered cash—while your team keeps one shared source of truth.",
        commandCenter: "Workflow command center",
        automatic: "Automatic product tour",
        stage: "Stage",
        receives: "Connected inputs",
        processing: "Ecom OS automation",
        returns: "Your team gets",
        activity: "Latest workflow event",
        live: "Live now",
        healthy: "All connections healthy",
        stageCount: "4 connected stages",
        realTime: "Real-time orchestration",
        pause: "Pause automatic tour",
        play: "Play automatic tour",
        prev: "Previous workflow",
        next: "Next workflow",
        disclaimer: "Provider logos identify available connections and do not imply an official partnership.",
    },
    fr: {
        eyebrow: "La couche de contrôle du COD marocain",
        title: "Un flux en direct. Aucun passage à l'aveugle.",
        subtitle: "Voyez Ecom OS relier chaque étape, de la première commande boutique jusqu'au paiement livré, pendant que l'équipe partage une seule source fiable.",
        commandCenter: "Centre de commande du workflow",
        automatic: "Visite produit automatique",
        stage: "Étape",
        receives: "Entrées connectées",
        processing: "Automatisation Ecom OS",
        returns: "Votre équipe obtient",
        activity: "Dernier événement du flux",
        live: "En direct",
        healthy: "Toutes les connexions sont actives",
        stageCount: "4 étapes connectées",
        realTime: "Orchestration en temps réel",
        pause: "Mettre la visite en pause",
        play: "Lancer la visite automatique",
        prev: "Flux précédent",
        next: "Flux suivant",
        disclaimer: "Les logos identifient les connexions disponibles et n'impliquent aucun partenariat officiel.",
    },
    ar: {
        eyebrow: "طبقة التحكم في الدفع عند الاستلام بالمغرب",
        title: "مسار مباشر واحد. بدون انتقالات غامضة.",
        subtitle: "شاهد Ecom OS يربط كل مرحلة تشغيلية، من أول طلب في المتجر حتى تحصيل المبلغ بعد التوصيل، مع مصدر معلومات واحد لكل الفريق.",
        commandCenter: "مركز قيادة سير العمل",
        automatic: "جولة تلقائية في المنتج",
        stage: "المرحلة",
        receives: "المدخلات المرتبطة",
        processing: "أتمتة Ecom OS",
        returns: "يحصل فريقك على",
        activity: "آخر حدث في المسار",
        live: "مباشر الآن",
        healthy: "كل الاتصالات تعمل",
        stageCount: "4 مراحل مترابطة",
        realTime: "تنسيق لحظي للعمليات",
        pause: "إيقاف الجولة التلقائية",
        play: "تشغيل الجولة التلقائية",
        prev: "المسار السابق",
        next: "المسار التالي",
        disclaimer: "شعارات المزودين تشير إلى عمليات الربط المتاحة ولا تعني وجود شراكة رسمية.",
    },
} as const;

const flowsByLanguage: Record<LandingLanguage, FlowItem[]> = {
    en: [
        {
            id: "orders", icon: ShoppingBag, title: "Store orders", short: "Capture every COD order",
            description: "Orders enter one clean queue with the customer, Moroccan city, products, amount and source already attached.",
            sources: [{ name: "Shopify", logo: integrationLogos.shopify }, { name: "YouCan", logo: integrationLogos.youcan }],
            outcomes: [{ title: "One order queue", detail: "No copying between tabs" }, { title: "Clean customer data", detail: "Phone, city and products together" }, { title: "Clear ownership", detail: "Every action is assigned" }],
            event: "New COD order #MA-4092 is ready for confirmation", metric: "1,204", metricLabel: "orders unified this month", accent: "#7c3aed",
        },
        {
            id: "ads", icon: Megaphone, title: "Ads & profit", short: "Connect spend to delivery",
            description: "Campaign spend meets confirmed, shipped and delivered orders so the team can optimize for profit—not only cheap leads.",
            sources: [{ name: "Meta", logo: integrationLogos.meta }, { name: "TikTok", logo: integrationLogos.tiktok }],
            outcomes: [{ title: "Cost per delivered", detail: "See the metric that matters" }, { title: "Campaign margin", detail: "Revenue minus real costs" }, { title: "Better decisions", detail: "Scale profitable traffic" }],
            event: "Summer campaign margin refreshed after 18 deliveries", metric: "42.8 MAD", metricLabel: "cost per delivered order", accent: "#e23c73",
        },
        {
            id: "confirmation", icon: MessageCircleMore, title: "Confirmation", short: "Confirm while intent is hot",
            description: "A structured WhatsApp COD flow helps the customer confirm or correct the order, then updates the workspace immediately.",
            sources: [{ name: "WhatsApp", logo: integrationLogos.whatsapp }],
            outcomes: [{ title: "Confirmed order", detail: "Decision stored in real time" }, { title: "Address correction", detail: "Fewer avoidable returns" }, { title: "Team visibility", detail: "Everyone sees the same status" }],
            event: "Customer confirmed #MA-4092 on WhatsApp", metric: "84%", metricLabel: "confirmation rate today", accent: "#10a978",
        },
        {
            id: "delivery", icon: Truck, title: "Local delivery", short: "Track carrier handoffs",
            description: "Send prepared parcels to the chosen carrier and bring tracking events back into the same order timeline.",
            sources: [{ name: "Ozon", logo: integrationLogos.ozon }, { name: "Ameex", logo: integrationLogos.ameex }, { name: "ForceLog", logo: integrationLogos.forcelog }, { name: "Coliaty", logo: integrationLogos.coliaty }, { name: "Sendit", logo: integrationLogos.sendit }],
            outcomes: [{ title: "Shipment created", detail: "Fewer duplicate entries" }, { title: "Tracking synced", detail: "One status timeline" }, { title: "Delivery exceptions", detail: "Act before a return" }],
            event: "Carrier scan moved #MA-4092 to out for delivery", metric: "72%", metricLabel: "delivery rate this week", accent: "#2563eb",
        },
    ],
    fr: [
        {
            id: "orders", icon: ShoppingBag, title: "Commandes boutique", short: "Capturez chaque commande COD",
            description: "Les commandes arrivent dans une file claire avec le client, la ville marocaine, les produits, le montant et la source.",
            sources: [{ name: "Shopify", logo: integrationLogos.shopify }, { name: "YouCan", logo: integrationLogos.youcan }],
            outcomes: [{ title: "Une seule file", detail: "Plus de copie entre onglets" }, { title: "Données client propres", detail: "Téléphone, ville et produits" }, { title: "Responsabilité claire", detail: "Chaque action est attribuée" }],
            event: "La commande COD #MA-4092 est prête à confirmer", metric: "1 204", metricLabel: "commandes unifiées ce mois", accent: "#7c3aed",
        },
        {
            id: "ads", icon: Megaphone, title: "Publicité & marge", short: "Reliez dépenses et livraison",
            description: "Les dépenses publicitaires rejoignent les commandes confirmées et livrées pour optimiser le profit réel.",
            sources: [{ name: "Meta", logo: integrationLogos.meta }, { name: "TikTok", logo: integrationLogos.tiktok }],
            outcomes: [{ title: "Coût par livraison", detail: "La métrique utile" }, { title: "Marge campagne", detail: "Revenu moins coûts réels" }, { title: "Meilleures décisions", detail: "Scalez le trafic rentable" }],
            event: "Marge de la campagne été actualisée après 18 livraisons", metric: "42,8 MAD", metricLabel: "coût par commande livrée", accent: "#e23c73",
        },
        {
            id: "confirmation", icon: MessageCircleMore, title: "Confirmation", short: "Confirmez au bon moment",
            description: "Un flux WhatsApp COD structuré aide le client à confirmer ou corriger sa commande puis synchronise le statut.",
            sources: [{ name: "WhatsApp", logo: integrationLogos.whatsapp }],
            outcomes: [{ title: "Commande confirmée", detail: "Décision enregistrée" }, { title: "Adresse corrigée", detail: "Moins de retours évitables" }, { title: "Équipe alignée", detail: "Un statut pour tous" }],
            event: "Le client a confirmé #MA-4092 sur WhatsApp", metric: "84 %", metricLabel: "taux de confirmation aujourd'hui", accent: "#10a978",
        },
        {
            id: "delivery", icon: Truck, title: "Livraison locale", short: "Suivez les transporteurs",
            description: "Créez les colis chez le transporteur choisi et récupérez le suivi dans la même chronologie de commande.",
            sources: [{ name: "Ozon", logo: integrationLogos.ozon }, { name: "Ameex", logo: integrationLogos.ameex }, { name: "ForceLog", logo: integrationLogos.forcelog }, { name: "Coliaty", logo: integrationLogos.coliaty }, { name: "Sendit", logo: integrationLogos.sendit }],
            outcomes: [{ title: "Colis créé", detail: "Moins de doubles saisies" }, { title: "Suivi synchronisé", detail: "Une chronologie" }, { title: "Exceptions visibles", detail: "Agissez avant le retour" }],
            event: "Le scan transporteur place #MA-4092 en cours de livraison", metric: "72 %", metricLabel: "taux de livraison cette semaine", accent: "#2563eb",
        },
    ],
    ar: [
        {
            id: "orders", icon: ShoppingBag, title: "طلبات المتجر", short: "اجمع كل طلب دفع عند الاستلام",
            description: "تصل الطلبات إلى قائمة واحدة مع العميل والمدينة المغربية والمنتجات والمبلغ والمصدر.",
            sources: [{ name: "Shopify", logo: integrationLogos.shopify }, { name: "YouCan", logo: integrationLogos.youcan }],
            outcomes: [{ title: "قائمة طلبات واحدة", detail: "بدون نسخ بين النوافذ" }, { title: "بيانات عميل واضحة", detail: "الهاتف والمدينة والمنتجات" }, { title: "مسؤولية واضحة", detail: "كل إجراء له مسؤول" }],
            event: "الطلب #MA-4092 جاهز للتأكيد", metric: "1,204", metricLabel: "طلبات موحدة هذا الشهر", accent: "#7c3aed",
        },
        {
            id: "ads", icon: Megaphone, title: "الإعلانات والربح", short: "اربط الإنفاق بالتوصيل",
            description: "يجتمع الإنفاق الإعلاني مع الطلبات المؤكدة والمشحونة والمسلمة لتحسين الربح الحقيقي.",
            sources: [{ name: "Meta", logo: integrationLogos.meta }, { name: "TikTok", logo: integrationLogos.tiktok }],
            outcomes: [{ title: "تكلفة كل توصيل", detail: "المقياس الذي يهم" }, { title: "هامش الحملة", detail: "الدخل ناقص التكاليف" }, { title: "قرارات أفضل", detail: "وسّع الإعلانات المربحة" }],
            event: "تحديث هامش حملة الصيف بعد 18 عملية توصيل", metric: "42.8 MAD", metricLabel: "تكلفة كل طلب موصل", accent: "#e23c73",
        },
        {
            id: "confirmation", icon: MessageCircleMore, title: "التأكيد", short: "أكد الطلب في الوقت المناسب",
            description: "يساعد مسار واتساب المنظم العميل على التأكيد أو التصحيح ثم يحدث الطلب فوراً.",
            sources: [{ name: "WhatsApp", logo: integrationLogos.whatsapp }],
            outcomes: [{ title: "طلب مؤكد", detail: "القرار محفوظ فوراً" }, { title: "تصحيح العنوان", detail: "مرتجعات أقل" }, { title: "رؤية مشتركة", detail: "نفس الحالة لكل الفريق" }],
            event: "أكد العميل الطلب #MA-4092 عبر واتساب", metric: "84%", metricLabel: "نسبة التأكيد اليوم", accent: "#10a978",
        },
        {
            id: "delivery", icon: Truck, title: "التوصيل المحلي", short: "تابع شركات الشحن",
            description: "أنشئ الشحنة لدى الناقل المختار وأعد أحداث التتبع إلى نفس خط الطلب.",
            sources: [{ name: "Ozon", logo: integrationLogos.ozon }, { name: "Ameex", logo: integrationLogos.ameex }, { name: "ForceLog", logo: integrationLogos.forcelog }, { name: "Coliaty", logo: integrationLogos.coliaty }, { name: "Sendit", logo: integrationLogos.sendit }],
            outcomes: [{ title: "إنشاء الشحنة", detail: "إدخالات مكررة أقل" }, { title: "تزامن التتبع", detail: "خط حالة واحد" }, { title: "مشاكل التوصيل", detail: "تدخل قبل الإرجاع" }],
            event: "نقل تحديث الناقل الطلب #MA-4092 إلى مرحلة الخروج للتوصيل", metric: "72%", metricLabel: "نسبة التوصيل هذا الأسبوع", accent: "#2563eb",
        },
    ],
};

export function OperatingSystemMap({ lang }: { lang: LandingLanguage }) {
    const [activeIndex, setActiveIndex] = useState(0);
    const [isPlaying, setIsPlaying] = useState(true);
    const prefersReducedMotion = useReducedMotion();
    const flows = flowsByLanguage[lang];
    const active = flows[activeIndex];
    const c = localizedCopy[lang];
    const isRtl = lang === "ar";
    const tourRunning = isPlaying && !prefersReducedMotion;
    const brandAccent = "#e73773";

    useEffect(() => {
        if (!tourRunning) return;
        const timer = window.setInterval(() => setActiveIndex((current) => (current + 1) % flows.length), 6000);
        return () => window.clearInterval(timer);
    }, [flows.length, tourRunning]);

    const chooseFlow = (index: number) => {
        setActiveIndex(index);
        setIsPlaying(false);
    };

    const move = (direction: -1 | 1) => {
        setActiveIndex((current) => (current + direction + flows.length) % flows.length);
        setIsPlaying(false);
    };

    return (
        <section className={`relative overflow-hidden bg-[linear-gradient(to_bottom,#ffffff_0%,#fff5f9_48%,#ffffff_100%)] py-24 sm:py-32 ${isRtl ? "rtl" : ""}`}>
            <div className="pointer-events-none absolute left-[-12%] top-[12%] h-[460px] w-[460px] rounded-full bg-[#f8bfd3]/35 blur-3xl" />
            <div className="pointer-events-none absolute right-[-10%] top-[35%] h-[420px] w-[420px] rounded-full bg-[#fbdce7]/55 blur-3xl" />

            <div className="relative mx-auto max-w-[1320px] px-4 sm:px-6 lg:px-8">
                <div className="grid items-end gap-8 lg:grid-cols-[1.05fr_.95fr]">
                    <div>
                        <div className="mb-5 inline-flex items-center gap-2 rounded-full border border-[#DB6A8F]/20 bg-white px-3.5 py-2 text-xs font-bold text-[#a82855] shadow-sm">
                            <PackageCheck className="h-4 w-4" /> {c.eyebrow}
                        </div>
                        <h2 className="max-w-4xl text-balance text-4xl font-bold leading-[0.96] tracking-[-0.055em] text-[#21161a] sm:text-6xl lg:text-[4.25rem]">{c.title}</h2>
                    </div>
                    <div className="lg:pb-1">
                        <p className="max-w-2xl text-[16px] leading-7 text-slate-600 sm:text-lg sm:leading-8">{c.subtitle}</p>
                        <div className="mt-5 flex flex-wrap gap-2.5">
                            <span className="inline-flex items-center gap-2 rounded-full border border-[#e73773]/15 bg-white px-3 py-2 text-xs font-bold text-[#7c2948] shadow-sm"><Sparkles className="h-3.5 w-3.5 text-[#e73773]" />{c.stageCount}</span>
                            <span className="inline-flex items-center gap-2 rounded-full border border-[#e73773]/20 bg-[#fff0f5] px-3 py-2 text-xs font-bold text-[#b52259]"><span className="relative flex h-2 w-2"><span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-[#e73773] opacity-40" /><span className="relative h-2 w-2 rounded-full bg-[#e73773]" /></span>{c.realTime}</span>
                        </div>
                    </div>
                </div>

                <div className="mt-12 overflow-x-auto pb-2 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
                    <div className="flex min-w-max gap-2 rounded-[26px] border border-slate-200/80 bg-white/80 p-2 shadow-[0_12px_40px_rgba(52,28,39,0.07)] backdrop-blur lg:min-w-0">
                        {flows.map((flow, index) => {
                            const Icon = flow.icon;
                            const selected = index === activeIndex;
                            return (
                                <button
                                    key={flow.id}
                                    type="button"
                                    aria-pressed={selected}
                                    onClick={() => chooseFlow(index)}
                                    className={`relative flex min-h-[92px] w-[230px] flex-1 items-center gap-3 overflow-hidden rounded-[19px] border px-4 text-start transition-all lg:w-auto ${selected ? "border-[#e73773] text-white shadow-[0_14px_32px_rgba(231,55,115,0.22)]" : "border-transparent text-[#321421] hover:border-[#e73773]/15 hover:bg-[#fff4f8]"}`}
                                >
                                    {selected && <motion.span layoutId="workflow-active-tab" className="absolute inset-0 bg-[linear-gradient(135deg,#f0447f,#d52a66)]" transition={{ type: "spring", bounce: 0.2, duration: 0.5 }} />}
                                    <span className={`relative z-10 flex h-11 w-11 shrink-0 items-center justify-center rounded-xl ${selected ? "bg-white/15 text-white" : "bg-[#fff0f5] text-[#d52a66]"}`}><Icon className="h-5 w-5" /></span>
                                    <span className="relative z-10 min-w-0"><span className={`mb-1 block text-[9px] font-black uppercase tracking-[0.18em] ${selected ? "text-white/45" : "text-slate-400"}`}>{c.stage} 0{index + 1}</span><span className="block text-sm font-black">{flow.title}</span><span className={`mt-0.5 block truncate text-[10px] ${selected ? "text-white/60" : "text-slate-500"}`}>{flow.short}</span></span>
                                    {selected && tourRunning && <motion.span key={`${active.id}-progress`} initial={{ width: "0%" }} animate={{ width: "100%" }} transition={{ duration: 6, ease: "linear" }} className="absolute inset-x-0 bottom-0 h-1 bg-white/80" />}
                                </button>
                            );
                        })}
                    </div>
                </div>

                <div className="mt-4 overflow-hidden rounded-[34px] border border-[#e73773]/20 bg-white shadow-[0_35px_100px_rgba(157,31,77,0.14)]">
                    <div className="flex items-center justify-between gap-3 border-b border-[#e73773]/15 bg-[linear-gradient(100deg,#f0447f,#d52a66)] px-4 py-3.5 sm:px-6">
                        <div className="flex min-w-0 items-center gap-3">
                            <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-white"><img src={ecomosLogo} alt="Ecom OS" className="w-7 object-contain" /></span>
                            <span className="min-w-0"><span className="block truncate text-xs font-black text-white sm:text-sm">{c.commandCenter}</span><span className="mt-0.5 hidden text-[10px] text-white/40 sm:block">{c.automatic}</span></span>
                        </div>
                        <div className="flex items-center gap-2">
                            <div className="hidden gap-1.5 sm:flex">{flows.map((flow, index) => <span key={flow.id} className={`h-1.5 rounded-full transition-all ${index === activeIndex ? "w-6 bg-white" : "w-1.5 bg-white/35"}`} />)}</div>
                            <div className="flex items-center gap-1 rounded-full border border-white/10 bg-white/[0.06] p-1">
                                <button type="button" aria-label={c.prev} onClick={() => move(-1)} className="flex h-8 w-8 items-center justify-center rounded-full text-white/60 transition hover:bg-white/10 hover:text-white"><ArrowLeft className={`h-3.5 w-3.5 ${isRtl ? "rotate-180" : ""}`} /></button>
                                <button type="button" aria-label={tourRunning ? c.pause : c.play} onClick={() => setIsPlaying((playing) => !playing)} className="flex h-8 w-8 items-center justify-center rounded-full bg-white text-[#21161a] transition hover:bg-[#FCE7EF]">
                                    {tourRunning ? <Pause className="h-3 w-3 fill-current" /> : <Play className="ms-0.5 h-3 w-3 fill-current" />}
                                </button>
                                <button type="button" aria-label={c.next} onClick={() => move(1)} className="flex h-8 w-8 items-center justify-center rounded-full text-white/60 transition hover:bg-white/10 hover:text-white"><ArrowRight className={`h-3.5 w-3.5 ${isRtl ? "rotate-180" : ""}`} /></button>
                            </div>
                        </div>
                    </div>

                    <div className="grid lg:grid-cols-[0.82fr_1.18fr]">
                        <AnimatePresence initial={false} mode="wait">
                            <motion.div
                                key={`${active.id}-summary`}
                                initial={prefersReducedMotion ? false : { opacity: 0, x: isRtl ? 18 : -18 }}
                                animate={{ opacity: 1, x: 0 }}
                                exit={prefersReducedMotion ? { opacity: 0 } : { opacity: 0, x: isRtl ? -12 : 12 }}
                                transition={{ duration: 0.35 }}
                                className="relative overflow-hidden border-b border-[#e73773]/15 bg-[radial-gradient(circle_at_15%_5%,rgba(231,55,115,0.15),transparent_42%),linear-gradient(145deg,#fff5f9,#ffffff)] p-6 sm:p-8 lg:border-b-0 lg:border-e lg:border-[#e73773]/15"
                            >
                                <div className="flex items-center justify-between gap-3">
                                    <span className="inline-flex items-center gap-2 rounded-full border border-[#e73773]/15 bg-white px-3 py-1.5 text-[10px] font-black uppercase tracking-[0.16em] text-[#b52259]"><span className="h-1.5 w-1.5 rounded-full bg-[#e73773]" />{c.stage} 0{activeIndex + 1}</span>
                                    <active.icon className="h-5 w-5 text-[#e73773]" />
                                </div>
                                <h3 className="mt-6 text-3xl font-black tracking-[-0.04em] text-[#321421] sm:text-4xl">{active.title}</h3>
                                <p className="mt-4 max-w-xl text-sm leading-7 text-[#7c5161] sm:text-[15px]">{active.description}</p>

                                <p className="mt-8 text-[10px] font-black uppercase tracking-[0.18em] text-[#b46b85]">{c.receives}</p>
                                <div className="mt-3 flex flex-wrap gap-2">
                                    {active.sources.map((source, index) => (
                                        <motion.div key={source.name} initial={prefersReducedMotion ? false : { opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: index * 0.06 }} className="flex items-center gap-2 rounded-xl border border-[#e73773]/15 bg-white p-2 pe-3 text-xs font-bold text-[#5b2c3e] shadow-sm">
                                            <span className="flex h-8 w-8 items-center justify-center overflow-hidden rounded-lg bg-[#fff5f9] p-1"><img src={source.logo} alt={`${source.name} logo`} className="h-full w-full object-contain" /></span>{source.name}
                                        </motion.div>
                                    ))}
                                </div>

                                <div className="mt-8 rounded-2xl border border-[#e73773]/15 bg-white p-4 shadow-[0_12px_30px_rgba(157,31,77,0.07)]">
                                    <p className="text-[9px] font-black uppercase tracking-[0.18em] text-[#b46b85]">{c.activity}</p>
                                    <div className="mt-2 flex items-start gap-3"><span className="mt-1 flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-[#fff0f5] text-[#e73773]"><Activity className="h-3 w-3" /></span><AnimatePresence initial={false} mode="wait"><motion.p key={active.event} initial={{ opacity: 0, y: 5 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -3 }} className="text-xs font-bold leading-5 text-[#5b2c3e]">{active.event}</motion.p></AnimatePresence></div>
                                </div>
                            </motion.div>
                        </AnimatePresence>

                        <div className="bg-white p-4 sm:p-6 lg:p-8">
                            <AnimatePresence initial={false} mode="wait">
                                <motion.div key={`${active.id}-panel`} initial={prefersReducedMotion ? false : { opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0 }} transition={{ duration: 0.35 }}>
                                    <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
                                        <div>
                                            <p className="text-[10px] font-black uppercase tracking-[0.16em] text-slate-400">{c.processing}</p>
                                            <div className="mt-1 flex items-center gap-2 text-xs font-bold text-[#b52259]"><CheckCircle2 className="h-4 w-4" />{c.healthy}</div>
                                        </div>
                                        <div className="rounded-2xl bg-[linear-gradient(135deg,#f0447f,#d52a66)] px-5 py-3 text-white shadow-lg shadow-[#e73773]/15">
                                            <span className="block text-2xl font-black tracking-[-0.04em] text-white">{active.metric}</span>
                                            <span className="mt-0.5 block text-[10px] text-white/70">{active.metricLabel}</span>
                                        </div>
                                    </div>

                                    <div className="my-7 grid grid-cols-[auto_1fr_auto_1fr_auto] items-center gap-2 rounded-2xl border border-slate-200 bg-white p-4 shadow-sm sm:gap-4 sm:p-5">
                                        <div className="flex -space-x-2 rtl:space-x-reverse">
                                            {active.sources.slice(0, 3).map((source) => <span key={source.name} className="flex h-9 w-9 items-center justify-center overflow-hidden rounded-xl border-2 border-white bg-white p-1 shadow-sm"><img src={source.logo} alt="" className="h-full w-full object-contain" /></span>)}
                                        </div>
                                        <div className="relative h-px overflow-hidden bg-[#f3cada]"><motion.span animate={{ left: isRtl ? ["100%", "0%"] : ["0%", "100%"] }} transition={{ duration: 1.7, ease: "easeInOut", repeat: Infinity }} className="absolute -top-[3px] h-[7px] w-[7px] -translate-x-1/2 rounded-full bg-[#e73773]" /></div>
                                        <div className="relative flex h-12 w-12 items-center justify-center rounded-2xl border border-[#DB6A8F]/25 bg-[#fff5f8] shadow-[0_8px_22px_rgba(177,43,89,0.12)] sm:h-16 sm:w-16"><motion.span animate={prefersReducedMotion ? undefined : { boxShadow: [`0 0 0 0 ${brandAccent}22`, `0 0 0 12px ${brandAccent}00`] }} transition={{ duration: 1.8, repeat: Infinity }} className="absolute inset-0 rounded-2xl" /><img src={ecomosLogo} alt="Ecom OS automation" className="relative w-9 sm:w-12" /></div>
                                        <div className="relative h-px overflow-hidden bg-[#f3cada]"><motion.span animate={{ left: isRtl ? ["100%", "0%"] : ["0%", "100%"] }} transition={{ duration: 1.7, delay: 0.25, ease: "easeInOut", repeat: Infinity }} className="absolute -top-[3px] h-[7px] w-[7px] -translate-x-1/2 rounded-full bg-[#e73773]" /></div>
                                        <span className="flex h-10 w-10 items-center justify-center rounded-full bg-[#e73773] text-white shadow-lg shadow-[#e73773]/20"><Check className="h-5 w-5 stroke-[3]" /></span>
                                    </div>

                                    <p className="mb-3 text-[10px] font-black uppercase tracking-[0.16em] text-slate-400">{c.returns}</p>
                                    <div className="grid gap-3 sm:grid-cols-3">
                                        {active.outcomes.map((outcome, index) => (
                                            <motion.div key={outcome.title} initial={prefersReducedMotion ? false : { opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: index * 0.07 }} className="rounded-2xl border border-slate-200 bg-white p-4 shadow-[0_8px_24px_rgba(35,25,30,0.05)]">
                                                <span className="flex h-8 w-8 items-center justify-center rounded-xl bg-[#fff0f5] text-[#e73773]"><Zap className="h-3.5 w-3.5" /></span>
                                                <h4 className="mt-4 text-xs font-black leading-5 text-slate-900">{outcome.title}</h4>
                                                <p className="mt-1 text-[10px] leading-4 text-slate-500">{outcome.detail}</p>
                                            </motion.div>
                                        ))}
                                    </div>

                                    <div className="mt-5 flex items-center justify-between gap-3 rounded-2xl border border-[#e73773]/20 bg-[#fff0f5] px-4 py-3">
                                        <span className="flex items-center gap-2 text-[10px] font-black uppercase tracking-[0.14em] text-[#b52259]"><span className="relative flex h-2 w-2"><span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-[#e73773] opacity-40" /><span className="relative h-2 w-2 rounded-full bg-[#e73773]" /></span>{c.live}</span>
                                        <BarChart3 className="h-4 w-4 text-[#e73773]" />
                                    </div>
                                </motion.div>
                            </AnimatePresence>
                        </div>
                    </div>

                    <div className="flex items-center justify-center gap-2 border-t border-[#e73773]/15 bg-[#fff5f9] px-4 py-3 text-center text-[10px] text-[#a86880]">
                        <BarChart3 className="h-3.5 w-3.5 shrink-0 text-[#e73773]" />{c.disclaimer}
                    </div>
                </div>
            </div>
        </section>
    );
}
