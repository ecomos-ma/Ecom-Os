import { useState } from "react";
import { AnimatePresence, motion } from "framer-motion";
import { ChevronDown, Star } from "lucide-react";
import { LandingLanguage } from "../../i18n";
import { Reveal } from "../motion/Reveal";

interface Review {
    name: string;
    role: string;
    initials: string;
    quote: string;
    metricLabel: string;
    metricValue: string;
}

const sectionCopy = {
    en: { eyebrow: "Operator stories", title: "Less saisie colis. More time for customers.", subtitle: "Three Moroccan COD operators. One recurring win: less repetitive work and a calmer day.", faqTitle: "Questions Moroccan operators ask", faqSubtitle: "Straight answers about scope, connections and the COD workflow." },
    fr: { eyebrow: "Témoignages d'opérateurs", title: "Moins de saisie colis. Plus de temps pour vos clients.", subtitle: "Trois opérateurs COD marocains. Un même résultat : moins de tâches répétitives et des journées plus sereines.", faqTitle: "Les questions des opérateurs marocains", faqSubtitle: "Des réponses directes sur le périmètre, les connexions et le flux COD." },
    ar: { eyebrow: "تجارب فرق التشغيل", title: "إدخال أقل للطرود. وقت أكثر لعملائك.", subtitle: "ثلاثة مشغلين مغاربة، ونتيجة واحدة: عمل متكرر أقل ويوم أكثر هدوءاً.", faqTitle: "أسئلة يطرحها المشغلون المغاربة", faqSubtitle: "إجابات مباشرة عن النطاق والربط ومسار الدفع عند الاستلام." },
};

const reviews: Record<LandingLanguage, Review[]> = {
    en: [
        { name: "Mohammed Amine", role: "Founder · Casablanca", initials: "MA", quote: "The end of every day disappeared into saisie colis—copying the same customer and order details between tools. Ecom OS keeps the workflow together, so my team moves faster and I have time to focus on customers again.", metricLabel: "Time reclaimed", metricValue: "Every workday" },
        { name: "Sanaa El Idrissi", role: "Operations Manager · Rabat", initials: "SI", quote: "When a customer called, we had to search WhatsApp, spreadsheets and the carrier portal for an answer. Now the order journey is clear in one place, so we respond confidently and customers feel looked after.", metricLabel: "Customer support", metricValue: "Clearer answers" },
        { name: "Youssef Benali", role: "E-commerce Operator · Marrakech", initials: "YB", quote: "Preparing parcels used to mean repeating the same work after confirmation. Now each order moves clearly from confirmation to delivery. There is less stress, fewer handoffs and more time to grow the business.", metricLabel: "Daily workflow", metricValue: "Confirm → ship → track" },
    ],
    fr: [
        { name: "Mohammed Amine", role: "Fondateur · Casablanca", initials: "MA", quote: "Chaque fin de journée passait dans la saisie colis, à recopier les mêmes informations entre plusieurs outils. Avec Ecom OS, le flux reste au même endroit : l'équipe avance plus vite et je peux enfin me concentrer sur les clients.", metricLabel: "Temps récupéré", metricValue: "Chaque journée" },
        { name: "Sanaa El Idrissi", role: "Responsable opérations · Rabat", initials: "SI", quote: "Quand un client appelait, il fallait chercher dans WhatsApp, les feuilles de calcul et le portail du transporteur. Maintenant, le parcours de la commande est clair au même endroit et nos réponses rassurent vraiment le client.", metricLabel: "Service client", metricValue: "Réponses plus claires" },
        { name: "Youssef Benali", role: "Opérateur e-commerce · Marrakech", initials: "YB", quote: "Préparer les colis voulait dire recommencer le travail après la confirmation. Aujourd'hui, chaque commande avance clairement jusqu'à la livraison : moins de stress, moins de passages manuels et plus de temps pour développer l'activité.", metricLabel: "Flux quotidien", metricValue: "Confirmer → expédier → suivre" },
    ],
    ar: [
        { name: "محمد أمين", role: "مؤسس · الدار البيضاء", initials: "م أ", quote: "كان آخر كل يوم يضيع في إدخال الطرود ونسخ نفس بيانات العميل والطلب بين أدوات مختلفة. مع Ecom OS أصبح مسار العمل في مكان واحد، فتحرك الفريق أسرع وعدت أركز على العملاء.", metricLabel: "وقت مسترجع", metricValue: "كل يوم عمل" },
        { name: "سناء الإدريسي", role: "مديرة العمليات · الرباط", initials: "س إ", quote: "عندما يتصل عميل، كنا نبحث في واتساب والجداول وبوابة شركة التوصيل. الآن رحلة الطلب واضحة في مكان واحد، فنجيب بثقة ويشعر العميل أننا نهتم به فعلاً.", metricLabel: "خدمة العملاء", metricValue: "إجابات أوضح" },
        { name: "يوسف بنعلي", role: "مسؤول تجارة إلكترونية · مراكش", initials: "ي ب", quote: "كان تجهيز الطرود يعني تكرار العمل نفسه بعد التأكيد. الآن ينتقل كل طلب بوضوح من التأكيد إلى التوصيل، مع ضغط أقل ووقت أكبر لتطوير المشروع.", metricLabel: "سير العمل اليومي", metricValue: "تأكيد ← شحن ← تتبع" },
    ],
};

const faqs: Record<LandingLanguage, Array<{ q: string; a: string }>> = {
    en: [
        { q: "Is Ecom OS focused on Morocco?", a: "Yes. The current product experience focuses on Moroccan COD operations: MAD amounts, +212 customer workflows, Moroccan cities, confirmation teams and the local delivery lifecycle." },
        { q: "Which tools can I connect?", a: "The product represents connections for Shopify, YouCan, Meta, TikTok, WhatsApp, Google Sheets and supported Moroccan carriers including Ozon Express, Ameex, ForceLog, Coliaty and Sendit. Availability depends on your provider account and API access." },
        { q: "Do provider logos mean an official partnership?", a: "No. A provider logo identifies a compatible or available connection only. It does not imply an endorsement or official partnership." },
        { q: "What happens after WhatsApp confirmation?", a: "The customer's decision is recorded against the COD order so the team can continue preparation and delivery. The exact flow depends on your configured WhatsApp provider and approved templates." },
    ],
    fr: [
        { q: "Ecom OS est-il centré sur le Maroc ?", a: "Oui. L'expérience actuelle se concentre sur les opérations COD marocaines : MAD, flux +212, villes marocaines, équipes de confirmation et cycle de livraison local." },
        { q: "Quels outils puis-je connecter ?", a: "Le produit représente des connexions pour Shopify, YouCan, Meta, TikTok, WhatsApp, Google Sheets et des transporteurs marocains pris en charge. La disponibilité dépend de votre compte fournisseur et de l'accès API." },
        { q: "Les logos signifient-ils un partenariat officiel ?", a: "Non. Un logo identifie uniquement une connexion compatible ou disponible. Il n'implique aucun soutien ni partenariat officiel." },
        { q: "Que se passe-t-il après la confirmation WhatsApp ?", a: "La décision du client est enregistrée sur la commande COD afin que l'équipe poursuive la préparation et la livraison." },
    ],
    ar: [
        { q: "هل يركز Ecom OS على المغرب؟", a: "نعم. تركز التجربة الحالية على عمليات الدفع عند الاستلام المغربية: الدرهم وأرقام +212 والمدن المغربية وفرق التأكيد ومسار التوصيل المحلي." },
        { q: "ما الأدوات التي يمكن ربطها؟", a: "يمثل المنتج عمليات ربط مع Shopify وYouCan وMeta وTikTok وWhatsApp وGoogle Sheets وشركات توصيل مغربية مدعومة. يعتمد التوفر على حساب المزود وصلاحية الواجهة البرمجية." },
        { q: "هل تعني الشعارات شراكة رسمية؟", a: "لا. يشير الشعار فقط إلى ربط متوافق أو متاح ولا يعني وجود تأييد أو شراكة رسمية." },
        { q: "ماذا يحدث بعد تأكيد واتساب؟", a: "يسجل قرار العميل على طلب الدفع عند الاستلام حتى يواصل الفريق التحضير والتوصيل." },
    ],
};

function FAQItem({ q, a }: { q: string; a: string }) {
    const [open, setOpen] = useState(false);
    return (
        <div className="border-b border-slate-200 last:border-0">
            <button type="button" aria-expanded={open} className="flex w-full items-start justify-between gap-4 py-5 text-start" onClick={() => setOpen((value) => !value)}>
                <span className="font-bold text-slate-900">{q}</span>
                <motion.span animate={{ rotate: open ? 180 : 0 }}><ChevronDown className="mt-0.5 h-5 w-5 text-slate-500" /></motion.span>
            </button>
            <AnimatePresence>{open && <motion.div initial={{ height: 0, opacity: 0 }} animate={{ height: "auto", opacity: 1 }} exit={{ height: 0, opacity: 0 }} className="overflow-hidden"><p className="pb-5 text-sm leading-7 text-slate-700 selection:bg-[#f4cedb] selection:text-slate-950 sm:text-[16px]">{a}</p></motion.div>}</AnimatePresence>
        </div>
    );
}

export function TestimonialsAndFAQ({ lang }: { lang: LandingLanguage }) {
    const c = sectionCopy[lang];
    const isRtl = lang === "ar";
    return (
        <>
            <section className={`border-t border-slate-200 bg-white py-24 sm:py-28 ${isRtl ? "rtl" : ""}`}>
                <div className="mx-auto max-w-7xl px-4 sm:px-6">
                    <Reveal><div className="mx-auto mb-12 max-w-4xl text-center"><div className="mb-4 inline-flex items-center gap-2 rounded-full border border-[#DB6A8F]/20 bg-[#fff6f9] px-3.5 py-2 text-xs font-bold text-[#a82855]"><span className="h-1.5 w-1.5 rounded-full bg-[#DB3F73]" />{c.eyebrow}</div><h2 className="text-balance text-4xl font-bold tracking-[-0.045em] text-[#21161a] sm:text-5xl">{c.title}</h2><p className="mx-auto mt-4 max-w-2xl text-base leading-7 text-slate-500 sm:text-lg">{c.subtitle}</p></div></Reveal>
                    <div className="grid gap-5 md:grid-cols-2 min-[900px]:grid-cols-3">
                        {reviews[lang].map((review, index) => (
                            <Reveal key={review.name} delay={index * 0.08}>
                                <article className="flex h-full flex-col rounded-[24px] border border-slate-200 bg-[#fcfafb] p-6 shadow-[0_10px_35px_rgba(40,24,32,0.05)] transition hover:-translate-y-1 hover:border-[#DB6A8F]/30 hover:shadow-[0_20px_50px_rgba(40,24,32,0.10)] sm:p-7">
                                    <div className="mb-5 flex gap-1">{Array.from({ length: 5 }).map((_, star) => <Star key={star} className="h-4 w-4 fill-amber-400 text-amber-400" />)}</div>
                                    <p className="flex-1 text-[15px] leading-7 text-slate-700">“{review.quote}”</p>
                                    <div className="my-5 flex items-center justify-between gap-4 rounded-2xl border border-slate-200 bg-white px-4 py-3"><span className="text-xs font-semibold text-slate-500">{review.metricLabel}</span><span className="text-sm font-black text-emerald-600">{review.metricValue}</span></div>
                                    <div className="flex items-center gap-3"><span className="flex h-11 w-11 items-center justify-center rounded-full bg-[#FCE7EF] text-xs font-black text-[#c93265]">{review.initials}</span><span><span className="block text-sm font-bold text-slate-900">{review.name}</span><span className="block text-xs text-slate-500">{review.role}</span></span></div>
                                </article>
                            </Reveal>
                        ))}
                    </div>
                </div>
            </section>

            <section className={`border-t border-slate-200 bg-slate-50 py-24 sm:py-28 ${isRtl ? "rtl" : ""}`}>
                <div className="mx-auto max-w-3xl px-4 sm:px-6">
                    <Reveal><div className="mb-12 text-center"><h2 className="text-balance text-4xl font-bold tracking-[-0.04em] text-slate-900 sm:text-5xl">{c.faqTitle}</h2><p className="mt-4 text-base text-slate-500">{c.faqSubtitle}</p></div></Reveal>
                    <div className="overflow-hidden rounded-[24px] border border-slate-200 bg-white px-5 shadow-[0_14px_45px_rgba(30,20,24,0.05)] sm:px-8">{faqs[lang].map((item) => <FAQItem key={item.q} q={item.q} a={item.a} />)}</div>
                </div>
            </section>
        </>
    );
}
