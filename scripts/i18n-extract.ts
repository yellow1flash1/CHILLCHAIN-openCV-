// Collects every English text the app can show, keyed for the language dictionaries.
//   bun scripts/i18n-extract.ts
// Writes src/i18n/en.json (key → English, the list translators work from), src/i18n/templates.json
// (texts with ${…} parts, matched at run time) and src/i18n/source.tsv (key, English, Hindi) for review.
// Sources: every t("English", "हिन्दी") call, plus bilingual data such as { en, hi }, { descEn, descHi },
// ["English", "हिन्दी"] tuples and { opts, optsHi } lists.
import ts from "typescript";
import { readdirSync, readFileSync, statSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { keyOf } from "../src/lib/i18n-key.ts";

const ROOT = join(import.meta.dir, "..");
// The admin console stays in English; the privacy policy stays in English and Hindi (legal text).
const SKIP = [
  "/components/ui/",
  "routeTree.gen.ts",
  "/test/",
  "/i18n/",
  "admin.tsx",
  "privacy.tsx",
];
const DEVANAGARI = /[ऀ-ॿ]/;
const LATIN = /[A-Za-z]/;
// Texts that come from the database rather than the code (vehicle types in neon/002, 005 and 009).
const EXTRA: [string, string][] = [
  ["Mini truck / Tata Ace", "मिनी ट्रक / टाटा एस"],
  ["Bolero pickup", "बोलेरो पिकअप"],
  ["Tractor-trolley", "ट्रैक्टर-ट्रॉली"],
  ["Tata 407", "टाटा 407"],
  ["6-wheeler Canter (6 t)", "6-पहिया कैंटर (6 टन)"],
  ["10/12-wheeler truck (16 t)", "10/12-पहिया ट्रक (16 टन)"],
  ["Insulated / reefer van", "इंसुलेटेड / रीफ़र वैन"],
  ["Reefer mini van (1 t)", "रीफ़र मिनी वैन (1 टन)"],
];

function files(dir: string): string[] {
  return readdirSync(dir).flatMap((n) => {
    const p = join(dir, n);
    if (statSync(p).isDirectory()) return files(p);
    return /\.(ts|tsx)$/.test(n) && !SKIP.some((s) => p.includes(s)) ? [p] : [];
  });
}

const exact = new Map<string, { en: string; hi: string }>();
const templates = new Map<string, { en: string; hi: string; re: string; letters: number }>();
const esc = (s: string) => s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");

/** Text of a string literal, or a template turned into "Sell within {1}" plus its matching regex. */
function read(
  node: ts.Node,
): { kind: "exact"; text: string } | { kind: "tpl"; text: string; re: string } | null {
  if (ts.isStringLiteral(node) || ts.isNoSubstitutionTemplateLiteral(node))
    return { kind: "exact", text: node.text };
  if (ts.isTemplateExpression(node)) {
    let text = node.head.text,
      re = "^" + esc(node.head.text);
    node.templateSpans.forEach((s, i) => {
      text += `{${i + 1}}` + s.literal.text;
      re += "([\\s\\S]*?)" + esc(s.literal.text);
    });
    return { kind: "tpl", text, re: re + "$" };
  }
  return null;
}
function add(enNode: ts.Node, hiNode: ts.Node | undefined) {
  const en = read(enNode),
    hi = hiNode ? read(hiNode) : null;
  if (!en || !LATIN.test(en.text) || DEVANAGARI.test(en.text)) return;
  const hiText = hi?.text ?? "";
  if (en.kind === "exact") {
    if (!exact.has(en.text)) exact.set(en.text, { en: en.text, hi: hiText });
  } else {
    const letters = en.text.replace(/\{\d+\}/g, "").replace(/[^A-Za-z]/g, "").length;
    if (letters < 4) return; // too little fixed text to recognise safely
    if (!templates.has(en.text))
      templates.set(en.text, { en: en.text, hi: hiText, re: en.re, letters });
  }
}
const partner = (name: string) =>
  name === "en"
    ? "hi"
    : name === "opts"
      ? "optsHi"
      : name.endsWith("En")
        ? name.slice(0, -2) + "Hi"
        : null;
const propName = (p: ts.ObjectLiteralElementLike) =>
  ts.isPropertyAssignment(p) && (ts.isIdentifier(p.name) || ts.isStringLiteral(p.name))
    ? p.name.text
    : null;

for (const f of files(join(ROOT, "src"))) {
  const src = ts.createSourceFile(f, readFileSync(f, "utf8"), ts.ScriptTarget.Latest, true);
  const visit = (n: ts.Node) => {
    // t("English", "हिन्दी")
    if (
      ts.isCallExpression(n) &&
      ts.isIdentifier(n.expression) &&
      n.expression.text === "t" &&
      n.arguments.length >= 2
    )
      add(n.arguments[0]!, n.arguments[1]);
    // { en: "…", hi: "…" }, { descEn, descHi }, { opts: [...], optsHi: [...] }
    if (ts.isObjectLiteralExpression(n)) {
      const props = new Map(
        n.properties.flatMap((p) => {
          const k = propName(p);
          return k && ts.isPropertyAssignment(p) ? [[k, p.initializer] as const] : [];
        }),
      );
      for (const [k, v] of props) {
        const pk = partner(k);
        const pv = pk ? props.get(pk) : undefined;
        if (!pv) continue;
        if (ts.isArrayLiteralExpression(v) && ts.isArrayLiteralExpression(pv))
          v.elements.forEach((e, i) => add(e, pv.elements[i]));
        else add(v, pv);
      }
    }
    // ["English", "हिन्दी"] tuples (also ["key", "English", "हिन्दी"])
    if (ts.isArrayLiteralExpression(n)) {
      const els = n.elements;
      for (let i = 0; i + 1 < els.length; i++) {
        const a = read(els[i]!),
          b = read(els[i + 1]!);
        if (a && b && LATIN.test(a.text) && DEVANAGARI.test(b.text)) add(els[i]!, els[i + 1]);
      }
    }
    ts.forEachChild(n, visit);
  };
  visit(src);
}
for (const [en, hi] of EXTRA) if (!exact.has(en)) exact.set(en, { en, hi });

const out: Record<string, string> = {};
const seen = new Map<string, string>();
const rows: string[] = [];
const put = (en: string, hi: string) => {
  const k = keyOf(en);
  const prev = seen.get(k);
  if (prev !== undefined && prev !== en) throw new Error(`Key collision: "${prev}" / "${en}"`);
  seen.set(k, en);
  out[k] = en;
  rows.push(`${k}\t${en.replace(/\s+/g, " ")}\t${hi.replace(/\s+/g, " ")}`);
};
for (const { en, hi } of exact.values()) put(en, hi);
const tpls = [...templates.values()].sort((a, b) => b.letters - a.letters);
for (const { en, hi } of tpls) put(en, hi);

const dir = join(ROOT, "src", "i18n");
writeFileSync(join(dir, "en.json"), JSON.stringify(out, null, 2) + "\n");
writeFileSync(
  join(dir, "templates.json"),
  JSON.stringify(
    tpls.map((t) => ({ k: keyOf(t.en), re: t.re })),
    null,
    2,
  ) + "\n",
);
writeFileSync(join(dir, "source.tsv"), "key\tEnglish\tHindi\n" + rows.join("\n") + "\n");
const chars = Object.values(out).reduce((a, s) => a + s.length, 0);
console.log(
  `${exact.size} texts + ${tpls.length} templates = ${Object.keys(out).length} keys, ${chars} English characters`,
);
