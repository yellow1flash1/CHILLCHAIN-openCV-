// Is the server reachable? navigator.onLine only says a network is attached: a phone on a weak tower
// often reports "online" while every request fails. So a failed request also marks the app offline,
// and a small probe brings it back once requests get through again. React Query follows the same
// signal (onlineManager), so reads pause and resume instead of erroring.
import { onlineManager } from "@tanstack/react-query";
import { useSyncExternalStore } from "react";

let down = false; // a request failed for network reasons since the last success
const subs = new Set<() => void>();
let probe: ReturnType<typeof setInterval> | null = null;

const browserOnline = () => typeof navigator === "undefined" || navigator.onLine;
export const isOnline = () => browserOnline() && !down;

function emit() {
  onlineManager.setOnline(isOnline());
  subs.forEach((f) => f());
}

/** Fetch errors (no answer at all) as opposed to an error the server sent back. */
export function isNetworkError(e: unknown) {
  if (!browserOnline()) return true;
  const m = e instanceof Error ? e.message : String(e);
  return /failed to fetch|networkerror|load failed|network request failed|fetch failed/i.test(m);
}

export function markDown() {
  if (down) return;
  down = true;
  emit();
  probe ??= setInterval(() => {
    if (!browserOnline()) return;
    fetch(`/manifest.webmanifest?probe=${Date.now()}`, { cache: "no-store" })
      .then((r) => r.ok && markUp())
      .catch(() => undefined);
  }, 15_000);
}

export function markUp() {
  if (probe) clearInterval(probe);
  probe = null;
  if (!down) return;
  down = false;
  emit();
}

let wired = false;
function wire() {
  if (wired || typeof window === "undefined") return;
  wired = true;
  window.addEventListener("online", () => {
    down = false;
    emit();
  });
  window.addEventListener("offline", emit);
  onlineManager.setEventListener(() => () => undefined);
  emit();
}

function subscribe(f: () => void) {
  wire();
  subs.add(f);
  return () => {
    subs.delete(f);
  };
}

/** True while the server can be reached. Always true during server rendering. */
export function useOnline() {
  return useSyncExternalStore(subscribe, isOnline, () => true);
}
