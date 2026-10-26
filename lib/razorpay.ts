// Razorpay Checkout in the browser: load checkout.js once, open it for an order the server created,
// and resolve with the signed result (verified again on the server by finishPayment).
interface RzpResult {
  razorpay_order_id: string;
  razorpay_payment_id: string;
  razorpay_signature: string;
}
interface RzpCheckout {
  open(): void;
  on(event: "payment.failed", cb: (r: { error?: { description?: string } }) => void): void;
}
declare global {
  interface Window {
    Razorpay?: new (options: object) => RzpCheckout;
  }
}

let loading: Promise<void> | null = null;
function loadCheckout() {
  if (window.Razorpay) return Promise.resolve();
  loading ??= new Promise<void>((resolve, reject) => {
    const s = document.createElement("script");
    s.src = "https://checkout.razorpay.com/v1/checkout.js";
    s.onload = () => resolve();
    s.onerror = () => {
      loading = null;
      reject(new Error("Could not load Razorpay. Check the internet connection."));
    };
    document.head.appendChild(s);
  });
  return loading;
}

/** Opens Razorpay Checkout. Resolves with the signed result, or null if the user closed it. */
export async function openCheckout(o: {
  keyId: string;
  orderId: string;
  amount: number; // rupees
  description: string;
  name: string;
  phone: string;
}): Promise<RzpResult | null> {
  await loadCheckout();
  return new Promise((resolve, reject) => {
    const rzp = new window.Razorpay!({
      key: o.keyId,
      order_id: o.orderId,
      amount: o.amount * 100,
      currency: "INR",
      name: "ChillChain",
      description: o.description,
      prefill: { name: o.name, contact: o.phone },
      theme: { color: "#0A84FF" },
      handler: (r: RzpResult) => resolve(r),
      modal: { ondismiss: () => resolve(null) },
    });
    rzp.on("payment.failed", (r) => reject(new Error(r.error?.description ?? "Payment failed")));
    rzp.open();
  });
}
