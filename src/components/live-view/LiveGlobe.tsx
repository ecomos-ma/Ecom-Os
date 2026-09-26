import { useEffect, useMemo, useRef, useState } from "react";
import Globe from "react-globe.gl";
import * as THREE from "three";
import countriesRaw from "../../../node_modules/three-globe/example/country-polygons/ne_110m_admin_0_countries.geojson?raw";
import { mergeAdjacentGeoPolygons } from "../../lib/mergeAdjacentGeoPolygons";
import type { LiveOrderEvent } from "../../services/liveViewService";

type GlobePoint = LiveOrderEvent & { lat: number; lng: number; count: number; size: number };
type Position = [number, number];
type CountryFeature = { properties?: { NAME?: string; NAME_LONG?: string; MAPCOLOR13?: number }; geometry: { type: "Polygon"; coordinates: Position[][] } | { type: "MultiPolygon"; coordinates: Position[][][] } };
const isMorocco = (feature: CountryFeature) => feature.properties?.NAME === "Morocco";
const isSeparateWesternSaharaFeature = (feature: CountryFeature) => {
  const name = `${feature.properties?.NAME ?? ""} ${feature.properties?.NAME_LONG ?? ""}`.toLowerCase();
  return name.includes("w. sahara") || name.includes("western sahara");
};
const isMoroccoTerritory = (feature: CountryFeature) => isMorocco(feature) || isSeparateWesternSaharaFeature(feature);
type Props = {
  events: LiveOrderEvent[];
  pulseEvents: LiveOrderEvent[];
  effectsPaused: boolean;
  rotationPaused: boolean;
  focusToken: number;
  onSelect: (event: LiveOrderEvent) => void;
};

export default function LiveGlobe({ events, pulseEvents, effectsPaused, rotationPaused, focusToken, onSelect }: Props) {
  const ref = useRef<any>(null);
  const framedRef = useRef(false);
  const wrapRef = useRef<HTMLDivElement>(null);
  const [size, setSize] = useState({ width: 800, height: 640 });
  const reduced = typeof window !== "undefined" && window.matchMedia("(prefers-reduced-motion: reduce)").matches;
  const globeMaterial = useMemo(() => new THREE.MeshPhongMaterial({ color: "#f8edf3", emissive: "#55142f", emissiveIntensity: 0.055, shininess: 26 }), []);
  // The globe triangulator needs the two source polygons kept separately for a
  // reliable fill. Their shared edges are dissolved only for the exterior path.
  const { polygons, outlinePath } = useMemo(() => {
    const features = (JSON.parse(countriesRaw) as { features: CountryFeature[] }).features;
    const north = features.find(isMorocco);
    const south = features.find(isSeparateWesternSaharaFeature);
    const outline = north?.geometry.type === "Polygon" && south?.geometry.type === "Polygon"
      ? mergeAdjacentGeoPolygons(north.geometry.coordinates[0], south.geometry.coordinates[0]) : null;
    return {
      polygons: features.filter((feature) => !isMoroccoTerritory(feature)).concat(north && south ? [north, south] : []),
      outlinePath: outline?.map(([lng, lat]) => ({ lat, lng })) ?? [],
    };
  }, []);
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
    let frame = 0;
    const observer = new ResizeObserver(([entry]) => {
      cancelAnimationFrame(frame);
      frame = requestAnimationFrame(() => {
        const width = Math.max(1, Math.round(entry.contentRect.width));
        const height = Math.max(1, Math.round(entry.contentRect.height));
        setSize((current) => current.width === width && current.height === height ? current : { width, height });
      });
    });
    observer.observe(wrapRef.current);
    return () => { observer.disconnect(); cancelAnimationFrame(frame); };
  }, []);
  useEffect(() => {
    if (!ref.current) return;
    const controls = ref.current.controls();
    controls.autoRotate = !rotationPaused && !reduced;
    controls.autoRotateSpeed = 0.18;
    controls.enableDamping = true;
    controls.minDistance = 108;
    controls.maxDistance = 360;
    const areaBudgetRatio = Math.sqrt(1_800_000 / (size.width * size.height));
    ref.current.renderer().setPixelRatio(Math.max(0.65, Math.min(window.devicePixelRatio || 1, 1.5, areaBudgetRatio)));
    if (!framedRef.current) {
      ref.current.pointOfView({ lat: 28, lng: -10.5, altitude: 0.88 }, 0);
      framedRef.current = true;
    }
  }, [reduced, rotationPaused, size.height, size.width]);
  useEffect(() => {
    if (focusToken > 0) ref.current?.pointOfView({ lat: 28, lng: -10.5, altitude: 0.88 }, 850);
  }, [focusToken]);
  useEffect(() => {
    const syncVisibility = () => {
      if (document.hidden) ref.current?.pauseAnimation();
      else ref.current?.resumeAnimation();
    };
    document.addEventListener("visibilitychange", syncVisibility);
    return () => document.removeEventListener("visibilitychange", syncVisibility);
  }, []);

  return <div ref={wrapRef} className="live-globe-canvas" aria-label="Order activity globe">
    <Globe
      ref={ref}
      width={size.width}
      height={size.height}
      backgroundColor="rgba(0,0,0,0)"
      globeMaterial={globeMaterial}
      showAtmosphere atmosphereColor="#e4779d" atmosphereAltitude={0.12}
      showGraticules={false}
      polygonsData={polygons}
      polygonCapColor={(feature: object) => {
        if (isMoroccoTerritory(feature as CountryFeature)) return "#d9658d";
        const shade = Number((feature as CountryFeature).properties?.MAPCOLOR13 ?? 0) % 3;
        return ["#fbdde9", "#f5c9da", "#f8d3e1"][shade];
      }}
      polygonSideColor={(feature: object) => isMoroccoTerritory(feature as CountryFeature) ? "#b94c75" : "#e5a9c0"}
      polygonStrokeColor={(feature: object) => isMoroccoTerritory(feature as CountryFeature) ? "rgba(0,0,0,0)" : "#c7819f"}
      polygonAltitude={(feature: object) => isMoroccoTerritory(feature as CountryFeature) ? 0.012 : 0.004}
      polygonLabel={(feature: object) => `<b>${isMoroccoTerritory(feature as CountryFeature) ? "Morocco" : (feature as CountryFeature).properties?.NAME_LONG ?? (feature as CountryFeature).properties?.NAME ?? "Country"}</b>`}
      polygonsTransitionDuration={0}
      pathsData={outlinePath.length ? [{ points: outlinePath }] : []}
      pathPoints="points" pathPointLat="lat" pathPointLng="lng"
      pathColor={() => "#953c62"} pathStroke={0.3}
      pointsData={points}
      pointLat="lat" pointLng="lng" pointAltitude={0.025} pointRadius="size"
      pointColor={() => "#c82666"}
      pointLabel={(point: object) => { const p = point as GlobePoint; return `<b>${p.city ?? p.country ?? "Approximate location"}</b><br/>${p.count} order${p.count === 1 ? "" : "s"}`; }}
      onPointClick={(point: object) => onSelect(point as GlobePoint)}
      ringsData={rings} ringColor={() => ["rgba(219,106,143,.8)", "rgba(219,106,143,0)"]}
      ringMaxRadius="maxR" ringPropagationSpeed={1.8} ringRepeatPeriod={0}
      arcsData={arcs} arcColor={() => ["rgba(219,106,143,0)", "rgba(219,106,143,.9)"]}
      arcAltitude={0.28} arcStroke={0.42} arcDashLength={0.12} arcDashGap={1.35}
      arcDashInitialGap={(arc: object) => (arc as { order: number }).order * 0.08}
      arcDashAnimateTime={720}
    />
  </div>;
}
