import {
  createContext,
  useContext,
  useEffect,
  useRef,
  useState,
  useCallback,
  useMemo,
  type ReactNode,
} from "react";
import { useNavigate } from "react-router-dom";
import type { Session } from "@supabase/supabase-js";
import { supabase } from "../lib/supabase";
import type { Profile, Workspace, TeamPermissions } from "../lib/types";
import {
  buildPermissionsFromSections,
  buildPermissionsForOwner,
  DEFAULT_TEAM_PERMISSIONS,
  getFirstAllowedRoute,
  isOwnerLikeRole,
  normalizeAllowedSections,
} from "../lib/rbac";
import { toast } from "../components/Toast";
import { prefetchRoute } from "./usePrefetch";
import { getDemoSession, clearDemoSession, type DemoSession } from "../demo";

function sessionIssuedAt(accessToken: string | undefined) {
  if (!accessToken) return 0;
  try {
    const payload = JSON.parse(atob(accessToken.split(".")[1].replace(/-/g, "+").replace(/_/g, "/"))) as { iat?: number };
    return Number(payload.iat || 0) * 1000;
  } catch {
    return 0;
  }
}

function resolveProfilePermissions(profile: Profile | null) {
  if (!profile) {
    return {
      permissions: DEFAULT_TEAM_PERMISSIONS,
      defaultRoute: null as string | null,
    };
  }

  if (isOwnerLikeRole(profile.role)) {
    return {
      permissions: buildPermissionsForOwner(),
      defaultRoute: "/dashboard",
    };
  }

  const sections = normalizeAllowedSections((profile.allowed_sections as string[] | null) ?? []);
  return {
    permissions: buildPermissionsFromSections(sections),
    defaultRoute: getFirstAllowedRoute(sections),
  };
}

interface PreviewWorkspaceState {
  profile: Profile | null;
  workspace: Workspace | null;
}

interface AuthContextValue {
  session: Session | null;
  profile: Profile | null;
  workspace: Workspace | null;
  loading: boolean;
  teamPermissions: TeamPermissions;
  permissionsLoading: boolean;
  defaultRoute: string | null;
  availableWorkspaces: Workspace[];
  workspacePlan: string;
  workspaceLimit: number;
  subscriptionStatus: string;
  operationalAccess: boolean | null;
  signOut: () => Promise<void>;
  refreshProfile: () => Promise<void>;
  patchWorkspace: (workspaceId: string, patch: Partial<Workspace>) => void;
  switchWorkspace: (workspaceId: string) => Promise<void>;
  createWorkspace: (name: string) => Promise<Workspace | null>;
  previewWorkspace: PreviewWorkspaceState | null;
  selectWorkspacePreview: (profile: Profile, workspace: Workspace) => void;
  clearPreviewWorkspace: () => void;
  isDemoMode: boolean;
  demoSession: DemoSession | null;
  exitDemo: () => void;
}

const AuthContext = createContext<AuthContextValue>({
  session: null,
  profile: null,
  workspace: null,
  loading: true,
  teamPermissions: DEFAULT_TEAM_PERMISSIONS,
  permissionsLoading: true,
  defaultRoute: null,
  availableWorkspaces: [],
  // Kept only for backwards-compatible consumers while commercial plans are
  // dormant. They must never be used to limit a workspace.
  workspacePlan: "",
  workspaceLimit: 0,
  subscriptionStatus: "checking",
  operationalAccess: null,
  signOut: async () => { },
  refreshProfile: async () => { },
  patchWorkspace: () => { },
  switchWorkspace: async () => { },
  createWorkspace: async () => null,
  previewWorkspace: null,
  selectWorkspacePreview: () => { },
  clearPreviewWorkspace: () => { },
  isDemoMode: false,
  demoSession: null,
  exitDemo: () => { },
});

export function AuthProvider({ children }: { children: ReactNode }) {
  const navigate = useNavigate();
  const [session, setSession] = useState<Session | null>(null);
  const [profile, setProfile] = useState<Profile | null>(null);
  const [baseWorkspace, setBaseWorkspace] = useState<Workspace | null>(null);
  const [workspace, setWorkspace] = useState<Workspace | null>(null);
  const [previewWorkspace, setPreviewWorkspace] = useState<PreviewWorkspaceState | null>(null);
  const [availableWorkspaces, setAvailableWorkspaces] = useState<Workspace[]>([]);
  const [workspacePlan, setWorkspacePlan] = useState("");
  const [workspaceLimit, setWorkspaceLimit] = useState(0);
  const [subscriptionStatus, setSubscriptionStatus] = useState("checking");
  const [operationalAccess, setOperationalAccess] = useState<boolean | null>(null);
  const [loading, setLoading] = useState(true);
  const [teamPermissions, setTeamPermissions] = useState<TeamPermissions>(DEFAULT_TEAM_PERMISSIONS);
  const [permissionsLoading, setPermissionsLoading] = useState(true);
  const [defaultRoute, setDefaultRoute] = useState<string | null>(null);
  const [demoSession, setDemoSessionState] = useState<DemoSession | null>(null);

  // Stable refs — allow all useCallbacks to have [] deps and never be recreated,
  // which eliminates all render cascades originating from useAuth.
  // IMPORTANT: initialized inline here so they are valid before the first render's
  // useEffect has a chance to run (avoids null-ref crash in getSession callback).
  const loadProfileRef = useRef<((userId: string) => Promise<void>) | null>(null);
  const clearAuthStateRef = useRef<(() => Promise<void>) | null>(null);
  const sessionUserIdRef = useRef<string | undefined>(undefined);
  const previewWorkspaceRef = useRef<PreviewWorkspaceState | null>(null);
  const sessionRef = useRef<typeof session>(null);
  const profileLoadRef = useRef<{ userId: string; promise: Promise<void> } | null>(null);
  const invitationLookupAttemptedRef = useRef(new Set<string>());
  const pendingPlanAttemptedRef = useRef(new Set<string>());
  const baseSubscriptionRef = useRef({ plan: "", workspaceLimit: 0, status: "checking", allowed: null as boolean | null });


  const clearAuthState = useCallback(async () => {
    await supabase.auth.signOut();
    setProfile(null);
    setBaseWorkspace(null);
    setWorkspace(null);
    setPreviewWorkspace(null);
    setAvailableWorkspaces([]);
    setWorkspacePlan("");
    setWorkspaceLimit(0);
    setSubscriptionStatus("checking");
    setOperationalAccess(null);
    setSession(null);
    setTeamPermissions(DEFAULT_TEAM_PERMISSIONS);
    setPermissionsLoading(true);
    setDefaultRoute(null);
    setDemoSessionState(null);
    clearDemoSession();
    navigate("/disabled", { replace: true });
  }, [navigate]);

  const loadProfileAndWorkspaceInternal = useCallback(async (userId: string) => {
    setPermissionsLoading(true);

    const { data: { session: currentSession } } = await supabase.auth.getSession();

    const isSupabaseTableError = (error: { code?: string; message?: string; details?: string; hint?: string } | null | undefined) => {
      if (!error) return false;
      const code = error.code ?? "";
      const message = `${error.message ?? ""} ${error.details ?? ""} ${error.hint ?? ""}`.toLowerCase();
      return code === "PGRST116" || code === "42P01" || code === "42501" || message.includes("does not exist") || message.includes("permission denied") || message.includes("relation") || message.includes("not found");
    };

    const { data: profileData, error: profileErr } = await supabase
      .from("profiles")
      .select("id, full_name, role, workspace_id, created_at, is_active, allowed_sections, avatar_url, session_not_before")
      .eq("id", userId)
      .maybeSingle();

    if (profileErr) {
      if (isSupabaseTableError(profileErr)) {
        console.warn("[useAuth] PROFILE LOAD BLOCKED BY SUPABASE ACCESS:", profileErr.message);
      } else {
        console.error("[useAuth] PROFILE LOAD FAILED:", {
          code: profileErr.code,
          message: profileErr.message,
          details: profileErr.details,
          hint: profileErr.hint,
        });
      }
      setProfile(null);
      setBaseWorkspace(null);
      setWorkspace(null);
      setPreviewWorkspace(null);
      setSubscriptionStatus("unavailable");
      setOperationalAccess(false);
      setTeamPermissions(DEFAULT_TEAM_PERMISSIONS);
      setDefaultRoute(null);
      setPermissionsLoading(false);
      return;
    }

    if (!profileData) {
      await new Promise((r) => setTimeout(r, 1500));
      const { data: retryProfile } = await supabase
        .from("profiles")
        .select("id, full_name, role, workspace_id, created_at, is_active, allowed_sections, avatar_url, session_not_before")
        .eq("id", userId)
        .maybeSingle();
      if (!retryProfile) {
        setProfile(null);
        setBaseWorkspace(null);
        setWorkspace(null);
        setPreviewWorkspace(null);
        setSubscriptionStatus("missing_profile");
        setOperationalAccess(false);
        setTeamPermissions(DEFAULT_TEAM_PERMISSIONS);
        setDefaultRoute(null);
        setPermissionsLoading(false);
        return;
      }
      return loadProfileAndWorkspaceInternal(userId);
    }

    if (profileData.session_not_before && sessionIssuedAt(currentSession?.access_token) < new Date(profileData.session_not_before).getTime()) {
      await supabase.auth.signOut();
      setSession(null);
      setProfile(null);
      setWorkspace(null);
      navigate("/login?reason=session-ended", { replace: true });
      return;
    }

    if (profileData.is_active === false) {
      // Preserve only the founder-approved customer notice before signing the
      // disabled account out. The full audit reason remains founder-only.
      try {
        const { data } = await supabase.rpc("get_my_account_notice");
        if (data && typeof data === "object") window.sessionStorage.setItem("ecomos-account-notice", JSON.stringify(data));
      } catch {
        // The disabled route has a safe generic fallback while migrations roll out.
      }
      await clearAuthStateRef.current!();
      return;
    }

    let localProfile = profileData as Profile;
    const userEmail = currentSession?.user?.email ?? null;

    // Invitation discovery is not part of normal workspace boot. It is tried
    // once per authenticated user through a narrowly scoped RPC, so a policy
    // failure can neither block auth nor repeatedly generate 403 requests.
    if (userEmail && !invitationLookupAttemptedRef.current.has(userId)) {
      invitationLookupAttemptedRef.current.add(userId);
      try {
        const { data: invitation, error: invitationErr } = await supabase
          .rpc("get_my_pending_workspace_invitation");

        if (invitationErr) {
          const errDetail = invitationErr?.message ?? invitationErr?.details ?? JSON.stringify(invitationErr);
          if (isSupabaseTableError(invitationErr)) {
            console.warn("[useAuth] Invitation lookup skipped due to Supabase access issue:", errDetail);
          } else {
            console.warn("[useAuth] Invitation lookup failed:", errDetail);
          }
        }

        const pendingInvitation = Array.isArray(invitation) ? invitation[0] : invitation;
        if (pendingInvitation?.id) {
          // Role, workspace, and permission changes are privileged. Accept the
          // invitation through a security-definer RPC instead of allowing the
          // browser to update those profile columns directly.
          const { error: acceptErr } = await supabase.rpc("accept_workspace_invitation", {
            p_invitation_id: pendingInvitation.id,
          });

          if (acceptErr) {
            console.error("[useAuth] Accept invitation failed:", acceptErr);
          } else {
            return loadProfileAndWorkspaceInternal(userId);
          }
        }
      } catch (error) {
        console.error("[useAuth] Error checking pending invitations:", error);
      }
    }

    const loadWorkspaceMemberships = async (profileId: string) => {
      setWorkspacePlan("");
      setWorkspaceLimit(0);
      const membershipRes = await supabase
        .from("profile_workspaces")
        .select("workspace_id, workspaces(id, name, created_at, meta_access_token, meta_ad_account_id, created_by)")
        .eq("profile_id", profileId);

      if (!membershipRes.error && membershipRes.data) {
        setAvailableWorkspaces(
          membershipRes.data
            .filter((row: any) => row.workspaces)
            .map((row: any) => row.workspaces as Workspace)
        );
      } else {
        if (isSupabaseTableError(membershipRes.error)) {
          console.warn("[useAuth] profile_workspaces lookup skipped due to Supabase access issue");
        } else {
          console.warn("[useAuth] profile_workspaces lookup failed:", membershipRes.error);
        }
        setAvailableWorkspaces([]);
      }
    };

    await loadWorkspaceMemberships(userId);

    if (localProfile.workspace_id) {
      console.log("[useAuth] Loading workspace for user:", userId, "workspace_id:", localProfile.workspace_id);

      const { data: workspaceData, error: wsErr } = await supabase
        .from("workspaces")
        .select("*")
        .eq("id", localProfile.workspace_id)
        .maybeSingle();

      if (wsErr) {
        console.error("[useAuth] WORKSPACE LOAD ERROR:", {
          code: wsErr.code,
          message: wsErr.message,
          details: wsErr.details,
          hint: wsErr.hint,
          workspace_id: localProfile.workspace_id,
        });

        // Tentative de récupération via profile_workspaces
        console.log("[useAuth] Attempting recovery via profile_workspaces...");
        const { data: membershipData, error: membershipErr } = await supabase
          .from("profile_workspaces")
          .select("workspace_id, workspaces(*)")
          .eq("profile_id", userId)
          .limit(1)
          .maybeSingle();

        const recoveredWorkspace = Array.isArray(membershipData?.workspaces)
          ? membershipData?.workspaces[0]
          : membershipData?.workspaces;

        if (membershipErr) {
          console.error("[useAuth] Membership recovery failed:", membershipErr);
        } else if (recoveredWorkspace) {
          const recovered = recoveredWorkspace as unknown as Workspace;
          console.log("[useAuth] Recovery successful, found workspace:", recovered.id);
          // Mettre à jour le workspace_id du profil
          await supabase.rpc("switch_profile_workspace", { new_workspace_id: recovered.id });

          setBaseWorkspace(recovered);
          setWorkspace(previewWorkspaceRef.current?.workspace ?? recovered);
          localProfile = { ...localProfile, workspace_id: recovered.id } as Profile;
        } else {
          console.warn("[useAuth] No workspace membership found for user");
        }
      }

      if (workspaceData) {
        console.log("[useAuth] Workspace loaded successfully:", workspaceData.id);
        setBaseWorkspace(workspaceData as Workspace);
        setWorkspace(previewWorkspaceRef.current?.workspace ?? (workspaceData as Workspace));
      } else if (!wsErr) {
        console.warn("[useAuth] Workspace data is null but no error returned");
        setBaseWorkspace(null);
        setWorkspace(null);
      }
    } else {
      const { data: newWs, error: newWsErr } = await supabase
        .rpc("create_workspace_for_user", { workspace_name: (localProfile.full_name ? `${localProfile.full_name}'s Workspace` : "My Workspace") });

      if (newWsErr || !newWs) {
        setBaseWorkspace(null);
        setWorkspace(null);
        setTeamPermissions(DEFAULT_TEAM_PERMISSIONS);
        setDefaultRoute(null);
        setPermissionsLoading(false);
        return;
      }

      await supabase
        .from("profiles")
        .update({ workspace_id: newWs.id })
        .eq("id", userId);

      localProfile = { ...localProfile, workspace_id: newWs.id } as Profile;
      setBaseWorkspace(newWs as Workspace);
      setWorkspace(previewWorkspaceRef.current?.workspace ?? (newWs as Workspace));
    }

    setProfile(localProfile);

    const workspaceId = localProfile.workspace_id;

    if (!workspaceId) {
      setSubscriptionStatus("workspace_missing");
      setOperationalAccess(false);
      setTeamPermissions(DEFAULT_TEAM_PERMISSIONS);
      setDefaultRoute(null);
      setPermissionsLoading(false);
      return;
    }

    const { data: accessData, error: accessError } = await supabase.rpc("resolve_workspace_access_v1", {
      p_user_id: userId,
      p_workspace_id: workspaceId,
    });
    const access = accessData && typeof accessData === "object" ? accessData as Record<string, any> : null;
    const effective = access?.subscription && typeof access.subscription === "object" ? access.subscription as Record<string, any> : null;
    const nextSubscription = {
      plan: String(effective?.plan?.code || ""),
      workspaceLimit: Number(effective?.limits?.workspaces || 0),
      status: accessError ? "billing_unavailable" : String(effective?.status || access?.reason || "subscription_missing"),
      allowed: accessError ? false : Boolean(access?.allowed),
    };
    baseSubscriptionRef.current = nextSubscription;
    if (!previewWorkspaceRef.current) {
      setWorkspacePlan(nextSubscription.plan);
      setWorkspaceLimit(nextSubscription.workspaceLimit);
      setSubscriptionStatus(nextSubscription.status);
      setOperationalAccess(nextSubscription.allowed);
    }
    if (accessError) console.error("[useAuth] Subscription access resolution failed:", accessError.message);

    if (isOwnerLikeRole(localProfile.role)) {
      setTeamPermissions(buildPermissionsForOwner());
      setDefaultRoute("/dashboard");
      setPermissionsLoading(false);
      return;
    }

    try {
      const sections = normalizeAllowedSections((localProfile.allowed_sections as string[] | null) ?? []);
      const calculatedPermissions = buildPermissionsFromSections(sections);
      setTeamPermissions(calculatedPermissions);
      setDefaultRoute(getFirstAllowedRoute(sections));
    } catch (error) {
      console.error("[useAuth] Failed to load team permissions:", error);
      setTeamPermissions(DEFAULT_TEAM_PERMISSIONS);
      setDefaultRoute(null);
    } finally {
      setPermissionsLoading(false);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []); // ← stable: reads previewWorkspace and clearAuthState through refs

  // getSession(), INITIAL_SESSION, SIGNED_IN and React StrictMode can all race
  // during boot. Keep one in-flight initialization per user instead of issuing
  // duplicate profile, workspace and invitation requests.
  const loadProfileAndWorkspace = useCallback(async (userId: string) => {
    const active = profileLoadRef.current;
    if (active?.userId === userId) return active.promise;

    const promise = loadProfileAndWorkspaceInternal(userId);
    profileLoadRef.current = { userId, promise };
    try {
      await promise;
    } finally {
      if (profileLoadRef.current?.promise === promise) profileLoadRef.current = null;
    }
  }, [loadProfileAndWorkspaceInternal]);

  const refreshProfile = useCallback(async () => {
    const uid = sessionRef.current?.user?.id;
    if (!uid) return;
    await loadProfileRef.current!(uid);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []); // ← stable: reads session and loadProfileAndWorkspace through refs

  const patchWorkspace = useCallback((workspaceId: string, patch: Partial<Workspace>) => {
    setBaseWorkspace((current) => current?.id === workspaceId ? { ...current, ...patch } : current);
    setWorkspace((current) => current?.id === workspaceId ? { ...current, ...patch } : current);
    setPreviewWorkspace((current) => {
      if (!current?.workspace || current.workspace.id !== workspaceId) return current;
      return { ...current, workspace: { ...current.workspace, ...patch } };
    });
    setAvailableWorkspaces((current) => current.map((item) =>
      item.id === workspaceId ? { ...item, ...patch } : item
    ));
  }, []);

  const switchWorkspace = useCallback(async (workspaceId: string) => {
    if (!sessionRef.current?.user?.id) return;
    const { error } = await supabase.rpc("switch_profile_workspace", { new_workspace_id: workspaceId });
    if (error) {
      toast.error("Unable to switch workspace.");
      console.error("[useAuth] switchWorkspace failed:", error);
      return;
    }

    await refreshProfile();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []); // ← stable: reads session via ref, refreshProfile is stable

  const createWorkspace = useCallback(async (name: string) => {
    if (!sessionRef.current?.user?.id) return null;
    const { data, error } = await supabase.rpc("create_workspace_for_user", { workspace_name: name });
    if (error) {
      const message = error.message === "WORKSPACE_LIMIT_REACHED" ? "Unable to create workspace. Please try again or contact support." : "Unable to create workspace.";
      toast.error(message);
      console.error("[useAuth] createWorkspace failed:", error);
      return null;
    }

    await refreshProfile();
    return data as Workspace;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []); // ← stable: reads session via ref, refreshProfile is already stable

  // Refs are assigned synchronously during each render — this guarantees they
  // are always current before any useEffect or async callback reads them.
  // No useEffect needed: render-body assignment runs before effects on every cycle.
  loadProfileRef.current = loadProfileAndWorkspace;
  clearAuthStateRef.current = clearAuthState;
  sessionUserIdRef.current = session?.user?.id;
  previewWorkspaceRef.current = previewWorkspace;
  sessionRef.current = session;


  // Registered ONCE on mount. Uses refs to always call the latest function.
  useEffect(() => {
    let disposed = false;

    void supabase.auth.getSession()
      .then(({ data }) => {
        if (disposed) return;
        setSession(data.session);
        if (data.session?.user?.id) {
          return loadProfileRef.current!(data.session.user.id);
        }
      })
      .catch((error) => {
        if (!disposed) console.error("[useAuth] Unable to restore session:", error);
      })
      .finally(() => {
        if (!disposed) setLoading(false);
      });

    const { data: sub } = supabase.auth.onAuthStateChange((event, sess) => {
      // Ignore transient null sessions during non-terminating events
      if (!sess && (event === "TOKEN_REFRESHED" || event === "INITIAL_SESSION")) return;

      setSession(sess);
      // getSession owns initial hydration. Token refreshes retain the same user
      // and must never restart the complete profile/workspace lifecycle.
      if (event === "INITIAL_SESSION" || event === "TOKEN_REFRESHED" || event === "USER_UPDATED") return;

      if (sess?.user?.id) {
        if (event === "SIGNED_IN") void supabase.rpc("touch_last_login");
        loadProfileRef.current!(sess.user.id);
      } else {
        setProfile(null);
        setBaseWorkspace(null);
        setWorkspace(null);
        setPreviewWorkspace(null);
        setTeamPermissions(DEFAULT_TEAM_PERMISSIONS);
      setDefaultRoute(null);
      setPermissionsLoading(true);
      setSubscriptionStatus("checking");
      setOperationalAccess(null);
      }
    });

    const profileChannel = supabase.channel("profile-status-channel");
    profileChannel
      .on(
        "postgres_changes",
        { event: "UPDATE", schema: "public", table: "profiles" },
        async (payload) => {
          const updatedProfile = payload.new as Profile;
          const issuedBeforeCutoff = Boolean(updatedProfile.session_not_before)
            && sessionIssuedAt(sessionRef.current?.access_token) < new Date(updatedProfile.session_not_before || 0).getTime();
          if (updatedProfile.id === sessionUserIdRef.current && issuedBeforeCutoff && updatedProfile.is_active !== false) {
            await supabase.auth.signOut();
            setProfile(null);
            setBaseWorkspace(null);
            setWorkspace(null);
            setSession(null);
            navigate("/login?reason=session-ended", { replace: true });
          } else if (updatedProfile.id === sessionUserIdRef.current && updatedProfile.is_active === false) {
            try {
              const { data } = await supabase.rpc("get_my_account_notice");
              if (data && typeof data === "object") window.sessionStorage.setItem("ecomos-account-notice", JSON.stringify(data));
            } catch {
              // The disabled screen has a safe generic fallback during rollout.
            }
            await clearAuthStateRef.current!();
          }
        }
      )
      .subscribe();

    return () => {
      disposed = true;
      sub.subscription.unsubscribe();
      void profileChannel.unsubscribe();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []); // ← intentionally empty: listeners must be registered exactly once

  // Warm the high-frequency route chunks after the application becomes ready.
  // Timers space work out to avoid a post-login request/bundle burst.
  useEffect(() => {
    if (loading || !workspace?.id) return;
    const routes = ["/dashboard", "/orders", "/confirmation", "/delivering"];
    const timers = routes.map((route, index) => window.setTimeout(() => prefetchRoute(route), index * 250));
    return () => timers.forEach((timer) => window.clearTimeout(timer));
  }, [loading, workspace?.id]);

  // Check for demo session on mount
  useEffect(() => {
    const demoSession = getDemoSession();
    if (demoSession && demoSession.isActive) {
      setDemoSessionState(demoSession);
      setProfile(demoSession.profile);
      setBaseWorkspace(demoSession.workspace);
      setWorkspace(demoSession.workspace);
      setTeamPermissions(demoSession.teamPermissions);
      setDefaultRoute(demoSession.role === "owner" ? "/dashboard" : "/confirmation");
      setSubscriptionStatus("demo");
      setOperationalAccess(true);
      setPermissionsLoading(false);
      setLoading(false);
    }
  }, []);

  const selectWorkspacePreview = useCallback((nextProfile: Profile, nextWorkspace: Workspace) => {
    const previewAuthorization = resolveProfilePermissions(nextProfile);
    setPreviewWorkspace({ profile: nextProfile, workspace: nextWorkspace });
    setWorkspace(nextWorkspace);
    setTeamPermissions(previewAuthorization.permissions);
    setDefaultRoute(previewAuthorization.defaultRoute);
    setPermissionsLoading(false);
    setSubscriptionStatus("admin_preview");
    setOperationalAccess(true);
  }, []);

  // Signup plan selection is finalized only after Auth has produced a real
  // user session (email confirmation and OAuth can both delay that moment).
  // The server snapshots the official price and creates the owner-level
  // payment request; the browser never writes subscription rows directly.
  useEffect(() => {
    const userId = session?.user?.id;
    if (!userId || pendingPlanAttemptedRef.current.has(userId)) return;
    const raw = window.localStorage.getItem("ecomos_pending_plan");
    if (!raw) return;

    pendingPlanAttemptedRef.current.add(userId);
    void (async () => {
      try {
        const pending = JSON.parse(raw) as { plan?: string; billing?: string; selectedAt?: string };
        if (!pending.plan || !["starter", "growth", "pro", "scale"].includes(pending.plan)) {
          window.localStorage.removeItem("ecomos_pending_plan");
          return;
        }
        const selectedAt = pending.selectedAt ? new Date(pending.selectedAt).getTime() : Date.now();
        if (!Number.isFinite(selectedAt) || Date.now() - selectedAt > 7 * 24 * 60 * 60 * 1000) {
          window.localStorage.removeItem("ecomos_pending_plan");
          return;
        }
        const { error } = await supabase.rpc("create_subscription_payment_request_v1", {
          p_plan_code: pending.plan,
          p_billing_cycle: pending.billing === "yearly" ? "annual" : "monthly",
          p_request_type: "initial_activation",
          p_payment_method: null,
          p_transaction_reference: null,
          p_user_note: "Created from signup plan selection",
        });
        if (error) {
          if (error.message.includes("PAYMENT_REQUEST_ALREADY_UNDER_REVIEW")) {
            window.localStorage.removeItem("ecomos_pending_plan");
            return;
          }
          console.warn("[useAuth] Pending signup plan could not be registered:", error.message);
          pendingPlanAttemptedRef.current.delete(userId);
          return;
        }
        window.localStorage.removeItem("ecomos_pending_plan");
        toast.success("Your plan request is ready for payment review.");
      } catch {
        window.localStorage.removeItem("ecomos_pending_plan");
      }
    })();
  }, [session?.user?.id]);

  const clearPreviewWorkspace = useCallback(() => {
    const baseAuthorization = resolveProfilePermissions(profile);
    setPreviewWorkspace(null);
    setWorkspace(baseWorkspace);
    setTeamPermissions(baseAuthorization.permissions);
    setDefaultRoute(baseAuthorization.defaultRoute);
    setPermissionsLoading(false);
    setWorkspacePlan(baseSubscriptionRef.current.plan);
    setWorkspaceLimit(baseSubscriptionRef.current.workspaceLimit);
    setSubscriptionStatus(baseSubscriptionRef.current.status);
    setOperationalAccess(baseSubscriptionRef.current.allowed);
  }, [baseWorkspace, profile]);

  const signOut = async () => {
    await supabase.auth.signOut();
    setProfile(null);
    setBaseWorkspace(null);
    setWorkspace(null);
    setPreviewWorkspace(null);
    setAvailableWorkspaces([]);
    setWorkspacePlan("free");
    setWorkspaceLimit(0);
    setSubscriptionStatus("checking");
    setOperationalAccess(null);
    setSession(null);
    setTeamPermissions(DEFAULT_TEAM_PERMISSIONS);
    setPermissionsLoading(true);
    setDefaultRoute(null);
    setDemoSessionState(null);
    clearDemoSession();
  };

  const exitDemo = () => {
    setDemoSessionState(null);
    setProfile(null);
    setBaseWorkspace(null);
    setWorkspace(null);
    setTeamPermissions(DEFAULT_TEAM_PERMISSIONS);
    setDefaultRoute(null);
    setPermissionsLoading(true);
    clearDemoSession();
    navigate("/", { replace: true });
  };

  const effectiveProfile = previewWorkspace?.profile ?? profile;

  const contextValue = useMemo(() => ({
    session,
    profile: effectiveProfile,
    workspace,
    loading,
    teamPermissions,
    permissionsLoading,
    defaultRoute,
    availableWorkspaces,
    workspacePlan,
    workspaceLimit,
    subscriptionStatus,
    operationalAccess,
    signOut,
    refreshProfile,
    patchWorkspace,
    switchWorkspace,
    createWorkspace,
    previewWorkspace,
    selectWorkspacePreview,
    clearPreviewWorkspace,
    isDemoMode: !!demoSession?.isActive,
    demoSession,
    exitDemo,
  }), [
    session,
    effectiveProfile,
    workspace,
    loading,
    teamPermissions,
    permissionsLoading,
    defaultRoute,
    availableWorkspaces,
    workspacePlan,
    workspaceLimit,
    subscriptionStatus,
    operationalAccess,
    signOut,
    refreshProfile,
    patchWorkspace,
    switchWorkspace,
    createWorkspace,
    previewWorkspace,
    selectWorkspacePreview,
    clearPreviewWorkspace,
    demoSession,
    exitDemo,
  ]);

  return (
    <AuthContext.Provider value={contextValue}>
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  return useContext(AuthContext);
}
