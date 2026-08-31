import { useEffect, useMemo, useState } from "react";
import { NavLink, useLocation, useNavigate } from "react-router-dom";
import {
  Bell,
  Boxes,
  ChevronRight,
  CircleDollarSign,
  ClipboardCheck,
  Home,
  LogOut,
  Megaphone,
  MoreHorizontal,
  Package,
  ScanLine,
  Settings,
  SlidersHorizontal,
  Truck,
  Users,
  Wallet,
  WandSparkles,
  type LucideIcon,
} from "lucide-react";
import { useAuth } from "../hooks/useAuth";
import { isOwnerLikeRole } from "../lib/rbac";
import { isShippingModuleEnabled } from "../lib/shippingModule";
import type { TeamPermissions } from "../lib/types";
import { useNotifications } from "../contexts/NotificationContext";
import { getUserInitials } from "../services/avatarService";
import MobileBottomSheet from "./MobileBottomSheet";

type Icon = LucideIcon;

type MobileDestination = {
  to: string;
  label: string;
  description: string;
  icon: Icon;
  permission?: keyof TeamPermissions;
  requiresShipping?: boolean;
};

const secondaryDestinations: MobileDestination[] = [
  { to: "/confirmation", label: "Confirmation", description: "Confirm new orders", icon: ClipboardCheck, permission: "confirmation" },
  { to: "/shipping", label: "Shipping", description: "Create and track shipments", icon: Truck, permission: "shipping", requiresShipping: true },
  { to: "/customers", label: "Customers", description: "Customer history and details", icon: Users, permission: "customers" },
  { to: "/products-inventory", label: "Products & inventory", description: "Catalog, stock and variants", icon: Boxes, permission: "products" },
  { to: "/ads-manager", label: "Ads Manager", description: "Campaign performance", icon: Megaphone, permission: "ads" },
  { to: "/tiktok-ads", label: "TikTok Ads", description: "TikTok campaign performance", icon: Megaphone, permission: "tiktok_ads" },
  { to: "/expenses", label: "Expenses", description: "Track operating costs", icon: Wallet, permission: "expenses" },
  { to: "/finance", label: "Finance", description: "Revenue and profitability", icon: CircleDollarSign, permission: "expenses" },
  { to: "/cod-scenarios", label: "COD scenarios", description: "Model COD outcomes", icon: SlidersHorizontal, permission: "codscenarios" },
  { to: "/team", label: "Team", description: "Members and access", icon: Users, permission: "team" },
  { to: "/settings", label: "Settings", description: "Workspace and integrations", icon: Settings, permission: "settings" },
  { to: "/tools", label: "Tools", description: "Commerce utilities", icon: WandSparkles, permission: "settings" },
  { to: "/notifications", label: "Notifications", description: "Updates and activity", icon: Bell },
];

const routeTitles: Array<[string, string]> = [
  ["/products-inventory", "Products & inventory"],
  ["/settings/notifications", "Notification settings"],
  ["/cod-scenarios", "COD scenarios"],
  ["/confirmation", "Confirmation"],
  ["/delivering", "Delivering"],
  ["/shipping", "Shipping"],
  ["/customers", "Customers"],
  ["/ads-manager", "Ads Manager"],
  ["/tiktok-ads", "TikTok Ads"],
  ["/expenses", "Expenses"],
  ["/finance", "Finance"],
  ["/team", "Team"],
  ["/settings", "Settings"],
  ["/notifications", "Notifications"],
  ["/tools", "Tools"],
  ["/orders", "Orders"],
  ["/dashboard", "Dashboard"],
];

function isRouteActive(pathname: string, destination: string) {
  return pathname === destination || pathname.startsWith(`${destination}/`);
}

export function MobileAppChrome({ onScan }: { onScan: () => void }) {
  const navigate = useNavigate();
  const location = useLocation();
  const { profile, workspace, teamPermissions, signOut } = useAuth();
  const { unreadCount } = useNotifications();
  const [moreOpen, setMoreOpen] = useState(false);

  const ownerLike = isOwnerLikeRole(profile?.role);
  const shippingEnabled = isShippingModuleEnabled(workspace);
  const can = (permission?: keyof TeamPermissions) => !permission || ownerLike || Boolean(teamPermissions[permission]);
  const canScan = can("inventory") || can("products");

  const moreDestinations = useMemo(
    () => secondaryDestinations.filter((item) => can(item.permission) && (!item.requiresShipping || shippingEnabled)),
    [ownerLike, shippingEnabled, teamPermissions],
  );

  const pageTitle = routeTitles.find(([path]) => isRouteActive(location.pathname, path))?.[1] ?? "EcomOS";
  const initials = getUserInitials(profile?.full_name);

  useEffect(() => setMoreOpen(false), [location.pathname]);

  const primaryItems = [
    can("dashboard") ? { to: "/dashboard", label: "Home", icon: Home } : null,
    can("orders") ? { to: "/orders", label: "Orders", icon: Package } : null,
    can("shipping") && shippingEnabled ? { to: "/delivering", label: "Delivering", icon: Truck } : null,
  ].filter(Boolean) as Array<{ to: string; label: string; icon: Icon }>;

  return (
    <>
      <header className="mobile-topbar md:hidden">
        <button
          type="button"
          onClick={() => navigate("/settings")}
          className="mobile-context-control"
          aria-label="Open workspace settings"
        >
          <span className="mobile-avatar" aria-hidden="true">{initials}</span>
          <span className="min-w-0 text-left">
            <span className="block truncate text-[10px] font-semibold uppercase tracking-[0.12em] text-ink-faint">
              {workspace?.name || "Workspace"}
            </span>
            <span className="block truncate text-[15px] font-bold leading-tight text-ink">{pageTitle}</span>
          </span>
        </button>

        <button
          type="button"
          onClick={() => navigate("/notifications")}
          className="mobile-icon-button relative"
          aria-label={unreadCount ? `${unreadCount} unread notifications` : "Notifications"}
        >
          <Bell size={19} />
          {unreadCount > 0 && (
            <span className="absolute right-1.5 top-1.5 grid min-h-4 min-w-4 place-items-center rounded-full bg-danger px-1 text-[9px] font-bold leading-none text-white">
              {unreadCount > 9 ? "9+" : unreadCount}
            </span>
          )}
        </button>
      </header>

      <nav className="mobile-bottom-nav md:hidden" aria-label="Primary navigation">
        {primaryItems.slice(0, 2).map(({ to, label, icon: ItemIcon }) => (
          <NavLink key={to} to={to} className={({ isActive }) => `mobile-nav-item ${isActive ? "is-active" : ""}`}>
            <ItemIcon size={21} strokeWidth={2} />
            <span>{label}</span>
          </NavLink>
        ))}

        {canScan && (
          <button type="button" onClick={onScan} className="mobile-scan-action" aria-label="Scan inventory QR code">
            <span><ScanLine size={24} strokeWidth={2.2} /></span>
            <small>Scan</small>
          </button>
        )}

        {primaryItems.slice(2).map(({ to, label, icon: ItemIcon }) => (
          <NavLink key={to} to={to} className={({ isActive }) => `mobile-nav-item ${isActive ? "is-active" : ""}`}>
            <ItemIcon size={21} strokeWidth={2} />
            <span>{label}</span>
          </NavLink>
        ))}

        <button
          type="button"
          onClick={() => setMoreOpen(true)}
          className={`mobile-nav-item ${moreOpen || moreDestinations.some((item) => isRouteActive(location.pathname, item.to)) ? "is-active" : ""}`}
          aria-haspopup="dialog"
          aria-expanded={moreOpen}
        >
          <MoreHorizontal size={21} strokeWidth={2} />
          <span>More</span>
        </button>
      </nav>

      <MobileBottomSheet isOpen={moreOpen} onClose={() => setMoreOpen(false)} title="More">
        <nav className="grid grid-cols-2 gap-2 pb-2" aria-label="All available sections">
          {moreDestinations.map(({ to, label, description, icon: ItemIcon }) => {
            const active = isRouteActive(location.pathname, to);
            return (
              <button
                type="button"
                key={to}
                onClick={() => navigate(to)}
                className={`group flex min-h-[104px] flex-col items-start rounded-2xl border p-3 text-left transition active:scale-[0.98] ${active ? "border-brand/40 bg-brand/10" : "border-base-border bg-base-raised/55"}`}
              >
                <span className={`grid h-9 w-9 place-items-center rounded-xl ${active ? "bg-brand text-white" : "bg-base-surface text-ink-muted"}`}>
                  <ItemIcon size={17} />
                </span>
                <span className="mt-2 flex w-full items-center gap-1 text-[13px] font-bold text-ink">
                  <span className="min-w-0 flex-1 truncate">{label}</span><ChevronRight size={13} className="shrink-0 text-ink-faint" />
                </span>
                <span className="mt-0.5 line-clamp-2 text-[11px] leading-4 text-ink-faint">{description}</span>
              </button>
            );
          })}
        </nav>
        <button
          type="button"
          onClick={() => void signOut()}
          className="mt-2 flex min-h-12 w-full items-center justify-center gap-2 rounded-xl border border-danger/20 bg-danger/5 px-4 text-sm font-bold text-danger"
        >
          <LogOut size={17} /> Sign out
        </button>
      </MobileBottomSheet>
    </>
  );
}
