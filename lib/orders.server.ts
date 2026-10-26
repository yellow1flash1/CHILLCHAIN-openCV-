// Orders and bookings, shared by the plain server functions (app.functions.ts) and by a verified Razorpay
// payment (pay.functions.ts). Prices, slot checks and escrow all stay inside the SQL functions.
import { q, q1, BOOKING_COLS } from "./db.server";
import { emailFor } from "./session.server";
import { sendEmail } from "./email.server";
import { cropBy } from "./crops";
import { razorpayOn, refundPayment } from "./razorpay.server";

const inr = (n: number) => `₹${n.toLocaleString("en-IN")}`;

export interface BookingRequest {
  coldRoomId: string;
  crop: string;
  crates: number;
  days?: number | undefined;
  hours?: number | undefined;
  payMode: "upi" | "credit";
  utr?: string | undefined;
  payMethod?: string | undefined;
}

export async function createBookingFor(uid: string, b: BookingRequest) {
  const row = await q1<{
    pass_no: string;
    amount: number;
    bay: string;
    crates: number;
    days: number;
    hours: number | null;
  }>(`SELECT * FROM create_booking($1, $2, $3, $4, $5::int, $6::int, $7, $8, $9)`, [
    uid,
    b.coldRoomId,
    b.crop,
    b.crates,
    b.hours ? null : (b.days ?? 1),
    b.hours ?? null,
    b.payMode,
    b.utr ?? null,
    b.payMethod ?? null,
  ]);
  if (!row) throw new Error("Booking failed");
  const term = row.hours ? `${row.hours} hour(s)` : `${row.days} day(s)`;
  await sendEmail(await emailFor(uid, "bookings"), `Gate pass ${row.pass_no} confirmed`, [
    `Your storage booking is confirmed.`,
    `Pass: ${row.pass_no} · Bay: ${row.bay}`,
    `${row.crates} crates for ${term} · Amount: ${inr(row.amount)}`,
  ]);
  // Tell the cold room owner (their dashboard also refreshes every few seconds).
  const info = await q1<{ owner_id: string | null; name: string; left: number }>(
    `SELECT owner_id, name, (total_slots - room_used_crates(id))::int AS left FROM cold_rooms WHERE id = $1`,
    [b.coldRoomId],
  );
  if (info?.owner_id) {
    const ownerEmail = await emailFor(info.owner_id, "bookings");
    await sendEmail(ownerEmail, `New booking ${row.pass_no}`, [
      `${row.crates} crates of ${cropBy(b.crop).en} for ${term} at ${info.name}.`,
      `Bay ${row.bay} · ${inr(row.amount)} · ${info.left} crate slots left.`,
    ]);
    if (info.left <= 0)
      await sendEmail(ownerEmail, `${info.name} is now full`, [
        `All crate slots are booked. New bookings are blocked until space is released.`,
      ]);
  }
  return q1(`SELECT ${BOOKING_COLS} FROM bookings WHERE pass_no = $1`, [row.pass_no]);
}

export async function placeOrderFor(uid: string, lotId: string) {
  const lot = await q1<{
    farmer_id: string;
    lot_code: string;
    crop: string;
    kg: number;
    gross: number;
    net_amount: number;
    buyer_name: string | null;
  }>(
    `SELECT farmer_id, lot_code, crop, kg, gross, net_amount, buyer_name FROM place_order($1, $2)`,
    [uid, lotId],
  );
  if (lot)
    await sendEmail(await emailFor(lot.farmer_id, "payments"), `New order for ${lot.lot_code}`, [
      `${lot.buyer_name ?? "A buyer"} ordered your lot ${lot.lot_code} (${lot.kg} kg ${cropBy(lot.crop).en}).`,
      `Amount in escrow: ${inr(lot.net_amount)}. Share your handover code when they collect.`,
    ]);
  return lot;
}

/** Refund part of a lot's Razorpay payment (rejected kilos). Without Razorpay the refund stays in test mode. */
export async function refundLot(lotId: string, rupees: number) {
  if (!razorpayOn() || rupees <= 0) return;
  const p = await q1<{ id: string; rzp_payment_id: string; amount: number; refunded: number }>(
    `SELECT p.id, p.rzp_payment_id, p.amount, p.refunded
     FROM lots l JOIN payments p ON p.id = l.payment_id
     WHERE l.id = $1 AND p.rzp_payment_id IS NOT NULL`,
    [lotId],
  );
  if (!p) return;
  const amount = Math.min(rupees, p.amount - p.refunded);
  if (amount <= 0) return;
  try {
    await refundPayment(p.rzp_payment_id, amount, { lot: lotId, reason: "rejected at delivery" });
    await q(
      `UPDATE payments SET refunded = refunded + $2,
         status = CASE WHEN refunded + $2 >= amount THEN 'refunded' ELSE 'partly_refunded' END
       WHERE id = $1`,
      [p.id, amount],
    );
  } catch (e) {
    // The delivery is already confirmed; a failed refund is retried from the Razorpay dashboard.
    console.error("Razorpay refund failed", lotId, e);
  }
}
