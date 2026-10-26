import { describe, expect, it } from "vitest";
import { compare } from "@/lib/income";

describe("income estimator defaults (1000kg, ₹30/kg, 3 days)", () => {
  const r = compare({ weight: 1000, price: 30, days: 3 });
  it("selling without a cold chain nets ₹11,810", () => expect(r.a.net).toBe(11810));
  it("ChillChain route nets ₹20,388", () => expect(r.b.net).toBe(20388));
  it("extra profit is ₹8,578 (+73%)", () => {
    expect(r.diff).toBe(8578);
    expect(r.pct).toBe(73);
  });
});
