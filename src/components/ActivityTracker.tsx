import { useCallback, useEffect, useRef } from "react";
import { useLocation } from "react-router-dom";
import { useAuth } from "../hooks/useAuth";
import { founderAdmin } from "../lib/founderAdmin";
import { supabase } from "../lib/supabase";

const MIN_HEARTBEAT_MS = 60_000;

const PAGE_LABELS: Record<string, string> = {
  "/dashboard": "Dashboard",
  "/orders": "Orders",
  "/live-view": "Live View",
  "/confirmation": "Confirmation",
  "/whatsapp": "WhatsApp",
  "/delivering": "Delivering",
  "/shipping": "Shipping",
  "/customers": "Customers",
  "/products": "Products & Inventory",
  "/ads": "Ads Manager",
  "/ads-manager-legacy": "Legacy Ads Manager",
  "/ads-manager": "Ads Manager",
  "/tiktok-ads": "TikTok Ads",
  "/expenses": "Expenses",
  "/finance": "Finance",
  "/scenario": "Scenario",
  "/team": "Team",
  "/settings": "Settings",
};

function pageLabel(pathname: string) {
  const match = Object.entries(PAGE_LABELS)
    .sort(([left], [right]) => right.length - left.length)
    .find(([path]) => pathname === path || pathname.startsWith(`${path}/`));
  return match?.[1] ?? "Ecom OS";
}

function activitySessionId() {
  const storageKey = "ecomos:activity-session";
  const existing = window.sessionStorage.getItem(storageKey);
  if (existing) return existing;
  const created = typeof crypto !== "undefined" && typeof crypto.randomUUID === "function"
    ? crypto.randomUUID()
    : `${Date.now()}-${Math.random().toString(36).slice(2)}`;
  window.sessionStorage.setItem(storageKey, created);
  return created;
}

/** A single authenticated-layout heartbeat. It never writes while a tab is hidden. */
export function ActivityTracker() {
  const { session, profile, workspace, isDemoMode } = useAuth();
  const { pathname } = useLocation();
  const lastSentAt = useRef(0);

  const updatePresence = useCallback(async (
    status: "online" | "idle" | "offline",
    callState?: { active: boolean; startedAt: string | null },
  ) => {
    if (isDemoMode || !session?.user?.id || !profile?.id || !workspace?.id) return;
    const now = new Date().toISOString();
    await supabase.from("agent_presence").upsert({
      profile_id: profile.id,
      workspace_id: workspace.id,
      status,
      current_path: pathname,
      current_page: pageLabel(pathname),
      last_heartbeat: now,
      updated_at: now,
      ...(callState ? {
        active_call: callState.active,
        active_call_started_at: callState.startedAt,
      } : {}),
    }, { onConflict: "profile_id" });
  }, [isDemoMode, pathname, profile?.id, session?.user?.id, workspace?.id]);

  const touch = useCallback(() => {
    if (!session?.user?.id || document.visibilityState !== "visible") return;
    const now = Date.now();
    if (now - lastSentAt.current < MIN_HEARTBEAT_MS) return;
    lastSentAt.current = now;
    void founderAdmin.touchLastActive().catch(() => { lastSentAt.current = 0; });
  }, [session?.user?.id]);

  useEffect(() => {
    if (!session?.user?.id) return;
    touch();
    const onVisible = () => { if (document.visibilityState === "visible") touch(); };
    const onActivity = () => touch();
    document.addEventListener("visibilitychange", onVisible);
    window.addEventListener("focus", onActivity);
    window.addEventListener("pointerdown", onActivity, { passive: true });
    window.addEventListener("keydown", onActivity);
    const interval = window.setInterval(touch, MIN_HEARTBEAT_MS);
    return () => {
      document.removeEventListener("visibilitychange", onVisible);
      window.removeEventListener("focus", onActivity);
      window.removeEventListener("pointerdown", onActivity);
      window.removeEventListener("keydown", onActivity);
      window.clearInterval(interval);
    };
  }, [session?.user?.id, touch]);

  useEffect(() => { touch(); }, [pathname, touch]);

  useEffect(() => {
    if (isDemoMode || !session?.user?.id || !profile?.id || !workspace?.id) return;
    const sessionId = activitySessionId();
    const now = new Date().toISOString();
    void updatePresence(document.visibilityState === "visible" ? "online" : "idle");
    void supabase.from("member_activity_log").insert({
      workspace_id: workspace.id,
      profile_id: profile.id,
      action: "page_view",
      entity_type: "page",
      entity_label: pageLabel(pathname),
      page: pathname,
      session_id: sessionId,
      created_at: now,
    });
  }, [isDemoMode, pathname, profile?.id, session?.user?.id, updatePresence, workspace?.id]);

  useEffect(() => {
    if (isDemoMode || !session?.user?.id || !profile?.id || !workspace?.id) return;
    const heartbeat = () => {
      void updatePresence(document.visibilityState === "visible" ? "online" : "idle");
    };
    const onVisibility = () => heartbeat();
    const onCallStatus = (event: Event) => {
      const detail = (event as CustomEvent<{ active?: boolean }>).detail;
      const active = detail?.active === true;
      const startedAt = active ? new Date().toISOString() : null;
      void updatePresence("online", { active, startedAt });
      void supabase.from("member_activity_log").insert({
        workspace_id: workspace.id,
        profile_id: profile.id,
        action: active ? "call_started" : "call_ended",
        entity_type: "confirmation_call",
        entity_label: active ? "Permitted microphone recording started" : "Permitted microphone recording ended",
        page: pathname,
        session_id: activitySessionId(),
      });
    };
    document.addEventListener("visibilitychange", onVisibility);
    window.addEventListener("ecomos:agent-call-status", onCallStatus);
    const interval = window.setInterval(heartbeat, MIN_HEARTBEAT_MS);
    return () => {
      document.removeEventListener("visibilitychange", onVisibility);
      window.removeEventListener("ecomos:agent-call-status", onCallStatus);
      window.clearInterval(interval);
    };
  }, [isDemoMode, pathname, profile?.id, session?.user?.id, updatePresence, workspace?.id]);

  return null;
}
