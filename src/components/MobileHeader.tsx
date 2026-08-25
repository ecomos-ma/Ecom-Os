import { ReactNode } from "react";
import { ArrowLeft, Bell, Search, User } from "lucide-react";

interface MobileHeaderProps {
  title: string;
  showBack?: boolean;
  onBack?: () => void;
  rightAction?: ReactNode;
  showSearch?: boolean;
  onSearch?: () => void;
  showNotification?: boolean;
  showProfile?: boolean;
  profileImage?: string;
}

export default function MobileHeader({
  title,
  showBack = false,
  onBack,
  rightAction,
  showSearch = true,
  onSearch,
  showNotification = true,
  showProfile = true,
  profileImage,
}: MobileHeaderProps) {
  return (
    <div className="sticky top-0 z-40 bg-base-surface/80 backdrop-blur-xl border-b border-base-border/50 safe-area-top">
      <div className="flex items-center justify-between px-4 py-3">
        {/* Left: Back Button */}
        {showBack ? (
          <button
            onClick={onBack || (() => window.history.back())}
            className="w-10 h-10 rounded-xl bg-base-raised border border-base-border/50 flex items-center justify-center active:scale-[0.95] transition-transform"
          >
            <ArrowLeft size={20} className="text-ink" />
          </button>
        ) : (
          <div className="w-10" />
        )}

        {/* Center: Title */}
        <h1 className="text-[17px] font-bold text-ink flex-1 text-center">
          {title}
        </h1>

        {/* Right: Actions */}
        <div className="flex items-center gap-2">
          {showSearch && (
            <button
              onClick={onSearch}
              className="w-10 h-10 rounded-xl bg-base-raised border border-base-border/50 flex items-center justify-center active:scale-[0.95] transition-transform"
            >
              <Search size={18} className="text-ink-muted" />
            </button>
          )}
          
          {showNotification && (
            <button className="w-10 h-10 rounded-xl bg-base-raised border border-base-border/50 flex items-center justify-center active:scale-[0.95] transition-transform relative">
              <Bell size={18} className="text-ink-muted" />
              <span className="absolute top-1 right-1 w-2.5 h-2.5 rounded-full bg-brand border-2 border-base-surface" />
            </button>
          )}
          
          {showProfile && (
            <button className="w-10 h-10 rounded-xl bg-base-raised border border-base-border/50 flex items-center justify-center active:scale-[0.95] transition-transform overflow-hidden">
              {profileImage ? (
                <img src={profileImage} alt="Profile" className="w-full h-full object-cover" />
              ) : (
                <User size={18} className="text-ink-muted" />
              )}
            </button>
          )}
          
          {rightAction}
        </div>
      </div>
    </div>
  );
}
