/**
 * Centralized Shipping Module Access Control
 * 
 * This file provides a single source of truth for determining whether
 * the Shipping module is enabled and accessible for the current workspace.
 * All shipping-related features should use these helpers instead of
 * checking individual flags or permissions directly.
 */

import type { Workspace, Profile } from "./types";

/**
 * Check if the Shipping module is enabled for a workspace
 */
export function isShippingModuleEnabled(workspace: Workspace | null | undefined): boolean {
  return workspace?.shipping_enabled === true;
}

/**
 * Check if a user can access shipping features
 * Combines module state with user permissions
 */
export function canAccessShippingFeatures(
  workspace: Workspace | null | undefined,
  profile: Profile | null | undefined,
  userHasShippingPermission: boolean
): boolean {
  // User must have shipping permission (unless they're an owner-like role)
  if (profile && isOwnerLikeRole(profile.role)) {
    return true;
  }

  return userHasShippingPermission;
}

/**
 * Check if a specific shipping route should be accessible
 * Used for route protection and sidebar visibility
 */
export function canAccessShippingRoute(
  route: string,
  workspace: Workspace | null | undefined,
  profile: Profile | null | undefined,
  userHasShippingPermission: boolean
): boolean {
  const moduleEnabled = isShippingModuleEnabled(workspace);
  
  // If module is disabled, block all shipping routes
  if (!moduleEnabled) {
    return false;
  }

  // Check user permissions
  if (profile && isOwnerLikeRole(profile.role)) {
    return true;
  }

  return userHasShippingPermission;
}

/**
 * Helper to check if a role is owner-like (full access)
 */
function isOwnerLikeRole(role: string | null | undefined): boolean {
  if (!role) return false;
  return ["owner", "supervisor", "admin", "founder", "super_admin"].includes(role);
}

/**
 * Get the appropriate redirect when shipping is disabled
 */
export function getShippingDisabledRedirect(defaultRoute: string | null): string {
  return defaultRoute || "/dashboard";
}
