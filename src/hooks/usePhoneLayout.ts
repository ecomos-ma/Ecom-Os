import { useSyncExternalStore } from "react";

// Matches the portrait and short landscape phone shell in index.css.
export const PHONE_LAYOUT_QUERY = "(max-width: 767px), (orientation: landscape) and (max-width: 932px) and (max-height: 520px)";
function subscribe(update: () => void) {
  const media = window.matchMedia(PHONE_LAYOUT_QUERY);
  media.addEventListener("change", update);
  return () => media.removeEventListener("change", update);
}
export function usePhoneLayout() {
  return useSyncExternalStore(subscribe, () => window.matchMedia(PHONE_LAYOUT_QUERY).matches, () => false);
}
