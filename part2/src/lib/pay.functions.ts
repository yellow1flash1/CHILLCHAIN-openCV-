// Razorpay checkout (test mode). The browser never sends an amount: the server quotes it from the database
// (lot_order_amount, booking_amount, dues_amount in neon/011_razorpay.sql), creates the Razorpay order, and
// after checkout verifies the signature, claims the payment once, and only then places the order or booking.
// If that step fails (the lot sold meanwhile, the room filled up), the payment is refunded at once.
import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { q, q1 } from "./db.server";
import { requireUserId } from "./session.server";
import { CROPS } from "./crops";
import {
  capturePayment,
  createOrder,
  getPayment,
  razorpayKeyId,
  razorpayOn,
  razorpayTest,
  refundPayment,
  signatureOk,
} from "./razorpay.server";
import { createBookingFor, placeOrderFor } from "./orders.server";

const uuid = z.string().uuid();
const cropKey = z
  .string()
  .trim()
  .refine((k) => CROPS.some((c) => c.key === k), "Unknown crop");

export const payFor = z.discriminatedUnion("purpose", [
  z.object({ purpose: z.literal("lot"), lotId: uuid }),
  z.object({
    purpose: z.literal("booking"),
    coldRoomId: uuid,
    crop: cropKey,
    crates: z.number().int().min(1).max(500),
    days: z.number().int().min(1).max(60).optional(),
    hours: z.number().int().min(1).max(72).optional(),
  }),
  z.object({ purpose: z.literal("dues"), ids: z.array(uuid).min(1).max(100) }),
]);
export type PayFor = z.infer<typeof payFor>;

/** Whether checkout goes through Razorpay (keys set) or the built-in simulation. */
export const getPayConfig = createServerFn({ method: "GET" }).handler(async () => ({
  razorpay: razorpayOn(),
  keyId: razorpayKeyId(),
  test: razorpayTest(),
}));

async function quote(uid: string, p: PayFor): Promise<number> {
  if (p.purpose === "lot") {
    const ok = await q1(`SELECT 1 FROM user_roles WHERE user_id = $1 AND role = 'buyer'`, [uid]);
    if (!ok) throw new Error("Only buyers can order lots");
    const r = await q1<{ a: number | null }>(`SELECT lot_order_amount($1) AS a`, [p.lotId]);
    if (!r?.a) throw new Error("This lot is no longer available");
    return r.a;
  }
  if (p.purpose === "booking") {
    const ok = await q1(`SELECT 1 FROM user_roles WHERE user_id = $1 AND role = 'farmer'`, [uid]);
    if (!ok) throw new Error("Only growers can book storage");
    const r = await q1<{ a: number | null }>(
      `SELECT booking_amount($1, $2, $3::int, $4::int) AS a`,
      [p.coldRoomId, p.crates, p.hours ? null : (p.days ?? 1), p.hours ?? null],
    );
    if (!r?.a) throw new Error("This storage is full or not taking bookings right now");
    return r.a;
  }
  const r = await q1<{ a: number }>(`SELECT dues_amount($1, $2::uuid[]) AS a`, [uid, p.ids]);
  if (!r?.a) throw new Error("Nothing to pay");
  return r.a;
}

export const startPayment = createServerFn({ method: "POST" })
  .validator((d: unknown) => payFor.parse(d))
  .handler(async ({ data }) => {
    const uid = await requireUserId();
    if (!razorpayOn()) throw new Error("Razorpay is not set up");
    const amount = await quote(uid, data);
    const order = await createOrder(amount, `cc_${data.purpose}_${Date.now()}`, {
      purpose: data.purpose,
      user: uid,
    });
    await q(
      `INSERT INTO payments (user_id, purpose, details, amount, rzp_order_id) VALUES ($1, $2, $3, $4, $5)`,
      [uid, data.purpose, JSON.stringify(data), amount, order.id],
    );
    const me = await q1<{ name: string | null; phone: string | null }>(
      `SELECT COALESCE(NULLIF(org_name, ''), full_name) AS name, phone FROM profiles WHERE id = $1`,
      [uid],
    );
    return {
      orderId: order.id,
      amount,
      keyId: razorpayKeyId()!,
      name: me?.name ?? "",
      phone: me?.phone ?? "",
    };
  });

export const finishPayment = createServerFn({ method: "POST" })
  .validator((d: unknown) =>
    z
      .object({
        orderId: z.string().max(64),
        paymentId: z.string().max(64),
        signature: z.string().max(128),
      })
      .parse(d),
  )
  .handler(async ({ data }) => {
    const uid = await requireUserId();
    if (!(await signatureOk(data.orderId, data.paymentId, data.signature)))
      throw new Error("Payment could not be verified");
    const rp = await getPayment(data.paymentId);
    if (rp.order_id !== data.orderId) throw new Error("Payment does not match this order");
    // Claim the payment exactly once, for the user who started it.
    const row = await q1<{ id: string; details: PayFor; amount: number }>(
      `UPDATE payments SET status = 'paid', rzp_payment_id = $3, method = $4, paid_at = now()
       WHERE rzp_order_id = $1 AND user_id = $2 AND status = 'created'
       RETURNING id, details, amount`,
      [data.orderId, uid, data.paymentId, rp.method],
    );
    if (!row) throw new Error("This payment was already used");
    if (rp.status === "authorized") await capturePayment(data.paymentId, rp.amount);
    const method = `Razorpay · ${rp.method}`.slice(0, 40);
    const p = row.details;
    try {
      if (p.purpose === "lot") {
        const lot = await placeOrderFor(uid, p.lotId);
        await q(`UPDATE lots SET payment_id = $2 WHERE id = $1`, [p.lotId, row.id]);
        // Prices only step down, so if one stepped down during checkout, return the difference.
        const extra = lot ? row.amount - lot.gross : 0;
        if (extra > 0) {
          await refundPayment(data.paymentId, extra, { reason: "price stepped down" });
          await q(`UPDATE payments SET refunded = $2, status = 'partly_refunded' WHERE id = $1`, [
            row.id,
            extra,
          ]);
        }
        return { ref: data.paymentId };
      }
      if (p.purpose === "booking") {
        const booking = await createBookingFor(uid, {
          ...p,
          payMode: "upi",
          utr: data.paymentId,
          payMethod: method,
        });
        await q(`UPDATE bookings SET payment_id = $2 WHERE utr = $1`, [data.paymentId, row.id]);
        return { ref: data.paymentId, booking };
      }
      await q(`SELECT pay_booking_dues($1, $2::uuid[], $3, $4)`, [
        uid,
        p.ids,
        data.paymentId,
        method,
      ]);
      await q(`UPDATE bookings SET payment_id = $2 WHERE id = ANY($1::uuid[]) AND utr = $3`, [
        p.ids,
        row.id,
        data.paymentId,
      ]);
      return { ref: data.paymentId };
    } catch (e) {
      await refundPayment(data.paymentId, row.amount, { reason: "order could not be completed" });
      await q(`UPDATE payments SET refunded = amount, status = 'refunded' WHERE id = $1`, [row.id]);
      const why = e instanceof Error ? e.message : "Something went wrong";
      throw new Error(`${why}. Your payment has been refunded.`);
    }
  });
