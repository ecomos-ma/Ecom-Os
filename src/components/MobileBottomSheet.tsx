import { ReactNode, useEffect, useId, useRef } from "react";
import { X } from "lucide-react";
import { useDialogFocus } from "../hooks/useDialogFocus";
import { usePhoneLayout } from "../hooks/usePhoneLayout";

interface MobileBottomSheetProps {
  isOpen: boolean;
  onClose: () => void;
  title?: string;
  children: ReactNode;
  snapPoints?: string[];
  initialSnap?: number;
  mobileOnly?: boolean;
}

export default function MobileBottomSheet({
  isOpen,
  onClose,
  title,
  children,
  snapPoints = ["80%", "50%", "25%"],
  initialSnap = 0,
  mobileOnly = false,
}: MobileBottomSheetProps) {
  const sheetRef = useRef<HTMLDivElement>(null);
  const titleId = useId();
  const isMobile = usePhoneLayout();
  const active = isOpen && (!mobileOnly || isMobile);
  useDialogFocus(active, sheetRef);

  useEffect(() => {
    if (!active) return;
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    const closeOnEscape = (event: KeyboardEvent) => event.key === "Escape" && onClose();
    window.addEventListener("keydown", closeOnEscape);
    return () => {
      document.body.style.overflow = previousOverflow;
      window.removeEventListener("keydown", closeOnEscape);
    };
  }, [active, onClose]);

  if (!active) return null;

  return (
    <>
      {/* Backdrop */}
      <div
        className="mobile-sheet-backdrop fixed inset-0 bg-black/50 backdrop-blur-sm animate-in fade-in duration-200"
        onClick={onClose}
        aria-hidden="true"
      />

      {/* Sheet */}
      <div
        ref={sheetRef}
        tabIndex={-1}
        role="dialog"
        aria-modal="true"
        aria-labelledby={title ? titleId : undefined}
        aria-label={title ? undefined : "Menu"}
        className="mobile-sheet fixed bottom-0 left-0 right-0 max-h-[calc(100dvh-env(safe-area-inset-top)-.5rem)] flex flex-col bg-base-surface rounded-t-[28px] border-t border-base-border/50 shadow-2xl animate-in slide-in-from-bottom duration-300 outline-none"
      >
        {/* Drag Handle */}
        <div aria-hidden="true" className="flex shrink-0 justify-center pt-3 pb-2">
          <div className="w-12 h-1.5 rounded-full bg-base-border" />
        </div>

        {/* Header */}
        {title && (
          <div className="flex shrink-0 items-center justify-between gap-3 px-4 pb-3 border-b border-base-border/50">
            <h2 id={titleId} className="text-xl font-bold text-ink">{title}</h2>
            <button
              type="button"
              onClick={onClose}
              aria-label="Close"
              className="h-11 w-11 shrink-0 rounded-xl bg-base-raised flex items-center justify-center active:scale-[0.95] transition-transform"
            >
              <X size={18} className="text-ink-muted" />
            </button>
          </div>
        )}

        {/* Content */}
        <div className="min-h-0 max-h-[min(76dvh,720px)] overflow-y-auto overscroll-contain px-4 py-4 pb-[calc(1rem+env(safe-area-inset-bottom))]">
          {children}
        </div>
      </div>
    </>
  );
}
