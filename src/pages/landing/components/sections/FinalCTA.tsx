import { Link } from "react-router-dom";
import { LandingLanguage, i18n } from "../../i18n";
import { ArrowRight } from "lucide-react";
import { motion } from "framer-motion";

export function FinalCTA({ lang }: { lang: LandingLanguage }) {
    const t = i18n[lang];
    const isRtl = lang === "ar";

    return (
        <section className={`py-40 bg-[#111827] relative overflow-hidden ${isRtl ? 'rtl' : ''}`}>
            {/* Gradient Glow */}
            <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-[600px] h-[400px] bg-[#DB6A8F]/20 rounded-full blur-3xl pointer-events-none" />

            <div className="mx-auto max-w-4xl px-6 relative z-10 text-center">
                <motion.div
                    initial={{ opacity: 0, y: 30 }}
                    whileInView={{ opacity: 1, y: 0 }}
                    viewport={{ once: true }}
                    transition={{ duration: 0.7, ease: [0.16, 1, 0.3, 1] }}
                >
                    <h2 className="text-5xl md:text-7xl font-black tracking-tighter text-white leading-[0.95] mb-6">
                        {isRtl
                            ? <>ابدأ <span className="text-[#DB6A8F]">Ecom OS</span> اليوم.</>
                            : <>Start <span className="text-[#DB6A8F]">Ecom OS</span> today.</>
                        }
                    </h2>
                    <p className="text-xl text-slate-400 max-w-2xl mx-auto mb-12 leading-relaxed">
                        {isRtl
                            ? "لا حاجة لعقود. لا حاجة لبطاقة ائتمان. مساحة عملك جاهزة في 5 دقائق."
                            : "No contracts. No credit card. Your workspace is ready in 5 minutes."}
                    </p>

                    <div className="flex flex-col sm:flex-row gap-4 justify-center items-center">
                        <Link
                            to="/login?mode=signup&plan=growth&billing=monthly"
                            className="h-14 px-10 inline-flex items-center gap-2.5 justify-center rounded-full bg-[#DB6A8F] text-white text-lg font-bold hover:bg-[#C55378] transition-all hover:scale-105 active:scale-95 shadow-2xl shadow-[#DB6A8F]/30"
                        >
                            {t.hero.primary}
                            <ArrowRight className="w-5 h-5" />
                        </Link>
                        <a
                            href="mailto:sales@ecomos.io"
                            className="h-14 px-10 inline-flex items-center justify-center rounded-full border border-slate-700 text-slate-300 font-semibold hover:border-slate-500 hover:text-white transition-colors"
                        >
                            {isRtl ? "تواصل مع المبيعات" : "Talk to Sales"}
                        </a>
                    </div>

                    <p className="mt-8 text-slate-600 text-sm">
                        {t.hero.trustText}
                    </p>
                </motion.div>
            </div>
        </section>
    );
}
