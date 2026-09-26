import { useEffect, useMemo, useState } from "react";
import { NavLink, useLocation, useNavigate } from "react-router-dom";
import {
  Bell,
  BarChart3,
  Boxes,
  ChevronRight,
  CircleDollarSign,
  ClipboardCheck,
  Download,
  Home,
  Globe2,
  LayoutGrid,
  LogOut,
  Megaphone,
  Menu,
  Package,
  Plus,
  ScanLine,
  Search,
  Share,
  Settings,
  Shield,
  SlidersHorizontal,
  Truck,
  Users,
  Wallet,
  WandSparkles,
  MessageCircle,
  X,
  Zap,
  type LucideIcon,
} from "lucide-react";
import { useAuth } from "../hooks/useAuth";
import { isFounder as hasFounderAccess, isOwnerLikeRole, normalizeAllowedSections } from "../lib/rbac";
import { isShippingModuleEnabled } from "../lib/shippingModule";
import type { AllowedSection, TeamPermissions } from "../lib/types";
import { useNotifications } from "../contexts/NotificationContext";
import MobileBottomSheet from "./MobileBottomSheet";
import ecomosLogo from "../assets/ecomos_logo_137x32.png";
import whatsappLogo from "../assets/integrationicon/imgi_37_whatssap.png";
import { getPrefetchHandler } from "../hooks/usePrefetch";

type Icon = LucideIcon;
type DeferredInstallPrompt = Event & { prompt: () => Promise<void>; userChoice: Promise<{ outcome: "accepted" | "dismissed" }> };

/* ── "All Pages" data ──────────────────────────────────────────────── */

type PageEntry = {
  to: string;
  label: string;
  desc: string;
  cat: "core" | "ops" | "finance" | "system";
  icon: Icon;
  image?: string;
  perm?: keyof TeamPermissions;
  /** Exact section selected by the workspace owner for non-owner members. */
  section?: AllowedSection;
  shipping?: boolean;
  founder?: boolean;
  ownerOnly?: boolean;
  alwaysVisible?: boolean;
};

const pages: PageEntry[] = [
  { to: "/dashboard",          label: "Dashboard",          desc: "Revenue & daily metrics",          cat: "core",    icon: Home,            perm: "dashboard", section: "Dashboard" },
  { to: "/orders",             label: "Orders",             desc: "Manage COD orders",                cat: "core",    icon: Package,         perm: "orders", section: "Orders" },
  { to: "/live-view",          label: "Live View",          desc: "Realtime order activity",          cat: "core",    icon: Globe2,          perm: "orders" },
  { to: "/confirmation",       label: "Confirmation Desk",   desc: "Verify & call desk",               cat: "core",    icon: ClipboardCheck,  perm: "confirmation", section: "Confirmation" },
  { to: "/whatsapp",           label: "WhatsApp Inbox",     desc: "Chat & support inbox",             cat: "core",    icon: MessageCircle,   image: whatsappLogo, perm: "confirmation" },
  { to: "/delivering",         label: "Delivering Parcels",  desc: "Track live parcels",               cat: "core",    icon: Truck,           perm: "orders" },
  { to: "/shipping",           label: "Carrier Shipping",   desc: "Carrier dispatch & logs",          cat: "core",    icon: Truck,           perm: "shipping", section: "Shipping", shipping: true },
  { to: "/customers",          label: "Customer Directory", desc: "Client directory & LTV",           cat: "ops",     icon: Users,           perm: "customers", section: "Customers" },
  { to: "/products-inventory", label: "Products & Stock",   desc: "Catalog, stock & variants",        cat: "ops",     icon: Boxes,           perm: "products", section: "Products" },
  { to: "/team",               label: "Team Permissions",   desc: "Members & permissions",            cat: "ops",     icon: Users,           perm: "team", section: "Team" },
  { to: "/ads-manager",        label: "Meta Ads Manager",   desc: "FB & IG campaigns",                cat: "finance", icon: Megaphone,       perm: "ads", section: "Ads Manager" },
  { to: "/ads-manager-legacy", label: "Legacy Ads Manager", desc: "Manual ID & token reporting",      cat: "finance", icon: BarChart3,       perm: "ads" },
  { to: "/tiktok-ads",         label: "TikTok Ads ROI",     desc: "TikTok campaign ROI",              cat: "finance", icon: Megaphone,       perm: "tiktok_ads", section: "TikTok Ads" },
  { to: "/expenses",           label: "Operating Expenses", desc: "Operating costs",                  cat: "finance", icon: Wallet,          perm: "expenses", section: "Expenses" },
  { to: "/finance",            label: "Agent Payments",     desc: "Founder payroll and transfer ledger", cat: "finance", icon: CircleDollarSign, ownerOnly: true, perm: "dashboard", section: "Dashboard" },
  { to: "/agent-invoices",     label: "Agent Invoices",     desc: "Your earnings and payment statements", cat: "finance", icon: Wallet, alwaysVisible: true },
  { to: "/scenario",           label: "COD Forecast",       desc: "Forecast delivery rates",          cat: "finance", icon: SlidersHorizontal, perm: "codscenarios", section: "COD Scenarios" },
  { to: "/settings",           label: "Workspace Settings", desc: "Workspace & integrations",         cat: "system",  icon: Settings,        perm: "settings", section: "Settings" },
  { to: "/tools",              label: "Commerce Tools",     desc: "Commerce utilities",               cat: "system",  icon: WandSparkles,    perm: "settings" },
  { to: "/notifications",      label: "Notifications",      desc: "Alerts & activity logs",           cat: "system",  icon: Bell },
  { to: "/admin",              label: "Founder Console",    desc: "Platform administration",          cat: "system",  icon: Shield,          founder: true },
];

const catLabel: Record<string, string> = {
  core: "Core Operations",
  ops: "Catalog & Team",
  finance: "Ads & Finance",
  system: "System & Tools",
};

const routeTitles: Array<[string, string]> = [
  ["/live-view", "Live View"],
  ["/products-inventory", "Products & Stock"],
  ["/settings/notifications", "Notifications"],
  ["/scenario", "COD Scenario"],
  ["/confirmation", "Confirmation Desk"],
  ["/whatsapp", "WhatsApp Inbox"],
  ["/delivering", "Delivering Parcels"],
  ["/shipping", "Carrier Shipping"],
  ["/customers", "Customer Directory"],
  ["/ads-manager-legacy", "Legacy Ads Manager"],
  ["/ads-manager", "Meta Ads Manager"],
  ["/tiktok-ads", "TikTok Ads ROI"],
  ["/expenses", "Operating Expenses"],
  ["/finance", "Agent Payments"],
  ["/agent-invoices", "Agent Invoices"],
  ["/team", "Team Permissions"],
  ["/settings", "Workspace Settings"],
  ["/notifications", "Notifications"],
  ["/tools", "Commerce Tools"],
  ["/orders", "Orders Management"],
  ["/admin", "Founder Console"],
  ["/dashboard", "Dashboard"],
];

function isActive(pathname: string, to: string) {
  return pathname === to || pathname.startsWith(`${to}/`);
}

/* ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━ */

export function MobileAppChrome({ onScan }: { onScan: () => void }) {
  const navigate = useNavigate();
  const location = useLocation();
  const { profile, session, workspace, teamPermissions, signOut } = useAuth();
  const { notifications, unreadCount, markAllAsRead, openNotification } = useNotifications();

  const [sidebarOpen, setSidebarOpen] = useState(false);
  const [quickOpen, setQuickOpen] = useState(false);
  const [notificationsOpen, setNotificationsOpen] = useState(false);
  const [search, setSearch] = useState("");
  const [catFilter, setCatFilter] = useState<string>("all");
  const [installOpen, setInstallOpen] = useState(false);
  const [installPrompt, setInstallPrompt] = useState<DeferredInstallPrompt | null>(null);

  const ownerLike = isOwnerLikeRole(profile?.role);
  const isFounder = hasFounderAccess(profile?.role, session?.user?.email);
  const shippingOn = isShippingModuleEnabled(workspace);
  const selectedSections = useMemo(
    () => new Set(normalizeAllowedSections(profile?.allowed_sections)),
    [profile?.allowed_sections],
  );

  const can = (p?: keyof TeamPermissions, section?: AllowedSection) =>
    ownerLike || isFounder
      ? true
      : Boolean(p && section && teamPermissions[p] && selectedSections.has(section));

  const haptic = () => {
    if (typeof navigator !== "undefined" && navigator.vibrate) navigator.vibrate(8);
  };

  const isStandalone = typeof window !== "undefined" && (
    window.matchMedia("(display-mode: standalone)").matches
    || (navigator as Navigator & { standalone?: boolean }).standalone === true
  );
  const isIos = typeof navigator !== "undefined" && /iPad|iPhone|iPod/.test(navigator.userAgent);
  const currentTitle = routeTitles.find(([route]) => isActive(location.pathname, route))?.[1] ?? "Ecom OS";

  useEffect(() => {
    const capture = (event: Event) => {
      event.preventDefault();
      setInstallPrompt(event as DeferredInstallPrompt);
    };
    window.addEventListener("beforeinstallprompt", capture);
    return () => window.removeEventListener("beforeinstallprompt", capture);
  }, []);

  // All accessible pages
  const accessiblePages = useMemo(
    () =>
      pages.filter((p) => {
        if (p.founder && !isFounder) return false;
        if (p.ownerOnly && !isFounder && profile?.role !== "owner") return false;
        if (p.shipping && !shippingOn) return false;
        if (p.alwaysVisible) return true;
        return can(p.perm, p.section);
      }),
    [isFounder, ownerLike, profile?.role, selectedSections, shippingOn, teamPermissions],
  );

  // Filtered for search + category
  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    return accessiblePages.filter(
      (p) =>
        (catFilter === "all" || p.cat === catFilter) &&
        (!q || p.label.toLowerCase().includes(q) || p.desc.toLowerCase().includes(q)),
    );
  }, [accessiblePages, search, catFilter]);

  // Close overlays on navigation
  useEffect(() => {
    setSidebarOpen(false);
    setQuickOpen(false);
    setNotificationsOpen(false);
    setSearch("");
  }, [location.pathname]);

  // Lock body scroll when sidebar drawer is open & handle Escape key
  useEffect(() => {
    if (!sidebarOpen) return;
    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && setSidebarOpen(false);
    window.addEventListener("keydown", onKey);
    return () => {
      document.body.style.overflow = prev;
      window.removeEventListener("keydown", onKey);
    };
  }, [sidebarOpen]);

  // Match the focused, role-aware mobile workflow. Secondary permitted pages
  // remain in More, but the primary five slots stay predictable.
  const mobilePrimaryNav = useMemo(() => {
    const preferredPaths = ownerLike || isFounder
      ? ["/dashboard", "/orders", "/confirmation", "/finance"]
      : ["/dashboard", "/orders", "/confirmation", "/agent-invoices"];
    return preferredPaths
      .map((path) => accessiblePages.find((page) => page.to === path))
      .filter((page): page is PageEntry => Boolean(page))
      .map((page) => ({
      ...page,
      label:
        page.to === "/dashboard"
          ? "Home"
          : page.to === "/orders" && !(ownerLike || isFounder)
            ? "My Orders"
          : page.to === "/confirmation"
            ? "Confirmation"
            : page.to === "/finance"
              ? "Finance"
              : page.to === "/agent-invoices"
                ? "Invoices"
              : page.label.replace(" Management", "").replace(" Directory", ""),
    }));
  }, [accessiblePages, isFounder, ownerLike]);

  const moreTabActive =
    sidebarOpen ||
    !mobilePrimaryNav.some((page) => isActive(location.pathname, page.to));

  return (
    <>
      {/* ── Compact mobile header ─────────────────────────────────────────── */}
      <header className="mobile-topbar md:hidden">
        {/* Left Section: navigation plus the current context */}
        <div className="mobile-topbar__brand flex min-w-0 items-center gap-2.5">
          <button
            type="button"
            onClick={() => { haptic(); setSidebarOpen(true); }}
            className="mobile-icon-button bg-base-surface text-ink hover:text-brand border border-base-border/60 shadow-2xs active:scale-95 transition-all"
            aria-label="Open sidebar menu"
          >
            <Menu size={20} strokeWidth={2} />
          </button>

          <button
            type="button"
            onClick={() => { haptic(); setSidebarOpen(true); }}
            className="flex min-w-0 items-center gap-2 active:opacity-80 transition-opacity"
            aria-label="Open sidebar menu"
          >
            <img src={ecomosLogo} alt="Ecom OS" className="h-5 w-auto shrink-0 object-contain" />
            <span className="min-w-0 text-left leading-tight">
              <span className="block truncate text-[13px] font-bold text-ink">{currentTitle}</span>
              <span className="block truncate text-[10px] text-ink-muted">{workspace?.name || "Workspace"}</span>
            </span>
          </button>
        </div>

        {/* Right Section: Quick Action Tool + Search + In-place Notification Bell */}
        <div className="mobile-topbar__actions flex shrink-0 items-center gap-1.5">
          {/* Quick Action tool button */}
          <button
            type="button"
            onClick={() => { haptic(); setQuickOpen(true); }}
            className="mobile-icon-button bg-brand/10 text-brand border border-brand/20 shadow-2xs active:scale-95 transition-all"
            aria-label="Quick actions tool"
            title="Quick Actions"
          >
            <Plus size={19} strokeWidth={2.4} />
          </button>

          {/* Search button */}
          <button
            type="button"
            onClick={() => { haptic(); setSidebarOpen(true); }}
            className="mobile-icon-button"
            aria-label="Search pages & open menu"
          >
            <Search size={18} strokeWidth={2} />
          </button>

          {/* In-place Notification Bell */}
          <button
            type="button"
            onClick={() => { haptic(); setNotificationsOpen(true); }}
            className="mobile-icon-button relative"
            aria-label={unreadCount ? `${unreadCount} unread notifications` : "Notifications"}
          >
            <Bell size={18} strokeWidth={2} />
            {unreadCount > 0 && (
              <span className="absolute -right-1.5 -top-1.5 grid min-h-[18px] min-w-[18px] place-items-center rounded-full bg-[#f43f5e] px-1 text-[9px] font-black leading-none text-white ring-2 ring-base-surface">
                {unreadCount > 9 ? "9+" : unreadCount}
              </span>
            )}
          </button>
        </div>
      </header>

      {/* ── Mobile Slide-out Sidebar Navigation Drawer ──────────────────── */}
      {sidebarOpen && (
        <div className="mobile-navigation-overlay fixed inset-0 z-50 flex md:hidden">
          {/* Backdrop overlay */}
          <div
            className="fixed inset-0 bg-black/60 backdrop-blur-sm animate-backdrop-in"
            onClick={() => setSidebarOpen(false)}
            aria-hidden="true"
          />

          {/* Left Sidebar Drawer */}
          <aside
            className="relative z-10 flex h-dvh w-[min(88vw,340px)] max-w-full flex-col border-r border-base-border bg-base-surface shadow-2xl animate-sidebar-in outline-none"
            aria-label="Sidebar navigation menu"
          >
            {/* Drawer Header with Full Brand Logo */}
            <div className="flex items-center justify-between p-4 border-b border-base-border/50 bg-base-raised/40">
              <div className="flex items-center gap-2.5">
                <img src={ecomosLogo} alt="Ecom OS" className="h-6 w-auto object-contain" />
                <span className="inline-flex items-center gap-1 rounded-full border border-emerald-500/30 bg-emerald-500/10 px-2 py-0.5 text-[9.5px] font-extrabold text-emerald-600">
                  <span className="h-1.5 w-1.5 rounded-full bg-emerald-500 animate-pulse" />
                  LIVE STORE
                </span>
              </div>

              <button
                type="button"
                onClick={() => setSidebarOpen(false)}
                className="flex h-8 w-8 items-center justify-center rounded-xl bg-base-raised text-ink-muted hover:text-ink active:scale-95 transition-all"
                aria-label="Close sidebar menu"
              >
                <X size={18} />
              </button>
            </div>

            {/* Workspace & User Card */}
            <div className="mx-3 mt-3 p-3 rounded-2xl bg-gradient-to-br from-brand/8 via-base-raised/60 to-base-raised/30 border border-brand/15 flex items-center justify-between shadow-xs">
              <div className="flex items-center gap-2.5 min-w-0">
                <div className="flex h-9.5 w-9.5 shrink-0 items-center justify-center rounded-xl bg-gradient-to-br from-brand to-brand-accent text-white font-black text-xs shadow-xs">
                  {workspace?.name ? workspace.name.substring(0, 2).toUpperCase() : "WS"}
                </div>
                <div className="min-w-0">
                  <p className="text-[13px] font-extrabold text-ink truncate leading-tight">
                    {workspace?.name || "NURA Store"}
                  </p>
                  <p className="text-[10.5px] font-semibold text-ink-faint truncate">
                    {profile?.full_name || "Store Owner"} • {profile?.role || "Admin"}
                  </p>
                </div>
              </div>
              <button
                type="button"
                onClick={() => { setSidebarOpen(false); navigate("/settings"); }}
                className="p-1.5 rounded-lg text-ink-muted hover:text-brand hover:bg-brand/10 transition-colors"
                title="Workspace Settings"
              >
                <Settings size={16} />
              </button>
            </div>

            {/* Search Input */}
            <div className="px-3 pt-3 pb-1">
              <div className="relative">
                <Search size={15} className="absolute left-3 top-1/2 -translate-y-1/2 text-ink-faint pointer-events-none" />
                <input
                  type="text"
                  value={search}
                  onChange={(e) => setSearch(e.target.value)}
                  placeholder="Search all pages…"
                  className="w-full h-9.5 pl-9 pr-8 rounded-xl border border-base-border/70 bg-base-raised/60 text-[12.5px] text-ink placeholder:text-ink-faint/70 focus:border-brand focus:ring-2 focus:ring-brand/15 focus:outline-none transition-all"
                />
                {search && (
                  <button
                    type="button"
                    onClick={() => setSearch("")}
                    className="absolute right-2.5 top-1/2 -translate-y-1/2 text-ink-faint hover:text-ink"
                  >
                    <X size={14} />
                  </button>
                )}
              </div>
            </div>

            {/* Category Chips */}
            <div className="flex gap-1 overflow-x-auto px-3 py-2 scrollbar-none">
              {[
                ["all", `All (${accessiblePages.length})`],
                ...Object.entries(catLabel)
                  .filter(([k]) => accessiblePages.some((p) => p.cat === k))
                  .map(([k, v]) => [k, v]),
              ].map(([key, label]) => (
                <button
                  key={key}
                  type="button"
                  onClick={() => { haptic(); setCatFilter(key); }}
                  className={`shrink-0 px-2.5 py-1 rounded-lg text-[11px] font-bold transition-all ${
                    catFilter === key
                      ? "bg-brand text-white shadow-xs"
                      : "bg-base-raised text-ink-muted hover:text-ink border border-base-border/50"
                  }`}
                >
                  {label}
                </button>
              ))}
            </div>

            {/* Nav Pages List */}
            <div className="flex-1 overflow-y-auto px-3 py-1 space-y-4 overscroll-contain">
              {Object.entries(catLabel).map(([catKey, catName]) => {
                const catPages = filtered.filter((p) => p.cat === catKey);
                if (catPages.length === 0) return null;

                return (
                  <div key={catKey} className="space-y-1">
                    <div className="px-2 pt-1 pb-1 flex items-center justify-between text-[10.5px] font-extrabold uppercase tracking-wider text-ink-faint/80">
                      <span>{catName}</span>
                      <span className="text-[9.5px] font-bold text-ink-faint/60">({catPages.length})</span>
                    </div>

                    <div className="space-y-0.5">
                      {catPages.map(({ to, label, desc, icon: I, image }) => {
                        const act = isActive(location.pathname, to);
                        return (
                          <button
                            key={to}
                            type="button"
                            onPointerDown={getPrefetchHandler(to)}
                            onClick={() => {
                              haptic();
                              setSidebarOpen(false);
                              navigate(to);
                            }}
                            className={`w-full flex items-center gap-3 px-3 py-2.5 rounded-xl border transition-all text-left active:scale-[0.98] ${
                              act
                                ? "border-brand/40 bg-brand/10 text-brand shadow-xs font-bold"
                                : "border-transparent text-ink hover:bg-base-raised/60 hover:border-base-border/40"
                            }`}
                          >
                            <span
                              className={`flex h-8.5 w-8.5 shrink-0 items-center justify-center rounded-lg border transition-colors ${
                                act
                                  ? "bg-brand text-white border-brand shadow-xs"
                                  : "bg-base-raised text-ink-muted border-base-border/50"
                              }`}
                            >
                              {image ? (
                                <img src={image} alt="" className="h-[18px] w-[18px] rounded-[4px]" />
                              ) : (
                                <I size={17} strokeWidth={2} />
                              )}
                            </span>
                            <div className="min-w-0 flex-1">
                              <div className="flex items-center justify-between">
                                <span className={`text-[13px] leading-tight truncate ${act ? "font-extrabold text-brand" : "font-semibold text-ink"}`}>
                                  {label}
                                </span>
                                {to === "/notifications" && unreadCount > 0 && (
                                  <span className="ml-2 rounded-full bg-[#f43f5e] px-1.5 py-0.5 text-[9px] font-black text-white">
                                    {unreadCount}
                                  </span>
                                )}
                              </div>
                              <p className="text-[10.5px] text-ink-faint truncate leading-tight mt-0.5">
                                {desc}
                              </p>
                            </div>
                            <ChevronRight
                              size={14}
                              className={`shrink-0 transition-transform ${act ? "text-brand translate-x-0.5" : "text-ink-faint/40"}`}
                            />
                          </button>
                        );
                      })}
                    </div>
                  </div>
                );
              })}

              {filtered.length === 0 && (
                <div className="py-8 text-center">
                  <p className="text-xs font-bold text-ink-muted">No pages match "{search}"</p>
                  <button
                    type="button"
                    onClick={() => { setSearch(""); setCatFilter("all"); }}
                    className="mt-2 text-[11px] font-extrabold text-brand underline"
                  >
                    Clear search filter
                  </button>
                </div>
              )}
            </div>

            {/* Sidebar Footer */}
            <div className="p-3 border-t border-base-border/50 bg-base-raised/40 space-y-2">
              {!isStandalone && (installPrompt || isIos) && (
                <button
                  type="button"
                  onClick={() => { haptic(); setInstallOpen(true); }}
                  className="flex w-full items-center justify-between rounded-xl border border-brand/20 bg-brand/5 px-3 py-2 text-left text-[11.5px] font-bold text-brand"
                >
                  <span className="inline-flex items-center gap-1.5"><Download size={14} /> Install Ecom OS</span>
                  <ChevronRight size={14} />
                </button>
              )}
              {can("orders", "Orders") && (
                <div className="grid grid-cols-2 gap-1.5">
                  <button
                    type="button"
                    onClick={() => {
                      haptic();
                      setSidebarOpen(false);
                      navigate("/orders", { state: { createOrder: true } });
                    }}
                    className="flex items-center justify-center gap-1.5 py-2 px-2.5 rounded-xl bg-brand text-white text-[11.5px] font-bold shadow-xs active:scale-95 transition-all"
                  >
                    <Plus size={14} strokeWidth={2.5} />
                    <span>New Order</span>
                  </button>
                  <button
                    type="button"
                    onClick={() => {
                      haptic();
                      setSidebarOpen(false);
                      onScan();
                    }}
                    className="flex items-center justify-center gap-1.5 py-2 px-2.5 rounded-xl bg-base-raised border border-base-border text-ink text-[11.5px] font-bold active:scale-95 transition-all"
                  >
                    <ScanLine size={14} />
                    <span>Scan QR</span>
                  </button>
                </div>
              )}

              <div className="flex items-center justify-between pt-1">
                {can("settings", "Settings") && (
                  <button
                    type="button"
                    onClick={() => {
                      haptic();
                      setSidebarOpen(false);
                      navigate("/settings");
                    }}
                    className="flex items-center gap-1.5 text-[11px] font-semibold text-ink-muted hover:text-ink"
                  >
                    <Settings size={14} /> Workspace Settings
                  </button>
                )}

                <button
                  type="button"
                  onClick={() => {
                    haptic();
                    setSidebarOpen(false);
                    void signOut();
                  }}
                  className="flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg text-[11px] font-bold text-danger bg-danger/5 border border-danger/15 active:scale-95"
                >
                  <LogOut size={13} /> Sign out
                </button>
              </div>
            </div>
          </aside>
        </div>
      )}

      {/* ── In-place Notifications Drawer Sheet ─────────────────────────── */}
      <MobileBottomSheet
        isOpen={notificationsOpen}
        onClose={() => setNotificationsOpen(false)}
        title="Notifications"
      >
        <div className="space-y-3">
          <div className="flex items-center justify-between pb-2 border-b border-base-border/50">
            <span className="text-xs font-bold text-ink-muted">
              {unreadCount ? `${unreadCount} unread` : "All caught up"}
            </span>
            {unreadCount > 0 && (
              <button
                type="button"
                onClick={() => void markAllAsRead()}
                className="text-xs font-bold text-brand hover:underline"
              >
                Mark all as read
              </button>
            )}
          </div>

          <div className="max-h-[360px] overflow-y-auto space-y-2 pr-0.5">
            {notifications.length === 0 ? (
              <div className="py-8 text-center text-ink-muted">
                <Bell size={24} className="mx-auto mb-2 opacity-40" />
                <p className="text-xs font-semibold">No notifications yet</p>
              </div>
            ) : (
              notifications.map((item) => (
                <button
                  key={item.id}
                  type="button"
                  onClick={() => {
                    setNotificationsOpen(false);
                    void openNotification(item);
                  }}
                  className={`w-full text-left p-3 rounded-xl border transition-all flex items-start gap-3 active:scale-[0.98] ${
                    item.is_read
                      ? "bg-base-raised/30 border-base-border/50 opacity-80"
                      : "bg-brand/5 border-brand/20 font-medium"
                  }`}
                >
                  <span
                    className={`mt-0.5 grid h-7 w-7 shrink-0 place-items-center rounded-lg ${
                      item.is_read ? "bg-base-raised text-ink-muted" : "bg-brand text-white shadow-2xs"
                    }`}
                  >
                    <Bell size={14} />
                  </span>
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center justify-between gap-2">
                      <span className="text-[12.5px] font-bold text-ink truncate">
                        {item.title || "Notification"}
                      </span>
                      <span className="text-[10px] text-ink-faint shrink-0">
                        {new Date(item.created_at).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}
                      </span>
                    </div>
                    <p className="text-[11.5px] text-ink-muted line-clamp-2 mt-0.5">{item.message}</p>
                  </div>
                </button>
              ))
            )}
          </div>

          <div className="pt-2 border-t border-base-border/50 text-center">
            <button
              type="button"
              onClick={() => {
                setNotificationsOpen(false);
                navigate("/notifications");
              }}
              className="text-xs font-bold text-brand hover:underline"
            >
              View full notifications page →
            </button>
          </div>
        </div>
      </MobileBottomSheet>

      {/* ── Phone / PWA bottom navigation ──────────────────────────────── */}
      <nav
        className="mobile-bottom-nav md:hidden"
        aria-label="Main navigation"
        style={{ gridTemplateColumns: `repeat(${Math.max(mobilePrimaryNav.length + 1, 2)}, minmax(0, 1fr))` }}
      >
        {mobilePrimaryNav.map(({ to, label, icon: Icon }) => (
          <NavLink
            key={to}
            to={to}
            onPointerDown={getPrefetchHandler(to)}
            onMouseEnter={getPrefetchHandler(to)}
            onClick={haptic}
            className={({ isActive: active }) => `mobile-nav-item ${active ? "is-active" : ""}`}
          >
            <Icon size={20} strokeWidth={1.9} />
            <span>{label}</span>
          </NavLink>
        ))}

        {/* All remaining, permission-filtered destinations live here. */}
        <button
          type="button"
          onClick={() => { haptic(); setSidebarOpen(true); }}
          className={`mobile-nav-item ${moreTabActive ? "is-active" : ""}`}
          aria-label="More pages"
          aria-haspopup="dialog"
        >
          <LayoutGrid size={20} strokeWidth={1.8} />
          <span>More</span>
        </button>
      </nav>

      {/* ── Quick Actions Sheet ─────────────────────────────────────────── */}
      <MobileBottomSheet
        isOpen={quickOpen}
        onClose={() => setQuickOpen(false)}
        title="Quick Actions"
      >
        <div className="grid grid-cols-2 gap-2 pb-1">
          {can("orders", "Orders") && (
            <button
              type="button"
              onPointerDown={getPrefetchHandler("/orders")}
              onClick={() => { haptic(); setQuickOpen(false); navigate("/orders", { state: { createOrder: true } }); }}
              className="flex min-h-[100px] flex-col justify-between rounded-2xl border border-brand/30 bg-brand/8 p-3 text-left active:scale-[0.97]"
            >
              <span className="grid h-9 w-9 place-items-center rounded-xl bg-brand text-white"><Plus size={18} /></span>
              <div>
                <span className="block text-[12.5px] font-bold text-ink">New Order</span>
                <span className="text-[10.5px] text-ink-muted">Manual COD order</span>
              </div>
            </button>
          )}
          {can("confirmation", "Confirmation") && (
            <button
              type="button"
              onPointerDown={getPrefetchHandler("/confirmation")}
              onClick={() => { haptic(); setQuickOpen(false); navigate("/confirmation"); }}
              className="flex min-h-[100px] flex-col justify-between rounded-2xl border border-base-border bg-base-raised/50 p-3 text-left active:scale-[0.97]"
            >
              <span className="grid h-9 w-9 place-items-center rounded-xl bg-emerald-500/12 text-emerald-600"><ClipboardCheck size={18} /></span>
              <div>
                <span className="block text-[12.5px] font-bold text-ink">Confirm</span>
                <span className="text-[10.5px] text-ink-muted">Open call queue</span>
              </div>
            </button>
          )}
          {can("shipping", "Shipping") && shippingOn && (
            <button
              type="button"
              onPointerDown={getPrefetchHandler("/shipping")}
              onClick={() => { haptic(); setQuickOpen(false); navigate("/shipping"); }}
              className="flex min-h-[100px] flex-col justify-between rounded-2xl border border-base-border bg-base-raised/50 p-3 text-left active:scale-[0.97]"
            >
              <span className="grid h-9 w-9 place-items-center rounded-xl bg-sky-500/12 text-sky-600"><Truck size={18} /></span>
              <div>
                <span className="block text-[12.5px] font-bold text-ink">Shipping</span>
                <span className="text-[10.5px] text-ink-muted">Carrier dispatch & logs</span>
              </div>
            </button>
          )}
          {(can("inventory", "Inventory") || can("products", "Products")) && (
            <button
              type="button"
              onClick={() => { haptic(); setQuickOpen(false); onScan(); }}
              className="flex min-h-[100px] flex-col justify-between rounded-2xl border border-base-border bg-base-raised/50 p-3 text-left active:scale-[0.97]"
            >
              <span className="grid h-9 w-9 place-items-center rounded-xl bg-violet-500/12 text-violet-600"><ScanLine size={18} /></span>
              <div>
                <span className="block text-[12.5px] font-bold text-ink">Scan QR</span>
                <span className="text-[10.5px] text-ink-muted">Find order by code</span>
              </div>
            </button>
          )}
        </div>
      </MobileBottomSheet>

      <MobileBottomSheet isOpen={installOpen} onClose={() => setInstallOpen(false)} title="Install Ecom OS">
        <div className="space-y-4 text-sm text-ink-muted">
          <p>Install Ecom OS for a full-screen, app-like workspace with faster launch from your home screen.</p>
          {isIos ? <div className="rounded-xl border border-base-border bg-base-raised p-4"><p className="font-semibold text-ink">On iPhone or iPad</p><p className="mt-2 leading-6">Tap the <span className="inline-flex items-center gap-1 font-semibold text-ink"><Share size={14} /> Share</span> button in Safari, then choose <strong className="text-ink">Add to Home Screen</strong>.</p></div> : <button type="button" onClick={async () => { if (!installPrompt) return; await installPrompt.prompt(); await installPrompt.userChoice; setInstallPrompt(null); setInstallOpen(false); }} disabled={!installPrompt} className="inline-flex min-h-11 w-full items-center justify-center gap-2 rounded-xl bg-brand px-4 font-semibold text-white disabled:opacity-50"><Download size={16} /> Install app</button>}
          <p className="text-xs leading-5">Installation options depend on your browser. Ecom OS never asks for notification permission during installation.</p>
        </div>
      </MobileBottomSheet>
    </>
  );
}
