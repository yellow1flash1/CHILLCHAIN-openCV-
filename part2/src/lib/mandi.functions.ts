import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { CROPS } from "./crops";
import {
  cropMarkets,
  cropPrices,
  lastRefresh,
  refreshMandi,
  type CropPrice,
  type MarketPrice,
} from "./mandi.server";

export type { CropPrice, MarketPrice };

export interface MandiPrice {
  crop: string;
  commodity: string;
  market: string;
  district: string;
  modalPerKg: number;
  minPerKg: number;
  maxPerKg: number;
  date: string;
}

// Live prices come from Agmarknet (Government of India, via data.gov.in), copied into the database by
// mandi.server.ts. Reads never wait for the government API: a screen gets the saved copy at once and,
// when it is older than 30 minutes, asks for a refresh in the background (refreshLivePrices).
const STALE_MS = 30 * 60_000;
const stateIn = z.object({ state: z.string().trim().max(40).optional() });
const cropKey = z.string().refine((k) => CROPS.some((c) => c.key === k));

export const getLivePrices = createServerFn({ method: "GET" })
  .validator((d: unknown) => stateIn.parse(d ?? {}))
  .handler(async ({ data }) => {
    const connected = !!process.env["DATA_GOV_IN_API_KEY"];
    const [crops, last] = await Promise.all([
      cropPrices(data.state || null).catch(() => [] as CropPrice[]),
      lastRefresh(),
    ]);
    const updatedAt = last?.finished_at ?? null;
    const stale = connected && (!updatedAt || Date.now() - Date.parse(updatedAt) > STALE_MS);
    return { connected, updatedAt, stale, crops };
  });

export const getCropMarkets = createServerFn({ method: "GET" })
  .validator((d: unknown) =>
    z.object({ crop: cropKey, state: z.string().trim().max(40).optional() }).parse(d),
  )
  .handler(({ data }) => cropMarkets(data.crop, data.state || null));

/** Pull fresh reports from data.gov.in (skipped if another refresh ran in the last 30 minutes). */
export const refreshLivePrices = createServerFn({ method: "POST" }).handler(() => refreshMandi());

/** One price per crop for the asked state (all-India median where the state has no report). */
export const getMandiPrices = createServerFn({ method: "GET" })
  .validator((d: unknown) => z.object({ state: z.string().trim().min(2).max(40) }).parse(d))
  .handler(
    async ({ data }): Promise<{ available: boolean; reason?: string; prices: MandiPrice[] }> => {
      const rows = await cropPrices(data.state).catch(() => [] as CropPrice[]);
      if (!rows.length)
        return {
          available: false,
          reason: process.env["DATA_GOV_IN_API_KEY"] ? "no_reports" : "no_key",
          prices: [],
        };
      return {
        available: true,
        prices: rows.map((r) => {
          const local = r.stateMedian != null;
          return {
            crop: r.crop,
            commodity: CROPS.find((c) => c.key === r.crop)?.en ?? r.crop,
            market: local ? data.state : "", // the screen says "All-India" when empty
            district: "",
            modalPerKg: Math.round(local ? r.stateMedian! : r.median),
            minPerKg: Math.round(r.low),
            maxPerKg: Math.round(r.high),
            date: r.day,
          };
        }),
      };
    },
  );
