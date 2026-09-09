import { useEffect, useMemo, useRef, useState } from "react";
import Globe from "react-globe.gl";
import * as THREE from "three";
import land from "../../assets/ne_110m_land.json";
import type { LiveOrderEvent } from "../../services/liveViewService";

type GlobePoint = LiveOrderEvent & { lat: number; lng: number; count: number; size: number };
type Props = {
  events: LiveOrderEvent[];
  pulseEvents: LiveOrderEvent[];
  effectsPaused: boolean;
  rotationPaused: boolean;
  onSelect: (event: LiveOrderEvent) => void;
};

export default function LiveGlobe({ events, pulseEvents, effectsPaused, rotationPaused, onSelect }: Props) {
  const ref = useRef<any>(null);
  const wrapRef = useRef<HTMLDivElement>(null);
  const [size, setSize] = useState({ width: 800, height: 640 });
  const reduced = typeof window !== "undefined" && window.matchMedia("(prefers-reduced-motion: reduce)").matches;
  const polygons = (land as { features: object[] }).features;
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
  const arcs = useMemo(() => effectsPaused || reduced ? [] : points.slice(1, 14).map((point, index) => ({
    startLat: points[0]?.lat ?? point.lat, startLng: points[0]?.lng ?? point.lng,
    endLat: point.lat, endLng: point.lng, order: index,
  })), [effectsPaused, points, reduced]);

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
    controls.minDistance = 155;
    controls.maxDistance = 350;
    ref.current.renderer().setPixelRatio(Math.min(window.devicePixelRatio, 1.5));
  }, [reduced, rotationPaused]);

  return <div ref={wrapRef} className="live-globe-canvas" aria-label="Order activity globe">
    <Globe
      ref={ref}
      width={size.width}
      height={size.height}
      backgroundColor="rgba(0,0,0,0)"
      globeMaterial={new THREE.MeshPhongMaterial({ color: "#fff8fb", emissive: "#2c0718", emissiveIntensity: 0.035, shininess: 34 })}
      showAtmosphere atmosphereColor="#db6a8f" atmosphereAltitude={0.12}
      polygonsData={polygons}
      polygonCapColor={() => "rgba(244,196,213,.48)"}
      polygonSideColor={() => "rgba(219,106,143,.08)"}
      polygonStrokeColor={() => "rgba(132,49,79,.26)"}
      polygonAltitude={0.006}
      pointsData={points}
      pointLat="lat" pointLng="lng" pointAltitude={0.025} pointRadius="size"
      pointColor={() => "#c82666"}
      pointLabel={(point: object) => { const p = point as GlobePoint; return `<b>${p.city ?? p.country ?? "Approximate location"}</b><br/>${p.count} order${p.count === 1 ? "" : "s"}`; }}
      onPointClick={(point: object) => onSelect(point as GlobePoint)}
      ringsData={rings} ringColor={() => ["rgba(219,106,143,.78)", "rgba(219,106,143,0)"]}
      ringMaxRadius="maxR" ringPropagationSpeed={1.8} ringRepeatPeriod={0}
      arcsData={arcs} arcColor={() => ["rgba(219,106,143,.08)", "rgba(200,38,102,.5)"]}
      arcAltitude={0.12} arcStroke={0.22} arcDashLength={0.34} arcDashGap={1.2} arcDashAnimateTime={1800}
    />
  </div>;
}
