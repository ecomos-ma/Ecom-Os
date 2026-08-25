import { useMemo } from "react";
import { useGlobalOrders } from "../contexts/OrdersContext";
import type { Order } from "../lib/types";
import { normalizeStatus } from "../lib/statusEngine";

type UseOrdersFilters = {
  status?: string | string[];
  search?: string;
  startDate?: Date;
  endDate?: Date;
};

export function useOrders(filters: UseOrdersFilters = {}) {
  const { globalOrders, loading, reloadGlobalOrders } = useGlobalOrders();

  const q = useMemo(() => (filters.search || "").toLowerCase().trim(), [filters.search]);

  const parseDateFlexible = useMemo(
    () => (raw: any): Date | null => {
      if (!raw && raw !== 0) return null;
      if (raw instanceof Date) return isNaN(raw.getTime()) ? null : raw;
      const s = String(raw).trim();
      const d = new Date(s);
      return isNaN(d.getTime()) ? null : d;
    },
    []
  );

  const filtered = useMemo(() => {
    const base = globalOrders.filter((o) => {
      if (filters.startDate || filters.endDate) {
        const rawDate = (o as any).created_at || (o as any).createdAt || (o as any).order_date;
        const od = parseDateFlexible(rawDate);
        if (!od) return false;
        if (filters.startDate && od < filters.startDate) return false;
        if (filters.endDate && od > filters.endDate) return false;
      }

      if (q) {
        const hay = `${String(o.order_number || "").toLowerCase()} ${String(o.customer?.name || "").toLowerCase()} ${String(o.customer?.phone || "").toLowerCase()} ${String(o.address || "").toLowerCase()}`;
        return hay.includes(q);
      }

      return true;
    });

    if (filters.status && filters.status !== "all") {
      if (Array.isArray(filters.status)) {
        const statuses = filters.status.map((s) => normalizeStatus(String(s)));
        return base.filter((o) => statuses.includes(normalizeStatus(o.status)));
      }
      return base.filter((o) => normalizeStatus(o.status) === normalizeStatus(String(filters.status)));
    }

    return base;
  }, [globalOrders, q, filters.status, filters.startDate?.getTime(), filters.endDate?.getTime(), parseDateFlexible]);

  const counts = useMemo(
    () =>
      filtered.reduce(
        (acc, o) => {
          const key = normalizeStatus(o.status);
          switch (key) {
            case "confirmed":
              acc.confirmed++;
              break;
            case "cancelled":
              acc.cancelled++;
              break;
            case "refused":
              acc.refused++;
              break;
            case "no_answer":
              acc.noAnswer++;
              break;
            case "pending":
              acc.pending++;
              break;
            case "shipped":
              acc.shipped++;
              break;
            case "delivered":
              acc.delivered++;
              break;
            case "returned":
              acc.returned++;
              break;
            case "new":
              acc.contacted++;
              break;
            default:
              acc.other++;
          }
          return acc;
        },
        { confirmed: 0, cancelled: 0, noAnswer: 0, shipped: 0, delivered: 0, returned: 0, pending: 0, refused: 0, other: 0, contacted: 0 }
      ),
    [filtered]
  );

  return { orders: filtered, loading, reload: reloadGlobalOrders, statusCounts: counts, total: filtered.length };
}
