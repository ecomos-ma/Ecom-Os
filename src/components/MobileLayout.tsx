import { ReactNode, useState } from "react";
import { Home, Package, Truck, BarChart3, MoreHorizontal, X } from "lucide-react";

interface MobileLayoutProps {
  children: ReactNode;
  currentPage: string;
}

export default function MobileLayout({ children, currentPage }: MobileLayoutProps) {
  const [showMoreMenu, setShowMoreMenu] = useState(false);

  const navItems = [
    { id: "dashboard", icon: Home, label: "Dashboard" },
    { id: "orders", icon: Package, label: "Orders" },
    { id: "shipping", icon: Truck, label: "Shipping" },
    { id: "analytics", icon: BarChart3, label: "Analytics" },
    { id: "more", icon: MoreHorizontal, label: "More" },
  ];

  const moreMenuItems = [
    { icon: Home, title: "Dashboard", subtitle: "Overview & stats" },
    { icon: Package, title: "Orders", subtitle: "Manage orders" },
    { icon: Truck, title: "Shipping", subtitle: "Track shipments" },
    { icon: BarChart3, title: "Analytics", subtitle: "Reports & insights" },
    { icon: MoreHorizontal, title: "Workspace", subtitle: "Settings & team" },
    { icon: Package, title: "Confirmation", subtitle: "Order confirmation" },
    { icon: Package, title: "Products & Inventory", subtitle: "Stock management" },
    { icon: BarChart3, title: "Ads Manager", subtitle: "Campaign management" },
    { icon: BarChart3, title: "Finance", subtitle: "Revenue & expenses" },
    { icon: BarChart3, title: "Expenses", subtitle: "Track costs" },
    { icon: Package, title: "COD Scenarios", subtitle: "COD workflows" },
    { icon: Home, title: "Team", subtitle: "Team management" },
    { icon: Package, title: "Integrations", subtitle: "Connected apps" },
    { icon: MoreHorizontal, title: "Settings", subtitle: "App settings" },
    { icon: BarChart3, title: "Notifications", subtitle: "Alerts & updates" },
    { icon: Home, title: "Support", subtitle: "Help & support" },
    { icon: X, title: "Logout", subtitle: "Sign out" },
  ];

  return (
    <div className="min-h-screen bg-base-bg pb-24 safe-area-bottom">
      {/* Main Content */}
      <div className="min-h-screen">
        {children}
      </div>

      {/* Bottom Navigation */}
      <div className="fixed bottom-0 left-0 right-0 z-50">
        <div className="mx-4 mb-4 rounded-3xl bg-base-surface/90 backdrop-blur-xl border border-base-border/50 shadow-2xl shadow-black/5">
          <div className="flex items-center justify-around px-2 py-3">
            {navItems.map((item) => {
              const Icon = item.icon;
              const isActive = currentPage === item.id;
              
              return (
                <button
                  key={item.id}
                  onClick={() => {
                    if (item.id === "more") {
                      setShowMoreMenu(true);
                    } else {
                      // Navigate to page
                      window.location.href = `/${item.id}`;
                    }
                  }}
                  className="relative flex flex-col items-center gap-1 px-4 py-2 transition-all duration-200"
                >
                  {isActive && (
                    <div className="absolute -top-1 w-1 h-1 rounded-full bg-brand" />
                  )}
                  <Icon
                    size={24}
                    className={`transition-colors duration-200 ${
                      isActive ? "text-brand" : "text-ink-muted"
                    }`}
                  />
                  <span
                    className={`text-[11px] font-medium transition-colors duration-200 ${
                      isActive ? "text-brand" : "text-ink-muted"
                    }`}
                  >
                    {item.label}
                  </span>
                </button>
              );
            })}
          </div>
        </div>
      </div>

      {/* More Menu Bottom Sheet */}
      {showMoreMenu && (
        <>
          {/* Backdrop */}
          <div
            className="fixed inset-0 z-[60] bg-black/50 backdrop-blur-sm"
            onClick={() => setShowMoreMenu(false)}
          />
          
          {/* Sheet */}
          <div className="fixed bottom-0 left-0 right-0 z-[70] bg-base-surface rounded-t-[28px] border-t border-base-border/50 shadow-2xl animate-in slide-in-from-bottom duration-300">
            {/* Drag Handle */}
            <div className="flex justify-center pt-3 pb-2">
              <div className="w-12 h-1.5 rounded-full bg-base-border" />
            </div>
            
            {/* Header */}
            <div className="px-6 pb-4 border-b border-base-border/50">
              <h2 className="text-2xl font-bold text-ink">More</h2>
              <p className="text-sm text-ink-muted mt-1">Access all features</p>
            </div>
            
            {/* Menu Items */}
            <div className="max-h-[70vh] overflow-y-auto px-4 py-4">
              <div className="space-y-1">
                {moreMenuItems.map((item, index) => {
                  const Icon = item.icon;
                  return (
                    <button
                      key={index}
                      className="w-full flex items-center gap-4 px-4 py-4 rounded-2xl hover:bg-base-raised transition-all duration-200 active:scale-[0.98]"
                      onClick={() => {
                        setShowMoreMenu(false);
                        // Navigate to page
                        if (item.title === "Logout") {
                          // Handle logout
                        } else {
                          window.location.href = `/${item.title.toLowerCase().replace(/ & /g, "-").replace(/ /g, "-")}`;
                        }
                      }}
                    >
                      <div className="w-12 h-12 rounded-2xl bg-base-raised border border-base-border/50 flex items-center justify-center">
                        <Icon size={20} className="text-ink" />
                      </div>
                      <div className="flex-1 text-left">
                        <div className="text-[15px] font-semibold text-ink">{item.title}</div>
                        <div className="text-[13px] text-ink-muted mt-0.5">{item.subtitle}</div>
                      </div>
                      <div className="text-ink-muted">
                        <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                          <polyline points="9 18 15 12 9 6" />
                        </svg>
                      </div>
                    </button>
                  );
                })}
              </div>
            </div>
            
            {/* Safe Area Padding */}
            <div className="h-8 safe-area-bottom" />
          </div>
        </>
      )}
    </div>
  );
}
