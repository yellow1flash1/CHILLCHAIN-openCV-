// Razorpay REST calls (orders, payment lookup, capture, refunds) and checkout signature checks.
// Keys come from RAZORPAY_KEY_ID / RAZORPAY_KEY_SECRET. Only test keys (rzp_test_…) are used unless
// RAZORPAY_ALLOW_LIVE=yes, so a live key pasted by mistake never moves real money.
const keyId = () => process.env["RAZORPAY_KEY_ID"] ?? "";
const secret = () => process.env["RAZORPAY_KEY_SECRET"] ?? "";
const testKey = () => keyId().startsWith("rzp_test_");

export const razorpayOn = () =>
  !!(keyId() && secret()) && (testKey() || process.env["RAZORPAY_ALLOW_LIVE"] === "yes");
export const razorpayKeyId = () => (razorpayOn() ? keyId() : null);
export const razorpayTest = testKey;

async function call<T>(path: string, body?: object, method = body ? "POST" : "GET"): Promise<T> {
  const res = await fetch(`https://api.razorpay.com/v1${path}`, {
    method,
    headers: {
      Authorization: "Basic " + btoa(`${keyId()}:${secret()}`),
      "Content-Type": "application/json",
    },
    ...(body ? { body: JSON.stringify(body) } : {}),
    signal: AbortSignal.timeout(15_000),
  });
  const j = (await res.json().catch(() => ({}))) as { error?: { description?: string } };
  if (!res.ok) throw new Error(j.error?.description ?? `Razorpay error ${res.status}`);
  return j as T;
}

export interface RzpPayment {
  id: string;
  order_id: string;
  status: "created" | "authorized" | "captured" | "refunded" | "failed";
  amount: number; // paise
  method: string;
}

export const createOrder = (rupees: number, receipt: string, notes: Record<string, string>) =>
  call<{ id: string; amount: number }>("/orders", {
    amount: rupees * 100,
    currency: "INR",
    receipt: receipt.slice(0, 40),
    notes,
  });
export const getPayment = (id: string) => call<RzpPayment>(`/payments/${encodeURIComponent(id)}`);
export const capturePayment = (id: string, paise: number) =>
  call<RzpPayment>(`/payments/${encodeURIComponent(id)}/capture`, {
    amount: paise,
    currency: "INR",
  });
export const refundPayment = (id: string, rupees: number, notes: Record<string, string>) =>
  call<{ id: string }>(`/payments/${encodeURIComponent(id)}/refund`, {
    amount: rupees * 100,
    notes,
  });

/** Checkout returns HMAC-SHA256(order_id|payment_id) keyed with the secret; anything else is forged. */
export async function signatureOk(orderId: string, paymentId: string, signature: string) {
  const enc = new TextEncoder();
  const key = await crypto.subtle.importKey(
    "raw",
    enc.encode(secret()),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"],
  );
  const mac = await crypto.subtle.sign("HMAC", key, enc.encode(`${orderId}|${paymentId}`));
  const hex = [...new Uint8Array(mac)].map((b) => b.toString(16).padStart(2, "0")).join("");
  if (hex.length !== signature.length) return false;
  let diff = 0;
  for (let i = 0; i < hex.length; i++) diff |= hex.charCodeAt(i) ^ signature.charCodeAt(i);
  return diff === 0;
}
