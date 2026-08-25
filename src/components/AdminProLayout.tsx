import { useEffect, useState } from "react";
import { NavLink, Outlet, useLocation, useNavigate } from "react-router-dom";
import {
  Activity, Bell, Boxes, BrainCircuit, ChevronDown, ChevronLeft,
  ChevronRight, CircleHelp, DatabaseZap, FileWarning, Gauge, KeyRound,
  LayoutDashboard, LogOut, Menu, MessageSquareText, PackageSearch, PanelsTopLeft,
  Search, Settings2, ShieldCheck, ShoppingCart, Sparkles, Users, Wrench, X,
} from "lucide-react";
import { useAuth } from "../hooks/useAuth";
import { ThemeToggle } from "./ThemeToggle";
import { founderAdmin, type FounderNotification } from "../lib/founderAdmin";

type NavItem = { to: string; label: string; icon: typeof LayoutDashboard; exact?: boolean };
type NavGroup = { label: string; icon: typeof LayoutDashboard; items: NavItem[] };

const navGroups: NavGroup[] = [
  { label: "Command Center", icon: LayoutDashboard, items: [{ to: "/admin", label: "Overview", icon: LayoutDashboard, exact: true }] },
  {
    label: "Management", icon: Users, items: [
      { to: "/admin/users", label: "Users", icon: Users },
      { to: "/admin/orders", label: "Global Orders", icon: ShoppingCart },
    ],
  },
  {
    label: "Intelligence", icon: BrainCircuit, items: [
      { to: "/admin/intelligence", label: "Campaigns & Products", icon: PackageSearch },
      { to: "/admin/intelligence/sellers", label: "Sellers", icon: Gauge },
    ],
  },
  {
    label: "Operations", icon: Activity, items: [
      { to: "/admin/operations?tab=health", label: "System Health", icon: ShieldCheck },
      { to: "/admin/operations?tab=integrations", label: "Integrations", icon: Wrench },
      { to: "/admin/operations?tab=problems", label: "Problems & Errors", icon: FileWarning },
      { to: "/admin/operations?tab=activity", label: "Activity", icon: Activity },
    ],
  },
  { label: "Support", icon: CircleHelp, items: [{ to: "/admin/support", label: "Tickets & Support Mode", icon: CircleHelp }] },
  { label: "Communications", icon: MessageSquareText, items: [{ to: "/admin/communications", label: "Announcements", icon: Bell }] },
  { label: "Platform Control", icon: Settings2, items: [{ to: "/admin/platform", label: "Security & Settings", icon: Settings2 }] },
  {
    label: "AI & Tools", icon: Sparkles, items: [
      { to: "/admin/ai-tools", label: "AI Overview", icon: Sparkles },
      { to: "/admin/ai-tools?tab=providers", label: "API Providers", icon: KeyRound },
      { to: "/admin/ai-tools?tab=landing", label: "Landing Page AI", icon: PanelsTopLeft },
    ],
  },
];

function routeMatches(pathname: string, items: NavItem[]) {
  return items.some((item) => {
    const path = item.to.split("?")[0];
    return item.exact ? pathname === path : pathname === path || pathname.startsWith(`${path}/`);
  });
}

export function AdminProLayout() {
  const { profile, session, signOut } = useAuth();
  const location = useLocation();
  const navigate = useNavigate();
  const [openGroup, setOpenGroup] = useState<string | null>(null);
  const [collapsed, setCollapsed] = useState(false);
  const [mobileOpen, setMobileOpen] = useState(false);
  const [searchQuery, setSearchQuery] = useState("");
  const [searchResults, setSearchResults] = useState<Array<{ kind: string; id: string; title: string; detail: string; href: string }>>([]);
  const [searching, setSearching] = useState(false);
  const [searchOpen, setSearchOpen] = useState(false);
  const [notifications, setNotifications] = useState<FounderNotification[]>([]);
  const [unreadNotifications, setUnreadNotifications] = useState(0);
  const [notificationsOpen, setNotificationsOpen] = useState(false);

  const toggleGroup = (label: string) => setOpenGroup((current) => current === label ? null : label);

  useEffect(() => {
    if (searchQuery.trim().length < 2) { setSearchResults([]); setSearching(false); return; }
    const timer = window.setTimeout(async () => {
      setSearching(true);
      try { setSearchResults(await founderAdmin.globalSearch(searchQuery)); } catch { setSearchResults([]); } finally { setSearching(false); }
    }, 200);
    return () => window.clearTimeout(timer);
  }, [searchQuery]);

  useEffect(() => {
    const onShortcut = (event: KeyboardEvent) => {
      if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === "k") { event.preventDefault(); setSearchOpen(true); window.setTimeout(() => document.getElementById("founder-console-search")?.focus(), 0); }
    };
    window.addEventListener("keydown", onShortcut);
    return () => window.removeEventListener("keydown", onShortcut);
  }, []);

  const loadNotifications = async () => {
    try { const result = await founderAdmin.notifications(); setNotifications(result.rows || []); setUnreadNotifications(result.unread || 0); } catch { setNotifications([]); setUnreadNotifications(0); }
  };
  const toggleNotifications = () => { const next = !notificationsOpen; setNotificationsOpen(next); if (next) void loadNotifications(); };
  const itemIsActive = (item: NavItem) => {
    const [path, query] = item.to.split("?");
    const pathMatch = item.exact ? location.pathname === path : location.pathname === path || location.pathname.startsWith(`${path}/`);
    return pathMatch && (!query || location.search === `?${query}`);
  };

  const exitAdmin = async () => {
    await signOut();
    navigate("/login", { replace: true });
  };

  const sidebarWidth = collapsed ? "lg:w-[76px]" : "lg:w-72";

  return (
    <div className="flex h-dvh min-h-0 overflow-hidden bg-base text-ink">
      {mobileOpen && <button aria-label="Close admin navigation" onClick={() => setMobileOpen(false)} className="fixed inset-0 z-30 bg-slate-950/40 lg:hidden" />}
      <aside className={`fixed inset-y-0 left-0 z-40 flex w-72 flex-col border-r border-base-border bg-base-surface transition-[transform,width] duration-200 lg:static lg:translate-x-0 ${sidebarWidth} ${mobileOpen ? "translate-x-0" : "-translate-x-full"}`}>
        <div className="flex h-16 shrink-0 items-center gap-3 border-b border-base-border px-4">
          <div className="grid h-9 w-9 place-items-center rounded-xl bg-gradient-to-br from-brand-accent to-violet-600 text-white shadow-sm"><DatabaseZap size={19} /></div>
          {!collapsed && <div className="min-w-0"><p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-ink-faint">EcomOS</p><h1 className="truncate text-sm font-bold tracking-tight">Founder Console</h1></div>}
          <button onClick={() => setMobileOpen(false)} className="ml-auto rounded-lg p-2 text-ink-muted hover:bg-base-raised lg:hidden"><X size={18} /></button>
        </div>

        <nav className="flex-1 overflow-y-auto px-3 py-4">
          {navGroups.map((group) => {
            const expanded = openGroup === group.label;
            const groupActive = routeMatches(location.pathname, group.items);
            const GroupIcon = group.icon;
            return <section key={group.label} className="mb-2">
              <button onClick={() => toggleGroup(group.label)} aria-expanded={expanded} aria-controls={`admin-nav-${group.label.toLowerCase().replace(/[^a-z0-9]+/g, "-")}`} className={`flex w-full items-center gap-3 rounded-lg px-3 py-2 text-left text-xs font-semibold transition-colors ${groupActive ? "text-brand-accent" : "text-ink-muted hover:bg-base-raised hover:text-ink"}`} title={collapsed ? group.label : undefined}>
                <GroupIcon size={16} />
                {!collapsed && <><span className="flex-1">{group.label}</span><ChevronDown size={15} className={`transition-transform ${expanded ? "rotate-180" : ""}`} /></>}
              </button>
              {!collapsed && <div id={`admin-nav-${group.label.toLowerCase().replace(/[^a-z0-9]+/g, "-")}`} className={`grid overflow-hidden transition-[grid-template-rows,opacity,margin] duration-200 ${expanded ? "mt-1 grid-rows-[1fr] opacity-100" : "grid-rows-[0fr] opacity-0"}`}>
                <div className="min-h-0 space-y-0.5 border-l border-base-border pl-3">
                {group.items.map((item) => {
                  const Icon = item.icon;
                  return <NavLink key={item.to} to={item.to} end={item.exact} onClick={() => setMobileOpen(false)} className={`flex items-center gap-3 rounded-lg px-3 py-2 text-sm transition-colors ${itemIsActive(item) ? "bg-brand-accent/10 font-semibold text-brand-accent" : "text-ink-muted hover:bg-base-raised hover:text-ink"}`}>
                    <Icon size={16} /><span>{item.label}</span>
                  </NavLink>;
                })}
                </div>
              </div>}
            </section>;
          })}
        </nav>

        <div className="border-t border-base-border p-3">
          <div className={`flex items-center gap-3 rounded-xl bg-base-raised p-2.5 ${collapsed ? "justify-center" : ""}`}>
            <div className="grid h-8 w-8 shrink-0 place-items-center rounded-full bg-brand-accent/15 text-xs font-bold text-brand-accent overflow-hidden">
              {profile?.avatar_url ? (
                <img src={profile.avatar_url} alt="Profile" className="h-full w-full object-cover" />
              ) : (
                (profile?.full_name || session?.user?.email || "F").slice(0, 1).toUpperCase()
              )}
            </div>
            {!collapsed && <div className="min-w-0 flex-1"><p className="truncate text-xs font-semibold">{profile?.full_name || "Founder"}</p><p className="truncate text-[11px] text-ink-faint">Founder account</p></div>}
            {!collapsed && <button onClick={() => void exitAdmin()} title="Sign out" className="rounded-md p-1.5 text-ink-faint hover:bg-danger/10 hover:text-danger"><LogOut size={16} /></button>}
          </div>
          <button onClick={() => setCollapsed((value) => !value)} className="mt-2 hidden w-full items-center justify-center gap-2 rounded-lg py-2 text-xs text-ink-muted hover:bg-base-raised lg:flex">{collapsed ? <ChevronRight size={16} /> : <><ChevronLeft size={16} /> Collapse</>}</button>
        </div>
      </aside>

      <div className="flex min-w-0 flex-1 flex-col overflow-hidden">
        <header className="flex h-16 shrink-0 items-center gap-3 border-b border-base-border bg-base-surface px-4 md:px-6">
          <button onClick={() => setMobileOpen(true)} className="rounded-lg p-2 text-ink-muted hover:bg-base-raised lg:hidden"><Menu size={20} /></button>
          <div className="relative hidden max-w-md flex-1 md:block"><Search size={16} className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-ink-faint" /><input id="founder-console-search" aria-label="Search founder console" value={searchQuery} onFocus={() => setSearchOpen(true)} onChange={(event) => { setSearchQuery(event.target.value); setSearchOpen(true); }} placeholder="Search users, orders, workspaces…" className="w-full rounded-lg border border-base-border bg-base-raised py-2 pl-9 pr-14 text-sm outline-none transition focus:border-brand-accent/60" /><kbd className="pointer-events-none absolute right-2 top-1/2 -translate-y-1/2 rounded border border-base-border bg-base-surface px-1.5 py-0.5 text-[10px] text-ink-faint">Ctrl K</kbd>{searchOpen && <div className="absolute left-0 right-0 top-[calc(100%+0.5rem)] z-50 overflow-hidden rounded-xl border border-base-border bg-base-surface shadow-xl"><div className="border-b border-base-border px-3 py-2 text-xs text-ink-faint">{searching ? "Searching…" : searchQuery.trim().length < 2 ? "Type at least two characters" : `${searchResults.length} results`}</div>{searchResults.map((result) => <NavLink key={`${result.kind}-${result.id}`} to={result.href} onClick={() => { setSearchOpen(false); setSearchQuery(""); }} className="block border-b border-base-border px-3 py-2.5 last:border-0 hover:bg-base-raised"><p className="text-sm font-semibold">{result.title}</p><p className="mt-0.5 truncate text-xs text-ink-muted">{result.kind} · {result.detail}</p></NavLink>)}</div>}</div>
          <div className="relative ml-auto flex items-center gap-2"><span className="hidden rounded-full bg-emerald-500/10 px-2.5 py-1 text-[11px] font-semibold text-emerald-600 dark:text-emerald-300 sm:inline">Founder-only</span><ThemeToggle /><button onClick={toggleNotifications} className="relative rounded-lg p-2 text-ink-muted hover:bg-base-raised" title="Notifications" aria-expanded={notificationsOpen}><Bell size={18} />{unreadNotifications > 0 && <span className="absolute -right-0.5 -top-0.5 grid h-4 min-w-4 place-items-center rounded-full bg-danger px-1 text-[9px] font-bold text-white">{Math.min(unreadNotifications, 99)}</span>}</button>{notificationsOpen && <div className="absolute right-0 top-[calc(100%+0.5rem)] z-50 w-[360px] overflow-hidden rounded-xl border border-base-border bg-base-surface shadow-xl"><div className="flex items-center justify-between border-b border-base-border px-3 py-2"><p className="text-sm font-bold">Notifications</p><button onClick={() => void loadNotifications()} className="text-xs font-semibold text-brand-accent">Refresh</button></div><div className="max-h-[420px] overflow-y-auto">{notifications.length ? notifications.map((notice) => <button key={`${notice.source}-${notice.source_id}`} onClick={() => { if (!notice.read) void founderAdmin.markNotificationRead(notice.source, notice.source_id).then(() => void loadNotifications()); }} className={`block w-full border-b border-base-border px-3 py-3 text-left last:border-0 hover:bg-base-raised ${notice.read ? "" : "bg-brand-accent/5"}`}><p className="text-sm font-semibold capitalize">{notice.title}</p><p className="mt-1 line-clamp-2 text-xs text-ink-muted">{notice.detail}</p><p className="mt-1 text-[11px] text-ink-faint">{new Date(notice.created_at).toLocaleString()}</p></button>) : <p className="p-6 text-center text-sm text-ink-muted">No current founder notifications.</p>}</div></div>}</div>
        </header>
        <main className="min-h-0 flex-1 overflow-y-auto"><Outlet /></main>
      </div>
    </div>
  );
}
