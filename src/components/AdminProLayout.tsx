import { useEffect, useMemo, useState } from "react";
import { Link, NavLink, Outlet, useLocation, useNavigate } from "react-router-dom";
import {
  Activity,
  Bell,
  Bot,
  Boxes,
  ChevronLeft,
  ChevronRight,
  CircleHelp,
  CreditCard,
  DollarSign,
  FileWarning,
  Gauge,
  HeartPulse,
  Landmark,
  LayoutDashboard,
  LogOut,
  Menu,
  MessageSquareText,
  PackageSearch,
  PanelsTopLeft,
  Radio,
  Search,
  Settings2,
  ShieldCheck,
  Store,
  Users,
  Wrench,
  X,
  Scale,
  Trash2,
  ClipboardList,
  type LucideIcon,
} from "lucide-react";
import { useAuth } from "../hooks/useAuth";
import { ThemeToggle } from "./ThemeToggle";
import { founderAdmin, type FounderNotification } from "../lib/founderAdmin";
import { usePlatformAdmin } from "./PlatformAdminRoute";
import type { PlatformPermission } from "../lib/rbac";
import ecomosLogo from "../assets/ecomos_logo_137x32.png";
import ecomosMark from "../assets/AppStore_iOS_1024x1024.webp";

type NavItem = {
  to: string;
  label: string;
  icon: LucideIcon;
  exact?: boolean;
  permission?: PlatformPermission;
  badge?: string;
  featured?: boolean;
};

type NavGroup = { label: string; items: NavItem[] };

const navGroups: NavGroup[] = [
  {
    label: "Command",
    items: [
      { to: "/admin", label: "Command center", icon: LayoutDashboard, exact: true },
      { to: "/admin/orders", label: "Order Spy", icon: Radio, permission: "orders.read_all", badge: "LIVE", featured: true },
    ],
  },
  {
    label: "Seller operations",
    items: [
      { to: "/admin/sellers", label: "Seller CRM", icon: Store, permission: "workspaces.read" },
      { to: "/admin/workspaces", label: "Workspaces", icon: Boxes, permission: "workspaces.read" },
      { to: "/admin/products", label: "Global products", icon: PackageSearch, permission: "products.read_all" },
      { to: "/admin/campaigns", label: "Campaigns", icon: Gauge, permission: "campaigns.read_all" },
    ],
  },
  {
    label: "Revenue",
    items: [
      { to: "/admin/subscriptions", label: "Subscriptions", icon: CreditCard, permission: "billing.read" },
      { to: "/admin/payments", label: "Payment reviews", icon: DollarSign, permission: "billing.read" },
      { to: "/admin/payment-methods", label: "Payment methods", icon: Landmark, permission: "billing.manage" },
      { to: "/admin/plans", label: "Plans & limits", icon: PanelsTopLeft, permission: "billing.read" },
    ],
  },
  {
    label: "Customer success",
    items: [
      { to: "/admin/support", label: "Support inbox", icon: CircleHelp, permission: "support.read" },
      { to: "/admin/announcements", label: "Broadcast center", icon: MessageSquareText, permission: "announcements.manage" },
    ],
  },
  {
    label: "Legal & compliance",
    items: [
      { to: "/admin/legal-settings", label: "Legal settings", icon: Scale, permission: "settings.read" },
      { to: "/admin/deletion-requests", label: "Data deletion", icon: Trash2, permission: "settings.read" },
      { to: "/admin/refund-requests", label: "Refund requests", icon: DollarSign, permission: "billing.read" },
    ],
  },
  {
    label: "Platform",
    items: [
      { to: "/admin/operations?tab=integrations", label: "Integrations", icon: Wrench, permission: "health.read" },
      { to: "/admin/ai-tools", label: "AI & providers", icon: Bot, permission: "ai.read" },
      { to: "/admin/operations?tab=health", label: "Service health", icon: HeartPulse, permission: "health.read" },
      { to: "/admin/operations?tab=problems", label: "Errors & logs", icon: FileWarning, permission: "logs.read" },
    ],
  },
  {
    label: "Access & control",
    items: [
      { to: "/admin/users", label: "Users & roles", icon: Users, permission: "users.read" },
      { to: "/admin/operations?tab=activity", label: "Audit trail", icon: Activity, permission: "security.read" },
      { to: "/admin/platform?tab=security", label: "Security", icon: ShieldCheck, permission: "security.read" },
      { to: "/admin/platform", label: "Platform settings", icon: Settings2, permission: "settings.read" },
    ],
  },
];

const pageMeta = [
  ["/admin/orders", "Live operations", "Order Spy", "Every order across every seller, updating live."],
  ["/admin/sellers", "Seller operations", "Seller CRM", "Performance, health and controls for every seller."],
  ["/admin/workspaces", "Seller operations", "Workspaces", "All businesses and operational access."],
  ["/admin/products", "Seller operations", "Global products", "Catalog and inventory across the platform."],
  ["/admin/campaigns", "Seller operations", "Campaigns", "Connected acquisition activity across sellers."],
  ["/admin/subscriptions", "Revenue", "Subscriptions", "Plans, access periods and account status."],
  ["/admin/payment-methods", "Revenue", "Payment methods", "Checkout settings and Moroccan bank accounts."],
  ["/admin/payments", "Revenue", "Payment reviews", "Verify receipts and activate subscriptions."],
  ["/admin/plans", "Revenue", "Plans & limits", "Pricing and operating capacity."],
  ["/admin/support", "Customer success", "Support inbox", "Resolve seller issues with full context."],
  ["/admin/announcements", "Customer success", "Broadcast center", "Send targeted platform communication."],
  ["/admin/legal-settings", "Legal & compliance", "Legal settings", "Configure legal documents, company info, and policies."],
  ["/admin/deletion-requests", "Legal & compliance", "Data deletion", "Review and manage user data deletion requests."],
  ["/admin/refund-requests", "Legal & compliance", "Refund requests", "Process subscription refund requests."],
  ["/admin/ai-tools", "Platform", "AI & providers", "Provider health, routing and usage."],
  ["/admin/operations", "Platform", "Platform operations", "Health, integrations, incidents and audit."],
  ["/admin/users", "Access & control", "Users & roles", "Account access and membership management."],
  ["/admin/platform", "Access & control", "Platform settings", "Security and global configuration."],
] as const;

export function AdminProLayout() {
  const { profile, session, signOut } = useAuth();
  const { authorization, can } = usePlatformAdmin();
  const location = useLocation();
  const navigate = useNavigate();
  const [collapsed, setCollapsed] = useState(false);
  const [mobileOpen, setMobileOpen] = useState(false);
  const [searchQuery, setSearchQuery] = useState("");
  const [searchResults, setSearchResults] = useState<Array<{ kind: string; id: string; title: string; detail: string; href: string }>>([]);
  const [searching, setSearching] = useState(false);
  const [searchOpen, setSearchOpen] = useState(false);
  const [notifications, setNotifications] = useState<FounderNotification[]>([]);
  const [unreadNotifications, setUnreadNotifications] = useState(0);
  const [notificationsOpen, setNotificationsOpen] = useState(false);
  const previewMode = import.meta.env.DEV && new URLSearchParams(location.search).get("preview") === "admin";

  const visibleGroups = useMemo(() => navGroups
    .map((group) => ({ ...group, items: group.items.filter((item) => !item.permission || can(item.permission)) }))
    .filter((group) => group.items.length), [can]);
  const matchedMeta = pageMeta.find(([path]) => location.pathname.startsWith(path));
  const currentMeta = matchedMeta
    ? { section: matchedMeta[1], title: matchedMeta[2], description: matchedMeta[3] }
    : { section: "Command", title: "Command center", description: "Live platform intelligence and daily priorities." };

  useEffect(() => {
    if (previewMode) return;
    if (searchQuery.trim().length < 2) { setSearchResults([]); setSearching(false); return; }
    const timer = window.setTimeout(async () => {
      setSearching(true);
      try { setSearchResults(await founderAdmin.globalSearch(searchQuery)); }
      catch { setSearchResults([]); }
      finally { setSearching(false); }
    }, 200);
    return () => window.clearTimeout(timer);
  }, [previewMode, searchQuery]);

  useEffect(() => {
    const onShortcut = (event: KeyboardEvent) => {
      if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === "k") {
        event.preventDefault();
        setSearchOpen(true);
        window.setTimeout(() => document.getElementById("admin-global-search")?.focus(), 0);
      }
    };
    window.addEventListener("keydown", onShortcut);
    return () => window.removeEventListener("keydown", onShortcut);
  }, []);

  const loadNotifications = async () => {
    if (previewMode) {
      setNotifications([
        { source: "payment", source_id: "preview-1", title: "Payment needs review", detail: "Growth annual transfer submitted by Atlas Gadgets.", created_at: new Date().toISOString(), severity: "warning", read: false },
        { source: "support", source_id: "preview-2", title: "Urgent seller ticket", detail: "Shipping sync requires attention.", created_at: new Date(Date.now() - 540000).toISOString(), severity: "urgent", read: false },
      ]);
      setUnreadNotifications(2);
      return;
    }
    try {
      const result = await founderAdmin.notifications();
      setNotifications(result.rows || []);
      setUnreadNotifications(result.unread || 0);
    } catch {
      setNotifications([]);
      setUnreadNotifications(0);
    }
  };

  const toggleNotifications = () => {
    const next = !notificationsOpen;
    setNotificationsOpen(next);
    if (next) void loadNotifications();
  };

  const itemIsActive = (item: NavItem) => {
    const [path, query] = item.to.split("?");
    const pathMatch = item.exact ? location.pathname === path : location.pathname === path || location.pathname.startsWith(`${path}/`);
    return pathMatch && (!query || location.search.includes(query));
  };

  const exitAdmin = async () => {
    await signOut();
    navigate("/login", { replace: true });
  };

  const closeSearch = () => {
    setSearchOpen(false);
    setSearchQuery("");
  };

  return (
    <div className="flex h-dvh min-h-0 overflow-hidden bg-brand-background text-ink">
      {mobileOpen && <button aria-label="Close admin navigation" onClick={() => setMobileOpen(false)} className="fixed inset-0 z-40 bg-slate-950/45 backdrop-blur-sm lg:hidden" />}

      <aside className={`fixed inset-y-0 left-0 z-50 flex w-[286px] flex-col border-r border-base-border/80 bg-base-surface transition-[transform,width] duration-200 lg:static lg:translate-x-0 ${collapsed ? "lg:w-[82px]" : "lg:w-[286px]"} ${mobileOpen ? "translate-x-0" : "-translate-x-full"}`}>
        <div className="flex h-[74px] shrink-0 items-center gap-3 border-b border-base-border/70 px-4">
          {collapsed ? <img src={ecomosMark} alt="EcomOS" className="mx-auto h-10 w-10 rounded-xl object-cover shadow-sm" /> : <><img src={ecomosLogo} alt="EcomOS" className="h-7 w-auto" /><span className="rounded-full border border-brand-accent/15 bg-brand-accent/[0.07] px-2 py-1 text-[9px] font-black uppercase tracking-wider text-brand-accent">Admin</span></>}
          <button aria-label="Close admin navigation" onClick={() => setMobileOpen(false)} className="ml-auto rounded-lg p-2 text-ink-muted hover:bg-base-raised lg:hidden"><X size={18} /></button>
        </div>

        {!collapsed && <Link to="/admin/orders" onClick={() => setMobileOpen(false)} className="mx-3 mt-3 overflow-hidden rounded-2xl bg-gradient-to-br from-[#1f123d] via-[#432083] to-[#6d3ce7] p-4 text-white shadow-lg shadow-violet-500/15">
          <div className="flex items-center justify-between"><span className="flex items-center gap-2 text-[10px] font-black uppercase tracking-[0.16em] text-white/65"><span className="h-2 w-2 animate-pulse rounded-full bg-emerald-400" />Live command</span><Radio size={15} className="text-violet-200" /></div>
          <p className="mt-3 text-sm font-black">Open Order Spy</p>
          <p className="mt-1 text-[11px] leading-4 text-white/55">Watch every seller order from one feed.</p>
        </Link>}

        <nav className="flex-1 overflow-y-auto px-3 py-4">
          {visibleGroups.map((group) => <section key={group.label} className="mb-5">
            {!collapsed && <p className="mb-1.5 px-3 text-[9px] font-black uppercase tracking-[0.2em] text-ink-faint/75">{group.label}</p>}
            {collapsed && <div className="mx-auto mb-2 w-6 border-t border-base-border" />}
            <div className="space-y-0.5">
              {group.items.map((item) => {
                const Icon = item.icon;
                const active = itemIsActive(item);
                return <NavLink key={item.to} to={item.to} end={item.exact} title={collapsed ? item.label : undefined} onClick={() => setMobileOpen(false)} className={`group relative flex items-center rounded-xl text-[13px] font-semibold transition ${collapsed ? "mx-auto h-11 w-11 justify-center" : "gap-3 px-3.5 py-2.5"} ${active ? "bg-brand-accent/10 text-brand-accent before:absolute before:left-0 before:h-5 before:w-0.5 before:rounded-full before:bg-brand-accent" : "text-ink-muted hover:bg-base-raised/75 hover:text-ink"}`}>
                  <Icon size={17} className={active ? "text-brand-accent" : item.featured ? "text-emerald-500" : "text-ink-faint transition group-hover:text-ink-muted"} />
                  {!collapsed && <><span className="min-w-0 flex-1 truncate">{item.label}</span>{item.badge && <span className="rounded-full bg-emerald-500/10 px-1.5 py-0.5 text-[8px] font-black text-emerald-600">{item.badge}</span>}</>}
                </NavLink>;
              })}
            </div>
          </section>)}
        </nav>

        <div className="border-t border-base-border/70 p-3">
          <div className={`flex items-center gap-3 rounded-xl bg-base-raised/70 p-2.5 ${collapsed ? "justify-center" : ""}`}>
            <div className="grid h-9 w-9 shrink-0 place-items-center overflow-hidden rounded-full bg-brand-accent/15 text-xs font-black text-brand-accent">
              {profile?.avatar_url ? <img src={profile.avatar_url} alt="Profile" className="h-full w-full object-cover" /> : (profile?.full_name || session?.user?.email || "F").slice(0, 1).toUpperCase()}
            </div>
            {!collapsed && <><div className="min-w-0 flex-1"><p className="truncate text-xs font-bold">{profile?.full_name || "Platform Founder"}</p><p className="truncate text-[10px] capitalize text-ink-faint">{authorization.role?.replace(/_/g, " ") || "Platform Admin"}</p></div><button onClick={() => void exitAdmin()} title="Sign out" className="rounded-lg p-2 text-ink-faint hover:bg-danger/10 hover:text-danger"><LogOut size={15} /></button></>}
          </div>
          <button onClick={() => setCollapsed((value) => !value)} className="mt-2 hidden w-full items-center justify-center gap-2 rounded-lg py-2 text-[11px] font-semibold text-ink-muted hover:bg-base-raised lg:flex">{collapsed ? <ChevronRight size={15} /> : <><ChevronLeft size={15} /> Collapse navigation</>}</button>
        </div>
      </aside>

      <div className="flex min-w-0 flex-1 flex-col overflow-hidden">
        <header className="relative flex h-[74px] shrink-0 items-center gap-3 border-b border-base-border/70 bg-base-surface/95 px-4 backdrop-blur md:px-6">
          <button aria-label="Open admin navigation" onClick={() => setMobileOpen(true)} className="rounded-xl p-2 text-ink-muted hover:bg-base-raised lg:hidden"><Menu size={20} /></button>
          <div className="min-w-0">
            <p className="text-[9px] font-black uppercase tracking-[0.18em] text-brand-accent">{currentMeta.section}</p>
            <h1 className="truncate text-base font-black tracking-[-0.02em]">{currentMeta.title}</h1>
          </div>

          {authorization.is_root_founder && <div className="relative mx-auto hidden w-full max-w-[520px] md:block">
            <Search size={16} className="pointer-events-none absolute left-3.5 top-1/2 -translate-y-1/2 text-ink-faint" />
            <input id="admin-global-search" aria-label="Search the platform" value={searchQuery} onFocus={() => setSearchOpen(true)} onChange={(event) => { setSearchQuery(event.target.value); setSearchOpen(true); }} placeholder="Search seller, order, workspace or user…" className="h-10 w-full rounded-xl border border-base-border bg-base-raised/70 pl-10 pr-16 text-sm outline-none transition focus:border-brand-accent/50 focus:bg-base-surface focus:ring-4 focus:ring-brand-accent/5" />
            <kbd className="pointer-events-none absolute right-2.5 top-1/2 -translate-y-1/2 rounded-md border border-base-border bg-base-surface px-1.5 py-0.5 text-[9px] text-ink-faint">Ctrl K</kbd>
            {searchOpen && <div className="absolute left-0 right-0 top-[calc(100%+0.55rem)] z-[70] overflow-hidden rounded-2xl border border-base-border bg-base-surface shadow-2xl">
              <div className="flex items-center justify-between border-b border-base-border px-4 py-2.5"><span className="text-xs font-semibold text-ink-faint">{searching ? "Searching platform…" : searchQuery.trim().length < 2 ? "Type at least two characters" : `${searchResults.length} results`}</span><button onClick={closeSearch} className="rounded-lg p-1 text-ink-faint hover:bg-base-raised"><X size={14} /></button></div>
              <div className="max-h-[420px] overflow-y-auto">{searchResults.map((result) => <NavLink key={`${result.kind}-${result.id}`} to={result.href} onClick={closeSearch} className="flex items-center gap-3 border-b border-base-border px-4 py-3 last:border-0 hover:bg-base-raised"><span className="grid h-8 w-8 place-items-center rounded-lg bg-brand-accent/10 text-brand-accent"><Search size={14} /></span><span className="min-w-0"><span className="block truncate text-sm font-bold">{result.title}</span><span className="mt-0.5 block truncate text-xs text-ink-muted">{result.kind} · {result.detail}</span></span></NavLink>)}</div>
            </div>}
          </div>}

          <div className="relative ml-auto flex items-center gap-1.5 sm:gap-2">
            <Link to="/admin/orders" className="hidden items-center gap-2 rounded-xl border border-emerald-500/20 bg-emerald-500/[0.07] px-3 py-2 text-[11px] font-black text-emerald-700 dark:text-emerald-300 xl:flex"><span className="h-1.5 w-1.5 animate-pulse rounded-full bg-emerald-500" />Order Spy</Link>
            <ThemeToggle />
            {authorization.is_root_founder && <button onClick={toggleNotifications} className="relative rounded-xl p-2.5 text-ink-muted hover:bg-base-raised" title="Notifications" aria-expanded={notificationsOpen}><Bell size={17} />{unreadNotifications > 0 && <span className="absolute right-0 top-0 grid h-4 min-w-4 place-items-center rounded-full bg-danger px-1 text-[8px] font-black text-white">{Math.min(unreadNotifications, 99)}</span>}</button>}
            <span className="hidden rounded-full bg-brand-accent/10 px-2.5 py-1 text-[10px] font-black capitalize text-brand-accent sm:inline">{authorization.role?.replace(/_/g, " ")}</span>
            {notificationsOpen && authorization.is_root_founder && <div className="absolute right-0 top-[calc(100%+0.55rem)] z-[70] w-[min(380px,calc(100vw-2rem))] overflow-hidden rounded-2xl border border-base-border bg-base-surface shadow-2xl"><div className="flex items-center justify-between border-b border-base-border px-4 py-3"><div><p className="text-sm font-black">Admin notifications</p><p className="text-[10px] text-ink-faint">Payments, support and platform attention</p></div><button onClick={() => void loadNotifications()} className="text-xs font-bold text-brand-accent">Refresh</button></div><div className="max-h-[430px] overflow-y-auto">{notifications.length ? notifications.map((notice) => <button key={`${notice.source}-${notice.source_id}`} onClick={() => { if (!previewMode && !notice.read) void founderAdmin.markNotificationRead(notice.source, notice.source_id).then(() => void loadNotifications()); }} className={`block w-full border-b border-base-border px-4 py-3 text-left last:border-0 hover:bg-base-raised ${notice.read ? "" : "bg-brand-accent/[0.04]"}`}><div className="flex items-start gap-2"><span className={`mt-1 h-2 w-2 shrink-0 rounded-full ${notice.severity === "urgent" ? "bg-danger" : "bg-amber-500"}`} /><span><span className="block text-sm font-bold">{notice.title}</span><span className="mt-1 line-clamp-2 block text-xs leading-5 text-ink-muted">{notice.detail}</span><span className="mt-1 block text-[10px] text-ink-faint">{new Date(notice.created_at).toLocaleString()}</span></span></div></button>) : <p className="p-8 text-center text-sm text-ink-muted">No current platform notifications.</p>}</div></div>}
          </div>
        </header>

        <div className="flex min-h-0 flex-1 flex-col overflow-hidden">
          <div className="hidden shrink-0 items-center justify-between border-b border-base-border/50 bg-base-surface/45 px-6 py-2 text-[11px] text-ink-muted xl:flex"><span>{currentMeta.description}</span><span className="flex items-center gap-2"><span className="h-1.5 w-1.5 rounded-full bg-emerald-500" />Protected cross-tenant view · Africa/Casablanca</span></div>
          <main className="min-h-0 flex-1 overflow-y-auto"><Outlet /></main>
        </div>
      </div>
    </div>
  );
}
