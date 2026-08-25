import { supabase } from "../lib/supabase";

export interface HourBucket {
  hour: string;
  orders: number;
}

export interface PeakResult {
  bestHour: string;
  orders: number;
  averagePerHour: number;
}

function toISO(ts: Date | string) {
  if (ts instanceof Date) return ts.toISOString();
  return new Date(String(ts)).toISOString();
}

export async function getOrdersByHour(startDate: Date | string, endDate: Date | string): Promise<HourBucket[]> {
  const start_ts = toISO(startDate);
  const end_ts = toISO(endDate);
  const { data, error } = await supabase.rpc("get_orders_by_hour", { start_ts, end_ts });
  if (error) {
    console.error("getOrdersByHour RPC error:", error, { start_ts, end_ts });
    throw error;
  }
  console.log("Orders by hour:", data);
  // data is an array of { hour, orders }
  return (data || []).map((r: any) => ({ hour: String(r.hour), orders: Number(r.orders || 0) }));
}

export async function getPeakOrderHours(startDate: Date | string, endDate: Date | string): Promise<PeakResult> {
  const start_ts = toISO(startDate);
  const end_ts = toISO(endDate);
  const { data, error } = await supabase.rpc("get_peak_order_hours", { start_ts, end_ts });
  if (error) throw error;
  const row = (data && (data as any)[0]) || data || {};
  return {
    bestHour: row.best_hour || row.bestHour || "00:00",
    orders: Number(row.orders || 0),
    averagePerHour: Number(row.average_per_hour || row.averagePerHour || 0),
  };
}
