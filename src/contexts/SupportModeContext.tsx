import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from "react";
import { founderAdmin, type PlatformSupportContext } from "../lib/founderAdmin";
import type { Profile, UserRole, Workspace } from "../lib/types";
import { useAuth } from "../hooks/useAuth";

const STORAGE_KEY = "ecomos:platform-support-session-id";

type SupportModeValue = {
  context: PlatformSupportContext | null;
  loading: boolean;
  remainingSeconds: number;
  activate: (sessionIdOrContext: string | PlatformSupportContext) => Promise<PlatformSupportContext>;
  start: (workspaceId: string, profileId: string, reason: string, durationMinutes?: number) => Promise<PlatformSupportContext>;
  elevate: (reason: string, durationMinutes?: number) => Promise<void>;
  end: (reason?: string) => Promise<void>;
};

const SupportModeContext = createContext<SupportModeValue | null>(null);

function remaining(context: PlatformSupportContext | null) {
  if (!context) return 0;
  return Math.max(0, Math.floor((new Date(context.session.expires_at).getTime() - Date.now()) / 1000));
}

export function SupportModeProvider({ children }: { children: ReactNode }) {
  const { session, loading: authLoading, selectWorkspacePreview, clearPreviewWorkspace } = useAuth();
  const [context, setContext] = useState<PlatformSupportContext | null>(null);
  const [loading, setLoading] = useState(false);
  const [remainingSeconds, setRemainingSeconds] = useState(0);
  const contextRef = useRef<PlatformSupportContext | null>(null);

  const clearLocal = useCallback(() => {
    window.sessionStorage.removeItem(STORAGE_KEY);
    contextRef.current = null;
    setContext(null);
    setRemainingSeconds(0);
    clearPreviewWorkspace();
  }, [clearPreviewWorkspace]);

  const applyContext = useCallback((next: PlatformSupportContext) => {
    const previewProfile: Profile = {
      ...next.profile,
      role: next.profile.role as UserRole,
      allowed_sections: (next.profile.allowed_sections || []) as Profile["allowed_sections"],
    };
    const previewWorkspace: Workspace = {
      ...next.workspace,
      status: next.workspace.status as Workspace["status"],
      meta_access_token: null,
      meta_ad_account_id: null,
    };

    window.sessionStorage.setItem(STORAGE_KEY, next.session.id);
    contextRef.current = next;
    setContext(next);
    setRemainingSeconds(remaining(next));
    selectWorkspacePreview(previewProfile, previewWorkspace);
  }, [selectWorkspacePreview]);

  const activate = useCallback(async (sessionIdOrContext: string | PlatformSupportContext) => {
    setLoading(true);
    try {
      const sessionId = typeof sessionIdOrContext === "string" ? sessionIdOrContext : sessionIdOrContext.session.id;
      const next = await founderAdmin.platformSupportContext(sessionId);
      applyContext(next);
      return next;
    } catch (error) {
      clearLocal();
      throw error;
    } finally {
      setLoading(false);
    }
  }, [applyContext, clearLocal]);

  const start = useCallback(async (workspaceId: string, profileId: string, reason: string, durationMinutes = 30) => {
    const created = await founderAdmin.startPlatformSupportSession(workspaceId, profileId, reason, durationMinutes);
    return activate(created.id);
  }, [activate]);

  const elevate = useCallback(async (reason: string, durationMinutes = 10) => {
    const active = contextRef.current;
    if (!active) throw new Error("No active Support Mode session.");
    await founderAdmin.elevatePlatformSupportSession(active.session.id, reason, durationMinutes);
    await activate(active.session.id);
  }, [activate]);

  const end = useCallback(async (reason = "admin_exit") => {
    const active = contextRef.current;
    try {
      if (active) await founderAdmin.endPlatformSupportSession(active.session.id, reason);
    } finally {
      clearLocal();
    }
  }, [clearLocal]);

  useEffect(() => {
    if (authLoading) return;
    if (!session?.user?.id) {
      clearLocal();
      return;
    }
    const storedId = window.sessionStorage.getItem(STORAGE_KEY);
    if (storedId && !contextRef.current) void activate(storedId).catch(() => undefined);
  }, [activate, authLoading, clearLocal, session?.user?.id]);

  useEffect(() => {
    if (!context) return;
    const timer = window.setInterval(() => {
      const seconds = remaining(contextRef.current);
      setRemainingSeconds(seconds);
      if (seconds <= 0) clearLocal();
    }, 1000);
    const validator = window.setInterval(() => {
      const active = contextRef.current;
      if (active) void activate(active.session.id).catch(() => undefined);
    }, 30_000);
    return () => {
      window.clearInterval(timer);
      window.clearInterval(validator);
    };
  }, [activate, clearLocal, context]);

  const value = useMemo(() => ({ context, loading, remainingSeconds, activate, start, elevate, end }), [activate, context, elevate, end, loading, remainingSeconds, start]);
  return <SupportModeContext.Provider value={value}>{children}</SupportModeContext.Provider>;
}

export function useSupportMode() {
  const value = useContext(SupportModeContext);
  if (!value) throw new Error("useSupportMode must be used within SupportModeProvider");
  return value;
}
