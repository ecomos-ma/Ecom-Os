import { ReactNode, useEffect, memo, useId } from "react";
import { createPortal } from "react-dom";
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
  const titleId = useId();

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

  return createPortal(
    <div
      className="app-modal-backdrop fixed inset-0 flex h-dvh min-h-0 min-w-full items-center justify-center overflow-hidden bg-slate-950/60 px-4 py-4 backdrop-blur-[2px] max-md:items-end max-md:p-0 max-md:pt-[calc(2.5rem+env(safe-area-inset-top))]"
      onClick={onClose}
      role="dialog"
      aria-modal="true"
      aria-labelledby={titleId}
    >
      <div
        className="flex max-h-[calc(100dvh-2rem)] min-h-0 w-full max-w-[900px] flex-col overflow-hidden rounded-2xl border border-base-border bg-base-surface shadow-[0_24px_80px_-24px_rgba(2,6,23,0.55)] animate-in fade-in zoom-in-95 dark:shadow-[0_28px_90px_-24px_rgba(0,0,0,0.85)] max-md:mt-auto max-md:max-h-[calc(100dvh-env(safe-area-inset-top)-2.5rem)] max-md:rounded-b-none max-md:rounded-t-[28px] max-md:border-b-0 max-md:pb-[calc(1rem+env(safe-area-inset-bottom))] max-md:shadow-[0_-12px_40px_rgba(0,0,0,0.25)]"
        onClick={(event) => event.stopPropagation()}
        style={{ animationDuration: '150ms', animationTimingFunction: 'cubic-bezier(0.2, 0.8, 0.2, 1)' }}
      >
        <div className="md:hidden w-12 h-1.5 bg-brand-border rounded-full mx-auto mt-4 mb-2"></div>
        <div className="flex items-center justify-between border-b border-base-border px-4 py-3 max-md:px-6 max-md:pt-2 max-md:pb-4 max-md:border-b-0">
          <div id={titleId} className="text-[14px] max-md:text-[20px] font-semibold text-ink">{title}</div>
          <button type="button" onClick={onClose} aria-label="Close dialog" className="grid h-10 w-10 place-items-center rounded-xl border border-transparent bg-base-raised/70 text-ink-faint transition-colors hover:border-base-border hover:text-ink max-md:bg-base-raised max-md:text-ink-muted">
            <X size={18} />
          </button>
        </div>
        <div className="min-h-0 flex-1 overflow-y-auto overscroll-contain p-4 max-md:px-6">{children}</div>
      </div>
    </div>,
    document.body,
  );
});
