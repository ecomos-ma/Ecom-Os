import { useEffect, useState, useCallback, useMemo } from "react";
import {
  RefreshCw, Search, ChevronUp, ChevronDown,
  AlertCircle, TrendingUp, MousePointerClick,
  Eye, DollarSign, Target, Activity, Wifi, WifiOff,
  Plus, Filter, BarChart2, Hash
} from "lucide-react";
import { PageHeader } from "../components/PageHeader";
import { EmptyState } from "../components/EmptyState";
import { supabase } from "../lib/supabase";
import { toast } from "../components/Toast";
import { useAuth } from "../hooks/useAuth";
import { convertAdSpend } from "../lib/metrics";

// ─── Types ────────────────────────────────────────────────────────────────────

interface MetaCampaign {
  id: string;
  meta_campaign_id: string;
  campaign_name: string;
  status: string;
  budget: number | null;
  spend: number;
  reach: number;
  impressions: number;
  clicks: number;
  ctr: number;
  cpc: number;
  cpm: number;
  frequency: number;
  results: number;
  cost_per_result: number;
  updated_at: string;
}

type SortKey = keyof MetaCampaign;
type SortDir = "asc" | "desc";

// ─── Helpers ──────────────────────────────────────────────────────────────────

function fmt(n: number, dec = 2) {
  return Number(n).toLocaleString("en-US", { maximumFractionDigits: dec });
}
function fmtCur(n: number) {
  const cur = (typeof window !== 'undefined' && (window as any).__meta_account_currency) ? (window as any).__meta_account_currency : 'USD';
  return `${cur} ${fmt(n)}`;
}
function fmtPct(n: number) {
  return `${fmt(n, 2)}%`;
}

// ─── Stat Card ────────────────────────────────────────────────────────────────

function StatCard({
  label, value, icon, color = "text-brand-accent",
}: {
  label: string; value: string; icon: React.ReactNode; color?: string;
}) {
  return (
    <div className="flex items-center gap-3 rounded-xl max-md:rounded-2xl border max-md:border-none border-base-border bg-base-surface max-md:bg-base-surface/60 max-md:backdrop-blur-xl px-4 py-3.5 max-md:py-4 max-md:px-4 shadow-card max-md:shadow-md">
      <div className={`flex h-9 w-9 max-md:h-10 max-md:w-10 shrink-0 items-center justify-center rounded-lg max-md:rounded-xl bg-base-raised ${color}`}>
        {icon}
      </div>
      <div>
        <div className="text-[11px] max-md:text-[12px] text-ink-muted leading-none mb-1">{label}</div>
        <div className="font-mono text-[15px] max-md:text-[17px] font-semibold text-ink leading-none">{value}</div>
      </div>
    </div>
  );
}

// ─── Delivery Badge ───────────────────────────────────────────────────────────

function DeliveryBadge({ status }: { status: string }) {
  const map: Record<string, string> = {
    ACTIVE: "bg-brand-accent/10 text-brand-accent border-brand-accent/30",
    PAUSED: "bg-zinc-500/10 text-zinc-400 border-zinc-500/20",
    DELETED: "bg-danger/10 text-danger border-danger/20",
    ARCHIVED: "bg-amber-500/10 text-amber-400 border-amber-500/20",
  };
  const cls = map[status.toUpperCase()] ?? "bg-zinc-500/10 text-zinc-400 border-zinc-500/20";
  return (
    <span className={`inline-flex items-center rounded-full border px-2 py-0.5 text-[11px] font-medium ${cls}`}>
      {status.charAt(0) + status.slice(1).toLowerCase()}
    </span>
  );
}

// ─── Skeleton Row ────────────────────────────────────────────────────────────

function SkeletonRow() {
  return (
    <tr className="border-b border-base-border animate-pulse">
      {Array.from({ length: 12 }).map((_, i) => (
        <td key={i} className="px-4 py-3">
          <div className="h-3 w-full rounded bg-base-raised" />
        </td>
      ))}
    </tr>
  );
}

// ─── Sortable Header ─────────────────────────────────────────────────────────

function SortTh({
  label, field, sortKey, sortDir, onSort, right = false,
}: {
  label: string; field: SortKey; sortKey: SortKey; sortDir: SortDir;
  onSort: (f: SortKey) => void; right?: boolean;
}) {
  const active = field === sortKey;
  return (
    <th
      className={`cursor-pointer select-none px-4 py-3 text-[12px] font-medium text-ink-muted hover:text-ink ${right ? "text-right" : ""}`}
      onClick={() => onSort(field)}
    >
      <span className="inline-flex items-center gap-1">
        {right && active && (sortDir === "asc" ? <ChevronUp size={11} /> : <ChevronDown size={11} />)}
        {label}
        {!right && active && (sortDir === "asc" ? <ChevronUp size={11} /> : <ChevronDown size={11} />)}
      </span>
    </th>
  );
}

// ─── Main Component ───────────────────────────────────────────────────────────

const PAGE_SIZE = 20;

export default function AdsManager() {
  const { workspace } = useAuth();
  const isMetaConnected = Boolean(workspace?.meta_system_user_token || workspace?.meta_access_token);
  const [campaigns, setCampaigns] = useState<MetaCampaign[]>([]);
  const [loading, setLoading] = useState(true);
  const [syncing, setSyncing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [lastSync, setLastSync] = useState<string | null>(null);

  // Initialize sync date from what Dashboard last used
  const [syncDatePreset, setSyncDatePreset] = useState(() => {
    const saved = localStorage.getItem("dashboard_range_type");
    if (saved && ["today", "7d", "14d", "30d"].includes(saved)) {
      // Map dashboard range types to Meta API presets
      const map: Record<string, string> = { today: "today", "7d": "last_7d", "14d": "last_14d", "30d": "last_30d" };
      return map[saved] ?? "custom";
    }
    return "custom";
  });
  const [customStart, setCustomStart] = useState(() => localStorage.getItem("dashboard_date_from") || "");
  const [customEnd, setCustomEnd] = useState(() => localStorage.getItem("dashboard_date_to") || "");

  // Listen for Dashboard date changes and sync preset/dates.
  // NOTE: The actual Meta sync is now triggered by Layout.tsx to avoid duplicates.
  // AdsManager reloads automatically via its meta_campaigns realtime subscription.
  useEffect(() => {
    const handler = (e: Event) => {
      const { from, to, rangeType } = (e as CustomEvent).detail;
      const map: Record<string, string> = { today: "today", "7d": "last_7d", "14d": "last_14d", "30d": "last_30d" };
      const preset = map[rangeType] ?? "custom";
      setSyncDatePreset(preset);
      if (preset === "custom") {
        setCustomStart(from);
        setCustomEnd(to);
      }
      // Do NOT call handleSync here — Layout.tsx handles the background sync
      // to prevent duplicate API calls when both components are mounted.
    };
    window.addEventListener("dashboard-date-changed", handler);
    return () => window.removeEventListener("dashboard-date-changed", handler);
  }, []);

  // Filters & UI state
  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState("ALL");
  const [sortKey, setSortKey] = useState<SortKey>("spend");
  const [sortDir, setSortDir] = useState<SortDir>("desc");
  const [page, setPage] = useState(0);

  // ── Fetch from Supabase ──────────────────────────────────────────────────
  const loadCampaigns = useCallback(async () => {
    if (!workspace?.id) return;
    setLoading(true);
    setError(null);
    const { data, error: err } = await supabase
      .from("meta_campaigns")
      .select("*")
      .eq("workspace_id", workspace.id)
      .order("spend", { ascending: false });

    if (err) {
      setError(err.message);
    } else {
      const convertedData = (data ?? []).map(c => ({
        ...c,
        spend: convertAdSpend(Number(c.spend || 0)),
        cost_per_result: Number(c.results) > 0 ? convertAdSpend(Number(c.spend || 0)) / Number(c.results) : 0,
        cpm: convertAdSpend(Number(c.cpm || 0)),
        cpc: convertAdSpend(Number(c.cpc || 0))
      })) as MetaCampaign[];
      setCampaigns(convertedData);
      if (data && data.length > 0) {
        setLastSync(data[0].updated_at);
      }
    }
    setLoading(false);
  }, [workspace?.id]);

  useEffect(() => {
    loadCampaigns();

    if (!workspace?.id) return;

    const channelName = `meta-campaigns-changes-${workspace.id}-${Math.random().toString(36).slice(2)}`;
    const channel = supabase.channel(channelName);

    try {
      channel
        .on("postgres_changes", {
          event: "*",
          schema: "public",
          table: "meta_campaigns",
          filter: `workspace_id=eq.${workspace.id}`,
        }, () => {
          loadCampaigns();
        })
        .subscribe();
    } catch (error) {
      console.error("[AdsManager] Realtime subscription failed:", error);
      return;
    }

    // Also reload when Layout's background sync completes; update currency if provided
    const handleMetaSyncComplete = (ev?: Event) => {
      const detail = (ev as CustomEvent)?.detail;
      if (detail && detail.currency) {
        try {
          (window as any).__meta_account_currency = detail.currency;
        } catch (e) { }
      }
      loadCampaigns();
    };
    window.addEventListener("meta-sync-complete", handleMetaSyncComplete as EventListener);

    return () => {
      void channel.unsubscribe();
      supabase.removeChannel(channel);
      window.removeEventListener("meta-sync-complete", handleMetaSyncComplete as EventListener);
    };
  }, [loadCampaigns, workspace?.id]);

  // ── Run the Edge Function ────────────────────────────────────────────────
  const handleSync = async (override?: { datePreset?: string; customStart?: string; customEnd?: string }) => {
    setSyncing(true);
    try {
      const datePreset = override?.datePreset ?? syncDatePreset;
      const customSince = override?.customStart ?? customStart;
      const customUntil = override?.customEnd ?? customEnd;
      const payload: any = { date_preset: datePreset };

      if (datePreset === "custom") {
        if (!customSince || !customUntil) {
          throw new Error("Please select both start and end dates for custom range.");
        }
        payload.time_range = { since: customSince, until: customUntil };
      }

      const { data, error: fnErr } = await supabase.functions.invoke("meta-sync", {
        body: payload,
      });

      if (fnErr) {
        console.error("[AdsManager] Meta sync function error:", fnErr);
        throw new Error(fnErr.message);
      }

      // Handle structured error responses from the improved Edge Function
      if (data && typeof data === "object") {
        if (!data.success && data.stage) {
          // Structured error response
          let errorMessage = "Meta sync failed";

          switch (data.stage) {
            case "authentication":
              errorMessage = `Authentication failed: ${data.reason}`;
              break;
            case "authorization":
              errorMessage = `Authorization failed: ${data.reason}`;
              break;
            case "environment":
              errorMessage = `Server configuration error: ${data.reason}`;
              break;
            case "database":
              errorMessage = `Database error: ${data.reason}`;
              break;
            case "configuration":
              errorMessage = `Meta configuration: ${data.reason}`;
              break;
            case "meta_api":
              errorMessage = `Meta API error: ${data.reason}`;
              break;
            default:
              errorMessage = data.details || data.reason || "Unknown error";
          }

          console.error("[AdsManager] Meta sync structured error:", data);
          toast.error(errorMessage, 6000);
          return;
        }

        if (data.token_expired) {
          toast.error("Meta token expired. Please regenerate in Meta Business Suite.", 8000);
          return;
        }

        if (data.error) {
          toast.error(`Meta sync failed: ${data.error}`, 6000);
          return;
        }

        // Success case
        toast.success(`✅ Synced ${data?.synced ?? 0} campaigns from Meta Ads.`, 4000);
        await loadCampaigns();
      }
    } catch (e: any) {
      console.error("[AdsManager] Meta sync exception:", e);
      toast.error(`Sync error: ${e.message}`);
    } finally {
      setSyncing(false);
    }
  };
  // ── Sorting ──────────────────────────────────────────────────────────────
  const handleSort = (field: SortKey) => {
    if (field === sortKey) setSortDir((d) => (d === "asc" ? "desc" : "asc"));
    else { setSortKey(field); setSortDir("desc"); }
    setPage(0);
  };

  // ── Derived data ─────────────────────────────────────────────────────────
  const filtered = useMemo(() => {
    return campaigns
      .filter((c) => {
        const matchSearch = c.campaign_name.toLowerCase().includes(search.toLowerCase());
        const matchStatus = statusFilter === "ALL" || c.status.toUpperCase() === statusFilter;
        return matchSearch && matchStatus;
      })
      .sort((a, b) => {
        const va = a[sortKey] as any;
        const vb = b[sortKey] as any;
        const cmp = typeof va === "string" ? va.localeCompare(vb) : Number(va) - Number(vb);
        return sortDir === "asc" ? cmp : -cmp;
      });
  }, [campaigns, search, statusFilter, sortKey, sortDir]);

  const totalPages = Math.ceil(filtered.length / PAGE_SIZE);
  const paged = filtered.slice(page * PAGE_SIZE, (page + 1) * PAGE_SIZE);

  // ── Aggregate stats ───────────────────────────────────────────────────────
  const totSpend = campaigns.reduce((s, c) => s + c.spend, 0);
  const totReach = campaigns.reduce((s, c) => s + c.reach, 0);
  const totImpressions = campaigns.reduce((s, c) => s + c.impressions, 0);
  const totClicks = campaigns.reduce((s, c) => s + c.clicks, 0);
  const totResults = campaigns.reduce((s, c) => s + c.results, 0);
  const avgCTR = campaigns.length > 0 ? campaigns.reduce((s, c) => s + c.ctr, 0) / campaigns.length : 0;
  const avgCPC = campaigns.length > 0 ? campaigns.reduce((s, c) => s + c.cpc, 0) / campaigns.length : 0;
  const avgCPM = campaigns.length > 0 ? campaigns.reduce((s, c) => s + c.cpm, 0) / campaigns.length : 0;
  const avgCPR = totResults > 0 ? totSpend / totResults : 0;
  const activeCampaigns = campaigns.filter((c) => c.status.toUpperCase() === "ACTIVE").length;
  const pausedCampaigns = campaigns.filter((c) => c.status.toUpperCase() === "PAUSED").length;

  const statuses = ["ALL", ...Array.from(new Set(campaigns.map((c) => c.status.toUpperCase())))];

  return (
    <div className="flex flex-col gap-5">
      <PageHeader
        title="Ads Manager"
        subtitle="Live Meta campaign data — spend, CPR, CPA, ROAS and more."
        action={
          <div className="flex items-center gap-2">
            {lastSync && (
              <span className="flex items-center gap-1.5 text-[12px] text-ink-muted">
                <Wifi size={12} className="text-brand-accent" />
                Synced {new Date(lastSync).toLocaleTimeString("en-GB")}
              </span>
            )}
            {customStart && customEnd && (
              <span className="flex items-center gap-1 rounded-full border border-brand-accent/30 bg-brand-accent/10 px-2 py-0.5 text-[11px] text-brand-accent font-medium">
                📊 Dates from Dashboard
              </span>
            )}
            <select
              value={syncDatePreset}
              onChange={(e) => setSyncDatePreset(e.target.value)}
              disabled={syncing}
              className="rounded-lg border border-base-border bg-base-surface px-2.5 py-1.5 text-[13px] text-ink outline-none focus:border-brand-accent/50 disabled:opacity-60"
            >
              <option value="today">Today</option>
              <option value="yesterday">Yesterday</option>
              <option value="last_3d">Last 3 Days</option>
              <option value="last_7d">Last 7 Days</option>
              <option value="last_14d">Last 14 Days</option>
              <option value="last_30d">Last 30 Days</option>
              <option value="maximum">Lifetime (Max)</option>
              <option value="custom">Custom Date...</option>
            </select>

            {syncDatePreset === "custom" && (
              <div className="flex items-center gap-1.5 ml-1">
                <input
                  type="date"
                  value={customStart}
                  onChange={(e) => setCustomStart(e.target.value)}
                  disabled={syncing}
                  className="rounded-lg border border-base-border bg-base-surface px-2 py-1 text-[12px] text-ink outline-none focus:border-brand-accent/50 disabled:opacity-60"
                />
                <span className="text-ink-muted text-[11px]">to</span>
                <input
                  type="date"
                  value={customEnd}
                  onChange={(e) => setCustomEnd(e.target.value)}
                  disabled={syncing}
                  className="rounded-lg border border-base-border bg-base-surface px-2 py-1 text-[12px] text-ink outline-none focus:border-brand-accent/50 disabled:opacity-60"
                />
              </div>
            )}

            <button
              onClick={() => handleSync()}
              disabled={syncing}
              className="flex items-center gap-1.5 rounded-lg border border-[#1877F2] bg-[#1877F2]/10 px-3 py-1.5 text-[13px] font-medium text-[#1877F2] hover:bg-[#1877F2]/20 disabled:opacity-60 transition-colors"
            >
              <RefreshCw size={14} className={syncing ? "animate-spin" : ""} />
              {syncing ? "Syncing…" : "Sync Meta"}
            </button>
          </div>
        }
      />

      {/* Empty / No data state */}
      {!loading && campaigns.length === 0 && !error && (
        <div className="py-12 md:py-24">
          {!isMetaConnected ? (
            <EmptyState 
              title="No ad account connected" 
              description="Connect your Meta Ads account to view live campaigns, spend, CPR and ROAS." 
              primaryAction={
                <button onClick={() => window.location.href = '/settings'} className="flex items-center gap-1.5 rounded-lg bg-brand px-5 py-2.5 text-[13px] font-medium text-white hover:bg-brand/90">
                  Connect Meta
                </button>
              }
            />
          ) : (
            <EmptyState 
              title="No campaigns found for this period" 
              description="Sync your Meta account or adjust your date range to view campaigns." 
              primaryAction={
                <button onClick={() => handleSync()} disabled={syncing} className="flex items-center gap-1.5 rounded-lg bg-[#1877F2] px-5 py-2.5 text-[13px] font-medium text-white hover:bg-[#1877F2]/90 disabled:opacity-60">
                  <RefreshCw size={14} className={syncing ? "animate-spin" : ""} />
                  {syncing ? "Syncing..." : "Sync now"}
                </button>
              }
            />
          )}
        </div>
      )}

      {/* Error state */}
      {error && (
        <div className="flex items-center gap-3 rounded-xl border border-danger/30 bg-danger/10 px-4 py-3 text-[13px] text-danger">
          <AlertCircle size={16} className="shrink-0" />
          <span>{error}</span>
          <button onClick={loadCampaigns} className="ml-auto rounded-lg border border-danger/30 px-3 py-1 text-[12px] hover:bg-danger/10">
            Retry
          </button>
        </div>
      )}

      {/* ── Stat Cards ── */}
      {(loading || campaigns.length > 0) && (
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-5">
          <StatCard label="Total Spend" value={loading ? "—" : fmtCur(totSpend)} icon={<DollarSign size={16} />} color="text-danger" />
          <StatCard label="Total Reach" value={loading ? "—" : fmt(totReach, 0)} icon={<Eye size={16} />} color="text-sky-400" />
          <StatCard label="Total Clicks" value={loading ? "—" : fmt(totClicks, 0)} icon={<MousePointerClick size={16} />} color="text-brand-accent" />
          <StatCard label="Total Results" value={loading ? "—" : fmt(totResults, 0)} icon={<Target size={16} />} color="text-purple-400" />
          <StatCard label="Cost / Result" value={loading ? "—" : fmtCur(avgCPR)} icon={<TrendingUp size={16} />} color="text-amber-400" />
          <StatCard label="Avg. CTR" value={loading ? "—" : fmtPct(avgCTR)} icon={<Activity size={16} />} color="text-brand-accent" />
          <StatCard label="Avg. CPC" value={loading ? "—" : fmtCur(avgCPC)} icon={<DollarSign size={16} />} color="text-brand-accent" />
          <StatCard label="Avg. CPM" value={loading ? "—" : fmtCur(avgCPM)} icon={<DollarSign size={16} />} color="text-orange-400" />
          <StatCard label="Active" value={loading ? "—" : String(activeCampaigns)} icon={<Wifi size={16} />} color="text-brand-accent" />
          <StatCard label="Paused" value={loading ? "—" : String(pausedCampaigns)} icon={<WifiOff size={16} />} color="text-zinc-400" />
        </div>
      )}

      {/* ── Filters ── */}
      {(loading || campaigns.length > 0) && (
        <div className="flex flex-wrap items-center gap-2">
          <div className="relative">
            <Search size={13} className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-ink-faint" />
            <input
              value={search}
              onChange={(e) => { setSearch(e.target.value); setPage(0); }}
              placeholder="Search campaign..."
              className="w-56 rounded-full border border-base-border bg-base-surface py-1.5 pl-8 pr-3 text-[13px] text-ink placeholder:text-ink-faint focus:border-brand-accent/50 outline-none"
            />
          </div>

          <div className="flex gap-1">
            {statuses.map((s) => (
              <button
                key={s}
                onClick={() => { setStatusFilter(s); setPage(0); }}
                className={`rounded-full border px-3 py-1 text-[12px] font-medium transition-colors ${statusFilter === s
                  ? "border-brand-accent bg-brand-accent/10 text-brand-accent"
                  : "border-base-border bg-base-surface text-ink-muted hover:text-ink"
                  }`}
              >
                {s === "ALL" ? "All" : s.charAt(0) + s.slice(1).toLowerCase()}
              </button>
            ))}
          </div>

          <div className="ml-auto text-[12px] text-ink-muted">
            {filtered.length} campaign{filtered.length !== 1 ? "s" : ""}
          </div>
        </div>
      )}

      {/* ── Table ── */}
      {(loading || campaigns.length > 0) && (
        <>
          <div className="hidden md:block overflow-auto rounded-xl border border-base-border bg-base-surface shadow-card">
            <table className="w-full whitespace-nowrap text-[13px]">
              <thead className="sticky top-0 z-10 bg-base-surface shadow-sm">
                <tr className="border-b border-base-border text-left">
                  <SortTh label="Campaign" field="campaign_name" sortKey={sortKey} sortDir={sortDir} onSort={handleSort} />
                  <th className="px-4 py-3 text-[12px] font-medium text-ink-muted">Status</th>
                  <SortTh label="Budget/day" field="budget" sortKey={sortKey} sortDir={sortDir} onSort={handleSort} right />
                  <SortTh label="Spend" field="spend" sortKey={sortKey} sortDir={sortDir} onSort={handleSort} right />
                  <SortTh label="Results" field="results" sortKey={sortKey} sortDir={sortDir} onSort={handleSort} right />
                  <SortTh label="Cost/Result" field="cost_per_result" sortKey={sortKey} sortDir={sortDir} onSort={handleSort} right />
                  <SortTh label="Reach" field="reach" sortKey={sortKey} sortDir={sortDir} onSort={handleSort} right />
                  <SortTh label="Impressions" field="impressions" sortKey={sortKey} sortDir={sortDir} onSort={handleSort} right />
                  <SortTh label="Clicks" field="clicks" sortKey={sortKey} sortDir={sortDir} onSort={handleSort} right />
                  <SortTh label="CTR" field="ctr" sortKey={sortKey} sortDir={sortDir} onSort={handleSort} right />
                  <SortTh label="CPC" field="cpc" sortKey={sortKey} sortDir={sortDir} onSort={handleSort} right />
                  <SortTh label="CPM" field="cpm" sortKey={sortKey} sortDir={sortDir} onSort={handleSort} right />
                  <SortTh label="Freq." field="frequency" sortKey={sortKey} sortDir={sortDir} onSort={handleSort} right />
                </tr>
              </thead>
              <tbody className="divide-y divide-base-border">
                {loading ? (
                  Array.from({ length: 6 }).map((_, i) => <SkeletonRow key={i} />)
                ) : paged.length === 0 ? (
                  <tr>
                    <td colSpan={13}>
                      <EmptyState title="No campaigns found" description="Try adjusting your filters or search." />
                    </td>
                  </tr>
                ) : (
                  paged.map((c) => (
                    <tr key={c.id} className="hover:bg-base-raised/40 transition-colors">
                      <td className="px-4 py-3 font-medium text-ink max-w-[220px] truncate">
                        <span title={c.campaign_name}>{c.campaign_name}</span>
                      </td>
                      <td className="px-4 py-3"><DeliveryBadge status={c.status} /></td>
                      <td className="px-4 py-3 text-right font-mono text-ink-muted">
                        {c.budget != null ? fmtCur(c.budget) : "—"}
                      </td>
                      <td className="px-4 py-3 text-right font-mono font-semibold text-ink">{fmtCur(c.spend)}</td>
                      <td className="px-4 py-3 text-right font-mono text-purple-400">{fmt(c.results, 0)}</td>
                      <td className="px-4 py-3 text-right font-mono text-amber-400">{c.cost_per_result > 0 ? fmtCur(c.cost_per_result) : "—"}</td>
                      <td className="px-4 py-3 text-right font-mono text-ink-muted">{fmt(c.reach, 0)}</td>
                      <td className="px-4 py-3 text-right font-mono text-ink-muted">{fmt(c.impressions, 0)}</td>
                      <td className="px-4 py-3 text-right font-mono text-sky-400">{fmt(c.clicks, 0)}</td>
                      <td className="px-4 py-3 text-right font-mono text-brand-accent">{fmtPct(c.ctr)}</td>
                      <td className="px-4 py-3 text-right font-mono text-ink-muted">{fmtCur(c.cpc)}</td>
                      <td className="px-4 py-3 text-right font-mono text-ink-muted">{fmtCur(c.cpm)}</td>
                      <td className="px-4 py-3 text-right font-mono text-ink-muted">{fmt(c.frequency, 2)}</td>
                    </tr>
                  ))
                )}

                {/* Account Totals Row */}
                {!loading && filtered.length > 0 && (
                  <tr className="border-t-2 border-base-border bg-base-raised/80 font-semibold">
                    <td colSpan={2} className="px-4 py-3 text-ink">Total · {filtered.length} campaigns</td>
                    <td className="px-4 py-3 text-right text-ink-muted">—</td>
                    <td className="px-4 py-3 text-right font-mono text-ink">{fmtCur(totSpend)}</td>
                    <td className="px-4 py-3 text-right font-mono text-purple-400">{fmt(totResults, 0)}</td>
                    <td className="px-4 py-3 text-right font-mono text-amber-400">{avgCPR > 0 ? fmtCur(avgCPR) : "—"}</td>
                    <td className="px-4 py-3 text-right font-mono text-ink-muted">{fmt(totReach, 0)}</td>
                    <td className="px-4 py-3 text-right font-mono text-ink-muted">{fmt(totImpressions, 0)}</td>
                    <td className="px-4 py-3 text-right font-mono text-sky-400">{fmt(totClicks, 0)}</td>
                    <td className="px-4 py-3 text-right font-mono text-brand-accent">{fmtPct(avgCTR)}</td>
                    <td className="px-4 py-3 text-right font-mono text-ink-muted">{fmtCur(avgCPC)}</td>
                    <td className="px-4 py-3 text-right font-mono text-ink-muted">{fmtCur(avgCPM)}</td>
                    <td className="px-4 py-3 text-right text-ink-muted">—</td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>

          <div className="md:hidden flex flex-col gap-3 pb-4">
            {loading ? (
              Array.from({ length: 4 }).map((_, i) => (
                <div key={i} className="rounded-2xl bg-base-surface/60 border-none shadow-xl backdrop-blur-xl p-4 animate-pulse">
                  <div className="flex justify-between items-start mb-3 border-b border-base-border/50 pb-3">
                    <div>
                      <div className="h-4 w-32 bg-base-raised rounded mb-2" />
                      <div className="h-4 w-16 bg-base-raised rounded-full" />
                    </div>
                    <div className="flex flex-col items-end">
                      <div className="h-3 w-12 bg-base-raised rounded mb-1" />
                      <div className="h-5 w-20 bg-base-raised rounded" />
                    </div>
                  </div>
                  <div className="grid grid-cols-3 gap-2">
                    <div className="h-8 w-full bg-base-raised rounded" />
                    <div className="h-8 w-full bg-base-raised rounded" />
                    <div className="h-8 w-full bg-base-raised rounded" />
                  </div>
                </div>
              ))
            ) : paged.length === 0 ? (
              <EmptyState title="No campaigns found" description="Try adjusting your filters or search." />
            ) : (
              paged.map(c => (
                <div key={c.id} className="rounded-2xl bg-base-surface/60 border-none shadow-xl backdrop-blur-xl p-4">
                  <div className="flex justify-between items-start mb-3 border-b border-base-border/50 pb-3">
                    <div className="flex-1 pr-2">
                      <div className="text-[14px] font-bold text-ink mb-1.5 leading-tight">{c.campaign_name}</div>
                      <DeliveryBadge status={c.status} />
                    </div>
                    <div className="text-right">
                      <div className="text-[11px] text-ink-muted uppercase tracking-wider mb-0.5">Spend</div>
                      <div className="font-mono text-[16px] font-bold text-ink tracking-tight">{fmtCur(c.spend)}</div>
                    </div>
                  </div>
                  <div className="grid grid-cols-3 gap-2">
                    <div>
                      <div className="text-[11px] text-ink-muted mb-0.5">Results</div>
                      <div className="font-mono text-[14px] font-bold text-purple-400">{fmt(c.results, 0)}</div>
                    </div>
                    <div>
                      <div className="text-[11px] text-ink-muted mb-0.5">Cost/Res</div>
                      <div className="font-mono text-[14px] font-bold text-amber-400">{c.cost_per_result > 0 ? fmtCur(c.cost_per_result) : "—"}</div>
                    </div>
                    <div>
                      <div className="text-[11px] text-ink-muted mb-0.5">Clicks</div>
                      <div className="font-mono text-[14px] font-bold text-sky-400">{fmt(c.clicks, 0)}</div>
                    </div>
                  </div>
                </div>
              ))
            )}
          </div>
        </>
      )}

      {/* ── Pagination ── */}
      {totalPages > 1 && (
        <div className="flex items-center justify-center gap-2">
          <button
            disabled={page === 0}
            onClick={() => setPage((p) => Math.max(0, p - 1))}
            className="rounded-lg border border-base-border px-3 py-1.5 text-[13px] text-ink-muted hover:bg-base-raised disabled:opacity-40"
          >
            ← Prev
          </button>
          <span className="text-[13px] text-ink-muted">
            Page {page + 1} of {totalPages}
          </span>
          <button
            disabled={page >= totalPages - 1}
            onClick={() => setPage((p) => Math.min(totalPages - 1, p + 1))}
            className="rounded-lg border border-base-border px-3 py-1.5 text-[13px] text-ink-muted hover:bg-base-raised disabled:opacity-40"
          >
            Next →
          </button>
        </div>
      )}
    </div>
  );
}
