import { useEffect, useMemo, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { Check, CheckCircle2, ChevronDown } from "lucide-react";
import { getSortedStatusOptions, normalizeStatus, type CanonicalStatus, type StatusLanguage } from "../../lib/statusEngine";

export function ConfirmationOutcomePicker({ value, onChange, language, disabled }: {
  value: string;
  onChange: (value: CanonicalStatus) => void;
  language: StatusLanguage;
  disabled?: boolean;
}) {
  const [open, setOpen] = useState(false);
  const [position, setPosition] = useState({ top: 0, left: 0, width: 0, maxHeight: 320 });
  const trigger = useRef<HTMLButtonElement>(null);
  const menu = useRef<HTMLDivElement>(null);
  const options = useMemo(() => {
    const sorted = getSortedStatusOptions(language);
    return [...sorted.filter((item) => item.value === "confirmed"), ...sorted.filter((item) => item.value !== "confirmed")];
  }, [language]);
  const selected = normalizeStatus(value);
  const label = options.find((option) => option.value === selected)?.label ?? selected;

  useEffect(() => {
    if (!open) return;
    const place = () => {
      const rect = trigger.current?.getBoundingClientRect();
      if (!rect) return;
      const availableBelow = window.innerHeight - rect.bottom - 12;
      const maxHeight = Math.min(320, Math.max(180, availableBelow >= 190 ? availableBelow : rect.top - 12));
      const above = availableBelow < 190 && rect.top > availableBelow;
      setPosition({
        top: above ? Math.max(8, rect.top - maxHeight - 6) : rect.bottom + 6,
        left: Math.max(8, Math.min(rect.left, window.innerWidth - rect.width - 8)),
        width: rect.width,
        maxHeight,
      });
    };
    const closeOutside = (event: PointerEvent) => {
      if (!trigger.current?.contains(event.target as Node) && !menu.current?.contains(event.target as Node)) setOpen(false);
    };
    place();
    window.addEventListener("resize", place);
    window.addEventListener("scroll", place, true);
    document.addEventListener("pointerdown", closeOutside);
    return () => {
      window.removeEventListener("resize", place);
      window.removeEventListener("scroll", place, true);
      document.removeEventListener("pointerdown", closeOutside);
    };
  }, [open]);

  const moveFocus = (direction: number) => {
    const choices = Array.from(menu.current?.querySelectorAll<HTMLButtonElement>("[role=option]") ?? []);
    const current = choices.indexOf(document.activeElement as HTMLButtonElement);
    choices[(current + direction + choices.length) % choices.length]?.focus();
  };

  return <>
    <button ref={trigger} type="button" disabled={disabled} aria-haspopup="listbox" aria-expanded={open}
      onClick={() => setOpen((current) => !current)}
      onKeyDown={(event) => { if (event.key === "ArrowDown") { event.preventDefault(); setOpen(true); requestAnimationFrame(() => menu.current?.querySelector<HTMLButtonElement>("[role=option]")?.focus()); } }}
      className="flex min-h-11 min-w-0 flex-1 items-center justify-between gap-3 rounded-xl border border-base-border bg-base-surface px-3.5 py-2 text-left text-[12px] font-semibold text-ink shadow-sm outline-none transition-colors hover:border-brand/40 focus-visible:border-brand focus-visible:ring-2 focus-visible:ring-brand/15 disabled:opacity-50">
      <span className="inline-flex items-center gap-2 truncate">{selected === "confirmed" && <CheckCircle2 size={15} className="text-emerald-600" />}{label}</span>
      <ChevronDown size={15} className={`shrink-0 text-ink-muted transition-transform ${open ? "rotate-180" : ""}`} />
    </button>
    {open && createPortal(<div ref={menu} role="listbox" aria-label="Confirmation outcome"
      onKeyDown={(event) => {
        if (event.key === "Escape") { event.stopPropagation(); setOpen(false); trigger.current?.focus(); }
        if (event.key === "ArrowDown") { event.preventDefault(); moveFocus(1); }
        if (event.key === "ArrowUp") { event.preventDefault(); moveFocus(-1); }
      }}
      style={{ position: "fixed", top: position.top, left: position.left, width: position.width, maxHeight: position.maxHeight }}
      className="z-[130] overflow-y-auto rounded-xl border border-base-border bg-base-surface p-1.5 text-ink shadow-2xl">
      {options.map((option, index) => <button key={option.value} type="button" role="option" aria-selected={option.value === selected}
        onClick={() => { onChange(option.value); setOpen(false); trigger.current?.focus(); }}
        className={`flex w-full items-center justify-between rounded-lg px-3 py-2.5 text-left text-[12px] font-medium outline-none transition-colors focus:bg-base-raised ${option.value === selected ? "bg-brand/10 text-brand" : option.value === "confirmed" ? "text-emerald-700 hover:bg-emerald-50 dark:text-emerald-300 dark:hover:bg-emerald-950" : "text-ink hover:bg-base-raised"}`}>
        <span className="inline-flex items-center gap-2">{option.value === "confirmed" && <CheckCircle2 size={14} />}{option.label}</span>
        {option.value === selected && <Check size={14} />}
        {index === 0 && option.value !== selected && <span className="text-[10px] font-bold uppercase tracking-wide text-emerald-600">Quick action</span>}
      </button>)}
    </div>, document.body)}
  </>;
}
