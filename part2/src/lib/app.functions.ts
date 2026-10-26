// Every database action the browser can trigger. The caller's id always comes from Clerk (requireUserId),
// and all prices, totals, slot checks and handover-code checks happen inside the SQL functions in neon/schema.sql.
import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import {
  q,
  q1,
  LOT_COLS,
  BOOKING_COLS,
  SCAN_COLS,
  PROFILE_COLS,
  TRANSPORT_COLS,
  PREORDER_COLS,
} from "./db.server";
import { requireUserId, emailFor } from "./session.server";
import { sendEmail } from "./email.server";
import { presignGet, presignPut } from "./r2.server";
import { FLOWS, FLOW_IDS, emaFold, txScore, type FlowId, type FlowRep } from "./krishisaakh";
import { CROPS, cropBy } from "./crops";
import { routeFor, sellByFrom, sellWindowHours, type Grade, type Ripeness } from "./shelf";
import { AIUnavailable, geminiJSON } from "./ai.server";
import { langInfo } from "./i18n";
import { AI_MIN_CONFIDENCE, GRADE_SCHEMA, gradingPrompt, type AIGrade } from "./grading";
import { forecastForDistrict } from "./weather.server";
import {
  VisionUnavailable,
  opencvGrade,
  visionEnabled,
  visionRecord,
  visionView,
  type VisionResponse,
  type VisionView,
} from "./vision.server";
import { createBookingFor, placeOrderFor, refundLot } from "./orders.server";

const uuid = z.string().uuid();
const cropKey = z
  .string()
  .trim()
  .refine((k) => CROPS.some((c) => c.key === k), "Unknown crop");
const inr = (n: number) => `₹${n.toLocaleString("en-IN")}`;

// ---------- profile ----------
export const getMe = createServerFn({ method: "GET" }).handler(async () => {
  const uid = await requireUserId();
  await q(`INSERT INTO profiles (id) VALUES ($1) ON CONFLICT (id) DO NOTHING`, [uid]);
  const profile = await q1(`SELECT ${PROFILE_COLS} FROM profiles WHERE id = $1`, [uid]);
  const role = await q1<{ role: "farmer" | "buyer" | "owner" | "transporter" }>(
    `SELECT role FROM user_roles WHERE user_id = $1 LIMIT 1`,
    [uid],
  );
  return { profile, role: role?.role ?? null };
});

const profileInput = z.object({
  role: z.enum(["farmer", "buyer", "owner", "transporter"]).optional(),
  full_name: z.string().trim().max(80).optional(),
  phone: z.string().trim().max(15).nullable().optional(),
  state: z.string().trim().max(40).nullable().optional(),
  district: z.string().trim().max(60).nullable().optional(),
  village: z.string().trim().max(80).nullable().optional(),
  org_name: z.string().trim().max(100).nullable().optional(),
  upi_id: z.string().trim().max(60).nullable().optional(),
  id_type: z.string().trim().max(20).nullable().optional(),
  id_number: z.string().trim().max(30).nullable().optional(),
  buyer_type: z
    .enum(["quick_commerce", "retail", "horeca", "exporter", "processor", "florist", "other"])
    .nullable()
    .optional(),
  consent: z.literal(true).optional(), // accepted the privacy policy
});
export const saveProfile = createServerFn({ method: "POST" })
  .validator((d: unknown) => profileInput.parse(d))
  .handler(async ({ data }) => {
    const uid = await requireUserId();
    const { role, consent, ...rest } = data;
    if (consent)
      await q(`UPDATE profiles SET consent_at = COALESCE(consent_at, now()) WHERE id = $1`, [uid]);
    await q(`INSERT INTO profiles (id) VALUES ($1) ON CONFLICT (id) DO NOTHING`, [uid]);
    if (role) await q(`SELECT claim_role($1, $2::app_role)`, [uid, role]);
    const cols = (Object.keys(rest) as (keyof typeof rest)[]).filter((c) => rest[c] !== undefined);
    if (cols.length) {
      const sets = cols.map((c, i) => `${c} = $${i + 2}`).join(", ");
      await q(`UPDATE profiles SET ${sets}, updated_at = now() WHERE id = $1`, [
        uid,
        ...cols.map((c) => rest[c]),
      ]);
    }
    return { ok: true };
  });

// ---------- cold rooms (public) ----------
export const getColdRooms = createServerFn({ method: "GET" }).handler(async () => {
  const rooms = await q(
    `SELECT id, owner_id, name, name_hi, address, district, state, pin, lat, lng, rate_per_crate_day, rate_per_crate_hour, facility, total_slots, temp_c::float8 AS temp_c, humidity, badges, tags, phone, verified, accepting_bookings, palledari_per_crate FROM cold_rooms ORDER BY rate_per_crate_day`,
  );
  const free = await q<{ cold_room_id: string; free: number }>(
    `SELECT * FROM cold_room_free_slots()`,
  );
  return { rooms, free };
});

// ---------- scans ----------
export const getScans = createServerFn({ method: "GET" }).handler(async () => {
  const uid = await requireUserId();
  return q(
    `SELECT ${SCAN_COLS} FROM scans WHERE farmer_id = $1 ORDER BY created_at DESC LIMIT 20`,
    [uid],
  );
});

const scanInput = z.object({
  batch_code: z.string().max(40),
  crop: cropKey,
  // model = on-phone AI model, ai_vision = photo graded by Gemini on the server, self = the grower's own call
  source: z.enum(["model", "ai_vision", "self"]),
  grade: z.enum(["A", "B", "C"]).optional(),
  confidence: z.number().int().min(0).max(100).optional(),
  ripeness: z.number().int().min(1).max(5).optional(), // the grower's own pick; otherwise estimated
  harvested_at: z.string().datetime(),
  cold_chain: z.boolean(),
  image: z
    .string()
    .max(3_000_000)
    .regex(/^[A-Za-z0-9+/=]+$/)
    .optional(), // base64 JPEG for ai_vision
  photo_key: z.string().max(200).optional(),
  lang: z.string().max(5).optional(), // app language, for the AI's notes
});
const clamp = (n: number, lo: number, hi: number) => Math.min(hi, Math.max(lo, Math.round(n)));
const UNIFORMITY: Record<Grade, number> = { A: 91, B: 82, C: 70 };
const SPOILAGE: Record<Grade, string> = {
  A: "Low (<3%)",
  B: "Moderate (5–8%)",
  C: "High (>12%)",
};

/** Saves a graded scan, or asks for a better photo ({ retake }) without saving anything. */
export const createScan = createServerFn({ method: "POST" })
  .validator((d: unknown) => scanInput.parse(d))
  .handler(async ({ data: s }) => {
    const uid = await requireUserId();
    if (s.photo_key && !s.photo_key.startsWith(`scans/${uid}/`)) throw new Error("Invalid photo");
    const harvested = new Date(s.harvested_at);
    if (
      harvested.getTime() > Date.now() + 5 * 60_000 ||
      harvested.getTime() < Date.now() - 14 * DAY_MS
    )
      throw new Error("Harvest time must be within the last 14 days");
    const crop = cropBy(s.crop);

    let grade: Grade, confidence: number, uniformity: number, ripe: Ripeness;
    let aiGrade: Grade | null = null,
      aiNotes: string | null = null;
    let source: string = s.source;
    let vision: VisionResponse | null = null;
    if (s.source === "ai_vision" && !s.image) throw new Error("Add a photo first");
    // First choice: the OpenCV 5 grading agent on AWS. It decides the next step from what it sees.
    if (s.source === "ai_vision" && s.image && visionEnabled()) {
      try {
        vision = await opencvGrade(s.image, s.crop);
      } catch (e) {
        if (!(e instanceof VisionUnavailable)) throw e;
        console.warn("OpenCV vision unavailable, falling back to Gemini:", e.message);
      }
    }
    const view: VisionView | null = vision ? visionView(vision) : null;
    if (vision) {
      const a = vision.next_action;
      if (a.type === "retake")
        return a.code === "not_crop"
          ? { retake: "not_crop" as const, vision: view }
          : {
              retake: "vision" as const,
              code: a.code ?? "no_produce",
              vision: view,
            };
      if (a.type === "confirm" || !vision.result)
        // Unsure: nothing is saved; the grower confirms or changes the suggested grade (human in the loop).
        return {
          retake: "confirm" as const,
          suggested: a.suggested_grade ?? vision.result?.grade ?? null,
          vision: view,
        };
      const r = vision.result;
      source = "opencv";
      grade = r.grade;
      aiGrade = r.grade;
      confidence = clamp(r.confidence * 100, 0, 100);
      uniformity = clamp(r.uniformity, 0, 100);
      ripe = (s.ripeness ??
        (r.ripeness != null ? clamp(r.ripeness, 1, 5) : grade === "C" ? 4 : 3)) as Ripeness;
      aiNotes = [r.reason, ...r.defects].filter(Boolean).join(" · ").slice(0, 400);
    } else if (s.source === "ai_vision" && s.image) {
      // Fallback: Gemini Vision, graded here on the server, so the grade cannot be changed on the way.
      let r: AIGrade;
      try {
        r = await geminiJSON<AIGrade>(
          [
            { inlineData: { mimeType: "image/jpeg", data: s.image } },
            { text: gradingPrompt(crop, langInfo(s.lang ?? "en").name) },
          ],
          GRADE_SCHEMA,
        );
      } catch (e) {
        // Out of free AI quota or overloaded: nothing is saved, and the screen offers self-grading.
        if (e instanceof AIUnavailable)
          return {
            retake: e.kind === "limit" ? ("ai_limit" as const) : ("ai_busy" as const),
            retryAt: e.retryAt,
          };
        throw e;
      }
      if (!r.is_crop) return { retake: "not_crop" as const };
      if (!(r.confidence >= AI_MIN_CONFIDENCE)) return { retake: "unsure" as const };
      grade = r.grade;
      aiGrade = r.grade;
      confidence = clamp(r.confidence * 100, 0, 100);
      uniformity = clamp(r.uniformity, 0, 100);
      ripe = (s.ripeness ?? clamp(r.ripeness, 1, 5)) as Ripeness;
      aiNotes = [r.reason, ...r.defects].filter(Boolean).join(" · ").slice(0, 400);
    } else {
      if (!s.grade) throw new Error("Choose a grade");
      grade = s.grade;
      aiGrade = s.source === "model" ? s.grade : null;
      confidence = s.source === "model" ? (s.confidence ?? 0) : 0;
      uniformity = UNIFORMITY[grade];
      ripe = (s.ripeness ?? (grade === "C" ? 5 : grade === "B" ? 4 : 3)) as Ripeness;
    }

    // Open-air produce spoils faster in heat: the clock uses the next 24 hours' temperature in the
    // grower's district. If the weather service is down, the usual 25 °C clock is used.
    let ambient: number | null = null;
    if (!s.cold_chain) {
      const p = await q1<{ district: string | null }>(
        `SELECT district FROM profiles WHERE id = $1`,
        [uid],
      );
      ambient = (await forecastForDistrict(p?.district))?.avg24 ?? null;
    }
    // The sell-by clock is worked out here, not taken from the browser, because it sets the lot's price later.
    const windowH = sellWindowHours(crop, grade, ripe, s.cold_chain, ambient);
    const sellBy = sellByFrom(harvested, windowH);
    const scan = await q1(
      `INSERT INTO scans (farmer_id, batch_code, crop, grade, confidence, uniformity, spoilage, shelf_no, shelf_cold, photo_key,
                          ripeness, harvested_at, sell_by, cold_chain, route, grade_source, ai_grade, ai_notes, ambient_c, vision)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17,$18,$19,$20) RETURNING ${SCAN_COLS}`,
      [
        uid,
        s.batch_code,
        s.crop,
        grade,
        confidence,
        uniformity,
        SPOILAGE[grade],
        // shelf_no / shelf_cold keep the old columns filled: whole days without and with cold chain
        Math.min(100, Math.floor(sellWindowHours(crop, grade, ripe, false, ambient) / 24)),
        Math.min(100, Math.floor(sellWindowHours(crop, grade, ripe, true) / 24)),
        s.photo_key ?? null,
        ripe,
        harvested.toISOString(),
        sellBy.toISOString(),
        s.cold_chain,
        routeFor(crop, grade, ripe),
        source,
        aiGrade,
        aiNotes,
        ambient,
        vision ? JSON.stringify(visionRecord(vision)) : null,
      ],
    );
    if (!scan) throw new Error("Could not save the scan");
    return { scan, vision: view };
  });

/** The grower overrides the grade before listing. The AI's grade is kept, and the scan is marked self-graded
 *  so buyers can see who decided it. The sell-by clock and route are worked out again for the new grade. */
export const correctScanGrade = createServerFn({ method: "POST" })
  .validator((d: unknown) => z.object({ scanId: uuid, grade: z.enum(["A", "B", "C"]) }).parse(d))
  .handler(async ({ data }) => {
    const uid = await requireUserId();
    const sc = await q1<{
      crop: string;
      ripeness: number | null;
      cold_chain: boolean;
      ambient_c: number | null;
      harvested_at: string | null;
      created_at: string;
      listed: boolean;
    }>(
      `SELECT crop, ripeness, cold_chain, ambient_c::float8 AS ambient_c, harvested_at, created_at,
              EXISTS (SELECT 1 FROM lots l WHERE l.scan_id = scans.id) AS listed
       FROM scans WHERE id = $1 AND farmer_id = $2`,
      [data.scanId, uid],
    );
    if (!sc) throw new Error("Scan not found");
    if (sc.listed) throw new Error("This scan is already listed, so its grade can't change.");
    const crop = cropBy(sc.crop),
      grade = data.grade as Grade,
      ripe = (sc.ripeness ?? 3) as Ripeness;
    const sellBy = sellByFrom(
      new Date(sc.harvested_at ?? sc.created_at),
      sellWindowHours(crop, grade, ripe, sc.cold_chain, sc.ambient_c),
    );
    return q1(
      `UPDATE scans SET grade = $3, grade_source = 'self', sell_by = $4, route = $5, uniformity = $6, spoilage = $7
       WHERE id = $1 AND farmer_id = $2 RETURNING ${SCAN_COLS}`,
      [
        data.scanId,
        uid,
        grade,
        sellBy.toISOString(),
        routeFor(crop, grade, ripe),
        UNIFORMITY[grade],
        SPOILAGE[grade],
      ],
    );
  });

/** Today's weather in the caller's district (null forecast if unknown or the service is down). */
export const getWeather = createServerFn({ method: "GET" }).handler(async () => {
  const uid = await requireUserId();
  const p = await q1<{ district: string | null }>(`SELECT district FROM profiles WHERE id = $1`, [
    uid,
  ]);
  return {
    district: p?.district ?? null,
    forecast: await forecastForDistrict(p?.district),
  };
});

// ---------- R2 photo upload ----------
export const getScanUploadUrl = createServerFn({ method: "POST" })
  .validator((d: unknown) =>
    z
      .object({
        contentType: z.enum(["image/jpeg", "image/png", "image/webp"]),
      })
      .parse(d),
  )
  .handler(async ({ data }) => {
    const uid = await requireUserId();
    const ext =
      data.contentType === "image/png" ? "png" : data.contentType === "image/webp" ? "webp" : "jpg";
    const key = `scans/${uid}/${crypto.randomUUID()}.${ext}`;
    return { key, url: await presignPut(key, data.contentType) };
  });

export const getScanPhotoUrl = createServerFn({ method: "POST" })
  .validator((d: unknown) => z.object({ key: z.string().max(200) }).parse(d))
  .handler(async ({ data }) => {
    const uid = await requireUserId();
    if (!data.key.startsWith(`scans/${uid}/`)) throw new Error("Not your photo");
    return { url: await presignGet(data.key) };
  });

// ---------- bookings ----------
export const getBookings = createServerFn({ method: "GET" }).handler(async () => {
  const uid = await requireUserId();
  return q(`SELECT ${BOOKING_COLS} FROM bookings WHERE farmer_id = $1 ORDER BY created_at DESC`, [
    uid,
  ]);
});

const bookingInput = z.object({
  coldRoomId: uuid,
  crop: cropKey,
  crates: z.number().int().min(1).max(500),
  days: z.number().int().min(1).max(60).optional(),
  hours: z.number().int().min(1).max(72).optional(),
  payMode: z.enum(["upi", "credit"]),
  utr: z.string().max(40).optional(),
  payMethod: z.string().max(40).optional(),
});
export const createBooking = createServerFn({ method: "POST" })
  .validator((d: unknown) => bookingInput.parse(d))
  .handler(async ({ data: b }) => createBookingFor(await requireUserId(), b));

export const payBookingDues = createServerFn({ method: "POST" })
  .validator((d: unknown) =>
    z
      .object({
        ids: z.array(uuid).max(100),
        utr: z.string().max(40),
        method: z.string().max(40),
      })
      .parse(d),
  )
  .handler(async ({ data }) => {
    const uid = await requireUserId();
    const r = await q1<{ pay_booking_dues: number }>(
      `SELECT pay_booking_dues($1, $2::uuid[], $3, $4)`,
      [uid, data.ids, data.utr, data.method],
    );
    return r?.pay_booking_dues ?? 0;
  });

// ---------- lots / escrow (Razorpay test mode when keys are set, see pay.functions.ts) ----------
export const getLots = createServerFn({ method: "GET" }).handler(async () => {
  const uid = await requireUserId();
  return q(
    `SELECT ${LOT_COLS} FROM lots
     WHERE farmer_id = $1 OR (has_role($1, 'buyer') AND (status = 'open' OR buyer_id = $1))
     ORDER BY created_at DESC`,
    [uid],
  );
});

const lotInput = z.object({
  crop: cropKey,
  kg: z.number().int().min(1).max(100000),
  grade: z.enum(["A", "B", "C"]),
  price: z.number().positive().max(5000),
  cold: z.number().int().min(0),
  transport: z.number().int().min(0),
  scanId: uuid.optional(),
});
export const createLot = createServerFn({ method: "POST" })
  .validator((d: unknown) => lotInput.parse(d))
  .handler(async ({ data: l }) => {
    const uid = await requireUserId();
    // From a scan, the database copies the scan's sell-by time. Without one, assume a ripe lot
    // harvested now and kept at room temperature.
    const sellBy = l.scanId
      ? null
      : sellByFrom(new Date(), sellWindowHours(cropBy(l.crop), l.grade, 3, false)).toISOString();
    await q(`SELECT create_lot($1, $2, $3, $4, $5, $6, $7, $8::uuid, $9::timestamptz)`, [
      uid,
      l.crop,
      l.kg,
      l.grade,
      l.price,
      l.cold,
      l.transport,
      l.scanId ?? null,
      sellBy,
    ]);
    return { ok: true };
  });

export const cancelLot = createServerFn({ method: "POST" })
  .validator((d: unknown) => z.object({ lotId: uuid }).parse(d))
  .handler(async ({ data }) => {
    const uid = await requireUserId();
    await q(`SELECT cancel_lot($1, $2)`, [uid, data.lotId]);
    return { ok: true };
  });

export const placeOrder = createServerFn({ method: "POST" })
  .validator((d: unknown) => z.object({ lotId: uuid }).parse(d))
  .handler(async ({ data }) => {
    await placeOrderFor(await requireUserId(), data.lotId);
    return { ok: true };
  });

export const confirmDelivery = createServerFn({ method: "POST" })
  .validator((d: unknown) =>
    z
      .object({
        lotId: uuid,
        code: z.string().trim().max(12),
        acceptedKg: z.number().int().min(0).max(100000).optional(), // missing = the whole lot
        reason: z.string().trim().max(200).optional(), // why part was rejected
      })
      .parse(d),
  )
  .handler(async ({ data }) => {
    const uid = await requireUserId();
    const r = await q1<{
      confirm_delivery: {
        status: "ok" | "wrong_code" | "locked";
        utr?: string;
        attempts_left?: number;
        accepted_kg?: number;
        rejected_kg?: number;
        released?: number;
        refund?: number;
      };
    }>(`SELECT confirm_delivery($1, $2, $3, $4::int, $5)`, [
      uid,
      data.lotId,
      data.code,
      data.acceptedKg ?? null,
      data.reason ?? null,
    ]);
    const res = r!.confirm_delivery;
    if (res.status === "ok" && res.refund) await refundLot(data.lotId, res.refund);
    if (res.status === "ok") {
      const lot = await q1<{
        farmer_id: string;
        lot_code: string;
        reject_reason: string | null;
      }>(`SELECT farmer_id, lot_code, reject_reason FROM lots WHERE id = $1`, [data.lotId]);
      if (lot)
        await sendEmail(
          await emailFor(lot.farmer_id, "payments"),
          res.accepted_kg ? `Payment released for ${lot.lot_code}` : `Lot ${lot.lot_code} rejected`,
          [
            `Delivery confirmed: ${res.accepted_kg} kg accepted, ${inr(res.released ?? 0)} released (reference ${res.utr}).`,
            ...(res.rejected_kg
              ? [
                  `${res.rejected_kg} kg was rejected: "${lot.reject_reason ?? ""}". You can offer it to processors from the Money tab, or dispute it through ChillScore.`,
                ]
              : []),
          ],
        );
    }
    return res;
  });

export const getHandover = createServerFn({ method: "POST" })
  .validator((d: unknown) => z.object({ lotId: uuid }).parse(d))
  .handler(async ({ data }) => {
    const uid = await requireUserId();
    return q1<{ code: string; attempts: number }>(
      `SELECT code, attempts FROM lot_handover WHERE lot_id = $1 AND farmer_id = $2`,
      [data.lotId, uid],
    );
  });

export const regenerateHandover = createServerFn({ method: "POST" })
  .validator((d: unknown) => z.object({ lotId: uuid }).parse(d))
  .handler(async ({ data }) => {
    const uid = await requireUserId();
    const r = await q1<{ regenerate_handover_code: string }>(
      `SELECT regenerate_handover_code($1, $2)`,
      [uid, data.lotId],
    );
    return r!.regenerate_handover_code;
  });

// ---------- pre-orders (buyer demand before harvest) ----------
/** Buyer: their own pre-orders. Grower: open pre-orders plus the ones they took. */
export const getPreorders = createServerFn({ method: "GET" }).handler(async () => {
  const uid = await requireUserId();
  // my_kg = how much of this pre-order the caller (a grower) has taken
  return q(
    `SELECT * FROM (
       SELECT ${PREORDER_COLS},
              (SELECT COALESCE(SUM(l.kg), 0)::int FROM lots l
               WHERE l.preorder_id = preorders.id AND l.farmer_id = $1 AND l.status <> 'cancelled') AS my_kg
       FROM preorders
     ) p
     WHERE buyer_id = $1 OR my_kg > 0
        OR (has_role($1, 'farmer') AND status = 'open' AND kg_remaining > 0
            AND need_by >= (now() AT TIME ZONE 'Asia/Kolkata')::date)
     ORDER BY (status = 'open') DESC, need_by, created_at DESC LIMIT 100`,
    [uid],
  );
});

const preorderInput = z.object({
  crop: cropKey,
  grade: z.enum(["A", "B", "C"]),
  kg: z.number().int().min(1).max(100000),
  price: z.number().positive().max(5000),
  needBy: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  district: z.string().trim().min(2).max(60).optional(),
  notes: z.string().trim().max(200).optional(),
});
export const createPreorder = createServerFn({ method: "POST" })
  .validator((d: unknown) => preorderInput.parse(d))
  .handler(async ({ data: p }) => {
    const uid = await requireUserId();
    await q(`SELECT create_preorder($1, $2, $3, $4, $5, $6::date, $7, $8)`, [
      uid,
      p.crop,
      p.grade,
      p.kg,
      p.price,
      p.needBy,
      p.district ?? null,
      p.notes ?? null,
    ]);
    return { ok: true };
  });

export const cancelPreorder = createServerFn({ method: "POST" })
  .validator((d: unknown) => z.object({ id: uuid }).parse(d))
  .handler(async ({ data }) => {
    const uid = await requireUserId();
    await q(`SELECT cancel_preorder($1, $2)`, [uid, data.id]);
    return { ok: true };
  });

export const acceptPreorder = createServerFn({ method: "POST" })
  .validator((d: unknown) =>
    z.object({ id: uuid, kg: z.number().int().min(1).max(100000).optional() }).parse(d),
  )
  .handler(async ({ data }) => {
    const uid = await requireUserId();
    const lot = await q1<{
      buyer_id: string;
      lot_code: string;
      crop: string;
      kg: number;
      net_amount: number;
      farmer_name: string;
    }>(
      `SELECT buyer_id, lot_code, crop, kg, net_amount, farmer_name FROM accept_preorder($1, $2, $3::int)`,
      [uid, data.id, data.kg ?? null],
    );
    if (lot)
      await sendEmail(
        await emailFor(lot.buyer_id, "payments"),
        `Pre-order taken: ${lot.lot_code}`,
        [
          `${lot.farmer_name} will supply ${lot.kg} kg ${cropBy(lot.crop).en}.`,
          `${inr(lot.net_amount)} is held in escrow and released when you confirm delivery with the grower's code.`,
        ],
      );
    return { ok: true };
  });

// ---------- transport booking ----------
export const getTransportMeta = createServerFn({ method: "GET" }).handler(async () => {
  const vehicles = await q(
    `SELECT key, name, name_hi, capacity_kg, base_fare, per_km FROM vehicle_types ORDER BY sort`,
  );
  const districts = await q(`SELECT name, state FROM districts ORDER BY state, name`);
  return { vehicles, districts };
});

const legInput = z.object({
  from: z.string().trim().min(2).max(60),
  toRoomId: uuid.optional(),
  toDistrict: z.string().trim().min(2).max(60).optional(),
  vehicle: z.string().trim().min(2).max(20),
  kg: z.number().int().min(1).max(100000),
  reefer: z.boolean(),
  shared: z.boolean().optional(),
});
export const quoteTransport = createServerFn({ method: "POST" })
  .validator((d: unknown) => legInput.parse(d))
  .handler(async ({ data }) => {
    await requireUserId();
    return q1<{ distance_km: number; amount: number; to_label: string }>(
      `SELECT * FROM transport_quote($1::text, $2::uuid, $3::text, $4::text, $5::int, $6::boolean, $7::boolean)`,
      [
        data.from,
        data.toRoomId ?? null,
        data.toDistrict ?? null,
        data.vehicle,
        data.kg,
        data.reefer,
        data.shared ?? false,
      ],
    );
  });

export const getTransports = createServerFn({ method: "GET" }).handler(async () => {
  const uid = await requireUserId();
  return q(
    `SELECT ${TRANSPORT_COLS}, (SELECT t.user_id FROM transporters t WHERE t.id = transport_bookings.transporter_id) AS transporter_user_id
            FROM transport_bookings WHERE farmer_id = $1 ORDER BY created_at DESC LIMIT 50`,
    [uid],
  );
});

const transportInput = legInput.extend({
  lotId: uuid.optional(),
  crop: cropKey,
  pickupDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  notes: z.string().trim().max(200).optional(),
  deliverBy: z.string().datetime().optional(),
});
export const createTransport = createServerFn({ method: "POST" })
  .validator((d: unknown) => transportInput.parse(d))
  .handler(async ({ data: t }) => {
    const uid = await requireUserId();
    const made = await q1<{ id: string }>(
      `SELECT id FROM create_transport($1, $2::uuid, $3::text, $4::uuid, $5::text, $6::text, $7::int, $8::text, $9::boolean, $10::date, $11::text, $12::boolean, $13::timestamptz)`,
      [
        uid,
        t.lotId ?? null,
        t.from,
        t.toRoomId ?? null,
        t.toDistrict ?? null,
        t.vehicle,
        t.kg,
        t.crop,
        t.reefer,
        t.pickupDate,
        t.notes ?? null,
        t.shared ?? false,
        t.deliverBy ?? null,
      ],
    );
    if (!made) throw new Error("Booking failed");
    const row = await q1<{
      id: string;
      trip_code: string;
      status: string;
      from_district: string;
      to_label: string;
      pickup_date: string;
      amount: number;
      kg: number;
      crop: string;
      driver_name: string | null;
      driver_phone: string | null;
      vehicle_no: string | null;
      pool_code: string | null;
      deliver_by: string | null;
    }>(`SELECT ${TRANSPORT_COLS} FROM transport_bookings WHERE id = $1`, [made.id]);
    if (row) {
      const driver =
        row.status === "assigned"
          ? `Driver: ${row.driver_name} (${row.driver_phone}) · Vehicle: ${row.vehicle_no ?? "-"}`
          : "We are finding a driver for you. You will get another email when one is assigned.";
      await sendEmail(
        await emailFor(uid, "trips"),
        `Transport ${row.trip_code} ${row.status === "assigned" ? "confirmed" : "requested"}`,
        [
          `${row.kg} kg ${cropBy(row.crop).en}: ${row.from_district} to ${row.to_label}`,
          `Pickup date: ${row.pickup_date}`,
          ...(row.deliver_by
            ? [
                `Deliver by: ${new Date(row.deliver_by).toLocaleString("en-IN", { timeZone: "Asia/Kolkata" })}`,
              ]
            : []),
          ...(row.pool_code ? [`Shared truck ${row.pool_code}: you pay only for your share.`] : []),
          `Estimated fare: ${inr(row.amount)} (pay the driver after delivery)`,
          driver,
        ],
      );
      if (row.status === "requested")
        await sendEmail(process.env["OPS_EMAIL"] ?? null, `Driver needed: ${row.trip_code}`, [
          `${row.kg} kg ${cropBy(row.crop).en}, ${row.from_district} to ${row.to_label}, pickup ${row.pickup_date}, vehicle ${t.vehicle}.`,
        ]);
    }
    return q1(`SELECT ${TRANSPORT_COLS} FROM transport_bookings WHERE id = $1`, [made.id]);
  });

export const setTransportStatus = createServerFn({ method: "POST" })
  .validator((d: unknown) =>
    z
      .object({
        id: uuid,
        status: z.enum(["cancelled", "in_transit", "delivered"]),
      })
      .parse(d),
  )
  .handler(async ({ data }) => {
    const uid = await requireUserId();
    await q(`SELECT set_transport_status($1, $2::uuid, $3)`, [uid, data.id, data.status]);
    return { ok: true };
  });

// ---------- cold room owner ----------
const ROOM_COLS = `id, name, name_hi, address, district, state, pin, lat, lng, rate_per_crate_day, rate_per_crate_hour, facility, total_slots, temp_c::float8 AS temp_c, humidity, badges, tags, phone, owner_id, verified, accepting_bookings, updated_at`;
const OPEN = `b.released_at IS NULL AND b.ends_at > now()`;

export const getOwnerDashboard = createServerFn({ method: "GET" }).handler(async () => {
  const uid = await requireUserId();
  const room = await q1<{ id: string }>(`SELECT ${ROOM_COLS} FROM cold_rooms WHERE owner_id = $1`, [
    uid,
  ]);
  if (!room) return { room: null, stats: null, bookings: [], chart: [] };
  const stats = await q1(
    `SELECT c.total_slots,
       COALESCE(SUM(b.crates) FILTER (WHERE ${OPEN}), 0)::int AS used,
       (COUNT(*) FILTER (WHERE ${OPEN}))::int AS active_bookings,
       COALESCE(SUM(b.amount) FILTER (WHERE b.paid), 0)::int AS revenue_total,
       COALESCE(SUM(b.amount) FILTER (WHERE b.paid AND b.created_at >= date_trunc('month', now())), 0)::int AS revenue_month,
       COALESCE(SUM(b.amount) FILTER (WHERE NOT b.paid), 0)::int AS dues
     FROM cold_rooms c LEFT JOIN bookings b ON b.cold_room_id = c.id WHERE c.id = $1 GROUP BY c.id`,
    [room.id],
  );
  const bookings = await q(
    `SELECT b.id, b.farmer_id, b.pass_no, b.crop, b.crates, b.days, b.hours, b.amount, b.pay_mode, b.paid, b.bay, b.utr, b.pay_method, b.created_at,
            b.ends_at, b.checked_in_at, b.released_at,
            p.full_name AS farmer_name, p.phone AS farmer_phone, p.village AS farmer_village
     FROM bookings b LEFT JOIN profiles p ON p.id = b.farmer_id
     WHERE b.cold_room_id = $1 ORDER BY b.created_at DESC LIMIT 150`,
    [room.id],
  );
  const chart = await q(
    `SELECT to_char(d, 'DD Mon') AS label, COALESCE(SUM(b.crates), 0)::int AS crates
     FROM generate_series((now() AT TIME ZONE 'Asia/Kolkata')::date - 6, (now() AT TIME ZONE 'Asia/Kolkata')::date, interval '1 day') d
     LEFT JOIN bookings b ON b.cold_room_id = $1 AND (b.created_at AT TIME ZONE 'Asia/Kolkata')::date = d::date
     GROUP BY d ORDER BY d`,
    [room.id],
  );
  return { room, stats, bookings, chart };
});

const BADGE_TAGS: Record<string, string | null> = {
  Solar: "solar",
  "24/7": "247",
  Bulk: "bulk",
  "Back-up Power": null,
  "Loading Dock": null,
  Community: null,
  "Pre-cooling": "precool",
  "Ethylene ripening": "ripening",
  "Export pack-house": null,
  Flowers: null,
};
const BADGES = [
  "Solar",
  "24/7",
  "Back-up Power",
  "Loading Dock",
  "Bulk",
  "Community",
  "Pre-cooling",
  "Ethylene ripening",
  "Export pack-house",
  "Flowers",
] as const;
const roomFields = {
  rate: z.number().int().min(1).max(500),
  slots: z.number().int().min(1).max(5000),
  temp: z.number().min(-5).max(25),
  humidity: z.number().int().min(30).max(100),
  phone: z.string().regex(/^[6-9]\d{9}$/),
};
export const registerRoom = createServerFn({ method: "POST" })
  .validator((d: unknown) =>
    z
      .object({
        ...roomFields,
        name: z.string().trim().min(3).max(80),
        address: z.string().trim().min(5).max(160),
        district: z.string().trim().min(2).max(60),
        state: z.string().trim().min(2).max(40),
        pin: z
          .string()
          .regex(/^\d{6}$/)
          .optional(),
        lat: z.number().min(6).max(38).optional(),
        lng: z.number().min(68).max(98).optional(),
        badges: z.array(z.enum(BADGES)).max(10),
        facility: z.enum(["cold_room", "precool", "ripening"]),
        rateHour: z.number().int().min(1).max(100).optional(),
      })
      .parse(d),
  )
  .handler(async ({ data: r }) => {
    const uid = await requireUserId();
    const tags = r.badges.map((b) => BADGE_TAGS[b]).filter((x): x is string => !!x);
    await q(
      `SELECT owner_register_room($1, $2, $3, $4, $5, $6::text, $7::float8, $8::float8, $9::int, $10::int, $11::numeric, $12::int, $13, $14::text[], $15::text[], $16, $17::int)`,
      [
        uid,
        r.name,
        r.address,
        r.district,
        r.state,
        r.pin ?? null,
        r.lat ?? null,
        r.lng ?? null,
        r.rate,
        r.slots,
        r.temp,
        r.humidity,
        r.phone,
        r.badges,
        tags,
        r.facility,
        r.rateHour ?? null,
      ],
    );
    return { ok: true };
  });

export const updateRoom = createServerFn({ method: "POST" })
  .validator((d: unknown) =>
    z
      .object({
        ...roomFields,
        phone: z.union([roomFields.phone, z.literal("")]),
        accepting: z.boolean(),
      })
      .parse(d),
  )
  .handler(async ({ data: r }) => {
    const uid = await requireUserId();
    await q(
      `SELECT owner_update_room($1, $2::int, $3::int, $4::numeric, $5::int, $6, $7::boolean)`,
      [uid, r.rate, r.slots, r.temp, r.humidity, r.phone || null, r.accepting],
    );
    return { ok: true };
  });

export const ownerCheckIn = createServerFn({ method: "POST" })
  .validator((d: unknown) => z.object({ passNo: z.string().trim().min(4).max(20) }).parse(d))
  .handler(async ({ data }) => {
    const uid = await requireUserId();
    const b = await q1<{
      pass_no: string;
      crates: number;
      crop: string;
      bay: string;
      farmer_id: string;
    }>(`SELECT * FROM owner_check_in($1, $2)`, [uid, data.passNo]);
    const farmer = b
      ? await q1<{ full_name: string }>(`SELECT full_name FROM profiles WHERE id = $1`, [
          b.farmer_id,
        ])
      : null;
    return b
      ? {
          pass_no: b.pass_no,
          crates: b.crates,
          crop: b.crop,
          bay: b.bay,
          farmer_name: farmer?.full_name ?? "",
        }
      : null;
  });

export const ownerRelease = createServerFn({ method: "POST" })
  .validator((d: unknown) => z.object({ id: uuid }).parse(d))
  .handler(async ({ data }) => {
    const uid = await requireUserId();
    await q(`SELECT owner_release($1, $2::uuid)`, [uid, data.id]);
    return { ok: true };
  });

export const ownerMarkPaid = createServerFn({ method: "POST" })
  .validator((d: unknown) => z.object({ id: uuid }).parse(d))
  .handler(async ({ data }) => {
    const uid = await requireUserId();
    await q(`SELECT owner_mark_paid($1, $2::uuid)`, [uid, data.id]);
    return { ok: true };
  });

// ---------- transporter (driver) ----------
const VEHICLE_COLS = `id, name, phone, vehicle_key, vehicle_no, rc_number, licence_number, insurance_number, fitness_number, aadhaar_last4, base_district, radius_km, capacity_kg, has_reefer, verified, docs_submitted_at, created_at`;
const DRIVER_TRIP_COLS = `b.id, b.farmer_id, b.trip_code, b.from_district, b.to_label, b.distance_km, b.vehicle_key, b.kg, b.crop, b.reefer, b.pickup_date::text AS pickup_date,
  b.amount, b.status, b.notes, b.shared, b.pool_code, b.deliver_by, b.created_at, b.accepted_at, b.picked_at, b.delivered_at, b.paid, b.paid_at, b.pay_method,
  p.full_name AS farmer_name, p.phone AS farmer_phone, p.village AS farmer_village`;

export const getTransporterDashboard = createServerFn({
  method: "GET",
}).handler(async () => {
  const uid = await requireUserId();
  const vehicle = await q1<{ id: string }>(
    `SELECT ${VEHICLE_COLS} FROM transporters WHERE user_id = $1`,
    [uid],
  );
  if (!vehicle) return { vehicle: null, nearby: [], trips: [], stats: null, chart: [] };
  const near = await q<{ id: string }>(`SELECT * FROM transporter_nearby($1)`, [uid]);
  // farmer ids let the driver see each farmer's Shipper Readiness badge
  const who = near.length
    ? await q<{ id: string; farmer_id: string }>(
        `SELECT id, farmer_id FROM transport_bookings WHERE id = ANY($1)`,
        [near.map((x) => x.id)],
      )
    : [];
  const nearby = near.map((x) => ({
    ...x,
    farmer_id: who.find((w) => w.id === x.id)?.farmer_id ?? null,
  }));
  const trips = await q(
    `SELECT ${DRIVER_TRIP_COLS} FROM transport_bookings b LEFT JOIN profiles p ON p.id = b.farmer_id
     WHERE b.transporter_id = $1 ORDER BY b.created_at DESC LIMIT 100`,
    [vehicle.id],
  );
  const stats = await q1(
    `SELECT COALESCE(SUM(amount) FILTER (WHERE paid), 0)::int AS earned_total,
       COALESCE(SUM(amount) FILTER (WHERE paid AND paid_at >= date_trunc('month', now())), 0)::int AS earned_month,
       COALESCE(SUM(amount) FILTER (WHERE status = 'delivered' AND NOT paid), 0)::int AS pending,
       (COUNT(*) FILTER (WHERE status = 'delivered'))::int AS trips_done,
       COALESCE(SUM(distance_km) FILTER (WHERE status = 'delivered'), 0)::int AS km_done,
       (COUNT(*) FILTER (WHERE status IN ('assigned', 'in_transit')))::int AS active
     FROM transport_bookings WHERE transporter_id = $1`,
    [vehicle.id],
  );
  const chart = await q(
    `SELECT to_char(d, 'DD Mon') AS label, COALESCE(SUM(b.amount), 0)::int AS amount
     FROM generate_series((now() AT TIME ZONE 'Asia/Kolkata')::date - 6, (now() AT TIME ZONE 'Asia/Kolkata')::date, interval '1 day') d
     LEFT JOIN transport_bookings b ON b.transporter_id = $1 AND b.paid AND (b.paid_at AT TIME ZONE 'Asia/Kolkata')::date = d::date
     GROUP BY d ORDER BY d`,
    [vehicle.id],
  );
  return { vehicle, nearby, trips, stats, chart };
});

export const registerVehicle = createServerFn({ method: "POST" })
  .validator((d: unknown) =>
    z
      .object({
        name: z.string().trim().min(2).max(80),
        phone: z.string().regex(/^[6-9]\d{9}$/),
        vehicle: z.string().trim().min(2).max(20),
        vehicleNo: z
          .string()
          .trim()
          .toUpperCase()
          .regex(
            /^[A-Z]{2}[ -]?\d{1,2}[ -]?[A-Z]{0,3}[ -]?\d{4}$/,
            "Enter a valid vehicle number like HR 26 AB 1234",
          ),
        district: z.string().trim().min(2).max(60),
        capacity: z.number().int().min(100).max(40000),
        reefer: z.boolean(),
        radius: z.number().int().min(10).max(500),
      })
      .parse(d),
  )
  .handler(async ({ data: v }) => {
    const uid = await requireUserId();
    await q(`SELECT transporter_register($1, $2, $3, $4, $5, $6, $7::int, $8::boolean, $9::int)`, [
      uid,
      v.name,
      v.phone,
      v.vehicle,
      v.vehicleNo,
      v.district,
      v.capacity,
      v.reefer,
      v.radius,
    ]);
    return { ok: true };
  });

export const submitVehicleDocs = createServerFn({ method: "POST" })
  .validator((d: unknown) =>
    z
      .object({
        rc: z.string().trim().min(6).max(20),
        licence: z
          .string()
          .trim()
          .toUpperCase()
          .regex(
            /^[A-Z]{2}[ -]?\d{2}[ -]?\d{4}[ -]?\d{7}$/,
            "Enter a valid driving licence number like HR-0620110012345",
          ),
        insurance: z.string().trim().min(6).max(30),
        fitness: z.string().trim().min(4).max(30),
        aadhaar: z.string().regex(/^[2-9]\d{11}$/, "Aadhaar must be 12 digits"),
      })
      .parse(d),
  )
  .handler(async ({ data: v }) => {
    const uid = await requireUserId();
    // Only the last 4 Aadhaar digits are stored; the full number never reaches the database.
    await q(`SELECT transporter_submit_docs($1, $2, $3, $4, $5, $6)`, [
      uid,
      v.rc,
      v.licence,
      v.insurance,
      v.fitness,
      v.aadhaar.slice(-4),
    ]);
    return { ok: true };
  });

export const acceptTrip = createServerFn({ method: "POST" })
  .validator((d: unknown) => z.object({ id: uuid }).parse(d))
  .handler(async ({ data }) => {
    const uid = await requireUserId();
    const trip = await q1<{
      farmer_id: string;
      trip_code: string;
      pickup_date: string;
      driver_name: string;
      driver_phone: string;
      vehicle_no: string | null;
      from_district: string;
      to_label: string;
    }>(
      `SELECT farmer_id, trip_code, pickup_date::text AS pickup_date, driver_name, driver_phone, vehicle_no, from_district, to_label FROM transporter_accept($1, $2::uuid)`,
      [uid, data.id],
    );
    if (trip)
      await sendEmail(
        await emailFor(trip.farmer_id, "trips"),
        `Driver assigned for ${trip.trip_code}`,
        [
          `${trip.from_district} to ${trip.to_label}, pickup ${trip.pickup_date}.`,
          `Driver: ${trip.driver_name} (${trip.driver_phone}) · Vehicle: ${trip.vehicle_no ?? "-"}`,
        ],
      );
    return { ok: true };
  });

export const driverSetStatus = createServerFn({ method: "POST" })
  .validator((d: unknown) =>
    z
      .object({
        id: uuid,
        status: z.enum(["requested", "in_transit", "delivered"]),
      })
      .parse(d),
  )
  .handler(async ({ data }) => {
    const uid = await requireUserId();
    await q(`SELECT transporter_set_status($1, $2::uuid, $3)`, [uid, data.id, data.status]);
    return { ok: true };
  });

export const driverMarkPaid = createServerFn({ method: "POST" })
  .validator((d: unknown) => z.object({ id: uuid, method: z.enum(["Cash", "UPI"]) }).parse(d))
  .handler(async ({ data }) => {
    const uid = await requireUserId();
    await q(`SELECT transporter_mark_paid($1, $2::uuid, $3)`, [uid, data.id, data.method]);
    return { ok: true };
  });

// ---------- KrishiSaakh ratings ----------
const DAY_MS = 86_400_000;
const days = (a: string | null, b: string | null) =>
  a && b ? (new Date(a).getTime() - new Date(b).getTime()) / DAY_MS : 0;

/** Completed transactions the caller can still rate, across all six flows. */
export const getRateables = createServerFn({ method: "GET" }).handler(async () => {
  const uid = await requireUserId();
  const notRated = (flow: number, idCol: string) =>
    `NOT EXISTS (SELECT 1 FROM ks_ratings k WHERE k.flow = ${flow} AND k.tx_id = ${idCol} AND k.rater_id = $1)`;
  return q<{
    flow: number;
    tx_id: string;
    title: string;
    detail: string;
    ratee_id: string;
    ratee_name: string | null;
    done_at: string;
  }>(
    `SELECT 1 AS flow, b.id AS tx_id, b.pass_no AS title, b.crates || ' crates ' || b.crop AS detail, b.farmer_id AS ratee_id, p.full_name AS ratee_name, b.released_at AS done_at
       FROM bookings b JOIN cold_rooms c ON c.id = b.cold_room_id LEFT JOIN profiles p ON p.id = b.farmer_id
       WHERE c.owner_id = $1 AND b.released_at IS NOT NULL AND ${notRated(1, "b.id")}
     UNION ALL
     SELECT 6, b.id, b.pass_no, c.name, c.owner_id, c.name, b.released_at
       FROM bookings b JOIN cold_rooms c ON c.id = b.cold_room_id
       WHERE b.farmer_id = $1 AND b.released_at IS NOT NULL AND c.owner_id IS NOT NULL AND ${notRated(6, "b.id")}
     UNION ALL
     SELECT 2, l.id, l.lot_code, l.kg || ' kg ' || l.crop, l.farmer_id, l.farmer_name, l.settled_at
       FROM lots l WHERE l.buyer_id = $1 AND l.status IN ('settled', 'rejected') AND ${notRated(2, "l.id")}
     UNION ALL
     SELECT 5, l.id, l.lot_code, l.kg || ' kg ' || l.crop, l.buyer_id, l.buyer_name, l.settled_at
       FROM lots l WHERE l.farmer_id = $1 AND l.status IN ('settled', 'rejected') AND l.buyer_id IS NOT NULL AND ${notRated(5, "l.id")}
     UNION ALL
     SELECT 3, b.id, b.trip_code, b.from_district || ' → ' || b.to_label, b.farmer_id, p.full_name, b.delivered_at
       FROM transport_bookings b JOIN transporters t ON t.id = b.transporter_id LEFT JOIN profiles p ON p.id = b.farmer_id
       WHERE t.user_id = $1 AND b.status = 'delivered' AND ${notRated(3, "b.id")}
     UNION ALL
     SELECT 4, b.id, b.trip_code, b.from_district || ' → ' || b.to_label, t.user_id, t.name, b.delivered_at
       FROM transport_bookings b JOIN transporters t ON t.id = b.transporter_id
       WHERE b.farmer_id = $1 AND b.status = 'delivered' AND t.user_id IS NOT NULL AND ${notRated(4, "b.id")}
     ORDER BY done_at DESC NULLS LAST LIMIT 30`,
    [uid],
  );
});

const ANSWER = z.union([z.literal(100), z.literal(50), z.literal(0)]);
export const submitRating = createServerFn({ method: "POST" })
  .validator((d: unknown) =>
    z
      .object({
        flow: z.number().int().min(1).max(6),
        txId: uuid,
        answers: z.record(z.string().max(20), ANSWER),
        weatherShield: z.boolean(),
      })
      .parse(d),
  )
  .handler(async ({ data }) => {
    const uid = await requireUserId();
    const flow = data.flow as FlowId;
    const def = FLOWS[flow];
    const v: Record<string, number> = {};
    let ratee: string | null = null;
    // System telemetry comes from the app's own records; the rater cannot change it.
    if (def.kind === "booking") {
      const b = await q1<{
        farmer_id: string;
        owner_id: string | null;
        checked_in_at: string | null;
        released_at: string | null;
        ends_at: string;
        paid: boolean;
        amount: number;
        crates: number;
        days: number;
        hours: number | null;
        rate: number;
        rate_hour: number | null;
      }>(
        `SELECT b.farmer_id, c.owner_id, b.checked_in_at, b.released_at, b.ends_at, b.paid, b.amount, b.crates, b.days, b.hours, c.rate_per_crate_day AS rate, c.rate_per_crate_hour AS rate_hour
         FROM bookings b JOIN cold_rooms c ON c.id = b.cold_room_id WHERE b.id = $1`,
        [data.txId],
      );
      if (!b?.released_at) throw new Error("You can rate a booking once the goods are released");
      if (flow === 1) {
        if (b.owner_id !== uid) throw new Error("Not your cold room");
        ratee = b.farmer_id;
        v["B_honour"] = b.checked_in_at ? 100 : 0;
        v["T_vacate"] = Math.max(
          0,
          100 - 5 * Math.max(0, Math.ceil(days(b.released_at, b.ends_at))),
        );
        v["P_rent"] = b.paid ? 100 : 0;
      } else {
        if (b.farmer_id !== uid) throw new Error("Not your booking");
        ratee = b.owner_id;
        const fair = b.hours
          ? b.crates * b.hours * (b.rate_hour ?? Math.max(1, Math.ceil(b.rate / 12)))
          : b.crates * b.days * b.rate;
        v["B_transparent"] = b.amount === fair ? 100 : 50;
      }
    } else if (def.kind === "lot") {
      const l = await q1<{
        farmer_id: string;
        buyer_id: string | null;
        status: string;
        ordered_at: string | null;
        settled_at: string | null;
      }>(`SELECT farmer_id, buyer_id, status, ordered_at, settled_at FROM lots WHERE id = $1`, [
        data.txId,
      ]);
      if (l?.status !== "settled" && l?.status !== "rejected")
        throw new Error("You can rate a lot once it is settled");
      if (flow === 2) {
        if (l.buyer_id !== uid) throw new Error("You did not buy this lot");
        ratee = l.farmer_id;
        v["C_honour"] = 100;
      } else {
        if (l.farmer_id !== uid) throw new Error("Not your lot");
        ratee = l.buyer_id;
        const d = days(l.settled_at, l.ordered_at);
        v["P_speed"] = d <= 1 ? 100 : d <= 2 ? 70 : Math.max(0, 100 - 15 * Math.ceil(d));
        v["D_price_lock"] = 100; // the price is locked in escrow when the order is placed
      }
    } else {
      const tr = await q1<{
        farmer_id: string;
        driver_uid: string | null;
        status: string;
        pickup_date: string;
        picked_at: string | null;
        delivered_at: string | null;
        deliver_by: string | null;
        handbacks: number;
      }>(
        `SELECT b.farmer_id, t.user_id AS driver_uid, b.status, b.pickup_date::text AS pickup_date, b.picked_at, b.delivered_at, b.deliver_by, COALESCE(t.handbacks, 0) AS handbacks
         FROM transport_bookings b LEFT JOIN transporters t ON t.id = b.transporter_id WHERE b.id = $1`,
        [data.txId],
      );
      if (tr?.status !== "delivered") throw new Error("You can rate a trip once it is delivered");
      if (flow === 3) {
        if (tr.driver_uid !== uid) throw new Error("Not your trip");
        ratee = tr.farmer_id;
        v["R_no_cancel"] = 100;
      } else {
        if (tr.farmer_id !== uid) throw new Error("Not your trip");
        ratee = tr.driver_uid;
        const late = tr.picked_at ? Math.floor(days(tr.picked_at.slice(0, 10), tr.pickup_date)) : 0;
        v["P_arrival"] = late <= 0 ? 100 : late === 1 ? 50 : 0;
        v["R_commit"] = Math.max(0, 100 - 20 * tr.handbacks);
        // Delivered before the grower's deadline (perishables lose value by the hour).
        v["G_exact"] = !tr.delivered_at
          ? 0
          : !tr.deliver_by || new Date(tr.delivered_at) <= new Date(tr.deliver_by)
            ? 100
            : 30;
      }
    }
    if (!ratee) throw new Error("The other party has no ChillChain account to rate");
    for (const c of def.comps.filter((c) => c.src !== "system")) {
      const a = data.answers[c.k];
      if (a === undefined) throw new Error("Please answer every question");
      v[c.k] = a;
    }
    // IMD weather delay shield: time-based parts are not held against anyone for a weather delay.
    if (data.weatherShield) for (const c of def.comps) if (c.timed) v[c.k] = 100;
    const s = txScore(flow, v);
    await q(`SELECT ks_record($1::smallint, $2, $3::uuid, $4, $5, $6, $7, $8, $9::jsonb, $10)`, [
      flow,
      def.kind,
      data.txId,
      uid,
      ratee,
      s.score,
      s.system,
      s.peer,
      JSON.stringify(v),
      data.weatherShield,
    ]);
    return { score: Math.round(s.score) };
  });

/** Revealed reputation per user and flow (EMA over time, then Bayesian stars in the browser). */
export const getReputation = createServerFn({ method: "POST" })
  .validator((d: unknown) => z.object({ ids: z.array(z.string().max(64)).max(100) }).parse(d))
  .handler(async ({ data }) => {
    await requireUserId();
    const ids = [...new Set(data.ids)].filter(Boolean);
    if (!ids.length) return {} as Record<string, Partial<Record<FlowId, FlowRep>>>;
    const rows = await q<{ ratee_id: string; flow: number; score: number }>(
      `SELECT ratee_id, flow, score::float8 AS score FROM ks_ratings WHERE ratee_id = ANY($1) AND reveal_at <= now() AND NOT excluded ORDER BY created_at`,
      [ids],
    );
    const out: Record<string, Partial<Record<FlowId, FlowRep>>> = {};
    for (const id of ids) {
      out[id] = {};
      for (const f of FLOW_IDS) {
        const scores = rows.filter((r) => r.ratee_id === id && r.flow === f).map((r) => r.score);
        if (scores.length) out[id][f] = { r: emaFold(scores), n: scores.length };
      }
    }
    return out;
  });

/** Ratings about the caller that are still inside the 48-hour double-blind window. */
export const getPendingReveal = createServerFn({ method: "GET" }).handler(async () => {
  const uid = await requireUserId();
  const r = await q1<{ n: number; next: string | null }>(
    `SELECT count(*)::int AS n, min(reveal_at) AS next FROM ks_ratings WHERE ratee_id = $1 AND reveal_at > now()`,
    [uid],
  );
  return r ?? { n: 0, next: null };
});

// ---------- crop advisor: the grower's farm details ----------
export const farmInput = z.object({
  region: z.enum(["hills", "humid", "semiarid", "plains", "arid", "urban"]),
  acres: z.number().min(0).max(1000),
  budget: z.number().int().min(10000).max(50_000_000),
  water: z.enum(["low", "medium", "high"]),
  nearCity: z.boolean(),
});
export type FarmInput = z.infer<typeof farmInput>;

export const getFarm = createServerFn({ method: "GET" }).handler(async () => {
  const uid = await requireUserId();
  const r = await q1<{ farm: unknown }>(`SELECT farm FROM profiles WHERE id = $1`, [uid]);
  const ok = farmInput.safeParse(r?.farm); // older saved shapes are ignored
  return ok.success ? ok.data : null;
});

export const saveFarm = createServerFn({ method: "POST" })
  .validator((d: unknown) => farmInput.parse(d))
  .handler(async ({ data }) => {
    const uid = await requireUserId();
    await q(`UPDATE profiles SET farm = $2::jsonb, updated_at = now() WHERE id = $1`, [
      uid,
      JSON.stringify(data),
    ]);
    return { ok: true };
  });
