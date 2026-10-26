import { describe, expect, it } from "vitest";
import { LANGS, makeT, type Dict } from "@/lib/i18n";
import { keyOf } from "@/lib/i18n-key";
import en from "@/i18n/en.json";

const files = import.meta.glob<Dict>("../i18n/*.json", { eager: true, import: "default" });
const dict = (lang: string) => files[`../i18n/${lang}.json`];
const english = en as Dict;
const placeholders = (s: string) => (s.match(/\{\d+\}/g) ?? []).sort().join(",");
const others = LANGS.filter((l) => l.k !== "en" && l.k !== "hi");

describe("languages", () => {
  it("has 15 languages, each with a dictionary except English and Hindi", () => {
    expect(LANGS).toHaveLength(15);
    for (const l of others) expect(dict(l.k), l.name).toBeDefined();
  });

  it("keeps the {n} parts of every template in every language", () => {
    for (const l of others)
      for (const [k, v] of Object.entries(dict(l.k)!))
        if (english[k] !== undefined)
          expect(placeholders(v), `${l.name}: ${english[k]}`).toBe(placeholders(english[k]));
  });

  it("covers nearly all of the app's texts in every language", () => {
    const total = Object.keys(english).length;
    for (const l of others) {
      const d = dict(l.k)!;
      const have = Object.keys(english).filter((k) => d[k]).length;
      expect(have / total, l.name).toBeGreaterThan(0.9);
    }
  });

  it("translates exact texts and texts with numbers inside", () => {
    const d: Dict = {
      [keyOf("Sell")]: "विका",
      [keyOf("Sell within {1}")]: "{1} मध्ये विका",
      [keyOf("rated by the {1}")]: "{1} ने दिलेले रेटिंग",
      [keyOf("farmer")]: "शेतकरी",
    };
    const t = makeT("mr", d);
    expect(t("Sell", "बेचें")).toBe("विका");
    expect(t("Sell within 5 h", "5 घंटे में बेचें")).toBe("5 h मध्ये विका");
    // the filled-in part is translated too when it is a known text
    expect(t("rated by the farmer", "किसान ने रेट किया")).toBe("शेतकरी ने दिलेले रेटिंग");
  });

  it("falls back to Hindi for Devanagari languages and to English for the rest", () => {
    expect(makeT("mr", {})("Not translated yet", "अभी अनुवाद नहीं")).toBe("अभी अनुवाद नहीं");
    expect(makeT("ta", {})("Not translated yet", "अभी अनुवाद नहीं")).toBe("Not translated yet");
    expect(makeT("en", {})("Sell", "बेचें")).toBe("Sell");
    expect(makeT("hi", {})("Sell", "बेचें")).toBe("बेचें");
  });

  it("uses the real Marathi dictionary end to end", () => {
    const t = makeT("mr", dict("mr")!);
    expect(t("Settings", "सेटिंग्स")).toBe("सेटिंग्ज");
    expect(t("Sell within 6 h", "6 घंटे में बेचें")).toBe("6 h मध्ये विका");
  });
});
