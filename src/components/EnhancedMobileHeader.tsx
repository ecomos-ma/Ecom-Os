import { useState, useEffect, useCallback, memo } from "react";
import { useNavigate } from "react-router-dom";
import { 
  Search, 
  Bell, 
  Menu, 
  X,
  Settings,
  Zap
} from "lucide-react";
import { useAuth } from "../hooks/useAuth";
import { useTheme } from "../hooks/useTheme";
import { useGlobalOrders } from "../contexts/OrdersContext";
import { ThemeToggle } from "./ThemeToggle";
import { supabase } from "../lib/supabase";

interface MobileHeaderProps {
  onMenuClick: () => void;
  title: string;
}



// Mobile-optimized notifications hook
function useMobileNotifications() {
  const { workspace, profile } = useAuth();
  const [unreadCount, setUnreadCount] = useState(0);

  useEffect(() => {
    if (!profile?.id || !workspace?.id) {
      setUnreadCount(0);
      return;
    }

    const fetchUnreadCount = async () => {
      try {
        const { data, error } = await supabase
          .from('user_notifications')
          .select('id')
          .eq('user_id', profile.id)
          .eq('workspace_id', workspace.id)
          .eq('read', false);

        if (error) {
          if (error.code === '42P01') {
            setUnreadCount(0);
            return;
          }
          throw error;
        }

        setUnreadCount(data?.length || 0);
      } catch (err) {
        console.error('Failed to fetch unread count:', err);
        setUnreadCount(0);
      }
    };

    fetchUnreadCount();
  }, [profile?.id, workspace?.id]);

  return { unreadCount };
}

// Mobile-optimized operations hook
function useMobileOperations() {
  const { workspace } = useAuth();
  const { globalOrders } = useGlobalOrders();
  const [totalAlerts, setTotalAlerts] = useState(0);

  useEffect(() => {
    if (!workspace?.id || !globalOrders.length) {
      setTotalAlerts(0);
      return;
    }

    const pendingConfirmation = globalOrders.filter(o => 
      o.status === 'pending' || o.status === 'new'
    ).length;

    const readyToShip = globalOrders.filter(o => 
      o.status === 'confirmed'
    ).length;

    setTotalAlerts(pendingConfirmation + readyToShip);
  }, [workspace?.id, globalOrders]);

  return { totalAlerts };
}

export const EnhancedMobileHeader = memo(function EnhancedMobileHeader({ onMenuClick, title }: MobileHeaderProps) {
  const navigate = useNavigate();
  const { profile, signOut } = useAuth();
  const { unreadCount } = useMobileNotifications();
  const { totalAlerts } = useMobileOperations();

  const [searchOpen, setSearchOpen] = useState(false);

  // Keyboard shortcut for search
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key === 'k') {
        e.preventDefault();
        setSearchOpen(true);
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, []);



  return (
    <>
      <header className="flex items-center justify-between border-b border-base-border bg-base-surface px-4 h-14 sticky top-0 z-30">
        {/* Left: Menu only */}
        <div className="flex items-center gap-3">
          <button
            onClick={onMenuClick}
            className="p-2 rounded-lg hover:bg-base-raised text-ink"
          >
            <Menu size={20} />
          </button>
        </div>

        {/* Right: Actions */}
        <div className="flex items-center gap-1">
          {/* Search */}
          <button
            onClick={() => setSearchOpen(true)}
            className="p-2 rounded-lg hover:bg-base-raised text-ink"
          >
            <Search size={18} />
          </button>

          {/* Operations (show badge if alerts) */}
          {totalAlerts > 0 && (
            <button
              onClick={() => navigate('/confirmation')}
              className="p-2 rounded-lg hover:bg-base-raised text-amber-500 relative"
            >
              <Zap size={18} />
              <span className="absolute top-1 right-1 w-4 h-4 bg-red-500 text-white text-[10px] font-bold rounded-full flex items-center justify-center">
                {totalAlerts > 9 ? '9+' : totalAlerts}
              </span>
            </button>
          )}

          {/* Notifications */}
          <button
            onClick={() => {/* TODO: Open mobile notifications sheet */}}
            className="p-2 rounded-lg hover:bg-base-raised text-ink relative"
          >
            <Bell size={18} />
            {unreadCount > 0 && (
              <span className="absolute top-1 right-1 w-4 h-4 bg-red-500 text-white text-[10px] font-bold rounded-full flex items-center justify-center">
                {unreadCount > 9 ? '9+' : unreadCount}
              </span>
            )}
          </button>

          {/* Theme Toggle */}
          <ThemeToggle />

          {/* Settings */}
          <button
            onClick={() => navigate('/settings')}
            className="p-2 rounded-lg hover:bg-base-raised text-ink"
            title="Settings"
          >
            <Settings size={18} />
          </button>

          {/* Simple logout button */}
          <button
            onClick={() => signOut()}
            className="p-2 rounded-lg hover:bg-base-raised text-red-500"
            title="Logout"
          >
            <X size={18} />
          </button>
        </div>
      </header>

      {/* Mobile Search Overlay */}
      {searchOpen && (
        <div className="fixed inset-0 z-50 bg-base-surface">
          <div className="flex items-center gap-3 px-4 py-3 border-b border-base-border">
            <button
              onClick={() => setSearchOpen(false)}
              className="p-2 rounded-lg hover:bg-base-raised text-ink"
            >
              <X size={20} />
            </button>
            <input
              type="text"
              placeholder="Search orders, customers..."
              className="flex-1 bg-transparent text-ink placeholder:text-ink-faint outline-none text-base"
              autoFocus
            />
          </div>
          <div className="p-4 text-center text-ink-muted text-sm">
            Start typing to search...
          </div>
        </div>
      )}
    </>
  );
});