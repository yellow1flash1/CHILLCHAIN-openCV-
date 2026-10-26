// Offline mode, browser side: the last data each screen loaded is kept on the phone (IndexedDB) and
// shown when there is no network, and the last signed-in account is remembered so the app opens
// offline without the sign-in service. Signing out clears both.
import { createAsyncStoragePersister } from "@tanstack/query-async-storage-persister";
import type { Query } from "@tanstack/react-query";
import { kv } from "./idb";

const CACHE_KEY = "chillchain-cache";
const USER_KEY = "chillchain-last-user";

/** The on-phone grading models (Teachable Machine): apple, and tomato/potato for cherry tomatoes.
 *  The service worker saves them while online so a grower can grade in the field without signal. */
export const GRADING_MODELS = [
  "https://teachablemachine.withgoogle.com/models/fkI59uWMx/",
  "https://teachablemachine.withgoogle.com/models/lbYne4pD3/",
];
export function saveGradingModels() {
  void navigator.serviceWorker?.ready
    .then((r) => r.active?.postMessage({ type: "save-models", urls: GRADING_MODELS }))
    .catch(() => undefined);
}

/** How long saved screens stay usable offline. */
export const OFFLINE_MAX_AGE = 7 * 24 * 3_600_000;
/** Bump when the shape of saved data changes, so old caches are dropped. */
export const CACHE_VERSION = "1";

export const persister =
  typeof window === "undefined"
    ? null
    : createAsyncStoragePersister({ storage: kv, key: CACHE_KEY, throttleTime: 1_000 });

// Admin screens and one-off downloads are never written to the phone.
const SKIP = new Set(["admin", "is-admin", "pay-config"]);
export const shouldSave = (q: Query) =>
  q.state.status === "success" && !SKIP.has(String(q.queryKey[0]));

export interface LastUser {
  id: string;
  email: string | null;
}
export function readLastUser(): LastUser | null {
  try {
    const v = JSON.parse(localStorage.getItem(USER_KEY) ?? "null") as LastUser | null;
    return v && typeof v.id === "string" ? v : null;
  } catch {
    return null;
  }
}
export function rememberUser(u: LastUser) {
  try {
    localStorage.setItem(USER_KEY, JSON.stringify(u));
  } catch {
    /* storage blocked */
  }
}

/** Forget the account and every saved screen (on sign-out and account deletion). */
export async function clearOffline() {
  try {
    localStorage.removeItem(USER_KEY);
  } catch {
    /* storage blocked */
  }
  await kv.removeItem(CACHE_KEY).catch(() => undefined);
}
