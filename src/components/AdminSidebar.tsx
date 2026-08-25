import { NavLink } from "react-router-dom";
import {
  LayoutDashboard,
  Users,
  Building2,
  BarChart3,
  ScrollText,
  Settings as SettingsIcon,
  Search,
  type LucideIcon,
} from "lucide-react";

const groups: { label: string; links: { to: string; label: string; icon: LucideIcon }[] }[] = [
  {
    label: "Platform",
    links: [
      { to: "/admin", label: "Overview", icon: LayoutDashboard },
      { to: "/admin/search", label: "Global Search", icon: Search },
      { to: "/admin/analytics", label: "Analytics", icon: BarChart3 },
    ],
  },
  {
    label: "Management",
    links: [
      { to: "/admin/users", label: "Users", icon: Users },
      { to: "/admin/workspaces", label: "Workspaces", icon: Building2 },
    ],
  },
  {
    label: "System",
    links: [
      { to: "/admin/logs", label: "Audit Log", icon: ScrollText },
      { to: "/admin/settings", label: "Settings", icon: SettingsIcon },
    ],
  },
];

export function AdminSidebar() {
  return (
    <aside className="flex w-[240px] flex-none flex-col border-r border-base-border bg-base-surface/70">
      <div className="border-b border-base-border px-5 py-5">
        <div className="text-[12px] font-semibold uppercase tracking-[0.24em] text-ink-faint">Super Admin</div>
        <div className="mt-2 text-[16px] font-semibold text-ink">Admin Platform</div>
      </div>
      <nav className="flex-1 overflow-y-auto px-3 py-4 space-y-5">
        {groups.map(group => (
          <div key={group.label}>
            <div className="mb-1.5 px-3 text-[10.5px] font-semibold uppercase tracking-[0.22em] text-ink-faint">
              {group.label}
            </div>
            <div className="space-y-0.5">
              {group.links.map(link => (
                <NavLink
                  key={link.to}
                  to={link.to}
                  end={link.to === "/admin"}
                  className={({ isActive }) =>
                    [
                      "flex items-center gap-2 rounded-lg px-3 py-2 text-[13px] transition-colors",
                      isActive
                        ? "bg-brand/10 text-brand font-medium"
                        : "text-ink-muted hover:bg-base-raised/70 hover:text-ink",
                    ].join(" ")
                  }
                >
                  {({ isActive }) => (
                    <>
                      <link.icon size={15} className={isActive ? "text-brand" : "text-ink-faint"} />
                      {link.label}
                    </>
                  )}
                </NavLink>
              ))}
            </div>
          </div>
        ))}
      </nav>
    </aside>
  );
}
