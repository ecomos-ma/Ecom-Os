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
  DollarSign,
  Eye,
  EyeOff,
  ExternalLink,
  Film,
  ImageIcon,
  KeyRound,
  MousePointerClick,
  RefreshCw,
  Search,
  ShieldCheck,
  Target,
  Unplug,
  Wifi,
} from "lucide-react";
import { EmptyState } from "../components/EmptyState";
import { Modal } from "../components/Modal";
import { PageHeader } from "../components/PageHeader";
import { toast } from "../components/Toast";
import { useAuth } from "../hooks/useAuth";
import { getIntegrationLogo } from "../lib/integrationLogos";
import { supabase } from "../lib/supabase";
import {
  metaLegacyService,
  type MetaLegacyCampaign,
  type MetaLegacyCampaignDetail,
  type MetaLegacyStatus,
} from "../services/metaLegacyService";

type SortKey = keyof Pick<
  MetaLegacyCampaign,
  | "campaign_name"
  | "budget"
  | "spend"
  | "reach"
  | "impressions"
  | "clicks"
  | "ctr"
  | "cpc"
  | "cpm"
  | "frequency"
  | "results"
  | "cost_per_result"
>;

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
  const { workspace, isDemoMode } = useAuth();
  const [initialRange] = useState(dashboardDateRange);
  const [status, setStatus] = useState<MetaLegacyStatus | null>(null);
  const [campaigns, setCampaigns] = useState<MetaLegacyCampaign[]>([]);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [adAccountId, setAdAccountId] = useState("");
  const [accessToken, setAccessToken] = useState("");
  const [showToken, setShowToken] = useState(false);
  const [datePreset, setDatePreset] = useState(initialRange.preset);
  const [since, setSince] = useState(initialRange.since);
  const [until, setUntil] = useState(initialRange.until);
  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState("ALL");
  const [sortKey, setSortKey] = useState<SortKey>("spend");
  const [sortDescending, setSortDescending] = useState(true);
  const [page, setPage] = useState(0);
  const [detailCampaign, setDetailCampaign] = useState<MetaLegacyCampaign | null>(null);
  const [campaignDetail, setCampaignDetail] = useState<MetaLegacyCampaignDetail | null>(null);
  const [detailLoading, setDetailLoading] = useState(false);
  const [detailError, setDetailError] = useState<string | null>(null);

  const currency = status?.connection?.currency || "USD";
  const money = useCallback(
    (value: number) => `${currency} ${formatNumber(value)}`,
    [currency],
  );

  const loadCampaigns = useCallback(async () => {
    if (!workspace?.id) {
      setCampaigns([]);
      return;
    }
    const { data, error } = await supabase
      .from("meta_legacy_campaigns")
      .select(
        "id,meta_campaign_id,campaign_name,status,budget,spend,reach,impressions,clicks,ctr,cpc,cpm,frequency,results,cost_per_result,synced_at",
      )
      .eq("workspace_id", workspace.id)
      .order("spend", { ascending: false });
    if (error) throw error;
    setCampaigns((data ?? []) as MetaLegacyCampaign[]);
  }, [workspace?.id]);

  const refresh = useCallback(async () => {
    if (isDemoMode) {
      setLoading(false);
      return;
    }
    setLoading(true);
    try {
      const nextStatus = await metaLegacyService.status();
      setStatus(nextStatus);
      if (nextStatus.connected) await loadCampaigns();
      else setCampaigns([]);
    } catch (error) {
      toast.error(
        error instanceof Error
          ? error.message
          : "Legacy Meta status could not be loaded.",
      );
    } finally {
      setLoading(false);
    }
  }, [isDemoMode, loadCampaigns]);

  useEffect(() => {
    void refresh();
  }, [refresh]);

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
    setBusy(true);
    try {
      const result = await metaLegacyService.sync({
        datePreset,
        since: datePreset === "custom" ? since : undefined,
        until: datePreset === "custom" ? until : undefined,
      });
      await Promise.all([loadCampaigns(), metaLegacyService.status().then(setStatus)]);
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
        const a = left[sortKey];
        const b = right[sortKey];
        const comparison =
          typeof a === "string"
            ? a.localeCompare(String(b))
            : Number(a ?? 0) - Number(b ?? 0);
        return sortDescending ? -comparison : comparison;
      });
  }, [campaigns, search, sortDescending, sortKey, statusFilter]);

  const totalPages = Math.max(1, Math.ceil(filtered.length / PAGE_SIZE));
  const visible = filtered.slice(page * PAGE_SIZE, (page + 1) * PAGE_SIZE);
  const totals = useMemo(
    () =>
      campaigns.reduce(
        (sum, campaign) => ({
          spend: sum.spend + Number(campaign.spend || 0),
          reach: sum.reach + Number(campaign.reach || 0),
          clicks: sum.clicks + Number(campaign.clicks || 0),
          results: sum.results + Number(campaign.results || 0),
        }),
        { spend: 0, reach: 0, clicks: 0, results: 0 },
      ),
    [campaigns],
  );
  const statuses = useMemo(
    () => ["ALL", ...new Set(campaigns.map((item) => item.status.toUpperCase()))],
    [campaigns],
  );

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
          onChange={(event) => setDatePreset(event.target.value)}
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
              onChange={(event) => setSince(event.target.value)}
              className="min-h-10 rounded-xl border border-base-border bg-base-raised px-3 text-sm text-ink"
            />
            <input
              type="date"
              value={until}
              onChange={(event) => setUntil(event.target.value)}
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
        <MetricCard label="Spend" value={money(totals.spend)} icon={<DollarSign size={17} />} />
        <MetricCard label="Reach" value={formatNumber(totals.reach, 0)} icon={<Eye size={17} />} />
        <MetricCard label="Clicks" value={formatNumber(totals.clicks, 0)} icon={<MousePointerClick size={17} />} />
        <MetricCard label="Results" value={formatNumber(totals.results, 0)} icon={<Target size={17} />} />
        <MetricCard label="Campaigns" value={String(campaigns.length)} icon={<Activity size={17} />} />
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
              title="No campaigns synced yet"
              description="Choose a date range and click Sync Meta."
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
                      ["status", "Status"],
                      ["budget", "Budget/day"],
                      ["spend", "Spend"],
                      ["results", "Results"],
                      ["cost_per_result", "Cost/result"],
                      ["reach", "Reach"],
                      ["impressions", "Impressions"],
                      ["clicks", "Clicks"],
                      ["ctr", "CTR"],
                      ["cpc", "CPC"],
                      ["cpm", "CPM"],
                    ].map(([key, label]) => (
                      <th
                        key={key}
                        className="cursor-pointer px-4 py-3 font-semibold"
                        onClick={() => {
                          if (key === "status") return;
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
                      <td className="px-4 py-3"><StatusBadge status={campaign.status} /></td>
                      <td className="px-4 py-3 font-mono text-ink-muted">{campaign.budget == null ? "—" : money(campaign.budget)}</td>
                      <td className="px-4 py-3 font-mono font-bold text-ink">{money(campaign.spend)}</td>
                      <td className="px-4 py-3 font-mono text-ink">{formatNumber(campaign.results, 0)}</td>
                      <td className="px-4 py-3 font-mono text-ink-muted">{campaign.cost_per_result ? money(campaign.cost_per_result) : "—"}</td>
                      <td className="px-4 py-3 font-mono text-ink-muted">{formatNumber(campaign.reach, 0)}</td>
                      <td className="px-4 py-3 font-mono text-ink-muted">{formatNumber(campaign.impressions, 0)}</td>
                      <td className="px-4 py-3 font-mono text-ink-muted">{formatNumber(campaign.clicks, 0)}</td>
                      <td className="px-4 py-3 font-mono text-ink-muted">{formatNumber(campaign.ctr)}%</td>
                      <td className="px-4 py-3 font-mono text-ink-muted">{money(campaign.cpc)}</td>
                      <td className="px-4 py-3 font-mono text-ink-muted">{money(campaign.cpm)}</td>
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
                      <p className="font-mono font-bold text-ink">{money(campaign.spend)}</p>
                    </div>
                  </div>
                  <div className="mt-4 grid grid-cols-3 gap-3 border-t border-base-border pt-3 text-xs">
                    <div><p className="text-ink-faint">Results</p><p className="mt-1 font-mono font-bold text-ink">{formatNumber(campaign.results, 0)}</p></div>
                    <div><p className="text-ink-faint">Clicks</p><p className="mt-1 font-mono font-bold text-ink">{formatNumber(campaign.clicks, 0)}</p></div>
                    <div><p className="text-ink-faint">CTR</p><p className="mt-1 font-mono font-bold text-ink">{formatNumber(campaign.ctr)}%</p></div>
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
            ) : (
              <div className="grid gap-4 sm:grid-cols-2">
                {campaignDetail.creatives.map((creative, index) => {
                  const poster = creative.thumbnail_url || creative.image_url || undefined;
                  return (
                    <article
                      key={`${creative.ad_id}-${creative.creative_id}-${index}`}
                      className="overflow-hidden rounded-2xl border border-base-border bg-base-surface"
                    >
                      <div className="aspect-video bg-black/90">
                        {creative.video_url ? (
                          <video
                            src={creative.video_url}
                            poster={poster}
                            controls
                            playsInline
                            preload="metadata"
                            className="h-full w-full object-contain"
                          />
                        ) : poster ? (
                          <img
                            src={poster}
                            alt={creative.ad_name}
                            className="h-full w-full object-contain"
                          />
                        ) : (
                          <div className="grid h-full place-items-center text-white/60">
                            <ImageIcon size={30} />
                          </div>
                        )}
                      </div>
                      <div className="space-y-3 p-4">
                        <div>
                          <p className="font-semibold text-ink">{creative.ad_name}</p>
                          {creative.title && (
                            <p className="mt-1 text-sm text-ink-muted">{creative.title}</p>
                          )}
                        </div>
                        {creative.body && (
                          <p className="line-clamp-3 text-xs leading-5 text-ink-muted">
                            {creative.body}
                          </p>
                        )}
                        <div className="flex flex-wrap gap-2">
                          {creative.video_permalink_url && (
                            <a
                              href={creative.video_permalink_url}
                              target="_blank"
                              rel="noreferrer noopener"
                              className="inline-flex items-center gap-1.5 rounded-lg border border-base-border px-3 py-2 text-xs font-semibold text-ink"
                            >
                              <Film size={14} /> Open on Meta
                            </a>
                          )}
                          {creative.destination_urls.map((url) => (
                            <a
                              key={url}
                              href={url}
                              target="_blank"
                              rel="noreferrer noopener"
                              className="inline-flex items-center gap-1.5 rounded-lg border border-[#1877F2]/25 bg-[#1877F2]/5 px-3 py-2 text-xs font-semibold text-[#1877F2]"
                            >
                              Product page <ExternalLink size={14} />
                            </a>
                          ))}
                        </div>
                      </div>
                    </article>
                  );
                })}
              </div>
            )}
          </div>
        ) : null}
      </Modal>
    )}
    </>
  );
}
