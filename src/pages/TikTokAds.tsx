import { useCallback, useEffect, useMemo, useState, type ReactNode } from "react";
import { useNavigate } from "react-router-dom";
import { AlertTriangle, ArrowDownRight, ArrowUpRight, Download, ImageOff, Loader2, RefreshCw, Search } from "lucide-react";
import { Bar, BarChart, CartesianGrid, Legend, Line, LineChart, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import { PageHeader } from "../components/PageHeader";
import { toast } from "../components/Toast";
import { useAuth } from "../hooks/useAuth";
import { useBusinessConfig } from "../hooks/useBusinessConfig";
import { useCostRules } from "../hooks/useCostRules";
import { calculateWorkspaceProfit, type CostRule, type OrderForMetrics } from "../lib/metrics";
import { supabase } from "../lib/supabase";
import { dateRangeForPreset, hasCurrencyMismatch, percent, safeDivide, type DatePreset, type DateRange } from "../lib/tiktokMetrics";
import { getTikTokStatus, invokeTikTok, type TikTokInsight, type TikTokIntegrationStatus } from "../lib/tiktok";
import { normalizeStatus } from "../utils/status";

type Tab = "campaigns" | "adgroups" | "ads" | "creatives";
type EntityRow = Record<string, string | number | boolean | null | Record<string, unknown>>;
type AttributedOrder = OrderForMetrics & { sku?: string | null; tiktok_campaign_id?: string | null; tiktok_adgroup_id?: string | null; tiktok_ad_id?: string | null; tiktok_attribution_status?: string | null };

interface LoadedData {
  insights: TikTokInsight[];
  campaigns: EntityRow[];
  adgroups: EntityRow[];
  ads: EntityRow[];
  orders: AttributedOrder[];
  skuCosts: Map<string, number>;
}

const EMPTY_DATA: LoadedData = { insights: [], campaigns: [], adgroups: [], ads: [], orders: [], skuCosts: new Map() };
const PRESETS: Array<{ value: DatePreset; label: string }> = [
  { value: "today", label: "Today" }, { value: "yesterday", label: "Yesterday" }, { value: "last7", label: "Last 7 days" },
  { value: "last14", label: "Last 14 days" }, { value: "last30", label: "Last 30 days" }, { value: "thisMonth", label: "This month" }, { value: "lastMonth", label: "Last month" },
];

function number(value: unknown): number { const parsed = Number(value ?? 0); return Number.isFinite(parsed) ? parsed : 0; }
function fmt(value: number | null, digits = 2): string { return value === null ? "—" : value.toLocaleString(undefined, { maximumFractionDigits: digits }); }
function money(value: number | null, currency: string | null | undefined): string { return value === null ? "—" : `${currency || ""} ${fmt(value)}`.trim(); }
function percentage(value: number | null): string { return value === null ? "—" : `${fmt(value)}%`; }
function seconds(value: number | null): string { return value === null ? "—" : `${fmt(value)}s`; }
function times(value: number | null, multiplier: number): number | null { return value === null ? null : value * multiplier; }
function isoEnd(date: string): string { return `${date}T23:59:59.999Z`; }

function previousRange(range: DateRange): DateRange {
  const start = new Date(`${range.start}T00:00:00Z`);
  const end = new Date(`${range.end}T00:00:00Z`);
  const days = Math.round((end.getTime() - start.getTime()) / 86_400_000) + 1;
  const previousEnd = new Date(start.getTime() - 86_400_000);
  const previousStart = new Date(previousEnd.getTime() - (days - 1) * 86_400_000);
  return { start: previousStart.toISOString().slice(0, 10), end: previousEnd.toISOString().slice(0, 10) };
}

function Delta({ current, previous }: { current: number; previous: number }) {
  const change = previous === 0 ? null : ((current - previous) / Math.abs(previous)) * 100;
  if (change === null) return <span className="text-[10px] text-ink-faint">No prior baseline</span>;
  const positive = change >= 0;
  return <span className={`flex items-center gap-0.5 text-[10px] ${positive ? "text-emerald-600" : "text-danger"}`}>{positive ? <ArrowUpRight size={11} /> : <ArrowDownRight size={11} />}{fmt(Math.abs(change), 1)}%</span>;
}

function MetricCard({ label, value, note, current, previous, compare }: { label: string; value: string; note?: string; current?: number; previous?: number; compare?: boolean }) {
  return <div className="rounded-xl border border-base-border bg-base-surface p-3.5 shadow-card"><div className="text-[11px] text-ink-muted">{label}</div><div className="mt-1 font-mono text-[17px] font-semibold text-ink">{value}</div>{compare && current !== undefined && previous !== undefined ? <Delta current={current} previous={previous} /> : note ? <div className="mt-1 text-[10px] text-ink-faint">{note}</div> : null}</div>;
}

function extractEntityName(row: EntityRow, tab: Tab): string {
  return String(row[tab === "campaigns" ? "campaign_name" : tab === "adgroups" ? "adgroup_name" : "ad_name"] || row.name || "Untitled");
}

function idFor(row: EntityRow, tab: Tab): string {
  return String(row[tab === "campaigns" ? "tiktok_campaign_id" : tab === "adgroups" ? "tiktok_adgroup_id" : "tiktok_ad_id"] || "");
}

function entityDetails(row: EntityRow, tab: Tab, currency: string | null | undefined): string {
  if (tab === "campaigns") return [row.objective, row.budget ? `${currency || ""} ${row.budget}`.trim() : null, row.budget_mode].filter(Boolean).join(" · ") || "—";
  if (tab === "adgroups") return [row.optimization_goal, row.bid_strategy, row.placement, row.budget ? `${currency || ""} ${row.budget}`.trim() : null].filter(Boolean).join(" · ") || "—";
  return [row.tiktok_creative_id ? `Creative ${row.tiktok_creative_id}` : null].filter(Boolean).join(" · ") || "—";
}

async function loadAttributedOrders(workspaceId: string, range: DateRange) {
  const columns = "total,status,delivery_status,shipping_status,city,created_at,sku,shipping_cost,tiktok_campaign_id,tiktok_adgroup_id,tiktok_ad_id,tiktok_attribution_status";
  let result = await supabase.from("orders")
    .select(`id:"Order ID",${columns}`)
    .eq("workspace_id", workspaceId)
    .gte("created_at", `${range.start}T00:00:00Z`)
    .lte("created_at", isoEnd(range.end))
    .not("tiktok_attribution_status", "is", null);
  if (result.error?.code === "42703" || result.error?.code === "PGRST204") {
    result = await supabase.from("orders")
      .select(`id,${columns}`)
      .eq("workspace_id", workspaceId)
      .gte("created_at", `${range.start}T00:00:00Z`)
      .lte("created_at", isoEnd(range.end))
      .not("tiktok_attribution_status", "is", null);
  }
  return result;
}

async function loadRange(workspaceId: string, advertiserId: string, range: DateRange, includeEntities: boolean): Promise<LoadedData> {
  const [insightsResult, ordersResult, campaignsResult, adgroupsResult, adsResult, productsResult] = await Promise.all([
    supabase.from("tiktok_ad_insights").select("*").eq("workspace_id", workspaceId).eq("advertiser_id", advertiserId).gte("report_date", range.start).lte("report_date", range.end),
    loadAttributedOrders(workspaceId, range),
    includeEntities ? supabase.from("tiktok_campaigns").select("*").eq("workspace_id", workspaceId).eq("advertiser_id", advertiserId) : Promise.resolve({ data: [], error: null }),
    includeEntities ? supabase.from("tiktok_adgroups").select("*").eq("workspace_id", workspaceId).eq("advertiser_id", advertiserId) : Promise.resolve({ data: [], error: null }),
    includeEntities ? supabase.from("tiktok_ads").select("*").eq("workspace_id", workspaceId).eq("advertiser_id", advertiserId) : Promise.resolve({ data: [], error: null }),
    includeEntities ? supabase.from("products").select("sku,cost").eq("workspace_id", workspaceId) : Promise.resolve({ data: [], error: null }),
  ]);
  const error = insightsResult.error || ordersResult.error || campaignsResult.error || adgroupsResult.error || adsResult.error || productsResult.error;
  if (error) throw error;
  return {
    insights: (insightsResult.data ?? []) as TikTokInsight[],
    orders: (ordersResult.data ?? []) as AttributedOrder[],
    campaigns: (campaignsResult.data ?? []) as EntityRow[],
    adgroups: (adgroupsResult.data ?? []) as EntityRow[],
    ads: (adsResult.data ?? []) as EntityRow[],
    skuCosts: new Map(((productsResult.data ?? []) as Array<{ sku: string | null; cost: number | null }>).filter((row) => row.sku).map((row) => [String(row.sku), number(row.cost)])),
  };
}

export default function TikTokAds() {
  const navigate = useNavigate();
  const { workspace } = useAuth();
  const { rules } = useCostRules();
  const { config } = useBusinessConfig();
  const [status, setStatus] = useState<TikTokIntegrationStatus | null>(null);
  const [accountId, setAccountId] = useState("");
  const [preset, setPreset] = useState<DatePreset>("last7");
  const [custom, setCustom] = useState<DateRange | null>(null);
  const [compare, setCompare] = useState(false);
  const [data, setData] = useState<LoadedData>(EMPTY_DATA);
  const [prior, setPrior] = useState<LoadedData>(EMPTY_DATA);
  const [loading, setLoading] = useState(true);
  const [syncing, setSyncing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [tab, setTab] = useState<Tab>("campaigns");
  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState("all");
  const [productFilter, setProductFilter] = useState("all");
  const [campaignFilter, setCampaignFilter] = useState("all");
  const [adgroupFilter, setAdgroupFilter] = useState("all");
  const [adFilter, setAdFilter] = useState("all");
  const [objectiveFilter, setObjectiveFilter] = useState("all");
  const [showVideoColumn, setShowVideoColumn] = useState(true);
  const [sortMetric, setSortMetric] = useState<"spend" | "impressions" | "clicks" | "conversions">("spend");
  const [sortDescending, setSortDescending] = useState(true);
  const [page, setPage] = useState(1);

  const account = status?.ad_accounts.find((item) => item.advertiser_id === accountId) ?? null;
  const range = custom ?? dateRangeForPreset(preset, account?.timezone || "UTC");

  const reload = useCallback(async () => {
    if (!workspace) return;
    setLoading(true); setError(null);
    try {
      const nextStatus = await getTikTokStatus(workspace.id);
      setStatus(nextStatus);
      const enabled = nextStatus.ad_accounts.filter((item) => item.is_enabled);
      const nextAccountId = enabled.some((item) => item.advertiser_id === accountId) ? accountId : enabled[0]?.advertiser_id || "";
      setAccountId(nextAccountId);
      if (nextAccountId) {
        const activeAccount = enabled.find((item) => item.advertiser_id === nextAccountId);
        const activeRange = custom ?? dateRangeForPreset(preset, activeAccount?.timezone || "UTC");
        const [currentData, priorData] = await Promise.all([loadRange(workspace.id, nextAccountId, activeRange, true), compare ? loadRange(workspace.id, nextAccountId, previousRange(activeRange), false) : Promise.resolve(EMPTY_DATA)]);
        setData(currentData); setPrior(priorData);
      } else { setData(EMPTY_DATA); setPrior(EMPTY_DATA); }
    } catch (caught) { setError(caught instanceof Error ? caught.message : "TikTok reporting could not be loaded"); }
    finally { setLoading(false); }
  }, [accountId, compare, custom, preset, workspace]);

  useEffect(() => { void reload(); }, [reload]);

  const activeInsights = useMemo(() => {
    const objectiveCampaigns = new Set(data.campaigns.filter((row) => objectiveFilter === "all" || String(row.objective || "UNKNOWN") === objectiveFilter).map((row) => String(row.tiktok_campaign_id)));
    const level = adFilter !== "all" ? "ad" : adgroupFilter !== "all" ? "adgroup" : campaignFilter !== "all" || objectiveFilter !== "all" ? "campaign" : "advertiser";
    const entityId = adFilter !== "all" ? adFilter : adgroupFilter !== "all" ? adgroupFilter : campaignFilter !== "all" ? campaignFilter : accountId;
    return data.insights.filter((row) => row.reporting_level === level && (objectiveFilter !== "all" && campaignFilter === "all" && adgroupFilter === "all" && adFilter === "all" ? objectiveCampaigns.has(row.entity_id) : row.entity_id === entityId));
  }, [accountId, adFilter, adgroupFilter, campaignFilter, data.campaigns, data.insights, objectiveFilter]);
  const priorInsights = useMemo(() => {
    const objectiveCampaigns = new Set(data.campaigns.filter((row) => objectiveFilter === "all" || String(row.objective || "UNKNOWN") === objectiveFilter).map((row) => String(row.tiktok_campaign_id)));
    const level = adFilter !== "all" ? "ad" : adgroupFilter !== "all" ? "adgroup" : campaignFilter !== "all" || objectiveFilter !== "all" ? "campaign" : "advertiser";
    const entityId = adFilter !== "all" ? adFilter : adgroupFilter !== "all" ? adgroupFilter : campaignFilter !== "all" ? campaignFilter : accountId;
    return prior.insights.filter((row) => row.reporting_level === level && (objectiveFilter !== "all" && campaignFilter === "all" && adgroupFilter === "all" && adFilter === "all" ? objectiveCampaigns.has(row.entity_id) : row.entity_id === entityId));
  }, [accountId, adFilter, adgroupFilter, campaignFilter, data.campaigns, objectiveFilter, prior.insights]);
  const totals = useMemo(() => activeInsights.reduce((sum, row) => ({ spend: sum.spend + number(row.spend), impressions: sum.impressions + number(row.impressions), reach: sum.reach + number(row.reach), clicks: sum.clicks + number(row.clicks), destination: sum.destination + number(row.destination_clicks), conversions: sum.conversions + number(row.conversions), video: sum.video + number(row.video_views), two: sum.two + number(row.video_watched_2s), six: sum.six + number(row.video_watched_6s), p25: sum.p25 + number(row.video_views_p25), p50: sum.p50 + number(row.video_views_p50), p75: sum.p75 + number(row.video_views_p75), p100: sum.p100 + number(row.video_views_p100), watchSeconds: sum.watchSeconds + number(row.average_video_play) * number(row.video_views) }), { spend: 0, impressions: 0, reach: 0, clicks: 0, destination: 0, conversions: 0, video: 0, two: 0, six: 0, p25: 0, p50: 0, p75: 0, p100: 0, watchSeconds: 0 }), [activeInsights]);
  const priorTotals = useMemo(() => priorInsights.reduce((sum, row) => ({ spend: sum.spend + number(row.spend), impressions: sum.impressions + number(row.impressions), clicks: sum.clicks + number(row.clicks) }), { spend: 0, impressions: 0, clicks: 0 }), [priorInsights]);
  const productOptions = useMemo(() => [...new Set(data.orders.map((order) => order.sku).filter(Boolean) as string[])].sort(), [data.orders]);
  const objectiveCampaignIds = useMemo(() => new Set(data.campaigns.filter((row) => objectiveFilter === "all" || String(row.objective || "UNKNOWN") === objectiveFilter).map((row) => String(row.tiktok_campaign_id))), [data.campaigns, objectiveFilter]);
  const filteredOrders = useMemo(() => data.orders.filter((order) => (productFilter === "all" || order.sku === productFilter)
    && (campaignFilter === "all" || order.tiktok_campaign_id === campaignFilter)
    && (adgroupFilter === "all" || order.tiktok_adgroup_id === adgroupFilter)
    && (adFilter === "all" || order.tiktok_ad_id === adFilter)
    && (objectiveFilter === "all" || objectiveCampaignIds.has(order.tiktok_campaign_id || ""))), [adFilter, adgroupFilter, campaignFilter, data.orders, objectiveCampaignIds, objectiveFilter, productFilter]);
  const filteredPriorOrders = useMemo(() => prior.orders.filter((order) => (productFilter === "all" || order.sku === productFilter)
    && (campaignFilter === "all" || order.tiktok_campaign_id === campaignFilter)
    && (adgroupFilter === "all" || order.tiktok_adgroup_id === adgroupFilter)
    && (adFilter === "all" || order.tiktok_ad_id === adFilter)
    && (objectiveFilter === "all" || objectiveCampaignIds.has(order.tiktok_campaign_id || ""))), [adFilter, adgroupFilter, campaignFilter, objectiveCampaignIds, objectiveFilter, prior.orders, productFilter]);
  const engineRules = useMemo(() => rules.filter((rule) => rule.trigger !== "entered") as CostRule[], [rules]);
  const profit = useMemo(() => calculateWorkspaceProfit({ mode: config.businessCostModel, orders: filteredOrders, adSpend: totals.spend, skuCostMap: data.skuCosts, costRules: engineRules }), [config.businessCostModel, data.skuCosts, engineRules, filteredOrders, totals.spend]);
  const statusBuckets = useMemo(() => filteredOrders.reduce((buckets, order) => {
    const normalized = normalizeStatus(order.shipping_status || order.delivery_status || order.status);
    if (normalized === "NEW") buckets.new += 1;
    else if (normalized === "CONFIRMED") buckets.confirmed += 1;
    else if (normalized === "OUT_FOR_DELIVERY" || normalized === "READY") buckets.shipped += 1;
    else if (normalized === "DELIVERED") buckets.delivered += 1;
    else if (["COMING_BACK", "CANCELLED", "RETURNED"].includes(normalized)) buckets.cancelled += 1;
    return buckets;
  }, { new: 0, confirmed: 0, shipped: 0, delivered: 0, cancelled: 0 }), [filteredOrders]);
  const priorProfit = useMemo(() => calculateWorkspaceProfit({ mode: config.businessCostModel, orders: filteredPriorOrders, adSpend: priorTotals.spend, skuCostMap: data.skuCosts, costRules: engineRules }), [config.businessCostModel, data.skuCosts, engineRules, filteredPriorOrders, priorTotals.spend]);
  const currencyMismatch = hasCurrencyMismatch(workspace?.reporting_currency, account?.currency);
  const canCombineCurrencies = Boolean(workspace?.reporting_currency && account?.currency && !currencyMismatch);

  const chartData = useMemo(() => {
    const map = new Map<string, { date: string; spend: number; clicks: number; impressions: number; orders: number; revenue: number }>();
    activeInsights.forEach((row) => map.set(row.report_date, { date: row.report_date, spend: number(row.spend), clicks: number(row.clicks), impressions: number(row.impressions), orders: 0, revenue: 0 }));
    filteredOrders.forEach((order) => { const date = order.created_at.slice(0, 10); const entry = map.get(date) ?? { date, spend: 0, clicks: 0, impressions: 0, orders: 0, revenue: 0 }; entry.orders += 1; if ((order.shipping_status || order.delivery_status || order.status).toUpperCase() === "DELIVERED") entry.revenue += number(order.total); map.set(date, entry); });
    return [...map.values()].sort((a, b) => a.date.localeCompare(b.date));
  }, [activeInsights, filteredOrders]);

  const entityMetrics = useMemo(() => {
    const level = tab === "campaigns" ? "campaign" : tab === "adgroups" ? "adgroup" : "ad";
    const map = new Map<string, TikTokInsight>();
    data.insights.filter((row) => row.reporting_level === level).forEach((row) => {
      const old = map.get(row.entity_id);
      map.set(row.entity_id, { ...row, spend: number(old?.spend) + number(row.spend), impressions: number(old?.impressions) + number(row.impressions), reach: number(old?.reach) + number(row.reach), clicks: number(old?.clicks) + number(row.clicks), destination_clicks: number(old?.destination_clicks) + number(row.destination_clicks), conversions: number(old?.conversions) + number(row.conversions), video_views: number(old?.video_views) + number(row.video_views), video_watched_2s: number(old?.video_watched_2s) + number(row.video_watched_2s), video_watched_6s: number(old?.video_watched_6s) + number(row.video_watched_6s) });
    });
    return map;
  }, [data.insights, tab]);

  const rows = useMemo(() => {
    const source = tab === "campaigns" ? data.campaigns : tab === "adgroups" ? data.adgroups : data.ads;
    const campaignObjectives = new Map(data.campaigns.map((campaign) => [String(campaign.tiktok_campaign_id), String(campaign.objective || "UNKNOWN")]));
    return source.filter((row) => {
      const campaignId = String(row.tiktok_campaign_id || "");
      const adgroupId = String(row.tiktok_adgroup_id || "");
      const adId = String(row.tiktok_ad_id || "");
      const objective = tab === "campaigns" ? String(row.objective || "UNKNOWN") : campaignObjectives.get(campaignId) || "UNKNOWN";
      return extractEntityName(row, tab).toLowerCase().includes(search.toLowerCase())
        && (statusFilter === "all" || String(row.status || row.operation_status).toUpperCase() === statusFilter)
        && (campaignFilter === "all" || campaignId === campaignFilter)
        && (adgroupFilter === "all" || adgroupId === adgroupFilter)
        && (adFilter === "all" || adId === adFilter)
        && (objectiveFilter === "all" || objective === objectiveFilter);
    }).sort((a, b) => {
      const left = number(entityMetrics.get(idFor(a, tab))?.[sortMetric]);
      const right = number(entityMetrics.get(idFor(b, tab))?.[sortMetric]);
      return sortDescending ? right - left : left - right;
    });
  }, [adFilter, adgroupFilter, campaignFilter, data, entityMetrics, objectiveFilter, search, sortDescending, sortMetric, statusFilter, tab]);
  const pagedRows = rows.slice((page - 1) * 20, page * 20);

  const sync = async () => {
    if (!workspace) return;
    setSyncing(true);
    try { await invokeTikTok("tiktok-sync", { workspace_id: workspace.id, start_date: range.start, end_date: range.end }); toast.success("TikTok reporting is up to date."); await reload(); }
    catch (caught) { toast.error(caught instanceof Error ? caught.message : "Sync failed"); }
    finally { setSyncing(false); }
  };

  const exportCsv = () => {
    const header = ["Name", "ID", "Status", "Spend", "Impressions", "Reach", "Clicks", "Destination clicks", "CTR", "CPC", "CPM", "Conversions"];
    const lines = rows.map((row) => { const metric = entityMetrics.get(idFor(row, tab)); return [extractEntityName(row, tab), idFor(row, tab), String(row.status || row.operation_status || ""), number(metric?.spend), number(metric?.impressions), number(metric?.reach), number(metric?.clicks), number(metric?.destination_clicks), percent(number(metric?.clicks), number(metric?.impressions)) ?? "", safeDivide(number(metric?.spend), number(metric?.clicks)) ?? "", (safeDivide(number(metric?.spend), number(metric?.impressions)) ?? 0) * 1000, number(metric?.conversions)].map((value) => `"${String(value).replace(/"/g, '""')}"`).join(","); });
    const blob = new Blob([[header.join(","), ...lines].join("\n")], { type: "text/csv;charset=utf-8" }); const url = URL.createObjectURL(blob); const anchor = document.createElement("a"); anchor.href = url; anchor.download = `tiktok-${tab}-${range.start}-${range.end}.csv`; anchor.click(); URL.revokeObjectURL(url);
  };

  if (loading && !status) return <div><PageHeader title="TikTok Ads" subtitle="Official TikTok Marketing API reporting and COD profitability." /><div className="grid grid-cols-2 gap-3 md:grid-cols-4">{Array.from({ length: 12 }).map((_, index) => <div key={index} className="h-24 animate-pulse rounded-xl bg-base-raised" />)}</div></div>;
  if (error) return <State title="TikTok reporting unavailable" body={error} action={<button onClick={() => void reload()} className="rounded-xl bg-brand px-4 py-2 text-white">Retry</button>} />;
  if (!status?.connection || ["not_connected", "disconnected"].includes(status.state)) return <State title="Connect TikTok Ads" body="Authorize an official TikTok for Business account before viewing live reporting. No sample data is shown." action={<button onClick={() => navigate("/settings?tab=integrations")} className="rounded-xl bg-brand px-4 py-2 text-white">Open integration settings</button>} />;
  if (status.state === "reauth_required") return <State title="TikTok authorization expired" body="Reconnect TikTok Ads to resume syncing. Historical data remains available after reconnection." action={<button onClick={() => navigate("/settings?tab=integrations")} className="rounded-xl bg-brand px-4 py-2 text-white">Reconnect</button>} />;
  if (!account) return <State title="Select an advertiser account" body="Authorization succeeded, but no advertiser is enabled for reporting yet." action={<button onClick={() => navigate("/settings?tab=integrations&tiktok=select_accounts")} className="rounded-xl bg-brand px-4 py-2 text-white">Choose advertisers</button>} />;

  const metricCards: Array<{ label: string; value: string; note?: string; current?: number; previous?: number }> = [
    { label: "Spend", value: money(totals.spend, account.currency), current: totals.spend, previous: priorTotals.spend },
    { label: "Impressions", value: fmt(totals.impressions, 0), current: totals.impressions, previous: priorTotals.impressions },
    { label: "Reach", value: fmt(totals.reach, 0) }, { label: "All clicks", value: fmt(totals.clicks, 0), current: totals.clicks, previous: priorTotals.clicks },
    { label: "Destination clicks", value: fmt(totals.destination, 0) }, { label: "CTR", value: percentage(percent(totals.clicks, totals.impressions)) },
    { label: "CPC", value: money(safeDivide(totals.spend, totals.clicks), account.currency) }, { label: "CPM", value: money(times(safeDivide(totals.spend, totals.impressions), 1000), account.currency) },
    { label: "TikTok conversions", value: fmt(totals.conversions, 0), note: "Platform-reported" }, { label: "Cost / conversion", value: money(safeDivide(totals.spend, totals.conversions), account.currency) },
    { label: "Attributed orders", value: fmt(profit.totalOrders, 0), current: profit.totalOrders, previous: priorProfit.totalOrders },
    { label: "New", value: fmt(statusBuckets.new, 0) }, { label: "Confirmed", value: fmt(statusBuckets.confirmed, 0) },
    { label: "Shipped", value: fmt(statusBuckets.shipped, 0) }, { label: "Delivered", value: fmt(statusBuckets.delivered, 0) },
    { label: "Cancelled / returned", value: fmt(statusBuckets.cancelled, 0) },
    { label: "Confirmation rate", value: `${fmt(profit.confirmationRate)}%` }, { label: "Delivery rate", value: `${fmt(profit.deliveryRate)}%` },
    { label: "Real cost / order", value: money(safeDivide(totals.spend, profit.totalOrders), account.currency) }, { label: "Real revenue", value: money(profit.revenue, workspace?.reporting_currency), note: "Delivered COD only" },
    { label: "Real ROAS", value: canCombineCurrencies ? fmt(profit.roas) : "—", note: canCombineCurrencies ? "Delivered revenue / spend" : "Set matching currencies" },
    { label: "Net profit", value: canCombineCurrencies ? money(profit.netProfit, workspace?.reporting_currency) : "—", note: "Shared Ecom OS profit engine" },
    { label: "Video views", value: fmt(totals.video, 0) }, { label: "2s views", value: fmt(totals.two, 0) }, { label: "6s views", value: fmt(totals.six, 0) },
    { label: "Average watch time", value: seconds(safeDivide(totals.watchSeconds, totals.video)) },
    { label: "25% watched", value: fmt(totals.p25, 0) }, { label: "50% watched", value: fmt(totals.p50, 0) },
    { label: "75% watched", value: fmt(totals.p75, 0) }, { label: "Completed video", value: fmt(totals.p100, 0) },
  ];

  return <div>
    <PageHeader title="TikTok Ads" subtitle="Official Marketing API reporting, COD attribution, and profit." />
    <div className="mb-4 flex flex-wrap items-end gap-2 rounded-xl border border-base-border bg-base-surface p-3">
      <label className="text-[11px] text-ink-muted">Advertiser<select value={accountId} onChange={(event) => { setAccountId(event.target.value); setPage(1); }} className="mt-1 block rounded-lg border border-base-border bg-base-raised px-3 py-2 text-[12px] text-ink">{status.ad_accounts.filter((item) => item.is_enabled).map((item) => <option key={item.id} value={item.advertiser_id}>{item.advertiser_name} ({item.advertiser_id})</option>)}</select></label>
      <label className="text-[11px] text-ink-muted">Date range<select value={custom ? "custom" : preset} onChange={(event) => { if (event.target.value === "custom") setCustom(range); else { setCustom(null); setPreset(event.target.value as DatePreset); } }} className="mt-1 block rounded-lg border border-base-border bg-base-raised px-3 py-2 text-[12px] text-ink">{PRESETS.map((item) => <option key={item.value} value={item.value}>{item.label}</option>)}<option value="custom">Custom</option></select></label>
      {custom && <><input aria-label="Start date" type="date" value={custom.start} onChange={(event) => setCustom({ ...custom, start: event.target.value })} className="rounded-lg border border-base-border bg-base-raised px-3 py-2 text-[12px] text-ink" /><input aria-label="End date" type="date" value={custom.end} onChange={(event) => setCustom({ ...custom, end: event.target.value })} className="rounded-lg border border-base-border bg-base-raised px-3 py-2 text-[12px] text-ink" /></>}
      <label className="flex items-center gap-2 rounded-lg bg-base-raised px-3 py-2 text-[12px] text-ink"><input type="checkbox" checked={compare} onChange={(event) => setCompare(event.target.checked)} /> Compare previous period</label>
      <div className="ml-auto text-right text-[10px] text-ink-muted"><div>{account.currency || "Unknown currency"} · {account.timezone || "Unknown timezone"}</div><div>Last successful sync: {account.last_successful_sync_at ? new Date(account.last_successful_sync_at).toLocaleString() : "Never"}</div></div>
      <button onClick={sync} disabled={syncing} className="flex items-center gap-2 rounded-xl bg-brand px-4 py-2 text-[12px] font-semibold text-white disabled:opacity-60">{syncing ? <Loader2 size={14} className="animate-spin" /> : <RefreshCw size={14} />} Sync now</button>
    </div>
    {currencyMismatch && <div className="mb-4 flex gap-2 rounded-xl border border-amber-500/30 bg-amber-500/10 p-3 text-[12px] text-amber-700"><AlertTriangle size={16} />Ad spend is in {account.currency}; order revenue is in {workspace?.reporting_currency}. Cross-currency ROAS and profit are hidden because no exchange rate is configured.</div>}
    {!workspace?.reporting_currency && <div className="mb-4 flex gap-2 rounded-xl border border-amber-500/30 bg-amber-500/10 p-3 text-[12px] text-amber-700"><AlertTriangle size={16} />Set the workspace revenue currency in TikTok integration settings before using Real ROAS or Net Profit.</div>}
    <div className="grid grid-cols-2 gap-3 md:grid-cols-4 xl:grid-cols-6">{metricCards.map((card) => <MetricCard key={card.label} {...card} compare={compare} />)}</div>
    {profit.missingCostWarnings.length > 0 && <div className="mt-4 rounded-xl border border-amber-500/30 bg-amber-500/10 p-3 text-[11px] text-amber-700">{profit.missingCostWarnings.map((warning) => warning.message).join(" ")}</div>}
    <div className="mt-5 grid gap-4 xl:grid-cols-2">
      <Chart title="Spend and attributed orders"><ResponsiveContainer width="100%" height={250}><BarChart data={chartData}><CartesianGrid strokeDasharray="3 3" opacity={0.2} /><XAxis dataKey="date" fontSize={10} /><YAxis fontSize={10} /><Tooltip /><Legend /><Bar dataKey="spend" fill="#DB6A8F" /><Bar dataKey="orders" fill="#00B57F" /></BarChart></ResponsiveContainer></Chart>
      <Chart title="Traffic and delivery"><ResponsiveContainer width="100%" height={250}><LineChart data={chartData}><CartesianGrid strokeDasharray="3 3" opacity={0.2} /><XAxis dataKey="date" fontSize={10} /><YAxis fontSize={10} /><Tooltip /><Legend /><Line type="monotone" dataKey="clicks" stroke="#3B82F6" dot={false} /><Line type="monotone" dataKey="orders" stroke="#8B5CF6" dot={false} /></LineChart></ResponsiveContainer></Chart>
      <Chart title="Delivered COD revenue"><ResponsiveContainer width="100%" height={250}><BarChart data={chartData}><CartesianGrid strokeDasharray="3 3" opacity={0.2} /><XAxis dataKey="date" fontSize={10} /><YAxis fontSize={10} /><Tooltip /><Bar dataKey="revenue" fill="#00B57F" /></BarChart></ResponsiveContainer></Chart>
      <Chart title="Funnel"><div className="grid h-[250px] grid-cols-2 content-center gap-3 sm:grid-cols-4">{[["Impressions", totals.impressions], ["Clicks", totals.clicks], ["Orders", profit.totalOrders], ["Delivered", profit.deliveredCount]].map(([label, value]) => <div key={String(label)} className="rounded-xl bg-base-raised p-4 text-center"><div className="font-mono text-xl font-semibold text-ink">{fmt(Number(value), 0)}</div><div className="text-[11px] text-ink-muted">{label}</div></div>)}</div></Chart>
    </div>
    <div className="mt-5 rounded-xl border border-base-border bg-base-surface">
      <div className="flex flex-wrap items-center gap-2 border-b border-base-border p-3">
        {(["campaigns", "adgroups", "ads", "creatives"] as Tab[]).map((item) => <button key={item} onClick={() => { setTab(item); setPage(1); }} className={`rounded-lg px-3 py-2 text-[12px] font-semibold capitalize ${tab === item ? "bg-brand text-white" : "bg-base-raised text-ink-muted"}`}>{item}</button>)}
        <select value={campaignFilter} onChange={(event) => { setCampaignFilter(event.target.value); setAdgroupFilter("all"); setAdFilter("all"); }} className="rounded-lg border border-base-border bg-base-raised px-2 py-2 text-[11px] text-ink"><option value="all">All campaigns</option>{data.campaigns.map((row) => <option key={String(row.id)} value={String(row.tiktok_campaign_id)}>{String(row.name)}</option>)}</select>
        <select value={adgroupFilter} onChange={(event) => { setAdgroupFilter(event.target.value); setAdFilter("all"); }} className="rounded-lg border border-base-border bg-base-raised px-2 py-2 text-[11px] text-ink"><option value="all">All ad groups</option>{data.adgroups.filter((row) => campaignFilter === "all" || row.tiktok_campaign_id === campaignFilter).map((row) => <option key={String(row.id)} value={String(row.tiktok_adgroup_id)}>{String(row.name)}</option>)}</select>
        <select value={adFilter} onChange={(event) => setAdFilter(event.target.value)} className="rounded-lg border border-base-border bg-base-raised px-2 py-2 text-[11px] text-ink"><option value="all">All ads</option>{data.ads.filter((row) => (campaignFilter === "all" || row.tiktok_campaign_id === campaignFilter) && (adgroupFilter === "all" || row.tiktok_adgroup_id === adgroupFilter)).map((row) => <option key={String(row.id)} value={String(row.tiktok_ad_id)}>{String(row.name)}</option>)}</select>
        <select value={objectiveFilter} onChange={(event) => setObjectiveFilter(event.target.value)} className="rounded-lg border border-base-border bg-base-raised px-2 py-2 text-[11px] text-ink"><option value="all">All objectives</option>{[...new Set(data.campaigns.map((row) => String(row.objective || "UNKNOWN")))].sort().map((objective) => <option key={objective} value={objective}>{objective}</option>)}</select>
        <div className="relative ml-auto"><Search size={13} className="absolute left-2.5 top-2.5 text-ink-faint" /><input value={search} onChange={(event) => setSearch(event.target.value)} placeholder="Search" className="rounded-lg border border-base-border bg-base-raised py-2 pl-8 pr-3 text-[12px] text-ink" /></div>
        <select value={statusFilter} onChange={(event) => setStatusFilter(event.target.value)} className="rounded-lg border border-base-border bg-base-raised px-3 py-2 text-[12px] text-ink"><option value="all">All statuses</option><option value="ENABLE">Enabled</option><option value="DISABLE">Disabled</option><option value="ACTIVE">Active</option><option value="PAUSED">Paused</option></select>
        <select value={productFilter} onChange={(event) => setProductFilter(event.target.value)} title="Attributed-order product filter" className="rounded-lg border border-base-border bg-base-raised px-3 py-2 text-[12px] text-ink"><option value="all">All attributed products</option>{productOptions.map((sku) => <option key={sku} value={sku}>{sku}</option>)}</select>
        <details className="relative"><summary className="cursor-pointer rounded-lg bg-base-raised px-3 py-2 text-[12px] text-ink">Columns</summary><label className="absolute right-0 z-20 mt-1 flex w-44 items-center gap-2 rounded-lg border border-base-border bg-base-surface p-3 text-[11px] text-ink shadow-lg"><input type="checkbox" checked={showVideoColumn} onChange={(event) => setShowVideoColumn(event.target.checked)} /> Video views</label></details>
        <select value={sortMetric} onChange={(event) => setSortMetric(event.target.value as typeof sortMetric)} aria-label="Sort metric" className="rounded-lg border border-base-border bg-base-raised px-2 py-2 text-[11px] text-ink"><option value="spend">Sort: spend</option><option value="impressions">Sort: impressions</option><option value="clicks">Sort: clicks</option><option value="conversions">Sort: conversions</option></select>
        <button onClick={() => setSortDescending((value) => !value)} className="rounded-lg bg-base-raised px-2 py-2 text-[11px] text-ink">{sortDescending ? "High → low" : "Low → high"}</button>
        <button onClick={exportCsv} className="flex items-center gap-1 rounded-lg bg-base-raised px-3 py-2 text-[12px] text-ink"><Download size={13} /> Export</button>
      </div>
      <div className="overflow-x-auto"><table className="min-w-full"><thead><tr className="text-left text-[11px] text-ink-muted"><th className="px-4 py-3">{tab === "creatives" ? "Creative" : "Name"}</th><th className="px-4 py-3">Status</th><th className="px-4 py-3">Objective / delivery setup</th>{["Spend", "Impressions", "Reach", "Clicks", "Destination", "CTR", "CPC", "CPM", "Conversions", "Cost / result"].map((name) => <th key={name} className="px-4 py-3 text-right">{name}</th>)}{showVideoColumn && <th className="px-4 py-3 text-right">Video views</th>}</tr></thead><tbody>{pagedRows.map((row) => { const id = idFor(row, tab); const metric = entityMetrics.get(id); const preview = String(row.thumbnail_url || row.preview_url || ""); return <tr key={id} className="border-t border-base-border text-[12px] text-ink"><td className="max-w-[280px] px-4 py-3"><div className="flex items-center gap-3">{tab === "creatives" && (preview ? <img src={preview} alt="Creative thumbnail" className="h-12 w-12 rounded-lg object-cover" onError={(event) => { event.currentTarget.style.display = "none"; }} /> : <div className="flex h-12 w-12 items-center justify-center rounded-lg bg-base-raised text-ink-faint"><ImageOff size={16} /></div>)}<div><div className="truncate font-semibold">{extractEntityName(row, tab)}</div><div className="font-mono text-[10px] text-ink-faint">{id}</div></div></div></td><td className="px-4 py-3">{String(row.status || row.operation_status || "Unknown")}</td><td className="max-w-[260px] px-4 py-3 text-[10.5px] text-ink-muted">{entityDetails(row, tab, account.currency)}</td><td className="px-4 py-3 text-right">{money(number(metric?.spend), account.currency)}</td><td className="px-4 py-3 text-right">{fmt(number(metric?.impressions), 0)}</td><td className="px-4 py-3 text-right">{fmt(number(metric?.reach), 0)}</td><td className="px-4 py-3 text-right">{fmt(number(metric?.clicks), 0)}</td><td className="px-4 py-3 text-right">{fmt(number(metric?.destination_clicks), 0)}</td><td className="px-4 py-3 text-right">{percentage(percent(number(metric?.clicks), number(metric?.impressions)))}</td><td className="px-4 py-3 text-right">{money(safeDivide(number(metric?.spend), number(metric?.clicks)), account.currency)}</td><td className="px-4 py-3 text-right">{money(times(safeDivide(number(metric?.spend), number(metric?.impressions)), 1000), account.currency)}</td><td className="px-4 py-3 text-right">{fmt(number(metric?.conversions), 0)}</td><td className="px-4 py-3 text-right">{money(safeDivide(number(metric?.spend), number(metric?.conversions)), account.currency)}</td>{showVideoColumn && <td className="px-4 py-3 text-right">{fmt(number(metric?.video_views), 0)}</td>}</tr>; })}{pagedRows.length === 0 && <tr><td colSpan={showVideoColumn ? 14 : 13} className="p-10 text-center text-[13px] text-ink-muted">No real TikTok data matches these filters.</td></tr>}</tbody></table></div>
      <div className="flex items-center justify-between border-t border-base-border p-3 text-[11px] text-ink-muted"><span>{rows.length} rows</span><div className="flex gap-2"><button disabled={page === 1} onClick={() => setPage((value) => Math.max(1, value - 1))} className="rounded-lg bg-base-raised px-3 py-1.5 disabled:opacity-40">Previous</button><span className="px-2 py-1.5">Page {page}</span><button disabled={page * 20 >= rows.length} onClick={() => setPage((value) => value + 1)} className="rounded-lg bg-base-raised px-3 py-1.5 disabled:opacity-40">Next</button></div></div>
    </div>
  </div>;
}

function Chart({ title, children }: { title: string; children: ReactNode }) { return <div className="rounded-xl border border-base-border bg-base-surface p-4"><h3 className="mb-3 text-[13px] font-semibold text-ink">{title}</h3>{children}</div>; }
function State({ title, body, action }: { title: string; body: string; action: ReactNode }) { return <div><PageHeader title="TikTok Ads" subtitle="Official TikTok Marketing API reporting and COD profitability." /><div className="rounded-2xl border border-base-border bg-base-surface p-10 text-center"><h2 className="text-xl font-semibold text-ink">{title}</h2><p className="mx-auto mb-5 mt-2 max-w-xl text-[13px] text-ink-muted">{body}</p>{action}</div></div>; }
