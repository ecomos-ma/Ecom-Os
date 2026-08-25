import { useEffect, useState, useCallback } from "react";
import { supabase } from "../lib/supabase";
import type { IntegrationStatus } from "../lib/types";

export function useIntegrations() {
  const [statuses, setStatuses] = useState<Record<string, IntegrationStatus>>({});
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    setLoading(true);
    // integration_status is a VIEW that exposes only provider/connected/connected_at —
    // never the access_token/refresh_token columns. See supabase/migrations.
    const { data } = await supabase.from("integration_status").select("*");
    const map: Record<string, IntegrationStatus> = {};
    (data ?? []).forEach((row: any) => {
      map[row.provider] = row;
    });
    setStatuses(map);
    setLoading(false);
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  const disconnect = async (provider: "google" | "youcan") => {
    await supabase.functions.invoke("disconnect-integration", { body: { provider } });
    load();
  };

  return { statuses, loading, reload: load, disconnect };
}
