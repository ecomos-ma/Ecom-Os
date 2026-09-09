import { useEffect, useMemo, useState } from "react";
import { MapPinned } from "lucide-react";
import { fetchLiveViewCities, saveLiveViewCityAlias, type LiveOrderEvent, type LiveViewCity } from "../../services/liveViewService";

export function LocationQualityPanel({ events, onSaved }: { events: LiveOrderEvent[]; onSaved: () => void }) {
  const [cities,setCities] = useState<LiveViewCity[]>([]);
  const [source,setSource] = useState("");
  const [target,setTarget] = useState("");
  const [saving,setSaving] = useState(false);
  const [message,setMessage] = useState("");
  const unresolved = useMemo(() => {
    const map = new Map<string,LiveOrderEvent>();
    events.filter((event)=>event.latitude===null && event.city).forEach((event)=>map.set(`${event.workspace_id}:${event.city}`,event));
    return [...map.values()].slice(0,30);
  },[events]);
  useEffect(()=>{ void fetchLiveViewCities().then(setCities).catch(()=>setCities([])); },[]);
  const save = async () => {
    const selected=unresolved.find((event)=>`${event.workspace_id}:${event.city}`===source);
    if(!selected?.city || !target) return;
    setSaving(true);setMessage("");
    try { await saveLiveViewCityAlias(selected.workspace_id,selected.city,Number(target)); setMessage("Mapping saved"); onSaved(); }
    catch(error){ setMessage(error instanceof Error?error.message:"Mapping failed"); }
    finally{setSaving(false);}
  };
  return <section className="live-metric-card"><div className="live-metric-head"><MapPinned size={14}/>Location quality</div>
    <div className="mb-2 text-[11px] text-[#806873]">{unresolved.length} recent unmapped {unresolved.length===1?"city":"cities"}</div>
    {unresolved.length>0&&<div className="grid gap-2"><select className="live-filter !max-w-none !w-full" value={source} onChange={(e)=>setSource(e.target.value)}><option value="">Unmapped city…</option>{unresolved.map((event)=><option key={`${event.workspace_id}:${event.city}`} value={`${event.workspace_id}:${event.city}`}>{event.city} · {event.workspace_name??event.workspace_id.slice(0,6)}</option>)}</select><select className="live-filter !max-w-none !w-full" value={target} onChange={(e)=>setTarget(e.target.value)}><option value="">Map to…</option>{cities.map((city)=><option key={city.id} value={city.id}>{city.canonical_name} · {city.country_code}</option>)}</select><button className="rounded-xl bg-[#db6a8f] px-3 py-2 text-[11px] font-extrabold text-white disabled:opacity-50" disabled={!source||!target||saving} onClick={()=>void save()}>{saving?"Saving…":"Save mapping"}</button>{message&&<div className="text-[10px] text-[#806873]">{message}</div>}</div>}
  </section>;
}
