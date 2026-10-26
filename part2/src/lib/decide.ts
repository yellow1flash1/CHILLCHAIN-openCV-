// "Best move now": for one scanned lot, the money each realistic next step brings after storage and
// truck costs, so the grower can see which to take. Advisory only: real prices are still fixed by the
// database when a buyer orders. Every assumption is a named constant the screen shows the grower.
import type { Crop } from "./crops";
import { sellWindowHours, type Grade, type Ripeness } from "./shelf";
import { BUYER_CITIES, DISTRICT_LL, roadKm } from "./geo";

export const CRATE_KG = 20;
/** What B and C fetch compared with A in the same market (C is below what processors pay). */
export const GRADE_PRICE: Record<Grade, number> = { A: 1, B: 0.8, C: 0.45 };
/** Processors (juice, pulp, jam, drying) pay about half the A price, whatever the grade. */
export const PROCESSOR_PRICE = 0.5;
/** Buyers who must ripen fruit themselves pay less for an unripe lot. */
export const UNRIPE_PRICE = 0.85;
/** Hours a pre-cooler is booked for. */
export const PRECOOL_HOURS = 4;
/** Days in a ripening chamber, by crop (default 4). */
export const RIPEN_DAYS: Record<string, number> = {
  avocado: 4,
  mango: 5,
  kiwi: 3,
  passion: 3,
  apple: 3,
  cherry_tomato: 2,
};
const TRUCK_KMPH = 40,
  LOAD_HOURS = 2,
  REEFER_MARKUP = 1.35, // same as transport_quote(): refrigerated body costs 35% more
  SHARE_MARKUP = 1.15, // shared load: your share of the truck plus 15% for the extra stops
  MIN_SHARE_FARE = 150;
const RANK: Record<Grade, number> = { A: 3, B: 2, C: 1 };

/** Buyers pay less the fewer hours of shelf life are left when the produce reaches them. */
export function urgencyPrice(hoursAtBuyer: number) {
  if (hoursAtBuyer >= 48) return 1;
  if (hoursAtBuyer >= 24) return 0.95;
  if (hoursAtBuyer >= 12) return 0.85;
  if (hoursAtBuyer >= 6) return 0.75;
  if (hoursAtBuyer > 0) return 0.6;
  return 0;
}

export interface Facility {
  name: string;
  facility: "cold_room" | "precool" | "ripening";
  lat: number;
  lng: number;
  rate_per_crate_day: number;
  rate_per_crate_hour: number | null;
  free: number;
  accepting_bookings: boolean;
}
export interface OpenPreorder {
  id: string;
  crop: string;
  min_grade: Grade;
  kg_remaining: number;
  price_per_kg: number;
  deliver_district: string | null;
  buyer_name: string;
}
export interface Reefer {
  base_fare: number;
  per_km: number;
  capacity_kg: number;
}
export interface DecideInput {
  crop: Crop;
  grade: Grade;
  ripeness: Ripeness;
  kg: number;
  /** Hours left on the sell-by clock now, and hours since harvest. */
  hoursLeft: number;
  hoursSinceHarvest: number;
  coldChain: boolean;
  /** ₹/kg an A-grade lot fetches in the market today. */
  basePrice: number;
  district: string | null;
  rooms: Facility[];
  preorders: OpenPreorder[];
  reefer: Reefer;
}

export type MoveKey = "sell_now" | "precool" | "preorder" | "ripen" | "processor";
export type Blocker = "too_late" | "no_precooler" | "no_ripening";
export interface Move {
  key: MoveKey;
  feasible: boolean;
  blocker?: Blocker;
  /** ₹ left after storage and truck costs. */
  net: number;
  revenue: number;
  storage: number;
  transport: number;
  /** ₹/kg the main part of the lot is sold at. */
  pricePerKg: number;
  /** Where it goes: buyer city, facility name or pre-order buyer. */
  place: string | null;
  /** Hours of shelf life left when it reaches the buyer. */
  hoursAtBuyer: number | null;
  /** For a pre-order: its id and how many kg it takes. */
  preorderId?: string;
  preorderKg?: number;
}
export interface Decision {
  moves: Move[];
  best: Move | null;
  /** How much more the best move makes than selling today as is. */
  gainVsNow: number;
  city: string;
}

const round = (n: number) => Math.round(n);

export function decide(i: DecideInput): Decision {
  const from = DISTRICT_LL[i.district ?? ""] ?? DISTRICT_LL["Satara"]!;
  const city =
    [...BUYER_CITIES].sort(
      (a, b) => roadKm(from, DISTRICT_LL[a]!) - roadKm(from, DISTRICT_LL[b]!),
    )[0] ?? "Pune";
  const cityLL = DISTRICT_LL[city]!;
  const kg = Math.max(0, Math.round(i.kg));
  const crates = Math.ceil(kg / CRATE_KG);

  /** A refrigerated road leg for `w` kg: shared truck below a full load, whole trucks above. */
  const leg = (to: [number, number], w: number) => {
    const km = roadKm(from, to);
    const full = (i.reefer.base_fare + i.reefer.per_km * km) * REEFER_MARKUP;
    const fare =
      w <= 0
        ? 0
        : w >= i.reefer.capacity_kg
          ? Math.ceil(w / i.reefer.capacity_kg) * full
          : Math.max(MIN_SHARE_FARE, ((full * w) / i.reefer.capacity_kg) * SHARE_MARKUP);
    return { km, hours: km / TRUCK_KMPH + LOAD_HOURS, fare: round(fare) };
  };
  const nearest = (kind: Facility["facility"]) =>
    i.rooms
      .filter((r) => r.facility === kind && r.accepting_bookings && r.free >= crates)
      .map((r) => ({ r, km: roadKm(from, [r.lat, r.lng]) }))
      .sort((a, b) => a.km - b.km)[0] ?? null;

  const gradeP = i.basePrice * GRADE_PRICE[i.grade];
  const unripe = i.crop.ripens && i.ripeness <= 2 ? UNRIPE_PRICE : 1;
  const toCity = leg(cityLL, kg);
  const moves: Move[] = [];

  // 1. Sell today as it is
  const atNow = i.hoursLeft - toCity.hours;
  const pNow = gradeP * unripe * urgencyPrice(atNow);
  moves.push({
    key: "sell_now",
    feasible: atNow > 0,
    ...(atNow > 0 ? {} : { blocker: "too_late" as const }),
    revenue: round(kg * pNow),
    storage: 0,
    transport: toCity.fare,
    net: round(kg * pNow - toCity.fare),
    pricePerKg: round(pNow),
    place: city,
    hoursAtBuyer: round(atNow),
  });

  // 2. Pre-cool first (only for produce still in open air): the cold chain buys time, so buyers pay more
  if (!i.coldChain) {
    const pc = nearest("precool");
    const reach = pc ? pc.km / TRUCK_KMPH + 0.5 : 0;
    const coldLeft =
      sellWindowHours(i.crop, i.grade, i.ripeness, true) - i.hoursSinceHarvest - PRECOOL_HOURS;
    const at = coldLeft - toCity.hours;
    const ok = !!pc && pc.km <= 150 && i.hoursLeft > reach && at > 0;
    const storage = pc
      ? crates *
        PRECOOL_HOURS *
        (pc.r.rate_per_crate_hour ?? Math.max(1, Math.ceil(pc.r.rate_per_crate_day / 12)))
      : 0;
    const p = gradeP * unripe * urgencyPrice(at);
    moves.push({
      key: "precool",
      feasible: ok,
      ...(ok
        ? {}
        : { blocker: !pc || pc.km > 150 ? ("no_precooler" as const) : ("too_late" as const) }),
      revenue: round(kg * p),
      storage: round(storage),
      transport: toCity.fare,
      net: round(kg * p - storage - toCity.fare),
      pricePerKg: round(p),
      place: pc?.r.name ?? null,
      hoursAtBuyer: round(at),
    });
  }

  // 3. A buyer's pre-order (the best paying one this lot qualifies for); any extra kg is sold today
  const restPrice = atNow > 0 ? pNow : i.basePrice * PROCESSOR_PRICE;
  const po = i.preorders
    .filter(
      (p) => p.crop === i.crop.key && RANK[i.grade] >= RANK[p.min_grade] && p.kg_remaining > 0,
    )
    .map((p) => {
      const take = Math.min(kg, p.kg_remaining),
        rest = kg - take;
      const l = leg(DISTRICT_LL[p.deliver_district ?? ""] ?? cityLL, take);
      const at = i.hoursLeft - l.hours;
      const transport = l.fare + (rest > 0 ? leg(cityLL, rest).fare : 0);
      const revenue = take * p.price_per_kg + rest * restPrice;
      return { p, take, at, transport, revenue, net: revenue - transport };
    })
    .filter((x) => x.at > 0)
    .sort((a, b) => b.net - a.net)[0];
  if (po)
    moves.push({
      key: "preorder",
      feasible: true,
      revenue: round(po.revenue),
      storage: 0,
      transport: round(po.transport),
      net: round(po.net),
      pricePerKg: round(po.p.price_per_kg),
      place: po.p.buyer_name,
      hoursAtBuyer: round(po.at),
      preorderId: po.p.id,
      preorderKg: po.take,
    });

  // 4. Ripen, then sell ready-to-eat (unripe fruit that keeps ripening after harvest)
  if (i.crop.ripens && i.ripeness <= 2 && i.grade !== "C") {
    const rc = nearest("ripening");
    const days = RIPEN_DAYS[i.crop.key] ?? 4;
    const at = sellWindowHours(i.crop, i.grade, 3, true) - toCity.hours;
    const ok = !!rc && rc.km <= 400 && i.hoursLeft > rc.km / TRUCK_KMPH;
    const storage = rc ? crates * days * rc.r.rate_per_crate_day : 0;
    const p = gradeP * urgencyPrice(at);
    moves.push({
      key: "ripen",
      feasible: ok,
      ...(ok
        ? {}
        : { blocker: !rc || rc.km > 400 ? ("no_ripening" as const) : ("too_late" as const) }),
      revenue: round(kg * p),
      storage: round(storage),
      transport: toCity.fare,
      net: round(kg * p - storage - toCity.fare),
      pricePerKg: round(p),
      place: rc?.r.name ?? null,
      hoursAtBuyer: round(at),
    });
  }

  // 5. Processors: a lower price, but they take any grade and are not in a hurry
  const pProc = i.basePrice * PROCESSOR_PRICE;
  const procOk = i.hoursLeft > -24;
  moves.push({
    key: "processor",
    feasible: procOk,
    ...(procOk ? {} : { blocker: "too_late" as const }),
    revenue: round(kg * pProc),
    storage: 0,
    transport: toCity.fare,
    net: round(kg * pProc - toCity.fare),
    pricePerKg: round(pProc),
    place: city,
    hoursAtBuyer: null,
  });

  moves.sort((a, b) => Number(b.feasible) - Number(a.feasible) || b.net - a.net);
  const best = moves.find((m) => m.feasible) ?? null;
  const now = moves.find((m) => m.key === "sell_now")!;
  return {
    moves,
    best,
    gainVsNow: best ? best.net - (now.feasible ? now.net : 0) : 0,
    city,
  };
}
