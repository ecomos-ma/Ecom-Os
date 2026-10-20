import { useEffect, type RefObject } from "react";

const openDialogs: HTMLElement[] = [];

/** Keeps keyboard navigation inside an open sheet and restores its opener. */
export function useDialogFocus(active: boolean, ref: RefObject<HTMLElement>) {
  useEffect(() => {
    if (!active) return;
    const panel = ref.current;
    if (!panel) return;
    openDialogs.push(panel);
    const opener = document.activeElement instanceof HTMLElement ? document.activeElement : null;
    const frame = requestAnimationFrame(() => ref.current?.focus());
    const trap = (event: KeyboardEvent) => {
      if (event.key !== "Tab" || !ref.current || openDialogs[openDialogs.length - 1] !== panel) return;
      const items = Array.from(ref.current.querySelectorAll<HTMLElement>(
        'a[href],button:not([disabled]),input:not([disabled]),select:not([disabled]),textarea:not([disabled]),[tabindex]:not([tabindex="-1"])',
      )).filter((element) => element.getClientRects().length > 0 && element.getAttribute("aria-hidden") !== "true");
      const first = items[0], last = items[items.length - 1];
      if (!first) { event.preventDefault(); ref.current.focus(); return; }
      if (event.shiftKey && (document.activeElement === first || document.activeElement === ref.current)) {
        event.preventDefault(); last.focus();
      } else if (!event.shiftKey && (document.activeElement === last || document.activeElement === ref.current || !ref.current.contains(document.activeElement))) {
        event.preventDefault(); first.focus();
      }
    };
    document.addEventListener("keydown", trap);
    return () => {
      cancelAnimationFrame(frame);
      const index = openDialogs.indexOf(panel);
      if (index !== -1) openDialogs.splice(index, 1);
      document.removeEventListener("keydown", trap);
      if (opener?.isConnected) opener.focus({ preventScroll: true });
    };
  }, [active, ref]);
}
