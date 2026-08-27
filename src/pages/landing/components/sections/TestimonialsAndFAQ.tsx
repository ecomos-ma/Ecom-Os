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
    en: { title: "What Moroccan COD teams say.", subtitle: "Two operators. Two clearer ways to run the day.", faqTitle: "Questions Moroccan operators ask", faqSubtitle: "Straight answers about scope, connections and the COD workflow." },
    fr: { title: "Ce que disent les équipes COD marocaines.", subtitle: "Deux opérateurs. Deux façons plus claires de piloter la journée.", faqTitle: "Les questions des opérateurs marocains", faqSubtitle: "Des réponses directes sur le périmètre, les connexions et le flux COD." },
    ar: { title: "ماذا تقول فرق الدفع عند الاستلام المغربية.", subtitle: "مسؤولان وطريقتان أوضح لإدارة اليوم.", faqTitle: "أسئلة يطرحها المشغلون المغاربة", faqSubtitle: "إجابات مباشرة عن النطاق والربط ومسار الدفع عند الاستلام." },
};

const reviews: Record<LandingLanguage, Review[]> = {
    en: [
        { name: "Mohammed Amine", role: "Founder · Casablanca", initials: "MA", quote: "Before Ecom OS, confirmation, spreadsheets and delivery tracking lived in different places. Now the team sees the same order status and knows the next action.", metricLabel: "One operational view", metricValue: "Orders → delivery" },
        { name: "Sanaa El Idrissi", role: "Operations Manager · Rabat", initials: "SI", quote: "Cost per delivered changed the conversation. We stopped judging campaigns only by order volume and started looking at what actually reaches the customer.", metricLabel: "Decision metric", metricValue: "Delivered profit" },
    ],
    fr: [
        { name: "Mohammed Amine", role: "Fondateur · Casablanca", initials: "MA", quote: "Avant Ecom OS, la confirmation, les feuilles de calcul et le suivi livraison étaient séparés. Maintenant l'équipe voit le même statut et connaît l'action suivante.", metricLabel: "Une vue opérationnelle", metricValue: "Commande → livré" },
        { name: "Sanaa El Idrissi", role: "Responsable opérations · Rabat", initials: "SI", quote: "Le coût par livraison a changé la discussion. Nous ne jugeons plus les campagnes seulement au volume, mais à ce qui arrive réellement chez le client.", metricLabel: "Métrique de décision", metricValue: "Profit livré" },
    ],
    ar: [
        { name: "محمد أمين", role: "مؤسس · الدار البيضاء", initials: "م أ", quote: "قبل Ecom OS كان التأكيد والجداول وتتبع التوصيل في أماكن مختلفة. الآن يرى الفريق نفس حالة الطلب ويعرف الإجراء التالي.", metricLabel: "رؤية تشغيلية واحدة", metricValue: "الطلب ← التوصيل" },
        { name: "سناء الإدريسي", role: "مديرة العمليات · الرباط", initials: "س إ", quote: "غيرت التكلفة لكل توصيل طريقة النقاش. لم نعد نحكم على الحملات بعدد الطلبات فقط، بل بما يصل فعلياً إلى العميل.", metricLabel: "مقياس القرار", metricValue: "الربح بعد التوصيل" },
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
            <AnimatePresence>{open && <motion.div initial={{ height: 0, opacity: 0 }} animate={{ height: "auto", opacity: 1 }} exit={{ height: 0, opacity: 0 }} className="overflow-hidden"><p className="pb-5 text-sm leading-7 text-slate-600 sm:text-base">{a}</p></motion.div>}</AnimatePresence>
        </div>
    );
}

export function TestimonialsAndFAQ({ lang }: { lang: LandingLanguage }) {
    const c = sectionCopy[lang];
    const isRtl = lang === "ar";
    return (
        <>
            <section className={`border-t border-slate-200 bg-white py-24 sm:py-28 ${isRtl ? "rtl" : ""}`}>
                <div className="mx-auto max-w-5xl px-4 sm:px-6">
                    <Reveal><div className="mb-12 text-center"><h2 className="text-balance text-4xl font-bold tracking-[-0.045em] text-[#21161a] sm:text-5xl">{c.title}</h2><p className="mt-4 text-base text-slate-500 sm:text-lg">{c.subtitle}</p></div></Reveal>
                    <div className="grid gap-5 md:grid-cols-2">
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
