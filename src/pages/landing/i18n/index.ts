export type LandingLanguage = 'en' | 'ar' | 'fr';

export const i18n = {
    en: {
        nav: {
            product: "Product",
            solutions: "Solutions",
            integrations: "Integrations",
            pricing: "Pricing",
            security: "Security",
            resources: "Resources",
            login: "Login",
            startFree: "Start Free",
        },
        hero: {
            title: "One system for your entire e-commerce operation.",
            subtitle: "Orders, customers, confirmation, Moroccan delivery, advertising, team, finance and delivered profit — managed from Ecom OS.",
            primary: "Start Free",
            secondary: "See how Ecom OS works",
            trustText: "Setup in minutes. No credit card required."
        },
        trust: {
            title: "Connect Ecom OS with the tools you already use."
        },
        pricing: {
            title: "Find the right Ecom OS plan",
            ordersLabel: "How many orders do you process?",
            daily: "Daily",
            monthly: "Monthly",
            storesLabel: "Stores / Workspaces",
            teamLabel: "Team Members",
            integrationsLabel: "Integrations",
            premiumFeatures: "What do you need?",
            recommendedForYou: "Recommended for you",
            comparePlans: "Compare plans"
        },
        footer: {
            desc: "The operating system for running an entire COD e-commerce operation.",
            rights: "© 2026 Ecom OS. All rights reserved."
        }
    },
    ar: {
        nav: {
            product: "المنتج",
            solutions: "الحلول",
            integrations: "الربط",
            pricing: "الأسعار",
            security: "الأمان",
            resources: "المصادر",
            login: "دخول",
            startFree: "ابدأ مجاناً",
        },
        hero: {
            title: "كل تجارتك الإلكترونية. نظام تشغيل واحد.",
            subtitle: "الطلبات والعملاء والتأكيد والتوصيل داخل المغرب والإعلانات والفريق والمالية والربح بعد التوصيل — تدار من Ecom OS.",
            primary: "ابدأ مجاناً",
            secondary: "شاهد كيف يعمل Ecom OS",
            trustText: "إعداد في دقائق. لا حاجة لبطاقة ائتمان."
        },
        trust: {
            title: "اربط Ecom OS بالأدوات التي تستخدمها بالفعل."
        },
        pricing: {
            title: "اختر خطة Ecom OS المناسبة",
            ordersLabel: "كم عدد الطلبات التي تعالجها؟",
            daily: "يومياً",
            monthly: "شهرياً",
            storesLabel: "متاجر / مساحات عمل",
            teamLabel: "أعضاء الفريق",
            integrationsLabel: "عمليات الربط",
            premiumFeatures: "ماذا تحتاج؟",
            recommendedForYou: "نوصي لك بخطة",
            comparePlans: "مقارنة الخطط"
        },
        footer: {
            desc: "نظام التشغيل لإدارة عملية التجارة الإلكترونية بالكامل والدفع عند الاستلام.",
            rights: "© 2026 Ecom OS. جميع الحقوق محفوظة."
        }
    },
    fr: {
        nav: {
            product: "Produit",
            solutions: "Solutions",
            integrations: "Intégrations",
            pricing: "Tarification",
            security: "Sécurité",
            resources: "Ressources",
            login: "Connexion",
            startFree: "Commencer gratuitement",
        },
        hero: {
            title: "Un seul système pour toute votre activité e-commerce.",
            subtitle: "Commandes, clients, confirmation, livraison au Maroc, publicité, équipe, finances et profit livré — gérés depuis Ecom OS.",
            primary: "Commencer gratuitement",
            secondary: "Voir comment Ecom OS fonctionne",
            trustText: "Configuration en quelques minutes. Aucune carte de crédit requise."
        },
        trust: {
            title: "Connectez Ecom OS aux outils que vous utilisez déjà."
        },
        pricing: {
            title: "Trouvez le bon forfait Ecom OS",
            ordersLabel: "Combien de commandes traitez-vous ?",
            daily: "Par jour",
            monthly: "Par mois",
            storesLabel: "Boutiques / Espaces",
            teamLabel: "Membres de l'équipe",
            integrationsLabel: "Intégrations",
            premiumFeatures: "De quoi avez-vous besoin ?",
            recommendedForYou: "Recommandé pour vous",
            comparePlans: "Comparer les forfaits"
        },
        footer: {
            desc: "Le système d'exploitation pour gérer toute une opération e-commerce COD.",
            rights: "© 2026 Ecom OS. Tous droits réservés."
        }
    }
} as const;

export type I18nType = typeof i18n.en;
