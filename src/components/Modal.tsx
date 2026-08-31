import { ReactNode, useEffect, memo } from "react";
import { X } from "lucide-react";

export const Modal = memo(function Modal({
  title,
  onClose,
  children,
}: {
  title: string;
  onClose: () => void;
  children: ReactNode;
}) {
  useEffect(() => {
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        onClose();
      }
    };

    document.addEventListener("keydown", handleKeyDown);
    return () => {
      document.removeEventListener("keydown", handleKeyDown);
      document.body.style.overflow = previousOverflow;
    };
  }, [onClose]);

  return (
    <div
      className="app-modal-backdrop fixed inset-0 flex min-h-dvh min-w-full items-center justify-center max-md:items-end bg-black/60 px-4 py-6 max-md:p-0 max-md:pt-[calc(2.5rem+env(safe-area-inset-top))] transition-all duration-300"
      onClick={onClose}
      role="dialog"
      aria-modal="true"
    >
      <div
        className="w-full max-w-[900px] overflow-hidden rounded-xl border border-base-border bg-base-surface shadow-card max-md:rounded-t-[32px] max-md:rounded-b-none max-md:border-b-0 max-md:shadow-[0_-12px_40px_rgba(0,0,0,0.2)] max-md:pb-[calc(1rem+env(safe-area-inset-bottom))] animate-in fade-in zoom-in-95 flex flex-col md:max-h-[85vh] max-md:max-h-[calc(100dvh-env(safe-area-inset-top)-2.5rem)] max-md:mt-auto"
        onClick={(event) => event.stopPropagation()}
        style={{ animationDuration: '150ms', animationTimingFunction: 'cubic-bezier(0.2, 0.8, 0.2, 1)' }}
      >
        <div className="md:hidden w-12 h-1.5 bg-brand-border rounded-full mx-auto mt-4 mb-2"></div>
        <div className="flex items-center justify-between border-b border-base-border px-4 py-3 max-md:px-6 max-md:pt-2 max-md:pb-4 max-md:border-b-0">
          <div className="text-[14px] max-md:text-[20px] font-semibold text-ink">{title}</div>
          <button type="button" onClick={onClose} aria-label="Close dialog" className="rounded-full bg-base-raised/50 p-2 text-ink-faint hover:text-ink max-md:bg-base-raised max-md:text-ink-muted">
            <X size={18} />
          </button>
        </div>
        <div className="max-h-[calc(100vh-7rem)] overflow-y-auto p-4 max-md:px-6">{children}</div>
      </div>
    </div>
  );
});
