import { useEffect, useMemo, useRef, useState } from "react";
import Globe from "react-globe.gl";
import * as THREE from "three";
import countriesRaw from "../../../node_modules/three-globe/example/country-polygons/ne_110m_admin_0_countries.geojson?raw";
import type { LiveOrderEvent } from "../../services/liveViewService";

type CountryFeature = { properties?: { NAME?: string; NAME_LONG?: string } };
type GlobePoint = {
  lat: number;
  lng: number;
  count: number;
  radius: number;
  city: string | null;
  country: string | null;
  events: LiveOrderEvent[];
};
type Props = {
  events: LiveOrderEvent[];
  pulseEvents: LiveOrderEvent[];
  effectsPaused: boolean;
  rotationPaused: boolean;
  focusToken: number;
  resetToken: number;
  onSelect: (events: LiveOrderEvent[]) => void;
};

const validCoordinate = (event: LiveOrderEvent) => Number.isFinite(event.latitude) && Number.isFinite(event.longitude);
const escapeLabel = (value: string) => value.replace(/[&<>"']/g, (character) => ({
  "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#039;",
}[character] || character));

export default function LiveGlobe({ events, pulseEvents, effectsPaused, rotationPaused, focusToken, resetToken, onSelect }: Props) {
  const globeRef = useRef<any>(null);
  const wrapRef = useRef<HTMLDivElement>(null);
  const framedRef = useRef(false);
  const lastPulseRef = useRef<string | null>(null);
  const [size, setSize] = useState({ width: 800, height: 640 });
  const [clusterPrecision, setClusterPrecision] = useState(1);
  const reducedMotion = typeof window !== "undefined" && window.matchMedia("(prefers-reduced-motion: reduce)").matches;
  const countries = useMemo(() => (JSON.parse(countriesRaw) as { features: CountryFeature[] }).features, []);
  const oceanMaterial = useMemo(() => new THREE.MeshPhongMaterial({
    color: "#fdf8fa",
    emissive: "#eed8e1",
    emissiveIntensity: 0.23,
    shininess: 16,
    specular: new THREE.Color("#fffafd"),
  }), []);

  const points = useMemo(() => {
    const clusters = new Map<string, GlobePoint>();
    for (const event of events.slice(0, 600)) {
      if (!validCoordinate(event)) continue;
      const lat = Number(event.latitude);
      const lng = Number(event.longitude);
      const key = `${lat.toFixed(clusterPrecision)}:${lng.toFixed(clusterPrecision)}`;
      const cluster = clusters.get(key);
      if (cluster) {
        cluster.events.push(event);
        cluster.count += 1;
        cluster.lat = cluster.events.reduce((sum, item) => sum + Number(item.latitude), 0) / cluster.count;
        cluster.lng = cluster.events.reduce((sum, item) => sum + Number(item.longitude), 0) / cluster.count;
        cluster.radius = Math.min(0.42, 0.12 + Math.log2(cluster.count + 1) * 0.055);
      } else {
        clusters.set(key, { lat, lng, count: 1, radius: 0.15, city: event.city, country: event.country, events: [event] });
      }
    }
    return [...clusters.values()].slice(0, 350);
  }, [clusterPrecision, events]);

  const rings = useMemo(() => effectsPaused || reducedMotion ? [] : pulseEvents
    .filter(validCoordinate).slice(0, 14)
    .map((event) => ({ lat: Number(event.latitude), lng: Number(event.longitude), maxRadius: 2.2 })),
  [effectsPaused, pulseEvents, reducedMotion]);

  useEffect(() => {
    if (!wrapRef.current) return;
    let frame = 0;
    const observer = new ResizeObserver(([entry]) => {
      cancelAnimationFrame(frame);
      frame = requestAnimationFrame(() => {
        const next = { width: Math.max(1, Math.round(entry.contentRect.width)), height: Math.max(1, Math.round(entry.contentRect.height)) };
        setSize((current) => current.width === next.width && current.height === next.height ? current : next);
      });
    });
    observer.observe(wrapRef.current);
    return () => { observer.disconnect(); cancelAnimationFrame(frame); };
  }, []);

  useEffect(() => {
    const globe = globeRef.current;
    if (!globe) return;
    const controls = globe.controls();
    controls.autoRotate = !rotationPaused && !reducedMotion;
    controls.autoRotateSpeed = 0.22;
    controls.enableDamping = true;
    controls.dampingFactor = 0.08;
    controls.minDistance = 108;
    controls.maxDistance = 430;
    const areaRatio = Math.sqrt(1_900_000 / Math.max(1, size.width * size.height));
    globe.renderer().setPixelRatio(Math.max(0.7, Math.min(window.devicePixelRatio || 1, 1.6, areaRatio)));
    if (!framedRef.current) {
      globe.pointOfView({ lat: 29.5, lng: -8.5, altitude: 1.48 }, 0);
      framedRef.current = true;
    }
  }, [reducedMotion, rotationPaused, size.height, size.width]);

  useEffect(() => {
    if (focusToken > 0) globeRef.current?.pointOfView({ lat: 29.5, lng: -8.5, altitude: 0.78 }, reducedMotion ? 0 : 900);
  }, [focusToken, reducedMotion]);
  useEffect(() => {
    if (resetToken > 0) globeRef.current?.pointOfView({ lat: 18, lng: -5, altitude: 1.55 }, reducedMotion ? 0 : 900);
  }, [resetToken, reducedMotion]);
  useEffect(() => {
    if (effectsPaused) return;
    const newest = pulseEvents.find(validCoordinate);
    if (!newest || newest.order_id === lastPulseRef.current) return;
    lastPulseRef.current = newest.order_id;
    globeRef.current?.pointOfView({ lat: Number(newest.latitude), lng: Number(newest.longitude), altitude: 0.68 }, reducedMotion ? 0 : 1100);
  }, [effectsPaused, pulseEvents, reducedMotion]);
  useEffect(() => {
    const syncVisibility = () => document.hidden ? globeRef.current?.pauseAnimation() : globeRef.current?.resumeAnimation();
    document.addEventListener("visibilitychange", syncVisibility);
    return () => document.removeEventListener("visibilitychange", syncVisibility);
  }, []);
  useEffect(() => () => oceanMaterial.dispose(), [oceanMaterial]);

  return <div ref={wrapRef} className="live-globe-canvas" aria-label="Real-time order activity Earth">
    <Globe
      ref={globeRef}
      width={size.width}
      height={size.height}
      backgroundColor="rgba(250,249,251,0)"
      globeMaterial={oceanMaterial}
      showAtmosphere
      atmosphereColor="#f6dce8"
      atmosphereAltitude={0.13}
      showGraticules={false}
      polygonsData={countries}
      polygonCapColor={() => "#f8dce8"}
      polygonSideColor={() => "#e9b7ca"}
      polygonStrokeColor={() => "#d48ba7"}
      polygonAltitude={0.006}
      polygonLabel={(feature: object) => escapeLabel((feature as CountryFeature).properties?.NAME_LONG ?? (feature as CountryFeature).properties?.NAME ?? "")}
      polygonsTransitionDuration={0}
      pointsData={points}
      pointLat="lat"
      pointLng="lng"
      pointAltitude={0.018}
      pointRadius="radius"
      pointColor={() => "#f0447d"}
      pointLabel={(point: object) => {
        const item = point as GlobePoint;
        return `<b>${escapeLabel(item.city ?? item.country ?? "Verified location")}</b><br>${item.count} order${item.count === 1 ? "" : "s"}`;
      }}
      onPointClick={(point: object) => {
        const item = point as GlobePoint;
        globeRef.current?.pointOfView({ lat: item.lat, lng: item.lng, altitude: item.count > 1 ? 0.48 : 0.62 }, reducedMotion ? 0 : 700);
        onSelect(item.events);
      }}
      ringsData={rings}
      ringLat="lat"
      ringLng="lng"
      ringColor={() => ["rgba(240,68,125,.72)", "rgba(240,68,125,0)"]}
      ringMaxRadius="maxRadius"
      ringPropagationSpeed={1.5}
      ringRepeatPeriod={0}
      onZoom={(view: { altitude: number }) => {
        const precision = view.altitude > 1.2 ? 0 : view.altitude > 0.55 ? 1 : 2;
        setClusterPrecision((current) => current === precision ? current : precision);
      }}
    />
  </div>;
}
