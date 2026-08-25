import { useCallback, useSyncExternalStore } from "react";

const THEME_STORAGE_KEY = "ecom-scale-theme";
const ACCENT_STORAGE_KEY = "ecom-scale-accent";
const WORKSPACE_ACCENT_PREFIX = "ecom-scale-accent:";

export type ThemeMode = "light" | "dark";

export const DEFAULT_ACCENTS = {
  light: "#DB6A8F",
  dark: "#DB6A8F",
} as const;

export const THEME_COLORS = {
  light: {
    accent: DEFAULT_ACCENTS.light,
    accentHover: "#C55378",
    muted: "#71717A",
    grid: "#E4E4E7",
    tooltipBg: "#FFFFFF",
    tooltipBorder: "#E4E4E7",
  },
  dark: {
    accent: DEFAULT_ACCENTS.dark,
    accentHover: "#C55378",
    muted: "#A1A1AA",
    grid: "#262626",
    tooltipBg: "#1A1A1A",
    tooltipBorder: "#262626",
  },
} as const;

function hexToRgb(hex: string): [number, number, number] | null {
  const normalized = hex.trim().replace(/^#/, "");
  const short = normalized.length === 3;
  const long = normalized.length === 6;
  if (!short && !long) return null;

  const full = short
    ? normalized.split("").map((c) => c + c).join("")
    : normalized;

  const r = parseInt(full.substring(0, 2), 16);
  const g = parseInt(full.substring(2, 4), 16);
  const b = parseInt(full.substring(4, 6), 16);

  if ([r, g, b].some((value) => Number.isNaN(value))) return null;
  return [r, g, b];
}

function rgbToValue(rgb: [number, number, number]) {
  return `${rgb[0]} ${rgb[1]} ${rgb[2]}`;
}

function rgbToHex(rgb: [number, number, number]) {
  return `#${rgb.map((value) => value.toString(16).padStart(2, "0")).join("")}`;
}

function lightenRgb(rgb: [number, number, number], amount = 0.16): [number, number, number] {
  return rgb.map((value) => Math.max(0, Math.min(255, Math.round(value + (255 - value) * amount)))) as [number, number, number];
}

function darkenRgb(rgb: [number, number, number], amount = 0.16): [number, number, number] {
  return rgb.map((value) => Math.max(0, Math.min(255, Math.round(value * (1 - amount))))) as [number, number, number];
}

function normalizeHex(hex: string): string {
  const rgb = hexToRgb(hex);
  if (!rgb) return DEFAULT_ACCENTS.light;
  return `#${rgb.map((value) => value.toString(16).padStart(2, "0")).join("")}`;
}

function getStoredTheme(): ThemeMode {
  if (typeof window === "undefined") return "light";
  const stored = localStorage.getItem(THEME_STORAGE_KEY);
  if (stored === "light" || stored === "dark") return stored;
  return "light";
}

function getGlobalAccent(): string {
  if (typeof window === "undefined") return DEFAULT_ACCENTS.light;
  const stored = localStorage.getItem(ACCENT_STORAGE_KEY);
  if (stored && hexToRgb(stored)) return normalizeHex(stored);
  return DEFAULT_ACCENTS.light;
}

function getWorkspaceAccent(workspaceId?: string): string {
  if (typeof window === "undefined") return getGlobalAccent();
  if (workspaceId) {
    const stored = localStorage.getItem(`${WORKSPACE_ACCENT_PREFIX}${workspaceId}`);
    if (stored && hexToRgb(stored)) return normalizeHex(stored);
  }
  return getGlobalAccent();
}

function getStoredAccent(): string {
  return getGlobalAccent();
}

function applyAccent(hex: string) {
  const normalized = normalizeHex(hex);
  const rgb = hexToRgb(normalized) ?? hexToRgb(DEFAULT_ACCENTS.light)!;
  const hoverRgb = darkenRgb(rgb, 0.16);
  document.documentElement.style.setProperty("--color-accent", rgbToValue(rgb));
  document.documentElement.style.setProperty("--color-accent-hover", rgbToValue(hoverRgb));
  currentSnapshot = {
    mode: document.documentElement.classList.contains("dark") ? "dark" : "light",
    accent: normalized,
  };
}

function applyTheme(mode: ThemeMode) {
  document.documentElement.classList.toggle("dark", mode === "dark");
  applyAccent(getStoredAccent());
  updateSnapshot();
}

/** Call before React render to avoid flash of wrong theme */
export function initTheme() {
  applyTheme(getStoredTheme());
}

let listeners = new Set<() => void>();

function subscribe(listener: () => void) {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

type ThemeSnapshot = { mode: ThemeMode; accent: string };

let currentSnapshot: ThemeSnapshot = {
  mode: "light",
  accent: DEFAULT_ACCENTS.light,
};

function updateSnapshot() {
  currentSnapshot = {
    mode: document.documentElement.classList.contains("dark") ? "dark" : "light",
    accent: getStoredAccent(),
  };
}

function getSnapshot(): ThemeSnapshot {
  return currentSnapshot;
}

function setTheme(mode: ThemeMode) {
  applyTheme(mode);
  localStorage.setItem(THEME_STORAGE_KEY, mode);
  listeners.forEach((listener) => listener());
}

function setAccent(hex: string) {
  const normalized = normalizeHex(hex);
  localStorage.setItem(ACCENT_STORAGE_KEY, normalized);
  applyAccent(normalized);
  listeners.forEach((listener) => listener());
}

export function useTheme() {
  const snapshot = useSyncExternalStore<ThemeSnapshot>(
    subscribe,
    getSnapshot,
    () => ({ mode: "dark", accent: DEFAULT_ACCENTS.light } as ThemeSnapshot)
  );

  const setDark = useCallback(() => setTheme("dark"), []);
  const setLight = useCallback(() => setTheme("light"), []);
  const setAccentColor = useCallback((hex: string) => setAccent(hex), []);

  return {
    mode: snapshot.mode,
    isDark: snapshot.mode === "dark",
    accent: snapshot.accent,
    setDark,
    setLight,
    setAccent: setAccentColor,
  };
}
