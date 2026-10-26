// ProfitPlanter (crop advisor): "Which high-value crop should I plant?" Ranks options by climate fit, water, payback
// and 5-year profit for the grower's own land and budget. Pure functions shared by the screen and tests.
// Costs, yields and prices are indicative estimates for planning; the subsidy share is a typical
// MIDH / NHB pattern and must be checked with the district horticulture office.

export type Region = "hills" | "humid" | "semiarid" | "plains" | "arid" | "urban";
export type Water = "low" | "medium" | "high";
export interface AdvisorInput {
  region: Region;
  acres: number;
  budget: number;
  water: Water;
  nearCity: boolean;
}

export const REGIONS: { k: Region; en: string; hi: string; egEn: string; egHi: string }[] = [
  {
    k: "hills",
    en: "Cool hills",
    hi: "ठंडे पहाड़",
    egEn: "Himachal, Kashmir, Uttarakhand, NE hills",
    egHi: "हिमाचल, कश्मीर, उत्तराखंड, पूर्वोत्तर पहाड़",
  },
  {
    k: "humid",
    en: "Humid tropics",
    hi: "नम उष्ण क्षेत्र",
    egEn: "Coorg, Wayanad, Konkan, coastal Kerala",
    egHi: "कुर्ग, वायनाड, कोंकण, तटीय केरल",
  },
  {
    k: "semiarid",
    en: "Semi-arid plateau",
    hi: "अर्ध-शुष्क पठार",
    egEn: "Pune, Nashik, Solapur, north Karnataka",
    egHi: "पुणे, नाशिक, सोलापुर, उत्तर कर्नाटक",
  },
  {
    k: "plains",
    en: "Northern plains",
    hi: "उत्तरी मैदान",
    egEn: "Bihar, UP, Punjab, Haryana",
    egHi: "बिहार, यूपी, पंजाब, हरियाणा",
  },
  {
    k: "arid",
    en: "Hot and dry",
    hi: "गर्म और सूखा",
    egEn: "Kutch, Rajasthan",
    egHi: "कच्छ, राजस्थान",
  },
  {
    k: "urban",
    en: "City / indoor (no farmland)",
    hi: "शहर / इनडोर (खेत नहीं)",
    egEn: "Shed, room or terrace near a city",
    egHi: "शहर के पास शेड, कमरा या छत",
  },
];

export interface Option {
  key: string;
  /** Crop key in crops.ts, for the emoji and name used elsewhere. */
  crop: string;
  en: string;
  hi: string;
  emoji: string;
  /** "acre" needs farmland; "unit" is a shed or room (size given in unitEn). */
  unit: "acre" | "unit";
  unitEn: string;
  unitHi: string;
  setup: number;
  opex: number;
  /** Sellable output per year for years 1–6; later years repeat the last value. */
  yields: number[];
  price: number;
  sellUnit: "kg" | "stem";
  fit: Record<Region, number>;
  water: Water;
  subsidy: number;
  shortLife: boolean;
  noteEn: string;
  noteHi: string;
}

const fit = (
  hills: number,
  humid: number,
  semiarid: number,
  plains: number,
  arid: number,
  urban = 0,
) => ({ hills, humid, semiarid, plains, arid, urban }) as Record<Region, number>;

export const OPTIONS: Option[] = [
  {
    key: "dragon",
    crop: "dragon",
    en: "Dragon fruit",
    hi: "ड्रैगन फ्रूट",
    emoji: "🐉",
    unit: "acre",
    unitEn: "acre",
    unitHi: "एकड़",
    setup: 450000,
    opex: 80000,
    yields: [0, 2000, 5000, 7000, 8000, 8000],
    price: 100,
    sellUnit: "kg",
    fit: fit(20, 55, 95, 70, 85),
    water: "low",
    subsidy: 0.4,
    shortLife: false,
    noteEn:
      "Cactus: little water, fruits from year 2, 20+ years of harvests. Poles are the big cost.",
    noteHi: "कैक्टस: कम पानी, दूसरे साल से फल, 20+ साल तक फसल। खंभे सबसे बड़ा खर्च।",
  },
  {
    key: "avocado",
    crop: "avocado",
    en: "Avocado",
    hi: "एवोकाडो",
    emoji: "🥑",
    unit: "acre",
    unitEn: "acre",
    unitHi: "एकड़",
    setup: 160000,
    opex: 45000,
    yields: [0, 0, 0, 1000, 2500, 4500],
    price: 150,
    sellUnit: "kg",
    fit: fit(55, 95, 45, 25, 5),
    water: "medium",
    subsidy: 0.4,
    shortLife: false,
    noteEn:
      "Grafted plants fruit in year 4. Needs well-drained soil and no frost. Sell through a ripening chamber.",
    noteHi: "कलमी पौधे चौथे साल फल देते हैं। पानी न रुके, पाला न हो। पकाई कक्ष से बेचें।",
  },
  {
    key: "kiwi",
    crop: "kiwi",
    en: "Kiwi",
    hi: "कीवी",
    emoji: "🥝",
    unit: "acre",
    unitEn: "acre",
    unitHi: "एकड़",
    setup: 420000,
    opex: 70000,
    yields: [0, 0, 0, 1500, 4000, 7000],
    price: 110,
    sellUnit: "kg",
    fit: fit(95, 35, 5, 0, 0),
    water: "high",
    subsidy: 0.5,
    shortLife: false,
    noteEn: "Needs winter chill (mid-hills). Trellis costs most. Stores for months in a cold room.",
    noteHi: "सर्दी की ठंड चाहिए (मध्य पहाड़)। ट्रेलिस सबसे महँगा। कोल्ड रूम में महीनों टिकता है।",
  },
  {
    key: "blueberry",
    crop: "blueberry",
    en: "Blueberry (protected, in pots)",
    hi: "ब्लूबेरी (शेड नेट, गमलों में)",
    emoji: "🫐",
    unit: "acre",
    unitEn: "acre",
    unitHi: "एकड़",
    setup: 2200000,
    opex: 400000,
    yields: [0, 1500, 3000, 4000, 4500, 4500],
    price: 550,
    sellUnit: "kg",
    fit: fit(70, 50, 60, 40, 20),
    water: "medium",
    subsidy: 0.5,
    shortLife: true,
    noteEn:
      "Very high value, very high setup: acidic potting mix, shade net, drip. Sells to quick-commerce.",
    noteHi:
      "बहुत ऊँचा दाम, बहुत ऊँचा खर्च: अम्लीय मिट्टी, शेड नेट, ड्रिप। क्विक-कॉमर्स को बिकती है।",
  },
  {
    key: "strawberry",
    crop: "strawberry",
    en: "Strawberry",
    hi: "स्ट्रॉबेरी",
    emoji: "🍓",
    unit: "acre",
    unitEn: "acre",
    unitHi: "एकड़",
    setup: 350000,
    opex: 250000,
    yields: [8000, 8000, 8000, 8000, 8000, 8000],
    price: 120,
    sellUnit: "kg",
    fit: fit(95, 40, 75, 60, 30),
    water: "medium",
    subsidy: 0.4,
    shortLife: true,
    noteEn:
      "Money in the first season, but plants are replanted every year. Lasts 2 days: pre-cool the same day.",
    noteHi: "पहले ही सीज़न में कमाई, पर हर साल नए पौधे। 2 दिन टिकती है: उसी दिन प्री-कूल करें।",
  },
  {
    key: "passion",
    crop: "passion",
    en: "Passion fruit",
    hi: "पैशन फ्रूट",
    emoji: "🟡",
    unit: "acre",
    unitEn: "acre",
    unitHi: "एकड़",
    setup: 200000,
    opex: 60000,
    yields: [1500, 6000, 6000, 5000, 4000, 4000],
    price: 80,
    sellUnit: "kg",
    fit: fit(60, 90, 50, 35, 10),
    water: "medium",
    subsidy: 0.4,
    shortLife: false,
    noteEn: "Climber on a trellis; fruits within a year. Juice makers buy B and C grade.",
    noteHi: "ट्रेलिस पर बेल; एक साल में फल। जूस वाले B और C ग्रेड भी लेते हैं।",
  },
  {
    key: "fig",
    crop: "fig",
    en: "Fig (anjeer)",
    hi: "अंजीर",
    emoji: "🟤",
    unit: "acre",
    unitEn: "acre",
    unitHi: "एकड़",
    setup: 150000,
    opex: 70000,
    yields: [0, 2000, 4000, 5000, 5000, 5000],
    price: 90,
    sellUnit: "kg",
    fit: fit(20, 30, 95, 45, 60),
    water: "low",
    subsidy: 0.4,
    shortLife: true,
    noteEn:
      "Hardy and low-water, but fresh figs last 2 days: plan pre-cooling and buyers before harvest.",
    noteHi:
      "मज़बूत, कम पानी; पर ताज़ा अंजीर 2 दिन टिकता है: तोड़ने से पहले प्री-कूल और खरीदार तय करें।",
  },
  {
    key: "pomegranate",
    crop: "pomegranate",
    en: "Pomegranate (export Bhagwa)",
    hi: "अनार (निर्यात भगवा)",
    emoji: "🟥",
    unit: "acre",
    unitEn: "acre",
    unitHi: "एकड़",
    setup: 220000,
    opex: 110000,
    yields: [0, 0, 4000, 6000, 8000, 8000],
    price: 90,
    sellUnit: "kg",
    fit: fit(25, 20, 95, 50, 80),
    water: "low",
    subsidy: 0.4,
    shortLife: false,
    noteEn: "Drought-tolerant and stores well. Export needs residue-free spraying records.",
    noteHi: "सूखा सहने वाला, अच्छा टिकता है। निर्यात के लिए छिड़काव का रिकॉर्ड चाहिए।",
  },
  {
    key: "grapes",
    crop: "grapes",
    en: "Grapes (export)",
    hi: "अंगूर (निर्यात)",
    emoji: "🍇",
    unit: "acre",
    unitEn: "acre",
    unitHi: "एकड़",
    setup: 800000,
    opex: 250000,
    yields: [0, 4000, 8000, 10000, 10000, 10000],
    price: 70,
    sellUnit: "kg",
    fit: fit(10, 10, 95, 30, 60),
    water: "medium",
    subsidy: 0.4,
    shortLife: false,
    noteEn:
      "Y-trellis vineyard. Export pack-houses pre-cool within hours; a rejected container costs lakhs.",
    noteHi:
      "Y-ट्रेलिस बाग। निर्यात पैक-हाउस घंटों में प्री-कूल करते हैं; लौटा कंटेनर लाखों का नुकसान।",
  },
  {
    key: "litchi",
    crop: "litchi",
    en: "Litchi",
    hi: "लीची",
    emoji: "🔴",
    unit: "acre",
    unitEn: "acre",
    unitHi: "एकड़",
    setup: 110000,
    opex: 45000,
    yields: [0, 0, 0, 0, 1500, 3000],
    price: 85,
    sellUnit: "kg",
    fit: fit(50, 60, 15, 90, 0),
    water: "high",
    subsidy: 0.4,
    shortLife: true,
    noteEn:
      "Long wait (year 5) and a 48-hour shelf life: only with a pack-house or pre-cooler nearby.",
    noteHi:
      "लंबा इंतज़ार (पाँचवाँ साल) और 48 घंटे की टिकाऊपन: पास में पैक-हाउस या प्री-कूलर हो तभी।",
  },
  {
    key: "gerbera",
    crop: "gerbera",
    en: "Gerbera (polyhouse)",
    hi: "जरबेरा (पॉलीहाउस)",
    emoji: "🌼",
    unit: "acre",
    unitEn: "acre",
    unitHi: "एकड़",
    setup: 4000000,
    opex: 1400000,
    yields: [800000, 1200000, 1200000, 1000000, 1000000, 1000000],
    price: 2.5,
    sellUnit: "stem",
    fit: fit(75, 70, 85, 65, 50),
    water: "medium",
    subsidy: 0.5,
    shortLife: true,
    noteEn:
      "Year-round stems for florists and weddings. Polyhouse subsidy is often 50%, paid after setup.",
    noteHi: "पूरे साल फूल, फूलवालों और शादियों के लिए। पॉलीहाउस पर अक्सर 50% सब्सिडी, बनने के बाद।",
  },
  {
    key: "marigold",
    crop: "marigold",
    en: "Marigold (2 crops a year)",
    hi: "गेंदा (साल में 2 फसल)",
    emoji: "🏵️",
    unit: "acre",
    unitEn: "acre",
    unitHi: "एकड़",
    setup: 25000,
    opex: 70000,
    yields: [12000, 12000, 12000, 12000, 12000, 12000],
    price: 40,
    sellUnit: "kg",
    fit: fit(60, 80, 90, 90, 60),
    water: "medium",
    subsidy: 0,
    shortLife: true,
    noteEn:
      "Cheap to start; price jumps around Diwali, Dussehra and the wedding season. Time your harvest.",
    noteHi: "शुरू करना सस्ता; दिवाली, दशहरा और शादियों में भाव उछलता है। कटाई का समय तय करें।",
  },
  {
    key: "mushroom_button",
    crop: "mushroom_button",
    en: "Button mushroom (AC room)",
    hi: "बटन मशरूम (AC कमरा)",
    emoji: "🍄",
    unit: "unit",
    unitEn: "AC room (~1,500 sq ft)",
    unitHi: "AC कमरा (~1,500 वर्ग फुट)",
    setup: 900000,
    opex: 450000,
    yields: [6000, 6000, 6000, 6000, 6000, 6000],
    price: 110,
    sellUnit: "kg",
    fit: fit(85, 85, 85, 85, 70, 95),
    water: "low",
    subsidy: 0.4,
    shortLife: true,
    noteEn:
      "Grows all year indoors, no farmland. Lasts 1 day out of the cold: sell to nearby hotels and stores.",
    noteHi:
      "पूरे साल अंदर उगता है, खेत नहीं चाहिए। ठंड के बाहर 1 दिन टिकता है: पास के होटल-दुकानों को बेचें।",
  },
  {
    key: "mushroom_oyster",
    crop: "mushroom_oyster",
    en: "Oyster mushroom (low-cost shed)",
    hi: "ढींगरी मशरूम (सस्ता शेड)",
    emoji: "🍄",
    unit: "unit",
    unitEn: "shed (~500 sq ft)",
    unitHi: "शेड (~500 वर्ग फुट)",
    setup: 150000,
    opex: 120000,
    yields: [3000, 3000, 3000, 3000, 3000, 3000],
    price: 150,
    sellUnit: "kg",
    fit: fit(80, 95, 75, 85, 50, 85),
    water: "low",
    subsidy: 0.4,
    shortLife: true,
    noteEn:
      "Easiest mushroom to start, grows on paddy or wheat straw. Dried oyster sells when fresh demand is low.",
    noteHi: "शुरू करने में सबसे आसान, धान या गेहूँ के भूसे पर। ताज़ी माँग कम हो तो सूखा बेचें।",
  },
  {
    key: "microgreens",
    crop: "microgreens",
    en: "Microgreens (indoor racks)",
    hi: "माइक्रोग्रीन्स (इनडोर रैक)",
    emoji: "🌱",
    unit: "unit",
    unitEn: "rack room (~200 sq ft)",
    unitHi: "रैक कमरा (~200 वर्ग फुट)",
    setup: 120000,
    opex: 180000,
    yields: [1000, 1000, 1000, 1000, 1000, 1000],
    price: 600,
    sellUnit: "kg",
    fit: fit(60, 60, 60, 60, 60, 100),
    water: "low",
    subsidy: 0,
    shortLife: true,
    noteEn:
      "Harvest every 7–12 days for restaurants and quick-commerce. Only works close to a city.",
    noteHi: "हर 7–12 दिन में कटाई, रेस्टोरेंट और क्विक-कॉमर्स के लिए। शहर के पास ही चलता है।",
  },
];

export interface Result {
  o: Option;
  /** Acres (or rooms) you can afford, capped by your land for field crops. */
  scale: number;
  /** Full setup cost at that scale (subsidy usually arrives later, so the budget must cover this). */
  setupCost: number;
  subsidyAmt: number;
  /** Cumulative cash after subsidy, by year 0..5. */
  cash: number[];
  paybackYears: number | null;
  profit5: number;
  firstHarvestYear: number;
  score: number;
  sub: { climate: number; water: number; payback: number; profit: number };
  ok: boolean;
  whyNotEn?: string;
  whyNotHi?: string;
}

const W: Record<Water, number> = { low: 0, medium: 1, high: 2 };
const yieldIn = (o: Option, y: number) => o.yields[Math.min(y, o.yields.length) - 1] ?? 0;

export function evaluate(o: Option, i: AdvisorInput): Result {
  const perScale = o.setup + o.opex;
  const affordable = i.budget / perScale;
  const cap = o.unit === "acre" ? (i.region === "urban" ? 0 : i.acres) : 3;
  const scale = Math.floor(Math.min(cap, affordable) * 10) / 10;
  const minScale = o.unit === "acre" ? 0.25 : 1;
  const s = Math.max(scale, 0);
  const setupCost = Math.round(o.setup * s);
  const subsidyAmt = Math.round(setupCost * o.subsidy);
  const cash = [-(setupCost - subsidyAmt)];
  for (let y = 1; y <= 5; y++)
    cash.push(cash[y - 1]! + Math.round((yieldIn(o, y) * o.price - o.opex) * s));
  let paybackYears: number | null = null;
  for (let y = 1; y <= 5; y++)
    if (cash[y]! >= 0) {
      const before = cash[y - 1]!,
        gain = cash[y]! - before;
      paybackYears = Math.round((y - 1 + (gain > 0 ? -before / gain : 1)) * 10) / 10;
      break;
    }
  const profit5 = cash[5]!;
  const firstHarvestYear = o.yields.findIndex((v) => v > 0) + 1;

  const climate = o.fit[i.region];
  const gap = W[o.water] - W[i.water];
  const water = gap <= 0 ? 100 : gap === 1 ? 50 : 10;
  const payback =
    paybackYears === null
      ? 5
      : paybackYears <= 1
        ? 100
        : paybackYears <= 2
          ? 85
          : paybackYears <= 3
            ? 70
            : paybackYears <= 4
              ? 50
              : 30;
  const net = Math.max(1, setupCost - subsidyAmt);
  const profit = Math.max(0, Math.min(100, (profit5 / net) * 25));
  const market = o.shortLife ? (i.nearCity ? 8 : -8) : 0;
  const score = Math.max(
    0,
    Math.min(100, 0.35 * climate + 0.15 * water + 0.25 * payback + 0.25 * profit + market),
  );

  let whyNotEn = "",
    whyNotHi = "";
  if (climate < 30) {
    whyNotEn = "Not suited to your climate";
    whyNotHi = "आपकी जलवायु के लिए ठीक नहीं";
  } else if (o.unit === "acre" && i.region === "urban") {
    whyNotEn = "Needs farmland";
    whyNotHi = "खेत चाहिए";
  } else if (scale < minScale) {
    const need = Math.round(perScale * minScale);
    whyNotEn = `Needs about ₹${need.toLocaleString("en-IN")} to start small`;
    whyNotHi = `छोटी शुरुआत के लिए लगभग ₹${need.toLocaleString("en-IN")} चाहिए`;
  }
  return {
    o,
    scale: s,
    setupCost,
    subsidyAmt,
    cash,
    paybackYears,
    profit5,
    firstHarvestYear,
    score: Math.round(score),
    sub: { climate, water, payback, profit: Math.round(profit) },
    ok: !whyNotEn,
    ...(whyNotEn ? { whyNotEn, whyNotHi } : {}),
  };
}

/** Every option evaluated; suitable ones first, best score first. */
export function rankOptions(i: AdvisorInput): Result[] {
  return OPTIONS.map((o) => evaluate(o, i)).sort(
    (a, b) => Number(b.ok) - Number(a.ok) || b.score - a.score,
  );
}

/** The three highlight cards: best overall, quickest payback, most profit in 5 years. */
export function pickHighlights(rs: Result[]) {
  const ok = rs.filter((r) => r.ok);
  if (!ok.length) return null;
  const best = ok[0]!;
  const fastest = [...ok].sort(
    (a, b) => (a.paybackYears ?? 99) - (b.paybackYears ?? 99) || b.score - a.score,
  )[0]!;
  const richest = [...ok].sort((a, b) => b.profit5 - a.profit5)[0]!;
  return { best, fastest, richest };
}
