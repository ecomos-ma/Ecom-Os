import { useState, useEffect, useCallback } from "react";
import { supabase } from "../lib/supabase";
import { useAuth } from "./useAuth";

export interface SkuCostEntry {
  id: string;
  sku: string;
  cost: number;
}

export function useAffiliateCosts() {
  const { workspace } = useAuth();

  const [skuCostsList, setSkuCostsList] = useState<SkuCostEntry[]>([]);
  const [loading, setLoading] = useState(true);

  // ── Map form for the profit engine ─────────────────────────────────────────
  const skuCosts: Map<string, number> = new Map(
    skuCostsList.map((s) => [s.sku, s.cost])
  );

  // ── Fetch ────────────────────────────────────────────────────────────────────
  useEffect(() => {
    if (!workspace?.id) {
      setLoading(false);
      return;
    }

    let isMounted = true;
    const fetchAll = async () => {
      try {
        // SKU cost overrides
        const { data: skus } = await supabase
          .from("workspace_affiliate_sku_costs")
          .select("id, sku, cost")
          .eq("workspace_id", workspace.id)
          .order("sku", { ascending: true });

        if (isMounted) {
          setSkuCostsList((skus as SkuCostEntry[]) ?? []);
        }
      } catch (err) {
        console.error("useAffiliateCosts fetch error:", err);
      } finally {
        if (isMounted) setLoading(false);
      }
    };

    fetchAll();
    return () => { isMounted = false; };
  }, [workspace?.id]);

  // ── Upsert a SKU cost override ───────────────────────────────────────────────
  const upsertSkuCost = useCallback(
    async (sku: string, cost: number) => {
      if (!workspace?.id) return;
      const trimmed = sku.trim().toUpperCase();

      // Optimistic update
      setSkuCostsList((prev) => {
        const existing = prev.find((s) => s.sku === trimmed);
        if (existing) {
          return prev.map((s) => (s.sku === trimmed ? { ...s, cost } : s));
        }
        return [...prev, { id: crypto.randomUUID(), sku: trimmed, cost }];
      });

      const { data, error } = await supabase
        .from("workspace_affiliate_sku_costs")
        .upsert(
          { workspace_id: workspace.id, sku: trimmed, cost },
          { onConflict: "workspace_id,sku" }
        )
        .select("id, sku, cost")
        .single();

      if (error) {
        console.error("upsertSkuCost error:", error);
      } else if (data) {
        // Replace optimistic entry with real id
        setSkuCostsList((prev) =>
          prev.map((s) => (s.sku === trimmed ? (data as SkuCostEntry) : s))
        );
      }
    },
    [workspace?.id]
  );

  // ── Delete a SKU cost override ───────────────────────────────────────────────
  const deleteSkuCost = useCallback(
    async (id: string) => {
      if (!workspace?.id) return;
      setSkuCostsList((prev) => prev.filter((s) => s.id !== id)); // optimistic
      const { error } = await supabase
        .from("workspace_affiliate_sku_costs")
        .delete()
        .eq("id", id);
      if (error) console.error("deleteSkuCost error:", error);
    },
    [workspace?.id]
  );

  return {
    skuCosts,        // Map<string,number> — for the profit engine
    skuCostsList,    // SkuCostEntry[]    — for the table display
    loading,
    upsertSkuCost,
    deleteSkuCost,
  };
}
