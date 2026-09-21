import { lazy, Suspense, useEffect, useState, useRef } from "react";
import { Outlet, useLocation, useNavigate } from "react-router-dom";
import { Sidebar } from "./Sidebar";
import { EnhancedHeader } from "./EnhancedHeader";
import { ToastContainer, toast } from "./Toast";
import { AdminPreviewBanner } from "./AdminPreviewBanner";
import { SupportTicketLauncher } from "./SupportTicketLauncher";
import { AnnouncementTray } from "./AnnouncementTray";
import { ActivityTracker } from "./ActivityTracker";
import { PageContent } from "./PageContent";
import { DemoBanner } from "./DemoBanner";
import { useAuth } from "../hooks/useAuth";
import { useTheme } from "../hooks/useTheme";
import { supabase } from "../lib/supabase";
import { RefreshCw } from "lucide-react";
import { MobileAppChrome } from "./MobileAppChrome";
import { OfflineBanner } from "./ErrorStates";
import { isFounder } from "../lib/rbac";
import { metaAdsService } from "../services/metaAdsService";

const InventoryQRScanner = lazy(async () => {
  const module = await import("./inventory/InventoryQRScanner");
  return { default: module.InventoryQRScanner };
});

function MobilePlanGate() {
  const { workspace, profile, session, isDemoMode } = useAuth();
  const [allowed, setAllowed] = useState<boolean | null>(null);
  const founder = isFounder(profile?.role, session?.user.email);

  useEffect(() => {
    if (isDemoMode || founder) {
      setAllowed(true);
      return;
    }
    if (!workspace?.id) {
      setAllowed(false);
      return;
    }

    let active = true;
    const check = async () => {
      try {
        const { data } = await supabase.rpc("has_workspace_entitlement_v1", {
          p_workspace_id: workspace.id,
          p_entitlement_key: "mobile_app",
        });
        if (active) setAllowed(data === true);
      } catch {
        if (active) setAllowed(false);
      }
    };
    void check();
    const channel = supabase
      .channel(`mobile-plan-entitlement:${workspace.id}`)
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "subscription_plans" },
        () => void check(),
      )
      .subscribe();
    return () => {
      active = false;
      void supabase.removeChannel(channel);
    };
  }, [founder, isDemoMode, workspace?.id]);

  return allowed === true ? null : (
    <div
      className="mobile-plan-gate fixed inset-0 z-[1000] bg-white md:hidden"
      aria-hidden="true"
    />
  );
}

function PullToRefresh({
  children,
  lockScroll = false,
}: {
  children: React.ReactNode;
  lockScroll?: boolean;
}) {
  const containerRef = useRef<HTMLDivElement>(null);
  const indicatorRef = useRef<HTMLDivElement>(null);
  const contentRef = useRef<HTMLDivElement>(null);
  const iconRef = useRef<SVGSVGElement>(null);
  const startY = useRef<number | null>(null);
  const pullProgress = useRef(0);
  const refreshing = useRef(false);
  const animationFrame = useRef<number | null>(null);
  const refreshTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    // Only enable on mobile viewports (approx)
    if (window.innerWidth > 768) return;

    const el = containerRef.current;
    if (!el) return;

    const paint = (progress: number, settle = false) => {
      pullProgress.current = progress;
      const indicator = indicatorRef.current;
      const content = contentRef.current;
      const icon = iconRef.current;
      const transition = settle ? "transform 120ms ease-out" : "none";

      if (indicator) {
        indicator.style.height = progress > 0 ? `${progress + 20}px` : "0px";
        indicator.style.opacity = String(progress / 80);
      }
      if (content) {
        content.style.transition = transition;
        // A transform on an ancestor changes the containing block for fixed
        // descendants. Keep it only while the user is actively pulling so
        // dialogs and drawers remain viewport-fixed at rest.
        content.style.transform = progress > 0 ? `translate3d(0, ${progress}px, 0)` : "";
        content.style.willChange = progress > 0 ? "transform" : "";
      }
      if (icon && !refreshing.current) {
        icon.style.transform = `rotate(${progress * 3}deg)`;
      }
    };

    const schedulePaint = (progress: number, settle = false) => {
      if (animationFrame.current !== null) {
        cancelAnimationFrame(animationFrame.current);
      }
      animationFrame.current = requestAnimationFrame(() => {
        animationFrame.current = null;
        paint(progress, settle);
      });
    };

    const onTouchStart = (e: TouchEvent) => {
      if (el.scrollTop <= 0) {
        startY.current = e.touches[0].clientY;
      }
    };

    const onTouchMove = (e: TouchEvent) => {
      if (startY.current !== null && el.scrollTop <= 0) {
        const y = e.touches[0].clientY;
        const delta = Math.max(0, y - startY.current);
        if (delta > 0) {
          // Adding exponential resistance to the pull
          const progress = Math.min(delta * 0.4, 80);
          schedulePaint(progress);
        }
      }
    };

    const onTouchEnd = () => {
      if (pullProgress.current >= 60 && !refreshing.current) {
        refreshing.current = true;
        iconRef.current?.classList.add("animate-spin", "text-brand");
        if (typeof navigator !== "undefined" && navigator.vibrate) {
          navigator.vibrate(20);
        }
        // Keep the application shell, route and scroll position intact. The
        // affected data stores already listen for this targeted refresh event.
        window.dispatchEvent(new Event("trigger-order-reload"));
        if (refreshTimer.current) clearTimeout(refreshTimer.current);
        refreshTimer.current = setTimeout(() => {
          refreshing.current = false;
          iconRef.current?.classList.remove("animate-spin", "text-brand");
        }, 240);
      }
      schedulePaint(0, true);
      startY.current = null;
    };

    el.addEventListener("touchstart", onTouchStart, { passive: true });
    el.addEventListener("touchmove", onTouchMove, { passive: true });
    el.addEventListener("touchend", onTouchEnd, { passive: true });
    el.addEventListener("touchcancel", onTouchEnd, { passive: true });

    return () => {
      el.removeEventListener("touchstart", onTouchStart);
      el.removeEventListener("touchmove", onTouchMove);
      el.removeEventListener("touchend", onTouchEnd);
      el.removeEventListener("touchcancel", onTouchEnd);
      if (animationFrame.current !== null) {
        cancelAnimationFrame(animationFrame.current);
      }
      if (refreshTimer.current) clearTimeout(refreshTimer.current);
    };
  }, []);

  return (
    <div
      ref={containerRef}
      className={`relative h-full min-h-0 w-full overscroll-contain ${lockScroll ? "overflow-hidden" : "overflow-y-auto"}`}
    >
      <div
        ref={indicatorRef}
        className="absolute top-0 left-0 z-50 flex h-0 w-full items-end justify-center overflow-hidden pb-3 opacity-0 pointer-events-none"
      >
        <div
          className="rounded-full border border-base-border bg-base-surface/80 p-2 text-ink shadow-lg backdrop-blur-md"
        >
          <RefreshCw
            ref={iconRef}
            size={16}
            style={{ transform: "rotate(0deg)" }}
          />
        </div>
      </div>
      <div
        ref={contentRef}
        className={`${lockScroll ? "h-full min-h-0" : "min-h-full"} w-full`}
      >
        {children}
      </div>
    </div>
  );
}

export function Layout() {
  const location = useLocation();
  const isWhatsAppInbox = location.pathname.startsWith("/whatsapp");
  const isLiveView = location.pathname.startsWith("/live-view");
  const [isOnline, setIsOnline] = useState(() =>
    typeof navigator === "undefined" ? true : navigator.onLine,
  );
  useEffect(() => {
    const online = () => setIsOnline(true);
    const offline = () => setIsOnline(false);
    window.addEventListener("online", online);
    window.addEventListener("offline", offline);
    return () => {
      window.removeEventListener("online", online);
      window.removeEventListener("offline", offline);
    };
  }, []);
  const navigate = useNavigate();
  const [scannerOpen, setScannerOpen] = useState(false);
  // Global haptic feedback
  useEffect(() => {
    const handleHaptic = (e: MouseEvent | TouchEvent) => {
      const target = e.target as HTMLElement;
      if (!target) return;
      const isClickable =
        target.closest(
          "button, a, [role='button'], input, select, textarea, label, [data-haptic]",
        );
      if (
        isClickable &&
        typeof navigator !== "undefined" &&
        navigator.vibrate
      ) {
        navigator.vibrate(10);
      }
    };
    document.addEventListener("click", handleHaptic, {
      capture: true,
      passive: true,
    });
    return () =>
      document.removeEventListener("click", handleHaptic, { capture: true });
  }, []);

  // Global Auto Sync timer (every 500ms) - works across all pages
  const { workspace, isDemoMode } = useAuth();
  const { setAccent } = useTheme();

  useEffect(() => {
    if (!workspace?.id) return;

    const storedAccent = localStorage.getItem(
      `ecom-scale-accent:${workspace.id}`,
    );
    if (
      storedAccent &&
      /^#([0-9A-Fa-f]{3}|[0-9A-Fa-f]{6})$/.test(storedAccent)
    ) {
      setAccent(storedAccent);
    }
  }, [workspace?.id, setAccent]);

  // ── Background Meta Sync on Dashboard date change ──────────────────────────
  // Listens for the dashboard-date-changed event (already dispatched by Dashboard.tsx),
  // debounces 400ms, calls the meta-sync Edge Function with the new date range,
  // then dispatches meta-sync-complete so useDashboardData reloads automatically.
  const syncAbortRef = useRef<{ cancelled: boolean } | null>(null);
  const syncDebounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  useEffect(() => {
    if (isDemoMode || !workspace?.id) return;
    let metaConnected = false;
    let disposed = false;
    void metaAdsService
      .status()
      .then((result) => {
        if (!disposed)
          metaConnected = [
            "connected",
            "syncing",
            "sync_failed",
            "permission_required",
          ].includes(result.state);
      })
      .catch(() => undefined);

    const handler = (e: Event) => {
      if (!metaConnected) return;
      const { from, to, rangeType } = (
        e as CustomEvent<{ from: string; to: string; rangeType: string }>
      ).detail;

      // Debounce: cancel pending timer and stale in-flight request
      if (syncDebounceRef.current) clearTimeout(syncDebounceRef.current);
      if (syncAbortRef.current) syncAbortRef.current.cancelled = true;

      syncDebounceRef.current = setTimeout(async () => {
        const token = { cancelled: false };
        syncAbortRef.current = token;

        // Build the same payload that AdsManager's handleSync uses
        const rangeMap: Record<string, string> = {
          today: "today",
          "7d": "last_7d",
          "14d": "last_14d",
          "30d": "last_30d",
        };
        const datePreset = rangeMap[rangeType] ?? "custom";
        const payload: Record<string, unknown> = { date_preset: datePreset };

        if (datePreset === "custom") {
          if (!from || !to) return; // can't sync without both dates
          payload.time_range = { since: from, until: to };
        }

        try {
          const { data, error: fnErr } = await supabase.functions.invoke(
            "meta-sync",
            { body: payload },
          );
          if (token.cancelled) return; // response arrived after a newer request started

          if (fnErr) {
            console.error("[Layout] Meta sync function error:", fnErr);
            throw new Error(fnErr.message);
          }

          // Handle structured error responses from the improved Edge Function
          if (data && typeof data === "object") {
            if (!data.success && data.stage) {
              // Structured error response
              let errorMessage = "Meta sync failed";

              switch (data.stage) {
                case "authentication":
                  errorMessage = `Authentication failed: ${data.reason}`;
                  break;
                case "authorization":
                  errorMessage = `Authorization failed: ${data.reason}`;
                  break;
                case "environment":
                  errorMessage = `Server configuration error: ${data.reason}`;
                  break;
                case "database":
                  errorMessage = `Database error: ${data.reason}`;
                  break;
                case "configuration":
                  errorMessage = `Meta configuration: ${data.reason}`;
                  break;
                case "meta_api":
                  errorMessage = `Meta API error: ${data.reason}`;
                  break;
                default:
                  errorMessage = data.details || data.reason || "Unknown error";
              }

              console.error("[Layout] Meta sync structured error:", data);
              toast.error(errorMessage, 6000);
              return;
            }

            if (data.token_expired) {
              toast.error(
                "Meta token expired — please reconnect in Meta Business Suite.",
                7000,
              );
              return;
            }

            if (data.error) {
              toast.error(`Meta auto-sync: ${data.error}`, 5000);
              return;
            }
          }

          // Signal useDashboardData (and AdsManager if mounted) to reload
          // Include currency in the event detail when available so Dashboard can format spend consistently
          const detail =
            data && typeof data === "object" && "currency" in data
              ? { currency: data.currency }
              : undefined;
          // Persist into a session-global variable so other components can read before an event listener runs
          try {
            if (detail && detail.currency) {
              (window as any).__meta_account_currency = detail.currency;
            }
          } catch (e) {
            // ignore
          }
          window.dispatchEvent(
            new CustomEvent("meta-sync-complete", { detail }),
          );
        } catch (err: any) {
          if (token.cancelled) return;
          // Silent fail on network errors — keep existing data, do not crash
          console.warn("[Layout] Background Meta sync failed:", err?.message);
          // Only show toast for non-abort errors
          if (!String(err?.message).includes("AbortError")) {
            toast.error(
              `Ad Spend sync failed: ${err?.message ?? "unknown error"}`,
              4000,
            );
          }
        }
      }, 400);
    };

    window.addEventListener("dashboard-date-changed", handler);
    return () => {
      disposed = true;
      window.removeEventListener("dashboard-date-changed", handler);
      if (syncDebounceRef.current) clearTimeout(syncDebounceRef.current);
      if (syncAbortRef.current) syncAbortRef.current.cancelled = true;
    };
  }, [isDemoMode, workspace?.id]);
  // ──────────────────────────────────────────────────────────────────────────

  useEffect(() => {
    // Skip in demo mode or when workspace is not loaded
    if (isDemoMode || !workspace?.id) return;

    // Google Sheet background sync now runs as a Supabase Edge Function called
    // by pg_cron every 5 minutes. No frontend polling is needed.
    //
    // The manual "pull to refresh" gesture dispatches trigger-order-reload,
    // which each data hook already listens to for a fresh DB fetch.
    //
    // Users who want an IMMEDIATE sync (e.g. they just added rows to the sheet)
    // can use the Refresh button in the Orders UI which calls the Edge Function
    // directly via supabase.functions.invoke('sync-google-sheets', { ... }).
  }, [isDemoMode, workspace?.id]);

  return (
    <div className="flex h-dvh min-h-0 w-full overflow-hidden bg-base-surface text-text-main">
      <MobilePlanGate />
      <Sidebar />
      <div className="flex min-h-0 min-w-0 flex-1 flex-col overflow-hidden bg-base-surface">
        <DemoBanner />
        <OfflineBanner online={isOnline} />
        <ActivityTracker />
        <div className="desktop-app-header hidden md:block">
          <EnhancedHeader />
        </div>
        <MobileAppChrome onScan={() => setScannerOpen(true)} />
        <AdminPreviewBanner />
        <AnnouncementTray />
        <main className="app-main min-h-0 min-w-0 flex-1 overflow-hidden bg-base-surface">
          <PullToRefresh lockScroll={isWhatsAppInbox || isLiveView}>
            <PageContent
              className={`h-full min-h-full ${isWhatsAppInbox || isLiveView ? "!p-0" : "mobile-page-content"}`}
            >
              <div
                key={location.pathname}
                className={`h-full min-h-full ${isWhatsAppInbox || isLiveView ? "" : "app-route-enter"}`}
              >
                <Outlet />
              </div>
            </PageContent>
          </PullToRefresh>
        </main>
      </div>
      {/* Global toast notifications — mounted once here, used from anywhere */}
      <SupportTicketLauncher />
      <ToastContainer />
      {scannerOpen ? (
        <Suspense fallback={null}>
          <InventoryQRScanner
            isOpen
            onClose={() => setScannerOpen(false)}
            onQRDetected={() => undefined}
            onViewOrder={(orderId) => {
              setScannerOpen(false);
              navigate("/orders", { state: { viewOrderId: orderId } });
            }}
          />
        </Suspense>
      ) : null}
    </div>
  );
}
