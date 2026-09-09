import { lazy, Suspense, useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import { Activity, Expand, Globe2, MapPin, Pause, Play, Radio, RotateCcw, ShoppingBag, Sparkles } from "lucide-react";
import { useAuth } from "../hooks/useAuth";
import { useLiveView } from "../hooks/useLiveView";
import type { LiveOrderEvent, LiveViewFilters, LiveWindow, RankedMetric } from "../services/liveViewService";
import { LocationQualityPanel } from "../components/live-view/LocationQualityPanel";
import "./live-view/LiveView.css";

const LiveGlobe = lazy(() => import("../components/live-view/LiveGlobe"));
const WINDOWS: Array<[LiveWindow,string]> = [["live","Live"],["1m","1m"],["5m","5m"],["15m","15m"],["1h","1h"],["today","Today"]];

function ago(value: string) {
  const seconds = Math.max(0, Math.round((Date.now() - Date.parse(value)) / 1000));
  if (seconds < 60) return `${seconds}s ago`;
  if (seconds < 3600) return `${Math.floor(seconds / 60)}m ago`;
  return `${Math.floor(seconds / 3600)}h ago`;
}
function money(value: number, currency: string | null) {
  return `${new Intl.NumberFormat(undefined,{maximumFractionDigits:0}).format(value)} ${currency ?? ""}`.trim();
}
function FilterSelect({ label, value, values, onChange }: { label:string; value?:string; values:Array<string|{id:string;name:string}>; onChange:(value:string)=>void }) {
  return <select className="live-filter" aria-label={label} value={value ?? ""} onChange={(event) => onChange(event.target.value)}>
    <option value="">{label}</option>
    {values.map((item) => typeof item === "string"
      ? <option key={item} value={item}>{item}</option>
      : <option key={item.id} value={item.id}>{item.name}</option>)}
  </select>;
}
function MetricCard({ title, icon, rows, onPick }: { title:string; icon:React.ReactNode; rows:RankedMetric[]; onPick:(row:RankedMetric)=>void }) {
  if (!rows.length) return null;
  return <section className="live-metric-card"><div className="live-metric-head">{icon}{title}</div><div className="live-rank">
    {rows.slice(0,6).map((row) => <button key={`${row.workspace_id ?? ""}:${row.label}`} onClick={() => onPick(row)}><span>{row.label}</span><strong>{row.orders}</strong></button>)}
  </div></section>;
}

export default function LiveView() {
  const navigate = useNavigate();
  const { workspace } = useAuth();
  const live = useLiveView(workspace?.id);
  const [effectsPaused,setEffectsPaused] = useState(false);
  const [rotationPaused,setRotationPaused] = useState(false);
  const events = live.snapshot.events;
  const feed = useMemo(() => [...live.newEvents,...events.filter((event) => !live.newEvents.some((fresh) => fresh.order_id===event.order_id))].slice(0,40), [events,live.newEvents]);
  const revenue = Object.entries(live.snapshot.revenue_by_currency);
  const setFilter = (key:keyof LiveViewFilters,value:string) => live.setFilters((current) => ({...current,[key]:value || undefined}));
  const openOrder = (event:LiveOrderEvent) => navigate("/orders",{state:{viewOrderId:event.order_id}});
  const enterFullscreen = () => document.documentElement.requestFullscreen?.();

  return <div className="live-view-shell">
    <header className="live-view-top">
      <div className="live-view-brand"><span className="live-view-brandmark"><Globe2 size={16}/></span><div><div className="text-sm font-extrabold tracking-tight">Live View</div><div className="text-[10px] text-[#947682]">Real order activity · approximate locations</div></div></div>
      <div className={`live-status ${live.online ? "" : "offline"}`} title={live.connection}><span className="live-status-dot"/>{live.online ? "Live" : "Offline"}</div>
      {live.canGlobal && <label className="flex items-center gap-2 text-[11px] font-bold text-[#765663]"><input type="checkbox" checked={live.adminGlobal} onChange={(e)=>live.setAdminGlobal(e.target.checked)} />All workspaces</label>}
      <div className="live-window-tabs">{WINDOWS.map(([value,label])=><button key={value} className={live.window===value?"active":""} onClick={()=>live.setWindow(value)}>{label}</button>)}</div>
    </header>
    <div className="live-view-grid">
      <aside className="live-panel left"><h2 className="live-panel-title">Live order feed</h2>
        <div className="live-feed">{feed.map((event)=><button className="live-feed-item" key={event.order_id} onClick={()=>openOrder(event)}>
          <div className="flex items-start justify-between gap-2"><span className="live-feed-city">{event.city ?? event.country ?? "Location unavailable"}</span><span className="live-feed-value">{money(Number(event.total),event.currency)}</span></div>
          <div className="live-feed-meta">{event.product_name ?? "Order"} · {event.source ?? "Unknown source"}</div>
          <div className="mt-2 flex items-center justify-between text-[10px] text-[#a08490]"><span>{event.status}</span><span>{ago(event.occurred_at)}</span></div>
        </button>)}</div>
        {!feed.length && !live.loading && <div className="py-16 text-center text-xs text-[#947682]">No orders in this window yet.</div>}
      </aside>
      <main className="live-center">
        {live.error && <div className="live-error">{live.error} <button className="ml-2 font-bold underline" onClick={()=>void live.refresh()}>Retry</button></div>}
        {live.loading && <div className="live-loader">Preparing live activity…</div>}
        <Suspense fallback={<div className="live-loader">Loading globe…</div>}><LiveGlobe events={events} pulseEvents={live.newEvents} effectsPaused={effectsPaused} rotationPaused={rotationPaused} onSelect={openOrder}/></Suspense>
        {!live.loading && !events.length && <div className="live-empty live-empty-overlay"><div><h2 className="text-base font-extrabold text-[#4d303c]">Waiting for order activity</h2><p className="mt-1 max-w-sm text-[11px] leading-5">New orders will appear in real time. Locations are approximate and only shown when the data supports them.</p></div></div>}
        <div className="live-center-overlay"><div className="live-summary"><div className="live-summary-value">{live.snapshot.orders.toLocaleString()}</div><div className="live-summary-label">Orders in window</div></div>
          {revenue.slice(0,2).map(([currency,value])=><div className="live-summary" key={currency}><div className="live-summary-value">{money(Number(value),currency)}</div><div className="live-summary-label">Order value</div></div>)}
          <div className="live-controls"><button className={`live-icon-btn ${effectsPaused?"active":""}`} title="Pause pulse and arc effects" onClick={()=>setEffectsPaused((v)=>!v)}>{effectsPaused?<Play size={15}/>:<Pause size={15}/>}</button><button className={`live-icon-btn ${rotationPaused?"active":""}`} title="Toggle globe rotation" onClick={()=>setRotationPaused((v)=>!v)}><RotateCcw size={15}/></button><button className="live-icon-btn" title="Fullscreen" onClick={enterFullscreen}><Expand size={15}/></button></div>
        </div>
        <div className="live-filters">
          <FilterSelect label="Source" value={live.filters.source} values={live.snapshot.options.sources ?? []} onChange={(v)=>setFilter("source",v)}/><FilterSelect label="Status" value={live.filters.status} values={live.snapshot.options.statuses ?? []} onChange={(v)=>setFilter("status",v)}/><FilterSelect label="Product" value={live.filters.product} values={live.snapshot.options.products ?? []} onChange={(v)=>setFilter("product",v)}/><FilterSelect label="City" value={live.filters.city} values={live.snapshot.options.cities ?? []} onChange={(v)=>setFilter("city",v)}/><FilterSelect label="Campaign" value={live.filters.campaign} values={live.snapshot.options.campaigns ?? []} onChange={(v)=>setFilter("campaign",v)}/>{live.adminGlobal&&<FilterSelect label="Workspace" value={live.filters.workspace_id} values={live.snapshot.options.workspaces ?? []} onChange={(v)=>setFilter("workspace_id",v)}/>} {Object.values(live.filters).some(Boolean)&&<button className="live-clear" onClick={()=>live.setFilters({})}>Clear</button>}
        </div>
      </main>
      <aside className="live-panel right"><h2 className="live-panel-title">Live metrics</h2><MetricCard title="Top cities" icon={<MapPin size={14}/>} rows={live.snapshot.top_cities} onPick={(row)=>setFilter("city",row.label)}/><MetricCard title="Top products" icon={<ShoppingBag size={14}/>} rows={live.snapshot.top_products} onPick={(row)=>setFilter("product",row.label)}/><MetricCard title="Sources" icon={<Radio size={14}/>} rows={live.snapshot.top_sources} onPick={(row)=>setFilter("source",row.label)}/><MetricCard title="Campaigns" icon={<Sparkles size={14}/>} rows={live.snapshot.top_campaigns} onPick={(row)=>setFilter("campaign",row.label)}/>{live.adminGlobal&&<><MetricCard title="Workspaces" icon={<Activity size={14}/>} rows={live.snapshot.top_workspaces} onPick={(row)=>setFilter("workspace_id",row.workspace_id??"")}/><LocationQualityPanel events={events} onSaved={()=>void live.refresh(true)}/></>}</aside>
    </div>
  </div>;
}
