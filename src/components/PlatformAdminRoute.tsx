import { createContext, useContext, useEffect, useMemo, useState, type ReactNode } from "react";
import { Navigate } from "react-router-dom";
import { useAuth } from "../hooks/useAuth";
import { founderAdmin, type PlatformAuthorization } from "../lib/founderAdmin";
import {
  isFounder,
  PLATFORM_PERMISSION_KEYS,
  type PlatformPermission,
} from "../lib/rbac";
import { PlatformLoading } from "./PlatformLoading";

type PlatformAdminContextValue = {
  authorization: PlatformAuthorization;
  can: (permission: PlatformPermission) => boolean;
};

const PlatformAdminContext = createContext<PlatformAdminContextValue | null>(null);

function rootFallback(profileId: string, email: string | null | undefined): PlatformAuthorization {
  return {
    profile_id: profileId,
    email: email || null,
    is_root_founder: true,
    is_platform_admin: true,
    role: "root_founder",
    expires_at: null,
    permissions: [...PLATFORM_PERMISSION_KEYS],
  };
}

export function usePlatformAdmin() {
  const context = useContext(PlatformAdminContext);
  if (!context) throw new Error("usePlatformAdmin must be used inside PlatformAdminRoute");
  return context;
}

/**
 * Browser routing guard backed by the canonical server authorization RPC.
 * The exact root-founder fallback keeps the current production founder route
 * available while the additive authorization migration is being deployed;
 * every privileged RPC still performs its own database authorization.
 */
export function PlatformAdminRoute({ children }: { children: ReactNode }) {
  const { session, profile, loading } = useAuth();
  const [authorization, setAuthorization] = useState<PlatformAuthorization | null>(null);
  const [checking, setChecking] = useState(true);

  useEffect(() => {
    let active = true;

    if (loading) return () => { active = false; };
    if (!session || !profile) {
      setAuthorization(null);
      setChecking(false);
      return () => { active = false; };
    }

    setChecking(true);
    void founderAdmin.authorization()
      .then((result) => {
        if (active) setAuthorization(result?.is_platform_admin ? result : null);
      })
      .catch(() => {
        if (!active) return;
        setAuthorization(
          isFounder(profile.role, session.user.email)
            ? rootFallback(profile.id, session.user.email)
            : null,
        );
      })
      .finally(() => { if (active) setChecking(false); });

    return () => { active = false; };
  }, [loading, profile, session]);

  const value = useMemo<PlatformAdminContextValue | null>(() => {
    if (!authorization) return null;
    const permissions = new Set(authorization.permissions);
    return { authorization, can: (permission) => permissions.has(permission) };
  }, [authorization]);

  if (loading || checking) return <PlatformLoading />;
  if (!session) return <Navigate to="/login" replace />;
  if (!value) return <Navigate to="/dashboard" replace />;

  return <PlatformAdminContext.Provider value={value}>{children}</PlatformAdminContext.Provider>;
}
