import { lazy, Suspense, useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import { Activity, Expand, Globe2, MapPin, Pause, Play, Radio, RotateCcw, ShoppingBag, Sparkles } from "lucide-react";
import { useAuth } from "../hooks/useAuth";
import { useLiveView } from "../hooks/useLiveView";
import type { LiveOrderEvent, LiveViewFilters, LiveWindow, RankedMetric } from "../services/liveViewService";
import { LocationQualityPanel } from "../components/live-view/LocationQualityPanel";
import "./live-view/LiveView.css";

const LiveGlobe = lazy(() => import("../components/live-view/LiveGlobe"));
const WINDOWS: Array<[LiveWindow, string]> = [["live", "Live"], ["1m", "1m"], ["5m", "5m"], ["15m", "15m"], ["1h", "1h"], ["today", "Today"]];

function ago(value: string) {
  const seconds = Math.max(0, Math.round((Date.now() - Date.parse(value)) / 1000));
  if (seconds < 60) return `${seconds}s ago`;
  if (seconds < 3600) return `${Math.floor(seconds / 60)}m ago`;
  return `${Math.floor(seconds / 3600)}h ago`;
}
function money(value: number, currency: string | null) {
  return `${new Intl.NumberFormat(undefined, { maximumFractionDigits: 0 }).format(value)} ${currency ?? ""}`.trim();
}
function FilterSelect({ label, value, values, onChange }: { label: string; value?: string; values: Array<string | { id: string; name: string }>; onChange: (value: string) => void }) {
  return <select className="live-filter" aria-label={label} value={value ?? ""} onChange={(event) => onChange(event.target.value)}>
    <option value="">{label}</option>
    {values.map((item) => typeof item === "string" ? <option key={item} value={item}>{item}</option> : <option key={item.id} value={item.id}>{item.name}</option>)}
  </select>;
}
function MetricCard({ title, icon, rows, onPick }: { title: string; icon: React.ReactNode; rows: RankedMetric[]; onPick: (row: RankedMetric) => void }) {
  if (!rows.length) return null;
  return <section className="live-metric-card"><div className="live-metric-head">{icon}<h3>{title}</h3></div><div className="live-rank">
    {rows.slice(0, 5).map((row) => <button key={`${row.workspace_id ?? ""}:${row.label}`} onClick={() => onPick(row)}><span>{row.label}</span><strong>{row.orders}</strong></button>)}
  </div></section>;
}

export default function LiveView() {
  const navigate = useNavigate();
  const { workspace } = useAuth();
  const live = useLiveView(workspace?.id);
  const [effectsPaused, setEffectsPaused] = useState(false);
  const [rotationPaused, setRotationPaused] = useState(true);
  const [focusToken, setFocusToken] = useState(0);
  const events = live.snapshot.events;
  const feed = useMemo(() => [...live.newEvents, ...events.filter((event) => !live.newEvents.some((fresh) => fresh.order_id === event.order_id))].slice(0, 40), [events, live.newEvents]);
  const revenue = Object.entries(live.snapshot.revenue_by_currency);
  const setFilter = (key: keyof LiveViewFilters, value: string) => live.setFilters((current) => ({ ...current, [key]: value || undefined }));
  const openOrder = (event: LiveOrderEvent) => navigate("/orders", { state: { viewOrderId: event.order_id } });
  const hasFilters = Object.values(live.filters).some(Boolean);

  return <div className="live-view-shell">
    <header className="live-view-top">
      <div className="live-view-brand"><span className="live-view-brandmark"><Globe2 size={20} /></span><div><h1>Live View</h1><p>See orders as they happen, across your store.</p></div></div>
      <div className="live-top-actions">
        <span className={`live-status ${live.online ? "" : "offline"}`} title={live.connection}><span className="live-status-dot" />{live.online ? "Connected" : "Connecting"}</span>
        {live.canGlobal && <label className="live-workspaces"><input type="checkbox" checked={live.adminGlobal} onChange={(event) => live.setAdminGlobal(event.target.checked)} />All workspaces</label>}
        <div className="live-window-tabs" aria-label="Time range">{WINDOWS.map(([value, label]) => <button key={value} className={live.window === value ? "active" : ""} aria-pressed={live.window === value} onClick={() => live.setWindow(value)}>{label}</button>)}</div>
      </div>
    </header>

    <div className="live-view-grid">
      <main className="live-center">
        <div className="live-map-heading"><span className="live-map-eyebrow">GLOBAL ACTIVITY</span><h2>Orders around the world</h2><p>Morocco is in focus. Drag to explore, scroll to zoom.</p></div>
        <div className="live-center-overlay"><div className="live-summary"><span className="live-summary-label">Orders in this window</span><strong className="live-summary-value">{live.snapshot.orders.toLocaleString()}</strong></div>
          {revenue.slice(0, 1).map(([currency, value]) => <div className="live-summary" key={currency}><span className="live-summary-label">Order value</span><strong className="live-summary-value">{money(Number(value), currency)}</strong></div>)}
        </div>
        <Suspense fallback={<div className="live-loader">Loading map…</div>}><LiveGlobe events={events} pulseEvents={live.newEvents} effectsPaused={effectsPaused} rotationPaused={rotationPaused} focusToken={focusToken} onSelect={openOrder} /></Suspense>
        {live.loading && <div className="live-loader">Preparing live activity…</div>}
        {live.error && <div className="live-error" role="alert">{live.error} <button onClick={() => void live.refresh()}>Retry</button></div>}
        {!live.loading && !live.error && !events.length && <div className="live-empty-overlay"><span className="live-empty-dot" />No orders in this time window. The map stays ready for the next one.</div>}
        <div className="live-controls">
          <button className="live-focus-btn" onClick={() => setFocusToken((value) => value + 1)}><MapPin size={15} />Focus Morocco</button>
          <button className={`live-icon-btn ${effectsPaused ? "active" : ""}`} aria-label={effectsPaused ? "Resume map effects" : "Pause map effects"} title={effectsPaused ? "Resume map effects" : "Pause map effects"} onClick={() => setEffectsPaused((value) => !value)}>{effectsPaused ? <Play size={16} /> : <Pause size={16} />}</button>
          <button className={`live-icon-btn ${!rotationPaused ? "active" : ""}`} aria-label={rotationPaused ? "Start globe rotation" : "Stop globe rotation"} title={rotationPaused ? "Start globe rotation" : "Stop globe rotation"} onClick={() => setRotationPaused((value) => !value)}><RotateCcw size={16} /></button>
          <button className="live-icon-btn" aria-label="Fullscreen" title="Fullscreen" onClick={() => document.documentElement.requestFullscreen?.()}><Expand size={16} /></button>
        </div>
      </main>

      <aside className="live-sidebar">
        <section className="live-sidebar-section live-filters-section"><div className="live-section-heading"><h2>Explore activity</h2>{hasFilters && <button className="live-clear" onClick={() => live.setFilters({})}>Clear filters</button>}</div>
          <div className="live-filters">
            <FilterSelect label="Source" value={live.filters.source} values={live.snapshot.options.sources ?? []} onChange={(value) => setFilter("source", value)} />
            <FilterSelect label="Status" value={live.filters.status} values={live.snapshot.options.statuses ?? []} onChange={(value) => setFilter("status", value)} />
            <FilterSelect label="Product" value={live.filters.product} values={live.snapshot.options.products ?? []} onChange={(value) => setFilter("product", value)} />
            <FilterSelect label="City" value={live.filters.city} values={live.snapshot.options.cities ?? []} onChange={(value) => setFilter("city", value)} />
            <FilterSelect label="Campaign" value={live.filters.campaign} values={live.snapshot.options.campaigns ?? []} onChange={(value) => setFilter("campaign", value)} />
            {live.adminGlobal && <FilterSelect label="Workspace" value={live.filters.workspace_id} values={live.snapshot.options.workspaces ?? []} onChange={(value) => setFilter("workspace_id", value)} />}
          </div>
        </section>
        <section className="live-sidebar-section live-feed-section"><div className="live-section-heading"><h2>Recent orders</h2><span>{feed.length}</span></div>
          <div className="live-feed">{feed.map((event) => <button className="live-feed-item" key={event.order_id} onClick={() => openOrder(event)}>
            <span className="live-feed-icon"><ShoppingBag size={16} /></span><span className="live-feed-body"><span className="live-feed-city">{event.city ?? event.country ?? "Location unavailable"}</span><span className="live-feed-meta">{event.product_name ?? "Order"} · {event.source ?? "Unknown source"}</span><span className="live-feed-time">{event.status} · {ago(event.occurred_at)}</span></span><strong className="live-feed-value">{money(Number(event.total), event.currency)}</strong>
          </button>)}</div>
          {!feed.length && !live.loading && <div className="live-feed-empty"><ShoppingBag size={20} /><strong>No recent orders</strong><span>New orders will show here automatically.</span></div>}
        </section>
        {(live.snapshot.top_cities.length > 0 || live.snapshot.top_products.length > 0 || live.snapshot.top_sources.length > 0 || live.snapshot.top_campaigns.length > 0 || live.adminGlobal) && <section className="live-sidebar-section live-insights-section"><div className="live-section-heading"><h2>At a glance</h2></div>
          <MetricCard title="Top cities" icon={<MapPin size={16} />} rows={live.snapshot.top_cities} onPick={(row) => setFilter("city", row.label)} />
          <MetricCard title="Top products" icon={<ShoppingBag size={16} />} rows={live.snapshot.top_products} onPick={(row) => setFilter("product", row.label)} />
          <MetricCard title="Sources" icon={<Radio size={16} />} rows={live.snapshot.top_sources} onPick={(row) => setFilter("source", row.label)} />
          <MetricCard title="Campaigns" icon={<Sparkles size={16} />} rows={live.snapshot.top_campaigns} onPick={(row) => setFilter("campaign", row.label)} />
          {live.adminGlobal && <><MetricCard title="Workspaces" icon={<Activity size={16} />} rows={live.snapshot.top_workspaces} onPick={(row) => setFilter("workspace_id", row.workspace_id ?? "")} /><LocationQualityPanel events={events} onSaved={() => void live.refresh(true)} /></>}
        </section>}
      </aside>
    </div>
    <div className="live-location-note">Location pins are approximate and appear only when order data supports them.</div>
  </div>;
}
