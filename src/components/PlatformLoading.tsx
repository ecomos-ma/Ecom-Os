import { Loader2 } from "lucide-react";

export function PlatformLoading() {
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-[rgba(255,255,255,0.92)] backdrop-blur-sm">
      <div className="flex flex-col items-center gap-4 rounded-[28px] border border-pink-200/60 bg-white/95 px-8 py-8 shadow-[0_24px_80px_rgba(219,106,143,0.16)]">
        <div className="flex h-20 w-20 items-center justify-center rounded-full bg-pink-100 shadow-[0_16px_40px_rgba(219,106,143,0.18)]">
          <Loader2 className="h-10 w-10 animate-spin text-pink-500" />
        </div>
        <div className="text-center">
          <p className="text-lg font-semibold text-ink">Loading platform</p>
          <p className="mt-1 text-sm text-ink-muted">Please wait while your workspace loads.</p>
        </div>
      </div>
    </div>
  );
}
