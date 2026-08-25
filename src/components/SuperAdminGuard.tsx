import { Navigate } from "react-router-dom";
import { useAuth } from "../hooks/useAuth";
import { isSuperAdmin, SUPER_ADMIN_EMAIL } from "../lib/rbac";
import { PlatformLoading } from "./PlatformLoading";

interface SuperAdminGuardProps {
  children: React.ReactNode;
}

export function SuperAdminGuard({ children }: SuperAdminGuardProps) {
  const { profile, session, loading } = useAuth();

  // Wait for auth to load before checking permissions
  if (loading) {
    return <PlatformLoading />;
  }

  // Check if user is super_admin and has the authorized email
  const role = profile?.role;
  const email = session?.user?.email;
  const authorized = isSuperAdmin(role, email);

  console.log('[SuperAdminGuard] Check:', JSON.stringify({
    role,
    email,
    SUPER_ADMIN_EMAIL,
    roleMatch: role === "super_admin",
    emailMatch: email === SUPER_ADMIN_EMAIL,
    authorized
  }, null, 2));

  if (!authorized) {
    console.log('[SuperAdminGuard] Unauthorized, redirecting to 404');
    return <Navigate to="/404" replace />;
  }

  console.log('[SuperAdminGuard] Authorized, rendering children');
  return <>{children}</>;
}