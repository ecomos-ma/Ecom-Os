import { ReactNode, useEffect, useRef } from "react";
import { X } from "lucide-react";

interface MobileBottomSheetProps {
  isOpen: boolean;
  onClose: () => void;
  title?: string;
  children: ReactNode;
  snapPoints?: string[];
  initialSnap?: number;
}

export default function MobileBottomSheet({
  isOpen,
  onClose,
  title,
  children,
  snapPoints = ["80%", "50%", "25%"],
  initialSnap = 0,
}: MobileBottomSheetProps) {
  const sheetRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (isOpen) {
      document.body.style.overflow = "hidden";
    } else {
      document.body.style.overflow = "";
    }
    return () => {
      document.body.style.overflow = "";
    };
  }, [isOpen]);

  if (!isOpen) return null;

  return (
    <>
      {/* Backdrop */}
      <div
        className="fixed inset-0 z-[60] bg-black/50 backdrop-blur-sm animate-in fade-in duration-200"
        onClick={onClose}
      />

      {/* Sheet */}
      <div className="fixed bottom-0 left-0 right-0 z-[70] bg-base-surface rounded-t-[28px] border-t border-base-border/50 shadow-2xl animate-in slide-in-from-bottom duration-300">
        {/* Drag Handle */}
        <div className="flex justify-center pt-3 pb-2 cursor-grab active:cursor-grabbing">
          <div className="w-12 h-1.5 rounded-full bg-base-border" />
        </div>

        {/* Header */}
        {title && (
          <div className="flex items-center justify-between px-6 pb-4 border-b border-base-border/50">
            <h2 className="text-xl font-bold text-ink">{title}</h2>
            <button
              onClick={onClose}
              className="w-8 h-8 rounded-lg bg-base-raised flex items-center justify-center active:scale-[0.95] transition-transform"
            >
              <X size={18} className="text-ink-muted" />
            </button>
          </div>
        )}

        {/* Content */}
        <div className="max-h-[80vh] overflow-y-auto px-4 py-4 safe-area-bottom" ref={sheetRef}>
          {children}
        </div>
      </div>
    </>
  );
}
