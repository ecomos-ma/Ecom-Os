import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

type RecordingRow = {
  id: string;
  workspace_id: string;
  storage_path: string | null;
};

const json = (body: Record<string, unknown>, status = 200) => new Response(
  JSON.stringify(body),
  { status, headers: { "Content-Type": "application/json" } },
);

serve(async (request) => {
  if (request.method !== "POST") return json({ error: "METHOD_NOT_ALLOWED" }, 405);

  const schedulerSecret = Deno.env.get("CALL_RECORDING_CLEANUP_SECRET");
  if (!schedulerSecret || request.headers.get("x-call-recording-cleanup-secret") !== schedulerSecret) {
    return json({ error: "UNAUTHORIZED" }, 401);
  }

  const url = Deno.env.get("SUPABASE_URL");
  const serviceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
  if (!url || !serviceRoleKey) return json({ error: "SERVER_CONFIGURATION_ERROR" }, 500);

  const supabase = createClient(url, serviceRoleKey, {
    auth: { autoRefreshToken: false, persistSession: false },
  });
  const now = new Date().toISOString();
  const batchSize = 100;

  const { data: recordings, error: queryError } = await supabase
    .from("confirmation_call_recordings")
    .select("id, workspace_id, storage_path")
    .lte("expires_at", now)
    .is("expired_at", null)
    .not("storage_path", "is", null)
    .order("expires_at", { ascending: true })
    .limit(batchSize);

  if (queryError) {
    console.error("[recording-cleanup] failed to find expired recordings", queryError);
    return json({ error: "RECORDING_QUERY_FAILED" }, 500);
  }

  let expired = 0;
  let failed = 0;
  for (const recording of (recordings ?? []) as RecordingRow[]) {
    if (!recording.storage_path) continue;

    const { error: deleteError } = await supabase.storage
      .from("call-recordings")
      .remove([recording.storage_path]);

    const alreadyAbsent = Boolean(deleteError && /not found|does not exist/i.test(deleteError.message));
    if (deleteError && !alreadyAbsent) {
      failed += 1;
      await supabase
        .from("confirmation_call_recordings")
        .update({ cleanup_attempted_at: now })
        .eq("id", recording.id)
        .eq("workspace_id", recording.workspace_id)
        .is("expired_at", null);
      console.warn("[recording-cleanup] storage deletion will retry", {
        recordingId: recording.id,
        message: deleteError.message,
      });
      continue;
    }

    const { error: updateError } = await supabase
      .from("confirmation_call_recordings")
      .update({
        expired_at: now,
        cleanup_attempted_at: now,
        storage_path: null,
      })
      .eq("id", recording.id)
      .eq("workspace_id", recording.workspace_id)
      .is("expired_at", null);

    if (updateError) {
      // The object is already gone. Leaving the row eligible is safe and the
      // next run will retry marking metadata without touching business data.
      failed += 1;
      console.error("[recording-cleanup] metadata update failed", {
        recordingId: recording.id,
        message: updateError.message,
      });
      continue;
    }
    expired += 1;
  }

  return json({
    scanned: recordings?.length ?? 0,
    expired,
    failed,
    hasMore: (recordings?.length ?? 0) === batchSize,
  });
});
