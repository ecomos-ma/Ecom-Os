import { requiredYouCanEnv } from "./youcan.ts";

declare const EdgeRuntime: { waitUntil(promise: Promise<unknown>): void };

export function processYouCanJobInBackground(jobId: string, workspaceId: string): void {
  const baseUrl = requiredYouCanEnv("SUPABASE_URL").replace(/\/$/, "");
  const internalSecret = requiredYouCanEnv("YOUCAN_CRON_SECRET");
  EdgeRuntime.waitUntil((async () => {
    const reconcile = await fetch(`${baseUrl}/functions/v1/youcan-reconcile`, {
      method: "POST",
      headers: { "content-type": "application/json", "x-youcan-cron-secret": internalSecret },
      body: JSON.stringify({ job_id: jobId }),
    });
    if (!reconcile.ok) throw new Error(`reconcile_${reconcile.status}`);
  })().catch((error) => {
    console.error("[YouCan background] immediate processing failed", error instanceof Error ? error.message : "background_failed");
  }));
}
