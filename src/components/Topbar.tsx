import { useEffect, useState, memo, useCallback } from "react";
import { Search, Bell, Menu } from "lucide-react";
import { openMobileDrawer } from "./Sidebar";
import { useLocation } from "react-router-dom";
import { useAuth } from "../hooks/useAuth";
import { useTheme } from "../hooks/useTheme";
import { getUserInitials } from "../services/avatarService";
import { ThemeToggle } from "./ThemeToggle";
import { ChangelogMenu } from "./ChangelogMenu";
import { useI18n, type TranslationKey } from "../i18n";

function useClock() {
  const [now, setNow] = useState(new Date());
  useEffect(() => {
    const id = setInterval(() => setNow(new Date()), 1000 * 30);
    return () => clearInterval(id);
  }, []);
  return now;
}

export const Topbar = memo(function Topbar() {
  const now = useClock();
  const {
    session,
    profile,
    signOut,
  } = useAuth();
  const { t, formatDate } = useI18n();
  const { isDark } = useTheme();

  const dateLabel = formatDate(now, {
    weekday: "short",
    day: "2-digit",
    month: "short",
  });
  const timeLabel = formatDate(now, { hour: "2-digit", minute: "2-digit" });

  const location = useLocation();

  const getPageTitle = (pathname: string): TranslationKey => {
    if (pathname === "/") return "navigation.dashboard";
    if (pathname.startsWith("/orders")) return "navigation.orders";
    if (pathname.startsWith("/products") || pathname.startsWith("/inventory")) return "navigation.productsInventory";
    if (pathname.startsWith("/customers")) return "navigation.customers";
    if (pathname.startsWith("/delivering")) return "navigation.delivering";
    if (pathname.startsWith("/shipping")) return "navigation.shipping";
    if (pathname.startsWith("/confirmation")) return "navigation.confirmation";
    if (pathname.startsWith("/expenses")) return "navigation.expenses";
    if (pathname.startsWith("/finance")) return "navigation.finance";
    if (pathname.startsWith("/scenario") || pathname.startsWith("/cod-scenarios")) return "navigation.codScenarios";
    if (pathname.startsWith("/ads-manager")) return "navigation.adsManager";
    if (pathname.startsWith("/tiktok-ads")) return "navigation.tiktokAds";
    if (pathname.startsWith("/team")) return "navigation.team";
    if (pathname.startsWith("/tools") || pathname.startsWith("/amine")) return "navigation.tools";
    // removed Ozon-specific page title — integrations removed
    if (pathname.startsWith("/settings")) return "navigation.settings";
    if (pathname.startsWith("/admin")) return "navigation.adminPlatform";
    return "navigation.menu";
  };

  const pageTitle = t(getPageTitle(location.pathname));

  return (
    <header
      className="flex flex-none items-center justify-between border-b border-brand-border bg-brand-background px-5 pb-3 pt-[calc(12px+env(safe-area-inset-top))] md:pb-0 md:pt-0 md:h-14"
    >
      {/* Mobile Topbar */}
      <div className="flex md:hidden flex-1 items-center justify-between w-full">
        <div className="flex items-center gap-3">
          <button
            type="button"
            onClick={openMobileDrawer}
            aria-label={t("topbar.openNavigation")}
            className="flex h-10 w-10 items-center justify-center rounded-xl text-ink-muted hover:bg-base-raised hover:text-ink transition-colors"
          >
            <Menu size={20} />
          </button>
          <h1 className="text-[17px] font-semibold tracking-tight text-ink">{pageTitle}</h1>
        </div>
        <div className="flex items-center gap-3">
          <ThemeToggle />
          <button
            aria-label={t("topbar.notifications")}
            className="rounded-full bg-brand-accent/10 p-1.5 text-brand-accent hover:bg-brand-accent/20"
          >
            <Bell size={18} />
          </button>
          <ChangelogMenu />
        </div>
      </div>

      {/* Desktop Topbar */}
      <div className="hidden md:flex flex-1 items-center justify-between w-full">
        <div className="relative w-[360px] max-w-[45vw]">
          <Search
            size={15}
            className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-ink-faint"
          />
          <input
            type="text"
            placeholder={t("topbar.searchPlaceholder")}
            className="w-full rounded-lg border border-brand-border bg-brand-panel py-[7px] pl-9 pr-3 text-[13px] text-text-main placeholder:text-ink-faint focus:border-brand-accent/50"
          />
        </div>

        <div className="flex items-center gap-4">
          <ThemeToggle />

          <div className="font-mono text-[12px] text-text-muted">
            {dateLabel} · {timeLabel}
          </div>
          <button
            aria-label={t("topbar.notifications")}
            className="rounded-lg p-2 text-text-muted hover:bg-base-raised hover:text-text-main"
          >
            <Bell size={16} />
          </button>
          <ChangelogMenu />
        </div>
      </div>
    </header >
  );
});
