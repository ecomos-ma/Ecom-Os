import {
  useCallback,
  useEffect,
  useMemo,
  useState,
  type FormEvent,
} from "react";
import {
  Activity,
  AlertCircle,
  BarChart3,
  CheckCircle2,
  ChevronLeft,
  ChevronRight,
  DollarSign,
  Eye,
  EyeOff,
  ExternalLink,
  Film,
  ImageIcon,
  KeyRound,
  MousePointerClick,
  Pause,
  Play,
  RefreshCw,
  Search,
  ShieldCheck,
  SlidersHorizontal,
  Target,
  Unplug,
  Wifi,
} from "lucide-react";
import { EmptyState } from "../components/EmptyState";
import { Modal } from "../components/Modal";
import { PageHeader } from "../components/PageHeader";
import { toast } from "../components/Toast";
import { useAuth } from "../hooks/useAuth";
import { useWorkspaceScope } from "../hooks/useWorkspaceScope";
import { getIntegrationLogo } from "../lib/integrationLogos";
import { supabase } from "../lib/supabase";
import {
  metaLegacyService,
  type MetaLegacyCampaign,
  type MetaLegacyCampaignDetail,
  type MetaLegacyMetrics,
  type MetaLegacyStatus,
} from "../services/metaLegacyService";

const METRICS = [
  { key: "spend", label: "Spend", format: "currency" },
  { key: "reach", label: "Reach", format: "number" },
  { key: "impressions", label: "Impressions", format: "number" },
  { key: "clicks", label: "All clicks", format: "number" },
  { key: "inline_link_clicks", label: "Link clicks", format: "number" },
  { key: "outbound_clicks", label: "Outbound clicks", format: "number" },
  { key: "unique_clicks", label: "Unique clicks", format: "number" },
  { key: "ctr", label: "CTR", format: "percent" },
  { key: "cpc", label: "CPC", format: "currency" },
  { key: "cpm", label: "CPM", format: "currency" },
  { key: "frequency", label: "Frequency", format: "decimal" },
  { key: "leads", label: "Leads", format: "number" },
  { key: "purchases", label: "Purchases", format: "number" },
  { key: "add_to_cart", label: "Add to cart", format: "number" },
  { key: "initiate_checkout", label: "Checkouts", format: "number" },
  { key: "cost_per_lead", label: "Cost per lead", format: "currency" },
  { key: "cost_per_purchase", label: "Cost per purchase", format: "currency" },
] as const;

type MetricKey = (typeof METRICS)[number]["key"];
type SortKey = "campaign_name" | MetricKey;
type MetricPreferences = {
  dashboard_metrics: MetricKey[];
  table_metrics: MetricKey[];
};

const DEFAULT_METRIC_PREFERENCES: MetricPreferences = {
  dashboard_metrics: ["spend", "reach", "impressions", "inline_link_clicks", "purchases"],
  table_metrics: ["spend", "reach", "impressions", "inline_link_clicks", "outbound_clicks", "ctr", "cpc", "cpm"],
};

function isMetricKey(value: string): value is MetricKey {
  return METRICS.some((metric) => metric.key === value);
}

function campaignMetric(campaign: MetaLegacyCampaign, key: MetricKey): number {
  const stored = Number(campaign.meta_metrics?.[key]);
  if (Number.isFinite(stored)) return stored;
  return Number(campaign[key as keyof MetaLegacyCampaign] ?? 0);
}

function metricIcon(key: MetricKey) {
  if (["spend", "cpc", "cpm", "cost_per_lead", "cost_per_purchase"].includes(key)) return <DollarSign size={17} />;
  if (["reach", "impressions", "frequency"].includes(key)) return <Eye size={17} />;
  if (key.includes("click")) return <MousePointerClick size={17} />;
  return <Target size={17} />;
}

const PAGE_SIZE = 20;

function dashboardDateRange() {
  if (typeof window === "undefined") {
    return { preset: "last_7d", since: "", until: "" };
  }
  const rangeType = localStorage.getItem("dashboard_range_type");
  const since = localStorage.getItem("dashboard_date_from") || "";
  const until = localStorage.getItem("dashboard_date_to") || "";
  if (rangeType === "today" || rangeType === "yesterday") {
    return { preset: rangeType, since: "", until: "" };
  }
  if (rangeType === "all") {
    return { preset: "maximum", since: "", until: "" };
  }
  if (
    /^\d{4}-\d{2}-\d{2}$/.test(since) &&
    /^\d{4}-\d{2}-\d{2}$/.test(until)
  ) {
    return { preset: "custom", since, until };
  }
  return { preset: "last_7d", since: "", until: "" };
}

function persistDashboardDateRange(
  preset: string,
  since = "",
  until = "",
) {
  if (typeof window === "undefined") return;
  const rangeType = preset === "maximum" ? "all" :
    ["today", "yesterday"].includes(preset) ? preset : "custom";
  let from = since;
  let to = until;
  if (rangeType === "custom" && !from && !to) {
    const days = Number(preset.replace("last_", "").replace("d", ""));
    const end = new Date();
    const start = new Date();
    if (Number.isFinite(days) && days > 0) start.setDate(start.getDate() - days + 1);
    from = start.toISOString().slice(0, 10);
    to = end.toISOString().slice(0, 10);
  }
  localStorage.setItem("dashboard_date_from", from);
  localStorage.setItem("dashboard_date_to", to);
  localStorage.setItem("dashboard_range_type", rangeType);
  window.dispatchEvent(new CustomEvent("dashboard-date-changed", {
    detail: { from, to, rangeType },
  }));
}

function cachedOverviewKey(
  workspaceId: string,
  range: { datePreset: string; since?: string; until?: string },
) {
  return `meta-legacy-overview:${workspaceId}:${range.datePreset}:${range.since ?? ""}:${range.until ?? ""}`;
}

function formatNumber(value: number, digits = 2) {
  return Number(value || 0).toLocaleString("en-US", {
    maximumFractionDigits: digits,
  });
}

function StatusBadge({ status }: { status: string }) {
  const active = status.toUpperCase() === "ACTIVE";
  const paused = status.toUpperCase() === "PAUSED";
  return (
    <span
      className={`inline-flex rounded-full border px-2.5 py-1 text-[11px] font-semibold ${
        active
          ? "border-emerald-500/25 bg-emerald-500/10 text-emerald-600"
          : paused
            ? "border-slate-400/25 bg-slate-400/10 text-slate-500"
            : "border-amber-500/25 bg-amber-500/10 text-amber-600"
      }`}
    >
      {status || "Unknown"}
    </span>
  );
}

function MetricCard({
  label,
  value,
  icon,
}: {
  label: string;
  value: string;
  icon: React.ReactNode;
}) {
  return (
    <article className="rounded-2xl border border-base-border bg-base-surface p-4 shadow-card">
      <div className="mb-3 grid h-9 w-9 place-items-center rounded-xl bg-brand-accent/10 text-brand-accent">
        {icon}
      </div>
      <p className="text-[11px] font-semibold uppercase tracking-wide text-ink-faint">
        {label}
      </p>
      <p className="mt-1 font-mono text-lg font-bold text-ink">{value}</p>
    </article>
  );
}

export default function LegacyAdsManager() {
  const { isDemoMode, session } = useAuth();

  const [status, setStatus] = useState<MetaLegacyStatus | null>(null);
  const [campaigns, setCampaigns] = useState<MetaLegacyCampaign[]>([]);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [adAccountId, setAdAccountId] = useState("");
  const [accessToken, setAccessToken] = useState("");
  const [showToken, setShowToken] = useState(false);
  const [datePreset, setDatePreset] = useState(() => dashboardDateRange().preset);
  const [since, setSince] = useState(() => dashboardDateRange().since);
  const [until, setUntil] = useState(() => dashboardDateRange().until);
  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState("ALL");
  const [sortKey, setSortKey] = useState<SortKey>("spend");
  const [sortDescending, setSortDescending] = useState(true);
  const [page, setPage] = useState(0);
  const [detailCampaign, setDetailCampaign] = useState<MetaLegacyCampaign | null>(null);
  const [campaignDetail, setCampaignDetail] = useState<MetaLegacyCampaignDetail | null>(null);
  const [detailLoading, setDetailLoading] = useState(false);
  const [detailError, setDetailError] = useState<string | null>(null);
  const [creativeIndex, setCreativeIndex] = useState(0);
  const [overview, setOverview] = useState<MetaLegacyMetrics | null>(null);
  const [metricPreferences, setMetricPreferences] = useState<MetricPreferences>(DEFAULT_METRIC_PREFERENCES);
  const [metricDraft, setMetricDraft] = useState<MetricPreferences>(DEFAULT_METRIC_PREFERENCES);
  const [metricsOpen, setMetricsOpen] = useState(false);
  const [savingMetrics, setSavingMetrics] = useState(false);
  const [updatingCampaignId, setUpdatingCampaignId] = useState<string | null>(null);

  const { workspaceId, createGuard } = useWorkspaceScope(
    useCallback(() => {
      // Immediately clear all data from the previous workspace.
      setStatus(null);
      setCampaigns([]);
      setLoading(true);
      setDetailCampaign(null);
      setCampaignDetail(null);
      setDetailError(null);
      setOverview(null);
      setPage(0);
      // Reinitialise date filters from localStorage.
      const range = dashboardDateRange();
      setDatePreset(range.preset);
      setSince(range.since);
      setUntil(range.until);
    }, [])
  );

  const currency = status?.connection?.currency || "USD";
  const money = useCallback(
    (value: number) => `${currency} ${formatNumber(value)}`,
    [currency],
  );

  const currentRange = useCallback(() => ({
    datePreset,
    since: datePreset === "custom" ? since : undefined,
    until: datePreset === "custom" ? until : undefined,
  }), [datePreset, since, until]);

  const formatMetric = useCallback((key: MetricKey, value: number) => {
    const metric = METRICS.find((item) => item.key === key);
    if (metric?.format === "currency") return money(value);
    if (metric?.format === "percent") return `${formatNumber(value)}%`;
    return formatNumber(value, metric?.format === "decimal" ? 2 : 0);
  }, [money]);

  const loadCampaigns = useCallback(async (forWorkspaceId: string) => {
    const { data, error } = await supabase
      .from("meta_legacy_campaigns")
      .select(
        "id,meta_campaign_id,campaign_name,status,budget,spend,reach,impressions,clicks,ctr,cpc,cpm,frequency,results,cost_per_result,meta_metrics,synced_at",
      )
      .eq("workspace_id", forWorkspaceId)
      .order("spend", { ascending: false });
    if (error) throw error;
    return (data ?? []) as MetaLegacyCampaign[];
  }, []);

  const refresh = useCallback(async () => {
    if (isDemoMode) {
      setLoading(false);
      return;
    }
    
    if (!workspaceId) {
      setCampaigns([]);
      setStatus(null);
      setLoading(false);
      return;
    }

    setLoading(true);
    const isStale = createGuard();

    try {
      const nextStatus = await metaLegacyService.status();
      // Stale-closure guard: if workspace changed mid-flight, discard results.
      if (isStale()) return;
      
      setStatus(nextStatus);
      if (nextStatus.connected) {
        // Campaigns are the durable result of the last successful sync. Load
        // them independently so an optional live overview failure never makes
        // a previously synced account look empty after navigation.
        const fetched = await loadCampaigns(workspaceId);
        if (isStale()) return;
        setCampaigns(fetched);
        try {
          const nextOverview = await metaLegacyService.overview(currentRange());
          if (isStale()) return;
          setOverview(nextOverview.metrics);
          localStorage.setItem(
            cachedOverviewKey(workspaceId, currentRange()),
            JSON.stringify(nextOverview.metrics),
          );
        } catch (overviewError) {
          // Older deployed functions may not expose the optional overview
          // action yet. Keep the last exact account snapshot for this range,
          // then fall back to the native campaign snapshots already stored.
          console.warn(
            "Could not refresh Legacy Meta overview; using cached metrics.",
            overviewError instanceof Error ? overviewError.message : overviewError,
          );
          let cached: MetaLegacyMetrics | null = null;
          try {
            const raw = localStorage.getItem(cachedOverviewKey(workspaceId, currentRange()));
            if (raw) cached = JSON.parse(raw) as MetaLegacyMetrics;
          } catch {
            cached = null;
          }
          setOverview(cached ?? null);
        }
      } else {
        setCampaigns([]);
        setOverview(null);
      }
    } catch (error) {
      if (isStale()) return;
      toast.error(
        error instanceof Error
          ? error.message
          : "Legacy Meta status could not be loaded.",
      );
    } finally {
      if (!isStale()) setLoading(false);
    }
  }, [isDemoMode, workspaceId, loadCampaigns, createGuard, currentRange]);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  useEffect(() => {
    const onDashboardDateChanged = () => {
      const range = dashboardDateRange();
      setDatePreset(range.preset);
      setSince(range.since);
      setUntil(range.until);
    };
    window.addEventListener("dashboard-date-changed", onDashboardDateChanged);
    return () => window.removeEventListener("dashboard-date-changed", onDashboardDateChanged);
  }, []);

  useEffect(() => {
    const loadPreferences = async () => {
      if (!workspaceId || !session?.user.id || isDemoMode) {
        setMetricPreferences(DEFAULT_METRIC_PREFERENCES);
        return;
      }
      const { data, error } = await supabase
        .from("meta_legacy_metric_preferences")
        .select("dashboard_metrics,table_metrics")
        .eq("workspace_id", workspaceId)
        .eq("user_id", session.user.id)
        .maybeSingle();
      if (error) {
        // The feature remains usable while a newly deployed migration reaches
        // every environment; defaults are never stored in browser storage.
        console.warn("Could not load Meta metric preferences", error.message);
        return;
      }
      if (!data) return;
      const dashboard = (data.dashboard_metrics ?? []).map(String).filter(isMetricKey).slice(0, 5);
      const table = (data.table_metrics ?? []).map(String).filter(isMetricKey).slice(0, 12);
      setMetricPreferences({
        dashboard_metrics: dashboard.length ? dashboard : DEFAULT_METRIC_PREFERENCES.dashboard_metrics,
        table_metrics: table.length ? table : DEFAULT_METRIC_PREFERENCES.table_metrics,
      });
    };
    void loadPreferences();
  }, [workspaceId, session?.user.id, isDemoMode]);

  useEffect(() => {
    setPage(0);
  }, [search, statusFilter, sortKey, sortDescending]);

  const connect = async (event: FormEvent) => {
    event.preventDefault();
    setBusy(true);
    try {
      const result = await metaLegacyService.connect(adAccountId, accessToken);
      setAccessToken("");
      setShowToken(false);
      setStatus(result);
      toast.success("Legacy Meta ad account connected securely.");
      await syncNow();
    } catch (error) {
      toast.error(
        error instanceof Error ? error.message : "Meta connection failed.",
      );
    } finally {
      setBusy(false);
    }
  };

  const syncNow = async () => {
    if (!workspaceId) return;
    setBusy(true);
    try {
      const result = await metaLegacyService.sync({
        ...currentRange(),
      });
        const [syncedCampaigns, nextStatus] = await Promise.all([
          loadCampaigns(workspaceId),
          metaLegacyService.status(),
        ]);
        setCampaigns(syncedCampaigns);
        setStatus(nextStatus);
        setOverview(result.overview);
        localStorage.setItem(
          cachedOverviewKey(workspaceId, currentRange()),
          JSON.stringify(result.overview),
        );
      toast.success(`Synced ${result.synced} Meta campaigns.`);
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Meta sync failed.");
    } finally {
      setBusy(false);
    }
  };

  const disconnect = async () => {
    if (!window.confirm("Disconnect the manual Meta token for this workspace?")) {
      return;
    }
    setBusy(true);
    try {
      await metaLegacyService.disconnect();
      setStatus({ connected: false, state: "disconnected", connection: null });
      setCampaigns([]);
      toast.success("Legacy Meta connection disconnected.");
    } catch (error) {
      toast.error(
        error instanceof Error ? error.message : "Disconnect failed.",
      );
    } finally {
      setBusy(false);
    }
  };

  const openCampaign = async (campaign: MetaLegacyCampaign) => {
    setDetailCampaign(campaign);
    setCampaignDetail(null);
    setDetailError(null);
    setCreativeIndex(0);
    setDetailLoading(true);
    try {
      setCampaignDetail(
        await metaLegacyService.campaignDetail(campaign.meta_campaign_id),
      );
    } catch (error) {
      setDetailError(
        error instanceof Error
          ? error.message
          : "Creative details could not be loaded.",
      );
    } finally {
      setDetailLoading(false);
    }
  };

  const toggleMetric = (target: "dashboard_metrics" | "table_metrics", key: MetricKey) => {
    setMetricDraft((current) => {
      const values = current[target];
      if (values.includes(key)) {
        if (values.length === 1) return current;
        return { ...current, [target]: values.filter((value) => value !== key) };
      }
      if (target === "dashboard_metrics" && values.length >= 5) {
        toast.error("Choose up to five dashboard metrics.");
        return current;
      }
      if (target === "table_metrics" && values.length >= 12) {
        toast.error("Choose up to twelve table metrics.");
        return current;
      }
      return { ...current, [target]: [...values, key] };
    });
  };

  const saveMetricPreferences = async () => {
    if (!workspaceId || !session?.user.id) return;
    setSavingMetrics(true);
    try {
      const { error } = await supabase
        .from("meta_legacy_metric_preferences")
        .upsert({
          workspace_id: workspaceId,
          user_id: session.user.id,
          dashboard_metrics: metricDraft.dashboard_metrics,
          table_metrics: metricDraft.table_metrics,
          updated_at: new Date().toISOString(),
        }, { onConflict: "user_id,workspace_id" });
      if (error) throw error;
      setMetricPreferences(metricDraft);
      setMetricsOpen(false);
      toast.success("Your Meta metric layout has been saved.");
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Could not save metric preferences.");
    } finally {
      setSavingMetrics(false);
    }
  };

  const updateCampaignStatus = async (campaign: MetaLegacyCampaign) => {
    const enable = campaign.status.toUpperCase() !== "ACTIVE";
    setUpdatingCampaignId(campaign.id);
    try {
      const result = await metaLegacyService.updateCampaignStatus(campaign.meta_campaign_id, enable);
      setCampaigns((current) => current.map((item) =>
        item.id === campaign.id ? { ...item, status: result.status } : item,
      ));
      toast.success(`${campaign.campaign_name} is now ${result.status.toLowerCase()}.`);
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Campaign status could not be changed.");
    } finally {
      setUpdatingCampaignId(null);
    }
  };

  const filtered = useMemo(() => {
    const query = search.trim().toLowerCase();
    return campaigns
      .filter(
        (campaign) =>
          (!query || campaign.campaign_name.toLowerCase().includes(query)) &&
          (statusFilter === "ALL" ||
            campaign.status.toUpperCase() === statusFilter),
      )
      .sort((left, right) => {
        const comparison = sortKey === "campaign_name"
          ? left.campaign_name.localeCompare(right.campaign_name)
          : campaignMetric(left, sortKey) - campaignMetric(right, sortKey);
        return sortDescending ? -comparison : comparison;
      });
  }, [campaigns, search, sortDescending, sortKey, statusFilter]);

  const totalPages = Math.max(1, Math.ceil(filtered.length / PAGE_SIZE));
  const visible = filtered.slice(page * PAGE_SIZE, (page + 1) * PAGE_SIZE);
  const totals = useMemo(() => {
    if (overview) return overview;
    return campaigns.reduce<MetaLegacyMetrics>((sum, campaign) => {
      METRICS.forEach(({ key }) => {
        sum[key] = (sum[key] ?? 0) + campaignMetric(campaign, key);
      });
      return sum;
    }, {});
  }, [campaigns, overview]);
  const statuses = useMemo(
    () => ["ALL", ...new Set(campaigns.map((item) => item.status.toUpperCase()))],
    [campaigns],
  );
  const activeCreative = campaignDetail?.creatives[creativeIndex] ?? null;

  if (isDemoMode) {
    return (
      <div className="space-y-5">
        <PageHeader
          title="Legacy Ads Manager"
          subtitle="Manual Meta credentials are disabled in demo workspaces."
        />
        <EmptyState
          title="Not available in demo mode"
          description="Open a live workspace to connect an ad account."
        />
      </div>
    );
  }

  if (loading) {
    return (
      <div className="grid min-h-[55vh] place-items-center">
        <RefreshCw className="animate-spin text-brand-accent" size={28} />
      </div>
    );
  }

  if (!status?.connected) {
    return (
      <div className="space-y-5">
        <PageHeader
          title="Legacy Ads Manager"
          subtitle="Connect with an Ad Account ID and access token. Your OAuth Ads Manager stays unchanged."
        />
        <section className="mx-auto max-w-2xl overflow-hidden rounded-3xl border border-[#1877F2]/20 bg-base-surface shadow-card">
          <div className="border-b border-base-border bg-[linear-gradient(135deg,rgba(24,119,242,0.12),transparent_65%)] px-6 py-7 sm:px-8">
            <div className="flex items-start gap-4">
              <div className="grid h-14 w-14 shrink-0 place-items-center rounded-2xl border border-[#1877F2]/15 bg-white p-2 shadow-sm">
                <img
                  src={getIntegrationLogo("meta")}
                  alt="Meta"
                  className="h-9 w-9 object-contain"
                />
              </div>
              <div>
                <h2 className="text-xl font-bold text-ink">Manual connection</h2>
                <p className="mt-1 text-sm leading-6 text-ink-muted">
                  The classic setup: enter one Meta Ad Account ID and one access
                  token. This is separate from the current OAuth connection.
                </p>
              </div>
            </div>
          </div>
          <form onSubmit={connect} className="space-y-5 p-6 sm:p-8">
            <label className="block">
              <span className="mb-2 flex items-center gap-2 text-sm font-semibold text-ink">
                <BarChart3 size={16} className="text-[#1877F2]" /> Ad Account ID
              </span>
              <input
                value={adAccountId}
                onChange={(event) => setAdAccountId(event.target.value)}
                placeholder="act_123456789 or 123456789"
                autoComplete="off"
                required
                className="min-h-11 w-full rounded-xl border border-base-border bg-base-raised px-4 text-sm text-ink outline-none focus:border-[#1877F2]"
              />
            </label>
            <label className="block">
              <span className="mb-2 flex items-center gap-2 text-sm font-semibold text-ink">
                <KeyRound size={16} className="text-[#1877F2]" /> Access token
              </span>
              <div className="relative">
                <input
                  value={accessToken}
                  onChange={(event) => setAccessToken(event.target.value)}
                  type={showToken ? "text" : "password"}
                  placeholder="Paste Meta access token"
                  autoComplete="new-password"
                  required
                  className="min-h-11 w-full rounded-xl border border-base-border bg-base-raised px-4 pr-12 text-sm text-ink outline-none focus:border-[#1877F2]"
                />
                <button
                  type="button"
                  onClick={() => setShowToken((current) => !current)}
                  aria-label={showToken ? "Hide access token" : "Show access token"}
                  className="absolute right-2 top-1/2 grid h-9 w-9 -translate-y-1/2 place-items-center rounded-lg text-ink-muted hover:bg-base-surface"
                >
                  {showToken ? <EyeOff size={17} /> : <Eye size={17} />}
                </button>
              </div>
            </label>
            <div className="flex gap-3 rounded-xl border border-emerald-500/15 bg-emerald-500/5 p-3 text-xs leading-5 text-ink-muted">
              <ShieldCheck className="shrink-0 text-emerald-600" size={18} />
              <span>
                The token is sent over HTTPS, encrypted server-side, and never
                saved in local storage or returned to this page.
              </span>
            </div>
            <button
              type="submit"
              disabled={busy || !adAccountId.trim() || !accessToken.trim()}
              className="inline-flex min-h-11 w-full items-center justify-center gap-2 rounded-xl bg-[#1877F2] px-5 text-sm font-bold text-white transition hover:bg-[#166fe5] disabled:cursor-not-allowed disabled:opacity-60"
            >
              {busy ? <RefreshCw className="animate-spin" size={16} /> : <Wifi size={16} />}
              {busy ? "Connecting…" : "Connect manual account"}
            </button>
          </form>
        </section>
      </div>
    );
  }

  return (
    <>
    <div className="space-y-5">
      <PageHeader
        title="Legacy Ads Manager"
        subtitle="Classic campaign reporting using a manual Ad Account ID and access token."
        action={
          <div className="flex flex-wrap gap-2">
            <button
              type="button"
              onClick={() => void syncNow()}
              disabled={busy || (datePreset === "custom" && (!since || !until))}
              className="inline-flex min-h-10 items-center gap-2 rounded-xl bg-[#1877F2] px-4 text-sm font-semibold text-white disabled:opacity-60"
            >
              <RefreshCw size={15} className={busy ? "animate-spin" : ""} />
              {busy ? "Syncing…" : "Sync Meta"}
            </button>
            <button
              type="button"
              onClick={() => void disconnect()}
              disabled={busy}
              className="inline-flex min-h-10 items-center gap-2 rounded-xl border border-danger/20 bg-danger/5 px-4 text-sm font-semibold text-danger disabled:opacity-60"
            >
              <Unplug size={15} /> Disconnect
            </button>
          </div>
        }
      />

      <section className="grid gap-3 rounded-2xl border border-base-border bg-base-surface p-4 lg:grid-cols-[minmax(220px,1fr)_auto_auto_auto]">
        <div className="flex items-center gap-3">
          <div className="grid h-10 w-10 place-items-center rounded-xl bg-[#1877F2]/10">
            <img
              src={getIntegrationLogo("meta")}
              alt="Meta"
              className="h-7 w-7 object-contain"
            />
          </div>
          <div className="min-w-0">
            <div className="flex items-center gap-1.5 text-sm font-bold text-ink">
              <CheckCircle2 size={15} className="text-emerald-500" />
              {status.connection?.account_name || "Meta Ad Account"}
            </div>
            <p className="truncate font-mono text-xs text-ink-muted">
              {status.connection?.ad_account_id} · Token encrypted
            </p>
          </div>
        </div>
        <select
          value={datePreset}
          onChange={(event) => {
            const next = event.target.value;
            setDatePreset(next);
            persistDashboardDateRange(next, next === "custom" ? since : "", next === "custom" ? until : "");
          }}
          className="min-h-10 rounded-xl border border-base-border bg-base-raised px-3 text-sm text-ink"
        >
          <option value="today">Today</option>
          <option value="yesterday">Yesterday</option>
          <option value="last_3d">Last 3 days</option>
          <option value="last_7d">Last 7 days</option>
          <option value="last_14d">Last 14 days</option>
          <option value="last_30d">Last 30 days</option>
          <option value="maximum">Lifetime</option>
          <option value="custom">Custom dates</option>
        </select>
        {datePreset === "custom" ? (
          <>
            <input
              type="date"
              value={since}
              onChange={(event) => {
                const next = event.target.value;
                setSince(next);
                persistDashboardDateRange("custom", next, until);
              }}
              className="min-h-10 rounded-xl border border-base-border bg-base-raised px-3 text-sm text-ink"
            />
            <input
              type="date"
              value={until}
              onChange={(event) => {
                const next = event.target.value;
                setUntil(next);
                persistDashboardDateRange("custom", since, next);
              }}
              className="min-h-10 rounded-xl border border-base-border bg-base-raised px-3 text-sm text-ink"
            />
          </>
        ) : (
          <div className="lg:col-span-2 flex items-center justify-end text-xs text-ink-muted">
            Last synced: {status.connection?.last_successful_sync_at
              ? new Date(status.connection.last_successful_sync_at).toLocaleString()
              : "Not yet"}
          </div>
        )}
      </section>

      {status.connection?.last_sync_error && (
        <div className="flex items-center gap-2 rounded-xl border border-danger/20 bg-danger/5 px-4 py-3 text-sm text-danger">
          <AlertCircle size={16} /> {status.connection.last_sync_error}
        </div>
      )}

      <section className="grid grid-cols-2 gap-3 lg:grid-cols-5">
        {metricPreferences.dashboard_metrics.map((key) => {
          const metric = METRICS.find((item) => item.key === key)!;
          return <MetricCard key={key} label={metric.label} value={formatMetric(key, totals[key] ?? 0)} icon={metricIcon(key)} />;
        })}
      </section>

      <section className="space-y-3">
        <div className="flex flex-wrap items-center gap-2">
          <div className="relative min-w-[220px] flex-1 sm:max-w-sm">
            <Search
              size={15}
              className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-ink-faint"
            />
            <input
              value={search}
              onChange={(event) => setSearch(event.target.value)}
              placeholder="Search campaigns…"
              className="min-h-10 w-full rounded-xl border border-base-border bg-base-surface pl-9 pr-3 text-sm text-ink outline-none focus:border-brand-accent"
            />
          </div>
          <button
            type="button"
            onClick={() => {
              setMetricDraft(metricPreferences);
              setMetricsOpen(true);
            }}
            className="inline-flex min-h-10 items-center gap-2 rounded-xl border border-base-border bg-base-surface px-3 text-sm font-semibold text-ink hover:border-[#1877F2]/35"
          >
            <SlidersHorizontal size={16} /> Metrics
          </button>
          {statuses.map((item) => (
            <button
              type="button"
              key={item}
              onClick={() => setStatusFilter(item)}
              className={`min-h-9 rounded-full border px-3 text-xs font-semibold ${
                statusFilter === item
                  ? "border-brand-accent bg-brand-accent text-white"
                  : "border-base-border bg-base-surface text-ink-muted"
              }`}
            >
              {item === "ALL" ? "All" : item}
            </button>
          ))}
        </div>

        {!campaigns.length ? (
          <div className="rounded-2xl border border-base-border bg-base-surface py-8">
            <EmptyState
              title="No cached campaigns"
              description="Sync Meta once to load campaigns. Your last successful sync stays available when you return."
              primaryAction={
                <button
                  type="button"
                  onClick={() => void syncNow()}
                  className="rounded-xl bg-[#1877F2] px-5 py-2.5 text-sm font-semibold text-white"
                >
                  Sync now
                </button>
              }
            />
          </div>
        ) : (
          <>
            <div className="hidden overflow-auto rounded-2xl border border-base-border bg-base-surface shadow-card md:block">
              <table className="w-full whitespace-nowrap text-sm">
                <thead className="bg-base-raised text-left text-[11px] uppercase tracking-wide text-ink-faint">
                  <tr>
                    {[
                      ["campaign_name", "Campaign"],
                      ...metricPreferences.table_metrics.map((key) => [key, METRICS.find((item) => item.key === key)!.label]),
                    ].map(([key, label]) => (
                      <th
                        key={key}
                        className="cursor-pointer px-4 py-3 font-semibold"
                        onClick={() => {
                          const next = key as SortKey;
                          setSortDescending(
                            sortKey === next ? !sortDescending : true,
                          );
                          setSortKey(next);
                        }}
                      >
                        {label}
                      </th>
                    ))}
                    <th className="px-4 py-3 font-semibold">Status</th>
                    <th className="px-4 py-3 font-semibold">Control</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-base-border">
                  {visible.map((campaign) => (
                    <tr key={campaign.id} className="hover:bg-base-raised/50">
                      <td className="max-w-[280px] truncate px-4 py-3 font-semibold text-ink">
                        <button
                          type="button"
                          onClick={() => void openCampaign(campaign)}
                          className="inline-flex max-w-full items-center gap-2 text-left hover:text-[#1877F2]"
                          title="View creative and product link"
                        >
                          <span className="truncate">{campaign.campaign_name}</span>
                          <ExternalLink size={13} className="shrink-0" />
                        </button>
                      </td>
                      {metricPreferences.table_metrics.map((key) => (
                        <td key={key} className="px-4 py-3 font-mono text-ink-muted">{formatMetric(key, campaignMetric(campaign, key))}</td>
                      ))}
                      <td className="px-4 py-3"><StatusBadge status={campaign.status} /></td>
                      <td className="px-4 py-3">
                        <button
                          type="button"
                          disabled={updatingCampaignId === campaign.id}
                          onClick={() => void updateCampaignStatus(campaign)}
                          className={`inline-flex min-h-8 items-center gap-1.5 rounded-lg border px-2.5 text-xs font-semibold disabled:opacity-50 ${campaign.status.toUpperCase() === "ACTIVE" ? "border-amber-500/25 bg-amber-500/5 text-amber-700" : "border-emerald-500/25 bg-emerald-500/5 text-emerald-700"}`}
                        >
                          {updatingCampaignId === campaign.id ? <RefreshCw size={13} className="animate-spin" /> : campaign.status.toUpperCase() === "ACTIVE" ? <Pause size={13} /> : <Play size={13} />}
                          {campaign.status.toUpperCase() === "ACTIVE" ? "Pause" : "Activate"}
                        </button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            <div className="grid gap-3 md:hidden">
              {visible.map((campaign) => (
                <article key={campaign.id} className="rounded-2xl border border-base-border bg-base-surface p-4 shadow-card">
                  <div className="flex items-start justify-between gap-3">
                    <div>
                      <button
                        type="button"
                        onClick={() => void openCampaign(campaign)}
                        className="inline-flex items-center gap-2 text-left font-semibold text-ink hover:text-[#1877F2]"
                      >
                        {campaign.campaign_name}
                        <ExternalLink size={14} className="shrink-0" />
                      </button>
                      <div className="mt-2"><StatusBadge status={campaign.status} /></div>
                    </div>
                    <div className="text-right">
                      <p className="text-[10px] uppercase text-ink-faint">Spend</p>
                      <p className="font-mono font-bold text-ink">{formatMetric("spend", campaignMetric(campaign, "spend"))}</p>
                    </div>
                  </div>
                  <div className="mt-4 grid grid-cols-3 gap-3 border-t border-base-border pt-3 text-xs">
                    <div><p className="text-ink-faint">Purchases</p><p className="mt-1 font-mono font-bold text-ink">{formatNumber(campaignMetric(campaign, "purchases"), 0)}</p></div>
                    <div><p className="text-ink-faint">Clicks</p><p className="mt-1 font-mono font-bold text-ink">{formatNumber(campaignMetric(campaign, "clicks"), 0)}</p></div>
                    <div><p className="text-ink-faint">CTR</p><p className="mt-1 font-mono font-bold text-ink">{formatNumber(campaignMetric(campaign, "ctr"))}%</p></div>
                  </div>
                </article>
              ))}
            </div>
          </>
        )}

        {totalPages > 1 && (
          <div className="flex items-center justify-center gap-3">
            <button
              type="button"
              disabled={page === 0}
              onClick={() => setPage((current) => Math.max(0, current - 1))}
              className="rounded-lg border border-base-border px-3 py-2 text-xs font-semibold text-ink disabled:opacity-40"
            >
              Previous
            </button>
            <span className="text-xs text-ink-muted">Page {page + 1} of {totalPages}</span>
            <button
              type="button"
              disabled={page >= totalPages - 1}
              onClick={() => setPage((current) => Math.min(totalPages - 1, current + 1))}
              className="rounded-lg border border-base-border px-3 py-2 text-xs font-semibold text-ink disabled:opacity-40"
            >
              Next
            </button>
          </div>
        )}
      </section>
    </div>

    {detailCampaign && (
      <Modal
        title={detailCampaign.campaign_name}
        onClose={() => {
          setDetailCampaign(null);
          setCampaignDetail(null);
          setDetailError(null);
        }}
      >
        {detailLoading ? (
          <div className="grid min-h-56 place-items-center">
            <div className="flex items-center gap-2 text-sm text-ink-muted">
              <RefreshCw size={18} className="animate-spin text-[#1877F2]" />
              Loading creative from Meta…
            </div>
          </div>
        ) : detailError ? (
          <div className="flex items-center gap-2 rounded-xl border border-danger/20 bg-danger/5 p-4 text-sm text-danger">
            <AlertCircle size={17} className="shrink-0" /> {detailError}
          </div>
        ) : campaignDetail ? (
          <div className="space-y-4">
            {campaignDetail.destination_urls.length > 0 && (
              <section className="rounded-2xl border border-base-border bg-base-raised p-4">
                <p className="mb-2 text-xs font-semibold uppercase tracking-wide text-ink-faint">
                  Product page
                </p>
                <div className="flex flex-wrap gap-2">
                  {campaignDetail.destination_urls.map((url) => (
                    <a
                      key={url}
                      href={url}
                      target="_blank"
                      rel="noreferrer noopener"
                      className="inline-flex min-h-10 items-center gap-2 rounded-xl bg-[#1877F2] px-4 text-sm font-semibold text-white"
                    >
                      Open product page <ExternalLink size={15} />
                    </a>
                  ))}
                </div>
              </section>
            )}

            {campaignDetail.creatives.length === 0 ? (
              <EmptyState
                title="No ads in this campaign"
                description="Meta did not return an ad creative for this campaign."
              />
            ) : activeCreative ? (() => {
              const poster = activeCreative.thumbnail_url || activeCreative.image_url || undefined;
              const hasPrevious = creativeIndex > 0;
              const hasNext = creativeIndex < campaignDetail.creatives.length - 1;
              return (
                <article className="overflow-hidden rounded-2xl border border-base-border bg-base-surface">
                  <div className="relative mx-auto aspect-[9/16] w-full max-w-sm overflow-hidden rounded-[1.35rem] bg-base-raised shadow-sm">
                    {poster && (
                      <div
                        aria-hidden="true"
                        className="absolute inset-0 scale-110 bg-cover bg-center opacity-45 blur-2xl"
                        style={{ backgroundImage: `url("${poster}")` }}
                      />
                    )}
                    {activeCreative.video_url ? (
                      <video
                        key={activeCreative.ad_id}
                        src={activeCreative.video_url}
                        poster={poster}
                        controls
                        playsInline
                        preload="metadata"
                        className="relative h-full w-full object-contain"
                      />
                    ) : poster ? (
                      <img src={poster} alt={activeCreative.ad_name} className="relative h-full w-full object-contain" />
                    ) : (
                      <div className="relative grid h-full place-items-center text-ink-muted"><ImageIcon size={30} /></div>
                    )}
                    {campaignDetail.creatives.length > 1 && (
                      <>
                        <button type="button" aria-label="Previous creative" disabled={!hasPrevious} onClick={() => setCreativeIndex((index) => index - 1)} className="absolute left-3 top-1/2 grid h-10 w-10 -translate-y-1/2 place-items-center rounded-full bg-black/65 text-white backdrop-blur disabled:opacity-30"><ChevronLeft size={21} /></button>
                        <button type="button" aria-label="Next creative" disabled={!hasNext} onClick={() => setCreativeIndex((index) => index + 1)} className="absolute right-3 top-1/2 grid h-10 w-10 -translate-y-1/2 place-items-center rounded-full bg-black/65 text-white backdrop-blur disabled:opacity-30"><ChevronRight size={21} /></button>
                        <span className="absolute bottom-3 left-1/2 -translate-x-1/2 rounded-full bg-black/65 px-3 py-1 text-xs font-semibold text-white">{creativeIndex + 1} / {campaignDetail.creatives.length}</span>
                      </>
                    )}
                  </div>
                  <div className="space-y-3 p-4">
                    <div>
                      <p className="font-semibold text-ink">{activeCreative.ad_name}</p>
                      {activeCreative.title && <p className="mt-1 text-sm text-ink-muted">{activeCreative.title}</p>}
                    </div>
                    {activeCreative.body && <p className="text-xs leading-5 text-ink-muted">{activeCreative.body}</p>}
                    <div className="flex flex-wrap gap-2">
                      {activeCreative.video_permalink_url && <a href={activeCreative.video_permalink_url} target="_blank" rel="noreferrer noopener" className="inline-flex items-center gap-1.5 rounded-lg border border-base-border px-3 py-2 text-xs font-semibold text-ink"><Film size={14} /> Open on Meta</a>}
                      {activeCreative.destination_urls.map((url) => <a key={url} href={url} target="_blank" rel="noreferrer noopener" className="inline-flex items-center gap-1.5 rounded-lg border border-[#1877F2]/25 bg-[#1877F2]/5 px-3 py-2 text-xs font-semibold text-[#1877F2]">Product page <ExternalLink size={14} /></a>)}
                    </div>
                  </div>
                </article>
              );
            })() : null}
          </div>
        ) : null}
      </Modal>
    )}

    {metricsOpen && (
      <Modal title="Choose your Meta metrics" onClose={() => setMetricsOpen(false)}>
        <div className="space-y-6">
          <p className="text-sm leading-6 text-ink-muted">
            These choices are saved for your user account in this workspace. Dashboard cards use Meta account-level insights; table values use each campaign's Meta insight snapshot.
          </p>
          {([
            ["dashboard_metrics", "Dashboard cards", "Choose up to five metrics."],
            ["table_metrics", "Campaign table", "Choose up to twelve metrics."],
          ] as const).map(([target, title, hint]) => (
            <section key={target}>
              <div className="mb-3 flex items-baseline justify-between gap-3">
                <h3 className="font-semibold text-ink">{title}</h3>
                <span className="text-xs text-ink-faint">{hint}</span>
              </div>
              <div className="grid gap-2 sm:grid-cols-2">
                {METRICS.map((metric) => {
                  const selected = metricDraft[target].includes(metric.key);
                  return (
                    <button
                      type="button"
                      key={metric.key}
                      onClick={() => toggleMetric(target, metric.key)}
                      className={`flex min-h-10 items-center justify-between rounded-xl border px-3 text-left text-sm font-medium ${selected ? "border-[#1877F2]/45 bg-[#1877F2]/10 text-[#1877F2]" : "border-base-border bg-base-surface text-ink-muted"}`}
                    >
                      {metric.label}
                      <span className={`grid h-5 w-5 place-items-center rounded-full border text-xs ${selected ? "border-[#1877F2] bg-[#1877F2] text-white" : "border-base-border"}`}>{selected ? "✓" : ""}</span>
                    </button>
                  );
                })}
              </div>
            </section>
          ))}
          <div className="flex justify-end gap-3 border-t border-base-border pt-4">
            <button type="button" onClick={() => setMetricsOpen(false)} className="rounded-xl border border-base-border px-4 py-2 text-sm font-semibold text-ink">Cancel</button>
            <button type="button" disabled={savingMetrics} onClick={() => void saveMetricPreferences()} className="inline-flex min-h-10 items-center gap-2 rounded-xl bg-[#1877F2] px-4 text-sm font-semibold text-white disabled:opacity-60">{savingMetrics && <RefreshCw size={15} className="animate-spin" />} Save layout</button>
          </div>
        </div>
      </Modal>
    )}
    </>
  );
}
