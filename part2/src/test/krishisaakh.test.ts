import { describe, expect, it } from "vitest";
import {
  FLOWS,
  FLOW_IDS,
  composite,
  emaFold,
  starFinal,
  starRaw,
  tierOf,
  txScore,
} from "@/lib/krishisaakh";

describe("KrishiSaakh", () => {
  it("every flow's component weights add up to 1", () => {
    for (const f of FLOW_IDS)
      expect(FLOWS[f].comps.reduce((a, c) => a + c.w, 0)).toBeCloseTo(1, 10);
  });

  it("scores a transaction with the flow weights", () => {
    // Flow 1: 0.30·B_honour + 0.30·T_vacate + 0.20·Q_pre_sort + 0.20·P_rent
    expect(
      txScore(1, { B_honour: 100, T_vacate: 90, Q_pre_sort: 50, P_rent: 100 }).score,
    ).toBeCloseTo(30 + 27 + 10 + 20);
    // Flow 4 is 75% system (three system parts), 25% farmer
    expect(txScore(4, {}).systemShare).toBeCloseTo(0.75);
  });

  it("recency EMA: R_n = 0.25·S + 0.75·R_{n-1}", () => {
    expect(emaFold([])).toBeNull();
    expect(emaFold([80])).toBe(80);
    expect(emaFold([80, 40])).toBeCloseTo(0.25 * 40 + 0.75 * 80);
  });

  it("everyone starts at 5★ and stars shrink toward 5 with few deals", () => {
    expect(starRaw(100)).toBe(5);
    expect(starFinal(null, 0)).toBe(5);
    expect(starFinal(50, 5)).toBeCloseTo(0.5 * 3 + 0.5 * 5);
    expect(starFinal(0, 95)).toBeCloseTo(0.95 * 1 + 0.05 * 5);
  });

  it("assigns tiers", () => {
    expect(tierOf(4.6, 10)).toBe("gold");
    expect(tierOf(4.5, 3)).toBe("gold");
    expect(tierOf(5, 0)).toBe("standard"); // new accounts show 5★ but start in Standard
    expect(tierOf(5, 2)).toBe("standard");
    expect(tierOf(4.0, 10)).toBe("standard");
    expect(tierOf(3.2, 10)).toBe("standard");
    expect(tierOf(3.19, 10)).toBe("probation");
  });

  it("composite trust is the deal-weighted mean of role scores", () => {
    expect(
      composite([
        { r: 90, n: 3 },
        { r: 60, n: 1 },
        { r: null, n: 0 },
      ]),
    ).toEqual({ r: 82.5, n: 4 });
  });
});
