// Languages. Every screen calls t("English", "हिन्दी"): English and Hindi come from the code itself, and
// the other 13 languages from dictionaries in src/i18n/<code>.json, keyed by keyOf(English) and built
// from the list scripts/i18n-extract.ts writes. A text a dictionary does not have yet falls back to
// Hindi for languages written in Devanagari, otherwise to English, so a screen never breaks.
import templates from "../i18n/templates.json";
import { keyOf } from "./i18n-key";

export type Lang =
  | "en"
  | "hi"
  | "mr"
  | "bn"
  | "te"
  | "ta"
  | "gu"
  | "kn"
  | "ml"
  | "or"
  | "pa"
  | "as"
  | "ur"
  | "ne"
  | "mai";

export interface LangInfo {
  k: Lang;
  /** Name in English and in the language itself. */
  name: string;
  native: string;
  /** Speech code for read-aloud and voice input. */
  speech: string;
  /** Written in Devanagari: missing texts fall back to Hindi. */
  deva?: boolean;
  rtl?: boolean;
}
export const LANGS: LangInfo[] = [
  { k: "en", name: "English", native: "English", speech: "en-IN" },
  { k: "hi", name: "Hindi", native: "हिन्दी", speech: "hi-IN", deva: true },
  { k: "mr", name: "Marathi", native: "मराठी", speech: "mr-IN", deva: true },
  { k: "bn", name: "Bengali", native: "বাংলা", speech: "bn-IN" },
  { k: "te", name: "Telugu", native: "తెలుగు", speech: "te-IN" },
  { k: "ta", name: "Tamil", native: "தமிழ்", speech: "ta-IN" },
  { k: "gu", name: "Gujarati", native: "ગુજરાતી", speech: "gu-IN" },
  { k: "kn", name: "Kannada", native: "ಕನ್ನಡ", speech: "kn-IN" },
  { k: "ml", name: "Malayalam", native: "മലയാളം", speech: "ml-IN" },
  { k: "or", name: "Odia", native: "ଓଡ଼ିଆ", speech: "or-IN" },
  { k: "pa", name: "Punjabi", native: "ਪੰਜਾਬੀ", speech: "pa-IN" },
  { k: "as", name: "Assamese", native: "অসমীয়া", speech: "as-IN" },
  { k: "ur", name: "Urdu", native: "اردو", speech: "ur-IN", rtl: true },
  { k: "ne", name: "Nepali", native: "नेपाली", speech: "ne-NP", deva: true },
  { k: "mai", name: "Maithili", native: "मैथिली", speech: "hi-IN", deva: true },
];
export const langInfo = (k: string) => LANGS.find((l) => l.k === k) ?? LANGS[0]!;
export const isLang = (k: unknown): k is Lang => LANGS.some((l) => l.k === k);

export type Dict = Record<string, string>;
const loaders = import.meta.glob<Dict>("../i18n/*.json", { import: "default" });
/** The dictionary for a language (empty for English and Hindi, which live in the code). */
export async function loadDict(lang: Lang): Promise<Dict> {
  if (lang === "en" || lang === "hi") return {};
  const load = loaders[`../i18n/${lang}.json`];
  return load ? load() : {};
}

// Texts with numbers or names inside ("Sell within {1}"), most specific first.
const TEMPLATES = (templates as { k: string; re: string }[]).map((x) => ({
  k: x.k,
  re: new RegExp(x.re),
}));

/** The t(english, hindi) function for a language and its dictionary. */
export function makeT(lang: Lang, dict: Dict) {
  if (lang === "en") return (en: string) => en;
  if (lang === "hi") return (_en: string, hi: string) => hi;
  const deva = langInfo(lang).deva;
  const cache = new Map<string, string>();
  const exact = (en: string) => dict[keyOf(en)];
  return (en: string, hi: string) => {
    const hit = cache.get(en);
    if (hit !== undefined) return hit;
    let out = exact(en);
    if (out === undefined)
      for (const tpl of TEMPLATES) {
        const pattern = dict[tpl.k];
        if (pattern === undefined) continue;
        const m = tpl.re.exec(en);
        if (!m) continue;
        // the parts that were filled in (numbers, crop names…) are translated too when known
        out = pattern.replace(/\{(\d+)\}/g, (_, n: string) => {
          const v = m[Number(n)] ?? "";
          return exact(v) ?? v;
        });
        break;
      }
    if (out === undefined) out = deva ? hi : en;
    cache.set(en, out);
    return out;
  };
}
