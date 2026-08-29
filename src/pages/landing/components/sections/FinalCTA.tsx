import { motion } from "framer-motion";
import { ArrowRight, Check, Headphones, PhoneCall, Sparkles } from "lucide-react";
import { Link } from "react-router-dom";
import { LandingLanguage, i18n } from "../../i18n";

const copy = {
    en: {
        eyebrow: "Ready to scale?",
        title: "Stop managing chaos. Start scaling.",
        subtitle: "Bring orders, confirmation, delivery, returns, team activity and delivered profit into one calm Moroccan COD workspace.",
        proof: ["No credit card", "Ready in minutes", "Cancel anytime"],
        customTitle: "Didn't find the right offer?",
        customText: "Tell us about your order volume, team and workflow. We'll help you shape the right Ecom OS setup.",
        talk: "Talk to sales",
        direct: "Direct sales line",
    },
    fr: {
        eyebrow: "Prêt à accélérer ?",
        title: "Arrêtez de gérer le chaos. Commencez à grandir.",
        subtitle: "Réunissez commandes, confirmation, livraison, retours, équipe et profit livré dans un espace COD marocain clair.",
        proof: ["Sans carte bancaire", "Prêt en quelques minutes", "Résiliable à tout moment"],
        customTitle: "Aucune offre ne correspond à vos besoins ?",
        customText: "Parlez-nous de votre volume de commandes, de votre équipe et de vos processus. Nous vous aiderons à construire la bonne configuration.",
        talk: "Parler aux ventes",
        direct: "Ligne commerciale directe",
    },
    ar: {
        eyebrow: "جاهز للتوسع؟",
        title: "توقف عن إدارة الفوضى. وابدأ في التوسع.",
        subtitle: "اجمع الطلبات والتأكيد والتوصيل والمرتجعات وعمل الفريق والربح بعد التوصيل في مساحة مغربية واحدة وواضحة.",
        proof: ["بدون بطاقة بنكية", "جاهز خلال دقائق", "إلغاء في أي وقت"],
        customTitle: "لم تجد العرض المناسب لعملياتك؟",
        customText: "أخبرنا بحجم طلباتك وفريقك وطريقة عملك، وسنساعدك على اختيار إعداد Ecom OS الأنسب.",
        talk: "تحدث مع المبيعات",
        direct: "الخط المباشر للمبيعات",
    },
} as const;

const salesPhoneDisplay = "07 70 87 78 21";
const salesPhoneHref = "tel:+212770877821";

export function FinalCTA({ lang }: { lang: LandingLanguage }) {
    const t = i18n[lang];
    const c = copy[lang];
    const isRtl = lang === "ar";

    return (
        <section className={`relative overflow-hidden bg-[#f7f9fc] px-4 py-24 sm:px-6 sm:py-32 lg:px-8 ${isRtl ? "rtl" : ""}`}>
            <div className="pointer-events-none absolute inset-x-0 top-0 h-80 bg-[radial-gradient(circle_at_50%_0%,rgba(219,63,115,0.12),transparent_65%)]" />

            <motion.div
                initial={{ opacity: 0, y: 28 }}
                whileInView={{ opacity: 1, y: 0 }}
                viewport={{ once: true, amount: 0.2 }}
                transition={{ duration: 0.7, ease: [0.16, 1, 0.3, 1] }}
                className="relative mx-auto max-w-[1280px] overflow-hidden rounded-[36px] border border-white/10 bg-[#15131b] shadow-[0_40px_120px_rgba(32,21,29,0.24)]"
            >
                <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(circle_at_15%_20%,rgba(219,63,115,0.45),transparent_34%),radial-gradient(circle_at_88%_8%,rgba(79,70,229,0.35),transparent_36%),linear-gradient(135deg,#18131a_0%,#1b1828_55%,#121827_100%)]" />
                <div className="pointer-events-none absolute -left-20 -top-20 h-72 w-72 rounded-full border border-white/10" />
                <div className="pointer-events-none absolute -right-16 bottom-6 h-52 w-52 rounded-full border border-white/10" />
                <div className="pointer-events-none absolute inset-x-[8%] top-0 h-px bg-gradient-to-r from-transparent via-white/35 to-transparent" />

                <div className="relative px-5 pb-6 pt-16 text-center sm:px-10 sm:pb-8 sm:pt-20 lg:px-16">
                    <div className="mx-auto inline-flex items-center gap-2 rounded-full border border-white/10 bg-white/[0.07] px-3.5 py-2 text-[10px] font-black uppercase tracking-[0.16em] text-white/70 backdrop-blur">
                        <Sparkles className="h-3.5 w-3.5 text-[#f188ac]" />{c.eyebrow}
                    </div>
                    <h2 className="mx-auto mt-6 max-w-5xl text-balance text-4xl font-black leading-[0.98] tracking-[-0.055em] text-white sm:text-6xl lg:text-7xl">
                        {c.title}
                    </h2>
                    <p className="mx-auto mt-6 max-w-3xl text-base leading-7 text-white/60 sm:text-lg sm:leading-8">{c.subtitle}</p>

                    <Link
                        to="/login?mode=signup&plan=growth&billing=monthly"
                        className="group mx-auto mt-9 inline-flex h-14 items-center justify-center gap-2.5 rounded-full bg-white px-8 text-[16px] font-black text-[#21161a] shadow-[0_18px_45px_rgba(0,0,0,0.22)] transition hover:-translate-y-1 hover:bg-[#fff2f6] sm:px-10"
                    >
                        {t.hero.primary}
                        <ArrowRight className={`h-4 w-4 transition-transform group-hover:translate-x-1 ${isRtl ? "rotate-180 group-hover:-translate-x-1" : ""}`} />
                    </Link>

                    <div className="mt-6 flex flex-wrap items-center justify-center gap-x-5 gap-y-2 text-[10px] font-bold text-white/45 sm:text-xs">
                        {c.proof.map((item) => (
                            <span key={item} className="flex items-center gap-1.5"><Check className="h-3.5 w-3.5 stroke-[3] text-emerald-400" />{item}</span>
                        ))}
                    </div>

                    <div className="relative mt-14 overflow-hidden rounded-[26px] border border-white/15 bg-white/[0.08] p-4 text-start backdrop-blur-xl sm:p-5">
                        <div className="pointer-events-none absolute inset-0 bg-gradient-to-r from-white/[0.06] to-transparent" />
                        <div className="relative flex flex-col gap-5 md:flex-row md:items-center md:justify-between">
                            <div className="flex min-w-0 items-start gap-4">
                                <span className="flex h-12 w-12 shrink-0 items-center justify-center rounded-2xl bg-[#DB3F73] text-white shadow-[0_12px_30px_rgba(219,63,115,0.3)]"><Headphones className="h-5 w-5" /></span>
                                <span>
                                    <span className="block text-base font-black text-white sm:text-lg">{c.customTitle}</span>
                                    <span className="mt-1.5 block max-w-2xl text-xs leading-5 text-white/55 sm:text-sm sm:leading-6">{c.customText}</span>
                                </span>
                            </div>

                            <a href={salesPhoneHref} className="group flex shrink-0 items-center justify-between gap-2.5 rounded-2xl border border-white/15 bg-white px-3 py-3.5 text-[#21161a] shadow-xl transition hover:-translate-y-0.5 hover:bg-[#fff2f6] sm:gap-5 sm:px-5 md:min-w-[285px]">
                                <span className="flex min-w-0 items-center gap-2 sm:gap-3">
                                    <span className="flex h-10 w-10 items-center justify-center rounded-xl bg-[#FCE7EF] text-[#c93265]"><PhoneCall className="h-4 w-4" /></span>
                                    <span><span className="block text-[8px] font-black uppercase tracking-[0.1em] text-slate-400 sm:text-[9px] sm:tracking-[0.14em]">{c.direct}</span><span dir="ltr" className="mt-1 block whitespace-nowrap text-[13px] font-black tracking-[0.01em] text-slate-950 sm:text-base sm:tracking-[0.02em]">{salesPhoneDisplay}</span></span>
                                </span>
                                <span className="rounded-full bg-slate-950 px-2.5 py-2 text-center text-[9px] font-black leading-3 text-white transition group-hover:bg-[#DB3F73] sm:px-3 sm:text-[10px]">{c.talk}</span>
                            </a>
                        </div>
                    </div>
                </div>
            </motion.div>
        </section>
    );
}
