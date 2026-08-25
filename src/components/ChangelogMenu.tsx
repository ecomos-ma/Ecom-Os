import { useState, useEffect } from "react";
import { Sparkles, X } from "lucide-react";
import { CHANGELOG, hasUnseenEntries, setLastViewedDate } from "../data/changelog";

export function ChangelogMenu() {
  const [isOpen, setIsOpen] = useState(false);
  const [hasUnseen, setHasUnseen] = useState(false);

  useEffect(() => {
    setHasUnseen(hasUnseenEntries());
  }, []);

  const handleOpen = () => {
    setIsOpen(true);
    // Mark as viewed when opening
    if (hasUnseen && CHANGELOG.length > 0) {
      setLastViewedDate(CHANGELOG[0].date);
      setHasUnseen(false);
    }
  };

  const formatDate = (dateString: string) => {
    const date = new Date(dateString);
    return date.toLocaleDateString('fr-FR', { 
      day: 'numeric', 
      month: 'short',
      year: 'numeric'
    });
  };

  return (
    <div className="relative">
      <button
        type="button"
        onClick={handleOpen}
        aria-label="Nouveautés"
        className="relative rounded-lg p-2 text-text-muted hover:bg-base-raised hover:text-text-main transition-colors"
      >
        <Sparkles size={16} />
        {hasUnseen && (
          <span className="absolute top-1 right-1 h-2 w-2 rounded-full bg-brand-accent ring-2 ring-brand-background" />
        )}
      </button>

      {isOpen && (
        <>
          <div 
            className="fixed inset-0 z-40"
            onClick={() => setIsOpen(false)}
          />
          <div className="absolute right-0 top-[calc(100%+6px)] z-50 w-80 max-h-[400px] overflow-hidden rounded-lg border border-brand-border bg-brand-panel shadow-card">
            <div className="flex items-center justify-between border-b border-brand-border px-3 py-2">
              <div className="flex items-center gap-2">
                <Sparkles size={14} className="text-brand-accent" />
                <span className="text-[13px] font-semibold text-text-main">Nouveautés</span>
              </div>
              <button
                onClick={() => setIsOpen(false)}
                className="rounded p-1 text-ink-faint hover:bg-base-raised hover:text-ink transition-colors"
              >
                <X size={14} />
              </button>
            </div>
            <div className="overflow-y-auto max-h-[340px]">
              {CHANGELOG.map((entry, index) => (
                <div 
                  key={index}
                  className={`px-3 py-3 ${index > 0 ? 'border-t border-brand-border' : ''}`}
                >
                  <div className="text-[11px] text-ink-faint mb-1">
                    {formatDate(entry.date)}
                  </div>
                  <div className="text-[13px] font-medium text-text-main mb-1">
                    {entry.title}
                  </div>
                  <div className="text-[12px] text-ink-muted leading-snug">
                    {entry.description}
                  </div>
                </div>
              ))}
            </div>
          </div>
        </>
      )}
    </div>
  );
}
