// Scans made without a network wait on the phone (IndexedDB) and are sent, oldest first, as soon as
// the real sign-in session and the server are reachable again. The harvest time is kept as it was,
// so the sell-by clock the server works out is the same as if the scan had gone through at once.
import { useEffect, useSyncExternalStore } from "react";
import { api, uploadScanPhoto } from "./api";
import { records } from "./idb";
import { isOnline, useOnline } from "./net";
import type { Grade } from "./shelf";

/** What createScan takes, minus the photo key (the photo is uploaded when the scan is sent). */
export interface ScanInput {
  batch_code: string;
  crop: string;
  source: "model" | "ai_vision" | "self";
  grade?: Grade;
  confidence?: number;
  ripeness?: number;
  harvested_at: string;
  cold_chain: boolean;
  image?: string;
  lang?: string;
}

export interface PendingScan {
  id: string;
  userId: string;
  createdAt: string;
  input: ScanInput;
  photo: Blob | null;
  /** Why the server refused it (it stays listed so the grower can see and remove it). */
  failed?: string;
}

let cache: PendingScan[] = [];
const subs = new Set<() => void>();
const emit = () => subs.forEach((f) => f());

async function reload() {
  cache = (await records.all<PendingScan>().catch(() => [])).sort((a, b) =>
    a.createdAt.localeCompare(b.createdAt),
  );
  emit();
}

export async function queueScan(userId: string, input: ScanInput, photo: Blob | null) {
  const id = `${Date.now().toString(36)}${Math.random().toString(36).slice(2, 6)}`;
  await records.put<PendingScan>({
    id,
    userId,
    createdAt: new Date().toISOString(),
    input,
    photo,
  });
  await reload();
}

export async function dropScan(id: string) {
  await records.remove(id).catch(() => undefined);
  await reload();
}

export interface SyncResult {
  sent: number;
  /** Photos the AI could not grade: these need the grower's own grade. */
  retake: number;
  failed: number;
}

let syncing: Promise<SyncResult> | null = null;

/** Send this account's waiting scans. Stops at the first network failure and leaves the rest. */
export function syncScans(userId: string): Promise<SyncResult> {
  syncing ??= (async () => {
    const out: SyncResult = { sent: 0, retake: 0, failed: 0 };
    await reload();
    for (const p of cache.filter((x) => x.userId === userId && !x.failed)) {
      if (!isOnline()) break;
      const key = p.photo ? await uploadScanPhoto(p.photo) : null;
      const r = await api.createScan({ ...p.input, ...(key ? { photo_key: key } : {}) });
      if (r.error?.offline) break;
      if (r.error) {
        await records.put<PendingScan>({ ...p, failed: r.error.message });
        out.failed++;
        continue;
      }
      if ((r.data as { retake?: string } | null)?.retake) out.retake++;
      else out.sent++;
      await records.remove(p.id);
    }
    await reload();
    return out;
  })().finally(() => {
    syncing = null;
  });
  return syncing;
}

function subscribe(f: () => void) {
  subs.add(f);
  if (subs.size === 1) void reload();
  return () => {
    subs.delete(f);
  };
}
const EMPTY: PendingScan[] = [];

/** This account's waiting scans. */
export function usePendingScans(userId: string | undefined) {
  const all = useSyncExternalStore(
    subscribe,
    () => cache,
    () => EMPTY,
  );
  return userId ? all.filter((p) => p.userId === userId) : EMPTY;
}

/** Sends waiting scans whenever the app is online with a real session. Mount once per screen. */
export function useScanSync(
  userId: string | undefined,
  signedIn: boolean,
  done: (r: SyncResult) => void,
) {
  const online = useOnline();
  const pending = usePendingScans(userId).filter((p) => !p.failed).length;
  useEffect(() => {
    if (!userId || !signedIn || !online || !pending) return;
    void syncScans(userId).then(done);
    // `done` is a fresh callback each render; the sync itself only depends on these.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [userId, signedIn, online, pending]);
}
