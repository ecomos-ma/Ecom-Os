import { useState } from "react";
import { Outlet, NavLink, useLocation } from "react-router-dom";
import { SuperAdminGuard } from "./SuperAdminGuard";
import {
  LayoutDashboard,
  Server,
  Eye,
  Package,
  Image as ImageIcon,
  Store,
  TrendingUp,
  Settings,
  BarChart3,
  Truck,
  Sparkles,
  Activity,
  Shield,
  ChevronDown,
  LogOut,
  Menu,
  X,
  Users,
  Building2,
  ScrollText,
  AlertTriangle,
  Trophy,
  Search,
  Database,
  HardDrive,
  Bell,
  BrainCircuit,
  KeyRound,
  GitMerge
} from "lucide-react";
import { useAuth } from "../hooks/useAuth";
import { isSuperAdmin } from "../lib/rbac";

const navItems = [
  {
    section: "Dashboard", items: [
      { to: "/super-admin", label: "Platform Dashboard", icon: LayoutDashboard },
      { to: "/super-admin/users", label: "User Management", icon: Users },
      { to: "/super-admin/workspaces", label: "Workspace Management", icon: Building2 },
    ]
  },
  {
    section: "Monitoring", items: [
      { to: "/super-admin/activity-feed", label: "Activity Feed", icon: Activity },
      { to: "/super-admin/system-health", label: "System Health", icon: Server },
      { to: "/super-admin/audit-log", label: "Audit Log", icon: ScrollText },
      { to: "/super-admin/error-center", label: "Error Center", icon: AlertTriangle },
      { to: "/super-admin/security-center", label: "Security Center", icon: Shield },
    ]
  },
  {
    section: "Intelligence", items: [
      { to: "/super-admin/ai-infrastructure", label: "AI Infrastructure", icon: BrainCircuit },
      { to: "/super-admin/tools-api-providers", label: "Tools API Providers", icon: KeyRound },
      { to: "/super-admin/landing-page-ai", label: "Landing Page AI", icon: ImageIcon },
      { to: "/super-admin/spy-center", label: "Spy Center", icon: Eye },
      { to: "/super-admin/intelligence", label: "Intelligence", icon: TrendingUp },
      { to: "/super-admin/rankings", label: "Rankings", icon: Trophy },
      { to: "/super-admin/winning-products", label: "Winning Products", icon: Package },
      { to: "/super-admin/winning-ads", label: "Winning Ads", icon: Sparkles },
    ]
  },
  {
    section: "Tools", items: [
      { to: "/super-admin/search", label: "Global Search", icon: Search },
      { to: "/super-admin/export-import", label: "Export / Import", icon: Database },
      { to: "/super-admin/database-backup", label: "Database Backup", icon: HardDrive },
      { to: "/super-admin/announcements", label: "Announcements", icon: Bell },
    ]
  },
  {
    section: "System", items: [
      { to: "/super-admin/settings", label: "Settings", icon: Settings },
    ]
  },
];

export function SuperAdminLayout() {
  const [sidebarOpen, setSidebarOpen] = useState(true);
  const location = useLocation();
  const { profile, session, signOut } = useAuth();
  const isAuthorized = isSuperAdmin(profile?.role, session?.user?.email);

  if (!isAuthorized) {
    return <SuperAdminGuard><div /></SuperAdminGuard>;
  }

  return (
    <SuperAdminGuard>
      <div className="min-h-screen bg-slate-950 text-white">
        {/* Mobile Header */}
        <div className="lg:hidden fixed top-0 left-0 right-0 z-50 bg-slate-900/80 backdrop-blur-xl border-b border-slate-800 px-4 py-3 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <button
              onClick={() => setSidebarOpen(!sidebarOpen)}
              className="p-2 rounded-lg hover:bg-slate-800 transition-colors"
            >
              {sidebarOpen ? <X size={20} /> : <Menu size={20} />}
            </button>
            <h1 className="text-lg font-bold bg-gradient-to-r from-brand-accent to-purple-500 bg-clip-text text-transparent">
              Admin Pro
            </h1>
          </div>
          <button
            onClick={signOut}
            className="p-2 rounded-lg hover:bg-slate-800 transition-colors text-slate-400 hover:text-white"
          >
            <LogOut size={20} />
          </button>
        </div>

        {/* Sidebar */}
        <aside
          className={[
            "fixed top-0 left-0 z-40 h-full bg-slate-900/50 backdrop-blur-xl border-r border-slate-800 transition-all duration-300",
            "lg:translate-x-0",
            sidebarOpen ? "translate-x-0 w-72" : "-translate-x-full w-72 lg:w-20",
          ].join(" ")}
        >
          <div className="h-full flex flex-col">
            {/* Logo */}
            <div className="h-16 flex items-center justify-between px-4 border-b border-slate-800">
              <h1 className={[
                "font-bold bg-gradient-to-r from-brand-accent to-purple-500 bg-clip-text text-transparent",
                sidebarOpen ? "text-xl" : "text-lg"
              ].join(" ")}>
                {sidebarOpen ? "Admin Pro" : "AP"}
              </h1>
              <button
                onClick={() => setSidebarOpen(!sidebarOpen)}
                className="hidden lg:block p-2 rounded-lg hover:bg-slate-800 transition-colors"
              >
                <ChevronDown size={20} className={sidebarOpen ? "rotate-180" : ""} />
              </button>
            </div>

            {/* Navigation */}
            <nav className="flex-1 overflow-y-auto py-4 space-y-6 px-3">
              {navItems.map((section) => (
                <div key={section.section}>
                  {sidebarOpen && (
                    <div className="px-3 mb-2 text-xs font-semibold uppercase tracking-wider text-slate-500">
                      {section.section}
                    </div>
                  )}
                  <div className="space-y-1">
                    {section.items.map((item) => (
                      <NavLink
                        key={item.to}
                        to={item.to}
                        end={item.to === "/super-admin"}
                        className={({ isActive }) => [
                          "flex items-center gap-3 px-3 py-2.5 rounded-lg transition-all duration-200",
                          "hover:bg-slate-800/50",
                          isActive
                            ? "bg-gradient-to-r from-brand-accent/20 to-purple-500/20 text-brand-accent border border-brand-accent/30"
                            : "text-slate-400 hover:text-white",
                          !sidebarOpen && "justify-center",
                        ].join(" ")}
                        title={!sidebarOpen ? item.label : undefined}
                      >
                        <item.icon size={18} strokeWidth={2} />
                        {sidebarOpen && (
                          <span className="text-sm font-medium">{item.label}</span>
                        )}
                      </NavLink>
                    ))}
                  </div>
                </div>
              ))}
            </nav>

            {/* User Info */}
            <div className="p-4 border-t border-slate-800">
              <div className="flex items-center gap-3">
                <div className="h-10 w-10 rounded-full bg-gradient-to-br from-brand-accent to-purple-500 flex items-center justify-center font-bold">
                  {profile?.full_name?.charAt(0) || "A"}
                </div>
                {sidebarOpen && (
                  <div className="flex-1 min-w-0">
                    <div className="text-sm font-medium truncate">{profile?.full_name || "Admin"}</div>
                    <div className="text-xs text-slate-500 truncate">{session?.user?.email}</div>
                  </div>
                )}
              </div>
            </div>
          </div>
        </aside>

        {/* Main Content */}
        <main
          className={[
            "min-h-screen transition-all duration-300",
            sidebarOpen ? "lg:ml-72" : "lg:ml-20",
            "lg:pt-0 pt-16",
          ].join(" ")}
        >
          <div className="p-6">
            <Outlet />
          </div>
        </main>
      </div>
    </SuperAdminGuard>
  );
}
