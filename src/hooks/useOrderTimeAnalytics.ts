import { useEffect, useState } from "react";
import { getOrdersByHour, getPeakOrderHours, HourBucket, PeakResult } from "../services/analyticsService";

export function useOrderTimeAnalytics(startDate: Date, endDate: Date) {
  const [data, setData] = useState<HourBucket[]>(() => Array.from({ length: 24 }).map((_, i) => ({ hour: `${String(i).padStart(2, "0")}:00`, orders: 0 })));
  const [peak, setPeak] = useState<PeakResult | null>(null);
  const [loading, setLoading] = useState<boolean>(true);
  const [error, setError] = useState<Error | null>(null);

  useEffect(() => {
    let cancelled = false;
    async function load() {
      setLoading(true);
      setError(null);
      try {
        console.log("useOrderTimeAnalytics start/end:", startDate.toISOString(), endDate.toISOString());
        const buckets = await getOrdersByHour(startDate, endDate);
        console.log("Orders by hour:", buckets);
        if (cancelled) return;
        // Ensure all 24 hours present and ordered
        const normalized = Array.from({ length: 24 }).map((_, i) => {
          const label = `${String(i).padStart(2, "0")}:00`;
          const found = (buckets || []).find(b => b.hour === label);
          return { hour: label, orders: found ? found.orders : 0 };
        });
        setData(normalized);
        console.log("Chart Data:", normalized);
        try {
          const p = await getPeakOrderHours(startDate, endDate);
          if (!cancelled) setPeak(p);
        } catch (e) {
          // fallback compute peak locally
          const best = normalized.reduce((acc, b) => (b.orders > acc.orders ? b : acc), { hour: "00:00", orders: 0 });
          if (!cancelled) setPeak({ bestHour: best.hour, orders: best.orders, averagePerHour: normalized.reduce((s, x) => s + x.orders, 0) / 24 });
        }
      } catch (e: any) {
        if (!cancelled) setError(e instanceof Error ? e : new Error(String(e)));
      } finally {
        if (!cancelled) setLoading(false);
      }
    }
    load();
    return () => { cancelled = true; };
  }, [startDate.toISOString(), endDate.toISOString()]);

  return { data, peak, loading, error } as const;
}
