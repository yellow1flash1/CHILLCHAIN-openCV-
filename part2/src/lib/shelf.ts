// The sell-by clock: how long a graded lot stays sellable, which channel it belongs to, and how its
// price steps down as it ages. Pure functions shared by the scan, home, market and tests.
// priceFactor() must match lot_price_factor() in neon/009_chillchain.sql (the database fixes the
// real price when a buyer orders; the browser only shows it).
import type { Crop } from "./crops";

export type Grade = "A" | "B" | "C";
export type Ripeness = 1 | 2 | 3 | 4 | 5;
export type Channel = "retail" | "flash" | "processor";
export type Route = Channel | "ripen";

const HOUR = 3_600_000;

export const RIPENESS: Record<Ripeness, { en: string; hi: string }> = {
  1: { en: "Unripe", hi: "कच्चा" },
  2: { en: "Turning", hi: "पकने लगा" },
  3: { en: "Ripe", hi: "पका" },
  4: { en: "Fully ripe", hi: "पूरा पका" },
  5: { en: "Overripe", hi: "ज़्यादा पका" },
};

const GRADE_F: Record<Grade, number> = { A: 1, B: 0.7, C: 0.4 };
// Unripe fruit lasts longer; fully ripe fruit must move fast.
const RIPE_F: Record<Ripeness, number> = { 1: 1.6, 2: 1.3, 3: 1, 4: 0.6, 5: 0.25 };

// Fresh produce respires (and spoils) about 2–3 times faster for every 10 °C warmer (the Q10 rule).
// Open-air shelf lives in crops.ts are for about 25 °C.
const Q10 = 2.5,
  REF_C = 25;
/** How much faster than at 25 °C produce spoils in open air at `tempC` (0.5 at 15 °C, 2.5 at 35 °C). */
export function heatFactor(tempC: number) {
  const t = Math.min(45, Math.max(5, tempC));
  return Q10 ** ((t - REF_C) / 10);
}

/** Hours from harvest until the lot should be sold. `ambientC` (air temperature) only changes an
 *  open-air clock, and never beyond what the cold chain would give. */
export function sellWindowHours(
  crop: Crop,
  grade: Grade,
  ripeness: Ripeness,
  coldChain: boolean,
  ambientC?: number | null,
) {
  const base = coldChain
    ? crop.shelfColdH
    : ambientC == null
      ? crop.shelfH
      : Math.min(crop.shelfColdH, crop.shelfH / heatFactor(ambientC));
  return Math.max(2, Math.round(base * GRADE_F[grade] * RIPE_F[ripeness]));
}

export function sellByFrom(harvestedAt: Date, windowH: number) {
  return new Date(harvestedAt.getTime() + windowH * HOUR);
}

export function hoursLeft(sellBy: string | Date, now = Date.now()) {
  return (new Date(sellBy).getTime() - now) / HOUR;
}

/** Share of the asking price a lot fetches now. Steps: ≥50% of the window left → 100%, ≥25% → 90%,
 *  ≥10% → 75%, less → 60%, past sell-by → 50% (processor price). */
export function priceFactor(
  createdAt: string | Date,
  sellBy: string | Date | null,
  now = Date.now(),
): number {
  if (!sellBy) return 1;
  const end = new Date(sellBy).getTime();
  if (now >= end) return 0.5;
  const f = (end - now) / Math.max(1000, end - new Date(createdAt).getTime());
  return f >= 0.5 ? 1 : f >= 0.25 ? 0.9 : f >= 0.1 ? 0.75 : 0.6;
}

/** Where a listed lot sits in the market: A-grade retail, B-grade / ageing flash sale, C-grade / expired to processors. */
export function channelFor(
  grade: string,
  createdAt: string | Date,
  sellBy: string | Date | null,
  now = Date.now(),
): Channel {
  const f = priceFactor(createdAt, sellBy, now);
  if (grade === "C" || f <= 0.5) return "processor";
  if (grade === "B" || f < 1) return "flash";
  return "retail";
}

/** What to do with a freshly scanned lot. */
export function routeFor(crop: Crop, grade: Grade, ripeness: Ripeness): Route {
  if (crop.ripens && ripeness <= 2 && grade !== "C") return "ripen";
  if (grade === "C" || ripeness === 5) return "processor";
  if (grade === "B" || ripeness === 4) return "flash";
  return "retail";
}

export type Urgency = "fresh" | "soon" | "urgent" | "expired";
/** Colour band for a countdown: more than half the window left is fresh, under 25% (or 6 h) is urgent. */
export function urgency(left: number, windowH: number): Urgency {
  if (left <= 0) return "expired";
  const f = left / Math.max(1, windowH);
  if (f < 0.25 || left < 6) return "urgent";
  if (f < 0.5) return "soon";
  return "fresh";
}

/** "2 d 5 h", "5 h 20 m", "40 m". */
export function fmtLeft(h: number) {
  if (h <= 0) return "0 m";
  const m = Math.round(h * 60);
  const d = Math.floor(m / 1440),
    hh = Math.floor((m % 1440) / 60),
    mm = m % 60;
  if (d) return `${d} d ${hh} h`;
  if (hh) return `${hh} h ${mm} m`;
  return `${mm} m`;
}

export const CHANNEL: Record<Channel, { en: string; hi: string; tone: "green" | "amber" | "red" }> =
  {
    retail: { en: "Premium retail", hi: "प्रीमियम रिटेल", tone: "green" },
    flash: { en: "Flash sale", hi: "फ़्लैश सेल", tone: "amber" },
    processor: { en: "Processor", hi: "प्रोसेसर", tone: "red" },
  };

export const ROUTE: Record<Route, { en: string; hi: string; whyEn: string; whyHi: string }> = {
  retail: {
    en: "Sell to premium retail",
    hi: "प्रीमियम रिटेल को बेचें",
    whyEn: "Top grade and ripe: quick-commerce, premium stores and hotels pay the most.",
    whyHi: "सबसे अच्छा ग्रेड और पका: क्विक-कॉमर्स, प्रीमियम स्टोर और होटल सबसे ज़्यादा देते हैं।",
  },
  flash: {
    en: "Flash sale now",
    hi: "अभी फ़्लैश सेल",
    whyEn: "Good but not top grade, or ripening fast: sell today at a small discount.",
    whyHi: "अच्छा पर सबसे ऊपर नहीं, या जल्दी पक रहा है: आज थोड़ी छूट पर बेचें।",
  },
  processor: {
    en: "Send to a processor",
    hi: "प्रोसेसर को भेजें",
    whyEn: "Juice, pulp, jam or drying units still pay for this lot. Nothing goes to waste.",
    whyHi: "जूस, पल्प, जैम या सुखाने वाली इकाइयाँ इसका भी दाम देती हैं। कुछ बर्बाद नहीं।",
  },
  ripen: {
    en: "Hold, then ripen",
    hi: "रोकें, फिर पकाएँ",
    whyEn:
      "Still unripe: keep it cold and use a ripening chamber so it reaches buyers ready to eat.",
    whyHi: "अभी कच्चा है: ठंडे में रखें और पकाई कक्ष से तैयार करके खरीदार तक भेजें।",
  },
};
