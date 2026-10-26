// Server-only. Live mandi prices from Agmarknet (Government of India, via data.gov.in; free API key).
// Reports are copied into mandi_prices (neon/012) and every screen reads from there. A refresh runs at
// most every 30 minutes for all users together: today's reports come from the "current daily price"
// dataset, and the last two weeks from the "variety-wise daily prices" dataset when a crop's history
// is missing. Prices arrive in ₹ per quintal and are stored per kg.
import { CROPS } from "./crops";
import { q, q1 } from "./db.server";

const CURRENT = "9ef84268-d588-465a-a308-a864a43d0070";
const HISTORY = "35985678-0d79-46b4-9ed6-6f13308a1d24";
const FRESH_MIN = 30;
const KEEP_DAYS = 90;

// Agmarknet spells some states differently from our district list.
const STATE_ALIAS: Record<string, string> = {
  Keralam: "Kerala",
  Orissa: "Odisha",
  Pondicherry: "Puducherry",
  Chattisgarh: "Chhattisgarh",
  Uttrakhand: "Uttarakhand",
  "NCT of Delhi": "Delhi",
  "Jammu & Kashmir": "Jammu and Kashmir",
};

export interface MandiRow {
  day: string;
  crop: string;
  state: string;
  district: string;
  market: string;
  commodity: string;
  variety: string;
  grade: string;
  min_kg: number;
  max_kg: number;
  modal_kg: number;
}

/** "23/10/2026" → "2026-10-23" (null if it isn't a date). */
export function isoDay(s: string): string | null {
  const m = /^(\d{1,2})\/(\d{1,2})\/(\d{4})$/.exec(s.trim());
  return m ? `${m[3]}-${m[2]!.padStart(2, "0")}-${m[1]!.padStart(2, "0")}` : null;
}

/** One API record (either dataset; their field names differ in case) → a row, or null if unusable. */
export function toRow(r: Record<string, unknown>, crop: string): MandiRow | null {
  // "modal_price" in one dataset is "Modal_Price" in the other.
  const v = (k: string) => r[k] ?? r[k.replace(/(^|_)([a-z])/g, (m) => m.toUpperCase())];
  const g = (k: string) => String(v(k) ?? "").trim();
  const n = (k: string) => Number(v(k));
  const day = isoDay(g("arrival_date"));
  const modal = n("modal_price"),
    min = n("min_price"),
    max = n("max_price");
  const state = g("state"),
    market = g("market");
  // Below ₹2/kg is a report in other units (some flowers are quoted per bunch or per 100 stems).
  if (!day || !state || !market || !(modal >= 200)) return null;
  const kg = (x: number) => Math.round(Number.isFinite(x) && x > 0 ? x : modal) / 100;
  return {
    day,
    crop,
    state: STATE_ALIAS[state] ?? state,
    district: g("district"),
    market,
    commodity: g("commodity"),
    variety: g("variety"),
    grade: g("grade"),
    min_kg: kg(min),
    max_kg: kg(max),
    modal_kg: kg(modal),
  };
}

async function fetchRecords(resource: string, params: Record<string, string>, key: string) {
  const u = new URL(`https://api.data.gov.in/resource/${resource}`);
  u.searchParams.set("api-key", key);
  u.searchParams.set("format", "json");
  for (const [k, v] of Object.entries(params)) u.searchParams.set(k, v);
  const res = await fetch(u, { signal: AbortSignal.timeout(15_000) });
  if (!res.ok) throw new Error(`data.gov.in ${res.status}`);
  const j = (await res.json()) as { records?: Record<string, unknown>[] };
  return j.records ?? [];
}

async function save(rows: MandiRow[]) {
  // One row per key, or Postgres refuses to update the same row twice in one statement.
  const uniq = new Map<string, MandiRow>();
  for (const r of rows)
    uniq.set([r.crop, r.day, r.state, r.market, r.variety, r.grade].join("|"), r);
  const all = [...uniq.values()];
  for (let i = 0; i < all.length; i += 500) {
    const b = all.slice(i, i + 500);
    const col = <K extends keyof MandiRow>(k: K) => b.map((r) => r[k]);
    await q(
      `INSERT INTO mandi_prices (day, crop, state, district, market, commodity, variety, grade, min_kg, max_kg, modal_kg)
       SELECT * FROM unnest($1::date[], $2::text[], $3::text[], $4::text[], $5::text[], $6::text[], $7::text[], $8::text[], $9::numeric[], $10::numeric[], $11::numeric[])
       ON CONFLICT (crop, day, state, market, variety, grade) DO UPDATE SET
         min_kg = EXCLUDED.min_kg, max_kg = EXCLUDED.max_kg, modal_kg = EXCLUDED.modal_kg, fetched_at = now()`,
      [
        col("day"),
        col("crop"),
        col("state"),
        col("district"),
        col("market"),
        col("commodity"),
        col("variety"),
        col("grade"),
        col("min_kg"),
        col("max_kg"),
        col("modal_kg"),
      ],
    );
  }
}

/** Refresh from data.gov.in if the copy is older than 30 minutes. Never throws. */
export async function refreshMandi(): Promise<{ ok: boolean; note?: string }> {
  const key = process.env["DATA_GOV_IN_API_KEY"];
  if (!key) return { ok: false, note: "no_key" };
  // Claim the refresh, so parallel requests and server instances don't all call the API.
  const claim = await q1(
    `UPDATE mandi_refresh SET started_at = now()
     WHERE id = 1 AND started_at < now() - make_interval(mins => $1) RETURNING id`,
    [FRESH_MIN],
  ).catch(() => null);
  if (!claim) return { ok: true };
  try {
    const have = await q<{ crop: string; days: number; last: string }>(
      `SELECT crop, count(DISTINCT day)::int AS days, max(day)::text AS last
       FROM mandi_prices WHERE day >= current_date - 14 GROUP BY crop`,
    );
    const known = new Map(have.map((h) => [h.crop, h]));
    const jobs = CROPS.flatMap((c) => c.agmark.map((name) => ({ crop: c.key, name })));
    let fetched = 0;
    const run = async ({ crop, name }: { crop: string; name: string }) => {
      const rows: MandiRow[] = [];
      const cur = await fetchRecords(CURRENT, { limit: "2000", "filters[commodity]": name }, key);
      for (const r of cur) {
        const row = toRow(r, crop);
        if (row) rows.push(row);
      }
      const h = known.get(crop);
      if (!h || h.days < 7) {
        const past = await fetchRecords(
          HISTORY,
          { limit: "3000", "filters[Commodity]": name, "sort[Arrival_Date]": "desc" },
          key,
        );
        for (const r of past) {
          const row = toRow(r, crop);
          if (row) rows.push(row);
        }
      }
      fetched += rows.length;
      if (rows.length) await save(rows);
    };
    // A few at a time, to be gentle on the API.
    for (let i = 0; i < jobs.length; i += 4)
      await Promise.allSettled(jobs.slice(i, i + 4).map(run));
    await q(`DELETE FROM mandi_prices WHERE day < current_date - $1::int`, [KEEP_DAYS]);
    await q(`UPDATE mandi_refresh SET finished_at = now(), ok = true, note = $1 WHERE id = 1`, [
      `${fetched} reports`,
    ]);
    return { ok: true };
  } catch (e) {
    console.error("mandi refresh failed", e);
    await q(`UPDATE mandi_refresh SET finished_at = now(), ok = false, note = $1 WHERE id = 1`, [
      String(e).slice(0, 200),
    ]).catch(() => undefined);
    return { ok: false, note: "fetch_failed" };
  }
}

export interface CropPrice {
  crop: string;
  /** Latest report day in the window. */
  day: string;
  /** Median of each market's latest modal price in the last 4 days (₹/kg). */
  median: number;
  low: number;
  high: number;
  markets: number;
  /** The same, for markets in the asked state (null if none reported). */
  stateMedian: number | null;
  stateMarkets: number;
  /** Like-for-like change in %: each market's latest price against its previous report, median over
   *  markets (null unless at least 3 markets reported twice). */
  change: number | null;
  /** All-India daily median, oldest first, last 14 days with reports. */
  series: { day: string; median: number; markets: number }[];
}

const num = (v: unknown) => Math.round(Number(v) * 100) / 100;

/** Summary per crop: national and state median, range, and a two-week trend. */
export async function cropPrices(state: string | null): Promise<CropPrice[]> {
  const now = await q<{
    crop: string;
    day: string;
    n: number;
    med: number;
    p10: number;
    p90: number;
    smed: number | null;
    sn: number;
  }>(
    `WITH latest AS (
       SELECT DISTINCT ON (crop, state, market, variety, grade) crop, state, day, modal_kg
       FROM mandi_prices WHERE day >= current_date - 4
       ORDER BY crop, state, market, variety, grade, day DESC)
     SELECT crop, max(day)::text AS day, count(*)::int AS n,
       percentile_cont(0.5) WITHIN GROUP (ORDER BY modal_kg) AS med,
       percentile_cont(0.1) WITHIN GROUP (ORDER BY modal_kg) AS p10,
       percentile_cont(0.9) WITHIN GROUP (ORDER BY modal_kg) AS p90,
       percentile_cont(0.5) WITHIN GROUP (ORDER BY modal_kg) FILTER (WHERE state = $1) AS smed,
       count(*) FILTER (WHERE state = $1)::int AS sn
     FROM latest GROUP BY crop`,
    [state ?? ""],
  );
  const series = await q<{ crop: string; day: string; med: number; n: number }>(
    `SELECT crop, day::text AS day, percentile_cont(0.5) WITHIN GROUP (ORDER BY modal_kg) AS med,
       count(*)::int AS n
     FROM mandi_prices WHERE day >= current_date - 14 GROUP BY crop, day ORDER BY crop, day`,
  );
  // Comparing whole-day medians would mix different markets, so compare each market with itself.
  const changes = await q<{ crop: string; chg: number; n: number }>(
    `WITH r AS (
       SELECT crop, state, market, variety, grade, day, modal_kg,
         row_number() OVER (PARTITION BY crop, state, market, variety, grade ORDER BY day DESC) AS rn
       FROM mandi_prices WHERE day >= current_date - 14)
     SELECT a.crop, percentile_cont(0.5) WITHIN GROUP (ORDER BY a.modal_kg / b.modal_kg - 1) AS chg,
       count(*)::int AS n
     FROM r a JOIN r b USING (crop, state, market, variety, grade)
     WHERE a.rn = 1 AND b.rn = 2 AND a.day >= current_date - 4
     GROUP BY a.crop`,
  );
  const change = new Map(
    changes.filter((c) => c.n >= 3).map((c) => [c.crop, Math.round(Number(c.chg) * 1000) / 10]),
  );
  return now.map((r) => ({
    crop: r.crop,
    day: r.day,
    median: num(r.med),
    low: num(r.p10),
    high: num(r.p90),
    markets: r.n,
    stateMedian: r.smed == null ? null : num(r.smed),
    stateMarkets: r.sn,
    change: change.get(r.crop) ?? null,
    series: series
      .filter((s) => s.crop === r.crop && s.n >= 3)
      .map((s) => ({ day: s.day, median: num(s.med), markets: s.n })),
  }));
}

export interface MarketPrice {
  day: string;
  state: string;
  district: string;
  market: string;
  variety: string;
  grade: string;
  min: number;
  max: number;
  modal: number;
}

/** Each market's latest report for one crop (last 4 days), asked state first, then dearest first. */
export async function cropMarkets(crop: string, state: string | null): Promise<MarketPrice[]> {
  const rows = await q<MarketPrice>(
    `SELECT * FROM (
       SELECT DISTINCT ON (state, market, variety, grade) day::text AS day, state, district, market,
         variety, grade, min_kg::float8 AS min, max_kg::float8 AS max, modal_kg::float8 AS modal
       FROM mandi_prices WHERE crop = $1 AND day >= current_date - 4
       ORDER BY state, market, variety, grade, day DESC) t
     ORDER BY (state = $2) DESC, modal DESC LIMIT 400`,
    [crop, state ?? ""],
  );
  return rows;
}

export async function lastRefresh() {
  return q1<{ finished_at: string | null; ok: boolean }>(
    `SELECT finished_at, ok FROM mandi_refresh WHERE id = 1`,
  ).catch(() => null);
}
