import { ReactNode } from "react";
import { useLocation } from "react-router-dom";
import { Navigate } from "react-router-dom";
import { useAuth } from "../hooks/useAuth";
import { isOwnerLikeRole } from "../lib/rbac";
import { isShippingModuleEnabled, getShippingDisabledRedirect } from "../lib/shippingModule";
import { ShippingModuleDisabled } from "./ShippingModuleDisabled";
import type { TeamPermissions } from "../lib/types";

interface PermissionGuardProps {
  children: ReactNode;
  permission: keyof TeamPermissions;
}

export function PermissionGuard({ children, permission }: PermissionGuardProps) {
  const { profile, teamPermissions: permissions, permissionsLoading: loading, defaultRoute, workspace } = useAuth();
  const location = useLocation();

  // Owners and supervisors have access to everything
  if (profile && isOwnerLikeRole(profile.role)) {
    return <>{children}</>;
  }

  // If loading initially, return null. But if permissions were already resolved 
  // from a previous background state and we are just syncing, DO NOT unmount the children.
  if (loading && (!profile || !permissions[permission])) {
    return null;
  }

  // If shipping module is disabled for this workspace, deny access to both Shipping and Delivering pages
  if (permission === "shipping" && !isShippingModuleEnabled(workspace)) {
    if (location.pathname.startsWith("/shipping") || location.pathname.startsWith("/delivering")) {
      return <ShippingModuleDisabled />;
    }
  }

  if (!permissions[permission]) {
    if (defaultRoute) {
      return <Navigate to={defaultRoute} replace />;
    }

    return (
      <div className="flex min-h-screen items-center justify-center bg-base px-4 py-10">
        <div className="w-full max-w-2xl rounded-3xl border border-base-border bg-base-surface p-8 text-center shadow-card">
          <h1 className="text-[22px] font-semibold text-ink mb-3">Access restricted</h1>
          <p className="text-[14px] text-ink-muted">
            Your administrator has not assigned any sections yet.
          </p>
          <div className="mt-6 rounded-2xl border border-amber-200/70 bg-amber-100/60 p-4 text-[13px] text-amber-900">
            Please contact your workspace owner to get started.
          </div>
        </div>
      </div>
    );
  }

  return <>{children}</>;
}
