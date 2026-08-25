import { Navigate } from "react-router-dom";
import { useAuth } from "../hooks/useAuth";
import { PlatformLoading } from "./PlatformLoading";
import type { ReactNode } from "react";

export function SupervisorRoute({ children }: { children: ReactNode }) {
  const { session, loading, profile } = useAuth();

  if (loading) {
    return <PlatformLoading />;
  }

  if (!session) return <Navigate to="/login" replace />;
  if (profile?.role !== "supervisor") return <Navigate to="/" replace />;

  return <>{children}</>;
}
