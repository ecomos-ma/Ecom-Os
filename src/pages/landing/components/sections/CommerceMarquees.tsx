import { LandingLanguage } from "../../i18n";
import { integrationLogos } from "../../../../lib/integrationLogos";

const copy = {
    en: {
        stores: "Built for ambitious Moroccan stores",
        storesNote: "One calm operating system for every COD team",
        shipping: "Ships with Morocco's leading carriers",
        shippingNote: "Create shipments and bring tracking updates back to every order.",
    },
    fr: {
        stores: "Conçu pour les boutiques marocaines ambitieuses",
        storesNote: "Un système clair pour chaque équipe COD",
        shipping: "Expédiez avec les principaux transporteurs marocains",
        shippingNote: "Créez vos envois et synchronisez le suivi avec chaque commande.",
    },
    ar: {
        stores: "مصمم للمتاجر المغربية الطموحة",
        storesNote: "نظام تشغيل واضح لكل فريق دفع عند الاستلام",
        shipping: "اشحن مع أبرز شركات التوصيل المغربية",
        shippingNote: "أنشئ الشحنات وأعد تحديثات التتبع إلى كل طلب.",
    },
} as const;

const stores = [
    { name: "ARGANIA", style: "font-black tracking-[-0.04em]" },
    { name: "Casa Sneakers", style: "font-black italic tracking-[-0.03em]" },
    { name: "TECHDEAL", style: "font-semibold tracking-[0.12em]" },
    { name: "Kenzi Shop", style: "font-black tracking-[-0.04em]" },
    { name: "ATLAS GADGETS", style: "font-bold tracking-[0.12em]" },
    { name: "medina.style", style: "font-black italic tracking-[-0.04em]" },
    { name: "RIAD LIVING", style: "font-semibold tracking-[0.14em]" },
    { name: "Noura Market", style: "font-black tracking-[-0.04em]" },
] as const;

const remoteBase = "https://www.garean.com/assets/images/company";

const carriers = [
    { name: "Onessta", logo: `${remoteBase}/onessta.svg` },
    { name: "Ozon Express", logo: integrationLogos.ozon },
    { name: "Sendit", logo: integrationLogos.sendit },
    { name: "Ameex", logo: integrationLogos.ameex },
    { name: "Cathedis", logo: `${remoteBase}/cathidis.svg` },
    { name: "Digylog", logo: integrationLogos.digylog },
    { name: "QL Express", logo: `${remoteBase}/ql.svg` },
    { name: "Cargo", logo: `${remoteBase}/cargo.svg` },
    { name: "OL Livraison", logo: `${remoteBase}/ol.svg` },
    { name: "Livo", logo: integrationLogos.livo },
    { name: "ForceLog", logo: integrationLogos.forcelog },
    { name: "SpeedX", logo: `${remoteBase}/speedx.png` },
] as const;

function StoreSequence({ hidden = false }: { hidden?: boolean }) {
    return (
        <div className="flex shrink-0 items-center gap-12 pe-12 sm:gap-16 sm:pe-16" aria-hidden={hidden || undefined}>
            {stores.map((store) => (
                <span key={store.name} className={`whitespace-nowrap text-[15px] text-white/65 transition-colors duration-300 hover:text-white sm:text-lg ${store.style}`}>
                    {store.name}
                </span>
            ))}
        </div>
    );
}

function CarrierSequence({ hidden = false }: { hidden?: boolean }) {
    return (
        <div className="flex shrink-0 items-center gap-4 pe-4 sm:gap-6 sm:pe-6" aria-hidden={hidden || undefined}>
            {carriers.map((carrier) => (
                <div key={carrier.name} className="group flex h-[70px] w-[104px] shrink-0 items-center justify-center rounded-2xl border border-slate-200/80 bg-white px-3 shadow-[0_8px_24px_rgba(48,65,90,0.08)] transition duration-300 hover:-translate-y-1 hover:border-[#DB6A8F]/30 hover:shadow-[0_14px_32px_rgba(48,65,90,0.13)] sm:h-[78px] sm:w-[118px]" title={carrier.name}>
                    <img src={carrier.logo} alt={hidden ? "" : `${carrier.name} logo`} className="max-h-10 max-w-[78px] object-contain transition-transform duration-300 group-hover:scale-105 sm:max-h-11 sm:max-w-[88px]" loading="eager" decoding="async" />
                </div>
            ))}
        </div>
    );
}

export function StoreTrustMarquee({ lang }: { lang: LandingLanguage }) {
    const c = copy[lang];
    const isRtl = lang === "ar";

    return (
        <section className={`relative overflow-hidden border-y border-white/10 bg-[#17171a] py-8 sm:py-10 ${isRtl ? "rtl" : ""}`}>
            <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(circle_at_50%_0%,rgba(219,63,115,0.12),transparent_48%)]" />
            <p className="relative mb-7 text-center text-[10px] font-black uppercase tracking-[0.3em] text-[#e7a2ba]">{c.stores}</p>
            <div className="landing-marquee-mask group relative overflow-hidden">
                <div className="landing-marquee-track landing-marquee-left flex w-max items-center">
                    <StoreSequence />
                    <StoreSequence hidden />
                </div>
            </div>
            <p className="relative mt-7 text-center text-sm font-semibold text-white/60"><span className="font-black text-white">Ecom OS</span> · {c.storesNote}</p>
        </section>
    );
}

export function ShippingCarrierMarquee({ lang }: { lang: LandingLanguage }) {
    const c = copy[lang];
    const isRtl = lang === "ar";

    return (
        <section className={`relative overflow-hidden border-y border-slate-200 bg-[#f6f9fc] py-9 sm:py-11 ${isRtl ? "rtl" : ""}`}>
            <div className="pointer-events-none absolute inset-0 bg-[linear-gradient(90deg,rgba(219,63,115,0.04),transparent_24%,transparent_76%,rgba(59,130,246,0.05))]" />
            <div className="relative mx-auto mb-7 max-w-2xl px-5 text-center">
                <p className="text-[10px] font-black uppercase tracking-[0.28em] text-slate-400">{c.shipping}</p>
                <p className="mt-2 text-sm text-slate-500">{c.shippingNote}</p>
            </div>
            <div className="landing-marquee-mask group relative overflow-hidden">
                <div className="landing-marquee-track landing-marquee-right flex w-max items-center">
                    <CarrierSequence />
                    <CarrierSequence hidden />
                </div>
            </div>
        </section>
    );
}

export function CommerceMarquees({ lang }: { lang: LandingLanguage }) {
    return <><StoreTrustMarquee lang={lang} /><ShippingCarrierMarquee lang={lang} /></>;
}
