import { useState } from "react";
import { motion } from "framer-motion";
import { ArrowDown, BarChart3, CheckCircle2, MousePointer2, PackageCheck, Sparkles, TrendingUp } from "lucide-react";
import { LandingLanguage } from "../../i18n";
import { AnimatedCounter } from "../motion/AnimatedCounter";

const copy = {
    en: { eyebrow: "Interactive delivered economics", title: "Don't optimize only for orders. Optimize for delivered profit.", subtitle: "Ad dashboards stop at the order. Ecom OS connects spend, confirmation and Moroccan delivery outcomes so you see the cost of what actually reaches the customer.", simulator: "Adjust your operation", spend: "Ad spend", orders: "Raw orders", confirmRate: "Confirmation rate", deliveryRate: "Delivery rate", confirmed: "Confirmed orders", delivered: "Delivered parcels", cpo: "Cost per order", cpc: "Cost per confirmed", cpd: "True cost per delivered", insight: "The real acquisition cost appears after confirmation and delivery—not at checkout.", illustration: "Illustrative figures · change any slider" },
    fr: { eyebrow: "Économie livrée interactive", title: "N'optimisez pas seulement les commandes. Optimisez le profit livré.", subtitle: "Les dashboards pub s'arrêtent à la commande. Ecom OS relie dépense, confirmation et livraison marocaine pour révéler le coût de ce qui arrive réellement au client.", simulator: "Ajustez votre opération", spend: "Dépense publicitaire", orders: "Commandes brutes", confirmRate: "Taux de confirmation", deliveryRate: "Taux de livraison", confirmed: "Commandes confirmées", delivered: "Colis livrés", cpo: "Coût par commande", cpc: "Coût par confirmée", cpd: "Coût réel par livré", insight: "Le vrai coût d'acquisition apparaît après confirmation et livraison, pas au checkout.", illustration: "Chiffres illustratifs · modifiez les curseurs" },
    ar: { eyebrow: "اقتصاد التوصيل التفاعلي", title: "لا تحسن الطلبات فقط. حسن الربح بعد التوصيل.", subtitle: "تتوقف لوحات الإعلانات عند الطلب. يربط Ecom OS الإنفاق والتأكيد ونتائج التوصيل في المغرب لتعرف تكلفة ما يصل فعلياً للعميل.", simulator: "عدّل عملياتك", spend: "الإنفاق الإعلاني", orders: "الطلبات الأولية", confirmRate: "معدل التأكيد", deliveryRate: "معدل التوصيل", confirmed: "الطلبات المؤكدة", delivered: "الشحنات المسلّمة", cpo: "تكلفة كل طلب", cpc: "تكلفة كل مؤكد", cpd: "التكلفة الحقيقية لكل توصيل", insight: "تظهر تكلفة الاكتساب الحقيقية بعد التأكيد والتوصيل، وليس عند إنشاء الطلب.", illustration: "أرقام توضيحية · غيّر أي مؤشر" },
};

export function CostPerDeliveredDemo({ lang }: { lang: LandingLanguage }) {
    const [spend, setSpend] = useState(1000);
    const [orders, setOrders] = useState(100);
    const [confirmedRatio, setConfirmedRatio] = useState(0.65);
    const [deliveredRatio, setDeliveredRatio] = useState(0.72);
    const c = copy[lang];
    const isRtl = lang === "ar";

    const confirmed = Math.round(orders * confirmedRatio);
    const delivered = Math.round(confirmed * deliveredRatio);
    const cpo = spend / Math.max(orders, 1);
    const cpc = spend / Math.max(confirmed, 1);
    const cpd = spend / Math.max(delivered, 1);

    const controls = [
        { label: `${c.spend} (MAD)`, value: spend, display: spend.toLocaleString(), min: 100, max: 10000, step: 100, onChange: setSpend, color: "#DB3F73" },
        { label: c.orders, value: orders, display: String(orders), min: 10, max: 1000, step: 10, onChange: setOrders, color: "#DB3F73" },
        { label: c.confirmRate, value: confirmedRatio, display: `${Math.round(confirmedRatio * 100)}%`, min: 0.1, max: 0.99, step: 0.01, onChange: setConfirmedRatio, color: "#6366f1" },
        { label: c.deliveryRate, value: deliveredRatio, display: `${Math.round(deliveredRatio * 100)}%`, min: 0.1, max: 0.99, step: 0.01, onChange: setDeliveredRatio, color: "#10b981" },
    ];

    return (
        <section className={`relative overflow-hidden border-t border-slate-200 bg-white py-24 sm:py-32 ${isRtl ? "rtl" : ""}`}>
            <div className="pointer-events-none absolute inset-x-0 top-0 h-[500px] bg-[radial-gradient(circle_at_50%_0%,rgba(219,63,115,0.11),transparent_58%)]" />
            <div className="relative mx-auto max-w-[1280px] px-4 sm:px-6 lg:px-8">
                <div className="mx-auto mb-12 max-w-4xl text-center">
                    <div className="mb-4 inline-flex items-center gap-2 rounded-full border border-[#DB6A8F]/20 bg-[#fff5f8] px-3 py-1.5 text-xs font-bold text-[#a82855]"><TrendingUp className="h-3.5 w-3.5" />{c.eyebrow}</div>
                    <h2 className="text-balance text-4xl font-bold tracking-[-0.05em] text-[#21161a] sm:text-6xl">{c.title}</h2>
                    <p className="mx-auto mt-5 max-w-3xl text-base leading-7 text-slate-600 sm:text-lg">{c.subtitle}</p>
                </div>

                <div className="overflow-hidden rounded-[30px] border border-slate-200 bg-[#fcfafb] shadow-[0_24px_70px_rgba(51,30,41,0.09)]">
                    <div className="grid gap-0 lg:grid-cols-[.88fr_1.12fr]">
                        <div className="border-b border-slate-200 bg-white p-5 sm:p-8 lg:border-b-0 lg:border-r">
                            <div className="mb-7 flex items-center justify-between gap-3"><span className="flex items-center gap-2 text-xs font-black uppercase tracking-[0.16em] text-[#c93265]"><MousePointer2 className="h-4 w-4" />{c.simulator}</span><span className="rounded-full bg-slate-100 px-3 py-1 text-[10px] font-bold text-slate-500">MAD</span></div>
                            <div className="space-y-7">
                                {controls.map((control) => {
                                    const progress = ((control.value - control.min) / (control.max - control.min)) * 100;
                                    return (
                                        <label key={control.label} className="block">
                                            <span className="mb-3 flex items-center justify-between gap-3 text-sm font-semibold text-slate-600"><span>{control.label}</span><span className="rounded-lg border border-slate-200 bg-slate-50 px-2.5 py-1 text-sm font-black text-slate-950">{control.display}</span></span>
                                            <input type="range" min={control.min} max={control.max} step={control.step} value={control.value} onChange={(event) => control.onChange(Number(event.target.value))} className="h-2 w-full cursor-pointer appearance-none rounded-full bg-slate-200" style={{ accentColor: control.color, background: `linear-gradient(to right, ${control.color} 0%, ${control.color} ${progress}%, #e2e8f0 ${progress}%, #e2e8f0 100%)` }} />
                                        </label>
                                    );
                                })}
                            </div>
                            <div className="mt-8 flex items-start gap-3 rounded-2xl border border-[#F1D4DF] bg-[#fff7fa] p-4"><Sparkles className="mt-0.5 h-4 w-4 shrink-0 text-[#c93265]" /><p className="text-xs leading-5 text-slate-600">{c.insight}</p></div>
                        </div>

                        <div className="relative p-5 sm:p-8">
                            <div className="absolute left-1/2 top-8 bottom-8 hidden w-px -translate-x-1/2 bg-gradient-to-b from-transparent via-slate-200 to-transparent sm:block lg:left-[46%]" />
                            <div className="relative space-y-3">
                                <div className="grid gap-3 sm:grid-cols-[1fr_48px_1fr] sm:items-center">
                                    <MetricCard icon={BarChart3} label={c.orders} value={<AnimatedCounter target={orders} />} tone="rose" />
                                    <ArrowDown className="mx-auto h-5 w-5 text-slate-300 sm:-rotate-90" />
                                    <MetricCard label={c.cpo} value={<AnimatedCounter target={cpo} suffix=" DH" formatter={(value) => value.toFixed(1)} />} tone="rose" align="right" />
                                </div>
                                <div className="grid gap-3 sm:grid-cols-[1fr_48px_1fr] sm:items-center">
                                    <MetricCard icon={CheckCircle2} label={c.confirmed} value={<AnimatedCounter target={confirmed} />} tone="amber" />
                                    <ArrowDown className="mx-auto h-5 w-5 text-slate-300 sm:-rotate-90" />
                                    <MetricCard label={c.cpc} value={<AnimatedCounter target={cpc} suffix=" DH" formatter={(value) => value.toFixed(1)} />} tone="amber" align="right" />
                                </div>
                                <motion.div layout className="grid gap-3 rounded-[22px] border-2 border-emerald-300 bg-gradient-to-br from-emerald-50 to-white p-3 shadow-[0_16px_40px_rgba(16,185,129,0.12)] sm:grid-cols-[1fr_48px_1fr] sm:items-center">
                                    <MetricCard icon={PackageCheck} label={c.delivered} value={<AnimatedCounter target={delivered} />} tone="emerald" embedded />
                                    <ArrowDown className="mx-auto h-5 w-5 text-emerald-400 sm:-rotate-90" />
                                    <MetricCard label={c.cpd} value={<AnimatedCounter target={cpd} suffix=" DH" formatter={(value) => value.toFixed(1)} />} tone="emerald" align="right" embedded large />
                                </motion.div>
                            </div>
                            <div className="mt-5 flex items-center justify-center gap-2 text-center text-[10px] font-semibold text-slate-400"><span className="h-1.5 w-1.5 animate-pulse rounded-full bg-emerald-500" />{c.illustration}</div>
                        </div>
                    </div>
                </div>
            </div>
        </section>
    );
}

function MetricCard({ icon: Icon, label, value, tone, align = "left", embedded = false, large = false }: { icon?: typeof BarChart3; label: string; value: React.ReactNode; tone: "rose" | "amber" | "emerald"; align?: "left" | "right"; embedded?: boolean; large?: boolean }) {
    const tones = { rose: "bg-[#fff2f6] text-[#c93265]", amber: "bg-amber-50 text-amber-700", emerald: "bg-emerald-100 text-emerald-700" };
    return (
        <motion.div layout className={`${embedded ? "border-0 bg-transparent shadow-none" : "border border-slate-200 bg-white shadow-sm"} flex min-h-28 items-center gap-3 rounded-2xl p-4 ${align === "right" ? "justify-between text-right" : "text-left"}`}>
            {Icon && <span className={`flex h-10 w-10 shrink-0 items-center justify-center rounded-xl ${tones[tone]}`}><Icon className="h-5 w-5" /></span>}
            <span className={align === "right" ? "ms-auto" : ""}><span className="block text-[10px] font-black uppercase tracking-[0.13em] text-slate-400">{label}</span><span className={`mt-2 block font-black tabular-nums text-slate-950 ${large ? "text-3xl" : "text-2xl"}`}>{value}</span></span>
        </motion.div>
    );
}
