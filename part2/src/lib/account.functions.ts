// Settings, privacy (download / delete my data), KrishiSaakh disputes, and the admin console.
import { createServerFn } from "@tanstack/react-start";
import { clerkClient } from "@clerk/tanstack-react-start/server";
import { z } from "zod";
import {
  q,
  q1,
  BOOKING_COLS,
  LOT_COLS,
  SCAN_COLS,
  TRANSPORT_COLS,
  PROFILE_COLS,
} from "./db.server";
import { requireUserId, emailOf } from "./session.server";

const uuid = z.string().uuid();
const hhmm = z.string().regex(/^([01]\d|2[0-3]):[0-5]\d$/);

// ---------- settings ----------
export const settingsSchema = z
  .object({
    notify: z
      .object({
        email: z.boolean(),
        sound: z.boolean(),
        topics: z.object({
          bookings: z.boolean(),
          trips: z.boolean(),
          payments: z.boolean(),
          ratings: z.boolean(),
          prices: z.boolean(),
        }),
        quiet: z.boolean(),
        quietFrom: hhmm,
        quietTo: hhmm,
      })
      .partial(),
    upiBackup: z.string().trim().max(60),
    location: z.boolean(),
    crops: z.array(z.string().max(20)).max(30),
    priceAlerts: z
      .array(
        z.object({
          crop: z.string().max(20),
          dir: z.enum(["above", "below"]),
          price: z.number().positive().max(100000),
        }),
      )
      .max(20),
    buyCrops: z.array(z.string().max(20)).max(30),
    buyDistricts: z.array(z.string().max(60)).max(30),
    gst: z
      .string()
      .trim()
      .toUpperCase()
      .regex(/^$|^\d{2}[A-Z]{5}\d{4}[A-Z][1-9A-Z]Z[0-9A-Z]$/, "Enter a valid 15-character GSTIN"),
    addresses: z.array(z.string().trim().min(5).max(200)).max(10),
    days: z.array(z.enum(["mon", "tue", "wed", "thu", "fri", "sat", "sun"])).max(7),
    routes: z.string().trim().max(200),
  })
  .partial();
export type Settings = z.infer<typeof settingsSchema>;

export const getSettings = createServerFn({ method: "GET" }).handler(async () => {
  const uid = await requireUserId();
  const r = await q1<{ settings: Settings; available: boolean | null; palledari: number | null }>(
    `SELECT p.settings,
            (SELECT t.available FROM transporters t WHERE t.user_id = p.id) AS available,
            (SELECT c.palledari_per_crate FROM cold_rooms c WHERE c.owner_id = p.id) AS palledari
     FROM profiles p WHERE p.id = $1`,
    [uid],
  );
  return {
    settings: r?.settings ?? {},
    available: r?.available ?? null,
    palledari: r?.palledari ?? null,
  };
});

/** Merges the given keys into the saved settings (other keys are kept). */
export const saveSettings = createServerFn({ method: "POST" })
  .validator((d: unknown) => settingsSchema.parse(d))
  .handler(async ({ data }) => {
    const uid = await requireUserId();
    await q(
      `UPDATE profiles SET settings = settings || $2::jsonb, updated_at = now() WHERE id = $1`,
      [uid, JSON.stringify(data)],
    );
    return { ok: true };
  });

export const setAvailability = createServerFn({ method: "POST" })
  .validator((d: unknown) => z.object({ available: z.boolean() }).parse(d))
  .handler(async ({ data }) => {
    const uid = await requireUserId();
    const r = await q(`UPDATE transporters SET available = $2 WHERE user_id = $1 RETURNING id`, [
      uid,
      data.available,
    ]);
    if (!r.length) throw new Error("Register your vehicle first");
    return { ok: true };
  });

export const setPalledari = createServerFn({ method: "POST" })
  .validator((d: unknown) =>
    z.object({ rate: z.number().int().min(0).max(500).nullable() }).parse(d),
  )
  .handler(async ({ data }) => {
    const uid = await requireUserId();
    const r = await q(
      `UPDATE cold_rooms SET palledari_per_crate = $2, updated_at = now() WHERE owner_id = $1 RETURNING id`,
      [uid, data.rate],
    );
    if (!r.length) throw new Error("Register your cold room first");
    return { ok: true };
  });

/** Signs the user out on every phone and computer. */
export const signOutEverywhere = createServerFn({ method: "POST" }).handler(async () => {
  const uid = await requireUserId();
  const c = await clerkClient();
  const list = await c.sessions.getSessionList({ userId: uid, status: "active" });
  await Promise.all(list.data.map((s) => c.sessions.revokeSession(s.id)));
  return { revoked: list.data.length };
});

// ---------- privacy ----------
/** Everything ChillChain stores about the caller, as one JSON document. */
export const getMyData = createServerFn({ method: "GET" }).handler(async () => {
  const uid = await requireUserId();
  const [
    profile,
    role,
    scans,
    bookings,
    lots,
    trips,
    vehicle,
    room,
    ratingsGiven,
    ratingsReceived,
  ] = await Promise.all([
    q1(`SELECT ${PROFILE_COLS}, farm, settings, consent_at FROM profiles WHERE id = $1`, [uid]),
    q1(`SELECT role FROM user_roles WHERE user_id = $1`, [uid]),
    q(`SELECT ${SCAN_COLS} FROM scans WHERE farmer_id = $1 ORDER BY created_at`, [uid]),
    q(`SELECT ${BOOKING_COLS} FROM bookings WHERE farmer_id = $1 ORDER BY created_at`, [uid]),
    q(`SELECT ${LOT_COLS} FROM lots WHERE farmer_id = $1 OR buyer_id = $1 ORDER BY created_at`, [
      uid,
    ]),
    q(
      `SELECT ${TRANSPORT_COLS} FROM transport_bookings WHERE farmer_id = $1 OR transporter_id IN (SELECT id FROM transporters WHERE user_id = $1) ORDER BY created_at`,
      [uid],
    ),
    q1(
      `SELECT name, phone, vehicle_key, vehicle_no, base_district, radius_km, capacity_kg, has_reefer, verified, aadhaar_last4 FROM transporters WHERE user_id = $1`,
      [uid],
    ),
    q1(
      `SELECT name, address, district, state, rate_per_crate_day, total_slots, palledari_per_crate, verified FROM cold_rooms WHERE owner_id = $1`,
      [uid],
    ),
    q(
      `SELECT flow, tx_id, score::float8 AS score, created_at FROM ks_ratings WHERE rater_id = $1`,
      [uid],
    ),
    q(
      `SELECT flow, tx_id, score::float8 AS score, created_at FROM ks_ratings WHERE ratee_id = $1 AND reveal_at <= now()`,
      [uid],
    ),
  ]);
  return {
    exportedAt: new Date().toISOString(),
    profile,
    role,
    scans,
    bookings,
    lots,
    trips,
    vehicle,
    coldRoom: room,
    ratingsGiven,
    ratingsReceived,
  };
});

/** Deletes the login and wipes personal details. Transaction records stay (anonymised) for the other parties' books. */
export const deleteMyAccount = createServerFn({ method: "POST" })
  .validator((d: unknown) => z.object({ confirm: z.literal("DELETE") }).parse(d))
  .handler(async () => {
    const uid = await requireUserId();
    await q(
      `UPDATE profiles SET full_name = 'Deleted user', phone = NULL, village = NULL, org_name = NULL, upi_id = NULL, id_type = NULL, id_number = NULL,
               farm = NULL, settings = '{}'::jsonb, deleted_at = now(), updated_at = now() WHERE id = $1`,
      [uid],
    );
    await q(
      `UPDATE transporters SET name = 'Deleted user', phone = '0000000000', rc_number = NULL, licence_number = NULL, insurance_number = NULL,
               fitness_number = NULL, aadhaar_last4 = NULL, available = false WHERE user_id = $1`,
      [uid],
    );
    await q(`UPDATE cold_rooms SET accepting_bookings = false, phone = NULL WHERE owner_id = $1`, [
      uid,
    ]);
    const c = await clerkClient();
    await c.users.deleteUser(uid);
    return { ok: true };
  });

// ---------- KrishiSaakh: reviews received and disputes ----------
export const getMyReviews = createServerFn({ method: "GET" }).handler(async () => {
  const uid = await requireUserId();
  return q<{
    id: string;
    flow: number;
    score: number;
    system_score: number;
    peer_score: number;
    components: Record<string, number>;
    created_at: string;
    excluded: boolean;
    dispute: string | null;
  }>(
    `SELECT r.id, r.flow, r.score::float8 AS score, r.system_score::float8 AS system_score, r.peer_score::float8 AS peer_score, r.components, r.created_at, r.excluded,
            (SELECT d.status FROM ks_disputes d WHERE d.rating_id = r.id AND d.user_id = $1) AS dispute
     FROM ks_ratings r WHERE r.ratee_id = $1 AND r.reveal_at <= now() ORDER BY r.created_at DESC LIMIT 50`,
    [uid],
  );
});

export const raiseDispute = createServerFn({ method: "POST" })
  .validator((d: unknown) =>
    z.object({ ratingId: uuid, reason: z.string().trim().min(5).max(500) }).parse(d),
  )
  .handler(async ({ data }) => {
    const uid = await requireUserId();
    const own = await q1(
      `SELECT 1 AS ok FROM ks_ratings WHERE id = $1 AND ratee_id = $2 AND reveal_at <= now()`,
      [data.ratingId, uid],
    );
    if (!own) throw new Error("You can only dispute ratings you received");
    await q(
      `INSERT INTO ks_disputes (rating_id, user_id, reason) VALUES ($1, $2, $3) ON CONFLICT (rating_id, user_id) DO NOTHING`,
      [data.ratingId, uid, data.reason],
    );
    return { ok: true };
  });

// ---------- admin ----------
async function requireAdmin() {
  const uid = await requireUserId();
  const allowed = (process.env["ADMIN_EMAILS"] ?? "")
    .split(",")
    .map((x) => x.trim().toLowerCase())
    .filter(Boolean);
  const email = (await emailOf(uid))?.toLowerCase();
  if (!email || !allowed.includes(email)) throw new Error("Admins only");
  return uid;
}

export const isAdmin = createServerFn({ method: "GET" }).handler(async () => {
  try {
    await requireAdmin();
    return true;
  } catch {
    return false;
  }
});

export const getAdminData = createServerFn({ method: "GET" }).handler(async () => {
  await requireAdmin();
  const [counts, drivers, rooms, disputes] = await Promise.all([
    q1<Record<string, number>>(`SELECT
        (SELECT count(*) FROM user_roles WHERE role = 'farmer')::int AS farmers,
        (SELECT count(*) FROM user_roles WHERE role = 'transporter')::int AS transporters,
        (SELECT count(*) FROM user_roles WHERE role = 'buyer')::int AS buyers,
        (SELECT count(*) FROM user_roles WHERE role = 'owner')::int AS owners,
        (SELECT count(*) FROM bookings)::int AS bookings,
        (SELECT count(*) FROM lots)::int AS lots,
        (SELECT count(*) FROM transport_bookings)::int AS trips,
        (SELECT count(*) FROM ks_ratings)::int AS ratings`),
    q(`SELECT id, name, phone, vehicle_key, vehicle_no, rc_number, licence_number, insurance_number, fitness_number, aadhaar_last4, base_district,
              capacity_kg, verified, docs_submitted_at, created_at
       FROM transporters WHERE user_id IS NOT NULL ORDER BY verified, docs_submitted_at DESC NULLS LAST LIMIT 100`),
    q(`SELECT id, name, address, district, state, phone, rate_per_crate_day, total_slots, verified, owner_id IS NOT NULL AS has_owner, updated_at
       FROM cold_rooms ORDER BY verified, updated_at DESC LIMIT 100`),
    q(`SELECT d.id, d.reason, d.status, d.created_at, r.flow, r.score::float8 AS score, r.components, p.full_name AS by_name
       FROM ks_disputes d JOIN ks_ratings r ON r.id = d.rating_id LEFT JOIN profiles p ON p.id = d.user_id
       ORDER BY d.status = 'open' DESC, d.created_at DESC LIMIT 100`),
  ]);
  return { counts, drivers, rooms, disputes };
});

export const adminVerify = createServerFn({ method: "POST" })
  .validator((d: unknown) =>
    z.object({ kind: z.enum(["transporter", "room"]), id: uuid, verified: z.boolean() }).parse(d),
  )
  .handler(async ({ data }) => {
    await requireAdmin();
    await q(
      data.kind === "transporter"
        ? `UPDATE transporters SET verified = $2 WHERE id = $1`
        : `UPDATE cold_rooms SET verified = $2, updated_at = now() WHERE id = $1`,
      [data.id, data.verified],
    );
    return { ok: true };
  });

export const adminResolveDispute = createServerFn({ method: "POST" })
  .validator((d: unknown) => z.object({ id: uuid, uphold: z.boolean() }).parse(d))
  .handler(async ({ data }) => {
    await requireAdmin();
    const d = await q1<{ rating_id: string }>(
      `UPDATE ks_disputes SET status = $2, resolved_at = now() WHERE id = $1 AND status = 'open' RETURNING rating_id`,
      [data.id, data.uphold ? "upheld" : "dismissed"],
    );
    if (!d) throw new Error("Already resolved");
    if (data.uphold) await q(`UPDATE ks_ratings SET excluded = true WHERE id = $1`, [d.rating_id]);
    return { ok: true };
  });
