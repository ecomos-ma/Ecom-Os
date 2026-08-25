import { useState, useEffect, useCallback } from "react";
import { supabase } from "../lib/supabase";
import { useAuth } from "./useAuth";

export interface CostRule {
  id: string;
  name: string;
  amount: number;
  trigger: "entered" | "confirmed" | "delivered";
  enabled: boolean;
}

export function useCostRules() {
  const { workspace } = useAuth();
  const [rules, setRules] = useState<CostRule[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!workspace?.id) {
      setRules([]);
      setLoading(false);
      return;
    }

    const fetchRules = async () => {
      try {
        const { data, error } = await supabase
          .from("workspace_cost_rules")
          .select("*")
          .eq("workspace_id", workspace.id)
          .order("created_at", { ascending: true });

        if (error) {
          console.error("Failed to fetch cost rules:", error);
          setRules([]);
        } else {
          setRules(data || []);
        }
      } catch (err) {
        console.error("Error fetching cost rules:", err);
        setRules([]);
      } finally {
        setLoading(false);
      }
    };

    fetchRules();
  }, [workspace?.id]);

  const addRule = useCallback(async (rule: Omit<CostRule, "id">) => {
    if (!workspace?.id) return;

    try {
      const { data, error } = await supabase
        .from("workspace_cost_rules")
        .insert({ ...rule, workspace_id: workspace.id })
        .select()
        .single();

      if (error) throw error;
      setRules(prev => [...prev, data]);
    } catch (err) {
      console.error("Error adding cost rule:", err);
      throw err;
    }
  }, [workspace?.id]);

  const updateRule = useCallback(async (id: string, updates: Partial<CostRule>) => {
    try {
      const { error } = await supabase
        .from("workspace_cost_rules")
        .update(updates)
        .eq("id", id);

      if (error) throw error;
      setRules(prev => prev.map(r => r.id === id ? { ...r, ...updates } : r));
    } catch (err) {
      console.error("Error updating cost rule:", err);
      throw err;
    }
  }, []);

  const deleteRule = useCallback(async (id: string) => {
    try {
      const { error } = await supabase
        .from("workspace_cost_rules")
        .delete()
        .eq("id", id);

      if (error) throw error;
      setRules(prev => prev.filter(r => r.id !== id));
    } catch (err) {
      console.error("Error deleting cost rule:", err);
      throw err;
    }
  }, []);

  const toggleRule = useCallback(async (id: string, enabled?: boolean) => {
    try {
      const rule = rules.find(r => r.id === id);
      if (!rule) return;

      const newEnabled = enabled !== undefined ? enabled : !rule.enabled;
      const { error } = await supabase
        .from("workspace_cost_rules")
        .update({ enabled: newEnabled })
        .eq("id", id);

      if (error) throw error;
      setRules(prev => prev.map(r => r.id === id ? { ...r, enabled: newEnabled } : r));
    } catch (err) {
      console.error("Error toggling cost rule:", err);
      throw err;
    }
  }, [rules]);

  return { rules, loading, addRule, updateRule, deleteRule, toggleRule };
}
