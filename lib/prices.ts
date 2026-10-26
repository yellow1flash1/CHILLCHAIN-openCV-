// Pure helpers for live mandi prices (shared by the screens and tests).
import type { CropPrice } from "./mandi.server";

/** Change since each market's previous report, in % (null when too few markets reported twice). */
export const priceChange = (p: Pick<CropPrice, "change"> | undefined): number | null =>
  p?.change ?? null;

/** ₹ per kg for display: whole rupees from ₹10 up, one decimal below. */
export const fmtKg = (n: number) =>
  n >= 100 ? Math.round(n).toLocaleString("en-IN") : n.toFixed(n < 10 ? 1 : 0);
