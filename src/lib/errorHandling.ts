import { supabase } from "./supabase";

export type EcomError = {
  errorId: string;
  errorCode: string;
  userMessage: string;
  source: string;
  severity: "info" | "warning" | "error" | "critical";
  retryable: boolean;
  cta?: string;
  technicalMessage?: string;
};

const id = () => `ERR-${Math.random().toString(36).slice(2, 7).toUpperCase()}`;

export function normalizeError(error: unknown, source = "app"): EcomError {
  const raw = error as any;
  const status = Number(raw?.status || raw?.code || 0);
  const message = String(raw?.message || raw || "").toLowerCase();
  let errorCode = "INTERNAL_ERROR";
  let userMessage = "We couldn't complete this request. Please try again.";
  let retryable = false;
  let severity: EcomError["severity"] = "error";
  if ((typeof navigator !== "undefined" && !navigator.onLine) || /network|fetch|offline|failed to fetch/.test(message)) { errorCode = "NETWORK_ERROR"; userMessage = "You're offline or your connection was interrupted. Check your connection and try again."; retryable = true; severity = "warning"; }
  else if (status === 401 || /jwt|token.*expired|unauthorized/.test(message)) { errorCode = "AUTH_EXPIRED"; userMessage = "Your session has expired. Please sign in again."; }
  else if (status === 403 || /permission|forbidden|rls/.test(message)) { errorCode = "PERMISSION_DENIED"; userMessage = "You don't have permission to perform this action."; }
  else if (status === 408 || /timeout|timed out/.test(message)) { errorCode = "TIMEOUT"; userMessage = "The request took too long. Please try again."; retryable = true; }
  else if (status === 429 || /rate limit/.test(message)) { errorCode = "RATE_LIMIT"; userMessage = "Too many requests. Please wait a moment and try again."; retryable = true; severity = "warning"; }
  else if (/required|missing|invalid/.test(message)) { errorCode = "VALIDATION_ERROR"; userMessage = "Please check the highlighted fields and try again."; }
  return { errorId: id(), errorCode, userMessage, source, severity, retryable, technicalMessage: String(raw?.message || "").slice(0, 500) };
}

export async function reportError(error: unknown, source: string, context: Record<string, unknown> = {}): Promise<EcomError> {
  const normalized = normalizeError(error, source);
  const { data } = await supabase.auth.getUser();
  const workspaceId = typeof context.workspace_id === "string" ? context.workspace_id : null;
  void (async () => {
    const base = { workspace_id: workspaceId, module: source, error_code: normalized.errorCode, safe_message: normalized.userMessage, resolved_status: "open" };
    const existing = await supabase.from("ecom_error_events").select("id,occurrence_count").match(base).maybeSingle();
    if (existing.data?.id) {
      await supabase.from("ecom_error_events").update({ occurrence_count: Number(existing.data.occurrence_count || 1) + 1, last_seen_at: new Date().toISOString(), metadata: { retryable: normalized.retryable, ...context } }).eq("id", existing.data.id);
    } else {
      await supabase.from("ecom_error_events").insert({ ...base, error_id: normalized.errorId, user_id: data.user?.id || null, action: context.action || null, severity: normalized.severity, metadata: { retryable: normalized.retryable, ...context } });
    }
  })().catch(() => undefined);
  return normalized;
}
