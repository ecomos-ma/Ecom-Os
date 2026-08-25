import { ReactNode } from "react";
import { Navigate, useLocation } from "react-router-dom";
import { useAuth } from "../hooks/useAuth";
import { PlatformLoading } from "./PlatformLoading";

export function ProtectedRoute({ children }: { children: ReactNode }) {
  const { session, loading, profile } = useAuth();
  const location = useLocation();

  if (loading) {
    return <PlatformLoading />;
  }

  if (!session) {
    const currentPath = location.pathname + location.search;
    const returnToUrl = currentPath === "/" || currentPath.includes("/login")
      ? ""
      : `?returnTo=${encodeURIComponent(currentPath)}`;
    return <Navigate to={`/login${returnToUrl}`} replace />;
  }

  if (profile?.is_active === false) return <Navigate to="/disabled" replace />;
  return <>{children}</>;
}
