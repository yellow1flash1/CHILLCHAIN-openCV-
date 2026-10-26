// Lets Settings (and other overlays) jump to a tab inside whichever role screen is open.
import { useEffect } from "react";

const EVT = "fg:tab";
export const goToTab = (tab: string) =>
  window.dispatchEvent(new CustomEvent<string>(EVT, { detail: tab }));
export function useTabEvents(onTab: (tab: string) => void) {
  useEffect(() => {
    const h = (e: Event) => onTab((e as CustomEvent<string>).detail);
    window.addEventListener(EVT, h);
    return () => window.removeEventListener(EVT, h);
  }, [onTab]);
}
