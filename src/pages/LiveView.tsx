import { lazy, Suspense, useMemo, useRef, useState } from "react";
import { useNavigate } from "react-router-dom";
import { Expand, Filter, Globe2, LocateFixed, MapPin, Pause, Play, RotateCcw, ShoppingBag, X } from "lucide-react";
import { useAuth } from "../hooks/useAuth";
import { useLiveView } from "../hooks/useLiveView";
import type { LiveOrderEvent, LiveViewFilters, LiveWindow } from "../services/liveViewService";
import { LocationQualityPanel } from "../components/live-view/LocationQualityPanel";
import "./live-view/LiveView.css";

const LiveGlobe = lazy(() => import("../components/live-view/LiveGlobe"));
const WINDOWS: Array<[LiveWindow, string]> = [["live", "Live"], ["1m", "1m"], ["5m", "5m"], ["15m", "15m"], ["1h", "1h"], ["today", "Today"]];

function ago(value: string) {
  const seconds = Math.max(0, Math.round((Date.now() - Date.parse(value)) / 1000));
  if (seconds < 60) return `${seconds}s ago`;
  if (seconds < 3600) return `${Math.floor(seconds / 60)}m ago`;
  if (seconds < 86400) return `${Math.floor(seconds / 3600)}h ago`;
  return `${Math.floor(seconds / 86400)}d ago`;
}

function money(value: number, currency: string | null) {
  return `${new Intl.NumberFormat(undefined, { maximumFractionDigits: 0 }).format(value)} ${currency ?? ""}`.trim();
}

function FilterSelect({ label, value, values, onChange }: { label: string; value?: string; values: Array<string | { id: string; name: string }>; onChange: (value: string) => void }) {
  return <label className="live-filter-field"><span>{label}</span><select value={value ?? ""} onChange={(event) => onChange(event.target.value)}>
    <option value="">All</option>
    {values.map((item) => typeof item === "string" ? <option key={item} value={item}>{item}</option> : <option key={item.id} value={item.id}>{item.name}</option>)}
  </select></label>;
}

export default function LiveView() {
  const navigate = useNavigate();
  const shellRef = useRef<HTMLDivElement>(null);
  const { workspace } = useAuth();
  const live = useLiveView(workspace?.id);
  const [effectsPaused, setEffectsPaused] = useState(false);
  const [rotationPaused, setRotationPaused] = useState(true);
  const [filtersOpen, setFiltersOpen] = useState(false);
  const [focusToken, setFocusToken] = useState(0);
  const [resetToken, setResetToken] = useState(0);
  const [selectedEvents, setSelectedEvents] = useState<LiveOrderEvent[]>([]);
  const events = live.snapshot.events;
  const revenue = Object.entries(live.snapshot.revenue_by_currency)[0];
  const unknownLocations = useMemo(() => events.filter((event) => !Number.isFinite(event.latitude) || !Number.isFinite(event.longitude)).length, [events]);
  const hasFilters = Object.values(live.filters).some(Boolean);
  const setFilter = (key: keyof LiveViewFilters, value: string) => live.setFilters((current) => ({ ...current, [key]: value || undefined }));
  const openOrder = (event: LiveOrderEvent) => navigate("/orders", { state: { viewOrderId: event.order_id } });

  return <div ref={shellRef} className="live-view-shell">
    <Suspense fallback={<div className="live-map-loader"><Globe2 size={20} />Preparing Earth…</div>}>
      <LiveGlobe
        events={events}
        pulseEvents={live.newEvents}
        effectsPaused={effectsPaused}
        rotationPaused={rotationPaused}
        focusToken={focusToken}
        resetToken={resetToken}
        onSelect={setSelectedEvents}
      />
    </Suspense>

    <section className="live-floating live-metrics" aria-label="Current activity">
      <div><span>Orders</span><strong>{live.snapshot.orders.toLocaleString()}</strong></div>
      {revenue && <div><span>Order value</span><strong>{money(Number(revenue[1]), revenue[0])}</strong></div>}
      <div className="live-location-quality" title="Orders without verified coordinates"><span>Unplotted</span><strong>{unknownLocations}</strong></div>
    </section>

    <div className="live-top-right">
      <div className="live-floating live-toolbar">
        <span className={`live-status ${live.online ? "" : "offline"}`} title={live.connection}><span />{live.online ? "Live" : "Connecting"}</span>
        {live.canGlobal && <label className="live-workspaces"><input type="checkbox" checked={live.adminGlobal} onChange={(event) => live.setAdminGlobal(event.target.checked)} />All stores</label>}
        <div className="live-window-tabs" aria-label="Time range">{WINDOWS.map(([value, label]) => <button key={value} className={live.window === value ? "active" : ""} aria-pressed={live.window === value} onClick={() => live.setWindow(value)}>{label}</button>)}</div>
        <button className={`live-filter-toggle ${filtersOpen || hasFilters ? "active" : ""}`} aria-expanded={filtersOpen} onClick={() => setFiltersOpen((value) => !value)}><Filter size={15} />Filters{hasFilters && <i />}</button>
      </div>

      {filtersOpen && <section className="live-floating live-filter-panel">
        <header><div><strong>Filter activity</strong><span>Only matching real orders appear on Earth.</span></div><button aria-label="Close filters" onClick={() => setFiltersOpen(false)}><X size={16} /></button></header>
        <div className="live-filter-grid">
          <FilterSelect label="Source" value={live.filters.source} values={live.snapshot.options.sources ?? []} onChange={(value) => setFilter("source", value)} />
          <FilterSelect label="Status" value={live.filters.status} values={live.snapshot.options.statuses ?? []} onChange={(value) => setFilter("status", value)} />
          <FilterSelect label="Product" value={live.filters.product} values={live.snapshot.options.products ?? []} onChange={(value) => setFilter("product", value)} />
          <FilterSelect label="City" value={live.filters.city} values={live.snapshot.options.cities ?? []} onChange={(value) => setFilter("city", value)} />
          <FilterSelect label="Campaign" value={live.filters.campaign} values={live.snapshot.options.campaigns ?? []} onChange={(value) => setFilter("campaign", value)} />
          {live.adminGlobal && <FilterSelect label="Workspace" value={live.filters.workspace_id} values={live.snapshot.options.workspaces ?? []} onChange={(value) => setFilter("workspace_id", value)} />}
        </div>
        {hasFilters && <button className="live-clear" onClick={() => live.setFilters({})}>Clear all filters</button>}
        {live.adminGlobal && <LocationQualityPanel events={events} onSaved={() => void live.refresh(true)} />}
      </section>}
    </div>

    {selectedEvents.length > 0 && <section className="live-floating live-order-popover" aria-label="Selected order location">
      <header><div><MapPin size={16} /><span>{selectedEvents[0].city ?? selectedEvents[0].country ?? "Verified location"}</span>{selectedEvents.length > 1 && <em>{selectedEvents.length} orders</em>}</div><button aria-label="Close order details" onClick={() => setSelectedEvents([])}><X size={16} /></button></header>
      <div className="live-order-list">{selectedEvents.slice(0, 6).map((event) => <button key={event.order_id} onClick={() => openOrder(event)}>
        <span className="live-order-icon"><ShoppingBag size={15} /></span>
        <span className="live-order-copy"><strong>{event.product_name ?? "Order"}</strong><span>{event.status} · {event.source ?? "Direct"} · {ago(event.occurred_at)}</span><small>{event.geo_source === "address" || event.geo_source === "coordinates" ? "Precise delivery location" : "City-level location"}</small></span>
        <b>{money(Number(event.total), event.currency)}</b>
      </button>)}</div>
      {selectedEvents.length > 6 && <p>+{selectedEvents.length - 6} more orders at this location</p>}
    </section>}

    <div className="live-controls" aria-label="Earth controls">
      <button className="live-focus-btn" onClick={() => setFocusToken((value) => value + 1)}><LocateFixed size={16} /><span>Focus Morocco</span></button>
      <button aria-label={effectsPaused ? "Resume order effects" : "Pause order effects"} title={effectsPaused ? "Resume order effects" : "Pause order effects"} className={effectsPaused ? "active" : ""} onClick={() => setEffectsPaused((value) => !value)}>{effectsPaused ? <Play size={16} /> : <Pause size={16} />}</button>
      <button aria-label={rotationPaused ? "Start Earth rotation" : "Pause Earth rotation"} title={rotationPaused ? "Start Earth rotation" : "Pause Earth rotation"} className={!rotationPaused ? "active" : ""} onClick={() => setRotationPaused((value) => !value)}><RotateCcw size={16} /></button>
      <button aria-label="Reset Earth view" title="Reset Earth view" onClick={() => setResetToken((value) => value + 1)}><Globe2 size={16} /></button>
      <button aria-label="Fullscreen" title="Fullscreen" onClick={() => shellRef.current?.requestFullscreen?.()}><Expand size={16} /></button>
    </div>

    {live.loading && <div className="live-map-loader"><Globe2 size={20} />Loading live orders…</div>}
    {live.error && <div className="live-error" role="alert">{live.error}<button onClick={() => void live.refresh()}>Retry</button></div>}
    {!live.loading && !live.error && !events.length && <div className="live-empty"><span />No orders in this time window yet.</div>}
  </div>;
}
