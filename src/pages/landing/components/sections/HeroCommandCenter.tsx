import { useEffect, useState } from "react";
import { AnimatePresence, motion } from "framer-motion";
import { ArrowRight, Check, CircleAlert, DollarSign, Package, RefreshCw, Sparkles, Truck, User } from "lucide-react";
import { LandingLanguage } from "../../i18n";
import { integrationLogos } from "../../../../lib/integrationLogos";
import ecomosLogo from "../../../../assets/ecomos_logo_137x32.png";

const copy = {
    en: { messy: "Messy Google Sheet", rows: "Duplicate rows · mixed cities", importing: "Cleaning & matching", clean: "Clean Ecom OS workspace", normalized: "Rows normalized automatically", city: "Casablanca", order: "New order", confirmation: "Confirmation", confirmed: "Confirmed", shipping: "Shipping", delivered: "Delivered", profit: "Net profit" },
    fr: { messy: "Google Sheet désordonné", rows: "Doublons · villes incohérentes", importing: "Nettoyage et rapprochement", clean: "Espace Ecom OS propre", normalized: "Lignes normalisées automatiquement", city: "Casablanca", order: "Nouvelle commande", confirmation: "Confirmation", confirmed: "Confirmée", shipping: "Expédition", delivered: "Livrée", profit: "Profit net" },
    ar: { messy: "Google Sheet غير منظم", rows: "أسطر مكررة · مدن مختلفة", importing: "تنظيف ومطابقة البيانات", clean: "مساحة Ecom OS منظمة", normalized: "تم توحيد الأسطر تلقائياً", city: "الدار البيضاء", order: "طلب جديد", confirmation: "التأكيد", confirmed: "مؤكد", shipping: "الشحن", delivered: "تم التوصيل", profit: "الربح الصافي" },
};

export function HeroCommandCenter({ lang }: { lang: LandingLanguage }) {
    const [step, setStep] = useState(0);
    const c = copy[lang];
    const isRtl = lang === "ar";

    useEffect(() => {
        const interval = window.setInterval(() => setStep((current) => (current + 1) % 6), 2600);
        return () => window.clearInterval(interval);
    }, []);

    const steps = [
        { label: c.order, icon: Package },
        { label: c.confirmation, icon: User },
        { label: c.confirmed, icon: Check },
        { label: c.shipping, icon: Truck },
        { label: c.delivered, icon: Check },
        { label: c.profit, icon: DollarSign },
    ];
    const ActiveIcon = steps[step].icon;

    return (
        <div className="relative mx-auto w-full max-w-6xl perspective-1000">
            <motion.div initial={{ rotateX: 16, y: 35, opacity: 0 }} animate={{ rotateX: 0, y: 0, opacity: 1 }} transition={{ duration: 0.9, ease: [0.16, 1, 0.3, 1] }} className="flex h-[570px] w-full flex-col overflow-hidden rounded-[26px] border border-slate-200 bg-white shadow-[0_32px_90px_rgba(52,31,41,0.13)] sm:h-[530px]">
                <div className="flex h-12 shrink-0 items-center justify-between border-b border-slate-100 bg-slate-50/70 px-4">
                    <div className="flex gap-2"><span className="h-2.5 w-2.5 rounded-full bg-slate-300" /><span className="h-2.5 w-2.5 rounded-full bg-slate-300" /><span className="h-2.5 w-2.5 rounded-full bg-slate-300" /></div>
                    <div className="flex items-center gap-2 text-[10px] font-bold text-slate-400"><RefreshCw className="h-3 w-3 text-emerald-500" /> LIVE SYNC</div>
                    <img src={ecomosLogo} alt="Ecom OS" className="h-5 w-auto opacity-80" />
                </div>

                <div className="flex min-h-0 flex-1 bg-white">
                    <aside className="hidden w-[240px] shrink-0 flex-col border-r border-emerald-100 bg-[#f8fcfa] p-4 md:flex">
                        <div className="flex items-center gap-3 rounded-xl border border-emerald-100 bg-white p-3 shadow-sm">
                            <span className="flex h-10 w-10 items-center justify-center overflow-hidden rounded-lg border border-slate-100 bg-white p-1"><img src={integrationLogos.google_sheets} alt="Google Sheets logo" className="h-full w-full object-contain" /></span>
                            <span className="text-start"><span className="block text-xs font-black text-slate-900">{c.messy}</span><span className="mt-0.5 block text-[9px] text-slate-400">orders_august.xlsx</span></span>
                        </div>

                        <div className="mt-4 overflow-hidden rounded-xl border border-emerald-100 bg-white text-left font-mono text-[8px] shadow-sm" dir="ltr">
                            <div className="grid grid-cols-[24px_1fr_1fr] bg-[#eaf7ee] font-bold text-emerald-700"><span className="border-r p-2">#</span><span className="border-r p-2">customer</span><span className="p-2">city</span></div>
                            {[
                                ["247", "Youssef A.", "Casa blanca", false],
                                ["248", "Youssef A.", "CASA", true],
                                ["249", "Amine B.", "Casablanka", true],
                                ["250", "Sara M.", "Rabat", false],
                                ["251", "Youssef A.", "Casablanca", true],
                            ].map((row) => (
                                <motion.div key={String(row[0])} animate={row[3] ? { backgroundColor: ["#fff", "#fff1f2", "#fff"] } : {}} transition={{ duration: 2.4, repeat: Infinity }} className="grid grid-cols-[24px_1fr_1fr] border-t border-slate-100 text-slate-600">
                                    <span className="border-r p-2 text-slate-400">{row[0]}</span><span className="truncate border-r p-2">{row[1]}</span><span className={`truncate p-2 ${row[3] ? "text-rose-600" : ""}`}>{row[2]}</span>
                                </motion.div>
                            ))}
                        </div>
                        <div className="mt-3 flex items-center gap-2 rounded-xl bg-rose-50 p-2.5 text-start text-[9px] font-bold text-rose-700"><CircleAlert className="h-3.5 w-3.5 shrink-0" />{c.rows}</div>

                        <div className="mt-auto rounded-xl border border-emerald-100 bg-white p-3">
                            <div className="mb-2 flex justify-between text-[9px] font-bold text-slate-500"><span>{c.importing}</span><span>{Math.min(100, 25 + step * 15)}%</span></div>
                            <div className="h-1.5 overflow-hidden rounded-full bg-slate-100"><motion.div className="h-full rounded-full bg-emerald-500" animate={{ width: `${Math.min(100, 25 + step * 15)}%` }} /></div>
                        </div>
                    </aside>

                    <div className="relative hidden w-16 shrink-0 items-center justify-center border-r border-slate-100 bg-white md:flex">
                        <div className="absolute inset-y-0 left-1/2 w-px bg-gradient-to-b from-transparent via-emerald-200 to-transparent" />
                        <motion.span animate={{ y: [-130, 130], opacity: [0, 1, 1, 0] }} transition={{ duration: 3, repeat: Infinity, ease: "linear" }} className="absolute left-1/2 h-2.5 w-2.5 -translate-x-1/2 rounded-full bg-emerald-500 shadow-[0_0_0_5px_rgba(16,185,129,0.12)]" />
                        <span className="relative flex h-9 w-9 items-center justify-center rounded-full border border-emerald-200 bg-white text-emerald-600 shadow-sm"><ArrowRight className={`h-4 w-4 ${isRtl ? "rotate-180" : ""}`} /></span>
                    </div>

                    <main className="relative min-w-0 flex-1 bg-white p-3 sm:p-5">
                        <div className="mb-3 flex items-center gap-2 rounded-xl border border-emerald-100 bg-emerald-50/70 p-2.5 md:hidden">
                            <img src={integrationLogos.google_sheets} alt="Google Sheets" className="h-7 w-7 rounded-md object-contain" /><span className="text-[10px] font-black text-emerald-800">{c.messy}</span><ArrowRight className={`ms-auto h-4 w-4 text-emerald-500 ${isRtl ? "rotate-180" : ""}`} /><img src={ecomosLogo} alt="Ecom OS" className="h-4 w-auto" />
                        </div>

                        <div className="mb-4 flex items-center justify-between"><span className="text-start"><span className="block text-xs font-black text-slate-900">{c.clean}</span><span className="mt-0.5 block text-[9px] text-emerald-600">● {c.normalized}</span></span><span className="hidden rounded-full border border-slate-200 px-3 py-1 text-[9px] font-bold text-slate-500 sm:block">Morocco · MAD</span></div>

                        <div className="mb-4 grid grid-cols-2 gap-2 sm:grid-cols-4">
                            {[
                                { value: "1,204", label: "Orders" },
                                { value: "84%", label: "Confirmed" },
                                { value: "72%", label: "Delivered" },
                                { value: "18,450 DH", label: step === 5 ? c.profit : "Revenue", active: step === 5 },
                            ].map((stat) => (
                                <motion.div key={stat.label} animate={stat.active ? { scale: 1.025, borderColor: "#86efac", backgroundColor: "#f0fdf4" } : {}} className="rounded-xl border border-slate-200 bg-white p-2.5 text-start shadow-sm sm:p-3">
                                    <div className="text-[9px] font-semibold text-slate-400 sm:text-[10px]">{stat.label}</div><div className={`mt-1 text-sm font-black sm:text-lg ${stat.active ? "text-emerald-600" : "text-slate-900"}`}>{stat.value}</div>
                                </motion.div>
                            ))}
                        </div>

                        <div className="overflow-hidden rounded-xl border border-slate-200 bg-white shadow-sm">
                            <div className="grid h-9 grid-cols-[70px_1fr_110px_70px] items-center gap-2 border-b border-slate-100 bg-slate-50 px-3 text-[8px] font-black uppercase tracking-wider text-slate-400 sm:grid-cols-[80px_1fr_140px_90px]"><span>Order</span><span>Customer</span><span>Status</span><span className="text-right">Amount</span></div>
                            <AnimatePresence mode="wait">
                                <motion.div key={step} initial={{ opacity: 0.45, x: isRtl ? -8 : 8 }} animate={{ opacity: 1, x: 0 }} className="grid h-14 grid-cols-[70px_1fr_110px_70px] items-center gap-2 border-b border-slate-100 px-3 sm:grid-cols-[80px_1fr_140px_90px]">
                                    <span className="w-fit rounded-md bg-slate-950 px-2 py-1 font-mono text-[8px] font-bold text-white">#4092</span><span className="truncate text-start text-[10px] font-bold text-slate-700">Youssef A.</span>
                                    <span className={`flex w-fit items-center gap-1 rounded-full px-2 py-1 text-[8px] font-black ${step === 0 ? "bg-amber-100 text-amber-700" : step < 3 ? "bg-blue-100 text-blue-700" : step === 3 ? "bg-violet-100 text-violet-700" : "bg-emerald-100 text-emerald-700"}`}><ActiveIcon className="h-3 w-3" />{steps[step].label}</span>
                                    <span className="text-right text-[10px] font-black text-slate-900">450 DH</span>
                                </motion.div>
                            </AnimatePresence>
                            {["#4091", "#4090", "#4089"].map((order, index) => <div key={order} className="grid h-11 grid-cols-[70px_1fr_110px_70px] items-center gap-2 border-b border-slate-50 px-3 opacity-55 sm:grid-cols-[80px_1fr_140px_90px]"><span className="text-[9px] font-bold text-slate-400">{order}</span><span className="h-2 w-20 rounded bg-slate-100" /><span className="h-5 w-16 rounded-full bg-slate-100" /><span className="text-right text-[9px] text-slate-400">{300 + index * 50} DH</span></div>)}
                        </div>

                        <motion.div key={`clean-${step}`} initial={{ opacity: 0, y: 5 }} animate={{ opacity: 1, y: 0 }} className="absolute inset-x-3 bottom-3 mx-auto flex w-fit max-w-[calc(100%-24px)] items-center gap-2 overflow-hidden whitespace-nowrap rounded-full border border-emerald-200 bg-white px-3 py-2 text-[9px] font-black text-emerald-700 shadow-lg"><Sparkles className="h-3.5 w-3.5 shrink-0" /><span className="truncate">Row 248 cleaned · {c.city} matched</span></motion.div>
                    </main>
                </div>
            </motion.div>
        </div>
    );
}
