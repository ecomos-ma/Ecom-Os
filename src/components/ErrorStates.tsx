import { AlertTriangle, WifiOff, RefreshCw, ShieldAlert } from "lucide-react";
import type { EcomError } from "../lib/errorHandling";

export function PageError({ error, onRetry }: { error: EcomError; onRetry?: () => void }) {
  return <div className="mx-auto my-8 max-w-xl rounded-2xl border border-danger/20 bg-danger/5 p-6 text-center"><AlertTriangle className="mx-auto mb-3 text-danger" size={24} /><h2 className="font-semibold text-ink">{error.userMessage}</h2><p className="mt-2 text-xs text-ink-muted">Error ID: {error.errorId}</p>{onRetry && error.retryable && <button onClick={onRetry} className="mt-4 inline-flex items-center gap-2 rounded-xl bg-ink px-4 py-2 text-xs font-semibold text-white"><RefreshCw size={14} /> Try again</button>}</div>;
}

export function InlineError({ error }: { error: EcomError }) { return <p role="alert" className="mt-2 flex items-center gap-2 text-xs text-danger"><AlertTriangle size={14} />{error.userMessage} <span className="text-ink-muted">({error.errorId})</span></p>; }
export function PermissionError({ error }: { error: EcomError }) { return <div className="rounded-xl border border-amber-300/40 bg-amber-50/50 p-3 text-xs text-amber-800"><ShieldAlert size={14} className="mr-1 inline" />{error.userMessage}</div>; }
export function OfflineBanner({ online }: { online: boolean }) { return online ? null : <div className="sticky top-0 z-50 flex items-center justify-center gap-2 bg-amber-500 px-3 py-2 text-xs font-medium text-white"><WifiOff size={14} />You're offline. Some actions are temporarily unavailable.</div>; }
