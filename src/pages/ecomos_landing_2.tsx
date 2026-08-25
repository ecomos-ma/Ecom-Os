import { useState, useEffect, useRef } from "react";
import { Link } from "react-router-dom";
import {
  Package, ShoppingBag, Link2, BarChart3, Truck, TrendingUp, Users, Star, Zap, Play,
  Shield, Eye, Globe, Layout, FileSpreadsheet, Calculator,
  MessageSquare, Smartphone, Store, ShoppingCart, BadgeCheck, MapPin, Wallet, Sparkles,
  Rocket, Check, ChevronRight, Menu, X, ClipboardList, Boxes, ArrowUpRight, PieChart,
  LineChart, Target, DollarSign, Lock, Bell, Activity, Send, BarChart4, Receipt, Heart,
  Clock, RefreshCw
} from "lucide-react";
import { t, Language } from "./landingTranslations";

const useInView = (threshold = 0.15) => {
  const ref = useRef<HTMLDivElement>(null);
  const [inView, setInView] = useState(false);
  useEffect(() => {
    const obs = new IntersectionObserver(([e]) => { if (e.isIntersecting) setInView(true); }, { threshold });
    if (ref.current) obs.observe(ref.current);
    return () => obs.disconnect();
  }, [threshold]);
  return [ref, inView] as const;
};

const EcomOSMark = ({ size = 20, color = "#fff" }) => (
  <svg width={size} height={size * (280 / 569)} viewBox="0 0 569 280" xmlns="http://www.w3.org/2000/svg">
    <g transform="translate(0.000000,280.000000) scale(0.100000,-0.100000)" fill={color} stroke="none">
      <path d="M615 2556 c-95 -30 -138 -85 -138 -177 0 -49 5 -67 35 -116 20 -32 64 -128 98 -213 34 -85 155 -378 268 -650 112 -272 235 -567 271 -655 36 -88 78 -181 93 -207 67 -113 199 -222 334 -275 62 -25 82 -27 194 -27 117 -1 130 1 202 30 97 40 188 104 270 193 77 83 91 103 204 296 126 217 201 281 358 308 115 19 262 -36 345 -129 20 -23 79 -116 131 -205 141 -243 211 -324 355 -412 107 -65 164 -81 300 -81 107 0 127 3 187 26 123 49 239 137 315 241 20 27 53 89 74 138 61 139 420 1006 535 1289 57 140 112 269 121 285 9 17 27 50 40 74 59 114 -1 243 -125 270 -104 22 -204 -40 -235 -146 -17 -57 -201 -510 -482 -1185 -133 -318 -214 -502 -235 -528 -49 -62 -122 -100 -193 -100 -123 0 -197 69 -353 330 -159 266 -275 380 -458 454 -66 26 -210 56 -271 56 -64 0 -202 -30 -274 -59 -188 -78 -291 -180 -451 -446 -159 -265 -234 -335 -360 -335 -73 0 -126 26 -179 86 -36 41 -66 104 -183 384 -299 718 -540 1306 -545 1335 -14 71 -67 129 -137 150 -58 17 -59 17 -111 1z" />
    </g>
  </svg>
);

const EcomOSLogo = ({ mark = "#fff", text = "#fff", size = 20, lang }: { mark?: string, text?: string, size?: number, lang: Language }) => {
  const box = Math.round(size * 1.8);
  const fontFam = lang === 'ar' ? "'Space Grotesk','Tajawal',sans-serif" : "'Space Grotesk',sans-serif";
  return (
    <div style={{ display: "flex", alignItems: "center", gap: "10px" }}>
      <div style={{ width: box, height: box, background: "linear-gradient(135deg,#DD4672,#7A1D3B)", borderRadius: box * 0.28, display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0 }}>
        <EcomOSMark size={size} color={mark} />
      </div>
      <span style={{ fontWeight: 700, fontSize: `${size * 0.06 + 1}rem`, color: text, fontFamily: fontFam }}>EcomOS</span>
    </div>
  );
};

const AnimatedCounter = ({ target, suffix = "", lang }: { target: number, suffix?: string, lang: Language }) => {
  const [count, setCount] = useState(0);
  const [ref, inView] = useInView();
  useEffect(() => {
    if (!inView) return;
    let start = 0;
    const step = target / 60;
    const timer = setInterval(() => {
      start += step;
      if (start >= target) { setCount(target); clearInterval(timer); }
      else setCount(Math.floor(start));
    }, 16);
    return () => clearInterval(timer);
  }, [inView, target]);
  return <span ref={ref}>{count.toLocaleString(lang === 'ar' ? "ar-MA" : "en-US")}{suffix}</span>;
};

export default function EcomOSLanding() {
  const [lang, setLang] = useState<Language>('ar'); // Default to arabic initially
  const dict = t[lang];

  const toggleLanguage = () => {
    setLang(prev => (prev === 'ar' ? 'en' : 'ar'));
  };

  const [activeFeature, setActiveFeature] = useState(0);
  const [scrollY, setScrollY] = useState(0);
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);

  useEffect(() => {
    const onScroll = () => setScrollY(window.scrollY);
    window.addEventListener("scroll", onScroll);
    return () => window.removeEventListener("scroll", onScroll);
  }, []);

  // Use dynamic translation mapping
  const featuresData = [
    { icon: Package, color: "#DD4672", gradient: "linear-gradient(135deg, #FCE9EF 0%, #FADCE5 100%)", detailIcons: [ClipboardList, RefreshCw, DollarSign, Bell] },
    { icon: ShoppingBag, color: "#EC5C87", gradient: "linear-gradient(135deg, #FDF3F6 0%, #F6C7D6 100%)", detailIcons: [Boxes, BarChart4, DollarSign, Store] },
    { icon: Link2, color: "#DD4672", gradient: "linear-gradient(135deg, #FCE9EF 0%, #FADCE5 100%)", detailIcons: [ShoppingCart, Store, ShoppingBag, RefreshCw] },
    { icon: FileSpreadsheet, color: "#EC5C87", gradient: "linear-gradient(135deg, #FDF3F6 0%, #F6C7D6 100%)", detailIcons: [FileSpreadsheet, BarChart3, Zap, Clock] },
    { icon: Truck, color: "#DD4672", gradient: "linear-gradient(135deg, #FCE9EF 0%, #FADCE5 100%)", detailIcons: [Truck, Receipt, MapPin, RefreshCw] },
    { icon: TrendingUp, color: "#EC5C87", gradient: "linear-gradient(135deg, #FDF3F6 0%, #F6C7D6 100%)", detailIcons: [Target, PieChart, LineChart, ArrowUpRight] },
    { icon: Users, color: "#DD4672", gradient: "linear-gradient(135deg, #FCE9EF 0%, #FADCE5 100%)", detailIcons: [Users, Lock, Activity, Send] },
  ];

  const statsValues = [
    { value: 5000, suffix: "+", icon: Users },
    { value: 2000000, suffix: "+", icon: Package },
    { value: 98, suffix: "%", icon: Star },
    { value: 120, suffix: "+", icon: Store },
  ];

  const integrations = [
    { icon: ShoppingCart, name: "WooCommerce" }, { icon: Store, name: "Shopify" },
    { icon: ShoppingBag, name: "Youcan" }, { icon: FileSpreadsheet, name: "Google Sheets" },
    { icon: Truck, name: "Maystro" }, { icon: Package, name: "Zid" },
    { icon: Globe, name: "J&T Express" }, { icon: Link2, name: "AMANA" },
    { icon: MessageSquare, name: "WhatsApp API" }, { icon: Smartphone, name: "TikTok Shop" },
    { icon: Layout, name: "Salla" }, { icon: Wallet, name: "Noqodi" },
  ];

  const [heroRef, heroInView] = useInView(0.1);
  const [statsRef, statsInView] = useInView(0.2);
  const [featRef, featInView] = useInView(0.1);

  const navScrolled = scrollY > 30;
  const isRtl = lang === 'ar';
  const fontFamilyString = isRtl ? "'Tajawal', 'Cairo', sans-serif" : "'Inter', system-ui, sans-serif";

  return (
    <div dir={isRtl ? "rtl" : "ltr"} style={{ fontFamily: fontFamilyString, background: "#ffffff", color: "#1F1417", overflowX: "hidden", minHeight: "100vh", transition: "direction 0.3s ease" }}>
      <style>{`
        @import url('https://fonts.googleapis.com/css2?family=Tajawal:wght@300;400;500;700;800;900&family=Cairo:wght@300;400;600;700;900&family=Space+Grotesk:wght@500;600;700&family=Inter:wght@400;500;600;700&family=JetBrains+Mono:wght@400;500&display=swap');
        
        *, *::before, *::after { box-sizing: border-box; margin: 0; padding: 0; }
        html { scroll-behavior: smooth; }
        ::-webkit-scrollbar { width: 6px; }
        ::-webkit-scrollbar-track { background: #FDF3F6; }
        ::-webkit-scrollbar-thumb { background: #EC5C87; border-radius: 3px; }

        .hero-title { font-family: ${isRtl ? "'Space Grotesk', 'Tajawal', sans-serif" : "'Space Grotesk', 'Inter', sans-serif"}; font-size: clamp(2.2rem, 5vw, 5rem); font-weight: 700; line-height: 1.15; letter-spacing: -0.5px; }
        .glow-text { background: linear-gradient(135deg, #DD4672 0%, #EC5C87 100%); -webkit-background-clip: text; -webkit-text-fill-color: transparent; background-clip: text; }
        .section-title { font-family: ${isRtl ? "'Space Grotesk', 'Tajawal', sans-serif" : "'Space Grotesk', 'Inter', sans-serif"}; font-size: clamp(1.8rem, 3.5vw, 3rem); font-weight: 700; line-height: 1.2; }

        .btn-primary { background: linear-gradient(135deg, #DD4672, #EC5C87); color: #fff; border: none; border-radius: 50px; padding: 16px 36px; font-size: 1rem; font-weight: 800; font-family: inherit; cursor: pointer; transition: all 0.3s ease; box-shadow: 0 8px 24px rgba(221,70,114,0.35); display: inline-flex; align-items: center; gap: 8px; justify-content: center; text-decoration: none; }
        .btn-primary:hover { transform: translateY(-3px) scale(1.03); box-shadow: 0 16px 40px rgba(221,70,114,0.5); }

        .btn-outline { background: transparent; color: #DD4672; border: 2px solid #EC5C87; border-radius: 50px; padding: 14px 30px; font-size: 0.95rem; font-weight: 700; font-family: inherit; cursor: pointer; transition: all 0.3s ease; display: inline-flex; align-items: center; gap: 8px; justify-content: center; text-decoration: none; }
        .btn-outline:hover { background: #FDF3F6; border-color: #DD4672; transform: translateY(-2px); }

        .lang-toggle { background: #FDF3F6; color: #7A1D3B; border: 1.5px solid #FADCE5; border-radius: 50px; padding: 6px 14px; font-size: 0.85rem; font-weight: 700; font-family: 'Inter', sans-serif; cursor: pointer; transition: all 0.3s ease; display: flex; align-items: center; gap: 6px; }
        .lang-toggle:hover { background: #FCE9EF; border-color: #EC5C87; transform: scale(1.05); }

        .nav-link { color: #4A2530; text-decoration: none; font-weight: 600; font-size: 1rem; transition: color 0.2s; cursor: pointer; font-family: inherit; }
        .nav-link:hover { color: #DD4672; }

        .card-white { background: #ffffff; border: 1.5px solid #F5DCE4; border-radius: 24px; transition: all 0.4s ease; box-shadow: 0 2px 16px rgba(221,70,114,0.06); }
        .card-white:hover { border-color: #EC5C87; transform: translateY(-4px); box-shadow: 0 16px 48px rgba(221,70,114,0.14); }

        .card-green { background: #FDF3F6; border: 1.5px solid #FADCE5; border-radius: 24px; transition: all 0.4s ease; }
        .card-green:hover { border-color: #EC5C87; box-shadow: 0 12px 40px rgba(221,70,114,0.12); transform: translateY(-3px); }

        .badge { background: #FCE9EF; border: 1.5px solid #EBB4C6; border-radius: 50px; padding: 8px 20px; font-size: 0.85rem; font-weight: 700; color: #7A1D3B; display: inline-flex; align-items: center; gap: 6px; }

        .grid-bg { background-image: linear-gradient(rgba(221,70,114,0.04) 1px, transparent 1px), linear-gradient(90deg, rgba(221,70,114,0.04) 1px, transparent 1px); background-size: 60px 60px; }

        .feature-tab { background: #FDF7F9; border: 1.5px solid #F3D3DF; border-radius: 16px; padding: 16px 20px; cursor: pointer; transition: all 0.3s ease; text-align: ${isRtl ? 'right' : 'left'}; }
        .feature-tab.active { background: #FCE9EF; border-color: #EC5C87; box-shadow: 0 4px 20px rgba(221,70,114,0.12); }
        .feature-tab:hover { background: #FCE9EF; border-color: #EC5C87; }

        .stat-number { font-size: clamp(2rem, 4vw, 3.5rem); font-weight: 900; background: linear-gradient(135deg, #7A1D3B, #EC5C87); -webkit-background-clip: text; -webkit-text-fill-color: transparent; background-clip: text; font-family: 'Space Grotesk', sans-serif;}

        .testimonial-card { background: #fff; border: 1.5px solid #F6DDE6; border-radius: 24px; padding: 28px; transition: all 0.4s; box-shadow: 0 2px 12px rgba(221,70,114,0.06); }
        .testimonial-card:hover { border-color: #EC5C87; box-shadow: 0 16px 48px rgba(221,70,114,0.13); transform: translateY(-4px); }

        .avatar { width: 52px; height: 52px; background: linear-gradient(135deg, #DD4672, #EC5C87); border-radius: 50%; display: flex; align-items: center; justify-content: center; font-size: 1.3rem; font-weight: 800; color: #fff; flex-shrink: 0; }

        .integration-logo { background: #FDF7F9; border: 1.5px solid #F3D3DF; border-radius: 16px; padding: 16px 24px; font-size: 0.95rem; font-weight: 700; color: #4A2530; text-align: center; transition: all 0.3s; display: flex; align-items: center; gap: 10px; justify-content: center; }
        .integration-logo:hover { border-color: #EC5C87; color: #7A1D3B; background: #FCE9EF; transform: translateY(-3px); box-shadow: 0 8px 24px rgba(221,70,114,0.1); }

        @keyframes float { 0%,100% { transform: translateY(0px); } 50% { transform: translateY(-10px); } }
        @keyframes pulse-glow { 0%,100% { box-shadow: 0 8px 24px rgba(221,70,114,0.35); } 50% { box-shadow: 0 16px 48px rgba(221,70,114,0.6); } }
        @keyframes scroll-x { 0% { transform: translateX(0); } 100% { transform: translateX(${isRtl ? '50%' : '-50%'}); } }
        @keyframes shimmer { 0% { background-position: -200% center; } 100% { background-position: 200% center; } }

        .float { animation: float 6s ease-in-out infinite; }
        .pulse-glow { animation: pulse-glow 3s ease-in-out infinite; }
        .ticker-track { display: flex; animation: scroll-x 22s linear infinite; width: max-content; }
        .shimmer-line { background: linear-gradient(90deg, rgba(221,70,114,0.08) 0%, rgba(236,92,135,0.35) 50%, rgba(221,70,114,0.08) 100%); background-size: 200% auto; animation: shimmer 3s linear infinite; height: 1.5px; width: 100%; }
        .slide-up { opacity: 0; transform: translateY(40px); transition: all 0.8s cubic-bezier(0.16,1,0.3,1); }
        .slide-up.visible { opacity: 1; transform: translateY(0); }
        .fade-in { opacity: 0; transition: opacity 0.9s ease; }
        .fade-in.visible { opacity: 1; }

        .icon-grid { display: grid; grid-template-columns: 1fr 1fr; gap: 12px; }
        .icon-grid-item { background: rgba(255,255,255,0.7); border: 1.5px solid rgba(221,70,114,0.2); border-radius: 14px; padding: 16px 14px; display: flex; align-items: center; gap: 10px; transition: all 0.3s; }
        .icon-grid-item:hover { border-color: #EC5C87; background: rgba(255,255,255,0.95); transform: translateY(-2px); }

        .cta-section { background: linear-gradient(135deg, #EC5C87 0%, #DD4672 45%, #7A1D3B 130%); border-radius: 32px; padding: 72px 48px; text-align: center; position: relative; overflow: hidden; box-shadow: 0 24px 80px rgba(221,70,114,0.35); }
        .cta-section::before { content: ''; position: absolute; inset: 0; background: radial-gradient(ellipse at 30% 50%, rgba(255,255,255,0.18) 0%, transparent 60%); }

        .hero-badge-float { position: absolute; border-radius: 14px; padding: 11px 16px; font-weight: 800; font-size: 0.88rem; font-family: inherit; box-shadow: 0 8px 28px rgba(0,0,0,0.1); backdrop-filter: blur(12px); display: flex; align-items: center; gap: 8px; }

        .mobile-nav { display: none; position: fixed; top: 72px; left: 0; right: 0; background: rgba(255,255,255,0.98); backdrop-filter: blur(20px); border-bottom: 1px solid #F5DCE4; padding: 20px 5%; z-index: 99; flex-direction: column; gap: 16px; }
        .mobile-nav.open { display: flex; }

        @media (max-width: 900px) {
          .features-inner { grid-template-columns: 1fr !important; }
          .pl-grid { grid-template-columns: 1fr !important; }
          .team-grid { grid-template-columns: 1fr !important; }
          .testimonials-grid { grid-template-columns: 1fr !important; }
        }
        @media (max-width: 768px) {
          .stats-grid { grid-template-columns: 1fr 1fr !important; }
          .nav-desktop { display: none !important; }
          .mobile-menu-btn { display: flex !important; }
          .hero-btns { flex-direction: column !important; align-items: stretch !important; }
          .footer-grid { grid-template-columns: 1fr 1fr !important; }
          .cta-section { padding: 48px 24px !important; }
          .hero-badges { display: none !important; }
          .dash-grid { grid-template-columns: 1fr 1fr !important; }
        }
      `}</style>

      {/* ══ NAVBAR ══ */}
      <nav style={{
        position: "fixed", top: 0, left: 0, right: 0, zIndex: 100,
        padding: "0 5%", height: "72px",
        display: "flex", alignItems: "center", justifyContent: "space-between",
        background: navScrolled ? "rgba(255,255,255,0.95)" : "transparent",
        backdropFilter: navScrolled ? "blur(20px)" : "none",
        borderBottom: navScrolled ? "1px solid #F5DCE4" : "none",
        transition: "all 0.4s ease",
        boxShadow: navScrolled ? "0 2px 20px rgba(221,70,114,0.08)" : "none",
      }}>
        <EcomOSLogo text="#7A1D3B" lang={lang} />

        <div className="nav-desktop" style={{ display: "flex", gap: "36px", alignItems: "center" }}>
          <a href="#features" className="nav-link">{dict.nav.features}</a>
          <a href="#integrations" className="nav-link">{dict.nav.integrations}</a>
          <a href="#testimonials" className="nav-link">{dict.nav.testimonials}</a>
        </div>

        <div style={{ display: "flex", gap: "12px", alignItems: "center" }}>
          <button onClick={toggleLanguage} className="lang-toggle" title="Switch Language">
            <Globe size={14} /> {lang === 'ar' ? 'EN' : 'عربي'}
          </button>
          <a href="/login" className="btn-outline hidden md:inline-flex" style={{ padding: "10px 22px", fontSize: "0.9rem" }}>{dict.nav.login}</a>
          <a href="/login" className="btn-primary" style={{ padding: "10px 22px", fontSize: "0.9rem" }}>{dict.nav.startFree}</a>

          <button
            className="mobile-menu-btn"
            onClick={() => setMobileMenuOpen(!mobileMenuOpen)}
            style={{ display: "none", background: "none", border: "none", cursor: "pointer", padding: "4px" }}
          >
            {mobileMenuOpen ? <X size={24} color="#7A1D3B" /> : <Menu size={24} color="#7A1D3B" />}
          </button>
        </div>
      </nav>

      {/* Mobile nav */}
      <div className={`mobile-nav ${mobileMenuOpen ? "open" : ""}`}>
        <a href="#features" className="nav-link" onClick={() => setMobileMenuOpen(false)}>{dict.nav.features}</a>
        <a href="#integrations" className="nav-link" onClick={() => setMobileMenuOpen(false)}>{dict.nav.integrations}</a>
        <a href="#testimonials" className="nav-link" onClick={() => setMobileMenuOpen(false)}>{dict.nav.testimonials}</a>
        <a href="/login" className="nav-link" onClick={() => setMobileMenuOpen(false)}>{dict.nav.login}</a>
      </div>

      {/* ══ HERO ══ */}
      <section ref={heroRef as React.RefObject<HTMLDivElement>} className="grid-bg" style={{
        minHeight: "100vh", display: "flex", flexDirection: "column",
        alignItems: "center", justifyContent: "center",
        padding: "130px 5% 80px", position: "relative", textAlign: "center",
        background: "linear-gradient(180deg, #FDF3F6 0%, #ffffff 60%)",
      }}>
        <div style={{ position: "absolute", width: 600, height: 600, borderRadius: "50%", background: "radial-gradient(circle, rgba(236,92,135,0.1) 0%, transparent 70%)", top: "5%", left: "50%", transform: "translateX(-50%)", pointerEvents: "none" }} />

        <div className={`slide-up ${heroInView ? "visible" : ""}`} style={{ position: "relative", zIndex: 1, maxWidth: "900px" }}>
          <div className="badge" style={{ marginBottom: "28px" }}>
            <MapPin size={14} /> {dict.hero.badge}
          </div>
          <h1 className="hero-title" style={{ marginBottom: "24px", color: "#1F1417" }}>
            {dict.hero.titlePart1}<br />
            <span className="glow-text">{dict.hero.titlePart2}</span>
          </h1>
          <p style={{ fontSize: "clamp(1rem,2vw,1.25rem)", color: "#6B4650", maxWidth: "640px", margin: "0 auto 44px", lineHeight: 1.85, fontWeight: 400 }}>
            {dict.hero.subtitle}
          </p>
          <div className="hero-btns" style={{ display: "flex", gap: "16px", justifyContent: "center", flexWrap: "wrap" }}>
            <Link to="/login" className="btn-primary pulse-glow" style={{ fontSize: "1.05rem", padding: "18px 44px" }}>
              <Rocket size={20} /> {dict.hero.ctaPrimary}
            </Link>
            <a href="#features" className="btn-outline" style={{ fontSize: "1rem" }}>
              <Play size={17} /> {dict.hero.ctaSecondary}
            </a>
          </div>
          <p style={{ marginTop: "20px", color: "#9C7680", fontSize: "0.88rem", display: "flex", alignItems: "center", justifyContent: "center", gap: "20px", flexWrap: "wrap" }}>
            <span style={{ display: "flex", alignItems: "center", gap: "4px" }}><Check size={13} color="#DD4672" /> {dict.hero.check1}</span>
            <span style={{ display: "flex", alignItems: "center", gap: "4px" }}><Check size={13} color="#DD4672" /> {dict.hero.check2}</span>
            <span style={{ display: "flex", alignItems: "center", gap: "4px" }}><Check size={13} color="#DD4672" /> {dict.hero.check3}</span>
          </p>
        </div>

        {/* Dashboard mockup */}
        <div className={`float fade-in ${heroInView ? "visible" : ""}`} style={{ position: "relative", zIndex: 1, marginTop: "56px", width: "100%", maxWidth: "960px", transition: "opacity 1s ease 0.4s" }}>
          <div style={{ background: "linear-gradient(135deg, #FDF7F9, #fff)", border: "1.5px solid #F5DCE4", borderRadius: "24px", padding: "36px", boxShadow: "0 24px 64px rgba(221,70,114,0.12), 0 4px 16px rgba(0,0,0,0.05)" }}>
            <div className="dash-grid" style={{ display: "grid", gridTemplateColumns: "repeat(4,1fr)", gap: "14px", marginBottom: "20px" }}>
              {[
                { icon: Package, label: dict.dashStats.orders, value: "247", color: "#DD4672" },
                { icon: DollarSign, label: dict.dashStats.sales, value: "12,450", color: "#EC5C87" },
                { icon: Truck, label: dict.dashStats.delivery, value: "89", color: "#7A1D3B" },
                { icon: Star, label: dict.dashStats.rating, value: "4.8", color: "#EC5C87" },
              ].map((item, i) => {
                const ItemIcon = item.icon;
                return (
                  <div key={i} style={{ background: "#fff", border: "1.5px solid #F5DCE4", borderRadius: "14px", padding: "18px", textAlign: "center" }}>
                    <ItemIcon size={26} color={item.color} style={{ marginBottom: "6px" }} />
                    <div style={{ fontSize: "1.4rem", fontWeight: 900, color: "#1F1417" }}>{item.value}</div>
                    <div style={{ fontSize: "0.8rem", color: "#9C7680", marginTop: "3px" }}>{item.label}</div>
                  </div>
                );
              })}
            </div>
            <div style={{ background: "#FDF7F9", border: "1.5px solid #F3D3DF", borderRadius: "14px", padding: "28px", display: "flex", alignItems: "center", justifyContent: "center", gap: "32px", flexWrap: "wrap" }}>
              <BarChart3 size={44} color="#DD4672" opacity={0.25} />
              <LineChart size={44} color="#EC5C87" opacity={0.25} />
              <PieChart size={44} color="#7A1D3B" opacity={0.25} />
              <Activity size={44} color="#EC5C87" opacity={0.25} />
            </div>
          </div>

          <div className="hero-badges">
            <div className="hero-badge-float" style={{ top: "-16px", right: isRtl ? "-12px" : "auto", left: !isRtl ? "-12px" : "auto", background: "linear-gradient(135deg,#DD4672,#EC5C87)", color: "#fff" }}>
              <Package size={16} /> {dict.dashBadges.top}
            </div>
            <div className="hero-badge-float" style={{ bottom: "24px", left: isRtl ? "-12px" : "auto", right: !isRtl ? "-12px" : "auto", background: "rgba(255,255,255,0.96)", border: "1.5px solid #FADCE5", color: "#7A1D3B" }}>
              <BadgeCheck size={16} /> {dict.dashBadges.bottom}
            </div>
          </div>
        </div>

        <div className="shimmer-line" style={{ marginTop: "72px", maxWidth: "800px", width: "100%" }} />
      </section>

      {/* ══ TICKER ══ */}
      <div style={{ background: "#FDF3F6", borderTop: "1px solid #F6C7D6", borderBottom: "1px solid #F6C7D6", padding: "13px 0", overflow: "hidden" }}>
        <div className="ticker-track">
          {["WooCommerce", "Shopify", "Youcan", "Maystro", "Zid", "J&T Express", "AMANA", "Google Sheets", "WhatsApp API", "WooCommerce", "Shopify", "Youcan", "Maystro", "Zid", "J&T Express", "AMANA", "Google Sheets", "WhatsApp API"].map((t, i) => (
            <span key={i} style={{ padding: "0 36px", color: "#7A1D3B", fontWeight: 700, fontSize: "0.92rem", whiteSpace: "nowrap", display: "inline-flex", alignItems: "center", gap: "6px", fontFamily: '"Courier New", Courier, monospace' }}>
              <Zap size={13} color="#EC5C87" /> {t}
            </span>
          ))}
        </div>
      </div>

      {/* ══ STATS ══ */}
      <section ref={statsRef as React.RefObject<HTMLElement>} style={{ padding: "90px 5%", background: "#fff" }}>
        <div className="stats-grid" style={{ display: "grid", gridTemplateColumns: "repeat(4,1fr)", gap: "20px", maxWidth: "1100px", margin: "0 auto" }}>
          {statsValues.map((s, i) => {
            const StatIcon = s.icon;
            return (
              <div key={i} className="card-white" style={{ padding: "36px 20px", textAlign: "center" }}>
                <StatIcon size={26} color="#DD4672" style={{ margin: "0 auto 10px auto", opacity: 0.7 }} />
                <div className="stat-number">
                  {statsInView ? <AnimatedCounter target={s.value} suffix={s.suffix} lang={lang} /> : "0"}
                </div>
                <div style={{ color: "#7A4A56", marginTop: "6px", fontSize: "0.95rem", fontWeight: 600 }}>{dict.stats[i].label}</div>
              </div>
            );
          })}
        </div>
      </section>

      {/* ══ FEATURES ══ */}
      <section id="features" ref={featRef as React.RefObject<HTMLElement>} style={{ padding: "72px 5% 100px", background: "#FDF7F9" }}>
        <div style={{ maxWidth: "1200px", margin: "0 auto" }}>
          <div style={{ textAlign: "center", marginBottom: "64px" }}>
            <div className="badge" style={{ marginBottom: "18px" }}><Layout size={13} /> {dict.featuresIntro.badge}</div>
            <h2 className={`section-title slide-up ${featInView ? "visible" : ""}`}>
              {dict.featuresIntro.title1}<br /><span className="glow-text">{dict.featuresIntro.title2}</span>
            </h2>
          </div>
          <div className="features-inner" style={{ display: "grid", gridTemplateColumns: "1fr 2fr", gap: "24px", alignItems: "start" }}>
            <div style={{ display: "flex", flexDirection: "column", gap: "8px" }}>
              {dict.features.map((f, i) => {
                const FIcon = featuresData[i].icon;
                return (
                  <div key={i} className={`feature-tab ${activeFeature === i ? "active" : ""}`} onClick={() => setActiveFeature(i)}>
                    <div style={{ display: "flex", alignItems: "center", gap: "11px" }}>
                      <FIcon size={20} color={activeFeature === i ? "#7A1D3B" : "#DD4672"} />
                      <span style={{ fontWeight: 700, fontSize: "0.93rem", color: activeFeature === i ? "#7A1D3B" : "#4A2530" }}>{f.title}</span>
                    </div>
                  </div>
                );
              })}
            </div>
            <div style={{ position: "sticky", top: "90px" }}>
              {(() => {
                const AF = dict.features[activeFeature];
                const Meta = featuresData[activeFeature];
                const AIcon = Meta.icon;
                return (
                  <div className="card-white" style={{ padding: "36px", background: Meta.gradient }}>
                    <div style={{ display: "flex", alignItems: "center", gap: "14px", marginBottom: "20px" }}>
                      <div style={{ width: 58, height: 58, borderRadius: "18px", background: "rgba(255,255,255,0.8)", display: "flex", alignItems: "center", justifyContent: "center", border: "2px solid " + Meta.color }}>
                        <AIcon size={30} color={Meta.color} />
                      </div>
                      <h3 style={{ fontSize: "1.6rem", fontWeight: 800, color: Meta.color }}>{AF.title}</h3>
                    </div>
                    <p style={{ color: "#6B4650", lineHeight: 1.9, fontSize: "1rem", marginBottom: "24px" }}>{AF.desc}</p>
                    <div className="icon-grid">
                      {AF.details.map((d, idx) => {
                        const DIcon = Meta.detailIcons[idx % Meta.detailIcons.length];
                        return (
                          <div key={idx} className="icon-grid-item">
                            <DIcon size={18} color={Meta.color} />
                            <span style={{ fontWeight: 600, fontSize: "0.88rem", color: "#4A2530" }}>{d}</span>
                          </div>
                        );
                      })}
                    </div>
                  </div>
                );
              })()}
            </div>
          </div>
        </div>
      </section>

      {/* ══ INTEGRATIONS ══ */}
      <section id="integrations" style={{ padding: "90px 5%", background: "#fff" }}>
        <div style={{ maxWidth: "1100px", margin: "0 auto", textAlign: "center" }}>
          <div className="badge" style={{ marginBottom: "18px" }}><Link2 size={13} /> {dict.integrationsIntro.badge}</div>
          <h2 className="section-title" style={{ marginBottom: "14px" }}>
            {dict.integrationsIntro.title1} <span className="glow-text">{dict.integrationsIntro.titleGlow}</span>
          </h2>
          <p style={{ color: "#7A4A56", marginBottom: "48px", fontSize: "1.05rem" }}>{dict.integrationsIntro.subtitle}</p>
          <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill,minmax(170px,1fr))", gap: "12px" }}>
            {integrations.map((item, i) => {
              const IIcon = item.icon;
              return (
                <div key={i} className="integration-logo">
                  <IIcon size={18} color="#DD4672" /> {item.name}
                </div>
              );
            })}
          </div>
        </div>
      </section>

      {/* ══ P&L ══ */}
      <section style={{ padding: "90px 5%", background: "#FDF7F9" }}>
        <div className="pl-grid" style={{ maxWidth: "1100px", margin: "0 auto", display: "grid", gridTemplateColumns: "1fr 1fr", gap: "56px", alignItems: "center" }}>
          <div>
            <div className="badge" style={{ marginBottom: "18px" }}><Calculator size={13} /> {dict.pl.badge}</div>
            <h2 className="section-title" style={{ marginBottom: "20px" }}>
              {dict.pl.title1} <span className="glow-text">{dict.pl.titleGlow}</span><br />{dict.pl.title2}
            </h2>
            <p style={{ color: "#6B4650", lineHeight: 2, fontSize: "1rem", marginBottom: "32px" }}>
              {dict.pl.subtitle}
            </p>
            <div style={{ display: "flex", flexDirection: "column", gap: "12px" }}>
              {[
                { icon: Target, label: dict.pl.features[0] },
                { icon: PieChart, label: dict.pl.features[1] },
                { icon: ArrowUpRight, label: dict.pl.features[2] },
                { icon: Bell, label: dict.pl.features[3] },
              ].map((item, i) => {
                const IIcon = item.icon;
                return (
                  <div key={i} style={{ display: "flex", alignItems: "center", gap: "12px" }}>
                    <div style={{ width: 26, height: 26, borderRadius: "50%", background: "linear-gradient(135deg,#DD4672,#EC5C87)", display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0 }}>
                      <IIcon size={13} color="#fff" />
                    </div>
                    <span style={{ color: "#4A2530", fontWeight: 600, fontSize: "0.95rem" }}>{item.label}</span>
                  </div>
                );
              })}
            </div>
          </div>
          <div className="card-white" style={{ padding: "40px", background: "linear-gradient(135deg,#FDF7F9,#FCE9EF)", height: "380px", display: "flex", flexDirection: "column", gap: "20px", justifyContent: "center" }}>
            <div style={{ textAlign: "center" }}>
              <Target size={44} color="#DD4672" style={{ margin: "0 auto 10px auto" }} />
              <div style={{ fontSize: "1.8rem", fontWeight: 900, color: "#7A1D3B" }}>{dict.pl.cardTitle}</div>
              <div style={{ color: "#9C7680", fontSize: "0.88rem" }}>1,250 {dict.pl.cardUnit}</div>
            </div>
            <div className="shimmer-line" />
            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "10px" }}>
              {[
                { icon: DollarSign, label: dict.pl.metrics[0], value: "$45,000", color: "#DD4672" },
                { icon: Receipt, label: dict.pl.metrics[1], value: "$32,500", color: "#e74c3c" },
                { icon: TrendingUp, label: dict.pl.metrics[2], value: "$12,500", color: "#EC5C87" },
                { icon: Activity, label: dict.pl.metrics[3], value: "27.8%", color: "#7A1D3B" },
              ].map((item, idx) => {
                const IIcon = item.icon;
                return (
                  <div key={idx} style={{ background: "#fff", borderRadius: "12px", padding: "14px", textAlign: "center", border: "1.5px solid #F5DCE4" }}>
                    <IIcon size={18} color={item.color} style={{ margin: "0 auto 6px auto" }} />
                    <div style={{ fontWeight: 800, color: item.color, fontSize: "1rem", fontFamily: "'Inter', sans-serif" }}>{item.value}</div>
                    <div style={{ fontSize: "0.78rem", color: "#9C7680", marginTop: "3px" }}>{item.label}</div>
                  </div>
                );
              })}
            </div>
          </div>
        </div>
      </section>

      {/* ══ TEAM ══ */}
      <section style={{ padding: "90px 5%", background: "#fff" }}>
        <div className="team-grid" style={{ maxWidth: "1100px", margin: "0 auto", display: "grid", gridTemplateColumns: "1fr 1fr", gap: "56px", alignItems: "center" }}>
          <div className="card-white" style={{ padding: "40px", background: "linear-gradient(135deg,#FDF3F6,#ffffff)", height: "360px", display: "flex", flexDirection: "column", gap: "18px", justifyContent: "center" }}>
            <div style={{ display: "flex", gap: "14px", justifyContent: "center" }}>
              {["أ", "م", "س", "ك"].map((letter, idx) => (
                <div key={idx} className="avatar" style={{ width: idx === 0 ? 60 : 46, height: idx === 0 ? 60 : 46, fontSize: idx === 0 ? "1.4rem" : "1rem", opacity: idx === 0 ? 1 : 0.7 }}>{letter}</div>
              ))}
            </div>
            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "10px" }}>
              {[
                { icon: Lock, label: dict.team.roles[0], color: "#7A1D3B" },
                { icon: Shield, label: dict.team.roles[1], color: "#DD4672" },
                { icon: Users, label: dict.team.roles[2], color: "#EC5C87" },
                { icon: Eye, label: dict.team.roles[3], color: "#EC5C87" }
              ].map((role, idx) => {
                const RIcon = role.icon;
                return (
                  <div key={idx} style={{ background: "#FDF7F9", borderRadius: "12px", padding: "14px", border: "1.5px solid #F3D3DF", display: "flex", alignItems: "center", gap: "8px" }}>
                    <RIcon size={16} color={role.color} />
                    <span style={{ fontWeight: 600, fontSize: "0.88rem", color: "#4A2530" }}>{role.label}</span>
                  </div>
                );
              })}
            </div>
            <div style={{ background: "#FCE9EF", borderRadius: "12px", padding: "14px", textAlign: "center", border: "1.5px solid #FADCE5" }}>
              <Activity size={18} color="#DD4672" style={{ display: "inline-block", marginBottom: "3px" }} />
              <div style={{ fontWeight: 700, color: "#7A1D3B", fontSize: "0.88rem" }}>4 {dict.team.active}</div>
            </div>
          </div>
          <div>
            <div className="badge" style={{ marginBottom: "18px" }}><Users size={13} /> {dict.team.badge}</div>
            <h2 className="section-title" style={{ marginBottom: "20px" }}>
              {dict.team.title1} <span className="glow-text">{dict.team.titleGlow}</span>
            </h2>
            <p style={{ color: "#6B4650", lineHeight: 2, fontSize: "1rem", marginBottom: "28px" }}>
              {dict.team.subtitle}
            </p>
            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "12px" }}>
              {[
                { icon: Users, label: dict.team.features[0] },
                { icon: Shield, label: dict.team.features[1] },
                { icon: BarChart3, label: dict.team.features[2] },
                { icon: MessageSquare, label: dict.team.features[3] }
              ].map((item, i) => {
                const IIcon = item.icon;
                return (
                  <div key={i} className="card-green" style={{ padding: "16px 18px", display: "flex", alignItems: "center", gap: "10px" }}>
                    <IIcon size={20} color="#DD4672" />
                    <span style={{ fontWeight: 700, fontSize: "0.9rem", color: "#7A1D3B" }}>{item.label}</span>
                  </div>
                );
              })}
            </div>
          </div>
        </div>
      </section>

      {/* ══ TESTIMONIALS ══ */}
      <section id="testimonials" style={{ padding: "90px 5%", background: "#FDF7F9" }}>
        <div style={{ maxWidth: "1100px", margin: "0 auto" }}>
          <div style={{ textAlign: "center", marginBottom: "56px" }}>
            <div className="badge" style={{ marginBottom: "18px" }}><MessageSquare size={13} /> {dict.testimonialsIntro.badge}</div>
            <h2 className="section-title">{dict.testimonialsIntro.title1} <span className="glow-text">{dict.testimonialsIntro.titleGlow}</span></h2>
          </div>
          <div className="testimonials-grid" style={{ display: "grid", gridTemplateColumns: "repeat(3,1fr)", gap: "20px" }}>
            {dict.testimonials.map((t, i) => (
              <div key={i} className="testimonial-card">
                <div style={{ display: "flex", gap: "12px", alignItems: "center", marginBottom: "18px" }}>
                  <div className="avatar">{t.avatar}</div>
                  <div>
                    <div style={{ fontWeight: 700, fontSize: "0.97rem", color: "#1F1417" }}>{t.name}</div>
                    <div style={{ color: "#9C7680", fontSize: "0.82rem", marginTop: "2px" }}>{t.role}</div>
                  </div>
                </div>
                <div style={{ display: "flex", gap: "3px", marginBottom: "12px" }}>
                  {[...Array(5)].map((_, j) => <Star key={j} size={16} fill="#EC5C87" color="#EC5C87" />)}
                </div>
                <p style={{ color: "#6B4650", lineHeight: 1.85, fontSize: "0.93rem" }}>"{t.text}"</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* ══ CTA ══ */}
      <section style={{ padding: "72px 5% 100px", background: "#fff" }}>
        <div style={{ maxWidth: "880px", margin: "0 auto" }}>
          <div className="cta-section">
            <div style={{ position: "relative", zIndex: 1 }}>
              <div style={{ background: "rgba(255,255,255,0.2)", border: "1.5px solid rgba(255,255,255,0.4)", borderRadius: "50px", padding: "7px 18px", fontSize: "0.83rem", fontWeight: 700, color: "#fff", display: "inline-flex", alignItems: "center", gap: "6px", marginBottom: "22px" }}>
                <Sparkles size={13} color="#fff" /> {dict.cta.badge}
              </div>
              <h2 className="section-title" style={{ marginBottom: "18px", color: "#fff" }}>
                {dict.cta.title1}<br />{dict.cta.title2}
              </h2>
              <p style={{ color: "rgba(255,255,255,0.85)", marginBottom: "40px", fontSize: "1.05rem", lineHeight: 1.8 }}>
                {dict.cta.subtitle.split('\n').map((line, i) => <span key={i}>{line}<br /></span>)}
              </p>
              <div style={{ display: "flex", gap: "14px", justifyContent: "center", flexWrap: "wrap" }}>
                <a href="/login" style={{ background: "#fff", color: "#7A1D3B", border: "none", borderRadius: "50px", padding: "18px 48px", fontSize: "1.05rem", fontWeight: 800, fontFamily: "inherit", cursor: "pointer", textDecoration: "none", display: "inline-flex", alignItems: "center", gap: "8px", boxShadow: "0 8px 24px rgba(0,0,0,0.15)", transition: "all 0.3s" }}>
                  <Rocket size={20} /> {dict.cta.primary}
                </a>
                <a href="#features" style={{ background: "rgba(255,255,255,0.15)", color: "#fff", border: "2px solid rgba(255,255,255,0.6)", borderRadius: "50px", padding: "16px 32px", fontSize: "0.97rem", fontWeight: 700, fontFamily: "inherit", cursor: "pointer", textDecoration: "none", display: "inline-flex", alignItems: "center", gap: "8px", backdropFilter: "blur(10px)", transition: "all 0.3s" }}>
                  <ChevronRight size={17} /> {dict.cta.secondary}
                </a>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* ══ FOOTER ══ */}
      <footer style={{ borderTop: "1px solid #F5DCE4", padding: "48px 5% 28px", background: "#FDF7F9" }}>
        <div className="footer-grid" style={{ maxWidth: "1100px", margin: "0 auto", display: "grid", gridTemplateColumns: "2fr 1fr 1fr", gap: "48px", marginBottom: "40px" }}>
          <div>
            <div style={{ marginBottom: "14px" }}>
              <EcomOSLogo mark="#fff" text="#7A1D3B" size={17} lang={lang} />
            </div>
            <p style={{ color: "#9C7680", lineHeight: 1.8, maxWidth: "240px", fontSize: "0.9rem" }}>
              {dict.footer.desc}
            </p>
          </div>
          {dict.footer.sections.map((col, i) => (
            <div key={i}>
              <h4 style={{ color: "#7A1D3B", fontWeight: 800, marginBottom: "16px", fontSize: "0.97rem" }}>{col.title}</h4>
              <div style={{ display: "flex", flexDirection: "column", gap: "10px" }}>
                {col.links.map(l => (
                  <a key={l} href="#" style={{ color: "#9C7680", textDecoration: "none", fontSize: "0.9rem", fontWeight: 500, display: "flex", alignItems: "center", gap: "4px", transition: "color 0.2s" }}
                    onMouseEnter={e => e.currentTarget.style.color = "#7A1D3B"}
                    onMouseLeave={e => e.currentTarget.style.color = "#9C7680"}>
                    <ChevronRight size={11} /> {l}
                  </a>
                ))}
              </div>
            </div>
          ))}
        </div>
        <div style={{ borderTop: "1px solid #F5DCE4", paddingTop: "22px", display: "flex", justifyContent: "space-between", alignItems: "center", flexWrap: "wrap", gap: "10px" }}>
          <p style={{ color: "#C79AA8", fontSize: "0.83rem" }}>{dict.footer.rights}</p>
          <p style={{ color: "#C79AA8", fontSize: "0.83rem", display: "flex", alignItems: "center", gap: "4px" }}>
            {dict.footer.madeWith} <Heart size={13} color="#EC5C87" fill="#EC5C87" /> {dict.footer.madeWithFollow}
          </p>
        </div>
      </footer>
    </div>
  );
}
