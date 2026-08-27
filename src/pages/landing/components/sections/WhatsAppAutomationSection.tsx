import { useEffect, useState } from "react";
import { AnimatePresence, motion } from "framer-motion";
import { Check, CheckCircle2, Clock3, MapPin, Mic, Package, Plus, RotateCcw, ShoppingBag, Smile, Smartphone, Zap } from "lucide-react";
import { LandingLanguage } from "../../i18n";
import { integrationLogos } from "../../../../lib/integrationLogos";
import ecomosLogo from "../../../../assets/ecomos_logo_137x32.png";

const copy = {
    en: {
        eyebrow: "WhatsApp API · COD confirmation",
        title: "Turn a new order into a confirmed delivery decision.",
        subtitle: "Show the customer the exact Moroccan COD order, let them confirm or request a correction, and keep the Ecom OS record synchronized for the whole team.",
        steps: [
            { title: "Order arrives", text: "Store details enter Ecom OS instantly." },
            { title: "Customer confirms", text: "A clear WhatsApp flow captures the decision." },
            { title: "Workspace updates", text: "The order becomes ready for fulfillment." },
        ],
        order: "New COD order",
        customer: "Amine B.",
        city: "Casablanca · Maarif",
        product: "Classic sneakers · Size 42",
        amount: "349 MAD · Cash on delivery",
        message: "Salam Amine 👋 We received your COD order #MA-4092. Please check the details below and confirm your delivery.",
        confirm: "Yes, confirm my order",
        edit: "Correct delivery details",
        confirmed: "Order confirmed",
        confirmedText: "Thank you. Your order is now being prepared for delivery in Casablanca.",
        synced: "Ecom OS status updated → Confirmed",
        replay: "Replay confirmation",
        today: "Today",
        online: "WhatsApp API flow",
        demo: "Interactive demo · choose a step or confirm the order",
    },
    fr: {
        eyebrow: "API WhatsApp · confirmation COD",
        title: "Transformez une nouvelle commande en décision de livraison confirmée.",
        subtitle: "Présentez la commande COD marocaine exacte, laissez le client confirmer ou corriger puis synchronisez Ecom OS pour toute l'équipe.",
        steps: [
            { title: "Commande reçue", text: "Les détails arrivent immédiatement dans Ecom OS." },
            { title: "Client confirmé", text: "Un flux WhatsApp clair capture la décision." },
            { title: "Espace actualisé", text: "La commande est prête à préparer." },
        ],
        order: "Nouvelle commande COD",
        customer: "Amine B.", city: "Casablanca · Maarif", product: "Baskets classiques · Taille 42", amount: "349 MAD · Paiement à la livraison",
        message: "Salam Amine 👋 Nous avons reçu votre commande COD #MA-4092. Vérifiez les détails puis confirmez votre livraison.",
        confirm: "Oui, confirmer ma commande", edit: "Corriger les détails", confirmed: "Commande confirmée",
        confirmedText: "Merci. Votre commande est maintenant en préparation pour Casablanca.", synced: "Statut Ecom OS actualisé → Confirmée", replay: "Rejouer la confirmation", today: "Aujourd'hui", online: "Flux API WhatsApp", demo: "Démo interactive · choisissez une étape ou confirmez",
    },
    ar: {
        eyebrow: "واجهة واتساب · تأكيد الدفع عند الاستلام",
        title: "حوّل الطلب الجديد إلى قرار توصيل مؤكد.",
        subtitle: "اعرض للعميل تفاصيل طلبه المغربي، واتركه يؤكد أو يصحح، ثم حدّث سجل Ecom OS لكل الفريق.",
        steps: [
            { title: "وصول الطلب", text: "تدخل التفاصيل إلى Ecom OS فوراً." },
            { title: "تأكيد العميل", text: "يسجل مسار واتساب الواضح القرار." },
            { title: "تحديث المساحة", text: "يصبح الطلب جاهزاً للتحضير." },
        ],
        order: "طلب دفع عند الاستلام جديد",
        customer: "أمين ب.", city: "الدار البيضاء · المعاريف", product: "حذاء كلاسيكي · المقاس 42", amount: "349 درهم · الدفع عند الاستلام",
        message: "سلام أمين 👋 توصلنا بطلبك #MA-4092. راجع التفاصيل وأكد التوصيل من فضلك.",
        confirm: "نعم، أؤكد طلبي", edit: "تصحيح معلومات التوصيل", confirmed: "تم تأكيد الطلب",
        confirmedText: "شكراً. طلبك الآن قيد التحضير للتوصيل في الدار البيضاء.", synced: "تم تحديث حالة Ecom OS ← مؤكد", replay: "إعادة تجربة التأكيد", today: "اليوم", online: "مسار واجهة واتساب", demo: "تجربة تفاعلية · اختر مرحلة أو أكد الطلب",
    },
};

export function WhatsAppAutomationSection({ lang }: { lang: LandingLanguage }) {
    const [phase, setPhase] = useState(0);
    const [autoPlay, setAutoPlay] = useState(true);
    const c = copy[lang];
    const isRtl = lang === "ar";

    useEffect(() => {
        if (!autoPlay) return;
        const timer = window.setInterval(() => setPhase((current) => (current + 1) % 3), 4300);
        return () => window.clearInterval(timer);
    }, [autoPlay]);

    const selectPhase = (index: number) => {
        setPhase(index);
        setAutoPlay(false);
    };

    const confirmOrder = () => {
        setPhase(2);
        setAutoPlay(false);
    };

    return (
        <section className={`relative overflow-hidden border-t border-slate-200 bg-[#f7faf9] py-24 sm:py-32 ${isRtl ? "rtl" : ""}`}>
            <div className="pointer-events-none absolute right-[-10%] top-[15%] h-[540px] w-[540px] rounded-full bg-emerald-200/25 blur-3xl" />
            <div className="relative mx-auto grid max-w-[1280px] items-center gap-14 px-4 sm:px-6 lg:grid-cols-[1.05fr_.95fr] lg:px-8">
                <div>
                    <div className="mb-5 inline-flex items-center gap-2 rounded-full border border-emerald-200 bg-emerald-50 px-3 py-1.5 text-xs font-bold text-emerald-800">
                        <img src={integrationLogos.whatsapp} alt="WhatsApp logo" className="h-5 w-5 rounded-md object-contain" /> {c.eyebrow}
                    </div>
                    <h2 className="max-w-3xl text-balance text-4xl font-bold tracking-[-0.045em] text-[#15211d] sm:text-6xl">{c.title}</h2>
                    <p className="mt-6 max-w-2xl text-base leading-7 text-slate-600 sm:text-lg sm:leading-8">{c.subtitle}</p>

                    <div className="mt-9 space-y-3">
                        {c.steps.map((step, index) => (
                            <button
                                key={step.title}
                                type="button"
                                aria-pressed={phase === index}
                                onClick={() => selectPhase(index)}
                                className={`group flex w-full items-center gap-4 rounded-2xl border p-4 text-start transition-all ${phase === index ? "border-emerald-300 bg-white shadow-[0_12px_35px_rgba(16,169,120,0.12)]" : "border-transparent bg-transparent hover:border-slate-200 hover:bg-white/70"}`}
                            >
                                <span className={`flex h-10 w-10 shrink-0 items-center justify-center rounded-full text-sm font-black transition ${phase === index ? "bg-emerald-500 text-white" : "border border-slate-200 bg-white text-slate-400"}`}>
                                    {phase > index ? <Check className="h-4 w-4" /> : index + 1}
                                </span>
                                <span className="flex-1"><span className="block text-sm font-bold text-slate-900">{step.title}</span><span className="mt-1 block text-xs leading-5 text-slate-500">{step.text}</span></span>
                                {phase === index && <motion.span layoutId="wa-active" className="h-2.5 w-2.5 rounded-full bg-emerald-500" />}
                            </button>
                        ))}
                    </div>

                    <div className="mt-7 flex flex-wrap gap-x-5 gap-y-2 text-xs font-semibold text-slate-500">
                        <span className="flex items-center gap-1.5"><Smartphone className="h-4 w-4 text-emerald-600" /> +212-ready workflow</span>
                        <span className="flex items-center gap-1.5"><Clock3 className="h-4 w-4 text-emerald-600" /> Real-time status sync</span>
                        <span className="flex items-center gap-1.5"><ShoppingBag className="h-4 w-4 text-emerald-600" /> Built for Moroccan COD</span>
                    </div>
                </div>

                <div className="relative mx-auto w-full max-w-[400px]" dir="ltr">
                    <div className="absolute -inset-10 rounded-full bg-emerald-300/20 blur-3xl" />
                    <div className="relative overflow-hidden rounded-[46px] border-[9px] border-[#101827] bg-[#efeae2] shadow-[0_35px_90px_rgba(20,38,32,0.28)]">
                        <div className="absolute left-1/2 top-0 z-30 h-6 w-36 -translate-x-1/2 rounded-b-3xl bg-[#101827]" />
                        <div className="flex h-[76px] items-end gap-3 bg-[#075e54] px-5 pb-3 text-white">
                            <span className="flex h-10 w-10 items-center justify-center overflow-hidden rounded-full border border-white/20 bg-white p-1"><img src={integrationLogos.whatsapp} alt="WhatsApp" className="h-full w-full object-contain" /></span>
                            <span><span className="block text-sm font-bold">Ecom OS Store</span><span className="block text-[10px] text-white/70">{c.online}</span></span>
                            <span className="ms-auto mb-1 h-2 w-2 rounded-full bg-emerald-300" />
                        </div>

                        <div className="relative h-[590px] overflow-hidden bg-[radial-gradient(circle_at_25%_15%,rgba(255,255,255,0.55)_0_1px,transparent_1.5px)] bg-[size:18px_18px] p-3.5">
                            <div className="mx-auto mb-3 w-fit rounded-lg bg-white/75 px-3 py-1 text-[10px] font-semibold text-slate-500 shadow-sm">{c.today}</div>
                            <AnimatePresence mode="wait">
                                {phase === 0 && (
                                    <motion.div key="order" initial={{ opacity: 0.5, y: 8 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -8 }} className="rounded-2xl bg-white p-4 shadow-sm ring-1 ring-slate-200/60">
                                        <div className="mb-4 flex items-center gap-3 border-b border-slate-100 pb-3">
                                            <span className="flex h-10 w-10 items-center justify-center rounded-xl bg-[#FCE7EF] text-[#c93265]"><Package className="h-5 w-5" /></span>
                                            <span><span className="block text-[10px] font-black uppercase tracking-[0.14em] text-[#c93265]">{c.order}</span><span className="mt-0.5 block text-base font-black text-slate-900">#MA-4092</span></span>
                                            <span className="ms-auto rounded-full bg-amber-100 px-2 py-1 text-[9px] font-black text-amber-700">COD</span>
                                        </div>
                                        <div className="space-y-3 text-xs text-slate-700">
                                            <div className="flex items-center gap-2"><span className="flex h-7 w-7 items-center justify-center rounded-lg bg-slate-100"><Smartphone className="h-3.5 w-3.5" /></span><span><b>{c.customer}</b><br /><span className="text-slate-400">+212 6 12 34 56 78</span></span></div>
                                            <div className="flex items-center gap-2"><span className="flex h-7 w-7 items-center justify-center rounded-lg bg-slate-100"><MapPin className="h-3.5 w-3.5" /></span><span>{c.city}</span></div>
                                            <div className="flex items-center gap-2"><span className="flex h-7 w-7 items-center justify-center rounded-lg bg-slate-100"><ShoppingBag className="h-3.5 w-3.5" /></span><span>{c.product}</span></div>
                                        </div>
                                        <div className="mt-4 rounded-xl bg-slate-950 px-3 py-3 text-center text-sm font-black text-white">{c.amount}</div>
                                        <button type="button" onClick={() => selectPhase(1)} className="mt-3 flex h-11 w-full items-center justify-center gap-2 rounded-xl bg-[#25D366] text-xs font-black text-white shadow-lg shadow-emerald-500/15"><img src={integrationLogos.whatsapp} alt="" className="h-5 w-5 rounded-md" /> Send confirmation</button>
                                    </motion.div>
                                )}

                                {phase === 1 && (
                                    <motion.div key="chat" initial={{ opacity: 0.5, y: 8 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -8 }}>
                                        <div className="max-w-[92%] rounded-2xl rounded-tl-sm bg-white p-3.5 text-[12px] leading-[1.55] text-slate-800 shadow-sm ring-1 ring-slate-200/50">
                                            <p>{c.message}</p>
                                            <div className="mt-3 rounded-xl border border-slate-200 bg-slate-50 p-3">
                                                <div className="flex items-center justify-between"><span className="font-black text-slate-900">#MA-4092</span><span className="rounded-full bg-amber-100 px-2 py-0.5 text-[9px] font-black text-amber-700">COD</span></div>
                                                <p className="mt-2 text-[11px] text-slate-600">{c.product}</p><p className="mt-1 text-[11px] text-slate-500">{c.city}</p>
                                                <p className="mt-2 border-t border-slate-200 pt-2 font-black text-slate-900">{c.amount}</p>
                                            </div>
                                            <div className="mt-1 text-right text-[9px] text-slate-400">10:42 <span className="text-sky-500">✓✓</span></div>
                                        </div>
                                        <div className="mt-2 max-w-[92%] space-y-1.5">
                                            <button type="button" onClick={confirmOrder} className="flex h-11 w-full items-center justify-center gap-2 rounded-xl border border-slate-200 bg-white text-xs font-black text-[#008b69] shadow-sm transition hover:bg-emerald-50"><CheckCircle2 className="h-4 w-4" />{c.confirm}</button>
                                            <button type="button" className="h-10 w-full rounded-xl border border-slate-200 bg-white text-xs font-bold text-[#008b69] shadow-sm transition hover:bg-slate-50">{c.edit}</button>
                                        </div>
                                    </motion.div>
                                )}

                                {phase === 2 && (
                                    <motion.div key="confirmed" initial={{ opacity: 0.5, y: 8 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -8 }} className="space-y-2.5">
                                        <div className="max-w-[92%] rounded-2xl rounded-tl-sm bg-white p-3 text-[11px] leading-[1.5] text-slate-700 shadow-sm ring-1 ring-slate-200/50">
                                            <p>{c.message}</p>
                                            <div className="mt-2.5 rounded-xl border border-slate-200 bg-slate-50 p-2.5">
                                                <div className="flex items-center justify-between"><span className="font-black text-slate-900">#MA-4092</span><span className="rounded-full bg-amber-100 px-2 py-0.5 text-[8px] font-black text-amber-700">COD</span></div>
                                                <p className="mt-1.5 text-[10px] text-slate-600">{c.product}</p><p className="mt-1 font-black text-slate-900">{c.amount}</p>
                                            </div>
                                            <div className="mt-1 text-right text-[8px] text-slate-400">10:42 <span className="text-sky-500">✓✓</span></div>
                                        </div>

                                        <motion.div initial={{ opacity: 0, x: 12 }} animate={{ opacity: 1, x: 0 }} className="ms-auto max-w-[78%] rounded-2xl rounded-tr-sm bg-[#d9fdd3] p-3 text-[11px] font-semibold text-slate-800 shadow-sm">
                                            {c.confirm}<div className="mt-1 text-right text-[8px] font-normal text-slate-400">10:43 <span className="text-sky-500">✓✓</span></div>
                                        </motion.div>

                                        <motion.div initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.16 }} className="max-w-[92%] rounded-2xl rounded-tl-sm bg-white p-3.5 shadow-sm ring-1 ring-slate-200/50">
                                            <div className="flex items-center gap-3"><motion.span initial={{ scale: 0.7 }} animate={{ scale: 1 }} transition={{ type: "spring", bounce: 0.45 }} className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-[#25D366] text-white"><Check className="h-5 w-5 stroke-[3]" /></motion.span><span><span className="block text-sm font-black text-slate-900">{c.confirmed}</span><span className="mt-0.5 block text-[9px] text-slate-500">#MA-4092 · Casablanca</span></span></div>
                                            <p className="mt-3 text-[11px] leading-5 text-slate-600">{c.confirmedText}</p>
                                        </motion.div>

                                        <motion.div initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.28 }} className="flex items-center gap-2 rounded-2xl border border-emerald-200 bg-white p-3 text-left shadow-lg shadow-emerald-900/5">
                                            <img src={ecomosLogo} alt="Ecom OS" className="h-5 w-auto" />
                                            <span className="ms-auto flex items-center gap-1 text-[8px] font-black text-emerald-700"><Zap className="h-3 w-3" />{c.synced}</span>
                                        </motion.div>
                                        <button type="button" onClick={() => { setPhase(0); setAutoPlay(false); }} className="mx-auto flex items-center gap-2 pt-1 text-[10px] font-bold text-slate-500 hover:text-slate-900"><RotateCcw className="h-3.5 w-3.5" />{c.replay}</button>
                                    </motion.div>
                                )}
                            </AnimatePresence>
                            <div className="absolute inset-x-3 bottom-3 flex items-center gap-2">
                                <div className="flex h-11 flex-1 items-center gap-2 rounded-full bg-white px-3 text-slate-400 shadow-sm ring-1 ring-slate-200/50"><Smile className="h-4 w-4" /><span className="text-[10px]">Message</span><Plus className="ms-auto h-4 w-4" /></div>
                                <span className="flex h-11 w-11 items-center justify-center rounded-full bg-[#008b69] text-white shadow-sm"><Mic className="h-4 w-4" /></span>
                            </div>
                        </div>
                    </div>

                    <div className="mx-auto mt-5 flex w-fit items-center gap-2 rounded-full border border-slate-200 bg-white px-3 py-2 text-[10px] font-bold text-slate-500 shadow-sm">
                        <span className="h-2 w-2 animate-pulse rounded-full bg-[#25D366]" /> {c.demo}
                    </div>
                </div>
            </div>
        </section>
    );
}
