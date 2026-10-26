import { describe, expect, it } from "vitest";
import { cropBy } from "@/lib/crops";
import {
  channelFor,
  fmtLeft,
  priceFactor,
  routeFor,
  sellByFrom,
  sellWindowHours,
  urgency,
} from "@/lib/shelf";

const H = 3_600_000;

describe("sell-by window", () => {
  const strawberry = cropBy("strawberry"); // 48 h open, 168 h cold
  it("ripe A-grade strawberry in open air lasts 48 h", () =>
    expect(sellWindowHours(strawberry, "A", 3, false)).toBe(48));
  it("cold chain stretches it to a week", () =>
    expect(sellWindowHours(strawberry, "A", 3, true)).toBe(168));
  it("lower grade and riper fruit shorten the window", () => {
    expect(sellWindowHours(strawberry, "B", 3, false)).toBe(34);
    expect(sellWindowHours(strawberry, "A", 5, false)).toBe(12);
  });
  it("never drops below 2 hours", () =>
    expect(sellWindowHours(cropBy("tuberose"), "C", 5, false)).toBe(2));
  it("sell-by is harvest time plus the window", () =>
    expect(sellByFrom(new Date(0), 10).getTime()).toBe(10 * H));
});

describe("price steps down as a lot ages", () => {
  const created = new Date(0);
  const sellBy = new Date(100 * H);
  it.each([
    [10, 1],
    [50, 1],
    [60, 0.9],
    [80, 0.75],
    [95, 0.6],
    [100, 0.5],
    [130, 0.5],
  ])("at hour %i the factor is %f", (h, f) => expect(priceFactor(created, sellBy, h * H)).toBe(f));
  it("lots without a clock keep full price", () => expect(priceFactor(created, null)).toBe(1));
});

describe("channels and routes", () => {
  const sellBy = new Date(100 * H);
  it("fresh A-grade is premium retail, ageing A-grade is a flash sale", () => {
    expect(channelFor("A", new Date(0), sellBy, 10 * H)).toBe("retail");
    expect(channelFor("A", new Date(0), sellBy, 70 * H)).toBe("flash");
  });
  it("C-grade and expired lots go to processors", () => {
    expect(channelFor("C", new Date(0), sellBy, 10 * H)).toBe("processor");
    expect(channelFor("A", new Date(0), sellBy, 101 * H)).toBe("processor");
  });
  it("unripe avocado goes to a ripening chamber, unripe strawberry does not", () => {
    expect(routeFor(cropBy("avocado"), "A", 1)).toBe("ripen");
    expect(routeFor(cropBy("strawberry"), "A", 1)).toBe("retail");
  });
  it("overripe fruit goes to processors", () =>
    expect(routeFor(cropBy("mango"), "A", 5)).toBe("processor"));
});

describe("countdown display", () => {
  it("formats days, hours and minutes", () => {
    expect(fmtLeft(53.5)).toBe("2 d 5 h");
    expect(fmtLeft(5 + 20 / 60)).toBe("5 h 20 m");
    expect(fmtLeft(0.5)).toBe("30 m");
    expect(fmtLeft(-1)).toBe("0 m");
  });
  it("colours by share of the window left", () => {
    expect(urgency(40, 48)).toBe("fresh");
    expect(urgency(20, 48)).toBe("soon");
    expect(urgency(5, 48)).toBe("urgent");
    expect(urgency(0, 48)).toBe("expired");
  });
});
