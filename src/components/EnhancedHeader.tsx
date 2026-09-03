import { useState, useEffect, useCallback, useRef, memo } from "react";
import { useNavigate } from "react-router-dom";
import {
  Search,
  Bell,
  Menu,
  Zap,
  ChevronDown,
  Clock,
  Package,
  ShoppingCart,
  Users,
  Truck,
  AlertCircle,
  CheckCircle2,
  ArrowRight,
  Keyboard,
  LogOut,
  Settings,
  Loader2,
  Inbox,
  Plus,
  Building2,
  Sparkles,
  X,
  type LucideIcon,
} from "lucide-react";
import { useAuth } from "../hooks/useAuth";
import { useTheme } from "../hooks/useTheme";
import { useGlobalOrders } from "../contexts/OrdersContext";
import { supabase } from "../lib/supabase";
import { getUserInitials } from "../services/avatarService";
import { ThemeToggle } from "./ThemeToggle";
import { ChangelogMenu } from "./ChangelogMenu";
import { useNotifications } from "../contexts/NotificationContext";
import type { NotificationRecord } from "../notifications/types";

// ============================================================================
// SHARED ANIMATION / MOTION STYLES
// Injected once. Respects prefers-reduced-motion throughout.
// ============================================================================

const HEADER_STYLES = `
@keyframes chdr-panel-in {
  from { opacity: 0; transform: translateY(-6px) scale(0.98); }
  to { opacity: 1; transform: translateY(0) scale(1); }
}
@keyframes chdr-overlay-in {
  from { opacity: 0; transform: translateY(-10px) scale(0.97); }
  to { opacity: 1; transform: translateY(0) scale(1); }
}
@keyframes chdr-pulse-ring {
  0% { box-shadow: 0 0 0 0 rgba(239, 68, 68, 0.35); }
  70% { box-shadow: 0 0 0 6px rgba(239, 68, 68, 0); }
  100% { box-shadow: 0 0 0 0 rgba(239, 68, 68, 0); }
}
@keyframes chdr-shimmer {
  0% { background-position: -200% 0; }
  100% { background-position: 200% 0; }
}
.chdr-panel { animation: chdr-panel-in 140ms cubic-bezier(0.16, 1, 0.3, 1); transform-origin: top right; }
.chdr-overlay-panel { animation: chdr-overlay-in 160ms cubic-bezier(0.16, 1, 0.3, 1); }
.chdr-alert-live { animation: chdr-pulse-ring 2.2s cubic-bezier(0.4, 0, 0.6, 1) infinite; }
.chdr-skeleton {
  background: linear-gradient(90deg, rgba(120,120,120,0.10) 25%, rgba(120,120,120,0.18) 37%, rgba(120,120,120,0.10) 63%);
  background-size: 400% 100%;
  animation: chdr-shimmer 1.4s ease infinite;
}
@media (prefers-reduced-motion: reduce) {
  .chdr-panel, .chdr-overlay-panel, .chdr-alert-live, .chdr-skeleton { animation: none !important; }
}
`;

// ============================================================================
// OPERATIONS CENTER (Quick Actions)
// ============================================================================

interface OperationsCounts {
  pendingConfirmation: number;
  readyToShip: number;
  lowStock: number;
  todayOrders: number;
  todayDelivered: number;
}

function useOperationsCenter() {
  const { workspace } = useAuth();
  const { globalOrders } = useGlobalOrders();
  const [counts, setCounts] = useState<OperationsCounts>({
    pendingConfirmation: 0,
    readyToShip: 0,
    lowStock: 0,
    todayOrders: 0,
    todayDelivered: 0,
  });

  useEffect(() => {
    if (!workspace?.id || !globalOrders.length) {
      setCounts({
        pendingConfirmation: 0,
        readyToShip: 0,
        lowStock: 0,
        todayOrders: 0,
        todayDelivered: 0,
      });
      return;
    }

    const today = new Date();
    today.setHours(0, 0, 0, 0);

    const pendingConfirmation = globalOrders.filter(
      (o) => o.status === "pending" || o.status === "new"
    ).length;

    const readyToShip = globalOrders.filter((o) => o.status === "confirmed").length;

    const todayOrders = globalOrders.filter((o) => new Date(o.created_at) >= today).length;

    const todayDelivered = globalOrders.filter((o) => {
      const created = new Date(o.created_at);
      const isToday = created >= today;
      const isDelivered =
        o.status === "delivered" ||
        o.shipping_status?.toLowerCase() === "delivered" ||
        o.shipping_status?.toLowerCase() === "livré";
      return isToday && isDelivered;
    }).length;

    setCounts({
      pendingConfirmation,
      readyToShip,
      lowStock: 0, // Would need products data
      todayOrders,
      todayDelivered,
    });
  }, [workspace?.id, globalOrders]);

  const totalAlerts = counts.pendingConfirmation + counts.readyToShip + counts.lowStock;

  return { counts, totalAlerts };
}

function useModifierKeyLabel() {
  const [label, setLabel] = useState("Ctrl");
  useEffect(() => {
    const platform = typeof navigator !== "undefined" ? navigator.platform || navigator.userAgent : "";
    if (/Mac|iPhone|iPad|iPod/i.test(platform)) setLabel("⌘");
  }, []);
  return label;
}

// ============================================================================
// GLOBAL SEARCH OVERLAY
// ============================================================================

interface SearchResult {
  id: string;
  type: "order" | "customer" | "product";
  title: string;
  subtitle: string;
  status?: string;
  url: string;
}

const RESULT_STYLES: Record<SearchResult["type"], { icon: LucideIcon; classes: string }> = {
  order: { icon: ShoppingCart, classes: "bg-blue-500/10 text-blue-500" },
  customer: { icon: Users, classes: "bg-green-500/10 text-green-500" },
  product: { icon: Package, classes: "bg-purple-500/10 text-purple-500" },
};

const RESULT_GROUP_LABEL: Record<SearchResult["type"], string> = {
  order: "Orders",
  customer: "Customers",
  product: "Products",
};

function GlobalSearchOverlay({ isOpen, onClose }: { isOpen: boolean; onClose: () => void }) {
  const { workspace } = useAuth();
  const [query, setQuery] = useState("");
  const [results, setResults] = useState<SearchResult[]>([]);
  const [loading, setLoading] = useState(false);
  const [selectedIndex, setSelectedIndex] = useState(0);
  const navigate = useNavigate();
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (isOpen) {
      inputRef.current?.focus();
      setQuery("");
      setResults([]);
      setSelectedIndex(0);
    }
  }, [isOpen]);

  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (!isOpen) return;

      if (e.key === "Escape") {
        onClose();
      } else if (e.key === "ArrowDown") {
        e.preventDefault();
        setSelectedIndex((prev) => Math.min(prev + 1, results.length - 1));
      } else if (e.key === "ArrowUp") {
        e.preventDefault();
        setSelectedIndex((prev) => Math.max(prev - 1, 0));
      } else if (e.key === "Enter" && results[selectedIndex]) {
        navigate(results[selectedIndex].url);
        onClose();
      }
    };

    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [isOpen, results, selectedIndex, navigate, onClose]);

  const performSearch = useCallback(
    async (searchQuery: string) => {
      if (!searchQuery.trim() || !workspace?.id) {
        setResults([]);
        return;
      }

      setLoading(true);
      try {
        const searchResults: SearchResult[] = [];

        // Search orders
        const { data: orders } = await supabase
          .from("orders")
          .select("id, order_number, status, created_at, customer_id")
          .eq("workspace_id", workspace.id)
          .or(`order_number.ilike.%${searchQuery}%,phone.ilike.%${searchQuery}%`)
          .limit(5);

        if (orders) {
          orders.forEach((order) => {
            searchResults.push({
              id: order.id,
              type: "order",
              title: order.order_number || "Unknown order",
              subtitle: order.status || "Unknown status",
              status: order.status,
              url: `/orders`,
            });
          });
        }

        // Search customers
        const { data: customers } = await supabase
          .from("customers")
          .select("id, name, phone")
          .eq("workspace_id", workspace.id)
          .or(`name.ilike.%${searchQuery}%,phone.ilike.%${searchQuery}%`)
          .limit(5);

        if (customers) {
          customers.forEach((customer) => {
            searchResults.push({
              id: customer.id,
              type: "customer",
              title: customer.name,
              subtitle: customer.phone || "No phone",
              url: `/customers`,
            });
          });
        }

        setResults(searchResults);
      } catch (err) {
        console.error("Search failed:", err);
        setResults([]);
      } finally {
        setLoading(false);
      }
    },
    [workspace?.id]
  );

  useEffect(() => {
    const timeoutId = setTimeout(() => {
      performSearch(query);
    }, 300);

    return () => clearTimeout(timeoutId);
  }, [query, performSearch]);

  if (!isOpen) return null;

  // Group results by type, preserving first-seen order (orders, then customers, then products)
  const grouped = results.reduce<Record<string, SearchResult[]>>((acc, r) => {
    (acc[r.type] ||= []).push(r);
    return acc;
  }, {});
  let flatIndex = -1;

  return (
    <div
      className="fixed inset-0 z-50 flex items-start justify-center bg-black/50 px-4 pt-[14vh] backdrop-blur-sm"
      onClick={onClose}
    >
      <div
        role="dialog"
        aria-modal="true"
        aria-label="Search orders, customers, and products"
        className="chdr-overlay-panel w-full max-w-2xl overflow-hidden rounded-xl border border-base-border bg-base-surface shadow-2xl"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center gap-3 border-b border-base-border px-4 py-3">
          <Search size={18} className="shrink-0 text-ink-faint" />
          <input
            ref={inputRef}
            type="text"
            placeholder="Search orders, customers, products…"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            className="flex-1 bg-transparent text-[15px] text-ink outline-none placeholder:text-ink-faint"
          />
          {loading && <Loader2 size={15} className="animate-spin text-ink-faint" />}
          <kbd className="rounded border border-base-border bg-base-raised px-1.5 py-1 text-[11px] font-medium text-ink-faint">
            ESC
          </kbd>
        </div>

        <div className="max-h-[420px] overflow-y-auto py-1">
          {!loading && query && results.length === 0 && (
            <div className="flex flex-col items-center gap-2 py-12 text-center">
              <Inbox size={22} className="text-ink-faint" />
              <p className="text-sm text-ink-muted">
                No results for <span className="font-medium text-ink">"{query}"</span>
              </p>
              <p className="text-xs text-ink-faint">Try a name, order number, or phone number.</p>
            </div>
          )}

          {!query && (
            <div className="py-12 text-center text-sm text-ink-muted">
              Start typing to search orders, customers, and products.
            </div>
          )}

          {(Object.keys(grouped) as SearchResult["type"][]).map((type) => (
            <div key={type} className="px-2 py-1">
              <div className="px-2 pb-1 pt-2 text-[11px] font-medium uppercase tracking-wider text-ink-faint">
                {RESULT_GROUP_LABEL[type]}
              </div>
              {grouped[type].map((result) => {
                flatIndex += 1;
                const isSelected = flatIndex === selectedIndex;
                const { icon: Icon, classes } = RESULT_STYLES[result.type];
                return (
                  <button
                    key={result.id}
                    onClick={() => {
                      navigate(result.url);
                      onClose();
                    }}
                    onMouseEnter={() => setSelectedIndex(flatIndex)}
                    className={`flex w-full items-center gap-3 rounded-lg px-3 py-2.5 text-left transition-colors ${
                      isSelected ? "bg-base-raised" : "hover:bg-base-raised"
                    }`}
                  >
                    <div className={`rounded-lg p-2 ${classes}`}>
                      <Icon size={16} />
                    </div>
                    <div className="min-w-0 flex-1">
                      <div className="truncate text-sm font-medium text-ink">{result.title}</div>
                      <div className="truncate text-xs text-ink-muted">{result.subtitle}</div>
                    </div>
                    <ArrowRight size={15} className="shrink-0 text-ink-faint" />
                  </button>
                );
              })}
            </div>
          ))}
        </div>

        <div className="flex items-center gap-4 border-t border-base-border px-4 py-2 text-xs text-ink-muted">
          <div className="flex items-center gap-1">
            <Keyboard size={12} />
            <span>↑↓ to navigate</span>
          </div>
          <div className="flex items-center gap-1">
            <Keyboard size={12} />
            <span>Enter to select</span>
          </div>
          <div className="flex items-center gap-1">
            <Keyboard size={12} />
            <span>Esc to close</span>
          </div>
        </div>
      </div>
    </div>
  );
}

// ============================================================================
// SMALL SHARED PIECES
// ============================================================================

const ICON_BUTTON_CLASSES =
  "relative rounded-xl p-2 text-ink transition-colors hover:bg-base-raised focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-pink-500/50 focus-visible:ring-offset-2 focus-visible:ring-offset-base-surface";

function CountBadge({ count }: { count: number }) {
  if (count <= 0) return null;
  return (
    <span className="absolute -top-0.5 -right-0.5 flex h-4 min-w-[16px] items-center justify-center rounded-full bg-red-500 px-1 text-[10px] font-bold leading-none text-white">
      {count > 9 ? "9+" : count}
    </span>
  );
}

function NotificationSkeletonRow() {
  return (
    <div className="flex items-start gap-3 px-4 py-3">
      <div className="chdr-skeleton h-9 w-9 shrink-0 rounded-lg" />
      <div className="flex-1 space-y-2 pt-0.5">
        <div className="chdr-skeleton h-3 w-2/3 rounded" />
        <div className="chdr-skeleton h-2.5 w-4/5 rounded" />
      </div>
    </div>
  );
}

// ============================================================================
// MAIN HEADER COMPONENT
//
// Right-side order (left → right): Workspace Switcher → Notifications →
// Quick Actions (Operations Center) → Theme Toggle → Changelog → Profile.
// Profile stays as the last (far-right) element by design.
// ============================================================================

interface EnhancedHeaderProps {
  /** Optional hook for a parent layout to open/close a mobile sidebar. */
  onMenuClick?: () => void;
}

export const EnhancedHeader = memo(function EnhancedHeader({ onMenuClick }: EnhancedHeaderProps) {
  const navigate = useNavigate();
  const { session, profile, workspace, availableWorkspaces, switchWorkspace, createWorkspace, refreshProfile, signOut, teamPermissions } =
    useAuth();
  const { isDark } = useTheme();
  const { notifications, unreadCount, loading: notificationsLoading, openNotification, markAllAsRead } =
    useNotifications();
  const { counts, totalAlerts } = useOperationsCenter();
  const modKey = useModifierKeyLabel();

  // Dropdown states
  const [searchOpen, setSearchOpen] = useState(false);
  const [workspaceOpen, setWorkspaceOpen] = useState(false);
  const [workspaceAllowance, setWorkspaceAllowance] = useState<{ used: number; limit: number | null; allowed: boolean } | null>(null);
  const [newWorkspaceName, setNewWorkspaceName] = useState("");
  const [creatingWorkspace, setCreatingWorkspace] = useState(false);
  const [showWorkspaceCreator, setShowWorkspaceCreator] = useState(false);
  const [operationsOpen, setOperationsOpen] = useState(false);
  const [notificationsOpen, setNotificationsOpen] = useState(false);
  const [profileOpen, setProfileOpen] = useState(false);

  const closeAllMenus = useCallback(() => {
    setWorkspaceOpen(false);
    setOperationsOpen(false);
    setNotificationsOpen(false);
    setProfileOpen(false);
  }, []);

  // Keyboard shortcut for search (⌘K / Ctrl+K), Esc closes any open menu
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === "k") {
        e.preventDefault();
        setSearchOpen(true);
        return;
      }
      if (e.key === "Escape") {
        closeAllMenus();
      }
    };

    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [closeAllMenus]);

  // Close all dropdowns when clicking outside
  useEffect(() => {
    document.addEventListener("click", closeAllMenus);
    return () => document.removeEventListener("click", closeAllMenus);
  }, [closeAllMenus]);

  const handleOperationClick = (type: string) => {
    switch (type) {
      case "pending-confirmation":
        navigate("/confirmation");
        break;
      case "ready-to-ship":
        navigate("/shipping");
        break;
      case "low-stock":
        navigate("/products");
        break;
    }
    setOperationsOpen(false);
  };

  const handleNotificationClick = (notification: NotificationRecord) => {
    void openNotification(notification);
    setNotificationsOpen(false);
  };

  const handleProfileAction = (action: string) => {
    switch (action) {
      case "settings":
        navigate("/settings");
        break;
      case "team":
        navigate("/team");
        break;
      case "logout":
        signOut();
        break;
    }
    setProfileOpen(false);
  };

  const formatTimeAgo = (dateString: string) => {
    const date = new Date(dateString);
    const now = new Date();
    const seconds = Math.floor((now.getTime() - date.getTime()) / 1000);

    if (seconds < 60) return "Just now";
    if (seconds < 3600) return `${Math.floor(seconds / 60)}m ago`;
    if (seconds < 86400) return `${Math.floor(seconds / 3600)}h ago`;
    return `${Math.floor(seconds / 86400)}d ago`;
  };

  const displayName = profile?.full_name || profile?.email || "User";
  const workspaceOptions = [workspace, ...availableWorkspaces].filter((item, index, all): item is NonNullable<typeof workspace> =>
    Boolean(item?.id) && all.findIndex((candidate) => candidate?.id === item?.id) === index,
  );

  useEffect(() => {
    if (!workspaceOpen) return;
    let cancelled = false;
    void supabase.rpc("get_workspace_allowance_v1").then(({ data }) => {
      if (!cancelled && data) setWorkspaceAllowance({
        used: Number(data.used ?? availableWorkspaces.length),
        limit: data.limit == null ? null : Number(data.limit),
        allowed: Boolean(data.allowed),
      });
    });
    return () => { cancelled = true; };
  }, [availableWorkspaces.length, workspaceOpen]);

  const handleCreateWorkspace = async () => {
    const name = newWorkspaceName.trim();
    if (!name || creatingWorkspace) return;
    setCreatingWorkspace(true);
    const created = await createWorkspace(name);
    setCreatingWorkspace(false);
    if (!created) return;
    await switchWorkspace(created.id);
    setNewWorkspaceName("");
    setShowWorkspaceCreator(false);
    setWorkspaceAllowance((current) => current ? { ...current, used: current.used + 1 } : current);
    navigate("/setup");
  };

  return (
    <>
      <style>{HEADER_STYLES}</style>

      <header className="sticky top-0 z-30 flex h-16 items-center justify-between gap-4 border-b border-base-border bg-base-surface px-4">
        {/* Left: menu, search */}
        <div className="flex min-w-0 flex-1 items-center gap-3">
          <button
            onClick={onMenuClick}
            aria-label="Open menu"
            className={`${ICON_BUTTON_CLASSES} shrink-0 lg:hidden`}
          >
            <Menu size={20} />
          </button>

          <button
            type="button"
            onClick={() => setSearchOpen(true)}
            aria-label={`Search (${modKey === "⌘" ? "Cmd" : "Ctrl"}+K)`}
            className="group flex min-w-0 items-center gap-2 rounded-lg border border-base-border bg-base-raised p-2 text-ink-faint transition-colors hover:border-pink-500/40 hover:text-ink focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-pink-500/50 focus-visible:ring-offset-2 focus-visible:ring-offset-base-surface md:w-[380px] md:justify-between md:px-3 md:py-[7px]"
          >
            <span className="flex items-center gap-2 truncate">
              <Search size={15} className="shrink-0" />
              <span className="hidden truncate text-[13px] md:inline">Search orders, customers…</span>
            </span>
            <kbd className="hidden shrink-0 items-center gap-0.5 rounded border border-base-border bg-base-surface px-1.5 py-0.5 text-[10px] font-medium text-ink-faint group-hover:border-pink-500/30 md:inline-flex">
              {modKey}K
            </kbd>
          </button>
        </div>

        {/* Right: actions — Workspace → Notifications → Quick Actions → Theme → Changelog → Profile */}
        <div className="flex shrink-0 items-center gap-1">
          {/* Workspace Switcher */}
          {workspace && (
            <div className="relative">
              <button
                onClick={(e) => {
                  e.stopPropagation();
                  const nextOpen = !workspaceOpen;
                  setWorkspaceOpen(nextOpen);
                  if (nextOpen) void refreshProfile();
                }}
                aria-haspopup="menu"
                aria-expanded={workspaceOpen}
                aria-label={`Switch workspace, current: ${workspace?.name || "workspace"}`}
                className="flex items-center gap-2 rounded-xl p-1.5 text-ink transition-colors hover:bg-base-raised focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-pink-500/50 focus-visible:ring-offset-2 focus-visible:ring-offset-base-surface"
              >
                <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-gradient-to-br from-pink-500 to-pink-600 text-xs font-bold text-white">
                  {workspace?.name?.charAt(0).toUpperCase() || "W"}
                </div>
                <span className="hidden max-w-[100px] truncate text-sm font-medium xl:block">
                  {workspace?.name}
                </span>
                <ChevronDown size={14} className="hidden text-ink-faint xl:block" />
              </button>

              {workspaceOpen && (
                <div
                  role="menu"
                  className="chdr-panel absolute right-0 top-[calc(100%+8px)] z-50 w-[320px] overflow-hidden rounded-2xl border border-base-border bg-base-surface shadow-2xl"
                >
                  <div className="border-b border-base-border bg-gradient-to-r from-pink-500/[0.08] via-base-surface to-base-surface px-4 py-3">
                    <div className="flex items-center justify-between gap-3">
                      <div><p className="text-[11px] font-bold uppercase tracking-[0.14em] text-ink-faint">Workspaces</p><p className="mt-1 text-sm font-semibold text-ink">Switch your business view</p></div>
                      <span className="rounded-full bg-base-surface px-2.5 py-1 text-[11px] font-semibold text-ink-muted shadow-sm">
                        {workspaceAllowance ? `${workspaceAllowance.used} / ${workspaceAllowance.limit ?? "∞"} used` : `${availableWorkspaces.length} used`}
                      </span>
                    </div>
                  </div>
                  <div className="max-h-80 space-y-1 overflow-y-auto p-2">
                    {workspaceOptions.map((ws) => (
                      <button
                        key={ws.id}
                        role="menuitem"
                        onClick={(e) => {
                          e.stopPropagation();
                          switchWorkspace(ws.id);
                          setWorkspaceOpen(false);
                        }}
                        className={`flex w-full items-center gap-3 rounded-xl px-3 py-3 text-left transition-all hover:bg-base-raised ${
                          workspace?.id === ws.id ? "bg-pink-500/[0.08] ring-1 ring-inset ring-pink-500/15" : ""
                        }`}
                      >
                        <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-gradient-to-br from-pink-500 to-pink-600 text-sm font-bold text-white shadow-sm shadow-pink-500/20">
                          {ws.name.charAt(0).toUpperCase()}
                        </div>
                        <div className="min-w-0 flex-1">
                          <div className="flex items-center gap-2"><span className="truncate text-sm font-semibold text-ink">{ws.name}</span>{workspace?.id === ws.id && <span className="rounded-full bg-pink-500 px-1.5 py-0.5 text-[9px] font-bold uppercase tracking-wide text-white">Current</span>}</div>
                          <div className="mt-0.5 truncate text-xs capitalize text-ink-muted">{ws.plan || "Workspace"}</div>
                        </div>
                        {workspace?.id === ws.id && (
                          <CheckCircle2 size={16} className="shrink-0 text-pink-600" />
                        )}
                      </button>
                    ))}
                    {workspaceOptions.length === 0 && <div className="px-3 py-6 text-center text-sm text-ink-muted">Your workspaces are loading. Reopen this menu in a moment.</div>}
                  </div>
                  <div className="border-t border-base-border p-2.5" onClick={(event) => event.stopPropagation()}>
                    {workspaceAllowance?.allowed === false ? (
                      <button onClick={() => { setWorkspaceOpen(false); navigate("/payment"); }} className="flex w-full items-center justify-between rounded-lg px-3 py-2 text-sm font-semibold text-pink-600 hover:bg-pink-500/10">
                        Workspace limit reached <span className="text-xs">Upgrade</span>
                      </button>
                    ) : (
                      <button onClick={() => { setWorkspaceOpen(false); setShowWorkspaceCreator(true); }} className="flex w-full items-center gap-2 rounded-xl bg-pink-500 px-3 py-2.5 text-sm font-semibold text-white shadow-sm shadow-pink-500/20 transition hover:bg-pink-600">
                        <Plus size={16} /> Create Workspace
                      </button>
                    )}
                  </div>
                </div>
              )}
            </div>
          )}

          {workspace && <div className="mx-1 hidden h-6 w-px bg-base-border sm:block" />}

          {/* 1. Notifications */}
          <div className="relative">
            <button
              onClick={(e) => {
                e.stopPropagation();
                setNotificationsOpen(!notificationsOpen);
              }}
              aria-haspopup="menu"
              aria-expanded={notificationsOpen}
              aria-label={`Notifications, ${unreadCount} unread`}
              className={ICON_BUTTON_CLASSES}
            >
              <Bell size={18} />
              <CountBadge count={unreadCount} />
            </button>

            {notificationsOpen && (
              <div
                role="menu"
                className="chdr-panel absolute right-0 top-[calc(100%+8px)] z-50 w-80 overflow-hidden rounded-xl border border-base-border bg-base-surface shadow-xl"
              >
                <div className="flex items-center justify-between border-b border-base-border px-4 py-3">
                  <div className="flex items-center gap-2">
                    <Bell size={16} className="text-ink" />
                    <span className="text-sm font-semibold text-ink">Notifications</span>
                  </div>
                  {unreadCount > 0 && (
                    <button
                      onClick={(e) => {
                        e.stopPropagation();
                        void markAllAsRead();
                      }}
                      className="text-xs font-medium text-pink-500 hover:text-pink-600"
                    >
                      Mark all as read
                    </button>
                  )}
                </div>

                <div className="max-h-[320px] overflow-y-auto">
                  {notificationsLoading ? (
                    <>
                      <NotificationSkeletonRow />
                      <NotificationSkeletonRow />
                      <NotificationSkeletonRow />
                    </>
                  ) : notifications.length === 0 ? (
                    <div className="flex flex-col items-center gap-2 px-4 py-8 text-center">
                      <Inbox size={22} className="text-ink-faint" />
                      <p className="text-sm font-medium text-ink">You're all caught up</p>
                      <p className="text-xs text-ink-muted">New activity will show up here.</p>
                    </div>
                  ) : (
                    notifications.map((notification) => (
                      <button
                        key={notification.id}
                        role="menuitem"
                        onClick={(e) => {
                          e.stopPropagation();
                          handleNotificationClick(notification);
                        }}
                        className={`flex w-full items-start gap-3 border-b border-base-border px-4 py-3 text-left transition-colors last:border-b-0 hover:bg-base-raised ${
                          !notification.is_read ? "bg-base-raised/50" : ""
                        }`}
                      >
                        <div
                          className={`rounded-lg p-2 ${
                            notification.category === "orders" || notification.category === "confirmation"
                              ? "bg-blue-500/10 text-blue-500"
                              : notification.category === "shipping"
                              ? "bg-purple-500/10 text-purple-500"
                              : notification.category === "inventory"
                              ? "bg-amber-500/10 text-amber-500"
                              : "bg-gray-500/10 text-gray-500"
                          }`}
                        >
                          {(notification.category === "orders" || notification.category === "confirmation") && <ShoppingCart size={16} />}
                          {notification.category === "shipping" && <Truck size={16} />}
                          {notification.category === "inventory" && <Package size={16} />}
                          {!(["orders", "confirmation", "shipping", "inventory"] as string[]).includes(notification.category) && (
                            <AlertCircle size={16} />
                          )}
                        </div>
                        <div className="min-w-0 flex-1">
                          <div className="truncate text-sm font-medium text-ink">{notification.title}</div>
                          <div className="truncate text-xs text-ink-muted">{notification.message}</div>
                          <div className="mt-1 text-xs text-ink-faint">{formatTimeAgo(notification.created_at)}</div>
                        </div>
                        {!notification.is_read && <div className="mt-1 h-2 w-2 shrink-0 rounded-full bg-pink-500" />}
                      </button>
                    ))
                  )}
                </div>
                <button
                  type="button"
                  onClick={(event) => {
                    event.stopPropagation();
                    setNotificationsOpen(false);
                    navigate("/notifications");
                  }}
                  className="w-full border-t border-base-border px-4 py-2.5 text-center text-xs font-semibold text-brand hover:bg-base-raised"
                >
                  View all notifications
                </button>
              </div>
            )}
          </div>

          {/* 2. Quick Actions (Operations Center) */}
          <div className="relative">
            <button
              onClick={(e) => {
                e.stopPropagation();
                setOperationsOpen(!operationsOpen);
              }}
              aria-haspopup="menu"
              aria-expanded={operationsOpen}
              aria-label={`Quick actions, ${totalAlerts} pending`}
              className={`${ICON_BUTTON_CLASSES} ${totalAlerts > 0 ? "chdr-alert-live" : ""}`}
            >
              <Zap size={18} className={totalAlerts > 0 ? "text-amber-500" : "text-ink-faint"} />
              <CountBadge count={totalAlerts} />
            </button>

            {operationsOpen && (
              <div
                role="menu"
                className="chdr-panel absolute right-0 top-[calc(100%+8px)] z-50 w-72 overflow-hidden rounded-xl border border-base-border bg-base-surface shadow-xl"
              >
                <div className="flex items-center justify-between border-b border-base-border px-4 py-3">
                  <div className="flex items-center gap-2">
                    <Zap size={16} className="text-amber-500" />
                    <span className="text-sm font-semibold text-ink">Quick actions</span>
                  </div>
                  {totalAlerts > 0 && (
                    <span className="rounded-full bg-amber-500/10 px-2 py-0.5 text-[11px] font-medium text-amber-600">
                      {totalAlerts} open
                    </span>
                  )}
                </div>

                {totalAlerts === 0 ? (
                  <div className="flex flex-col items-center gap-2 px-4 py-8 text-center">
                    <CheckCircle2 size={22} className="text-green-500" />
                    <p className="text-sm font-medium text-ink">All caught up</p>
                    <p className="text-xs text-ink-muted">No orders need your attention right now.</p>
                  </div>
                ) : (
                  <div className="border-b border-base-border">
                    {counts.pendingConfirmation > 0 && (
                      <button
                        role="menuitem"
                        onClick={() => handleOperationClick("pending-confirmation")}
                        className="flex w-full items-start gap-3 border-b border-base-border px-4 py-3 text-left transition-colors last:border-b-0 hover:bg-base-raised"
                      >
                        <div className="rounded-lg bg-amber-500/10 p-2 text-amber-500">
                          <Clock size={16} />
                        </div>
                        <div className="flex-1">
                          <div className="text-sm font-medium text-ink">
                            {counts.pendingConfirmation} order{counts.pendingConfirmation === 1 ? "" : "s"} need
                            confirmation
                          </div>
                          <div className="text-xs text-ink-muted">Go to Confirmation</div>
                        </div>
                        <ArrowRight size={14} className="mt-0.5 shrink-0 text-ink-faint" />
                      </button>
                    )}

                    {counts.readyToShip > 0 && (
                      <button
                        role="menuitem"
                        onClick={() => handleOperationClick("ready-to-ship")}
                        className="flex w-full items-start gap-3 px-4 py-3 text-left transition-colors hover:bg-base-raised"
                      >
                        <div className="rounded-lg bg-blue-500/10 p-2 text-blue-500">
                          <Truck size={16} />
                        </div>
                        <div className="flex-1">
                          <div className="text-sm font-medium text-ink">
                            {counts.readyToShip} order{counts.readyToShip === 1 ? "" : "s"} ready to ship
                          </div>
                          <div className="text-xs text-ink-muted">Go to Shipping</div>
                        </div>
                        <ArrowRight size={14} className="mt-0.5 shrink-0 text-ink-faint" />
                      </button>
                    )}
                  </div>
                )}

                <div className="px-4 py-3">
                  <div className="mb-2 text-xs font-medium uppercase tracking-wider text-ink-muted">
                    Today's activity
                  </div>
                  <div className="grid grid-cols-2 gap-2">
                    <div className="rounded-lg bg-base-raised p-3 text-center">
                      <div className="text-lg font-bold text-ink">{counts.todayOrders}</div>
                      <div className="text-xs text-ink-muted">Orders</div>
                    </div>
                    <div className="rounded-lg bg-base-raised p-3 text-center">
                      <div className="text-lg font-bold text-green-500">{counts.todayDelivered}</div>
                      <div className="text-xs text-ink-muted">Delivered</div>
                    </div>
                  </div>
                </div>
              </div>
            )}
          </div>

          <div className="mx-1 hidden h-6 w-px bg-base-border sm:block" />

          {/* 3. Theme Toggle */}
          <ThemeToggle />

          {/* Changelog */}
          <ChangelogMenu />

          {/* 4. Profile — far right */}
          <div className="relative">
            <button
              onClick={(e) => {
                e.stopPropagation();
                setProfileOpen(!profileOpen);
              }}
              aria-haspopup="menu"
              aria-expanded={profileOpen}
              aria-label={`Account menu for ${displayName}`}
              className="rounded-xl p-1 transition-colors hover:bg-base-raised focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-pink-500/50 focus-visible:ring-offset-2 focus-visible:ring-offset-base-surface"
            >
              <div className="flex h-8 w-8 items-center justify-center rounded-full bg-gradient-to-br from-pink-500 to-pink-600 text-xs font-bold text-white ring-2 ring-transparent transition-all hover:ring-pink-500/30 overflow-hidden">
                {profile?.avatar_url ? (
                  <img src={profile.avatar_url} alt={displayName} className="h-full w-full object-cover" />
                ) : (
                  profile?.full_name ? getUserInitials(profile.full_name) : profile?.email?.charAt(0).toUpperCase() || "U"
                )}
              </div>
            </button>

            {profileOpen && (
              <div
                role="menu"
                className="chdr-panel absolute right-0 top-[calc(100%+8px)] z-50 w-52 overflow-hidden rounded-xl border border-base-border bg-base-surface shadow-xl"
              >
                <div className="border-b border-base-border bg-base-raised/50 px-4 py-3">
                  <div className="truncate text-sm font-semibold text-ink">{displayName}</div>
                  <span className="mt-1 inline-block rounded-full bg-pink-500/10 px-2 py-0.5 text-[11px] font-medium capitalize text-pink-600">
                    {profile?.role || "Admin"}
                  </span>
                </div>
                <button
                  role="menuitem"
                  onClick={() => handleProfileAction("settings")}
                  className="flex w-full items-center gap-2 px-4 py-2.5 text-left text-sm text-ink transition-colors hover:bg-base-raised"
                >
                  <Settings size={14} className="text-ink-faint" />
                  Settings
                </button>
                {teamPermissions.team && (
                  <button
                    role="menuitem"
                    onClick={() => handleProfileAction("team")}
                    className="flex w-full items-center gap-2 px-4 py-2.5 text-left text-sm text-ink transition-colors hover:bg-base-raised"
                  >
                    <Users size={14} className="text-ink-faint" />
                    Team
                  </button>
                )}
                <div className="my-1 border-t border-base-border" />
                <button
                  role="menuitem"
                  onClick={() => handleProfileAction("logout")}
                  className="flex w-full items-center gap-2 px-4 py-2.5 text-left text-sm text-red-500 transition-colors hover:bg-red-500/10"
                >
                  <LogOut size={14} />
                  Log out
                </button>
              </div>
            )}
          </div>
        </div>
      </header>

      <GlobalSearchOverlay isOpen={searchOpen} onClose={() => setSearchOpen(false)} />

      {showWorkspaceCreator && (
        <div className="fixed inset-0 z-[70] flex items-center justify-center p-4" role="dialog" aria-modal="true" aria-labelledby="new-workspace-title">
          <button aria-label="Close workspace creator" onClick={() => setShowWorkspaceCreator(false)} className="absolute inset-0 bg-slate-950/55 backdrop-blur-sm" />
          <section className="relative w-full max-w-2xl overflow-hidden rounded-[28px] border border-white/20 bg-base-surface shadow-2xl">
            <div className="relative overflow-hidden bg-[linear-gradient(135deg,#291323_0%,#7e1d49_57%,#e73773_120%)] px-6 pb-16 pt-6 text-white sm:px-8">
              <div className="absolute -right-12 -top-16 h-52 w-52 rounded-full border border-white/15" />
              <div className="absolute right-12 top-16 h-20 w-20 rounded-full bg-white/10 blur-xl" />
              <div className="relative flex items-start justify-between gap-4">
                <div className="grid h-12 w-12 place-items-center rounded-2xl bg-white/15 ring-1 ring-white/25"><Building2 size={22} /></div>
                <button onClick={() => setShowWorkspaceCreator(false)} className="rounded-xl bg-white/10 p-2 text-white transition hover:bg-white/20" aria-label="Close"><X size={18} /></button>
              </div>
              <p className="relative mt-8 inline-flex items-center gap-1.5 rounded-full bg-white/10 px-3 py-1 text-[10px] font-bold uppercase tracking-[0.16em] text-pink-100"><Sparkles size={12} />New business space</p>
              <h2 id="new-workspace-title" className="relative mt-3 text-2xl font-bold tracking-tight sm:text-3xl">Create a workspace, then set it up your way.</h2>
              <p className="relative mt-2 max-w-lg text-sm leading-6 text-pink-100/85">You will start with a guided setup for your store, shipping and team — nothing is carried over from another workspace.</p>
            </div>
            <div className="relative -mt-9 mx-4 rounded-2xl border border-base-border bg-base-surface p-5 shadow-xl sm:mx-6 sm:p-6">
              <label className="block text-sm font-semibold text-ink" htmlFor="workspace-name">Workspace name</label>
              <p className="mt-1 text-xs text-ink-muted">Use your store or business name. You can change it later.</p>
              <input id="workspace-name" autoFocus value={newWorkspaceName} onChange={(event) => setNewWorkspaceName(event.target.value)} onKeyDown={(event) => { if (event.key === "Enter") void handleCreateWorkspace(); }} placeholder="e.g. Atlas Store" className="mt-3 w-full rounded-xl border border-base-border bg-base-raised px-4 py-3 text-sm text-ink outline-none transition focus:border-pink-500 focus:ring-4 focus:ring-pink-500/10" />
              <div className="mt-5 grid gap-2 sm:grid-cols-3">
                {["Name your workspace", "Connect your store", "Choose delivery"].map((label, index) => <div key={label} className="flex items-center gap-2 rounded-xl bg-base-raised px-3 py-2.5 text-xs font-semibold text-ink-muted"><span className="grid h-5 w-5 place-items-center rounded-full bg-pink-500/10 text-[10px] text-pink-600">{index + 1}</span>{label}</div>)}
              </div>
              <div className="mt-6 flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
                <button onClick={() => setShowWorkspaceCreator(false)} className="rounded-xl px-4 py-3 text-sm font-semibold text-ink-muted transition hover:bg-base-raised">Cancel</button>
                <button onClick={() => void handleCreateWorkspace()} disabled={!newWorkspaceName.trim() || creatingWorkspace} className="inline-flex items-center justify-center gap-2 rounded-xl bg-pink-500 px-5 py-3 text-sm font-semibold text-white shadow-lg shadow-pink-500/20 transition hover:bg-pink-600 disabled:cursor-not-allowed disabled:opacity-50"><Plus size={16} />{creatingWorkspace ? "Creating workspace…" : "Create & start setup"}</button>
              </div>
            </div>
          </section>
        </div>
      )}
    </>
  );
});
