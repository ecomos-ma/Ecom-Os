/**
 * useConfirmationFilter
 * ---------------------
 * Lightweight singleton store (no React context required) that keeps the
 * active Confirmation tab persisted to localStorage using canonical status IDs.
 */
import { useState, useEffect } from "react";

const TAB_KEY = "crm_active_tab";

/** Map canonical status IDs for filtering - ORDER MATTERS for tab display */
export const TAB_CONFIG = [
  { id: "new", canonicalIds: ["new", "pending"] },
  { id: "confirmed", canonicalIds: ["confirmed"] },
  { id: "no_answer", canonicalIds: ["no_answer"] },
  { id: "unreachable", canonicalIds: ["unreachable", "busy"] },
  { id: "scheduled", canonicalIds: ["scheduled"] },
  { id: "shipped", canonicalIds: ["shipped"] },
  { id: "delivered", canonicalIds: ["delivered"] },
  { id: "returned", canonicalIds: ["returned"] },
  { id: "cancelled", canonicalIds: ["cancelled"] },
  { id: "blacklisted", canonicalIds: ["blacklisted"] },
  { id: "duplicate", canonicalIds: ["duplicate"] },
  { id: "out_of_stock", canonicalIds: ["out_of_stock"] },
  { id: "all", canonicalIds: [] },
];

// ─── Internal event bus (no React dep) ───────────────────────────────────────
const listeners = new Set<() => void>();
function notifyListeners() { listeners.forEach((fn) => fn()); }

// ─── Public API ───────────────────────────────────────────────────────────────

/** Read the currently persisted tab ID (canonical). */
export function getActiveTab(): string {
  const stored = localStorage.getItem(TAB_KEY);
  if (!stored || stored === "all") return "new";
  return stored;
}

/** Set the active tab and broadcast to all hook instances. */
export function setActiveTab(tab: string) {
  localStorage.setItem(TAB_KEY, tab);
  notifyListeners();
}

// ─── React hook ──────────────────────────────────────────────────────────────

/** Returns [activeTab, setActiveTab] — re-renders whenever the tab changes. */
export function useConfirmationFilter() {
  const [tab, setTab] = useState<string>(getActiveTab);

  useEffect(() => {
    const sync = () => setTab(getActiveTab());
    listeners.add(sync);
    return () => { listeners.delete(sync); };
  }, []);

  return {
    activeTab: tab,
    setActiveTab: (t: string) => { setTab(t); setActiveTab(t); },
  };
}
