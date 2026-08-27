import { useEffect, useState } from "react";
import { AnimatePresence, motion } from "framer-motion";
import {
    ArrowLeft,
    ArrowRight,
    BarChart3,
    CheckCircle2,
    Megaphone,
    MessageCircleMore,
    PackageCheck,
    Pause,
    Play,
    ShoppingBag,
    Truck,
} from "lucide-react";
import { LandingLanguage } from "../../i18n";
import { integrationLogos } from "../../../../lib/integrationLogos";
import ecomosLogo from "../../../../assets/ecomos_logo_137x32.png";

type FlowId = "orders" | "ads" | "confirmation" | "delivery";

interface FlowItem {
    id: FlowId;
    icon: typeof ShoppingBag;
    title: string;
    short: string;
    description: string;
    sources: Array<{ name: string; logo: string }>;
    outcomes: Array<{ title: string; detail: string }>;
    event: string;
    accent: string;
}

const localizedCopy = {
    en: {
        eyebrow: "The control layer for Moroccan COD",
        title: "Every handoff, controlled from one place.",
        subtitle: "Follow one live workflow from store order to delivered cash. Choose a stage to see what Ecom OS receives, organizes, and returns to your team.",
        receives: "Ecom OS receives",
        returns: "Your team gets",
        live: "Live data route",
        pause: "Pause automatic tour",
        play: "Play automatic tour",
        prev: "Previous workflow",
        next: "Next workflow",
    },
    fr: {
        eyebrow: "La couche de contrôle du COD marocain",
        title: "Chaque passage, piloté depuis un seul endroit.",
        subtitle: "Suivez le flux, de la commande boutique jusqu'au paiement livré. Choisissez une étape pour voir ce qu'Ecom OS reçoit, organise et restitue à votre équipe.",
        receives: "Ecom OS reçoit",
        returns: "Votre équipe obtient",
        live: "Flux de données en direct",
        pause: "Mettre la visite en pause",
        play: "Lancer la visite automatique",
        prev: "Flux précédent",
        next: "Flux suivant",
    },
    ar: {
        eyebrow: "طبقة التحكم في الدفع عند الاستلام بالمغرب",
        title: "كل انتقال تحت التحكم من مكان واحد.",
        subtitle: "تابع مساراً حياً من طلب المتجر حتى التحصيل بعد التوصيل. اختر مرحلة لترى ما يستقبله Ecom OS وينظمه ويعيده لفريقك.",
        receives: "يستقبل Ecom OS",
        returns: "يحصل فريقك على",
        live: "مسار بيانات مباشر",
        pause: "إيقاف الجولة التلقائية",
        play: "تشغيل الجولة التلقائية",
        prev: "المسار السابق",
        next: "المسار التالي",
    },
};

const flowsByLanguage: Record<LandingLanguage, FlowItem[]> = {
    en: [
        {
            id: "orders", icon: ShoppingBag, title: "Store orders", short: "Capture every COD order",
            description: "Orders enter one clean queue with the customer, Moroccan city, products, amount and source already attached.",
            sources: [{ name: "Shopify", logo: integrationLogos.shopify }, { name: "YouCan", logo: integrationLogos.youcan }],
            outcomes: [{ title: "One order queue", detail: "No copying between tabs" }, { title: "Clean customer data", detail: "Phone, city and products together" }, { title: "Clear ownership", detail: "Every action is assigned" }],
            event: "New COD order → ready for confirmation", accent: "#7c3aed",
        },
        {
            id: "ads", icon: Megaphone, title: "Ads & profit", short: "Connect spend to delivery",
            description: "Campaign spend meets confirmed, shipped and delivered orders so the team can optimize for profit—not only cheap leads.",
            sources: [{ name: "Meta", logo: integrationLogos.meta }, { name: "TikTok", logo: integrationLogos.tiktok }],
            outcomes: [{ title: "Cost per delivered", detail: "See the metric that matters" }, { title: "Campaign margin", detail: "Revenue minus real costs" }, { title: "Better decisions", detail: "Scale profitable traffic" }],
            event: "Ad spend + delivery result → true margin", accent: "#e23c73",
        },
        {
            id: "confirmation", icon: MessageCircleMore, title: "Confirmation", short: "Confirm while the intent is hot",
            description: "A structured WhatsApp COD flow helps the customer confirm or correct the order, then updates the workspace immediately.",
            sources: [{ name: "WhatsApp", logo: integrationLogos.whatsapp }],
            outcomes: [{ title: "Confirmed order", detail: "Decision stored in real time" }, { title: "Address correction", detail: "Fewer avoidable returns" }, { title: "Team visibility", detail: "Everyone sees the same status" }],
            event: "Customer reply → order status updated", accent: "#10a978",
        },
        {
            id: "delivery", icon: Truck, title: "Local delivery", short: "Track Moroccan carrier handoffs",
            description: "Send prepared parcels to the chosen carrier and bring tracking events back into the same order timeline.",
            sources: [{ name: "Ozon", logo: integrationLogos.ozon }, { name: "Ameex", logo: integrationLogos.ameex }, { name: "ForceLog", logo: integrationLogos.forcelog }, { name: "Coliaty", logo: integrationLogos.coliaty }, { name: "Sendit", logo: integrationLogos.sendit }],
            outcomes: [{ title: "Shipment created", detail: "Fewer duplicate entries" }, { title: "Tracking synced", detail: "One status timeline" }, { title: "Delivery exceptions", detail: "Act before a return" }],
            event: "Carrier update → workspace and profit refreshed", accent: "#2563eb",
        },
    ],
    fr: [
        {
            id: "orders", icon: ShoppingBag, title: "Commandes boutique", short: "Capturez chaque commande COD",
            description: "Les commandes arrivent dans une file claire avec le client, la ville marocaine, les produits, le montant et la source.",
            sources: [{ name: "Shopify", logo: integrationLogos.shopify }, { name: "YouCan", logo: integrationLogos.youcan }],
            outcomes: [{ title: "Une seule file", detail: "Plus de copie entre onglets" }, { title: "Données client propres", detail: "Téléphone, ville et produits" }, { title: "Responsabilité claire", detail: "Chaque action est attribuée" }],
            event: "Nouvelle commande COD → prête à confirmer", accent: "#7c3aed",
        },
        {
            id: "ads", icon: Megaphone, title: "Publicité & marge", short: "Reliez les dépenses à la livraison",
            description: "Les dépenses publicitaires rejoignent les commandes confirmées et livrées pour optimiser le profit réel.",
            sources: [{ name: "Meta", logo: integrationLogos.meta }, { name: "TikTok", logo: integrationLogos.tiktok }],
            outcomes: [{ title: "Coût par livraison", detail: "La métrique utile" }, { title: "Marge campagne", detail: "Revenu moins coûts réels" }, { title: "Meilleures décisions", detail: "Scalez le trafic rentable" }],
            event: "Dépense + livraison → marge réelle", accent: "#e23c73",
        },
        {
            id: "confirmation", icon: MessageCircleMore, title: "Confirmation", short: "Confirmez pendant que l'intention est forte",
            description: "Un flux WhatsApp COD structuré aide le client à confirmer ou corriger sa commande puis synchronise le statut.",
            sources: [{ name: "WhatsApp", logo: integrationLogos.whatsapp }],
            outcomes: [{ title: "Commande confirmée", detail: "Décision enregistrée" }, { title: "Adresse corrigée", detail: "Moins de retours évitables" }, { title: "Équipe alignée", detail: "Un statut pour tous" }],
            event: "Réponse client → statut mis à jour", accent: "#10a978",
        },
        {
            id: "delivery", icon: Truck, title: "Livraison locale", short: "Suivez les transporteurs marocains",
            description: "Créez les colis chez le transporteur choisi et récupérez le suivi dans la même chronologie de commande.",
            sources: [{ name: "Ozon", logo: integrationLogos.ozon }, { name: "Ameex", logo: integrationLogos.ameex }, { name: "ForceLog", logo: integrationLogos.forcelog }, { name: "Coliaty", logo: integrationLogos.coliaty }, { name: "Sendit", logo: integrationLogos.sendit }],
            outcomes: [{ title: "Colis créé", detail: "Moins de doubles saisies" }, { title: "Suivi synchronisé", detail: "Une chronologie" }, { title: "Exceptions visibles", detail: "Agissez avant le retour" }],
            event: "Suivi transporteur → espace et marge actualisés", accent: "#2563eb",
        },
    ],
    ar: [
        {
            id: "orders", icon: ShoppingBag, title: "طلبات المتجر", short: "اجمع كل طلب دفع عند الاستلام",
            description: "تصل الطلبات إلى قائمة واحدة مع العميل والمدينة المغربية والمنتجات والمبلغ والمصدر.",
            sources: [{ name: "Shopify", logo: integrationLogos.shopify }, { name: "YouCan", logo: integrationLogos.youcan }],
            outcomes: [{ title: "قائمة طلبات واحدة", detail: "بدون نسخ بين النوافذ" }, { title: "بيانات عميل واضحة", detail: "الهاتف والمدينة والمنتجات" }, { title: "مسؤولية واضحة", detail: "كل إجراء له مسؤول" }],
            event: "طلب جديد → جاهز للتأكيد", accent: "#7c3aed",
        },
        {
            id: "ads", icon: Megaphone, title: "الإعلانات والربح", short: "اربط الإنفاق بالتوصيل",
            description: "يجتمع الإنفاق الإعلاني مع الطلبات المؤكدة والمشحونة والمسلمة لتحسين الربح الحقيقي.",
            sources: [{ name: "Meta", logo: integrationLogos.meta }, { name: "TikTok", logo: integrationLogos.tiktok }],
            outcomes: [{ title: "تكلفة كل توصيل", detail: "المقياس الذي يهم" }, { title: "هامش الحملة", detail: "الدخل ناقص التكاليف" }, { title: "قرارات أفضل", detail: "وسّع الإعلانات المربحة" }],
            event: "الإنفاق + نتيجة التوصيل → الهامش الحقيقي", accent: "#e23c73",
        },
        {
            id: "confirmation", icon: MessageCircleMore, title: "التأكيد", short: "أكد الطلب بينما نية الشراء قوية",
            description: "يساعد مسار واتساب المنظم العميل على التأكيد أو التصحيح ثم يحدث الطلب فوراً.",
            sources: [{ name: "WhatsApp", logo: integrationLogos.whatsapp }],
            outcomes: [{ title: "طلب مؤكد", detail: "القرار محفوظ فوراً" }, { title: "تصحيح العنوان", detail: "مرتجعات أقل" }, { title: "رؤية مشتركة", detail: "نفس الحالة لكل الفريق" }],
            event: "رد العميل → تحديث حالة الطلب", accent: "#10a978",
        },
        {
            id: "delivery", icon: Truck, title: "التوصيل المحلي", short: "تابع شركات الشحن المغربية",
            description: "أنشئ الشحنة لدى الناقل المختار وأعد أحداث التتبع إلى نفس خط الطلب.",
            sources: [{ name: "Ozon", logo: integrationLogos.ozon }, { name: "Ameex", logo: integrationLogos.ameex }, { name: "ForceLog", logo: integrationLogos.forcelog }, { name: "Coliaty", logo: integrationLogos.coliaty }, { name: "Sendit", logo: integrationLogos.sendit }],
            outcomes: [{ title: "إنشاء الشحنة", detail: "إدخالات مكررة أقل" }, { title: "تزامن التتبع", detail: "خط حالة واحد" }, { title: "مشاكل التوصيل", detail: "تدخل قبل الإرجاع" }],
            event: "تحديث الناقل → تحديث المساحة والربح", accent: "#2563eb",
        },
    ],
};

export function OperatingSystemMap({ lang }: { lang: LandingLanguage }) {
    const [activeIndex, setActiveIndex] = useState(0);
    const [isPlaying, setIsPlaying] = useState(true);
    const flows = flowsByLanguage[lang];
    const active = flows[activeIndex];
    const c = localizedCopy[lang];
    const isRtl = lang === "ar";

    useEffect(() => {
        if (!isPlaying) return;
        const timer = window.setInterval(() => setActiveIndex((current) => (current + 1) % flows.length), 5200);
        return () => window.clearInterval(timer);
    }, [flows.length, isPlaying]);

    const chooseFlow = (index: number) => {
        setActiveIndex(index);
        setIsPlaying(false);
    };

    const move = (direction: -1 | 1) => {
        setActiveIndex((current) => (current + direction + flows.length) % flows.length);
        setIsPlaying(false);
    };

    return (
        <section className={`relative overflow-hidden bg-white py-24 sm:py-32 ${isRtl ? "rtl" : ""}`}>
            <div className="pointer-events-none absolute inset-x-0 top-0 h-80 bg-[radial-gradient(circle_at_50%_0%,rgba(219,63,115,0.10),transparent_62%)]" />
            <div className="relative mx-auto max-w-[1360px] px-4 sm:px-6 lg:px-8">
                <div className="mx-auto mb-10 max-w-4xl text-center">
                    <div className="mb-4 inline-flex items-center gap-2 rounded-full bg-[#FCE7EF] px-3 py-1.5 text-xs font-bold text-[#a82855]">
                        <PackageCheck className="h-3.5 w-3.5" /> {c.eyebrow}
                    </div>
                    <h2 className="text-balance text-4xl font-bold tracking-[-0.045em] text-[#21161a] sm:text-6xl">{c.title}</h2>
                    <p className="mx-auto mt-5 max-w-3xl text-base leading-7 text-slate-600 sm:text-lg">{c.subtitle}</p>
                </div>

                <div className="mb-5 flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
                    <div className="grid flex-1 grid-cols-2 gap-2 lg:grid-cols-4">
                        {flows.map((flow, index) => {
                            const Icon = flow.icon;
                            const selected = index === activeIndex;
                            return (
                                <button
                                    key={flow.id}
                                    type="button"
                                    aria-pressed={selected}
                                    onClick={() => chooseFlow(index)}
                                    className={`group flex min-h-20 items-center gap-3 rounded-2xl border p-3 text-start transition-all ${selected ? "border-[#DB3F73]/50 bg-[#fff5f8] shadow-[0_10px_28px_rgba(168,40,85,0.10)]" : "border-slate-200 bg-white hover:border-slate-300 hover:bg-slate-50"}`}
                                >
                                    <span className={`flex h-10 w-10 shrink-0 items-center justify-center rounded-xl ${selected ? "bg-[#DB3F73] text-white" : "bg-slate-100 text-slate-500 group-hover:text-slate-800"}`}><Icon className="h-5 w-5" /></span>
                                    <span><span className="block text-sm font-bold text-slate-900">{flow.title}</span><span className="mt-0.5 block text-[11px] leading-4 text-slate-500">{flow.short}</span></span>
                                </button>
                            );
                        })}
                    </div>
                    <div className="flex items-center justify-center gap-1 rounded-full border border-slate-200 bg-white p-1 shadow-sm">
                        <button type="button" aria-label={c.prev} onClick={() => move(-1)} className="flex h-9 w-9 items-center justify-center rounded-full text-slate-500 hover:bg-slate-100 hover:text-slate-900"><ArrowLeft className={`h-4 w-4 ${isRtl ? "rotate-180" : ""}`} /></button>
                        <button type="button" aria-label={isPlaying ? c.pause : c.play} onClick={() => setIsPlaying((playing) => !playing)} className="flex h-9 w-9 items-center justify-center rounded-full bg-slate-950 text-white hover:bg-[#DB3F73]">
                            {isPlaying ? <Pause className="h-3.5 w-3.5 fill-current" /> : <Play className="ml-0.5 h-3.5 w-3.5 fill-current" />}
                        </button>
                        <button type="button" aria-label={c.next} onClick={() => move(1)} className="flex h-9 w-9 items-center justify-center rounded-full text-slate-500 hover:bg-slate-100 hover:text-slate-900"><ArrowRight className={`h-4 w-4 ${isRtl ? "rotate-180" : ""}`} /></button>
                    </div>
                </div>

                <div className="relative overflow-hidden rounded-[32px] border border-[#27131a]/10 bg-[#faf8ff] shadow-[0_24px_80px_rgba(56,30,43,0.08)]">
                    <div className="absolute inset-0 bg-[radial-gradient(circle_at_50%_50%,rgba(219,63,115,0.11),transparent_28%),linear-gradient(rgba(124,58,237,0.025)_1px,transparent_1px),linear-gradient(90deg,rgba(124,58,237,0.025)_1px,transparent_1px)] bg-[size:auto,28px_28px,28px_28px]" />

                    <div className="relative grid min-h-[540px] items-center gap-7 p-5 sm:p-8 lg:grid-cols-[1fr_250px_1fr] lg:p-12">
                        <AnimatePresence mode="wait">
                            <motion.div key={`${active.id}-sources`} initial={{ opacity: 0, x: isRtl ? 18 : -18 }} animate={{ opacity: 1, x: 0 }} exit={{ opacity: 0, x: isRtl ? -12 : 12 }} transition={{ duration: 0.32 }} className="z-10">
                                <p className="mb-3 text-[10px] font-black uppercase tracking-[0.18em] text-slate-400">{c.receives}</p>
                                <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-1">
                                    {active.sources.map((source, index) => (
                                        <motion.div key={source.name} initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: index * 0.07 }} className="flex items-center gap-3 rounded-2xl border border-white bg-white/90 p-3 shadow-[0_8px_24px_rgba(55,33,45,0.07)] backdrop-blur">
                                            <span className="flex h-11 w-11 shrink-0 items-center justify-center overflow-hidden rounded-xl border border-slate-100 bg-white p-1.5"><img src={source.logo} alt={`${source.name} logo`} className="h-full w-full object-contain" /></span>
                                            <span className="text-sm font-bold text-slate-900">{source.name}</span>
                                            <motion.span animate={{ x: isRtl ? [-2, 3, -2] : [2, -3, 2] }} transition={{ duration: 1.8, repeat: Infinity }} className="ms-auto text-xs font-bold" style={{ color: active.accent }}>•••</motion.span>
                                        </motion.div>
                                    ))}
                                </div>
                                <p className="mt-5 text-sm leading-6 text-slate-600">{active.description}</p>
                            </motion.div>
                        </AnimatePresence>

                        <div className="relative z-10 mx-auto flex h-[230px] w-[230px] items-center justify-center">
                            {[0, 1, 2].map((ring) => (
                                <motion.div key={ring} animate={{ rotate: ring % 2 ? -360 : 360 }} transition={{ duration: 28 + ring * 8, ease: "linear", repeat: Infinity }} className="absolute rounded-full border border-dashed" style={{ inset: 12 + ring * 24, borderColor: `${active.accent}${ring === 0 ? "35" : "25"}` }} />
                            ))}
                            <motion.div key={active.id} initial={{ scale: 0.92 }} animate={{ scale: 1 }} className="relative flex h-32 w-32 items-center justify-center rounded-[30px] border-4 border-white bg-white shadow-[0_20px_55px_rgba(128,40,76,0.22)]">
                                <motion.div animate={{ boxShadow: [`0 0 0 0 ${active.accent}30`, `0 0 0 22px ${active.accent}00`] }} transition={{ duration: 2, repeat: Infinity }} className="absolute inset-0 rounded-[26px]" />
                                <img src={ecomosLogo} alt="Ecom OS control hub" className="relative w-[105px]" />
                            </motion.div>
                            <motion.div animate={{ rotate: 360 }} transition={{ duration: 7, ease: "linear", repeat: Infinity }} className="absolute inset-4">
                                <span className="absolute left-1/2 top-0 h-3 w-3 -translate-x-1/2 rounded-full border-2 border-white shadow" style={{ backgroundColor: active.accent }} />
                            </motion.div>
                        </div>

                        <AnimatePresence mode="wait">
                            <motion.div key={`${active.id}-outcomes`} initial={{ opacity: 0, x: isRtl ? -18 : 18 }} animate={{ opacity: 1, x: 0 }} exit={{ opacity: 0, x: isRtl ? 12 : -12 }} transition={{ duration: 0.32 }} className="z-10">
                                <p className="mb-3 text-[10px] font-black uppercase tracking-[0.18em] text-slate-400">{c.returns}</p>
                                <div className="space-y-2">
                                    {active.outcomes.map((outcome, index) => (
                                        <motion.div key={outcome.title} initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: index * 0.07 }} className="flex items-center gap-3 rounded-2xl border border-white bg-white/90 p-3.5 shadow-[0_8px_24px_rgba(55,33,45,0.07)] backdrop-blur">
                                            <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl" style={{ backgroundColor: `${active.accent}12`, color: active.accent }}><CheckCircle2 className="h-4 w-4" /></span>
                                            <span><span className="block text-sm font-bold text-slate-900">{outcome.title}</span><span className="mt-0.5 block text-xs text-slate-500">{outcome.detail}</span></span>
                                        </motion.div>
                                    ))}
                                </div>
                            </motion.div>
                        </AnimatePresence>
                    </div>

                    <div className="relative flex flex-col items-center justify-between gap-3 border-t border-slate-200/70 bg-white/70 px-5 py-4 text-center backdrop-blur sm:flex-row sm:text-start">
                        <span className="flex items-center gap-2 text-xs font-bold uppercase tracking-[0.16em] text-slate-400"><span className="relative flex h-2 w-2"><span className="absolute inline-flex h-full w-full animate-ping rounded-full opacity-60" style={{ backgroundColor: active.accent }} /><span className="relative inline-flex h-2 w-2 rounded-full" style={{ backgroundColor: active.accent }} /></span>{c.live}</span>
                        <AnimatePresence mode="wait"><motion.span key={active.event} initial={{ opacity: 0, y: 5 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -5 }} className="text-sm font-bold text-slate-800">{active.event}</motion.span></AnimatePresence>
                        <div className="flex gap-1.5">{flows.map((flow, index) => <button key={flow.id} type="button" onClick={() => chooseFlow(index)} aria-label={flow.title} className={`h-1.5 rounded-full transition-all ${index === activeIndex ? "w-7" : "w-1.5 bg-slate-300"}`} style={index === activeIndex ? { backgroundColor: active.accent } : undefined} />)}</div>
                    </div>
                </div>

                <div className="mx-auto mt-6 flex max-w-3xl items-center justify-center gap-3 rounded-2xl border border-slate-200 bg-white px-4 py-3 text-center text-xs text-slate-500 shadow-sm">
                    <BarChart3 className="h-4 w-4 shrink-0 text-[#DB3F73]" />
                    {lang === "ar" ? "شعارات المزودين تشير إلى عمليات الربط المتاحة ولا تعني وجود شراكة رسمية." : lang === "fr" ? "Les logos identifient les connexions disponibles et n'impliquent aucun partenariat officiel." : "Provider logos identify available connections and do not imply an official partnership."}
                </div>
            </div>
        </section>
    );
}
