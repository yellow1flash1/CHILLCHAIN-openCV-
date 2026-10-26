// Server-only: today's weather for a district from Open-Meteo (free, no API key). Cached for 30 minutes
// per location, and it gives up after 4 seconds so a slow weather service never blocks a scan.
import { q1 } from "./db.server";
import type { Forecast } from "./weather";

const TTL = 30 * 60_000;
const cache = new Map<string, { at: number; f: Forecast }>();

interface OpenMeteo {
  current?: { time: string; temperature_2m: number };
  hourly?: { time: string[]; temperature_2m: number[] };
  daily?: {
    temperature_2m_max: number[];
    temperature_2m_min: number[];
    precipitation_sum: number[];
    precipitation_probability_max: (number | null)[];
  };
}

export async function forecastAt(lat: number, lng: number): Promise<Forecast | null> {
  const key = `${lat.toFixed(2)},${lng.toFixed(2)}`;
  const hit = cache.get(key);
  if (hit && Date.now() - hit.at < TTL) return hit.f;
  try {
    const url =
      `https://api.open-meteo.com/v1/forecast?latitude=${lat}&longitude=${lng}` +
      `&current=temperature_2m&hourly=temperature_2m` +
      `&daily=temperature_2m_max,temperature_2m_min,precipitation_sum,precipitation_probability_max` +
      `&timezone=Asia%2FKolkata&forecast_days=2`;
    const res = await fetch(url, { signal: AbortSignal.timeout(4000) });
    if (!res.ok) return null;
    const j = (await res.json()) as OpenMeteo;
    const now = j.current?.temperature_2m;
    const temps = j.hourly?.temperature_2m ?? [];
    const times = j.hourly?.time ?? [];
    const d = j.daily;
    if (now == null || !d || !temps.length) return null;
    // the next 24 hourly readings from the current hour
    const start = Math.max(
      0,
      times.findIndex((t) => t >= (j.current?.time ?? "").slice(0, 13)),
    );
    const next = temps.slice(start, start + 24);
    const f: Forecast = {
      now,
      avg24: Math.round((next.reduce((a, b) => a + b, 0) / next.length) * 10) / 10,
      max: d.temperature_2m_max[0] ?? now,
      min: d.temperature_2m_min[0] ?? now,
      rainMm: d.precipitation_sum[0] ?? 0,
      rainProb: d.precipitation_probability_max[0] ?? 0,
    };
    cache.set(key, { at: Date.now(), f });
    return f;
  } catch (e) {
    console.error("weather fetch failed", e);
    return null;
  }
}

/** Forecast for a district in the districts table (null if unknown or the service is down). */
export async function forecastForDistrict(district: string | null | undefined) {
  if (!district) return null;
  const d = await q1<{ lat: number; lng: number }>(
    `SELECT lat, lng FROM districts WHERE name = $1`,
    [district],
  );
  return d ? forecastAt(d.lat, d.lng) : null;
}
