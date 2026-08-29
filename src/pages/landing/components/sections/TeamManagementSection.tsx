import { Activity, Check, Headphones, PackageCheck, ShieldCheck, Truck, Users } from "lucide-react";
import { LandingLanguage } from "../../i18n";
import { Reveal } from "../motion/Reveal";

const copy = {
    en: {
        eyebrow: "Team operations",
        title: "Manage the team behind",
        highlight: "every delivered order.",
        subtitle: "Give each person a clear role, follow the day's workload and keep every confirmation, support and shipping handoff visible from one workspace.",
        features: ["Role-based access", "Live workload", "Clear ownership"],
        panelTitle: "Team workspace",
        live: "Live",
        stats: [
            { label: "Team members", value: "8" },
            { label: "Online now", value: "5" },
            { label: "Actions today", value: "436" },
        ],
        members: [
            { name: "Sara El Amrani", role: "Confirmation lead", activity: "94 orders reviewed", status: "On shift", initials: "SA", tone: "pink" },
            { name: "Yassine Bensaid", role: "Shipping manager", activity: "61 parcels prepared", status: "Active", initials: "YB", tone: "blue" },
            { name: "Meryem Alaoui", role: "Customer support", activity: "38 conversations", status: "Online", initials: "MA", tone: "amber" },
        ],
        permissions: "Role-based permissions are active",
        permissionsDetail: "Everyone sees the tools and orders they need—nothing more.",
    },
    fr: {
        eyebrow: "Opérations d'équipe",
        title: "Pilotez l'équipe derrière",
        highlight: "chaque commande livrée.",
        subtitle: "Donnez à chacun un rôle clair, suivez la charge du jour et rendez chaque passage entre confirmation, support et expédition visible dans un seul espace.",
        features: ["Accès par rôle", "Charge en direct", "Responsabilité claire"],
        panelTitle: "Espace équipe",
        live: "En direct",
        stats: [
            { label: "Membres", value: "8" },
            { label: "En ligne", value: "5" },
            { label: "Actions aujourd'hui", value: "436" },
        ],
        members: [
            { name: "Sara El Amrani", role: "Responsable confirmation", activity: "94 commandes vérifiées", status: "En service", initials: "SA", tone: "pink" },
            { name: "Yassine Bensaid", role: "Responsable expédition", activity: "61 colis préparés", status: "Actif", initials: "YB", tone: "blue" },
            { name: "Meryem Alaoui", role: "Support client", activity: "38 conversations", status: "En ligne", initials: "MA", tone: "amber" },
        ],
        permissions: "Les permissions par rôle sont actives",
        permissionsDetail: "Chacun voit les outils et commandes dont il a besoin—rien de plus.",
    },
    ar: {
        eyebrow: "إدارة الفريق",
        title: "أدر الفريق المسؤول عن",
        highlight: "كل طلب يتم توصيله.",
        subtitle: "امنح كل عضو دوراً واضحاً، وتابع ضغط العمل اليومي، واجعل انتقال الطلب بين التأكيد والدعم والشحن واضحاً داخل مساحة واحدة.",
        features: ["صلاحيات حسب الدور", "ضغط العمل مباشرة", "مسؤولية واضحة"],
        panelTitle: "مساحة الفريق",
        live: "مباشر",
        stats: [
            { label: "أعضاء الفريق", value: "8" },
            { label: "متصل الآن", value: "5" },
            { label: "إجراءات اليوم", value: "436" },
        ],
        members: [
            { name: "سارة العمراني", role: "مسؤولة التأكيد", activity: "مراجعة 94 طلباً", status: "في العمل", initials: "س ع", tone: "pink" },
            { name: "ياسين بنسعيد", role: "مسؤول الشحن", activity: "تجهيز 61 طرداً", status: "نشط", initials: "ي ب", tone: "blue" },
            { name: "مريم العلوي", role: "دعم العملاء", activity: "38 محادثة", status: "متصلة", initials: "م ع", tone: "amber" },
        ],
        permissions: "صلاحيات الفريق حسب الدور مفعلة",
        permissionsDetail: "كل شخص يرى الأدوات والطلبات التي يحتاجها فقط.",
    },
} as const;

const tones = {
    pink: "bg-[#FCE7EF] text-[#b72f5d] ring-[#f4bfd1]",
    blue: "bg-sky-100 text-sky-700 ring-sky-200",
    amber: "bg-amber-100 text-amber-700 ring-amber-200",
};

const roleIcons = [PackageCheck, Truck, Headphones];

export function TeamManagementSection({ lang }: { lang: LandingLanguage }) {
    const c = copy[lang];
    const isRtl = lang === "ar";

    return (
        <section className={`relative overflow-hidden border-t border-slate-200 bg-white py-24 sm:py-32 ${isRtl ? "rtl" : ""}`}>
            <div className="pointer-events-none absolute left-[-12%] top-[10%] h-[420px] w-[420px] rounded-full bg-[#f8dce6]/50 blur-3xl" />
            <div className="relative mx-auto grid max-w-[1280px] items-center gap-14 px-4 sm:px-6 min-[900px]:grid-cols-[1.05fr_.95fr] lg:px-8">
                <Reveal direction={isRtl ? "left" : "right"} className="order-2 min-[900px]:order-1">
                    <div className="relative mx-auto max-w-[650px] rounded-[32px] border border-slate-200 bg-[#f7f7f8] p-3 shadow-[0_30px_80px_rgba(35,20,28,0.12)] sm:p-5">
                        <div className="absolute -inset-5 -z-10 rounded-[40px] bg-gradient-to-br from-[#f9dce7]/80 via-white to-sky-100/60 blur-2xl" />
                        <div className="overflow-hidden rounded-[24px] border border-slate-200 bg-white">
                            <div className="flex items-center justify-between border-b border-slate-100 px-4 py-4 sm:px-5">
                                <div className="flex items-center gap-3">
                                    <span className="flex h-10 w-10 items-center justify-center rounded-xl bg-slate-950 text-white"><Users className="h-5 w-5" /></span>
                                    <span><span className="block text-sm font-black text-slate-900">{c.panelTitle}</span><span className="mt-0.5 block text-[10px] text-slate-400">Ecom OS · COD Operations</span></span>
                                </div>
                                <span className="inline-flex items-center gap-1.5 rounded-full border border-emerald-200 bg-emerald-50 px-2.5 py-1 text-[10px] font-black text-emerald-700"><span className="h-1.5 w-1.5 animate-pulse rounded-full bg-emerald-500" />{c.live}</span>
                            </div>

                            <div className="grid grid-cols-3 gap-px border-b border-slate-100 bg-slate-100">
                                {c.stats.map((stat) => (
                                    <div key={stat.label} className="bg-white px-2 py-4 text-center sm:px-4">
                                        <div className="text-xl font-black tracking-[-0.03em] text-slate-950 sm:text-2xl">{stat.value}</div>
                                        <div className="mt-1 text-[9px] font-semibold text-slate-400 sm:text-[10px]">{stat.label}</div>
                                    </div>
                                ))}
                            </div>

                            <div className="space-y-2.5 p-3 sm:p-4">
                                {c.members.map((member, index) => {
                                    const RoleIcon = roleIcons[index];
                                    return (
                                        <div key={member.name} className={`group flex items-center gap-3 rounded-2xl border bg-white p-3 transition hover:-translate-y-0.5 hover:shadow-md ${index === 0 ? "border-[#eaa4bc] shadow-[0_8px_24px_rgba(219,63,115,0.09)]" : "border-slate-200"}`}>
                                            <span className={`flex h-11 w-11 shrink-0 items-center justify-center rounded-xl text-xs font-black ring-1 ${tones[member.tone]}`}>{member.initials}</span>
                                            <span className="min-w-0 flex-1">
                                                <span className="block truncate text-xs font-black text-slate-900 sm:text-sm">{member.name}</span>
                                                <span className="mt-0.5 flex items-center gap-1 text-[10px] text-slate-500"><RoleIcon className="h-3 w-3" />{member.role}</span>
                                            </span>
                                            <span className="hidden text-end sm:block">
                                                <span className="block text-[10px] font-bold text-slate-700">{member.activity}</span>
                                                <span className="mt-1 inline-flex items-center gap-1 text-[9px] font-bold text-emerald-600"><span className="h-1.5 w-1.5 rounded-full bg-emerald-500" />{member.status}</span>
                                            </span>
                                            <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-slate-50 text-slate-400 group-hover:bg-[#fff2f6] group-hover:text-[#c93265]"><Activity className="h-3.5 w-3.5" /></span>
                                        </div>
                                    );
                                })}
                            </div>

                            <div className="mx-3 mb-3 flex items-start gap-3 rounded-2xl border border-emerald-200 bg-emerald-50/70 p-3.5 sm:mx-4 sm:mb-4">
                                <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-white text-emerald-600 shadow-sm"><ShieldCheck className="h-4 w-4" /></span>
                                <span><span className="block text-xs font-black text-emerald-900">{c.permissions}</span><span className="mt-1 block text-[10px] leading-4 text-emerald-700/80">{c.permissionsDetail}</span></span>
                            </div>
                        </div>
                    </div>
                </Reveal>

                <Reveal direction={isRtl ? "right" : "left"} className="order-1 min-[900px]:order-2">
                    <div className="mb-5 inline-flex items-center gap-2 rounded-full border border-[#DB6A8F]/20 bg-[#fff6f9] px-3.5 py-2 text-xs font-bold text-[#a82855]">
                        <Users className="h-4 w-4" /> {c.eyebrow}
                    </div>
                    <h2 className="max-w-3xl text-balance text-4xl font-bold tracking-[-0.05em] text-[#21161a] sm:text-6xl min-[900px]:text-5xl xl:text-6xl">
                        {c.title}{" "}<span className="relative inline bg-gradient-to-r from-[#bd285b] to-[#e44d7f] bg-clip-text text-transparent"><span className="absolute inset-x-0 bottom-0 -z-10 h-[38%] bg-[#f9dce6]/80" />{c.highlight}</span>
                    </h2>
                    <p className="mt-6 max-w-xl text-base leading-7 text-slate-600 sm:text-lg sm:leading-8">{c.subtitle}</p>
                    <div className="mt-8 flex flex-wrap gap-3">
                        {c.features.map((feature) => (
                            <span key={feature} className="inline-flex items-center gap-2 rounded-full border border-slate-200 bg-white px-3.5 py-2 text-xs font-bold text-slate-700 shadow-sm"><span className="flex h-5 w-5 items-center justify-center rounded-full bg-emerald-100 text-emerald-600"><Check className="h-3 w-3 stroke-[3]" /></span>{feature}</span>
                        ))}
                    </div>
                </Reveal>
            </div>
        </section>
    );
}
