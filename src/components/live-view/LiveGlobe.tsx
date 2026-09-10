import { useEffect, useMemo, useRef, useState } from "react";
import Globe from "react-globe.gl";
import * as THREE from "three";
import countriesRaw from "../../../node_modules/three-globe/example/country-polygons/ne_110m_admin_0_countries.geojson?raw";
import type { LiveOrderEvent } from "../../services/liveViewService";

type GlobePoint = LiveOrderEvent & { lat: number; lng: number; count: number; size: number };
type CountryFeature = { properties?: { NAME?: string; NAME_LONG?: string; MAPCOLOR13?: number } };
const isSeparateWesternSaharaFeature = (feature: CountryFeature) => {
  const name = `${feature.properties?.NAME ?? ""} ${feature.properties?.NAME_LONG ?? ""}`.toLowerCase();
  return name.includes("w. sahara") || name.includes("western sahara");
};
type Props = {
  events: LiveOrderEvent[];
  pulseEvents: LiveOrderEvent[];
  effectsPaused: boolean;
  rotationPaused: boolean;
  onSelect: (event: LiveOrderEvent) => void;
};

export default function LiveGlobe({ events, pulseEvents, effectsPaused, rotationPaused, onSelect }: Props) {
  const ref = useRef<any>(null);
  const framedRef = useRef(false);
  const wrapRef = useRef<HTMLDivElement>(null);
  const [size, setSize] = useState({ width: 800, height: 640 });
  const reduced = typeof window !== "undefined" && window.matchMedia("(prefers-reduced-motion: reduce)").matches;
  // Natural Earth's Morocco geometry already includes the full southern area.
  // Remove its overlapping standalone Sahara feature so the globe renders one
  // continuous Morocco polygon, without a duplicate hover label or inner seam.
  const polygons = useMemo(() => (JSON.parse(countriesRaw) as { features: CountryFeature[] }).features
    .filter((feature) => !isSeparateWesternSaharaFeature(feature)), []);
  const points = useMemo(() => {
    const clusters = new Map<string, GlobePoint>();
    for (const event of events.slice(0, 500)) {
      if (!Number.isFinite(event.latitude) || !Number.isFinite(event.longitude)) continue;
      const lat = Number(event.latitude), lng = Number(event.longitude);
      const key = `${lat.toFixed(2)}:${lng.toFixed(2)}`;
      const existing = clusters.get(key);
      if (existing) { existing.count += 1; existing.size = Math.min(0.75, 0.16 + Math.log2(existing.count + 1) * 0.12); }
      else clusters.set(key, { ...event, lat, lng, count: 1, size: 0.24 });
    }
    return [...clusters.values()].slice(0, 300);
  }, [events]);
  const rings = useMemo(() => effectsPaused || reduced ? [] : pulseEvents
    .filter((event) => Number.isFinite(event.latitude) && Number.isFinite(event.longitude))
    .slice(0, 16).map((event) => ({ lat: Number(event.latitude), lng: Number(event.longitude), maxR: 3.2 })), [effectsPaused, pulseEvents, reduced]);
  // Each newly-arrived order gets a short, bright meteor trail that terminates
  // at the customer's resolved city/IP location. Historical points stay static.
  const arcs = useMemo(() => effectsPaused || reduced ? [] : pulseEvents
    .filter((event) => Number.isFinite(event.latitude) && Number.isFinite(event.longitude))
    .slice(0, 12)
    .map((event, index) => {
      const endLat = Number(event.latitude);
      const endLng = Number(event.longitude);
      return {
        startLat: Math.max(-72, Math.min(72, endLat + 28 + (index % 3) * 4)),
        startLng: ((endLng - 55 - index * 7 + 540) % 360) - 180,
        endLat,
        endLng,
        order: index,
      };
    }), [effectsPaused, pulseEvents, reduced]);

  useEffect(() => {
    if (!wrapRef.current) return;
    const observer = new ResizeObserver(([entry]) => setSize({ width: entry.contentRect.width, height: entry.contentRect.height }));
    observer.observe(wrapRef.current);
    return () => observer.disconnect();
  }, []);
  useEffect(() => {
    if (!ref.current) return;
    const controls = ref.current.controls();
    controls.autoRotate = !rotationPaused && !reduced;
    controls.autoRotateSpeed = 0.28;
    controls.enableDamping = true;
    controls.minDistance = 130;
    controls.maxDistance = 320;
    ref.current.renderer().setPixelRatio(Math.min(window.devicePixelRatio, 1.5));
    if (!framedRef.current) {
      ref.current.pointOfView({ lat: 19, lng: -8, altitude: 1.55 }, 0);
      framedRef.current = true;
    }
  }, [reduced, rotationPaused]);

  return <div ref={wrapRef} className="live-globe-canvas" aria-label="Order activity globe">
    <Globe
      ref={ref}
      width={size.width}
      height={size.height}
      backgroundColor="rgba(0,0,0,0)"
      globeMaterial={new THREE.MeshPhongMaterial({ color: "#f8edf3", emissive: "#55142f", emissiveIntensity: 0.055, shininess: 26 })}
      showAtmosphere atmosphereColor="#e4779d" atmosphereAltitude={0.16}
      showGraticules
      polygonsData={polygons}
      polygonCapColor={(feature: object) => {
        const shade = Number((feature as CountryFeature).properties?.MAPCOLOR13 ?? 0) % 4;
        return ["rgba(252,216,228,.92)", "rgba(245,192,211,.9)", "rgba(238,174,199,.88)", "rgba(250,204,220,.9)"][shade];
      }}
      polygonSideColor={() => "rgba(173,54,98,.16)"}
      polygonStrokeColor={() => "rgba(112,35,65,.72)"}
      polygonAltitude={0.009}
      polygonLabel={(feature: object) => `<b>${(feature as CountryFeature).properties?.NAME_LONG ?? (feature as CountryFeature).properties?.NAME ?? "Country"}</b>`}
      polygonsTransitionDuration={0}
      pointsData={points}
      pointLat="lat" pointLng="lng" pointAltitude={0.025} pointRadius="size"
      pointColor={() => "#c82666"}
      pointLabel={(point: object) => { const p = point as GlobePoint; return `<b>${p.city ?? p.country ?? "Approximate location"}</b><br/>${p.count} order${p.count === 1 ? "" : "s"}`; }}
      onPointClick={(point: object) => onSelect(point as GlobePoint)}
      ringsData={rings} ringColor={() => ["rgba(219,106,143,.78)", "rgba(219,106,143,0)"]}
      ringMaxRadius="maxR" ringPropagationSpeed={1.8} ringRepeatPeriod={0}
      arcsData={arcs} arcColor={() => ["rgba(219,106,143,0)", "rgba(200,38,102,.95)"]}
      arcAltitude={0.28} arcStroke={0.42} arcDashLength={0.12} arcDashGap={1.35}
      arcDashInitialGap={(arc: object) => (arc as { order: number }).order * 0.08}
      arcDashAnimateTime={720}
    />
  </div>;
}
