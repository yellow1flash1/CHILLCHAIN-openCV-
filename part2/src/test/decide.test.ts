import { describe, expect, it } from "vitest";
import { cropBy } from "@/lib/crops";
import { decide, urgencyPrice, type DecideInput, type Facility } from "@/lib/decide";
import { heatFactor, sellWindowHours } from "@/lib/shelf";
import { weatherAlerts } from "@/lib/weather";
import { gradingPrompt } from "@/lib/grading";

const room = (
  facility: Facility["facility"],
  name: string,
  lat: number,
  lng: number,
): Facility => ({
  name,
  facility,
  lat,
  lng,
  rate_per_crate_day: 30,
  rate_per_crate_hour: 3,
  free: 100,
  accepting_bookings: true,
});
const ROOMS = [
  room("precool", "Mahabaleshwar pre-cool", 17.92, 73.66),
  room("ripening", "Pune ripening", 18.49, 73.86),
  room("cold_room", "Kutch cold hub", 23.24, 69.67),
];
const base: DecideInput = {
  crop: cropBy("strawberry"),
  grade: "A",
  ripeness: 3,
  kg: 100,
  hoursLeft: 30,
  hoursSinceHarvest: 18,
  coldChain: false,
  basePrice: 150,
  district: "Satara",
  rooms: ROOMS,
  preorders: [],
  reefer: { base_fare: 1500, per_km: 35, capacity_kg: 3000 },
};
const move = (d: ReturnType<typeof decide>, key: string) => d.moves.find((m) => m.key === key)!;

describe("best move now", () => {
  it("open-air strawberries: pre-cooling pays more than selling today", () => {
    const d = decide(base);
    expect(d.city).toBe("Pune");
    expect(d.best?.key).toBe("precool");
    expect(move(d, "precool").net).toBeGreaterThan(move(d, "sell_now").net);
    expect(d.gainVsNow).toBeGreaterThan(0);
  });
  it("C grade goes to processors", () => {
    expect(decide({ ...base, grade: "C", coldChain: true }).best?.key).toBe("processor");
  });
  it("unripe avocado: ripening chamber wins", () => {
    const d = decide({
      ...base,
      crop: cropBy("avocado"),
      ripeness: 1,
      hoursLeft: 150,
      hoursSinceHarvest: 10,
      coldChain: true,
    });
    expect(d.best?.key).toBe("ripen");
  });
  it("a better-paying pre-order wins and the extra kg are sold today", () => {
    const d = decide({
      ...base,
      coldChain: true,
      hoursLeft: 100,
      preorders: [
        {
          id: "po1",
          crop: "strawberry",
          min_grade: "A",
          kg_remaining: 60,
          price_per_kg: 200,
          deliver_district: "Pune",
          buyer_name: "Dark store Pune",
        },
      ],
    });
    expect(d.best?.key).toBe("preorder");
    expect(move(d, "preorder").preorderKg).toBe(60);
  });
  it("a pre-order needing a better grade is ignored", () => {
    const d = decide({
      ...base,
      grade: "B",
      preorders: [
        {
          id: "po1",
          crop: "strawberry",
          min_grade: "A",
          kg_remaining: 60,
          price_per_kg: 400,
          deliver_district: "Pune",
          buyer_name: "x",
        },
      ],
    });
    expect(d.moves.some((m) => m.key === "preorder")).toBe(false);
  });
  it("no time left: only processors remain", () => {
    const d = decide({ ...base, hoursLeft: 1 });
    expect(move(d, "sell_now").feasible).toBe(false);
    expect(d.best?.key).toBe("processor");
  });
  it("buyers pay less as shelf life runs out", () => {
    expect([60, 30, 15, 8, 2, -1].map(urgencyPrice)).toEqual([1, 0.95, 0.85, 0.75, 0.6, 0]);
  });
});

describe("weather-aware clock", () => {
  const s = cropBy("strawberry");
  it("25 °C leaves the clock unchanged", () => {
    expect(heatFactor(25)).toBe(1);
    expect(sellWindowHours(s, "A", 3, false, 25)).toBe(48);
  });
  it("35 °C makes open-air produce spoil 2.5× faster", () => {
    expect(heatFactor(35)).toBeCloseTo(2.5);
    expect(sellWindowHours(s, "A", 3, false, 35)).toBe(19);
  });
  it("cool weather helps, but never beyond the cold chain", () => {
    expect(sellWindowHours(s, "A", 3, false, 15)).toBe(120);
    expect(sellWindowHours(s, "A", 3, false, 0)).toBe(168);
  });
  it("the cold chain ignores air temperature", () => {
    expect(sellWindowHours(s, "A", 3, true, 40)).toBe(168);
  });
  it("alerts: heat, rain, cold, or good weather", () => {
    const f = { now: 30, avg24: 30, max: 30, min: 18, rainMm: 0, rainProb: 10 };
    expect(weatherAlerts(f).map((a) => a.kind)).toEqual(["good"]);
    expect(weatherAlerts({ ...f, max: 40 }).map((a) => a.kind)).toEqual(["heat"]);
    expect(weatherAlerts({ ...f, max: 34, rainProb: 80 }).map((a) => a.kind)).toEqual([
      "hot",
      "rain",
    ]);
    expect(weatherAlerts({ ...f, min: 3 }).map((a) => a.kind)).toEqual(["cold"]);
  });
});

describe("AI grading guide", () => {
  it("names the crop and its own rules", () => {
    const p = gradingPrompt(cropBy("litchi"));
    expect(p).toContain("Shahi litchi");
    expect(p).toContain("browning");
  });
  it("flowers are graded by stems", () => {
    expect(gradingPrompt(cropBy("rose"))).toContain("stems");
  });
});
