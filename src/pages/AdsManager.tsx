import {
  useCallback,
  useEffect,
  useMemo,
  useState,
  type FormEvent,
} from "react";
import {
  AlertCircle,
  BarChart2,
  Check,
  ChevronLeft,
  ChevronRight,
  Copy,
  ExternalLink,
  Filter,
  Loader2,
  Pause,
  Play,
  Plus,
  RefreshCw,
  Rocket,
  Save,
  Search,
  Settings,
  Shield,
  Upload,
  X,
} from "lucide-react";
import { PageHeader } from "../components/PageHeader";
import { EmptyState } from "../components/EmptyState";
import { toast } from "../components/Toast";
import { supabase } from "../lib/supabase";
import { useAuth } from "../hooks/useAuth";
import {
  metaAdsService,
  uploadMetaCreativeFiles,
  type MetaConnectionStatus,
} from "../services/metaAdsService";

type Tab =
  | "overview"
  | "campaigns"
  | "adsets"
  | "ads"
  | "creatives"
  | "products"
  | "bulk"
  | "workflows"
  | "scaling"
  | "rules"
  | "activity";
type EntityTab = "campaigns" | "adsets" | "ads" | "creatives";
type Row = Record<string, any>;
type Metric = {
  spend: number;
  reach: number;
  impressions: number;
  clicks: number;
  ctr: number;
  cpc: number;
  cpm: number;
  frequency: number;
  purchases: number;
  purchase_value: number;
};

const TABS: Array<{ id: Tab; label: string }> = [
  { id: "overview", label: "Overview" },
  { id: "campaigns", label: "Campaigns" },
  { id: "adsets", label: "Ad Sets" },
  { id: "ads", label: "Ads" },
  { id: "creatives", label: "Creatives" },
  { id: "products", label: "Products" },
  { id: "bulk", label: "Bulk Launcher" },
  { id: "workflows", label: "Workflows" },
  { id: "scaling", label: "Scaling" },
  { id: "rules", label: "Rules" },
  { id: "activity", label: "Activity" },
];
const TABLES: Record<EntityTab, { table: string; id: string; level: string }> =
  {
    campaigns: {
      table: "meta_campaigns",
      id: "meta_campaign_id",
      level: "campaign",
    },
    adsets: { table: "meta_adsets", id: "meta_adset_id", level: "adset" },
    ads: { table: "meta_ads", id: "meta_ad_id", level: "ad" },
    creatives: { table: "meta_creatives", id: "meta_creative_id", level: "ad" },
  };
const METRIC_COLUMNS = [
  "spend",
  "reach",
  "impressions",
  "clicks",
  "ctr",
  "cpc",
  "cpm",
  "frequency",
  "orders",
  "confirmed",
  "shipped",
  "delivered",
  "returned",
  "revenue",
  "net_profit",
  "cpa",
  "cost_delivered",
  "delivery_rate",
  "real_roas",
] as const;
const EMPTY_METRIC: Metric = {
  spend: 0,
  reach: 0,
  impressions: 0,
  clicks: 0,
  ctr: 0,
  cpc: 0,
  cpm: 0,
  frequency: 0,
  purchases: 0,
  purchase_value: 0,
};
const PAGE_SIZE = 25;

function dateFromDays(days: number) {
  const date = new Date();
  date.setDate(date.getDate() - days + 1);
  return date.toISOString().slice(0, 10);
}
function fmt(value: number, digits = 2) {
  return Number(value || 0).toLocaleString("en-US", {
    maximumFractionDigits: digits,
  });
}
function statusClass(value: string) {
  return value.toUpperCase() === "ACTIVE"
    ? "border-emerald-500/25 bg-emerald-500/10 text-emerald-500"
    : value.toUpperCase() === "PAUSED"
      ? "border-zinc-500/25 bg-zinc-500/10 text-zinc-400"
      : "border-amber-500/25 bg-amber-500/10 text-amber-500";
}
function entityId(tab: EntityTab, row: Row) {
  return String(row[TABLES[tab].id]);
}
function rowName(row: Row) {
  return String(
    row.name ||
      row.campaign_name ||
      row.account_name ||
      row.meta_creative_id ||
      "Untitled",
  );
}

export default function AdsManager() {
  const { workspace, isDemoMode } = useAuth();
  const [tab, setTab] = useState<Tab>("overview");
  const [connection, setConnection] = useState<MetaConnectionStatus | null>(
    null,
  );
  const [accountId, setAccountId] = useState("");
  const [pageId, setPageId] = useState("");
  const [workflowDraft, setWorkflowDraft] = useState<Row | null>(null);
  const [since, setSince] = useState(dateFromDays(7));
  const [until, setUntil] = useState(new Date().toISOString().slice(0, 10));
  const [rows, setRows] = useState<Row[]>([]);
  const [insights, setInsights] = useState<Record<string, Metric>>({});
  const [cod, setCod] = useState<Record<string, Row>>({});
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState("ALL");
  const [sort, setSort] = useState("spend");
  const [descending, setDescending] = useState(true);
  const [page, setPage] = useState(0);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [bulkBudget, setBulkBudget] = useState("");
  const [columns, setColumns] = useState<Set<string>>(
    new Set([
      "spend",
      "impressions",
      "clicks",
      "ctr",
      "cpc",
      "orders",
      "delivered",
      "revenue",
      "real_roas",
    ]),
  );
  const [showColumns, setShowColumns] = useState(false);
  const [editor, setEditor] = useState<{ tab: EntityTab; row?: Row } | null>(
    null,
  );
  const currency =
    connection?.ad_accounts.find((account) => account.id === accountId)
      ?.currency || "USD";

  const loadStatus = useCallback(async () => {
    const result = await metaAdsService.status();
    setConnection(result);
    setAccountId(
      (current) =>
        current ||
        result.connection?.default_ad_account_id ||
        result.ad_accounts[0]?.id ||
        "",
    );
    setPageId(
      (current) =>
        current ||
        result.connection?.default_page_id ||
        result.pages[0]?.id ||
        "",
    );
    return result;
  }, []);
  const loadData = useCallback(async () => {
    if (!workspace?.id || isDemoMode) {
      setLoading(false);
      return;
    }
    setLoading(true);
    setError(null);
    try {
      const status = connection ?? (await loadStatus());
      const activeAccount =
        accountId ||
        status.connection?.default_ad_account_id ||
        status.ad_accounts[0]?.id ||
        "";
      if (
        ![
          "connected",
          "syncing",
          "sync_failed",
          "permission_required",
        ].includes(status.state) ||
        !activeAccount
      ) {
        setRows([]);
        setLoading(false);
        return;
      }
      const activeEntityTab: EntityTab =
        tab === "products"
          ? "ads"
          : ["campaigns", "adsets", "ads", "creatives"].includes(tab)
            ? (tab as EntityTab)
            : "campaigns";
      const config = TABLES[activeEntityTab];
      const [entityResult, insightResult, codResult, creativeAdsResult] =
        await Promise.all([
          supabase
            .from(config.table)
            .select("*")
            .eq("workspace_id", workspace.id)
            .eq("ad_account_id", activeAccount)
            .order("updated_at", { ascending: false }),
          supabase
            .from("meta_insights_daily")
            .select(
              "entity_id,spend,reach,impressions,clicks,ctr,cpc,cpm,frequency,purchases,purchase_value",
            )
            .eq("workspace_id", workspace.id)
            .eq("ad_account_id", activeAccount)
            .eq("reporting_level", config.level)
            .gte("report_date", since)
            .lte("report_date", until),
          supabase.rpc("get_meta_cod_metrics", {
            p_workspace_id: workspace.id,
            p_since: since,
            p_until: until,
          }),
          activeEntityTab === "creatives"
            ? supabase
                .from("meta_ads")
                .select("meta_ad_id,meta_creative_id")
                .eq("workspace_id", workspace.id)
                .eq("ad_account_id", activeAccount)
            : Promise.resolve({ data: [] as Row[], error: null }),
        ]);
      if (entityResult.error) throw entityResult.error;
      if (insightResult.error) throw insightResult.error;
      if (codResult.error) throw codResult.error;
      const metricMap: Record<string, Metric & { days: number }> = {};
      for (const item of insightResult.data ?? []) {
        const id = String(item.entity_id);
        const current = metricMap[id] ?? { ...EMPTY_METRIC, days: 0 };
        current.spend += Number(item.spend || 0);
        current.reach += Number(item.reach || 0);
        current.impressions += Number(item.impressions || 0);
        current.clicks += Number(item.clicks || 0);
        current.purchases += Number(item.purchases || 0);
        current.purchase_value += Number(item.purchase_value || 0);
        current.frequency += Number(item.frequency || 0);
        current.days += 1;
        metricMap[id] = current;
      }
      for (const metric of Object.values(metricMap)) {
        metric.ctr = metric.impressions
          ? (metric.clicks / metric.impressions) * 100
          : 0;
        metric.cpc = metric.clicks ? metric.spend / metric.clicks : 0;
        metric.cpm = metric.impressions
          ? (metric.spend / metric.impressions) * 1000
          : 0;
        metric.frequency = metric.days ? metric.frequency / metric.days : 0;
      }
      let displayMetrics: Record<string, Metric> = metricMap;
      let displayCod = (codResult.data ?? {}) as Record<string, Row>;
      if (activeEntityTab === "creatives") {
        displayMetrics = {};
        const remappedCod: Record<string, Row> = {};
        for (const ad of creativeAdsResult.data ?? []) {
          const creativeId = String(ad.meta_creative_id || "");
          if (!creativeId) continue;
          const metric = metricMap[String(ad.meta_ad_id)] ?? EMPTY_METRIC;
          const current = displayMetrics[creativeId] ?? { ...EMPTY_METRIC };
          current.spend += metric.spend;
          current.reach += metric.reach;
          current.impressions += metric.impressions;
          current.clicks += metric.clicks;
          current.purchases += metric.purchases;
          current.purchase_value += metric.purchase_value;
          // Keep the weighted contribution until every ad using this creative
          // has been folded in; derived ratios are recalculated below.
          current.frequency += metric.frequency * metric.impressions;
          displayMetrics[creativeId] = current;
          const adCod = displayCod[String(ad.meta_ad_id)] ?? {};
          const codCurrent = remappedCod[creativeId] ?? {};
          for (const key of [
            "orders",
            "confirmed",
            "shipped",
            "delivered",
            "returned",
            "revenue",
            "net_profit",
          ])
            codCurrent[key] =
              Number(codCurrent[key] || 0) + Number(adCod[key] || 0);
          codCurrent.attribution_reliable =
            codCurrent.attribution_reliable || adCod.attribution_reliable;
          remappedCod[creativeId] = codCurrent;
        }
        for (const metric of Object.values(displayMetrics)) {
          metric.ctr = metric.impressions
            ? (metric.clicks / metric.impressions) * 100
            : 0;
          metric.cpc = metric.clicks ? metric.spend / metric.clicks : 0;
          metric.cpm = metric.impressions
            ? (metric.spend / metric.impressions) * 1000
            : 0;
          metric.frequency = metric.impressions
            ? metric.frequency / metric.impressions
            : 0;
        }
        displayCod = remappedCod;
      }
      setRows(entityResult.data ?? []);
      setInsights(displayMetrics);
      setCod(displayCod);
    } catch (loadError) {
      setError(
        loadError instanceof Error
          ? loadError.message
          : "Meta data could not be loaded",
      );
    } finally {
      setLoading(false);
    }
  }, [
    workspace?.id,
    isDemoMode,
    connection,
    loadStatus,
    accountId,
    tab,
    since,
    until,
  ]);

  useEffect(() => {
    void loadStatus().catch(() => setConnection(null));
  }, [loadStatus]);
  useEffect(() => {
    void loadData();
  }, [loadData]);
  useEffect(() => {
    setPage(0);
    setSelected(new Set());
  }, [tab, accountId, since, until]);

  const enriched = useMemo<Row[]>(
    () =>
      rows.map((row): Row => {
        const tabForId: EntityTab =
          tab === "products"
            ? "ads"
            : ["campaigns", "adsets", "ads", "creatives"].includes(tab)
              ? (tab as EntityTab)
              : "campaigns";
        const id = entityId(tabForId, row);
        const metric = insights[id] ?? EMPTY_METRIC;
        const c = cod[id] ?? {};
        const orders = Number(c.orders || 0),
          delivered = Number(c.delivered || 0),
          revenue = Number(c.revenue || 0);
        return {
          ...row,
          ...metric,
          ...c,
          net_profit:
            c.net_profit == null ? null : Number(c.net_profit) - metric.spend,
          cpa: orders ? metric.spend / orders : null,
          cost_delivered: delivered ? metric.spend / delivered : null,
          delivery_rate: orders ? (delivered / orders) * 100 : null,
          real_roas:
            metric.spend && c.attribution_reliable
              ? revenue / metric.spend
              : null,
        };
      }),
    [rows, insights, cod, tab],
  );
  const filtered = useMemo(
    () =>
      enriched
        .filter(
          (row) =>
            rowName(row).toLowerCase().includes(search.toLowerCase()) &&
            (statusFilter === "ALL" ||
              String(row.status).toUpperCase() === statusFilter),
        )
        .sort((a, b) => {
          const left = a[sort] ?? 0,
            right = b[sort] ?? 0;
          const result =
            typeof left === "string"
              ? left.localeCompare(String(right))
              : Number(left) - Number(right);
          return descending ? -result : result;
        }),
    [enriched, search, statusFilter, sort, descending],
  );
  const paged = filtered.slice(page * PAGE_SIZE, (page + 1) * PAGE_SIZE);
  const pages = Math.max(1, Math.ceil(filtered.length / PAGE_SIZE));
  const totals = useMemo<Row>(
    () =>
      enriched.reduce(
        (sum: Row, row) => ({
          spend: sum.spend + Number(row.spend || 0),
          impressions: sum.impressions + Number(row.impressions || 0),
          clicks: sum.clicks + Number(row.clicks || 0),
          orders: sum.orders + Number(row.orders || 0),
          delivered: sum.delivered + Number(row.delivered || 0),
          revenue: sum.revenue + Number(row.revenue || 0),
          net_profit: sum.net_profit + Number(row.net_profit || 0),
        }),
        {
          spend: 0,
          impressions: 0,
          clicks: 0,
          orders: 0,
          delivered: 0,
          revenue: 0,
          net_profit: 0,
        },
      ),
    [enriched],
  );

  const sync = async () => {
    setBusy(true);
    try {
      const result = await metaAdsService.sync({
        since,
        until,
        ad_account_id: accountId,
      });
      toast.success(
        `Synced ${result.campaigns ?? 0} campaigns, ${result.adsets ?? 0} ad sets and ${result.ads ?? 0} ads.`,
      );
      await loadStatus();
      await loadData();
    } catch (syncError) {
      toast.error(
        syncError instanceof Error ? syncError.message : "Sync failed",
      );
    } finally {
      setBusy(false);
    }
  };
  const bulkAction = async (
    operation: "set_status" | "set_budget" | "duplicate",
    desired?: string | number,
  ) => {
    if (!["campaigns", "adsets", "ads"].includes(tab) || !selected.size) return;
    setBusy(true);
    try {
      const entityType = tab === "adsets" ? "adset" : tab.slice(0, -1);
      const items = [...selected].map((id) => ({
        entity_id: id,
        entity_type: entityType,
        operation,
        ...(operation === "set_status" ? { status: desired } : {}),
        ...(operation === "set_budget" ? { daily_budget: desired } : {}),
      }));
      const result = await metaAdsService.bulk({
        action: "enqueue",
        job_type: operation === "duplicate" ? "duplicate" : "bulk_edit",
        idempotency_key: `ui:${crypto.randomUUID()}`,
        ad_account_id: accountId,
        configuration: { create_status: "PAUSED" },
        items,
      });
      toast.success(
        `Bulk job queued (${result.job?.total_items ?? items.length} items).`,
      );
      setSelected(new Set());
      if (operation === "set_budget") setBulkBudget("");
      await loadData();
    } catch (actionError) {
      toast.error(
        actionError instanceof Error
          ? actionError.message
          : "Bulk action failed",
      );
    } finally {
      setBusy(false);
    }
  };

  if (isDemoMode)
    return (
      <div className="space-y-5">
        <PageHeader
          title="Meta Ads Manager"
          subtitle="Connect a live workspace to use Meta management."
        />
        <EmptyState
          title="Not available in demo mode"
          description="Meta write operations and OAuth are disabled for demo sessions."
        />
      </div>
    );
  const connected = [
    "connected",
    "syncing",
    "sync_failed",
    "permission_required",
  ].includes(connection?.state ?? "");
  if (!loading && !connected)
    return (
      <div className="space-y-5">
        <PageHeader
          title="Meta Ads Manager"
          subtitle="Campaign operations, creative launches, scaling and automation."
        />
        <div className="rounded-3xl border border-base-border bg-base-surface p-10 text-center">
          <Shield className="mx-auto text-brand" size={34} />
          <h2 className="mt-4 text-xl font-semibold text-ink">
            Connect Meta securely
          </h2>
          <p className="mx-auto mt-2 max-w-lg text-sm text-ink-muted">
            Use Meta OAuth to import your businesses, ad accounts, Pages,
            Instagram accounts and pixels. Access tokens never enter the
            browser.
          </p>
          <button
            onClick={() =>
              metaAdsService.connect(`${window.location.origin}/ads-manager`)
            }
            className="mt-6 rounded-xl bg-brand px-5 py-2.5 text-sm font-semibold text-white"
          >
            Connect with Meta
          </button>
        </div>
      </div>
    );

  return (
    <div className="space-y-5">
      <PageHeader
        title="Meta Ads Manager"
        subtitle="Manage, launch and automate Meta advertising with exact-only COD attribution."
        action={
          <button
            onClick={sync}
            disabled={busy}
            className="inline-flex items-center gap-2 rounded-xl bg-brand px-3.5 py-2 text-[13px] font-semibold text-white disabled:opacity-60"
          >
            <RefreshCw size={14} className={busy ? "animate-spin" : ""} /> Sync
            now
          </button>
        }
      />
      <div className="grid gap-3 rounded-2xl border border-base-border bg-base-surface p-4 xl:grid-cols-[minmax(240px,1fr)_minmax(180px,1fr)_auto_auto_auto]">
        <label>
          <span className="mb-1 block text-[11px] font-semibold uppercase tracking-wide text-ink-faint">
            Ad account (temporary)
          </span>
          <select
            value={accountId}
            onChange={(event) => setAccountId(event.target.value)}
            className="w-full rounded-xl border border-base-border bg-base-raised px-3 py-2 text-[13px] text-ink"
          >
            {connection?.ad_accounts.map((account) => (
              <option key={account.id} value={account.id}>
                {account.name || account.id} · {account.currency} ·{" "}
                {account.timezone}
              </option>
            ))}
          </select>
        </label>
        <label>
          <span className="mb-1 block text-[11px] font-semibold uppercase tracking-wide text-ink-faint">
            Facebook Page (temporary)
          </span>
          <select
            value={pageId}
            onChange={(event) => setPageId(event.target.value)}
            className="w-full rounded-xl border border-base-border bg-base-raised px-3 py-2 text-[13px] text-ink"
          >
            <option value="">Select Page</option>
            {connection?.pages.map((pageAsset) => (
              <option key={pageAsset.id} value={pageAsset.id}>
                {pageAsset.name || pageAsset.id}
              </option>
            ))}
          </select>
        </label>
        <DateField label="From" value={since} onChange={setSince} />
        <DateField label="To" value={until} onChange={setUntil} />
        <div className="flex items-end">
          <button
            onClick={() =>
              void metaAdsService
                .setDefault("ad_account", accountId)
                .then(() => {
                  toast.success("Default ad account updated.");
                  return loadStatus();
                })
            }
            className="h-[38px] rounded-xl border border-base-border px-3 text-[12px] font-semibold text-ink"
          >
            Make account default
          </button>
        </div>
      </div>
      <div className="-mx-2 overflow-x-auto px-2 [scrollbar-width:none]">
        <div className="inline-flex min-w-max gap-1 rounded-xl border border-base-border bg-base-surface p-1">
          {TABS.map((item) => (
            <button
              key={item.id}
              onClick={() => setTab(item.id)}
              className={`rounded-lg px-3 py-2 text-[12.5px] font-semibold ${tab === item.id ? "bg-brand text-white" : "text-ink-muted hover:bg-base-raised hover:text-ink"}`}
            >
              {item.label}
            </button>
          ))}
        </div>
      </div>
      {error && (
        <div className="flex items-center gap-2 rounded-xl border border-danger/20 bg-danger/10 px-4 py-3 text-sm text-danger">
          <AlertCircle size={16} /> {error}
        </div>
      )}
      {tab === "overview" && (
        <Overview
          totals={totals}
          currency={currency}
          connection={connection}
          onAutomation={(enabled) =>
            void metaAdsService.setAutomation(enabled).then(loadStatus)
          }
        />
      )}
      {["campaigns", "adsets", "ads"].includes(tab) && (
        <EntityTable
          tab={tab as EntityTab}
          rows={paged}
          selected={selected}
          setSelected={setSelected}
          columns={columns}
          currency={currency}
          sort={sort}
          descending={descending}
          onSort={(column) => {
            setSort(column);
            setDescending(sort === column ? !descending : true);
          }}
          onEdit={(row) => setEditor({ tab: tab as EntityTab, row })}
          loading={loading}
        />
      )}
      {tab === "creatives" && <CreativeGrid rows={paged} />}
      {tab === "products" && (
        <ProductsView rows={enriched} currency={currency} />
      )}
      {tab === "bulk" && (
        <BulkLauncher
          accountId={accountId}
          pageId={pageId}
          connection={connection!}
          workspaceId={workspace!.id}
          initialConfiguration={workflowDraft}
        />
      )}
      {tab === "workflows" && (
        <Workflows
          onUse={(workflow) => {
            setWorkflowDraft({
              ...(workflow.configuration ?? {}),
              _workflow_id: workflow.id,
            });
            setTab("bulk");
          }}
        />
      )}
      {tab === "scaling" && <ScalingCenter accountId={accountId} />}
      {tab === "rules" && (
        <RulesCenter connection={connection!} onConnection={loadStatus} />
      )}
      {tab === "activity" && <ActivityView />}
      {["campaigns", "adsets", "ads", "creatives"].includes(tab) && (
        <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          <div className="flex flex-wrap items-center gap-2">
            <button
              onClick={() => setEditor({ tab: tab as EntityTab })}
              className="inline-flex items-center gap-1.5 rounded-lg bg-brand px-3 py-2 text-[12px] font-semibold text-white"
            >
              <Plus size={13} /> Create
            </button>
            {tab !== "creatives" && selected.size > 0 && (
              <>
                <button
                  onClick={() => bulkAction("set_status", "PAUSED")}
                  className="inline-flex items-center gap-1 rounded-lg border border-base-border px-3 py-2 text-[12px] text-ink"
                >
                  <Pause size={12} /> Pause {selected.size}
                </button>
                <button
                  onClick={() => bulkAction("set_status", "ACTIVE")}
                  className="inline-flex items-center gap-1 rounded-lg border border-base-border px-3 py-2 text-[12px] text-ink"
                >
                  <Play size={12} /> Activate
                </button>
                <button
                  onClick={() => bulkAction("duplicate", "PAUSED")}
                  className="inline-flex items-center gap-1 rounded-lg border border-base-border px-3 py-2 text-[12px] text-ink"
                >
                  <Copy size={12} /> Duplicate paused
                </button>
                {["campaigns", "adsets"].includes(tab) && (
                  <>
                    <input
                      type="number"
                      min="1"
                      step="0.01"
                      value={bulkBudget}
                      onChange={(event) => setBulkBudget(event.target.value)}
                      aria-label="Bulk daily budget"
                      placeholder={`Daily budget (${currency})`}
                      className="w-40 rounded-lg border border-base-border bg-base-surface px-3 py-2 text-[12px] text-ink outline-none focus:border-brand"
                    />
                    <button
                      disabled={
                        !Number.isFinite(Number(bulkBudget)) ||
                        Number(bulkBudget) < 1
                      }
                      onClick={() =>
                        bulkAction("set_budget", Number(bulkBudget))
                      }
                      className="inline-flex items-center gap-1 rounded-lg border border-base-border px-3 py-2 text-[12px] text-ink disabled:cursor-not-allowed disabled:opacity-50"
                    >
                      Set budget
                    </button>
                  </>
                )}
              </>
            )}
          </div>
          <div className="flex items-center gap-2">
            <div className="relative">
              <button
                onClick={() => setShowColumns(!showColumns)}
                className="inline-flex items-center gap-1 rounded-lg border border-base-border px-3 py-2 text-[12px] text-ink"
              >
                <Settings size={12} /> Columns
              </button>
              {showColumns && (
                <div className="absolute bottom-11 right-0 z-20 grid w-64 grid-cols-2 gap-2 rounded-xl border border-base-border bg-base-surface p-3 shadow-xl">
                  {METRIC_COLUMNS.map((column) => (
                    <label
                      key={column}
                      className="flex items-center gap-2 text-[11px] text-ink"
                    >
                      <input
                        type="checkbox"
                        checked={columns.has(column)}
                        onChange={() =>
                          setColumns((current) => {
                            const next = new Set(current);
                            next.has(column)
                              ? next.delete(column)
                              : next.add(column);
                            return next;
                          })
                        }
                      />{" "}
                      {column.replace(/_/g, " ")}
                    </label>
                  ))}
                </div>
              )}
            </div>
            <button
              disabled={page === 0}
              onClick={() => setPage((value) => value - 1)}
              className="rounded-lg border border-base-border p-2 disabled:opacity-40"
            >
              <ChevronLeft size={14} />
            </button>
            <span className="text-[12px] text-ink-muted">
              {page + 1} / {pages}
            </span>
            <button
              disabled={page + 1 >= pages}
              onClick={() => setPage((value) => value + 1)}
              className="rounded-lg border border-base-border p-2 disabled:opacity-40"
            >
              <ChevronRight size={14} />
            </button>
          </div>
        </div>
      )}
      {["campaigns", "adsets", "ads", "creatives"].includes(tab) && (
        <div className="flex flex-wrap gap-2 rounded-xl border border-base-border bg-base-surface p-3">
          <div className="relative flex-1 min-w-[220px]">
            <Search
              className="absolute left-3 top-2.5 text-ink-faint"
              size={14}
            />
            <input
              value={search}
              onChange={(event) => setSearch(event.target.value)}
              placeholder="Search by name"
              className="w-full rounded-lg border border-base-border bg-base-raised py-2 pl-9 pr-3 text-[12.5px] text-ink"
            />
          </div>
          <select
            value={statusFilter}
            onChange={(event) => setStatusFilter(event.target.value)}
            className="rounded-lg border border-base-border bg-base-raised px-3 text-[12px] text-ink"
          >
            <option>ALL</option>
            <option>ACTIVE</option>
            <option>PAUSED</option>
            <option>ARCHIVED</option>
          </select>
          <span className="inline-flex items-center gap-1 px-2 text-[11px] text-ink-muted">
            <Filter size={12} /> {filtered.length} results
          </span>
        </div>
      )}
      {editor && (
        <EntityEditor
          mode={editor}
          accountId={accountId}
          pageId={pageId}
          workspaceId={workspace!.id}
          onClose={() => setEditor(null)}
          onSaved={async () => {
            setEditor(null);
            await loadData();
          }}
          connection={connection!}
        />
      )}
    </div>
  );
}

function DateField({
  label,
  value,
  onChange,
}: {
  label: string;
  value: string;
  onChange: (value: string) => void;
}) {
  return (
    <label>
      <span className="mb-1 block text-[11px] font-semibold uppercase tracking-wide text-ink-faint">
        {label}
      </span>
      <input
        type="date"
        value={value}
        onChange={(event) => onChange(event.target.value)}
        className="rounded-xl border border-base-border bg-base-raised px-3 py-2 text-[13px] text-ink"
      />
    </label>
  );
}

function Overview({
  totals,
  currency,
  connection,
  onAutomation,
}: {
  totals: Row;
  currency: string;
  connection: MetaConnectionStatus | null;
  onAutomation: (enabled: boolean) => void;
}) {
  const cards = [
    ["Spend", `${currency} ${fmt(totals.spend)}`],
    ["Impressions", fmt(totals.impressions, 0)],
    ["Clicks", fmt(totals.clicks, 0)],
    ["Orders", fmt(totals.orders, 0)],
    ["Delivered", fmt(totals.delivered, 0)],
    ["Net profit", `${currency} ${fmt(totals.net_profit)}`],
    [
      "Real ROAS",
      totals.spend ? `${fmt(totals.revenue / totals.spend)}x` : "—",
    ],
  ];
  return (
    <div className="space-y-4">
      <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-7">
        {cards.map(([label, value]) => (
          <div
            key={label}
            className="rounded-2xl border border-base-border bg-base-surface p-4"
          >
            <div className="text-[11px] uppercase tracking-wide text-ink-faint">
              {label}
            </div>
            <div className="mt-2 font-mono text-xl font-semibold text-ink">
              {value}
            </div>
          </div>
        ))}
      </div>
      <div className="grid gap-4 lg:grid-cols-2">
        <div className="rounded-2xl border border-base-border bg-base-surface p-5">
          <h3 className="font-semibold text-ink">Connection health</h3>
          <div className="mt-4 grid grid-cols-2 gap-3 text-[12px]">
            <InfoLine label="State" value={connection?.state || "Unknown"} />
            <InfoLine
              label="Last sync"
              value={
                connection?.connection?.last_successful_sync_at
                  ? new Date(
                      connection.connection.last_successful_sync_at,
                    ).toLocaleString()
                  : "Never"
              }
            />
            <InfoLine
              label="Page"
              value={
                connection?.pages.find(
                  (item) => item.id === connection.connection?.default_page_id,
                )?.name || "Not selected"
              }
            />
            <InfoLine
              label="Instagram"
              value={
                connection?.instagram_accounts.find(
                  (item) =>
                    item.id ===
                    connection.connection?.default_instagram_account_id,
                )?.username || "Optional"
              }
            />
          </div>
        </div>
        <div className="rounded-2xl border border-base-border bg-base-surface p-5">
          <h3 className="font-semibold text-ink">Automation safety</h3>
          <p className="mt-2 text-[12px] text-ink-muted">
            The global kill switch gates every live rule action. Dry runs remain
            available while disabled.
          </p>
          <button
            onClick={() =>
              onAutomation(!connection?.connection?.automation_enabled)
            }
            className={`mt-4 rounded-xl px-4 py-2 text-[12px] font-semibold ${connection?.connection?.automation_enabled ? "bg-danger/10 text-danger" : "bg-brand text-white"}`}
          >
            {connection?.connection?.automation_enabled
              ? "Disable all automation"
              : "Enable automation"}
          </button>
        </div>
      </div>
    </div>
  );
}
function InfoLine({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-xl bg-base-raised p-3">
      <div className="text-ink-faint">{label}</div>
      <div className="mt-1 truncate font-semibold text-ink">{value}</div>
    </div>
  );
}

function EntityTable({
  tab,
  rows,
  selected,
  setSelected,
  columns,
  currency,
  sort,
  descending,
  onSort,
  onEdit,
  loading,
}: {
  tab: EntityTab;
  rows: Row[];
  selected: Set<string>;
  setSelected: (value: Set<string>) => void;
  columns: Set<string>;
  currency: string;
  sort: string;
  descending: boolean;
  onSort: (column: string) => void;
  onEdit: (row: Row) => void;
  loading: boolean;
}) {
  const toggle = (id: string) => {
    const next = new Set(selected);
    next.has(id) ? next.delete(id) : next.add(id);
    setSelected(next);
  };
  if (loading)
    return (
      <div className="flex h-48 items-center justify-center rounded-2xl border border-base-border bg-base-surface">
        <Loader2 className="animate-spin text-brand" />
      </div>
    );
  if (!rows.length)
    return (
      <EmptyState
        title={`No ${tab}`}
        description="Run a sync or create your first Meta object."
      />
    );
  return (
    <div className="overflow-x-auto rounded-2xl border border-base-border bg-base-surface">
      <table className="min-w-max w-full text-left">
        <thead>
          <tr className="border-b border-base-border bg-base-raised/60">
            <th className="p-3">
              <input
                type="checkbox"
                checked={rows.every((row) => selected.has(entityId(tab, row)))}
                onChange={() =>
                  setSelected(
                    rows.every((row) => selected.has(entityId(tab, row)))
                      ? new Set()
                      : new Set(rows.map((row) => entityId(tab, row))),
                  )
                }
              />
            </th>
            <Sortable
              label="Name"
              column="name"
              {...{ sort, descending, onSort }}
            />
            <th className="px-3 py-3 text-[11px] text-ink-muted">Status</th>
            <th className="px-3 py-3 text-[11px] text-ink-muted">Budget</th>
            {METRIC_COLUMNS.filter((column) => columns.has(column)).map(
              (column) => (
                <Sortable
                  key={column}
                  label={column.replace(/_/g, " ")}
                  column={column}
                  {...{ sort, descending, onSort }}
                  right
                />
              ),
            )}
            <th />
          </tr>
        </thead>
        <tbody>
          {rows.map((row) => {
            const id = entityId(tab, row);
            return (
              <tr
                key={id}
                className="border-b border-base-border/70 last:border-0 hover:bg-base-raised/30"
              >
                <td className="p-3">
                  <input
                    type="checkbox"
                    checked={selected.has(id)}
                    onChange={() => toggle(id)}
                  />
                </td>
                <td className="max-w-[320px] px-3 py-3">
                  <div className="truncate text-[12.5px] font-semibold text-ink">
                    {rowName(row)}
                  </div>
                  <div className="truncate font-mono text-[10px] text-ink-faint">
                    {id}
                  </div>
                </td>
                <td className="px-3">
                  <span
                    className={`rounded-full border px-2 py-1 text-[10px] font-semibold ${statusClass(String(row.status || "UNKNOWN"))}`}
                  >
                    {row.status || "UNKNOWN"}
                  </span>
                </td>
                <td className="px-3 text-right font-mono text-[11px] text-ink">
                  {row.daily_budget || row.budget
                    ? `${currency} ${fmt(row.daily_budget || row.budget)}`
                    : "—"}
                </td>
                {METRIC_COLUMNS.filter((column) => columns.has(column)).map(
                  (column) => (
                    <td
                      key={column}
                      className="px-3 py-3 text-right font-mono text-[11px] text-ink"
                    >
                      {metricValue(row, column, currency)}
                    </td>
                  ),
                )}
                <td className="px-3">
                  <button
                    onClick={() => onEdit(row)}
                    className="rounded-lg border border-base-border px-2 py-1 text-[10px] text-ink"
                  >
                    Edit
                  </button>
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}
function Sortable({
  label,
  column,
  sort,
  descending,
  onSort,
  right = false,
}: {
  label: string;
  column: string;
  sort: string;
  descending: boolean;
  onSort: (column: string) => void;
  right?: boolean;
}) {
  return (
    <th
      onClick={() => onSort(column)}
      className={`cursor-pointer px-3 py-3 text-[11px] font-semibold capitalize text-ink-muted ${right ? "text-right" : ""}`}
    >
      {label}
      {sort === column ? (descending ? " ↓" : " ↑") : ""}
    </th>
  );
}
function metricValue(row: Row, column: string, currency: string) {
  const value = row[column];
  if (value == null) return "—";
  if (
    [
      "spend",
      "cpc",
      "cpm",
      "revenue",
      "net_profit",
      "cpa",
      "cost_delivered",
    ].includes(column)
  )
    return `${currency} ${fmt(Number(value))}`;
  if (["ctr", "delivery_rate"].includes(column))
    return `${fmt(Number(value))}%`;
  if (column === "real_roas") return `${fmt(Number(value))}x`;
  return fmt(
    Number(value),
    [
      "reach",
      "impressions",
      "clicks",
      "orders",
      "confirmed",
      "shipped",
      "delivered",
      "returned",
    ].includes(column)
      ? 0
      : 2,
  );
}

function CreativeGrid({ rows }: { rows: Row[] }) {
  if (!rows.length)
    return (
      <EmptyState
        title="No creatives"
        description="Sync existing creatives or create a new image/video creative."
      />
    );
  return (
    <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
      {rows.map((row) => (
        <article
          key={row.meta_creative_id}
          className="overflow-hidden rounded-2xl border border-base-border bg-base-surface"
        >
          <div className="aspect-video bg-base-raised">
            {row.video_id ? (
              <video
                src={row.thumbnail_url || undefined}
                poster={row.thumbnail_url || undefined}
                className="h-full w-full object-cover"
                controls={false}
              />
            ) : row.image_url || row.thumbnail_url ? (
              <img
                src={row.image_url || row.thumbnail_url}
                alt=""
                className="h-full w-full object-cover"
              />
            ) : (
              <div className="flex h-full items-center justify-center text-ink-faint">
                <BarChart2 />
              </div>
            )}
          </div>
          <div className="space-y-2 p-4">
            <div className="truncate text-[13px] font-semibold text-ink">
              {rowName(row)}
            </div>
            <p className="line-clamp-2 text-[11px] text-ink-muted">
              {row.primary_text || "No primary text"}
            </p>
            <div className="flex gap-2">
              {row.destination_url && (
                <>
                  <a
                    href={row.destination_url}
                    target="_blank"
                    rel="noreferrer"
                    className="inline-flex items-center gap-1 text-[11px] text-brand"
                  >
                    <ExternalLink size={11} /> Open
                  </a>
                  <button
                    onClick={() =>
                      void navigator.clipboard.writeText(row.destination_url)
                    }
                    className="inline-flex items-center gap-1 text-[11px] text-ink-muted"
                  >
                    <Copy size={11} /> Copy
                  </button>
                </>
              )}
            </div>
          </div>
        </article>
      ))}
    </div>
  );
}

function ProductsView({ rows, currency }: { rows: Row[]; currency: string }) {
  const grouped = new Map<string, Row>();
  for (const row of rows) {
    const key = row.destination_url || row.product_id;
    if (!key) continue;
    const current = grouped.get(key) ?? {
      key,
      ads: 0,
      spend: 0,
      orders: 0,
      delivered: 0,
      revenue: 0,
      net_profit: 0,
    };
    current.ads += 1;
    current.spend += Number(row.spend || 0);
    current.orders += Number(row.orders || 0);
    current.delivered += Number(row.delivered || 0);
    current.revenue += Number(row.revenue || 0);
    current.net_profit += Number(row.net_profit || 0);
    grouped.set(key, current);
  }
  return (
    <div className="rounded-2xl border border-base-border bg-base-surface p-5">
      <h3 className="font-semibold text-ink">
        Product & landing-page performance
      </h3>
      <p className="mt-1 text-[12px] text-ink-muted">
        Only orders with exact provider IDs or an unambiguous UTM campaign match
        are attributed.
      </p>
      <div className="mt-4 space-y-2">
        {[...grouped.values()].map((item) => (
          <div
            key={item.key}
            className="grid gap-3 rounded-xl bg-base-raised p-3 text-[12px] sm:grid-cols-[1fr_repeat(6,auto)]"
          >
            <div className="min-w-0 truncate text-brand">{item.key}</div>
            <span>{item.ads} ads</span>
            <span>
              {currency} {fmt(item.spend)}
            </span>
            <span>{item.orders} orders</span>
            <span>{item.delivered} delivered</span>
            <span>
              {currency} {fmt(item.net_profit)} profit
            </span>
            <span>
              {item.spend ? fmt(item.revenue / item.spend) : "—"}x ROAS
            </span>
          </div>
        ))}
        {!grouped.size && (
          <div className="py-8 text-center text-sm text-ink-muted">
            No reliable product or landing-page attribution is available yet.
          </div>
        )}
      </div>
    </div>
  );
}

function EntityEditor({
  mode,
  accountId,
  pageId,
  workspaceId,
  onClose,
  onSaved,
  connection,
}: {
  mode: { tab: EntityTab; row?: Row };
  accountId: string;
  pageId: string;
  workspaceId: string;
  onClose: () => void;
  onSaved: () => void;
  connection: MetaConnectionStatus;
}) {
  const [form, setForm] = useState<Row>({
    name: rowName(mode.row ?? {}),
    status: mode.row?.status || "PAUSED",
    objective: mode.row?.objective || "OUTCOME_SALES",
    daily_budget: mode.row ? (mode.row.daily_budget ?? "") : 10,
    campaign_id: mode.row?.meta_campaign_id || "",
    adset_id: mode.row?.meta_adset_id || "",
    creative_id: mode.row?.meta_creative_id || "",
    page_id: pageId || connection.connection?.default_page_id || "",
    instagram_account_id:
      connection.connection?.default_instagram_account_id || "",
    pixel_id: connection.connection?.default_pixel_id || "",
    destination_url: mode.row?.destination_url || "",
    primary_text: mode.row?.primary_text || "",
    headline: mode.row?.headline || "",
    description: mode.row?.description || "",
    call_to_action: mode.row?.call_to_action || "SHOP_NOW",
    image_hash: mode.row?.image_hash || "",
    video_id: mode.row?.video_id || "",
    countries: "MA",
  });
  const [busy, setBusy] = useState(false);
  const [creativeFile, setCreativeFile] = useState<File | null>(null);
  const set = (key: string, value: unknown) =>
    setForm((current) => ({ ...current, [key]: value }));
  const submit = async (event: FormEvent) => {
    event.preventDefault();
    setBusy(true);
    try {
      let payload =
        mode.tab === "adsets"
          ? {
              ...form,
              targeting: {
                geo_locations: {
                  countries: String(form.countries)
                    .split(",")
                    .map((v) => v.trim().toUpperCase())
                    .filter(Boolean),
                },
              },
            }
          : { ...form };
      if (!mode.row && mode.tab === "creatives" && creativeFile) {
        const [uploaded] = await uploadMetaCreativeFiles(workspaceId, [
          creativeFile,
        ]);
        const media = await metaAdsService.manage("upload_creative", {
          ad_account_id: accountId,
          payload: { ...uploaded, filename: creativeFile.name },
        });
        payload = {
          ...payload,
          ...(uploaded.media_type === "video"
            ? { video_id: media.id }
            : { image_hash: media.hash }),
        };
      }
      if (mode.row) {
        const updatePayload =
          mode.tab === "ads"
            ? { name: form.name, status: form.status }
            : {
                name: form.name,
                status: form.status,
                ...(form.daily_budget !== ""
                  ? { daily_budget: form.daily_budget }
                  : {}),
              };
        await metaAdsService.manage("update", {
          entity_type: mode.tab === "adsets" ? "adset" : mode.tab.slice(0, -1),
          entity_id: entityId(mode.tab, mode.row),
          ad_account_id: accountId,
          payload: updatePayload,
        });
      } else {
        const action = `create_${mode.tab === "adsets" ? "adset" : mode.tab.slice(0, -1)}`;
        await metaAdsService.manage(action, {
          ad_account_id: accountId,
          payload,
        });
      }
      toast.success(
        `${mode.tab.slice(0, -1)} saved after Meta confirmed the change.`,
      );
      onSaved();
    } catch (error) {
      toast.error(
        error instanceof Error ? error.message : "Meta rejected the change",
      );
    } finally {
      setBusy(false);
    }
  };
  return (
    <Modal
      title={`${mode.row ? "Edit" : "Create"} ${mode.tab.slice(0, -1)}`}
      onClose={onClose}
    >
      <form onSubmit={submit} className="space-y-3">
        <Field
          label="Name"
          value={form.name}
          onChange={(v) => set("name", v)}
          required
        />
        {!mode.row && mode.tab === "campaigns" && (
          <Field
            label="Objective"
            value={form.objective}
            onChange={(v) => set("objective", v)}
          />
        )}
        {["campaigns", "adsets"].includes(mode.tab) && (
          <Field
            label="Daily budget"
            value={form.daily_budget}
            type="number"
            onChange={(v) => set("daily_budget", Number(v))}
          />
        )}
        {!mode.row && mode.tab === "adsets" && (
          <>
            <Field
              label="Campaign ID"
              value={form.campaign_id}
              onChange={(v) => set("campaign_id", v)}
              required
            />
            <Field
              label="Countries (comma separated)"
              value={form.countries}
              onChange={(v) => set("countries", v)}
            />
            <Field
              label="Pixel ID"
              value={form.pixel_id}
              onChange={(v) => set("pixel_id", v)}
            />
          </>
        )}
        {!mode.row && mode.tab === "creatives" && (
          <>
            <label className="flex cursor-pointer items-center justify-center gap-2 rounded-xl border border-dashed border-brand/40 bg-brand/5 p-4 text-sm font-semibold text-brand">
              <Upload size={16} /> {creativeFile?.name || "Upload image/video"}
              <input
                type="file"
                accept="image/*,video/*"
                className="hidden"
                onChange={(e) => setCreativeFile(e.target.files?.[0] ?? null)}
              />
            </label>
            <div className="text-center text-[10px] text-ink-faint">
              or use an existing Meta media ID
            </div>
            <Field
              label="Image hash"
              value={form.image_hash}
              onChange={(v) => set("image_hash", v)}
            />
            <Field
              label="Video ID"
              value={form.video_id}
              onChange={(v) => set("video_id", v)}
            />
            <SelectField
              label="Facebook Page"
              value={form.page_id}
              options={connection.pages.map((asset) => asset.id)}
              onChange={(v) => set("page_id", v)}
            />
            <SelectField
              label="Instagram account (optional)"
              value={form.instagram_account_id}
              options={[
                "",
                ...connection.instagram_accounts.map((asset) => asset.id),
              ]}
              onChange={(v) => set("instagram_account_id", v)}
            />
            <Field
              label="Destination URL"
              value={form.destination_url}
              onChange={(v) => set("destination_url", v)}
              required
            />
            <Field
              label="Primary text"
              value={form.primary_text}
              onChange={(v) => set("primary_text", v)}
            />
            <Field
              label="Headline"
              value={form.headline}
              onChange={(v) => set("headline", v)}
            />
            <Field
              label="Description"
              value={form.description}
              onChange={(v) => set("description", v)}
            />
          </>
        )}
        {!mode.row && mode.tab === "ads" && (
          <>
            <Field
              label="Ad Set ID"
              value={form.adset_id}
              onChange={(v) => set("adset_id", v)}
              required
            />
            <Field
              label="Creative ID"
              value={form.creative_id}
              onChange={(v) => set("creative_id", v)}
              required
            />
          </>
        )}
        <label className="block">
          <span className="mb-1 block text-[11px] text-ink-muted">
            Publish status
          </span>
          <select
            value={form.status}
            onChange={(e) => set("status", e.target.value)}
            className="w-full rounded-xl border border-base-border bg-base-raised px-3 py-2 text-sm text-ink"
          >
            <option>PAUSED</option>
            <option>ACTIVE</option>
          </select>
        </label>
        <button
          disabled={busy}
          className="inline-flex w-full items-center justify-center gap-2 rounded-xl bg-brand py-2.5 text-sm font-semibold text-white disabled:opacity-60"
        >
          {busy ? (
            <Loader2 className="animate-spin" size={14} />
          ) : (
            <Save size={14} />
          )}{" "}
          Save through Meta
        </button>
      </form>
    </Modal>
  );
}

function BulkLauncher({
  accountId,
  pageId,
  connection,
  workspaceId,
  initialConfiguration,
}: {
  accountId: string;
  pageId: string;
  connection: MetaConnectionStatus;
  workspaceId: string;
  initialConfiguration: Row | null;
}) {
  const seed = initialConfiguration ?? {};
  const seedCampaign = (seed.campaign ?? {}) as Row;
  const seedAdset = Array.isArray(seed.adsets) ? (seed.adsets[0] ?? {}) : {};
  const [files, setFiles] = useState<File[]>([]);
  const [form, setForm] = useState<Row>({
    product_name: seed.product_name || "",
    campaign_id: seedCampaign.id || "",
    campaign_name:
      seedCampaign.name ||
      seed.naming?.campaign ||
      "TEST {PRODUCT_NAME} {DATE}",
    adset_count: seed.adset_count || 3,
    selected_adset_ids: "",
    daily_budget: seedAdset.daily_budget || 10,
    distribution_mode: seed.distribution_mode || "one_per_adset",
    creatives_per_adset: seed.creatives_per_adset || 1,
    destination_url: seed.destination_url || "",
    primary_texts: Array.isArray(seed.primary_texts)
      ? seed.primary_texts.join("\n")
      : "",
    headlines: Array.isArray(seed.headlines) ? seed.headlines.join("\n") : "",
    create_status: seed.create_status || "PAUSED",
    page_id:
      seed.page_id || pageId || connection.connection?.default_page_id || "",
    instagram_account_id:
      seed.instagram_account_id ||
      connection.connection?.default_instagram_account_id ||
      "",
    pixel_id: seed.pixel_id || connection.connection?.default_pixel_id || "",
    call_to_action: seed.call_to_action || "SHOP_NOW",
  });
  const [preview, setPreview] = useState<Row | null>(null);
  const [progress, setProgress] = useState(0);
  const [busy, setBusy] = useState(false);
  const [jobs, setJobs] = useState<Row[]>([]);
  const config = (
    creatives: Row[] = files.map((file) => ({
      name: file.name,
      media_type: file.type.startsWith("video/") ? "video" : "image",
    })),
  ) => {
    const selectedAdsets = String(form.selected_adset_ids || "")
      .split(/[\s,]+/)
      .filter(Boolean);
    const adsets = selectedAdsets.length
      ? selectedAdsets.map((id) => ({
          id,
          name: `Selected ${id}`,
          daily_budget: 0,
        }))
      : Array.from({ length: Number(form.adset_count) }, (_, index) => ({
          name: `Broad {PRODUCT_NAME} {INDEX}`,
          daily_budget: Number(form.daily_budget),
          targeting: { geo_locations: { countries: ["MA"] } },
        }));
    return {
      product_name: form.product_name,
      campaign: {
        ...(form.campaign_id ? { id: form.campaign_id } : {}),
        name: form.campaign_name,
        objective: "OUTCOME_SALES",
      },
      adset_count: adsets.length,
      adsets,
      creatives,
      distribution_mode: selectedAdsets.length
        ? "selected_adsets"
        : form.distribution_mode,
      creatives_per_adset: Number(form.creatives_per_adset),
      destination_url: form.destination_url,
      primary_texts: String(form.primary_texts).split("\n").filter(Boolean),
      headlines: String(form.headlines).split("\n").filter(Boolean),
      create_status: form.create_status,
      page_id: form.page_id,
      instagram_account_id: form.instagram_account_id,
      pixel_id: form.pixel_id,
      call_to_action: form.call_to_action,
      naming: {
        campaign: form.campaign_name,
        adset: "Broad {PRODUCT_NAME} {INDEX}",
        ad: "{PRODUCT_NAME} {CREATIVE_NAME} {INDEX}",
        creative: "{CREATIVE_NAME} {INDEX}",
      },
    };
  };
  const getPreview = async () => {
    try {
      const result = await metaAdsService.bulk({
        action: "preview",
        configuration: config(),
      });
      setPreview(result.preview);
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Preview failed");
    }
  };
  const loadJobs = useCallback(async () => {
    const { data, error } = await supabase
      .from("meta_bulk_jobs")
      .select(
        "id,job_type,status,total_items,processed_items,succeeded_items,failed_items,checkpoint,last_error,created_at,completed_at",
      )
      .eq("workspace_id", workspaceId)
      .eq("ad_account_id", accountId)
      .order("created_at", { ascending: false })
      .limit(12);
    if (!error) setJobs(data ?? []);
  }, [workspaceId, accountId]);
  useEffect(() => {
    void loadJobs();
    const timer = window.setInterval(() => void loadJobs(), 5000);
    return () => window.clearInterval(timer);
  }, [loadJobs]);
  const jobAction = async (
    action: "cancel" | "retry_failed",
    jobId: string,
  ) => {
    try {
      await metaAdsService.bulk({ action, job_id: jobId });
      toast.success(
        action === "cancel" ? "Bulk job cancelled." : "Failed items requeued.",
      );
      await loadJobs();
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Job action failed");
    }
  };
  const launch = async () => {
    if (!preview) return;
    setBusy(true);
    try {
      const uploaded = await uploadMetaCreativeFiles(
        workspaceId,
        files,
        (done, total) => setProgress(Math.round((done / total) * 100)),
      );
      const result = await metaAdsService.bulk({
        action: "enqueue",
        job_type: "bulk_launch",
        idempotency_key: `launch:${crypto.randomUUID()}`,
        ad_account_id: accountId,
        configuration: config(uploaded),
        workflow_id: form._workflow_id || seed._workflow_id || undefined,
      });
      toast.success(
        `Launch job queued. ${result.job?.succeeded_items ?? 0} ads already created; the worker will resume the rest.`,
      );
      setFiles([]);
      setPreview(null);
      await loadJobs();
    } catch (error) {
      toast.error(
        error instanceof Error ? error.message : "Bulk launch failed",
      );
    } finally {
      setBusy(false);
    }
  };
  return (
    <div className="grid gap-4 xl:grid-cols-[1fr_360px]">
      <div className="space-y-4 rounded-2xl border border-base-border bg-base-surface p-5">
        <div>
          <h3 className="font-semibold text-ink">Bulk creative launcher</h3>
          <p className="mt-1 text-[12px] text-ink-muted">
            Upload up to 1000 images/videos once. A durable backend job creates
            paused Meta objects with checkpointing and retries.
          </p>
        </div>
        <div className="grid gap-3 sm:grid-cols-2">
          <Field
            label="Product name"
            value={form.product_name}
            onChange={(v) => setForm({ ...form, product_name: v })}
          />
          <Field
            label="Campaign naming template"
            value={form.campaign_name}
            onChange={(v) => setForm({ ...form, campaign_name: v })}
          />
          <Field
            label="Existing campaign ID (optional)"
            value={form.campaign_id}
            onChange={(v) => setForm({ ...form, campaign_id: v })}
          />
          <Field
            label="Selected ad set IDs (optional)"
            value={form.selected_adset_ids}
            onChange={(v) => setForm({ ...form, selected_adset_ids: v })}
          />
          <Field
            label="Ad set count"
            type="number"
            value={form.adset_count}
            onChange={(v) => setForm({ ...form, adset_count: Number(v) })}
          />
          <Field
            label="Daily budget / new ad set"
            type="number"
            value={form.daily_budget}
            onChange={(v) => setForm({ ...form, daily_budget: Number(v) })}
          />
          <Field
            label="Destination / product URL"
            value={form.destination_url}
            onChange={(v) => setForm({ ...form, destination_url: v })}
          />
          <SelectField
            label="CTA"
            value={form.call_to_action}
            options={[
              "SHOP_NOW",
              "LEARN_MORE",
              "SIGN_UP",
              "CONTACT_US",
              "GET_OFFER",
            ]}
            onChange={(v) => setForm({ ...form, call_to_action: v })}
          />
          <label>
            <span className="mb-1 block text-[11px] text-ink-muted">
              Distribution
            </span>
            <select
              value={form.distribution_mode}
              onChange={(e) =>
                setForm({ ...form, distribution_mode: e.target.value })
              }
              className="w-full rounded-xl border border-base-border bg-base-raised px-3 py-2 text-sm text-ink"
            >
              <option value="one_per_adset">1 creative / ad set</option>
              <option value="n_per_adset">N creatives / ad set</option>
              <option value="round_robin">Round robin</option>
              <option value="selected_adsets">
                All creatives to selected ad sets
              </option>
              <option value="combinations">
                All text/headline combinations
              </option>
            </select>
          </label>
          <Field
            label="Creatives per ad set"
            type="number"
            value={form.creatives_per_adset}
            onChange={(v) =>
              setForm({ ...form, creatives_per_adset: Number(v) })
            }
          />
          <label>
            <span className="mb-1 block text-[11px] text-ink-muted">
              Facebook Page
            </span>
            <select
              value={form.page_id}
              onChange={(event) =>
                setForm({ ...form, page_id: event.target.value })
              }
              className="w-full rounded-xl border border-base-border bg-base-raised px-3 py-2 text-sm text-ink"
            >
              <option value="">Select Page</option>
              {connection.pages.map((asset) => (
                <option key={asset.id} value={asset.id}>
                  {asset.name || asset.id}
                </option>
              ))}
            </select>
          </label>
          <label>
            <span className="mb-1 block text-[11px] text-ink-muted">
              Instagram (optional)
            </span>
            <select
              value={form.instagram_account_id}
              onChange={(event) =>
                setForm({ ...form, instagram_account_id: event.target.value })
              }
              className="w-full rounded-xl border border-base-border bg-base-raised px-3 py-2 text-sm text-ink"
            >
              <option value="">None</option>
              {connection.instagram_accounts.map((asset) => (
                <option key={asset.id} value={asset.id}>
                  {asset.username || asset.name || asset.id}
                </option>
              ))}
            </select>
          </label>
          <label>
            <span className="mb-1 block text-[11px] text-ink-muted">
              Pixel / dataset
            </span>
            <select
              value={form.pixel_id}
              onChange={(event) =>
                setForm({ ...form, pixel_id: event.target.value })
              }
              className="w-full rounded-xl border border-base-border bg-base-raised px-3 py-2 text-sm text-ink"
            >
              <option value="">None</option>
              {connection.pixels.map((asset) => (
                <option key={asset.id} value={asset.id}>
                  {asset.name || asset.id}
                </option>
              ))}
            </select>
          </label>
          <SelectField
            label="Publish state"
            value={form.create_status}
            options={["PAUSED", "ACTIVE"]}
            onChange={(v) => setForm({ ...form, create_status: v })}
          />
        </div>
        <label className="block">
          <span className="mb-1 block text-[11px] text-ink-muted">
            Primary text variants (one per line)
          </span>
          <textarea
            value={form.primary_texts}
            onChange={(e) =>
              setForm({ ...form, primary_texts: e.target.value })
            }
            className="min-h-24 w-full rounded-xl border border-base-border bg-base-raised p-3 text-sm text-ink"
          />
        </label>
        <label className="block">
          <span className="mb-1 block text-[11px] text-ink-muted">
            Headline variants (one per line)
          </span>
          <textarea
            value={form.headlines}
            onChange={(e) => setForm({ ...form, headlines: e.target.value })}
            className="min-h-20 w-full rounded-xl border border-base-border bg-base-raised p-3 text-sm text-ink"
          />
        </label>
        <label className="flex cursor-pointer items-center justify-center gap-2 rounded-2xl border border-dashed border-brand/40 bg-brand/5 p-8 text-sm font-semibold text-brand">
          <Upload size={18} />{" "}
          {files.length
            ? `${files.length} creative files selected`
            : "Choose image/video creatives"}
          <input
            type="file"
            multiple
            accept="image/*,video/*"
            className="hidden"
            onChange={(e) => {
              const next = Array.from(e.target.files ?? []);
              if (next.length > 1000)
                toast.error("Maximum 1000 files per batch.");
              else {
                setFiles(next);
                setPreview(null);
              }
            }}
          />
        </label>
        {busy && (
          <div className="h-2 overflow-hidden rounded-full bg-base-raised">
            <div
              className="h-full bg-brand transition-all"
              style={{ width: `${progress}%` }}
            />
          </div>
        )}
      </div>
      <div className="h-fit rounded-2xl border border-base-border bg-base-surface p-5">
        <h3 className="font-semibold text-ink">Launch preview</h3>
        {preview ? (
          <div className="mt-4 space-y-2 text-[12px]">
            <InfoLine
              label="Campaigns to create"
              value={String(preview.campaign_count)}
            />
            <InfoLine
              label="Ad sets to create"
              value={String(preview.adset_count)}
            />
            <InfoLine label="Ads to create" value={String(preview.ad_count)} />
            <InfoLine
              label="Creatives"
              value={String(preview.creative_count)}
            />
            <InfoLine
              label="Maximum daily budget"
              value={`${connection.ad_accounts.find((a) => a.id === accountId)?.currency || "USD"} ${fmt(preview.max_daily_budget)}`}
            />
            <InfoLine
              label="Publish state"
              value={String(preview.create_status)}
            />
            <button
              onClick={launch}
              disabled={busy || !files.length}
              className="mt-3 inline-flex w-full items-center justify-center gap-2 rounded-xl bg-brand py-2.5 font-semibold text-white disabled:opacity-50"
            >
              <Rocket size={14} /> Launch durable job
            </button>
          </div>
        ) : (
          <button
            onClick={getPreview}
            disabled={!files.length || !form.destination_url || !form.page_id}
            className="mt-4 w-full rounded-xl bg-brand px-3 py-2.5 text-sm font-semibold text-white disabled:opacity-40"
          >
            Build full preview
          </button>
        )}
        <p className="mt-3 text-[10px] text-ink-faint">
          Safe default: new objects publish PAUSED. Active publishing must be
          selected explicitly.
        </p>
      </div>
      <div className="space-y-3 rounded-2xl border border-base-border bg-base-surface p-5 xl:col-span-2">
        <div className="flex items-center justify-between gap-3">
          <div>
            <h3 className="font-semibold text-ink">Recent durable jobs</h3>
            <p className="mt-1 text-[11px] text-ink-muted">
              Progress is checkpointed server-side; retry only requeues failed
              items.
            </p>
          </div>
          <button
            onClick={() => void loadJobs()}
            className="rounded-lg border border-base-border p-2 text-ink-muted"
            aria-label="Refresh jobs"
          >
            <RefreshCw size={13} />
          </button>
        </div>
        {jobs.map((job) => {
          const total = Number(job.total_items || 0);
          const processed = Number(job.processed_items || 0);
          const percent = total
            ? Math.min(100, Math.round((processed / total) * 100))
            : 0;
          return (
            <div
              key={job.id}
              className="rounded-xl border border-base-border bg-base-raised/40 p-3"
            >
              <div className="flex flex-wrap items-center gap-2 text-[11px]">
                <span className="font-semibold text-ink">
                  {String(job.job_type).split("_").join(" ")}
                </span>
                <span className="rounded-full bg-base-raised px-2 py-0.5 uppercase text-ink-muted">
                  {job.status}
                </span>
                <span className="ml-auto text-ink-muted">
                  {processed}/{total} · {job.succeeded_items || 0} succeeded ·{" "}
                  {job.failed_items || 0} failed
                </span>
              </div>
              <div className="mt-2 h-1.5 overflow-hidden rounded-full bg-base-raised">
                <div
                  className="h-full bg-brand transition-all"
                  style={{ width: `${percent}%` }}
                />
              </div>
              {job.last_error && (
                <p className="mt-2 text-[11px] text-danger">{job.last_error}</p>
              )}
              <div className="mt-2 flex gap-2">
                {["queued", "processing"].includes(job.status) && (
                  <button
                    onClick={() => void jobAction("cancel", job.id)}
                    className="rounded-lg border border-danger/30 px-2 py-1 text-[10px] text-danger"
                  >
                    Cancel
                  </button>
                )}
                {["partial_failure", "failed"].includes(job.status) &&
                  Number(job.failed_items || 0) > 0 && (
                    <button
                      onClick={() => void jobAction("retry_failed", job.id)}
                      className="rounded-lg border border-base-border px-2 py-1 text-[10px] text-ink"
                    >
                      Retry failed only
                    </button>
                  )}
              </div>
            </div>
          );
        })}
        {!jobs.length && (
          <p className="py-5 text-center text-[12px] text-ink-muted">
            No bulk jobs for this ad account yet.
          </p>
        )}
      </div>
    </div>
  );
}

function Workflows({ onUse }: { onUse: (workflow: Row) => void }) {
  const { workspace } = useAuth();
  const [items, setItems] = useState<Row[]>([]);
  const [name, setName] = useState("TEST product workflow");
  const load = useCallback(async () => {
    if (!workspace?.id) return;
    const { data } = await supabase
      .from("meta_workflows")
      .select("*")
      .eq("workspace_id", workspace.id)
      .order("updated_at", { ascending: false });
    setItems(data ?? []);
  }, [workspace?.id]);
  useEffect(() => {
    void load();
  }, [load]);
  const save = async () => {
    try {
      await metaAdsService.manage("save_workflow", {
        payload: {
          name,
          description: "Product testing workflow",
          configuration: {
            campaign: {
              name: "TEST {PRODUCT_NAME} {DATE}",
              objective: "OUTCOME_SALES",
            },
            adset_count: 3,
            distribution_mode: "one_per_adset",
            create_status: "PAUSED",
            naming: {
              campaign: "TEST {PRODUCT_NAME} {DATE}",
              adset: "Broad {PRODUCT_NAME} {INDEX}",
              ad: "{CREATIVE_NAME} {INDEX}",
            },
          },
        },
      });
      toast.success("Workflow saved.");
      await load();
    } catch (error) {
      toast.error(
        error instanceof Error ? error.message : "Workflow could not be saved",
      );
    }
  };
  return (
    <div className="space-y-4">
      <div className="flex gap-2 rounded-2xl border border-base-border bg-base-surface p-4">
        <input
          value={name}
          onChange={(e) => setName(e.target.value)}
          className="flex-1 rounded-xl border border-base-border bg-base-raised px-3 text-sm text-ink"
        />
        <button
          onClick={save}
          className="inline-flex items-center gap-1 rounded-xl bg-brand px-4 py-2 text-sm font-semibold text-white"
        >
          <Save size={13} /> Save template
        </button>
      </div>
      <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">
        {items.map((item) => (
          <div
            key={item.id}
            className="rounded-2xl border border-base-border bg-base-surface p-4"
          >
            <div className="font-semibold text-ink">{item.name}</div>
            <p className="mt-1 text-[12px] text-ink-muted">
              {item.description || "Reusable Meta workflow"}
            </p>
            <div className="mt-4 flex gap-2">
              <button
                onClick={() => onUse(item)}
                className="rounded-lg bg-brand px-2.5 py-1.5 text-[11px] font-semibold text-white"
              >
                Use in launcher
              </button>
              <button
                onClick={() =>
                  void metaAdsService
                    .manage("duplicate_workflow", { entity_id: item.id })
                    .then(load)
                }
                className="rounded-lg border border-base-border px-2.5 py-1.5 text-[11px] text-ink"
              >
                Duplicate
              </button>
              <button
                onClick={() =>
                  void metaAdsService
                    .manage("delete_workflow", { entity_id: item.id })
                    .then(load)
                }
                className="rounded-lg bg-danger/10 px-2.5 py-1.5 text-[11px] text-danger"
              >
                Delete
              </button>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

function ScalingCenter({ accountId }: { accountId: string }) {
  const [mode, setMode] = useState("vertical_scale");
  const [value, setValue] = useState(20);
  const [ids, setIds] = useState("");
  const [destinationIds, setDestinationIds] = useState("");
  const [destinationStatus, setDestinationStatus] = useState("PAUSED");
  const targets = ids.split(/[\s,]+/).filter(Boolean);
  const destinations = destinationIds.split(/[\s,]+/).filter(Boolean);
  const copyCount = Math.max(1, Math.min(20, Math.floor(value)));
  const plannedActions =
    mode === "vertical_scale"
      ? targets.length
      : targets.length * copyCount * Math.max(1, destinations.length);
  const execute = async () => {
    if (!targets.length) return toast.error("Paste provider IDs first.");
    if (mode === "creative_scale" && !destinations.length)
      return toast.error("Choose at least one destination ad set.");
    if (plannedActions > 1000)
      return toast.error("A scaling job is limited to 1000 operations.");
    const operation = mode === "vertical_scale" ? "set_budget" : "duplicate";
    const entityType = mode === "creative_scale" ? "ad" : "adset";
    const items: Row[] =
      operation === "set_budget"
        ? targets.map((id) => ({
            entity_id: id,
            entity_type: entityType,
            operation,
            daily_budget: value,
          }))
        : targets.flatMap((id) =>
            (destinations.length ? destinations : [""]).flatMap(
              (destinationId) =>
                Array.from({ length: copyCount }, () => ({
                  entity_id: id,
                  entity_type: entityType,
                  operation,
                  status: destinationStatus,
                  ...(mode === "horizontal_scale" && destinationId
                    ? { campaign_id: destinationId }
                    : {}),
                  ...(mode === "creative_scale"
                    ? { adset_id: destinationId }
                    : {}),
                })),
            ),
          );
    try {
      await metaAdsService.bulk({
        action: "enqueue",
        job_type: mode,
        idempotency_key: `scale:${crypto.randomUUID()}`,
        ad_account_id: accountId,
        configuration: { create_status: "PAUSED" },
        items,
      });
      toast.success("Scaling job queued after preview.");
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Scaling failed");
    }
  };
  return (
    <div className="grid gap-4 lg:grid-cols-2">
      <div className="space-y-3 rounded-2xl border border-base-border bg-base-surface p-5">
        <h3 className="font-semibold text-ink">Scaling Center</h3>
        <label className="block text-[11px] text-ink-muted">
          Strategy
          <select
            value={mode}
            onChange={(e) => setMode(e.target.value)}
            className="mt-1 w-full rounded-xl border border-base-border bg-base-raised px-3 py-2 text-sm text-ink"
          >
            <option value="vertical_scale">Vertical budget scaling</option>
            <option value="horizontal_scale">
              Horizontal ad-set duplication
            </option>
            <option value="creative_scale">Creative/ad duplication</option>
          </select>
        </label>
        <Field
          label={
            mode === "vertical_scale"
              ? "New daily budget"
              : "Copy count (max 20)"
          }
          type="number"
          value={value}
          onChange={(v) => setValue(Number(v))}
        />
        <label className="block">
          <span className="mb-1 block text-[11px] text-ink-muted">
            {mode === "creative_scale"
              ? "Selected ad IDs"
              : "Selected ad set IDs"}
          </span>
          <textarea
            value={ids}
            onChange={(e) => setIds(e.target.value)}
            placeholder="Paste comma-separated provider IDs"
            className="min-h-28 w-full rounded-xl border border-base-border bg-base-raised p-3 text-sm text-ink"
          />
        </label>
        {mode !== "vertical_scale" && (
          <>
            <label className="block">
              <span className="mb-1 block text-[11px] text-ink-muted">
                {mode === "creative_scale"
                  ? "Destination ad set IDs"
                  : "Destination campaign IDs (optional)"}
              </span>
              <textarea
                value={destinationIds}
                onChange={(e) => setDestinationIds(e.target.value)}
                placeholder="Paste comma-separated provider IDs"
                className="min-h-20 w-full rounded-xl border border-base-border bg-base-raised p-3 text-sm text-ink"
              />
            </label>
            <label className="block text-[11px] text-ink-muted">
              Destination status
              <select
                value={destinationStatus}
                onChange={(event) => setDestinationStatus(event.target.value)}
                className="mt-1 w-full rounded-xl border border-base-border bg-base-raised px-3 py-2 text-sm text-ink"
              >
                <option value="PAUSED">PAUSED</option>
                <option value="ACTIVE">ACTIVE</option>
              </select>
            </label>
          </>
        )}
      </div>
      <div className="rounded-2xl border border-base-border bg-base-surface p-5">
        <h3 className="font-semibold text-ink">Impact preview</h3>
        <div className="mt-4 space-y-2">
          <InfoLine label="Source objects" value={String(targets.length)} />
          <InfoLine label="Planned operations" value={String(plannedActions)} />
          <InfoLine label="Operation" value={mode.replace(/_/g, " ")} />
          <InfoLine
            label="Destination status"
            value={mode === "vertical_scale" ? "Unchanged" : destinationStatus}
          />
          {mode !== "vertical_scale" && (
            <InfoLine
              label={
                mode === "creative_scale"
                  ? "Destination ad sets"
                  : "Destination campaigns"
              }
              value={
                destinations.length
                  ? String(destinations.length)
                  : mode === "horizontal_scale"
                    ? "Original campaign"
                    : "Required"
              }
            />
          )}
          <InfoLine
            label="Budget / copies"
            value={String(mode === "vertical_scale" ? value : copyCount)}
          />
        </div>
        <button
          onClick={execute}
          disabled={
            !targets.length ||
            plannedActions > 1000 ||
            (mode === "creative_scale" && !destinations.length)
          }
          className="mt-4 w-full rounded-xl bg-brand py-2.5 text-sm font-semibold text-white disabled:opacity-40"
        >
          Execute durable scaling job
        </button>
      </div>
    </div>
  );
}

function RulesCenter({
  connection,
  onConnection,
}: {
  connection: MetaConnectionStatus;
  onConnection: () => Promise<MetaConnectionStatus>;
}) {
  const { workspace } = useAuth();
  const [rules, setRules] = useState<Row[]>([]);
  const [form, setForm] = useState<Row>({
    name: "Stop no-order spend",
    entity_level: "ad",
    field: "spend",
    operator: "gt",
    value: 100,
    and_enabled: true,
    second_field: "orders",
    second_operator: "eq",
    second_value: 0,
    action: "pause",
    action_value: 20,
    schedule_minutes: 60,
    lookback_days: 3,
    stale_after_minutes: 180,
    max_budget_increase_percent_day: 30,
    max_duplicates_day: 3,
    dry_run: true,
  });
  const load = useCallback(async () => {
    if (!workspace?.id) return;
    const { data } = await supabase
      .from("meta_rules")
      .select("*")
      .eq("workspace_id", workspace.id)
      .order("updated_at", { ascending: false });
    setRules(data ?? []);
  }, [workspace?.id]);
  useEffect(() => {
    void load();
  }, [load]);
  const save = async () => {
    try {
      await metaAdsService.manage("save_rule", {
        payload: {
          name: form.name,
          entity_level: form.entity_level,
          conditions: [
            {
              field: form.field,
              operator: form.operator,
              value: Number(form.value),
            },
            ...(form.and_enabled
              ? [
                  {
                    field: form.second_field,
                    operator: form.second_operator,
                    value: Number(form.second_value),
                  },
                ]
              : []),
          ],
          action: {
            type: form.action,
            percent: Number(form.action_value),
            copy_count: Number(form.action_value),
            status: "PAUSED",
          },
          schedule_minutes: Number(form.schedule_minutes),
          lookback_days: Number(form.lookback_days),
          stale_after_minutes: Number(form.stale_after_minutes),
          max_budget_increase_percent_day: Number(
            form.max_budget_increase_percent_day,
          ),
          max_duplicates_day: Number(form.max_duplicates_day),
          dry_run: form.dry_run,
          enabled: false,
        },
      });
      toast.success("Rule saved disabled for review.");
      await load();
    } catch (error) {
      toast.error(
        error instanceof Error ? error.message : "Rule could not be saved",
      );
    }
  };
  return (
    <div className="space-y-4">
      <div className="rounded-2xl border border-base-border bg-base-surface p-5">
        <div className="flex items-center justify-between">
          <div>
            <h3 className="font-semibold text-ink">Rules engine</h3>
            <p className="text-[12px] text-ink-muted">
              IF/AND conditions evaluate Meta plus exact-attributed COD metrics.
              Stale data, daily caps and the kill switch are enforced
              server-side.
            </p>
          </div>
          <button
            onClick={() =>
              void metaAdsService
                .setAutomation(!connection.connection?.automation_enabled)
                .then(onConnection)
            }
            className={`rounded-xl px-3 py-2 text-[11px] font-semibold ${connection.connection?.automation_enabled ? "bg-emerald-500/10 text-emerald-500" : "bg-danger/10 text-danger"}`}
          >
            Automation{" "}
            {connection.connection?.automation_enabled ? "ON" : "OFF"}
          </button>
        </div>
        <div className="mt-4 grid gap-3 sm:grid-cols-6">
          <Field
            label="Rule name"
            value={form.name}
            onChange={(v) => setForm({ ...form, name: v })}
          />
          <SelectField
            label="Evaluate"
            value={form.entity_level}
            options={["campaign", "adset", "ad", "creative", "product"]}
            onChange={(v) => setForm({ ...form, entity_level: v })}
          />
          <SelectField
            label="Metric"
            value={form.field}
            options={[
              "spend",
              "orders",
              "delivered",
              "delivered_roas",
              "delivery_rate",
              "profit",
              "frequency",
              "ctr",
              "cpa",
              "stock",
            ]}
            onChange={(v) => setForm({ ...form, field: v })}
          />
          <SelectField
            label="Operator"
            value={form.operator}
            options={["gt", "gte", "lt", "lte", "eq"]}
            onChange={(v) => setForm({ ...form, operator: v })}
          />
          <Field
            label="Value"
            type="number"
            value={form.value}
            onChange={(v) => setForm({ ...form, value: Number(v) })}
          />
          <SelectField
            label="Then"
            value={form.action}
            options={[
              "pause",
              "activate",
              "increase_budget_percent",
              "duplicate",
              "alert",
            ]}
            onChange={(v) => setForm({ ...form, action: v })}
          />
        </div>
        <div className="mt-3 rounded-xl border border-base-border bg-base-raised/40 p-3">
          <label className="flex items-center gap-2 text-[12px] text-ink">
            <input
              type="checkbox"
              checked={form.and_enabled}
              onChange={(event) =>
                setForm({ ...form, and_enabled: event.target.checked })
              }
            />
            Add AND condition
          </label>
          {form.and_enabled && (
            <div className="mt-3 grid gap-3 sm:grid-cols-3">
              <SelectField
                label="AND metric"
                value={form.second_field}
                options={[
                  "spend",
                  "orders",
                  "delivered",
                  "delivered_roas",
                  "delivery_rate",
                  "profit",
                  "frequency",
                  "ctr",
                  "cpa",
                  "stock",
                ]}
                onChange={(v) => setForm({ ...form, second_field: v })}
              />
              <SelectField
                label="Operator"
                value={form.second_operator}
                options={["gt", "gte", "lt", "lte", "eq", "neq"]}
                onChange={(v) => setForm({ ...form, second_operator: v })}
              />
              <Field
                label="Value"
                type="number"
                value={form.second_value}
                onChange={(v) => setForm({ ...form, second_value: Number(v) })}
              />
            </div>
          )}
        </div>
        <div className="mt-3 grid gap-3 sm:grid-cols-3 xl:grid-cols-6">
          <Field
            label="Action % / copies"
            type="number"
            value={form.action_value}
            onChange={(v) => setForm({ ...form, action_value: Number(v) })}
          />
          <Field
            label="Check every (min)"
            type="number"
            value={form.schedule_minutes}
            onChange={(v) => setForm({ ...form, schedule_minutes: Number(v) })}
          />
          <Field
            label="Lookback (days)"
            type="number"
            value={form.lookback_days}
            onChange={(v) => setForm({ ...form, lookback_days: Number(v) })}
          />
          <Field
            label="Stale after (min)"
            type="number"
            value={form.stale_after_minutes}
            onChange={(v) =>
              setForm({ ...form, stale_after_minutes: Number(v) })
            }
          />
          <Field
            label="Max budget +% / day"
            type="number"
            value={form.max_budget_increase_percent_day}
            onChange={(v) =>
              setForm({ ...form, max_budget_increase_percent_day: Number(v) })
            }
          />
          <Field
            label="Max duplicates / day"
            type="number"
            value={form.max_duplicates_day}
            onChange={(v) =>
              setForm({ ...form, max_duplicates_day: Number(v) })
            }
          />
        </div>
        <label className="mt-3 flex items-center gap-2 text-[12px] text-ink">
          <input
            type="checkbox"
            checked={form.dry_run}
            onChange={(e) => setForm({ ...form, dry_run: e.target.checked })}
          />{" "}
          Dry-run/test mode
        </label>
        <button
          onClick={save}
          className="mt-4 rounded-xl bg-brand px-4 py-2 text-sm font-semibold text-white"
        >
          Save disabled rule
        </button>
      </div>
      <div className="space-y-2">
        {rules.map((rule) => (
          <div
            key={rule.id}
            className="flex flex-wrap items-center gap-3 rounded-xl border border-base-border bg-base-surface p-4"
          >
            <div className="min-w-[200px] flex-1">
              <div className="font-semibold text-ink">{rule.name}</div>
              <div className="text-[11px] text-ink-muted">
                {rule.entity_level} · every {rule.schedule_minutes}m ·{" "}
                {rule.dry_run ? "dry run" : "live"}
              </div>
            </div>
            <button
              onClick={() =>
                void metaAdsService
                  .runRule(rule.id, true)
                  .then((result) =>
                    toast.success(
                      `Tested: ${result.run?.matched ?? 0} matches.`,
                    ),
                  )
                  .catch((e) => toast.error(e.message))
              }
              className="rounded-lg border border-base-border px-3 py-1.5 text-[11px] text-ink"
            >
              Test now
            </button>
            <button
              onClick={() =>
                void metaAdsService
                  .manage("save_rule", {
                    entity_id: rule.id,
                    payload: { name: rule.name, enabled: !rule.enabled },
                  })
                  .then(load)
              }
              className={`rounded-lg px-3 py-1.5 text-[11px] ${rule.enabled ? "bg-emerald-500/10 text-emerald-500" : "bg-base-raised text-ink-muted"}`}
            >
              {rule.enabled ? "Enabled" : "Disabled"}
            </button>
          </div>
        ))}
      </div>
    </div>
  );
}

function ActivityView() {
  const { workspace } = useAuth();
  const [logs, setLogs] = useState<Row[]>([]);
  useEffect(() => {
    if (!workspace?.id) return;
    void supabase
      .from("meta_action_logs")
      .select("*")
      .eq("workspace_id", workspace.id)
      .order("created_at", { ascending: false })
      .limit(100)
      .then(({ data }) => setLogs(data ?? []));
  }, [workspace?.id]);
  return (
    <div className="space-y-2">
      {logs.map((log) => (
        <div
          key={log.id}
          className="grid gap-2 rounded-xl border border-base-border bg-base-surface p-4 text-[12px] sm:grid-cols-[140px_120px_1fr_100px]"
        >
          <span className="text-ink-muted">
            {new Date(log.created_at).toLocaleString()}
          </span>
          <span className="font-semibold text-ink">{log.action}</span>
          <span className="truncate text-ink-muted">
            {log.reason || `${log.entity_type} ${log.entity_id || ""}`}
          </span>
          <span
            className={
              log.result === "success"
                ? "text-emerald-500"
                : log.result === "failed"
                  ? "text-danger"
                  : "text-amber-500"
            }
          >
            {log.result}
          </span>
        </div>
      ))}
    </div>
  );
}

function Modal({
  title,
  onClose,
  children,
}: {
  title: string;
  onClose: () => void;
  children: React.ReactNode;
}) {
  return (
    <div className="fixed inset-0 z-[999] flex items-center justify-center p-4">
      <div
        className="absolute inset-0 bg-black/55 backdrop-blur-sm"
        onClick={onClose}
      />
      <div className="relative z-10 max-h-[90vh] w-full max-w-xl overflow-y-auto rounded-3xl border border-base-border bg-base-surface shadow-2xl">
        <div className="flex items-center border-b border-base-border px-6 py-4">
          <h2 className="flex-1 text-lg font-semibold text-ink">{title}</h2>
          <button onClick={onClose}>
            <X size={16} />
          </button>
        </div>
        <div className="p-6">{children}</div>
      </div>
    </div>
  );
}
function Field({
  label,
  value,
  onChange,
  type = "text",
  required = false,
}: {
  label: string;
  value: any;
  onChange: (value: string) => void;
  type?: string;
  required?: boolean;
}) {
  return (
    <label className="block">
      <span className="mb-1 block text-[11px] text-ink-muted">{label}</span>
      <input
        type={type}
        value={value ?? ""}
        onChange={(e) => onChange(e.target.value)}
        required={required}
        className="w-full rounded-xl border border-base-border bg-base-raised px-3 py-2 text-sm text-ink outline-none focus:border-brand/50"
      />
    </label>
  );
}
function SelectField({
  label,
  value,
  options,
  onChange,
}: {
  label: string;
  value: string;
  options: string[];
  onChange: (value: string) => void;
}) {
  return (
    <label className="block">
      <span className="mb-1 block text-[11px] text-ink-muted">{label}</span>
      <select
        value={value}
        onChange={(e) => onChange(e.target.value)}
        className="w-full rounded-xl border border-base-border bg-base-raised px-3 py-2 text-sm text-ink"
      >
        {options.map((option) => (
          <option key={option}>{option}</option>
        ))}
      </select>
    </label>
  );
}
