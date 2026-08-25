import { useCallback, useEffect, useRef } from "react";
import { useLocation } from "react-router-dom";
import { useAuth } from "../hooks/useAuth";
import { founderAdmin } from "../lib/founderAdmin";

const MIN_HEARTBEAT_MS = 60_000;

/** A single authenticated-layout heartbeat. It never writes while a tab is hidden. */
export function ActivityTracker() {
  const { session } = useAuth();
  const { pathname } = useLocation();
  const lastSentAt = useRef(0);

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
  return null;
}
