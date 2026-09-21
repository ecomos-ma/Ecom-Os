import { useEffect, useRef, useCallback } from "react";
import { useAuth } from "./useAuth";

/**
 * Hook to manage data scope when switching workspaces.
 * - Triggers an immediate reset callback when the workspace changes.
 * - Provides a `createGuard()` function to prevent stale closures from
 *   overwriting state after a mid-flight workspace switch.
 */
export function useWorkspaceScope(onReset: () => void) {
  const { workspace } = useAuth();
  const activeWorkspaceIdRef = useRef<string | undefined>(workspace?.id);

  // Immediate reset on workspace change
  useEffect(() => {
    if (activeWorkspaceIdRef.current === workspace?.id) return;
    activeWorkspaceIdRef.current = workspace?.id;
    onReset();
  }, [workspace?.id, onReset]);

  // Create a guard for async operations
  const createGuard = useCallback(() => {
    const snapshotId = workspace?.id;
    return () => activeWorkspaceIdRef.current !== snapshotId;
  }, [workspace?.id]);

  return {
    workspaceId: workspace?.id,
    createGuard,
  };
}
