import { Navigate } from "react-router-dom";
import type { ReactNode } from "react";
import { useAuth } from "../hooks/useAuth";
import { isFounder } from "../lib/rbac";
import { PlatformLoading } from "./PlatformLoading";

/** Browser guard only. Database RPCs and Edge Functions also enforce founder access. */
export function FounderRoute({ children }: { children: ReactNode }) {
  const { session, profile, loading } = useAuth();

  if (loading) return <PlatformLoading />;
  if (!session) return <Navigate to="/login" replace />;
  if (!isFounder(profile?.role, session.user.email)) return <Navigate to="/dashboard" replace />;

  return <>{children}</>;
}
