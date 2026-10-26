import { createHmac } from "node:crypto";
import { afterEach, describe, expect, it } from "vitest";
import { razorpayOn, signatureOk } from "@/lib/razorpay.server";

const env = process.env;
afterEach(() => {
  delete env["RAZORPAY_KEY_ID"];
  delete env["RAZORPAY_KEY_SECRET"];
  delete env["RAZORPAY_ALLOW_LIVE"];
});

describe("razorpay", () => {
  it("accepts only Razorpay's signature of order_id|payment_id", async () => {
    env["RAZORPAY_KEY_SECRET"] = "test_secret";
    const good = createHmac("sha256", "test_secret").update("order_1|pay_1").digest("hex");
    expect(await signatureOk("order_1", "pay_1", good)).toBe(true);
    expect(await signatureOk("order_1", "pay_2", good)).toBe(false);
    expect(await signatureOk("order_1", "pay_1", good.replace(/.$/, "0"))).toBe(false);
    expect(await signatureOk("order_1", "pay_1", "short")).toBe(false);
  });

  it("is off without keys and refuses live keys unless allowed", () => {
    expect(razorpayOn()).toBe(false);
    env["RAZORPAY_KEY_ID"] = "rzp_test_abc";
    env["RAZORPAY_KEY_SECRET"] = "s";
    expect(razorpayOn()).toBe(true);
    env["RAZORPAY_KEY_ID"] = "rzp_live_abc";
    expect(razorpayOn()).toBe(false);
    env["RAZORPAY_ALLOW_LIVE"] = "yes";
    expect(razorpayOn()).toBe(true);
  });
});
