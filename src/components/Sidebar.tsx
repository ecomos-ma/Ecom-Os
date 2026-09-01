import { useState, memo, useEffect } from "react";
import { NavLink } from "react-router-dom";
import { getPrefetchHandler } from "../hooks/usePrefetch";
import { useAuth } from "../hooks/useAuth";
import { getUserInitials } from "../services/avatarService";
import { isShippingModuleEnabled } from "../lib/shippingModule";
import { isOwnerLikeRole } from "../lib/rbac";
import type { TeamPermissions } from "../lib/types";
import {
  LayoutDashboard,
  Package,
  ClipboardCheck,
  Truck,
  Users,
  Box,
  ChartBar,
  Music2,
  Wallet,
  Settings as SettingsIcon,
  Shield,
  AlertTriangle,
  Building2,
  CreditCard,
  ScrollText,
  Search,
  ChevronsLeft,
  ChevronsRight,
  Sparkles,
  Wand2,
  LogOut,
  Menu,
  X,
  type LucideIcon,
} from "lucide-react";
import ecomosLogo from "../assets/ecomos_logo_137x32.png";
import ecomosIconMark from "../assets/AppStore_iOS_1024x1024.webp";
import { useI18n, type TranslationKey } from "../i18n";

// ─── Nav Data ─────────────────────────────────────────────────────────────────

type NavItem = { to: string; labelKey: TranslationKey; icon: LucideIcon; permission?: keyof TeamPermissions };
type NavGroup = { labelKey: TranslationKey; links: NavItem[] };

const mainGroups: NavGroup[] = [
  {
    labelKey: "navigation.main",
    links: [
      { to: "/dashboard", labelKey: "navigation.dashboard", icon: LayoutDashboard, permission: "dashboard" },
      { to: "/orders", labelKey: "navigation.orders", icon: Package, permission: "orders" },
      { to: "/confirmation", labelKey: "navigation.confirmation", icon: ClipboardCheck, permission: "confirmation" },
      { to: "/delivering", labelKey: "navigation.delivering", icon: Truck, permission: "shipping" },
      { to: "/shipping", labelKey: "navigation.shipping", icon: Truck, permission: "shipping" },
    ],
  },
  {
    labelKey: "navigation.management",
    links: [
      { to: "/customers", labelKey: "navigation.customers", icon: Users, permission: "customers" },
      { to: "/products-inventory", labelKey: "navigation.productsInventory", icon: Box, permission: "products" },
      { to: "/ads-manager", labelKey: "navigation.adsManager", icon: ChartBar, permission: "ads" },
      { to: "/tiktok-ads", labelKey: "navigation.tiktokAds", icon: Music2, permission: "tiktok_ads" },
      { to: "/expenses", labelKey: "navigation.expenses", icon: Wallet, permission: "expenses" },
      { to: "/finance", labelKey: "navigation.finance", icon: Wallet, permission: "expenses" },
      { to: "/scenario", labelKey: "navigation.codScenarios", icon: ClipboardCheck, permission: "codscenarios" },
      { to: "/team", labelKey: "navigation.team", icon: Users, permission: "team" },
    ],
  },
  {
    labelKey: "navigation.system",
    links: [
      { to: "/settings", labelKey: "navigation.settings", icon: SettingsIcon, permission: "settings" },
      { to: "/tools", labelKey: "navigation.tools", icon: Wand2, permission: "settings" },
    ],
  },
];

const adminGroups: NavGroup[] = [
  {
    labelKey: "navigation.founder",
    links: [
      { to: "/admin", labelKey: "navigation.founderConsole", icon: Shield },
      { to: "/admin/errors", labelKey: "navigation.founderConsole", icon: AlertTriangle },
    ],
  },
];

// ─── Shared brand mark (used for the collapsed / mini sidebar) ───────────────

function BrandMark({ size = 36 }: { size?: number }) {
  return (
    <img
      src={ecomosIconMark}
      alt="EcomOS"
      width={size}
      height={size}
      draggable={false}
      className="h-full w-full select-none rounded-[10px] object-cover"
    />
  );
}

// ─── Components ───────────────────────────────────────────────────────────────

/** Single nav link — handles both expanded and collapsed states */
function NavLinkItem({
  link,
  collapsed,
  accent,
  onNavigate,
}: {
  link: NavItem;
  collapsed: boolean;
  accent?: boolean;
  onNavigate?: () => void;
}) {
  const { t } = useI18n();
  const label = t(link.labelKey);
  return (
    <NavLink
      to={link.to}
      end={link.to === "/dashboard" || link.to === "/admin"}
      title={collapsed ? label : undefined}
      aria-label={label}
      onMouseEnter={getPrefetchHandler(link.to)}
      onFocus={getPrefetchHandler(link.to)}
      onClick={onNavigate}
      className={({ isActive }) =>
        [
          "group relative flex items-center rounded-xl text-[13px] font-medium transition-all duration-150 outline-none",
          "focus-visible:ring-2 focus-visible:ring-brand/60 focus-visible:ring-offset-1",
          collapsed ? "justify-center px-0 py-2.5 w-11 mx-auto" : "gap-3 px-3.5 py-2.5",
          isActive
            ? collapsed
              ? "bg-brand text-white shadow-md shadow-brand/25"
              : "bg-brand/10 text-brand before:absolute before:left-0 before:top-1/2 before:-translate-y-1/2 before:h-5 before:w-0.5 before:rounded-full before:bg-brand"
            : "text-ink-muted hover:bg-base-raised/70 hover:text-ink",
        ].join(" ")
      }
    >
      {({ isActive }) => (
        <>
          <link.icon
            size={18}
            strokeWidth={1.8}
            className={
              isActive
                ? collapsed
                  ? "text-white flex-shrink-0"
                  : "text-brand flex-shrink-0"
                : accent
                  ? "text-brand/60 flex-shrink-0"
                  : "text-ink-faint flex-shrink-0 group-hover:text-ink-muted transition-colors"
            }
          />
          {!collapsed && (
            <span className="truncate leading-none">{label}</span>
          )}
          {/* Tooltip for collapsed */}
          {collapsed && (
            <span
              role="tooltip"
              className="pointer-events-none absolute left-[calc(100%+10px)] z-50 whitespace-nowrap rounded-lg bg-base-raised border border-base-border px-2.5 py-1.5 text-[11.5px] font-semibold text-ink shadow-lg opacity-0 transition-opacity duration-150 group-hover:opacity-100"
            >
              {label}
            </span>
          )}
        </>
      )}
    </NavLink>
  );
}

/** Group section with small-caps header */
function NavGroupSection({
  group,
  collapsed,
  onNavigate,
  isAdmin = false,
}: {
  group: NavGroup;
  collapsed: boolean;
  onNavigate?: () => void;
  isAdmin?: boolean;
}) {
  const { t } = useI18n();
  const groupLabel = t(group.labelKey);
  return (
    <div>
      {!collapsed && (
        <div className="mb-1 mt-1 px-3.5 text-[10px] font-semibold uppercase tracking-[0.18em] text-ink-faint/70">
          {isAdmin ? (
            <div className="flex items-center gap-1.5 text-brand/60"><Shield size={10} /> {groupLabel}</div>
          ) : (
            groupLabel
          )}
        </div>
      )}
      {collapsed && (
        <div className="mx-auto mb-1 mt-1 w-5 border-t border-base-border/60" />
      )}
      <div className="space-y-0.5">
        {group.links.map((link) => (
          <NavLinkItem
            key={link.to}
            link={link}
            collapsed={collapsed}
            onNavigate={onNavigate}
          />
        ))}
      </div>
    </div>
  );
}

// ─── Profile Footer ───────────────────────────────────────────────────────────

function ProfileFooter({
  collapsed,
  profile,
  session,
  signOut,
  subscriptionStatus,
}: {
  collapsed: boolean;
  profile: any;
  session: any;
  signOut: () => void;
  subscriptionStatus: string;
}) {
  const { t } = useI18n();
  const initials = getUserInitials(profile?.full_name);
  const avatarUrl = profile?.avatar_url;

  const handleUpgradeClick = () => {
    const message = encodeURIComponent("Bonjour, je veux débloquer le plan sur ECOM SCALE");
    window.open(`https://wa.me/212770877821?text=${message}`, '_blank');
  };

  if (collapsed) {
    return (
      <div className="flex flex-col items-center gap-2 border-t border-base-border/60 px-0 py-3">
        {/* Avatar in collapsed state */}
        <div className="relative h-9 w-9">
          {avatarUrl ? (
            <img
              src={avatarUrl}
              alt={t("settings.tab.account")}
              className="h-full w-full rounded-full object-cover border-2 border-brand/30"
            />
          ) : (
            <div className="flex h-full w-full items-center justify-center rounded-full bg-brand/20 text-[13px] font-bold text-brand border-2 border-brand/30">
              {initials}
            </div>
          )}
        </div>
        <button
          onClick={signOut}
          title={t("common.signOut")}
          aria-label={t("common.signOut")}
          className="flex h-9 w-9 items-center justify-center rounded-lg bg-base-raised text-ink-faint hover:text-danger hover:bg-danger/10 transition-colors"
        >
          <LogOut size={15} />
        </button>
      </div>
    );
  }

  return (
    <div className="border-t border-base-border/60 p-3 space-y-2">
      {/* User row */}
      <div className="flex items-center justify-between gap-2 rounded-xl px-2.5 py-2 hover:bg-base-raised/60 transition-colors">
        <div className="flex items-center gap-2.5 min-w-0">
          {/* Avatar in expanded state */}
          <div className="relative h-8 w-8 flex-shrink-0">
            {avatarUrl ? (
              <img
                src={avatarUrl}
                alt={t("settings.tab.account")}
                className="h-full w-full rounded-full object-cover border-2 border-brand/30"
              />
            ) : (
              <div className="flex h-full w-full items-center justify-center rounded-full bg-brand/20 text-[13px] font-bold text-brand border-2 border-brand/30">
                {initials}
              </div>
            )}
          </div>
          <div className="min-w-0">
            <div className="text-[12.5px] font-semibold text-ink truncate max-w-[110px]">
              {profile?.full_name ?? "User"}
            </div>
            <div className="text-[10.5px] text-ink-faint truncate max-w-[110px]">
              {session?.user?.email ?? profile?.role ?? "viewer"}
            </div>
          </div>
        </div>
        <button
          onClick={signOut}
          aria-label={t("common.signOut")}
          title={t("common.signOut")}
          className="flex h-7 w-7 flex-shrink-0 items-center justify-center rounded-lg text-ink-faint hover:text-danger hover:bg-danger/10 transition-colors"
        >
          <LogOut size={14} />
        </button>
      </div>
    </div>
  );
}

// ─── Inner Sidebar Content ────────────────────────────────────────────────────

function SidebarContent({
  collapsed,
  onNavigate,
}: {
  collapsed: boolean;
  onNavigate?: () => void;
}) {
  const { profile, session, signOut, subscriptionStatus, workspace, teamPermissions } = useAuth();
  const isAdmin = profile?.role === "founder" && session?.user?.email?.trim().toLowerCase() === "amineelaaouamecom@gmail.com";
  const ownerLike = isOwnerLikeRole(profile?.role);

  // Filter mainGroups based on workspace settings and permissions
  const filteredMainGroups = mainGroups.map(group => ({
    ...group,
    links: group.links.filter(link => {
      if (link.permission && !ownerLike && !teamPermissions[link.permission]) return false;
      if ((link.to === "/delivering" || link.to === "/shipping") && !isShippingModuleEnabled(workspace)) return false;
      // Hide "Shipping" link if shipping module is disabled OR show_shipping_column is false
      if (link.to === "/shipping") {
        return isShippingModuleEnabled(workspace) && workspace?.show_shipping_column === true;
      }
      // Delivering is always visible (not controlled by shipping module)
      if (link.to === "/tiktok-ads") {
        return teamPermissions.tiktok_ads;
      }
      return true;
    })
  })).filter(group => group.links.length > 0);

  return (
    <div className="flex h-full flex-col">
      {/* Scrollable nav */}
      <nav
        aria-label="Main navigation"
        className={[
          "flex-1 overflow-y-auto py-4 space-y-4 [scrollbar-width:thin] [scrollbar-color:var(--color-base-border)_transparent]",
          collapsed ? "px-1.5" : "px-3",
        ].join(" ")}
      >
        {filteredMainGroups.map((group) => (
          <NavGroupSection
            key={group.labelKey}
            group={group}
            collapsed={collapsed}
            onNavigate={onNavigate}
          />
        ))}

        {isAdmin && (
          <>
            <div className="mx-3 border-t border-dashed border-base-border/70" />
            {adminGroups.map((group) => (
              <NavGroupSection
                key={group.labelKey}
                group={group}
                collapsed={collapsed}
                onNavigate={onNavigate}
                isAdmin={true}
              />
            ))}
          </>
        )}
      </nav>

      {/* Profile footer */}
      <ProfileFooter
        collapsed={collapsed}
        profile={profile}
        session={session}
        signOut={signOut}
        subscriptionStatus={subscriptionStatus}
      />
    </div>
  );
}

// ─── Desktop Sidebar ──────────────────────────────────────────────────────────

const DesktopSidebar = memo(function DesktopSidebar({
  collapsed,
  setCollapsed,
}: {
  collapsed: boolean;
  setCollapsed: (v: boolean) => void;
}) {
  return (
    <aside
      className={[
        "relative hidden lg:flex h-screen flex-none flex-col border-r border-base-border bg-base-surface",
        "transition-[width] duration-200 ease-out z-30",
        collapsed ? "w-[72px]" : "w-[256px]",
      ].join(" ")}
      aria-label="Sidebar"
    >
      {/* Brand header */}
      <div
        className={[
          "flex items-center border-b border-base-border/70",
          collapsed ? "justify-center px-0 py-[18px]" : "justify-between px-4 py-[18px]",
        ].join(" ")}
      >
        {collapsed ? (
          /* Icon-only: show the app icon mark */
          <button
            type="button"
            onClick={() => setCollapsed(false)}
            aria-label="Expand sidebar"
            className="flex h-9 w-9 items-center justify-center overflow-hidden rounded-[10px] shadow-sm shadow-brand/25 transition-shadow hover:shadow-md"
          >
            <BrandMark />
          </button>
        ) : (
          <>
            <img
              src={ecomosLogo}
              alt="EcomOS"
              width={137}
              height={32}
              draggable={false}
              className="h-[45px] w-auto flex-shrink-0 select-none"
            />
            <button
              type="button"
              onClick={() => setCollapsed(true)}
              aria-label="Collapse sidebar"
              className="flex h-7 w-7 flex-none items-center justify-center rounded-lg text-ink-faint hover:bg-base-raised hover:text-ink transition-colors"
            >
              <ChevronsLeft size={15} />
            </button>
          </>
        )}
      </div>

      {/* Expand button when collapsed (floats on edge) */}
      {collapsed && (
        <button
          type="button"
          onClick={() => setCollapsed(false)}
          aria-label="Expand sidebar"
          className="absolute -right-3 top-[22px] flex h-6 w-6 items-center justify-center rounded-full border border-base-border bg-base-surface text-ink-faint shadow-sm hover:text-ink hover:border-brand/40 transition-colors z-50"
        >
          <ChevronsRight size={12} />
        </button>
      )}

      <SidebarContent collapsed={collapsed} />
    </aside>
  );
});

// ─── Tablet Sidebar (768–1023px) ──────────────────────────────────────────────

const TabletSidebar = memo(function TabletSidebar() {
  const [expanded, setExpanded] = useState(false);

  return (
    <aside
      onMouseEnter={() => setExpanded(true)}
      onMouseLeave={() => setExpanded(false)}
      className={[
        "relative hidden md:flex lg:hidden h-screen flex-none flex-col border-r border-base-border bg-base-surface",
        "transition-[width] duration-200 ease-out z-30",
        expanded ? "w-[256px]" : "w-[72px]",
      ].join(" ")}
      aria-label="Sidebar"
    >
      {/* Brand header */}
      <div
        className={[
          "flex items-center border-b border-base-border/70",
          expanded ? "justify-between px-4 py-[18px]" : "justify-center px-0 py-[18px]",
        ].join(" ")}
      >
        {expanded ? (
          <img
            src={ecomosLogo}
            alt="EcomOS"
            width={137}
            height={32}
            draggable={false}
            className="h-[45px] w-auto flex-shrink-0 select-none"
          />
        ) : (
          <div className="flex h-9 w-9 items-center justify-center overflow-hidden rounded-[10px] shadow-sm shadow-brand/25">
            <BrandMark />
          </div>
        )}
      </div>

      <SidebarContent collapsed={!expanded} />
    </aside>
  );
});

// ─── Mobile Drawer ────────────────────────────────────────────────────────────

export function MobileDrawerTrigger({
  onOpen,
}: {
  onOpen: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onOpen}
      aria-label="Open navigation"
      className="flex h-10 w-10 items-center justify-center rounded-xl text-ink-muted hover:bg-base-raised hover:text-ink transition-colors md:hidden"
    >
      <Menu size={20} />
    </button>
  );
}

function MobileDrawer({
  open,
  onClose,
}: {
  open: boolean;
  onClose: () => void;
}) {
  // Close on Escape
  useEffect(() => {
    if (!open) return;
    const handler = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, [open, onClose]);

  // Prevent body scroll when open
  useEffect(() => {
    if (open) {
      document.body.style.overflow = "hidden";
    } else {
      document.body.style.overflow = "";
    }
    return () => {
      document.body.style.overflow = "";
    };
  }, [open]);

  return (
    <>
      {/* Backdrop */}
      <div
        className={[
          "fixed inset-0 z-40 bg-black/40 backdrop-blur-sm transition-opacity duration-200 md:hidden",
          open ? "opacity-100 pointer-events-auto" : "opacity-0 pointer-events-none",
        ].join(" ")}
        aria-hidden="true"
        onClick={onClose}
      />

      {/* Drawer */}
      <div
        role="dialog"
        aria-modal="true"
        aria-label="Navigation menu"
        className={[
          "fixed inset-y-0 left-0 z-50 flex w-[280px] flex-col border-r border-base-border bg-base-surface shadow-2xl",
          "transition-transform duration-200 ease-out md:hidden",
          "pb-[env(safe-area-inset-bottom)]",
          open ? "translate-x-0" : "-translate-x-full",
        ].join(" ")}
      >
        {/* Drawer header with logo */}
        <div className="flex items-center justify-between border-b border-base-border/70 px-4 pt-[calc(16px+env(safe-area-inset-top))] pb-4">
          <img
            src={ecomosLogo}
            alt="EcomOS"
            width={120}
            height={28}
            draggable={false}
            className="h-[38px] w-auto select-none"
          />
          <button
            type="button"
            onClick={onClose}
            aria-label="Close navigation"
            className="flex h-9 w-9 items-center justify-center rounded-xl text-ink-faint hover:bg-base-raised hover:text-ink transition-colors"
          >
            <X size={18} />
          </button>
        </div>

        {/* Nav content */}
        <div className="flex-1 overflow-y-auto">
          <SidebarContent collapsed={false} onNavigate={onClose} />
        </div>
      </div>
    </>
  );
}

// ─── Unified Export ───────────────────────────────────────────────────────────

/**
 * useMobileDrawer — lightweight state hook so Topbar or Layout can
 * open the drawer without prop-drilling.
 */
let _setDrawerOpen: ((v: boolean) => void) | null = null;

export function openMobileDrawer() {
  _setDrawerOpen?.(true);
}

export const Sidebar = memo(function Sidebar() {
  const [collapsed, setCollapsed] = useState(false);
  const [mobileOpen, setMobileOpen] = useState(false);

  // Register global setter for the mobile drawer
  useEffect(() => {
    _setDrawerOpen = setMobileOpen;
    return () => {
      _setDrawerOpen = null;
    };
  }, []);

  return (
    <>
      {/* Desktop: lg+ */}
      <DesktopSidebar collapsed={collapsed} setCollapsed={setCollapsed} />

      {/* Tablet: md – lg (icon-only, expands on hover) */}
      <TabletSidebar />

      {/* Mobile drawer overlay */}
      <MobileDrawer open={mobileOpen} onClose={() => setMobileOpen(false)} />
    </>
  );
});
