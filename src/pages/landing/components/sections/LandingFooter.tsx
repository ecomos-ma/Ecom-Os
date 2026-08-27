import { Link } from "react-router-dom";
import { LandingLanguage, i18n } from "../../i18n";
import ecomosLogo from "../../../../assets/ecomos_logo_137x32.png";

const links = {
    en: {
        product: ["Features", "Integrations", "Pricing", "Security"],
        resources: ["Documentation", "Case Studies", "Blog", "Status"],
        company: ["About", "Careers", "Contact", "Partners"]
    },
    ar: {
        product: ["المميزات", "الربط", "الأسعار", "الأمان"],
        resources: ["التوثيق", "دراسات حالة", "المدونة", "الحالة"],
        company: ["عنّا", "الوظائف", "اتصل بنا", "الشركاء"]
    },
    fr: {
        product: ["Fonctionnalités", "Intégrations", "Tarification", "Sécurité"],
        resources: ["Documentation", "Études de cas", "Blog", "Statut"],
        company: ["À propos", "Carrières", "Contact", "Partenaires"]
    }
};

const sectionTitles = {
    en: { product: "Product", resources: "Resources", company: "Company" },
    ar: { product: "المنتج", resources: "المصادر", company: "الشركة" },
    fr: { product: "Produit", resources: "Ressources", company: "Entreprise" }
};

export function LandingFooter({ lang }: { lang: LandingLanguage }) {
    const t = i18n[lang];
    const isRtl = lang === "ar";
    const l = links[lang];
    const s = sectionTitles[lang];

    return (
        <footer className={`bg-white border-t border-slate-200 py-16 ${isRtl ? 'rtl' : ''}`}>
            <div className="mx-auto max-w-7xl px-6">
                <div className="grid grid-cols-2 md:grid-cols-5 gap-12">
                    {/* Brand */}
                    <div className="col-span-2">
                        <Link to="/" aria-label="Ecom OS home" className="mb-5 inline-flex">
                            <img src={ecomosLogo} alt="Ecom OS" width={137} height={32} className="h-8 w-auto" />
                        </Link>
                        <p className="text-slate-500 text-sm leading-relaxed max-w-xs">
                            {t.footer.desc}
                        </p>
                    </div>

                    {/* Product Links */}
                    <div>
                        <h3 className="text-sm font-bold text-slate-900 mb-4">{s.product}</h3>
                        <ul className="space-y-3">
                            {l.product.map(link => (
                                <li key={link}>
                                    <a href="#" className="text-sm text-slate-500 hover:text-slate-900 transition-colors">{link}</a>
                                </li>
                            ))}
                        </ul>
                    </div>

                    {/* Resources Links */}
                    <div>
                        <h3 className="text-sm font-bold text-slate-900 mb-4">{s.resources}</h3>
                        <ul className="space-y-3">
                            {l.resources.map(link => (
                                <li key={link}>
                                    <a href="#" className="text-sm text-slate-500 hover:text-slate-900 transition-colors">{link}</a>
                                </li>
                            ))}
                        </ul>
                    </div>

                    {/* Company Links */}
                    <div>
                        <h3 className="text-sm font-bold text-slate-900 mb-4">{s.company}</h3>
                        <ul className="space-y-3">
                            {l.company.map(link => (
                                <li key={link}>
                                    <a href="#" className="text-sm text-slate-500 hover:text-slate-900 transition-colors">{link}</a>
                                </li>
                            ))}
                        </ul>
                    </div>
                </div>

                <div className="mt-12 pt-8 border-t border-slate-100 flex flex-col sm:flex-row justify-between items-center gap-4">
                    <p className="text-xs text-slate-400">{t.footer.rights}</p>
                    <div className="flex items-center gap-6">
                        <Link to="/privacy" className="text-xs text-slate-400 hover:text-slate-600 transition-colors">Privacy Policy</Link>
                        <Link to="/terms" className="text-xs text-slate-400 hover:text-slate-600 transition-colors">Terms of Service</Link>
                    </div>
                </div>
            </div>
        </footer>
    );
}
