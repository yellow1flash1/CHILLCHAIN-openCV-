// KrishiSaakh engine, shown in the app as "ChillScore": 4-stakeholder, 6-way reputation engine. Pure definitions and maths shared by the
// server (scoring a rating) and the browser (badges, breakdowns, simulator).
import type { Role } from "./types";

export type FlowId = 1 | 2 | 3 | 4 | 5 | 6;
/** system = computed from app records (gate pass, trip and escrow timestamps); measured = rater reports a
 *  measurement (dwell time, weighbridge slip) until GPS / dharmkanta feeds are connected; peer = 3-tap question. */
export type Source = "system" | "measured" | "peer";
export interface Component {
  k: string;
  w: number;
  src: Source;
  en: string;
  hi: string;
  q?: { en: string; hi: string; opts: [string, string, string]; optsHi: [string, string, string] };
  timed?: boolean;
}
export interface Flow {
  id: FlowId;
  from: Role;
  to: Role;
  kind: "booking" | "lot" | "trip";
  en: string;
  hi: string;
  badgeEn: string;
  badgeHi: string;
  split: string;
  comps: Component[];
}

const GPB: [string, string, string] = ["Good", "Partial", "Bad"];
const GPBhi: [string, string, string] = ["अच्छा", "आंशिक", "खराब"];

export const FLOWS: Record<FlowId, Flow> = {
  1: {
    id: 1,
    from: "owner",
    to: "farmer",
    kind: "booking",
    en: "Tenant Discipline",
    hi: "किरायेदार अनुशासन",
    badgeEn: "Storage Discipline",
    badgeHi: "भंडारण अनुशासन",
    split: "60% system / 40% owner",
    comps: [
      {
        k: "B_honour",
        w: 0.3,
        src: "system",
        en: "Booking honoured (deposited vs reserved)",
        hi: "बुकिंग निभाई (जमा बनाम आरक्षित)",
      },
      {
        k: "T_vacate",
        w: 0.3,
        src: "system",
        en: "Vacated on time (−5 pts/day overstay)",
        hi: "समय पर खाली किया (−5/दिन)",
        timed: true,
      },
      {
        k: "Q_pre_sort",
        w: 0.2,
        src: "peer",
        en: "Produce sorted, dry and in ventilated crates",
        hi: "माल छँटा, सूखा और हवादार क्रेट में",
        q: {
          en: "Was the produce sorted, dry and packed in clean, ventilated crates?",
          hi: "क्या माल छँटा, सूखा और साफ़ हवादार क्रेट में था?",
          opts: GPB,
          optsHi: GPBhi,
        },
      },
      {
        k: "P_rent",
        w: 0.2,
        src: "system",
        en: "Rent & palledari cleared",
        hi: "किराया व पल्लेदारी चुकाई",
      },
    ],
  },
  2: {
    id: 2,
    from: "buyer",
    to: "farmer",
    kind: "lot",
    en: "Produce Quality & Integrity",
    hi: "माल गुणवत्ता व ईमानदारी",
    badgeEn: "Supplier Quality",
    badgeHi: "आपूर्ति गुणवत्ता",
    split: "40% system / 60% buyer",
    comps: [
      {
        k: "Q_uniform",
        w: 0.35,
        src: "peer",
        en: "Top-to-bottom lot uniformity (no topping)",
        hi: "ऊपर से नीचे तक एक जैसा माल",
        q: {
          en: "Was the lot the same quality from top to bottom?",
          hi: "क्या माल ऊपर से नीचे तक एक जैसा था?",
          opts: GPB,
          optsHi: GPBhi,
        },
      },
      {
        k: "M_spec",
        w: 0.25,
        src: "peer",
        en: "Arrived fresh: firm, cold, no bruising or rot",
        hi: "ताज़ा पहुँचा: सख़्त, ठंडा, बिना दाग या सड़न",
        q: {
          en: "Did it arrive fresh: firm, still cold, no bruising or rot?",
          hi: "क्या माल ताज़ा पहुँचा: सख़्त, ठंडा, बिना दाग या सड़न?",
          opts: GPB,
          optsHi: GPBhi,
        },
      },
      {
        k: "W_accuracy",
        w: 0.2,
        src: "measured",
        en: "Weight vs promised",
        hi: "वज़न बनाम वादा",
        q: {
          en: "Net weight on your scale vs promised",
          hi: "आपके काँटे पर वज़न बनाम वादा",
          opts: ["Full weight", "1–5% short", ">5% short"],
          optsHi: ["पूरा वज़न", "1–5% कम", ">5% कम"],
        },
      },
      {
        k: "C_honour",
        w: 0.2,
        src: "system",
        en: "Deal honoured despite price swings",
        hi: "भाव बदलने पर भी सौदा निभाया",
      },
    ],
  },
  3: {
    id: 3,
    from: "transporter",
    to: "farmer",
    kind: "trip",
    en: "Shipper Readiness",
    hi: "लदान तैयारी",
    badgeEn: "Shipper Readiness",
    badgeHi: "लदान तैयारी",
    split: "50% system / 50% driver",
    comps: [
      {
        k: "R_no_cancel",
        w: 0.3,
        src: "system",
        en: "No last-minute cancellation",
        hi: "आख़िरी समय पर रद्द नहीं किया",
      },
      {
        k: "L_ready",
        w: 0.3,
        src: "measured",
        en: "Load ready on arrival (dwell time)",
        hi: "पहुँचने पर माल तैयार (इंतज़ार)",
        timed: true,
        q: {
          en: "How long did you wait at the farm before loading?",
          hi: "लदान से पहले खेत पर कितना इंतज़ार किया?",
          opts: ["< 15 min", "15–60 min", "> 1 hour"],
          optsHi: ["< 15 मिनट", "15–60 मिनट", "> 1 घंटा"],
        },
      },
      {
        k: "A_access",
        w: 0.2,
        src: "peer",
        en: "Accurate pin & honest road access",
        hi: "सही लोकेशन व रास्ते की सही जानकारी",
        q: {
          en: "Was the GPS pin accurate and the road (kaccha rasta) as described?",
          hi: "क्या लोकेशन सही थी और रास्ता बताए अनुसार था?",
          opts: GPB,
          optsHi: GPBhi,
        },
      },
      {
        k: "H_assist",
        w: 0.2,
        src: "peer",
        en: "Promised loading help provided",
        hi: "वादा की गई लदान मदद मिली",
        q: {
          en: "Did the farmer provide the promised loading help?",
          hi: "क्या किसान ने वादा की गई लदान मदद दी?",
          opts: GPB,
          optsHi: GPBhi,
        },
      },
    ],
  },
  4: {
    id: 4,
    from: "farmer",
    to: "transporter",
    kind: "trip",
    en: "Logistics Reliability",
    hi: "ढुलाई भरोसेमंदी",
    badgeEn: "Logistics Reliability",
    badgeHi: "ढुलाई भरोसेमंदी",
    split: "70% system / 30% farmer",
    comps: [
      {
        k: "P_arrival",
        w: 0.25,
        src: "system",
        en: "On-time arrival at farm gate",
        hi: "खेत पर समय से पहुँचा",
        timed: true,
      },
      {
        k: "R_commit",
        w: 0.25,
        src: "system",
        en: "Ride commitment (no hand-backs)",
        hi: "ट्रिप निभाई (वापस नहीं की)",
      },
      {
        k: "G_exact",
        w: 0.25,
        src: "system",
        en: "Delivered before the deadline",
        hi: "समय सीमा से पहले पहुँचाया",
        timed: true,
      },
      {
        k: "C_cargo",
        w: 0.25,
        src: "peer",
        en: "Kept cold, gentle handling, nothing missing",
        hi: "ठंडा रखा, आराम से संभाला, कुछ गायब नहीं",
        q: {
          en: "Was the reefer kept cold, the crates handled gently and nothing missing?",
          hi: "क्या रीफ़र ठंडा रहा, क्रेट आराम से संभाले और कुछ गायब नहीं हुआ?",
          opts: GPB,
          optsHi: GPBhi,
        },
      },
    ],
  },
  5: {
    id: 5,
    from: "farmer",
    to: "buyer",
    kind: "lot",
    en: "Fair Trade & Payment",
    hi: "निष्पक्ष व्यापार व भुगतान",
    badgeEn: "Fair Trade & Payment",
    badgeHi: "निष्पक्ष भुगतान",
    split: "55% system / 45% farmer",
    comps: [
      {
        k: "P_speed",
        w: 0.35,
        src: "system",
        en: "Settlement speed (instant / T+1)",
        hi: "भुगतान की गति",
        timed: true,
      },
      {
        k: "W_fair",
        w: 0.3,
        src: "peer",
        en: "Fair digital weighing, no katauti",
        hi: "सही तौल, कोई कटौती नहीं",
        q: {
          en: "Was weighing fair, with no unfair deduction (katauti) after unloading?",
          hi: "क्या तौल सही थी और उतारने के बाद कोई कटौती नहीं हुई?",
          opts: GPB,
          optsHi: GPBhi,
        },
      },
      {
        k: "D_price_lock",
        w: 0.2,
        src: "system",
        en: "Agreed price honoured",
        hi: "तय भाव निभाया",
      },
      {
        k: "U_turnaround",
        w: 0.15,
        src: "measured",
        en: "Fast unloading turnaround",
        hi: "जल्दी माल उतारा",
        timed: true,
        q: {
          en: "How long did the vehicle wait to be unloaded?",
          hi: "गाड़ी खाली होने में कितना इंतज़ार हुआ?",
          opts: ["< 1 hour", "1–3 hours", "> 3 hours"],
          optsHi: ["< 1 घंटा", "1–3 घंटे", "> 3 घंटे"],
        },
      },
    ],
  },
  6: {
    id: 6,
    from: "farmer",
    to: "owner",
    kind: "booking",
    en: "Custody & Preservation",
    hi: "सुरक्षा व संरक्षण",
    badgeEn: "Custody & Preservation",
    badgeHi: "सुरक्षा व संरक्षण",
    split: "40% system / 60% farmer",
    comps: [
      {
        k: "C_temp",
        w: 0.35,
        src: "peer",
        en: "No rot, chill injury or over-ripening",
        hi: "कोई सड़न, ठंड से नुकसान या ज़्यादा पकाव नहीं",
        q: {
          en: "Did your produce come out without rot, chill injury or over-ripening?",
          hi: "क्या माल बिना सड़न, ठंड नुकसान या ज़्यादा पकाव के निकला?",
          opts: GPB,
          optsHi: GPBhi,
        },
      },
      {
        k: "E_release",
        w: 0.25,
        src: "measured",
        en: "Fast release when requested",
        hi: "माँगने पर जल्दी माल दिया",
        timed: true,
        q: {
          en: "How quickly was your stock released after you asked?",
          hi: "माँगने के बाद माल कितनी जल्दी मिला?",
          opts: ["Same day", "1–2 days", "> 2 days"],
          optsHi: ["उसी दिन", "1–2 दिन", "> 2 दिन"],
        },
      },
      {
        k: "L_integrity",
        w: 0.2,
        src: "peer",
        en: "Exact tagged sacks returned",
        hi: "वही टैग वाले बोरे लौटाए",
        q: {
          en: "Did you get back your exact tagged sacks, with no swapping or rodent loss?",
          hi: "क्या वही टैग वाले बोरे मिले, बिना अदला-बदली या चूहों के नुकसान?",
          opts: GPB,
          optsHi: GPBhi,
        },
      },
      {
        k: "B_transparent",
        w: 0.2,
        src: "system",
        en: "Invoice matches tariff, no hidden charges",
        hi: "बिल रेट कार्ड जैसा, कोई छिपा शुल्क नहीं",
      },
    ],
  },
};
export const FLOW_IDS: FlowId[] = [1, 2, 3, 4, 5, 6];
export const PEER_VALUE = [100, 50, 0] as const; // Good / Partial / Bad
/** Ratings about each role. A farmer gets three role badges; everyone else gets one. */
export const FLOWS_ABOUT: Record<Role, FlowId[]> = {
  farmer: [1, 2, 3],
  transporter: [4],
  buyer: [5],
  owner: [6],
};
/** Which farmer badge each counterpart sees. */
export const FARMER_BADGE_FOR: Partial<Record<Role, FlowId>> = {
  owner: 1,
  buyer: 2,
  transporter: 3,
};
export const COUNTERPART: Record<FlowId, FlowId> = { 1: 6, 6: 1, 2: 5, 5: 2, 3: 4, 4: 3 };

/** Weighted score of one transaction from its component values (0–100 each). */
export function txScore(flow: FlowId, values: Record<string, number>) {
  const f = FLOWS[flow];
  const part = (src: (s: Source) => boolean) => {
    const cs = f.comps.filter((c) => src(c.src));
    const w = cs.reduce((a, c) => a + c.w, 0);
    return w ? cs.reduce((a, c) => a + c.w * (values[c.k] ?? 0), 0) / w : 0;
  };
  return {
    score: f.comps.reduce((a, c) => a + c.w * (values[c.k] ?? 0), 0),
    system: part((s) => s !== "peer"),
    peer: part((s) => s === "peer"),
    systemShare: f.comps.filter((c) => c.src !== "peer").reduce((a, c) => a + c.w, 0),
  };
}

export const EMA_ALPHA = 0.25;
/** Recency EMA: R_n = 0.25·S_n + 0.75·R_{n−1}. The first transaction sets R_1 = S_1. */
export const emaFold = (scores: number[]) =>
  scores.reduce<number | null>(
    (r, s) => (r === null ? s : EMA_ALPHA * s + (1 - EMA_ALPHA) * r),
    null,
  );
export const BAYES_M = 5;
export const BAYES_C = 5.0; // everyone starts at 5★; ratings can only move them from there
export const starRaw = (r: number) => 1 + 4 * (r / 100);
/** Bayesian smoothing toward the 5.0★ starting rating with m = 5 virtual transactions. */
export const starFinal = (r: number | null, n: number) =>
  r === null || n === 0
    ? BAYES_C
    : (n / (n + BAYES_M)) * starRaw(r) + (BAYES_M / (n + BAYES_M)) * BAYES_C;

export type Tier = "gold" | "standard" | "probation";
export const MIN_GOLD_DEALS = 3;
/** Gold needs ≥ 4.5★ and at least 3 ratings, so new accounts start in Standard even though they show 5★. */
export const tierOf = (stars: number, n: number): Tier =>
  stars >= 4.5 && n >= MIN_GOLD_DEALS ? "gold" : stars >= 3.2 ? "standard" : "probation";
export const TIERS: Record<
  Tier,
  { en: string; hi: string; perksEn: string[]; perksHi: string[]; tone: "green" | "gold" | "red" }
> = {
  gold: {
    en: "Gold Tier",
    hi: "गोल्ड टियर",
    tone: "green",
    perksEn: [
      "Zero-advance cold storage booking",
      "Priority truck dispatch",
      "Verified Grade-A Supplier badge",
    ],
    perksHi: [
      "बिना अग्रिम कोल्ड स्टोरेज बुकिंग",
      "ट्रक भेजने में प्राथमिकता",
      "सत्यापित ग्रेड-A सप्लायर बैज",
    ],
  },
  standard: {
    en: "Standard Tier",
    hi: "स्टैंडर्ड टियर",
    tone: "gold",
    perksEn: ["Normal booking terms"],
    perksHi: ["सामान्य बुकिंग शर्तें"],
  },
  probation: {
    en: "Probation Tier",
    hi: "प्रोबेशन टियर",
    tone: "red",
    perksEn: ["Refundable escrow deposit needed before booking a truck or cold storage slot"],
    perksHi: ["ट्रक या कोल्ड स्टोरेज बुक करने से पहले वापसी योग्य जमा राशि ज़रूरी"],
  },
};

export interface FlowRep {
  r: number | null;
  n: number;
}
/** Composite across several flows (e.g. a farmer's three badges): N-weighted mean of R. */
export function composite(reps: FlowRep[]): FlowRep {
  const n = reps.reduce((a, x) => a + x.n, 0);
  if (!n) return { r: null, n: 0 };
  return { r: reps.reduce((a, x) => a + (x.r ?? 0) * x.n, 0) / n, n };
}
