import { describe, expect, it } from "vitest";
import { OPTIONS, evaluate, pickHighlights, rankOptions, type AdvisorInput } from "@/lib/advisor";

const base: AdvisorInput = {
  region: "semiarid",
  acres: 2,
  budget: 1_000_000,
  water: "low",
  nearCity: true,
};
const opt = (k: string) => OPTIONS.find((o) => o.key === k)!;

describe("crop advisor", () => {
  it("semi-arid, low water: drought-tolerant fruit ranks near the top", () => {
    const top = rankOptions(base)
      .slice(0, 4)
      .map((r) => r.o.key);
    expect(top.some((k) => ["dragon", "pomegranate", "fig"].includes(k))).toBe(true);
  });
  it("kiwi is ruled out outside the hills", () => {
    expect(evaluate(opt("kiwi"), base).ok).toBe(false);
    expect(evaluate(opt("kiwi"), { ...base, region: "hills", water: "high" }).ok).toBe(true);
  });
  it("city growers without land only get indoor options", () => {
    const ok = rankOptions({ ...base, region: "urban", acres: 0 }).filter((r) => r.ok);
    expect(ok.length).toBeGreaterThan(0);
    expect(ok.every((r) => r.o.unit === "unit")).toBe(true);
  });
  it("a small budget cannot start a polyhouse", () => {
    const r = evaluate(opt("gerbera"), { ...base, budget: 200_000 });
    expect(r.ok).toBe(false);
    expect(r.whyNotEn).toMatch(/to start small/);
  });
  it("scale is capped by land and budget", () => {
    const r = evaluate(opt("dragon"), base);
    expect(r.scale).toBeLessThanOrEqual(2);
    expect(r.setupCost + opt("dragon").opex * r.scale).toBeLessThanOrEqual(base.budget);
  });
  it("payback falls inside the year cash turns positive", () => {
    const r = evaluate(opt("marigold"), base);
    expect(r.paybackYears).not.toBeNull();
    expect(r.paybackYears!).toBeLessThanOrEqual(1);
  });
  it("highlights come from suitable options", () => {
    const h = pickHighlights(rankOptions(base))!;
    expect(h.best.ok && h.fastest.ok && h.richest.ok).toBe(true);
  });
});
