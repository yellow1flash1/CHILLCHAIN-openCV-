// Server-only. Neon serverless Postgres over HTTP (works on Cloudflare Workers and Node).
import { neon } from "@neondatabase/serverless";

let client: ReturnType<typeof neon> | null = null;

function sql() {
  if (client) return client;
  const url = process.env["DATABASE_URL"];
  if (!url) throw new Error("DATABASE_URL is not set");
  client = neon(url);
  return client;
}

// JSON-safe row type, so server functions can return rows to the browser without type errors.
export type Json = string | number | boolean | null | Json[] | { [k: string]: Json };
export type Row = { [k: string]: Json };

/** Run a parameterised query. Rows are JSON-normalised so timestamps arrive in the browser as ISO strings. */
export async function q<T = Row>(text: string, params: unknown[] = []): Promise<T[]> {
  const rows = await sql().query(text, params);
  return JSON.parse(JSON.stringify(rows)) as T[];
}

export async function q1<T = Row>(text: string, params: unknown[] = []): Promise<T | null> {
  return (await q<T>(text, params))[0] ?? null;
}

// Columns are listed explicitly so `numeric` values come back as numbers (pg returns numeric as a string).
export const LOT_COLS = `id, lot_code, farmer_id, farmer_name, farmer_district, crop, kg, grade, price_per_kg::float8 AS price_per_kg, base_price::float8 AS base_price, sell_by, scan_id, preorder_id, gross, cold_deduction, transport_deduction, net_amount, status, buyer_id, buyer_name, utr, created_at, ordered_at, settled_at, accepted_kg, rejected_kg, reject_reason, (SELECT s.grade_source FROM scans s WHERE s.id = lots.scan_id) AS grade_source`;
export const BOOKING_COLS = `id, farmer_id, cold_room_id, pass_no, crop, crates, days, hours, ends_at, amount, pay_mode, paid, bay, utr, pay_method, created_at`;
export const SCAN_COLS = `id, farmer_id, batch_code, crop, grade, confidence, uniformity, spoilage, shelf_no, shelf_cold, notes, photo_key, ripeness, harvested_at, sell_by, cold_chain, route, grade_source, ai_grade, ai_notes, ambient_c::float8 AS ambient_c, created_at`;
export const PROFILE_COLS = `id, full_name, phone, state, district, village, org_name, upi_id, id_type, id_number, fpo_id, buyer_type, created_at, updated_at`;
export const TRANSPORT_COLS = `id, trip_code, farmer_id, lot_id, from_district, to_label, to_room_id, to_district, distance_km, vehicle_key, kg, crop, reefer, pickup_date::text AS pickup_date, amount, status, driver_name, driver_phone, vehicle_no, notes, shared, pool_code, deliver_by, created_at`;
export const PREORDER_COLS = `id, code, buyer_id, buyer_name, buyer_type, crop, min_grade, kg, kg_remaining, price_per_kg::float8 AS price_per_kg, need_by::text AS need_by, deliver_district, notes, status, farmer_id, lot_id, created_at, matched_at`;
