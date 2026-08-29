import { useEffect, useRef, useState } from "react";
import { AnimatePresence, motion, useInView, useReducedMotion } from "framer-motion";
import {
    AlertTriangle,
    Check,
    CheckCircle2,
    FileCheck2,
    PackageCheck,
    Play,
    RotateCcw,
    ScanLine,
    ShieldCheck,
    Sparkles,
    Truck,
} from "lucide-react";
import { LandingLanguage } from "../../i18n";

const copy = {
    en: {
        eyebrow: "Returns reconciliation",
        title: "Scan every return. Know exactly what came back.",
        subtitle: "Ecom OS matches each returned parcel to the carrier manifest, exposes what is still missing and prepares one clean reconciliation report.",
        benefits: ["QR parcel matching", "Missing-return alerts", "Carrier-ready report"],
        shell: "Returns control room",
        live: "Live reconciliation",
        scanner: "Parcel scanner",
        online: "Scanner online",
        scanning: "Reading parcel label…",
        complete: "All parcels captured",
        scanned: "Scanned",
        scanNext: "Scan next parcel",
        declared: "Carrier declared",
        received: "Received & scanned",
        missing: "Still missing",
        manifest: "Return manifest",
        manifestDetail: "Matched automatically to orders and carrier data",
        order: "Order",
        customer: "Customer",
        carrier: "Carrier",
        amount: "Amount",
        status: "Status",
        validated: "Validated",
        waiting: "Waiting",
        alertTitle: "Missing parcels become visible immediately",
        alertText: "Stop accepting a carrier total that does not match what your warehouse actually received.",
        reportReady: "Return report ready",
        reportDetail: "5 parcels matched · 0 missing",
        reportId: "RR-2026-0142 · PDF ready",
        replay: "Run scan again",
    },
    fr: {
        eyebrow: "Rapprochement des retours",
        title: "Scannez chaque retour. Sachez exactement ce qui est revenu.",
        subtitle: "Ecom OS associe chaque colis retourné au manifeste du transporteur, révèle ce qui manque encore et prépare un rapport de rapprochement clair.",
        benefits: ["Association par QR", "Alertes de retours manquants", "Rapport pour le transporteur"],
        shell: "Centre de contrôle des retours",
        live: "Rapprochement en direct",
        scanner: "Scanner de colis",
        online: "Scanner connecté",
        scanning: "Lecture de l'étiquette…",
        complete: "Tous les colis sont saisis",
        scanned: "Scannés",
        scanNext: "Scanner le colis suivant",
        declared: "Déclarés par le transporteur",
        received: "Reçus et scannés",
        missing: "Encore manquants",
        manifest: "Manifeste des retours",
        manifestDetail: "Associé automatiquement aux commandes et au transporteur",
        order: "Commande",
        customer: "Client",
        carrier: "Transporteur",
        amount: "Montant",
        status: "Statut",
        validated: "Validé",
        waiting: "En attente",
        alertTitle: "Les colis manquants deviennent visibles immédiatement",
        alertText: "N'acceptez plus un total transporteur qui ne correspond pas aux colis réellement reçus.",
        reportReady: "Rapport de retour prêt",
        reportDetail: "5 colis associés · 0 manquant",
        reportId: "RR-2026-0142 · PDF prêt",
        replay: "Relancer le scan",
    },
    ar: {
        eyebrow: "مطابقة المرتجعات",
        title: "امسح كل مرتجع. واعرف بالضبط ما عاد إليك.",
        subtitle: "يطابق Ecom OS كل طرد مرتجع مع لائحة شركة التوصيل، ويكشف ما يزال مفقوداً، ثم يجهز تقرير مطابقة واضحاً.",
        benefits: ["مطابقة الطرد عبر QR", "تنبيهات المرتجعات الناقصة", "تقرير جاهز لشركة التوصيل"],
        shell: "مركز مراقبة المرتجعات",
        live: "مطابقة مباشرة",
        scanner: "ماسح الطرود",
        online: "الماسح متصل",
        scanning: "جاري قراءة ملصق الطرد…",
        complete: "تم استلام كل الطرود",
        scanned: "تم مسحها",
        scanNext: "مسح الطرد التالي",
        declared: "المصرح بها من الناقل",
        received: "المستلمة والممسوحة",
        missing: "ما يزال مفقوداً",
        manifest: "لائحة المرتجعات",
        manifestDetail: "مطابقة تلقائياً مع الطلبات وبيانات الناقل",
        order: "الطلب",
        customer: "العميل",
        carrier: "الناقل",
        amount: "المبلغ",
        status: "الحالة",
        validated: "تم التحقق",
        waiting: "في الانتظار",
        alertTitle: "تظهر الطرود المفقودة فوراً",
        alertText: "لا تعتمد رقماً من شركة التوصيل لا يطابق ما استلمه مستودعك فعلياً.",
        reportReady: "تقرير المرتجعات جاهز",
        reportDetail: "تمت مطابقة 5 طرود · لا شيء مفقود",
        reportId: "RR-2026-0142 · ملف PDF جاهز",
        replay: "إعادة عملية المسح",
    },
} as const;

const parcels = [
    { id: "#MA-4903", customer: "Hamada R.", city: "Nador", carrier: "OzonExpress", amount: "2,000 DH", color: "#f59e0b" },
    { id: "#MA-4907", customer: "Karim T.", city: "Casablanca", carrier: "Sendit", amount: "3,490 DH", color: "#3b82f6" },
    { id: "#MA-4912", customer: "Nadia B.", city: "Marrakech", carrier: "Cathedis", amount: "1,500 DH", color: "#ef4444" },
    { id: "#MA-4918", customer: "Youssef A.", city: "Fès", carrier: "Ameex", amount: "4,200 DH", color: "#8b5cf6" },
    { id: "#MA-4921", customer: "Hind K.", city: "Rabat", carrier: "Onessta", amount: "2,750 DH", color: "#0891b2" },
] as const;

export function ReturnsScannerSection({ lang }: { lang: LandingLanguage }) {
    const sectionRef = useRef<HTMLElement | null>(null);
    const inView = useInView(sectionRef, { amount: 0.25 });
    const prefersReducedMotion = useReducedMotion();
    const [scannedCount, setScannedCount] = useState(0);
    const [autoPlay, setAutoPlay] = useState(true);
    const [showReport, setShowReport] = useState(false);
    const c = copy[lang];
    const isRtl = lang === "ar";
    const total = parcels.length;
    const missing = total - scannedCount;
    const activeParcel = parcels[Math.min(scannedCount, total - 1)];

    useEffect(() => {
        if (!inView || !autoPlay || scannedCount >= total) return;
        const timer = window.setTimeout(() => setScannedCount((current) => Math.min(current + 1, total)), prefersReducedMotion ? 250 : 950);
        return () => window.clearTimeout(timer);
    }, [autoPlay, inView, prefersReducedMotion, scannedCount, total]);

    useEffect(() => {
        if (!inView || scannedCount !== total) {
            setShowReport(false);
            return;
        }
        const timer = window.setTimeout(() => setShowReport(true), prefersReducedMotion ? 150 : 650);
        return () => window.clearTimeout(timer);
    }, [inView, prefersReducedMotion, scannedCount, total]);

    const scanNext = () => {
        setAutoPlay(false);
        setShowReport(false);
        setScannedCount((current) => Math.min(current + 1, total));
    };

    const replay = () => {
        setShowReport(false);
        setScannedCount(0);
        setAutoPlay(true);
    };

    return (
        <section ref={sectionRef} className={`relative overflow-hidden border-t border-slate-200 bg-[#f7f9fc] py-24 sm:py-32 ${isRtl ? "rtl" : ""}`}>
            <div className="pointer-events-none absolute inset-x-0 top-0 h-[560px] bg-[radial-gradient(circle_at_50%_0%,rgba(59,130,246,0.12),transparent_55%)]" />
            <div className="pointer-events-none absolute -left-40 top-1/3 h-96 w-96 rounded-full bg-[#f6d6e2]/50 blur-3xl" />

            <div className="relative mx-auto max-w-[1320px] px-4 sm:px-6 lg:px-8">
                <div className="mx-auto max-w-4xl text-center">
                    <div className="mb-5 inline-flex items-center gap-2 rounded-full border border-blue-200 bg-white px-3.5 py-2 text-xs font-bold text-blue-700 shadow-sm">
                        <ScanLine className="h-4 w-4" />{c.eyebrow}
                    </div>
                    <h2 className="text-balance text-4xl font-bold leading-[1.02] tracking-[-0.055em] text-[#21161a] sm:text-6xl">{c.title}</h2>
                    <p className="mx-auto mt-5 max-w-3xl text-base leading-7 text-slate-600 sm:text-lg sm:leading-8">{c.subtitle}</p>
                    <div className="mt-7 flex flex-wrap justify-center gap-2.5">
                        {c.benefits.map((benefit) => (
                            <span key={benefit} className="inline-flex items-center gap-2 rounded-full border border-slate-200 bg-white px-3.5 py-2 text-xs font-bold text-slate-700 shadow-sm">
                                <span className="flex h-5 w-5 items-center justify-center rounded-full bg-emerald-100 text-emerald-600"><Check className="h-3 w-3 stroke-[3]" /></span>{benefit}
                            </span>
                        ))}
                    </div>
                </div>

                <div className="relative mt-12 overflow-hidden rounded-[32px] border border-slate-200 bg-white shadow-[0_35px_100px_rgba(30,45,70,0.14)]">
                    <div className="flex flex-col gap-3 border-b border-slate-200 bg-white px-5 py-4 sm:flex-row sm:items-center sm:justify-between sm:px-6">
                        <div className="flex items-center gap-3">
                            <span className="flex h-10 w-10 items-center justify-center rounded-xl bg-slate-950 text-white"><PackageCheck className="h-5 w-5" /></span>
                            <span><span className="block text-sm font-black text-slate-950">{c.shell}</span><span className="mt-0.5 block text-[10px] text-slate-400">Ecom OS · COD Returns</span></span>
                        </div>
                        <span className="inline-flex w-fit items-center gap-2 rounded-full border border-emerald-200 bg-emerald-50 px-3 py-1.5 text-[10px] font-black uppercase tracking-[0.12em] text-emerald-700"><span className="relative flex h-2 w-2"><span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-emerald-400 opacity-70" /><span className="relative h-2 w-2 rounded-full bg-emerald-500" /></span>{c.live}</span>
                    </div>

                    <div className="grid lg:grid-cols-[330px_1fr] xl:grid-cols-[370px_1fr]">
                        <div className="border-b border-slate-200 bg-[#f8fafc] p-4 sm:p-6 lg:border-b-0 lg:border-e">
                            <div className="overflow-hidden rounded-[24px] border border-slate-200 bg-white shadow-sm">
                                <div className="flex items-center justify-between border-b border-slate-100 px-4 py-3">
                                    <span className="flex items-center gap-2 text-xs font-black text-slate-800"><span className="flex gap-1"><i className="h-2 w-2 rounded-full bg-red-400" /><i className="h-2 w-2 rounded-full bg-amber-400" /><i className="h-2 w-2 rounded-full bg-emerald-400" /></span>{c.scanner}</span>
                                    <span className="flex items-center gap-1.5 text-[10px] font-black text-emerald-600"><span className="h-1.5 w-1.5 rounded-full bg-emerald-500" />{c.online}</span>
                                </div>

                                <div className="p-3">
                                    <div className="relative flex aspect-square items-center justify-center overflow-hidden rounded-[20px] bg-[radial-gradient(circle_at_50%_45%,#23304a,#0f172a_68%)] p-[17%]">
                                        <span className="absolute left-4 top-4 h-6 w-6 border-l-2 border-t-2 border-white/90" /><span className="absolute right-4 top-4 h-6 w-6 border-r-2 border-t-2 border-white/90" /><span className="absolute bottom-4 left-4 h-6 w-6 border-b-2 border-l-2 border-white/90" /><span className="absolute bottom-4 right-4 h-6 w-6 border-b-2 border-r-2 border-white/90" />
                                        <QrPattern seed={scannedCount + 1} />
                                        {scannedCount < total && (
                                            <motion.span animate={prefersReducedMotion ? undefined : { top: ["12%", "86%", "12%"] }} transition={{ duration: 2.1, ease: "easeInOut", repeat: Infinity }} className="absolute left-[12%] right-[12%] h-[2px] bg-emerald-300 shadow-[0_0_14px_4px_rgba(52,211,153,0.58)]" />
                                        )}
                                        <AnimatePresence>
                                            {scannedCount === total && <motion.span initial={{ opacity: 0, scale: 0.7 }} animate={{ opacity: 1, scale: 1 }} className="absolute flex h-20 w-20 items-center justify-center rounded-full bg-emerald-500 text-white shadow-[0_18px_45px_rgba(16,185,129,0.35)]"><Check className="h-10 w-10 stroke-[3]" /></motion.span>}
                                        </AnimatePresence>
                                    </div>

                                    <div className="mt-3 flex items-center justify-between gap-3 px-1 text-[10px] font-bold">
                                        <span className={scannedCount === total ? "text-emerald-600" : "text-blue-600"}>{scannedCount === total ? c.complete : c.scanning}</span>
                                        <span className="text-slate-700">{c.scanned} <strong>{scannedCount} / {total}</strong></span>
                                    </div>
                                    <div className="mt-3 h-1.5 overflow-hidden rounded-full bg-slate-100"><motion.div animate={{ width: `${(scannedCount / total) * 100}%` }} className="h-full rounded-full bg-gradient-to-r from-blue-500 to-emerald-400" /></div>
                                    <button type="button" onClick={scannedCount === total ? replay : scanNext} className="mt-4 inline-flex h-11 w-full items-center justify-center gap-2 rounded-xl bg-slate-950 text-xs font-black text-white transition hover:bg-slate-800">
                                        {scannedCount === total ? <RotateCcw className="h-4 w-4" /> : <ScanLine className="h-4 w-4" />}{scannedCount === total ? c.replay : c.scanNext}
                                    </button>
                                </div>
                            </div>

                            <div className="mt-4 grid grid-cols-3 gap-2">
                                <Stat label={c.declared} value={total} tone="slate" />
                                <Stat label={c.received} value={scannedCount} tone="emerald" />
                                <Stat label={c.missing} value={missing} tone={missing > 0 ? "rose" : "emerald"} />
                            </div>
                        </div>

                        <div className="relative min-h-[610px] bg-white p-4 sm:p-6 lg:min-h-0">
                            <div className="flex items-start justify-between gap-4">
                                <div><p className="text-sm font-black text-slate-950 sm:text-base">{c.manifest}</p><p className="mt-1 text-[10px] leading-4 text-slate-400 sm:text-xs">{c.manifestDetail}</p></div>
                                <span className="hidden h-9 items-center gap-2 rounded-xl bg-blue-50 px-3 text-[10px] font-black text-blue-700 sm:flex"><Sparkles className="h-3.5 w-3.5" />Auto-match</span>
                            </div>

                            <div className="mt-5 hidden grid-cols-[1.1fr_1fr_1fr_.8fr_.75fr] gap-3 border-y border-slate-100 bg-slate-50/70 px-4 py-3 text-[9px] font-black uppercase tracking-[0.13em] text-slate-400 sm:grid">
                                <span>{c.order}</span><span>{c.customer}</span><span>{c.carrier}</span><span>{c.amount}</span><span>{c.status}</span>
                            </div>
                            <div className="mt-3 space-y-2 sm:mt-0 sm:space-y-0">
                                {parcels.map((parcel, index) => {
                                    const validated = index < scannedCount;
                                    const latest = index === scannedCount - 1;
                                    return (
                                        <motion.div key={parcel.id} layout className={`grid grid-cols-[1fr_auto] items-center gap-3 rounded-2xl border px-3 py-3 transition-colors sm:grid-cols-[1.1fr_1fr_1fr_.8fr_.75fr] sm:rounded-none sm:border-x-0 sm:border-t-0 sm:px-4 ${latest ? "border-blue-200 bg-blue-50/80" : "border-slate-100 bg-white"}`}>
                                            <span><span className="block text-xs font-black text-slate-950">{parcel.id}</span><span className="mt-1 block text-[9px] text-slate-400 sm:hidden">{parcel.amount}</span></span>
                                            <span className="hidden sm:block"><span className="block text-xs font-bold text-slate-700">{parcel.customer}</span><span className="mt-1 block text-[9px] text-slate-400">{parcel.city}</span></span>
                                            <span className="hidden items-center gap-2 text-[10px] font-bold text-slate-600 sm:flex"><span className="h-2 w-2 rounded-full" style={{ backgroundColor: parcel.color }} />{parcel.carrier}</span>
                                            <span className="hidden text-[10px] font-bold text-slate-600 sm:block">{parcel.amount}</span>
                                            <span className={`inline-flex items-center justify-center gap-1.5 rounded-full px-2.5 py-1.5 text-[9px] font-black ${validated ? "bg-emerald-100 text-emerald-700" : "bg-amber-50 text-amber-700"}`}>
                                                {validated ? <Check className="h-3 w-3 stroke-[3]" /> : <span className="h-1.5 w-1.5 rounded-full bg-amber-400" />}{validated ? c.validated : c.waiting}
                                            </span>
                                            <span className="col-span-2 flex items-center justify-between gap-2 border-t border-slate-100 pt-2 text-[9px] text-slate-400 sm:hidden"><span>{parcel.customer} · {parcel.city}</span><span className="flex items-center gap-1"><span className="h-1.5 w-1.5 rounded-full" style={{ backgroundColor: parcel.color }} />{parcel.carrier}</span></span>
                                        </motion.div>
                                    );
                                })}
                            </div>

                            <div className="mt-5 flex items-start gap-3 rounded-2xl border border-rose-200 bg-rose-50 p-4">
                                <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-white text-rose-600 shadow-sm"><AlertTriangle className="h-4 w-4" /></span>
                                <span><span className="block text-xs font-black text-rose-900">{c.alertTitle}</span><span className="mt-1 block text-[10px] leading-4 text-rose-700/80">{c.alertText}</span></span>
                            </div>

                            <AnimatePresence>
                                {showReport && (
                                    <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} className="absolute inset-0 z-20 flex items-center justify-center bg-white/95 p-6 backdrop-blur-sm">
                                        <motion.div initial={prefersReducedMotion ? false : { opacity: 0, y: 16, scale: 0.96 }} animate={{ opacity: 1, y: 0, scale: 1 }} className="w-full max-w-md text-center">
                                            <span className="mx-auto flex h-20 w-20 items-center justify-center rounded-full bg-emerald-100 text-emerald-600"><CheckCircle2 className="h-10 w-10" /></span>
                                            <h3 className="mt-6 text-2xl font-black tracking-[-0.04em] text-slate-950 sm:text-3xl">{c.reportReady}</h3>
                                            <p className="mt-2 text-sm text-slate-500">{c.reportDetail}</p>
                                            <div className="mx-auto mt-6 inline-flex items-center gap-2 rounded-xl border border-rose-200 bg-rose-50 px-4 py-3 text-xs font-black text-rose-700"><FileCheck2 className="h-4 w-4" />{c.reportId}</div>
                                            <div className="mt-7 flex flex-wrap justify-center gap-3">
                                                <span className="inline-flex items-center gap-2 rounded-full bg-emerald-50 px-3 py-2 text-[10px] font-black text-emerald-700"><ShieldCheck className="h-3.5 w-3.5" />5 / 5</span>
                                                <span className="inline-flex items-center gap-2 rounded-full bg-blue-50 px-3 py-2 text-[10px] font-black text-blue-700"><Truck className="h-3.5 w-3.5" />5 matched</span>
                                            </div>
                                            <button type="button" onClick={replay} className="mt-8 inline-flex h-11 items-center justify-center gap-2 rounded-full bg-slate-950 px-5 text-xs font-black text-white transition hover:-translate-y-0.5 hover:bg-slate-800"><Play className="h-3.5 w-3.5 fill-current" />{c.replay}</button>
                                        </motion.div>
                                    </motion.div>
                                )}
                            </AnimatePresence>
                        </div>
                    </div>
                </div>
            </div>
        </section>
    );
}

function Stat({ label, value, tone }: { label: string; value: number; tone: "slate" | "emerald" | "rose" }) {
    const colors = {
        slate: "border-slate-200 bg-white text-slate-950",
        emerald: "border-emerald-200 bg-emerald-50 text-emerald-700",
        rose: "border-rose-200 bg-rose-50 text-rose-700",
    };
    return <div className={`rounded-2xl border p-3 text-center ${colors[tone]}`}><span className="block text-xl font-black tabular-nums">{value}</span><span className="mt-1 block text-[8px] font-bold leading-3 text-slate-500">{label}</span></div>;
}

function QrPattern({ seed }: { seed: number }) {
    const size = 15;
    const finderCell = (x: number, y: number, originX: number, originY: number) => {
        const dx = x - originX;
        const dy = y - originY;
        if (dx < 0 || dx > 4 || dy < 0 || dy > 4) return false;
        return dx === 0 || dx === 4 || dy === 0 || dy === 4 || (dx >= 2 && dx <= 3 && dy >= 2 && dy <= 3);
    };

    return (
        <motion.div key={seed} initial={{ opacity: 0.65, scale: 0.96 }} animate={{ opacity: 1, scale: 1 }} className="grid aspect-square w-full gap-[2px] rounded-md bg-white p-2 shadow-2xl" style={{ gridTemplateColumns: `repeat(${size}, minmax(0, 1fr))` }}>
            {Array.from({ length: size * size }, (_, index) => {
                const x = index % size;
                const y = Math.floor(index / size);
                const finder = finderCell(x, y, 0, 0) || finderCell(x, y, 10, 0) || finderCell(x, y, 0, 10);
                const reserved = (x <= 5 && y <= 5) || (x >= 9 && y <= 5) || (x <= 5 && y >= 9);
                const random = !reserved && ((x * 7 + y * 11 + seed * 13 + x * y) % 5 < 2);
                return <span key={index} className={`aspect-square ${finder || random ? "bg-slate-950" : "bg-transparent"}`} />;
            })}
        </motion.div>
    );
}
