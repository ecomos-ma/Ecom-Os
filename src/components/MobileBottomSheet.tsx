import { ReactNode, useEffect, useId, useRef, useState } from "react";
import { X } from "lucide-react";

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
  const [isMobile, setIsMobile] = useState(() => typeof window === "undefined" || window.matchMedia("(max-width: 767px)").matches);
  const active = isOpen && (!mobileOnly || isMobile);

  useEffect(() => {
    if (!mobileOnly) return;
    const media = window.matchMedia("(max-width: 767px)");
    const update = () => setIsMobile(media.matches);
    update();
    media.addEventListener("change", update);
    return () => media.removeEventListener("change", update);
  }, [mobileOnly]);

  useEffect(() => {
    if (!active) return;
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    const closeOnEscape = (event: KeyboardEvent) => event.key === "Escape" && onClose();
    window.addEventListener("keydown", closeOnEscape);
    requestAnimationFrame(() => sheetRef.current?.focus());
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
        className="mobile-sheet fixed bottom-0 left-0 right-0 bg-base-surface rounded-t-[28px] border-t border-base-border/50 shadow-2xl animate-in slide-in-from-bottom duration-300 outline-none"
      >
        {/* Drag Handle */}
        <div className="flex justify-center pt-3 pb-2 cursor-grab active:cursor-grabbing">
          <div className="w-12 h-1.5 rounded-full bg-base-border" />
        </div>

        {/* Header */}
        {title && (
          <div className="flex items-center justify-between px-6 pb-4 border-b border-base-border/50">
            <h2 id={titleId} className="text-xl font-bold text-ink">{title}</h2>
            <button
              type="button"
              onClick={onClose}
              aria-label="Close"
              className="w-8 h-8 rounded-lg bg-base-raised flex items-center justify-center active:scale-[0.95] transition-transform"
            >
              <X size={18} className="text-ink-muted" />
            </button>
          </div>
        )}

        {/* Content */}
        <div className="max-h-[min(76dvh,720px)] overflow-y-auto overscroll-contain px-4 py-4 pb-[calc(1rem+env(safe-area-inset-bottom))]">
          {children}
        </div>
      </div>
    </>
  );
}
