export type Language = 'en' | 'ar';

export const t = {
    en: {
        nav: {
            features: "Features",
            integrations: "Integrations",
            testimonials: "Testimonials",
            login: "Login",
            startFree: "Start Free Trial",
            product: "Product",
            solutions: "Solutions",
            pricing: "Pricing"
        },
        hero: {
            badge: "Built for GCC & Africa",
            titlePart1: "The Ultimate Operating System",
            titlePart2: "For E-commerce",
            subtitle: "Unify your operations, automate fulfillment, and scale your COD business flawlessly across emerging markets.",
            ctaPrimary: "Get Started Now",
            ctaSecondary: "See How It Works",
            check1: "No Credit Card Required",
            check2: "14-Day Free Trial",
            check3: "Cancel Anytime",
            demoSteps: [
                { title: "Orders Arrive", subtitle: "From all channels", status: "pending", note: "Orders from all channels arrive in one place" },
                { title: "Smart Routing", subtitle: "Auto-assign carriers", status: "pending", note: "AI automatically assigns the best carrier" },
                { title: "Track & Deliver", subtitle: "Real-time updates", status: "pending", note: "Track every order in real-time" },
                { title: "Confirm & Collect", subtitle: "COD management", status: "pending", note: "Manage confirmations and collections" },
                { title: "Profit Analytics", subtitle: "Net margin insights", status: "pending", note: "See your true profit per order" }
            ],
            demoProfitLabel: "Net Profit",
            demoProfitValue: "$12,450",
            demoProfitNote: "This month"
        },
        dashStats: {
            orders: "Orders",
            sales: "Sales",
            delivery: "Delivered",
            rating: "Rating"
        },
        dashBadges: {
            top: "Top Performing",
            bottom: "Verified Success"
        },
        stats: [
            { label: "Active Stores" },
            { label: "Orders Processed" },
            { label: "Delivery Success Target" },
            { label: "Integrations" }
        ],
        walkthrough: {
            eyebrow: "Product Walkthrough",
            title: "See EcomOS in Action",
            sub: "Explore each module and see how they work together to power your business.",
            tabs: [
                { key: "orders", label: "Orders" },
                { key: "confirmation", label: "Confirmation" },
                { key: "crm", label: "CRM" },
                { key: "shipping", label: "Shipping" },
                { key: "team", label: "Team" },
                { key: "profit", label: "Profit" },
                { key: "ads", label: "Ads" }
            ],
            panels: {
                orders: {
                    title: "Centralized Order Management",
                    desc: "All your orders from all channels in one unified dashboard.",
                    lineItems: [
                        { label: "Order #1234", value: "$45.00" },
                        { label: "Order #1235", value: "$32.50" },
                        { label: "Order #1236", value: "$67.00" }
                    ]
                },
                confirmation: {
                    title: "Automated Confirmation Calls",
                    desc: "AI-powered calling system to confirm orders before shipping.",
                    lineItems: [
                        { label: "Confirmed", value: "85%" },
                        { label: "Pending", value: "12%" },
                        { label: "Cancelled", value: "3%" }
                    ]
                },
                crm: {
                    title: "Customer Relationship Management",
                    desc: "Track customer history, preferences, and lifetime value.",
                    lineItems: [
                        { label: "Active Customers", value: "1,234" },
                        { label: "Repeat Rate", value: "42%" },
                        { label: "Avg LTV", value: "$156" }
                    ]
                },
                shipping: {
                    title: "Smart Shipping Routing",
                    desc: "Automatically route to the best carrier based on performance and cost.",
                    lineItems: [
                        { label: "On-Time Delivery", value: "94%" },
                        { label: "Avg Delivery Time", value: "2.3 days" },
                        { label: "Cost Savings", value: "$1,240" }
                    ]
                },
                team: {
                    title: "Team Collaboration",
                    desc: "Assign roles, track performance, and manage team access.",
                    features: [
                        { icon: "Shield", title: "Role-Based Access", desc: "Control who sees what" },
                        { icon: "UserCog", title: "Activity Logging", desc: "Track all team actions" },
                        { icon: "PhoneCall", title: "Performance Metrics", desc: "Measure team efficiency" },
                        { icon: "Boxes", title: "Task Management", desc: "Assign and track tasks" }
                    ]
                },
                profit: {
                    title: "Real-Time Profit Analytics",
                    desc: "See your true profit margins after all costs.",
                    lineItems: [
                        { label: "Revenue", value: "$45,000" },
                        { label: "COGS", value: "$18,000" },
                        { label: "Shipping", value: "$4,500" },
                        { label: "Ads", value: "$8,000" }
                    ],
                    netValue: "$14,500"
                },
                ads: {
                    title: "Ad Performance Tracking",
                    desc: "Track ROAS, CAC, and conversion across all ad platforms.",
                    lineItems: [
                        { label: "ROAS", value: "3.2x" },
                        { label: "CAC", value: "$12.50" },
                        { label: "Conversion Rate", value: "4.5%" }
                    ]
                }
            }
        },
        featuresIntro: {
            badge: "Powerful Features",
            title1: "Everything you need to",
            title2: "scale your business"
        },
        features: [
            {
                title: "Order Management",
                desc: "Centralize and automate your entire order lifecycle from everywhere.",
                details: ["Bulk Processing", "Auto-Sync", "Multi-Currency", "Real-Time Alerts"]
            },
            {
                title: "Inventory Sync",
                desc: "Keep stock levels perfectly synchronized across all your sales channels.",
                details: ["Multi-Warehouse", "Low Stock Alerts", "Cost Tracking", "Supplier Portal"]
            },
            {
                title: "Multi-Store Connect",
                desc: "Manage WooCommerce, Shopify, and local platforms from a single dashboard.",
                details: ["1-Click Setup", "Unified Dashboard", "Product Sync", "API Access"]
            },
            {
                title: "Financial Analytics",
                desc: "Get deep insights into your profitability, margins, and daily cash flow.",
                details: ["P&L Reports", "ROI Tracking", "Live Metrics", "Custom Exports"]
            },
            {
                title: "Fulfillment & Routing",
                desc: "Intelligently route orders to the best shipping providers based on performance.",
                details: ["Smart Routing", "Label Printing", "Live Tracking", "Return Management"]
            },
            {
                title: "Growth Metrics",
                desc: "Track team performance, delivery rates, and conversion metrics in real-time.",
                details: ["KPI Dashboards", "Agent Scoring", "Trend Analysis", "Forecasting"]
            },
            {
                title: "Team Collaboration",
                desc: "Assign roles, restrict access, and foster seamless communication within your team.",
                details: ["Role-Based Access", "Activity Logs", "Live Chat", "Task Management"]
            }
        ],
        integrationsIntro: {
            badge: "Seamless Connectivity",
            title1: "Connects with the",
            titleGlow: "ecosystem",
            subtitle: "EcomOS integrates out-of-the-box with leading platforms, CRMs, and delivery networks in your region."
        },
        ecosystem: {
            eyebrow: "Ecosystem",
            title: "Integrations",
            categories: [
                {
                    label: "E-commerce",
                    items: ["Shopify", "WooCommerce", "Salla", "Zid", "YouCan"]
                },
                {
                    label: "Marketing",
                    items: ["Facebook", "TikTok", "Google Ads", "Snapchat"]
                },
                {
                    label: "Communication",
                    items: ["WhatsApp", "SMS", "Email", "Push"]
                },
                {
                    label: "Shipping",
                    items: ["Ameex", "ForceLog", "Sendit", "Coliaty"]
                }
            ],
            trackingNote: "Real-time tracking across all carriers"
        },
        pl: {
            badge: "Financial Control",
            title1: "Track every cent,",
            titleGlow: "optimize",
            title2: "for pure profit.",
            subtitle: "Stop guessing your true margins. EcomOS gives you a crystal-clear, real-time P&L detailing ad spend, product costs, shipping fees, and net profit per order.",
            features: ["Real-time Net Margin Tracking", "Ad Spend Auto-Sync", "Hidden Cost Detection", "Automated Daily Reports"],
            cardTitle: "Net Profit",
            cardUnit: "USD",
            metrics: ["Revenue", "Costs (Ads+Goods)", "Operating Margin", "Conversion Rate"]
        },
        team: {
            badge: "Team Management",
            title1: "Empower your",
            titleGlow: "entire team",
            subtitle: "Give your confirmation agents, stock managers, and advertisers the exact tools they need to perform at their best, completely isolated from sensitive financial data.",
            features: ["Granular Permissions", "Action Logging", "Performance Leaderboards", "Internal Communications"],
            roles: ["Admin", "Confirmation", "Dispatch", "Observer"],
            active: "Active Now"
        },
        testimonialsIntro: {
            badge: "Success Stories",
            title1: "Trusted by",
            titleGlow: "top sellers"
        },
        testimonials: [
            {
                avatar: "M",
                name: "Mohammed Al-Fayed",
                role: "CEO, LuxStores",
                text: "EcomOS transformed our COD operations. Our delivery rate jumped from 62% to 81% in just two months."
            },
            {
                avatar: "S",
                name: "Sara Ahmed",
                role: "Operations Manager",
                text: "The financial tracking is unparalleled. For the first time, we know our true profit margins daily."
            },
            {
                avatar: "K",
                name: "Khalid Othman",
                role: "Founder, GulfTrends",
                text: "Managing multiple Shopify and Salla stores from one interface saved us hundreds of hours."
            }
        ],
        cta: {
            badge: "Start Your Journey",
            title1: "Ready to dominate",
            title2: "your market?",
            subtitle: "Join hundreds of merchants scaling their operations with EcomOS.\nNo credit card required. Cancel anytime.",
            primary: "Start 14-Day Free Trial",
            secondary: "Talk to Sales"
        },
        footer: {
            desc: "The premier operating system for ambitious e-commerce and COD businesses in emerging markets.",
            sections: [
                {
                    title: "Product",
                    links: ["Features", "Integrations", "Pricing", "Changelog"]
                },
                {
                    title: "Resources",
                    links: ["Documentation", "Case Studies", "Blog", "Help Center"]
                },
                {
                    title: "Company",
                    links: ["About Us", "Careers", "Contact", "Partners"]
                }
            ],
            rights: "© 2026 EcomOS. All rights reserved.",
            madeWith: "Made with",
            madeWithFollow: "by the EcomOS Team"
        }
    },
    ar: {
        nav: {
            features: "المميزات",
            integrations: "الربط",
            testimonials: "آراء العملاء",
            login: "تسجيل الدخول",
            startFree: "ابدأ مجاناً",
            product: "المنتج",
            solutions: "الحلول",
            pricing: "الأسعار"
        },
        hero: {
            badge: "مصمم للخليج وأفريقيا",
            titlePart1: "نظام التشغيل المتكامل",
            titlePart2: "للتجارة الإلكترونية",
            subtitle: "وحّد عملياتك، قم بأتمتة التجهيز، ووسّع نطاق عمل الدفع عند الاستلام بامتياز في الأسواق الناشئة.",
            ctaPrimary: "ابدأ الآن",
            ctaSecondary: "شاهد كيف يعمل",
            check1: "لا حاجة لبطاقة ائتمان",
            check2: "تجربة مجانية لمدة ١٤ يوم",
            check3: "إلغاء في أي وقت",
            demoSteps: [
                { title: "وصول الطلبات", subtitle: "من جميع القنوات", status: "pending", note: "الطلبات من جميع القنوات تصل في مكان واحد" },
                { title: "التوجيه الذكي", subtitle: "تعيين شركات الشحن تلقائياً", status: "pending", note: "الذكاء الاصطناعي يعين أفضل شركة شحن" },
                { title: "التتبع والتوصيل", subtitle: "تحديثات فورية", status: "pending", note: "تتبع كل طلب في الوقت الفعلي" },
                { title: "التأكيد والتحصيل", subtitle: "إدارة الدفع عند الاستلام", status: "pending", note: "إدارة التأكيدات والتحصيل" },
                { title: "تحليلات الأرباح", subtitle: "رؤى الهامش الصافي", status: "pending", note: "شاهد ربحك الحقيقي لكل طلب" }
            ],
            demoProfitLabel: "الربح الصافي",
            demoProfitValue: "$12,450",
            demoProfitNote: "هذا الشهر"
        },
        dashStats: {
            orders: "الطلبات",
            sales: "المبيعات",
            delivery: "تم التوصيل",
            rating: "التقييم"
        },
        dashBadges: {
            top: "الأفضل أداءً",
            bottom: "نجاح موثق"
        },
        stats: [
            { label: "متاجر نشطة" },
            { label: "طلبات تمت معالجتها" },
            { label: "نسبة نجاح التوصيل" },
            { label: "عمليات ربط" }
        ],
        walkthrough: {
            eyebrow: "جولة في المنتج",
            title: "شاهد EcomOS في العمل",
            sub: "استكشف كل وحدة وشاهد كيف تعمل معاً لتشغيل عملك.",
            tabs: [
                { key: "orders", label: "الطلبات" },
                { key: "confirmation", label: "التأكيد" },
                { key: "crm", label: "إدارة العملاء" },
                { key: "shipping", label: "الشحن" },
                { key: "team", label: "الفريق" },
                { key: "profit", label: "الأرباح" },
                { key: "ads", label: "الإعلانات" }
            ],
            panels: {
                orders: {
                    title: "إدارة الطلبات المركزية",
                    desc: "جميع طلباتك من جميع القنوات في لوحة تحكم موحدة.",
                    lineItems: [
                        { label: "طلب #1234", value: "$45.00" },
                        { label: "طلب #1235", value: "$32.50" },
                        { label: "طلب #1236", value: "$67.00" }
                    ]
                },
                confirmation: {
                    title: "مكالمات التأكيد الآلية",
                    desc: "نظام اتصال مدعوم بالذكاء الاصطناعي لتأكيد الطلبات قبل الشحن.",
                    lineItems: [
                        { label: "مؤكد", value: "85%" },
                        { label: "قيد الانتظار", value: "12%" },
                        { label: "ملغي", value: "3%" }
                    ]
                },
                crm: {
                    title: "إدارة علاقات العملاء",
                    desc: "تتبع تاريخ العملاء وتفضيلاتهم والقيمة الدائمة.",
                    lineItems: [
                        { label: "عملاء نشطون", value: "1,234" },
                        { label: "معدل التكرار", value: "42%" },
                        { label: "متوسط القيمة الدائمة", value: "$156" }
                    ]
                },
                shipping: {
                    title: "التوجيه الذكي للشحن",
                    desc: "وجّه تلقائياً إلى أفضل شركة شحن بناءً على الأداء والتكلفة.",
                    lineItems: [
                        { label: "التسليم في الوقت", value: "94%" },
                        { label: "متوسط وقت التسليم", value: "2.3 يوم" },
                        { label: "توفير التكاليف", value: "$1,240" }
                    ]
                },
                team: {
                    title: "تعاون الفريق",
                    desc: "عيّن الأدوار وتتبع الأداء وإدارة وصول الفريق.",
                    features: [
                        { icon: "Shield", title: "الوصول المبني على الأدوار", desc: "تحكم في من يرى ماذا" },
                        { icon: "UserCog", title: "تسجيل النشاط", desc: "تتبع جميع إجراءات الفريق" },
                        { icon: "PhoneCall", title: "مقاييس الأداء", desc: "قياس كفاءة الفريق" },
                        { icon: "Boxes", title: "إدارة المهام", desc: "تعيين وتتبع المهام" }
                    ]
                },
                profit: {
                    title: "تحليلات الأرباح الفورية",
                    desc: "شاهد هوامش ربحك الحقيقية بعد جميع التكاليف.",
                    lineItems: [
                        { label: "الإيرادات", value: "$45,000" },
                        { label: "تكلفة البضائع", value: "$18,000" },
                        { label: "الشحن", value: "$4,500" },
                        { label: "الإعلانات", value: "$8,000" }
                    ],
                    netValue: "$14,500"
                },
                ads: {
                    title: "تتبع أداء الإعلانات",
                    desc: "تتبع العائد على الإنفاق الإعلاني وتكلفة الاستحواذ والتحويل عبر جميع منصات الإعلانات.",
                    lineItems: [
                        { label: "العائد على الإنفاق", value: "3.2x" },
                        { label: "تكلفة الاستحواذ", value: "$12.50" },
                        { label: "معدل التحويل", value: "4.5%" }
                    ]
                }
            }
        },
        featuresIntro: {
            badge: "مميزات قوية",
            title1: "كل ما تحتاجه لتوسيع",
            title2: "نطاق عملك"
        },
        features: [
            {
                title: "إدارة الطلبات",
                desc: "قم بمركزة وأتمتة دورة حياة طلباتك بالكامل من كل مكان.",
                details: ["معالجة بالجملة", "مزامنة تلقائية", "عملات متعددة", "تنبيهات فورية"]
            },
            {
                title: "مزامنة المخزون",
                desc: "حافظ على تزامن مستويات المخزون بشكل مثالي عبر جميع قنوات البيع.",
                details: ["مستودعات متعددة", "تنبيهات نقص المخزون", "تتبع التكاليف", "بوابة الموردين"]
            },
            {
                title: "ربط المتاجر المتعددة",
                desc: "أدر منصات WooCommerce و Shopify والمنصات المحلية من لوحة تحكم واحدة.",
                details: ["إعداد بنقرة واحدة", "لوحة موحدة", "مزامنة المنتجات", "وصول API"]
            },
            {
                title: "التحليلات المالية",
                desc: "احصل على رؤى عميقة حول ربحيتك وهوامش الربح والتدفق النقدي اليومي.",
                details: ["تقارير الأرباح والخسائر", "تتبع العائد", "مقاييس مباشرة", "تصدير مخصص"]
            },
            {
                title: "التجهيز والتوجيه",
                desc: "قم بتوجيه الطلبات بذكاء لأفضل شركات الشحن بناءً على الأداء.",
                details: ["توجيه ذكي", "طباعة الملصقات", "تتبع فوري", "إدارة المرتجعات"]
            },
            {
                title: "مقاييس النمو",
                desc: "تتبع أداء الفريق ومعدلات التوصيل ومقاييس التحويل في الوقت الفعلي.",
                details: ["لوحات قياس الأداء", "تقييم الوكلاء", "تحليل الاتجاهات", "التنبؤ"]
            },
            {
                title: "تعاون الفريق",
                desc: "عيّن الأدوار وقيّد الوصول وعزز التواصل السلس داخل فريقك.",
                details: ["وصول مبني على الأدوار", "سجلات النشاط", "محادثة فورية", "إدارة المهام"]
            }
        ],
        integrationsIntro: {
            badge: "اتصال سلس",
            title1: "متصل بـ",
            titleGlow: "النظام البيئي",
            subtitle: "يتكامل نظام EcomOS بشكل جاهز مع المنصات وأدوات إدارة علاقات العملاء وشبكات التوصيل الرائدة في منطقتك."
        },
        ecosystem: {
            eyebrow: "النظام البيئي",
            title: "الربط",
            categories: [
                {
                    label: "التجارة الإلكترونية",
                    items: ["Shopify", "WooCommerce", "Salla", "Zid", "YouCan"]
                },
                {
                    label: "التسويق",
                    items: ["Facebook", "TikTok", "Google Ads", "Snapchat"]
                },
                {
                    label: "التواصل",
                    items: ["WhatsApp", "SMS", "Email", "Push"]
                },
                {
                    label: "الشحن",
                    items: ["Ameex", "ForceLog", "Sendit", "Coliaty"]
                }
            ],
            trackingNote: "تتبع فوري عبر جميع شركات الشحن"
        },
        pl: {
            badge: "التحكم المالي",
            title1: "تتبع كل قرش،",
            titleGlow: "حسّن",
            title2: "من أجل الربح الصافي.",
            subtitle: "توقف عن تخمين هوامش ربحك الحقيقية. يمنحك EcomOS بياناً واضحاً وفورياً للأرباح والخسائر يوضح تفاصيل الإنفاق الإعلاني، وتكاليف المنتجات، ورسوم الشحن، والربح الصافي لكل طلب.",
            features: ["تتبع صافي الهامش الفوري", "مزامنة الإنفاق الإعلاني", "اكتشاف التكاليف الخفية", "تقارير يومية آلية"],
            cardTitle: "الربح الصافي",
            cardUnit: "دولار",
            metrics: ["الإيرادات", "التكاليف (إعلانات+بضائع)", "هامش التشغيل", "معدل التحويل"]
        },
        team: {
            badge: "إدارة الفريق",
            title1: "مكّن",
            titleGlow: "فريقك بالكامل",
            subtitle: "امنح وكلاء التأكيد ومديري المخزون والمعلنين الأدوات الدقيقة التي يحتاجونها للأداء بأفضل ما لديهم، معزولين تماماً عن البيانات المالية الحساسة.",
            features: ["صلاحيات تفصيلية", "تسجيل الإجراءات", "لوحات صدارة الأداء", "اتصالات داخلية"],
            roles: ["مسؤول", "تأكيد", "إرسال", "مراقب"],
            active: "نشط الآن"
        },
        testimonialsIntro: {
            badge: "قصص النجاح",
            title1: "موثوق به من",
            titleGlow: "أفضل البائعين"
        },
        testimonials: [
            {
                avatar: "م",
                name: "محمد الفايد",
                role: "الرئيس التنفيذي، LuxStores",
                text: "غيّر EcomOS عمليات الدفع عند الاستلام الخاصة بنا. قفز معدل التوصيل من ٦٢٪ إلى ٨١٪ في شهرين فقط."
            },
            {
                avatar: "س",
                name: "سارة أحمد",
                role: "مديرة العمليات",
                text: "التتبع المالي لا مثيل له. لأول مرة، نعرف هوامش ربحنا الحقيقية يومياً."
            },
            {
                avatar: "خ",
                name: "خالد عثمان",
                role: "مؤسس، GulfTrends",
                text: "إدارة متاجر Shopify و Salla المتعددة من واجهة واحدة وفرت لنا مئات الساعات."
            }
        ],
        cta: {
            badge: "ابدأ رحلتلك",
            title1: "جاهز للسيطرة",
            title2: "على سوقك؟",
            subtitle: "انضم إلى مئات التجار الذين يوسعون عملياتهم مع EcomOS.\nلا حاجة لبطاقة ائتمان. يمكنك الإلغاء في أي وقت.",
            primary: "ابدأ تجربة مجانية لمدة ١٤ يوم",
            secondary: "تحدث إلى المبيعات"
        },
        footer: {
            desc: "نظام التشغيل الأول للأعمال الطموحة في التجارة الإلكترونية والدفع عند الاستلام في الأسواق الناشئة.",
            sections: [
                {
                    title: "المنتج",
                    links: ["المميزات", "الربط", "الأسعار", "سجل التحديثات"]
                },
                {
                    title: "المصادر",
                    links: ["التوثيق", "دراسات الحالة", "المدونة", "مركز المساعدة"]
                },
                {
                    title: "الشركة",
                    links: ["معلومات عنا", "الوظائف", "اتصل بنا", "الشركاء"]
                }
            ],
            rights: "© ٢٠٢٦ EcomOS. جميع الحقوق محفوظة.",
            madeWith: "صُنع بـ",
            madeWithFollow: "بواسطة فريق EcomOS"
        }
    }
} as const;
