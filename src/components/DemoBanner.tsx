import { X, Crown, Users } from "lucide-react";
import { useAuth } from "../hooks/useAuth";

export function DemoBanner() {
  const { isDemoMode, demoSession, exitDemo } = useAuth();

  if (!isDemoMode || !demoSession) return null;

  const isOwner = demoSession.role === "owner";
  const isAgent = demoSession.role === "agent";

  return (
    <div className="relative z-50 border-b border-brand/20 bg-gradient-to-r from-brand/10 via-brand/5 to-brand/10 px-4 py-2.5">
      <div className="mx-auto flex max-w-7xl items-center justify-between">
        <div className="flex items-center gap-2">
          <span className="inline-flex h-5 w-5 items-center justify-center rounded-full bg-brand text-white">
            {isOwner ? <Crown size={12} /> : <Users size={12} />}
          </span>
          <span className="text-sm font-medium text-brand">
            Demo Workspace · {isOwner ? "Owner" : "Agent"}
          </span>
          <span className="text-xs text-ink-muted">
            — You're exploring Ecom OS with sample data
          </span>
        </div>
        <button
          onClick={exitDemo}
          className="flex items-center gap-1.5 rounded-lg bg-base-surface px-3 py-1.5 text-xs font-medium text-ink hover:bg-base-raised transition-colors"
        >
          <X size={14} />
          Exit Demo
        </button>
      </div>
    </div>
  );
}
