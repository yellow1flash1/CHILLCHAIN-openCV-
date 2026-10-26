import { describe, expect, it } from "vitest";
import { isoDay, toRow } from "@/lib/mandi.server";
import { fmtKg, priceChange } from "@/lib/prices";

describe("live mandi prices", () => {
  it("reads Agmarknet dates", () => {
    expect(isoDay("23/10/2026")).toBe("2026-10-23");
    expect(isoDay("3/1/2026")).toBe("2026-01-03");
    expect(isoDay("2026-10-23")).toBeNull();
  });

  it("reads both datasets and turns ₹/quintal into ₹/kg", () => {
    const current = toRow(
      {
        state: "Keralam",
        district: "Idukki",
        market: "Kattappana Market",
        commodity: "Apple",
        variety: "Other",
        grade: "Grade A",
        arrival_date: "23/10/2026",
        min_price: 33000,
        max_price: 34500,
        modal_price: 34000,
      },
      "apple",
    );
    expect(current).toMatchObject({
      day: "2026-10-23",
      state: "Kerala", // Agmarknet's spelling mapped to ours
      modal_kg: 340,
      min_kg: 330,
      max_kg: 345,
    });
    const history = toRow(
      {
        Arrival_Date: "20/10/2026",
        Commodity: "Apple",
        District: "The Nilgiris",
        Grade: "Local",
        Market: "Udhagamandalam",
        Max_Price: 18000,
        Min_Price: 15000,
        Modal_Price: 16500,
        State: "Tamil Nadu",
        Variety: "American",
      },
      "apple",
    );
    expect(history).toMatchObject({ day: "2026-10-20", state: "Tamil Nadu", modal_kg: 165 });
  });

  it("drops reports that cannot be per kg", () => {
    const base = { state: "Bihar", market: "X", arrival_date: "22/10/2026" };
    expect(toRow({ ...base, modal_price: 60 }, "tuberose")).toBeNull(); // ₹0.60/kg: other units
    expect(toRow({ ...base, modal_price: 0 }, "litchi")).toBeNull();
    expect(toRow({ ...base, market: "", modal_price: 5000 }, "litchi")).toBeNull();
    // A missing min/max falls back to the modal price.
    expect(toRow({ ...base, modal_price: 5000 }, "litchi")).toMatchObject({
      min_kg: 50,
      max_kg: 50,
    });
  });

  it("shows a change only when there is one", () => {
    expect(priceChange({ change: 4.7 })).toBe(4.7);
    expect(priceChange({ change: null })).toBeNull();
    expect(priceChange(undefined)).toBeNull();
  });

  it("formats rupees per kg", () => {
    expect(fmtKg(1234.4)).toBe("1,234");
    expect(fmtKg(52.6)).toBe("53");
    expect(fmtKg(4.25)).toBe("4.3");
  });
});
