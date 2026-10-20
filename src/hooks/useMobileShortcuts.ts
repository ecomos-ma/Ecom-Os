import { useMemo, useState } from "react";

/** Only route preferences are stored, scoped to the signed-in user/workspace.
 * Callers must intersect these paths with their currently permitted pages. */
export function useMobileShortcuts(userId?: string, workspaceId?: string) {
  const key = userId && workspaceId ? `ecomos:mobile-shortcuts:${userId}:${workspaceId}` : null;
  const stored = useMemo<string[]>(() => {
    if (!key) return [];
    try {
      const value: unknown = JSON.parse(localStorage.getItem(key) || "[]");
      return Array.isArray(value) ? value.filter((path): path is string => typeof path === "string").slice(0, 4) : [];
    } catch { return []; }
  }, [key]);
  const [state, setState] = useState<{ key: string | null; paths: string[] }>({ key, paths: stored });
  const paths = state.key === key ? state.paths : stored;
  const toggle = (path: string) => {
    if (!key) return;
    const next = paths.includes(path) ? paths.filter((item) => item !== path) : [...paths, path].slice(-4);
    setState({ key, paths: next });
    try { localStorage.setItem(key, JSON.stringify(next)); } catch { /* Private browsing still supports session shortcuts. */ }
  };
  return { pinnedPaths: paths, togglePinned: toggle };
}
