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
import { useAuth } from "../hooks/useAuth";
import { supabase } from "../lib/supabase";
import { DEFAULT_LOCALE, normalizeLocale, type Locale } from "./config";
import {
  formatCurrency as formatCurrencyValue,
  formatDate as formatDateValue,
  formatDateTime as formatDateTimeValue,
  formatNumber as formatNumberValue,
  formatPercent as formatPercentValue,
} from "./format";
import { translate, type TranslationKey, type TranslationValues } from "./translate";

const LANGUAGE_EVENT_KEY = "ecomos:workspace-language-event";
const LANGUAGE_CHANNEL = "ecomos-workspace-language";
const LEGACY_LANGUAGE_KEYS = ["ecomos-status-language", "status_language", "order_status_language"];

interface LocaleState {
  workspaceId: string | null;
  locale: Locale;
}

interface I18nContextValue {
  language: Locale;
  locale: Locale;
  t: (key: TranslationKey, values?: TranslationValues) => string;
  formatDate: (value: Date | string | number, options?: Intl.DateTimeFormatOptions) => string;
  formatDateTime: (value: Date | string | number) => string;
  formatNumber: (value: number, options?: Intl.NumberFormatOptions) => string;
  formatPercent: (value: number, options?: Intl.NumberFormatOptions) => string;
  formatCurrency: (value: number, currency?: string) => string;
  updateWorkspaceLanguage: (locale: Locale) => Promise<void>;
}

const defaultContext: I18nContextValue = {
  language: DEFAULT_LOCALE,
  locale: DEFAULT_LOCALE,
  t: (key, values) => translate(DEFAULT_LOCALE, key, values),
  formatDate: (value, options) => formatDateValue(value, DEFAULT_LOCALE, options),
  formatDateTime: (value) => formatDateTimeValue(value, DEFAULT_LOCALE),
  formatNumber: (value, options) => formatNumberValue(value, DEFAULT_LOCALE, options),
  formatPercent: (value, options) => formatPercentValue(value, DEFAULT_LOCALE, options),
  formatCurrency: (value, currency) => formatCurrencyValue(value, DEFAULT_LOCALE, currency),
  updateWorkspaceLanguage: async () => undefined,
};

const I18nContext = createContext<I18nContextValue>(defaultContext);

interface WorkspaceLanguageEvent {
  workspaceId: string;
  language: Locale;
  sentAt: number;
}

function isWorkspaceLanguageEvent(value: unknown): value is WorkspaceLanguageEvent {
  if (!value || typeof value !== "object") return false;
  const event = value as Partial<WorkspaceLanguageEvent>;
  return typeof event.workspaceId === "string" && normalizeLocale(event.language) === event.language;
}

export function LanguageProvider({ children }: { children: ReactNode }) {
  const { workspace, patchWorkspace } = useAuth();
  const workspaceId = workspace?.id ?? null;
  const workspaceLocale = normalizeLocale(workspace?.language);
  const [override, setOverride] = useState<LocaleState>({ workspaceId, locale: workspaceLocale });
  const channelRef = useRef<BroadcastChannel | null>(null);

  // A state value from the previous tenant is never used for the next tenant.
  // This makes workspace switching safe during the render before effects run.
  const locale = override.workspaceId === workspaceId ? override.locale : workspaceLocale;

  const applyLanguage = useCallback((targetWorkspaceId: string, nextLocale: Locale) => {
    setOverride({ workspaceId: targetWorkspaceId, locale: nextLocale });
    patchWorkspace(targetWorkspaceId, { language: nextLocale });
  }, [patchWorkspace]);

  useEffect(() => {
    setOverride({ workspaceId, locale: workspaceLocale });
  }, [workspaceId, workspaceLocale]);

  useEffect(() => {
    document.documentElement.lang = locale;
  }, [locale]);

  useEffect(() => {
    for (const key of LEGACY_LANGUAGE_KEYS) window.localStorage.removeItem(key);
  }, []);

  useEffect(() => {
    if (!workspaceId) return;

    const applyEvent = (event: WorkspaceLanguageEvent) => {
      if (event.workspaceId === workspaceId) applyLanguage(event.workspaceId, event.language);
    };

    if ("BroadcastChannel" in window) {
      const channel = new BroadcastChannel(LANGUAGE_CHANNEL);
      channelRef.current = channel;
      channel.onmessage = (message: MessageEvent<unknown>) => {
        if (isWorkspaceLanguageEvent(message.data)) applyEvent(message.data);
      };
    }

    const onStorage = (event: StorageEvent) => {
      if (event.key !== LANGUAGE_EVENT_KEY || !event.newValue) return;
      try {
        const value: unknown = JSON.parse(event.newValue);
        if (isWorkspaceLanguageEvent(value)) applyEvent(value);
      } catch {
        // Ignore malformed events; the database remains the source of truth.
      }
    };
    window.addEventListener("storage", onStorage);

    const realtime = supabase
      .channel(`workspace-language:${workspaceId}`)
      .on(
        "postgres_changes",
        { event: "UPDATE", schema: "public", table: "workspaces", filter: `id=eq.${workspaceId}` },
        (payload) => {
          const next = normalizeLocale((payload.new as { language?: unknown }).language);
          applyLanguage(workspaceId, next);
        }
      )
      .subscribe();

    return () => {
      window.removeEventListener("storage", onStorage);
      channelRef.current?.close();
      channelRef.current = null;
      void realtime.unsubscribe();
    };
  }, [applyLanguage, workspaceId]);

  const publishLanguage = useCallback((targetWorkspaceId: string, nextLocale: Locale) => {
    const event: WorkspaceLanguageEvent = { workspaceId: targetWorkspaceId, language: nextLocale, sentAt: Date.now() };
    channelRef.current?.postMessage(event);
    // This key is an event transport for browsers without BroadcastChannel, not
    // a locale cache. It is tenant-scoped in the payload and never read at boot.
    window.localStorage.setItem(LANGUAGE_EVENT_KEY, JSON.stringify(event));
  }, []);

  const updateWorkspaceLanguage = useCallback(async (nextLocale: Locale) => {
    if (!workspaceId) throw new Error("No active workspace");
    const normalized = normalizeLocale(nextLocale);
    const previous = locale;
    applyLanguage(workspaceId, normalized);

    const { data, error } = await supabase.rpc("update_workspace_language", {
      p_workspace_id: workspaceId,
      p_language: normalized,
    });

    if (error) {
      applyLanguage(workspaceId, previous);
      throw error;
    }

    const persisted = normalizeLocale(data);
    applyLanguage(workspaceId, persisted);
    publishLanguage(workspaceId, persisted);
  }, [applyLanguage, locale, publishLanguage, workspaceId]);

  const value = useMemo<I18nContextValue>(() => ({
    language: locale,
    locale,
    t: (key, values) => translate(locale, key, values),
    formatDate: (input, options) => formatDateValue(input, locale, options),
    formatDateTime: (input) => formatDateTimeValue(input, locale),
    formatNumber: (input, options) => formatNumberValue(input, locale, options),
    formatPercent: (input, options) => formatPercentValue(input, locale, options),
    formatCurrency: (input, currency) => formatCurrencyValue(input, locale, currency),
    updateWorkspaceLanguage,
  }), [locale, updateWorkspaceLanguage]);

  return <I18nContext.Provider value={value}>{children}</I18nContext.Provider>;
}

export function useI18n(): I18nContextValue {
  return useContext(I18nContext);
}

export { DEFAULT_LOCALE, normalizeLocale, type Locale } from "./config";
export { translate, type TranslationKey, type TranslationValues } from "./translate";
