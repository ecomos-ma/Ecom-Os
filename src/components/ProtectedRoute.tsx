import { ReactNode } from "react";
import { Navigate, useLocation } from "react-router-dom";
import { useAuth } from "../hooks/useAuth";
import { PlatformLoading } from "./PlatformLoading";

export function ProtectedRoute({ children }: { children: ReactNode }) {
  const { session, loading, profile, operationalAccess, subscriptionStatus } = useAuth();
  const location = useLocation();

  // HARD GATE: Wait for complete auth check before rendering anything
  if (loading) {
    return <PlatformLoading />;
  }

  // HARD GATE: Must have valid session
  if (!session) {
    const currentPath = location.pathname + location.search;
    const returnToUrl = currentPath === "/" || currentPath.includes("/login")
      ? ""
      : `?returnTo=${encodeURIComponent(currentPath)}`;
    return <Navigate to={`/login${returnToUrl}`} replace />;
  }

  // HARD GATE: Profile must be active
  if (profile?.is_active === false) return <Navigate to="/disabled" replace />;

  // HARD GATE: Subscription status must be explicitly checked and positive
  // operationalAccess is NULL while checking, FALSE when denied, TRUE when approved
  if (operationalAccess !== true) {
    // If null, still loading subscription state - show loading screen
    if (operationalAccess === null) {
      return <PlatformLoading />;
    }

    const waitingStatuses = new Set([
      "under_review",
      "pending_payment",
      "submitted",
      "reviewing",
      "awaiting_review",
      "awaiting_verification",
    ]);

    // operationalAccess === false: DENY ACCESS - redirect to appropriate gate
    // Reasons: pending_payment, expired, under_review, order_limit_reached, suspended, etc.
    if (subscriptionStatus === "expired") {
      return <Navigate to="/subscription-expired" replace />;
    }
    if (waitingStatuses.has(subscriptionStatus)) {
      return <Navigate to="/waiting-verification" replace />;
    }
    // Default: send to payment page
    return <Navigate to="/payment" replace />;
  }

  // HARD GATE: Only if operationalAccess === true can we render dashboard
  return <>{children}</>;
}
