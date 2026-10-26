// Browser-side wrappers around the server functions. They return { data, error } so UI code stays simple.
import * as s from "./app.functions";
import * as a from "./account.functions";
import * as pay from "./pay.functions";
import { isNetworkError, isOnline, markDown, markUp } from "./net";

// Input type of a server function (its `data` argument).
type In<F extends (...a: never[]) => unknown> =
  NonNullable<Parameters<F>[0]> extends { data?: infer D } ? NonNullable<D> : never;
type R<T> = { data: T | null; error: { message: string; offline?: true } | null };

// The store hands over its translator so the "no internet" message shows in the chosen language.
let t = (en: string, _hi: string) => en;
export const setApiT = (f: typeof t) => {
  t = f;
};
export const offlineMessage = () =>
  t(
    "No internet. This needs a connection; try again when you're back online.",
    "इंटरनेट नहीं है। इसके लिए नेटवर्क चाहिए; ऑनलाइन होने पर फिर कोशिश करें।",
  );

async function run<T>(p: () => Promise<T>): Promise<R<T>> {
  if (!isOnline()) return { data: null, error: { message: offlineMessage(), offline: true } };
  try {
    const data = await p();
    markUp();
    return { data, error: null };
  } catch (e) {
    if (isNetworkError(e)) {
      markDown();
      return { data: null, error: { message: offlineMessage(), offline: true } };
    }
    return {
      data: null,
      error: { message: e instanceof Error ? e.message : "Something went wrong" },
    };
  }
}

export const api = {
  startPayment: (d: In<typeof pay.startPayment>) => run(() => pay.startPayment({ data: d })),
  finishPayment: (d: In<typeof pay.finishPayment>) => run(() => pay.finishPayment({ data: d })),
  createScan: (d: In<typeof s.createScan>) => run(() => s.createScan({ data: d })),
  createLot: (d: In<typeof s.createLot>) => run(() => s.createLot({ data: d })),
  cancelLot: (lotId: string) => run(() => s.cancelLot({ data: { lotId } })),
  placeOrder: (lotId: string) => run(() => s.placeOrder({ data: { lotId } })),
  confirmDelivery: (lotId: string, code: string, acceptedKg?: number, reason?: string) =>
    run(() =>
      s.confirmDelivery({
        data: {
          lotId,
          code,
          ...(acceptedKg != null ? { acceptedKg } : {}),
          ...(reason ? { reason } : {}),
        },
      }),
    ),
  correctScanGrade: (scanId: string, grade: "A" | "B" | "C") =>
    run(() => s.correctScanGrade({ data: { scanId, grade } })),
  getHandover: (lotId: string) => run(() => s.getHandover({ data: { lotId } })),
  regenerateHandover: (lotId: string) => run(() => s.regenerateHandover({ data: { lotId } })),
  createBooking: (d: In<typeof s.createBooking>) => run(() => s.createBooking({ data: d })),
  createPreorder: (d: In<typeof s.createPreorder>) => run(() => s.createPreorder({ data: d })),
  cancelPreorder: (id: string) => run(() => s.cancelPreorder({ data: { id } })),
  acceptPreorder: (id: string, kg?: number) =>
    run(() => s.acceptPreorder({ data: { id, ...(kg ? { kg } : {}) } })),
  quoteTransport: (d: In<typeof s.quoteTransport>) => run(() => s.quoteTransport({ data: d })),
  createTransport: (d: In<typeof s.createTransport>) => run(() => s.createTransport({ data: d })),
  setTransportStatus: (id: string, status: "cancelled" | "in_transit" | "delivered") =>
    run(() => s.setTransportStatus({ data: { id, status } })),
  registerRoom: (d: In<typeof s.registerRoom>) => run(() => s.registerRoom({ data: d })),
  updateRoom: (d: In<typeof s.updateRoom>) => run(() => s.updateRoom({ data: d })),
  ownerCheckIn: (passNo: string) => run(() => s.ownerCheckIn({ data: { passNo } })),
  ownerRelease: (id: string) => run(() => s.ownerRelease({ data: { id } })),
  ownerMarkPaid: (id: string) => run(() => s.ownerMarkPaid({ data: { id } })),
  registerVehicle: (d: In<typeof s.registerVehicle>) => run(() => s.registerVehicle({ data: d })),
  submitVehicleDocs: (d: In<typeof s.submitVehicleDocs>) =>
    run(() => s.submitVehicleDocs({ data: d })),
  acceptTrip: (id: string) => run(() => s.acceptTrip({ data: { id } })),
  driverSetStatus: (id: string, status: "requested" | "in_transit" | "delivered") =>
    run(() => s.driverSetStatus({ data: { id, status } })),
  driverMarkPaid: (id: string, method: "Cash" | "UPI") =>
    run(() => s.driverMarkPaid({ data: { id, method } })),
  submitRating: (d: In<typeof s.submitRating>) => run(() => s.submitRating({ data: d })),
  saveFarm: (d: In<typeof s.saveFarm>) => run(() => s.saveFarm({ data: d })),
  saveSettings: (d: In<typeof a.saveSettings>) => run(() => a.saveSettings({ data: d })),
  setAvailability: (available: boolean) => run(() => a.setAvailability({ data: { available } })),
  setPalledari: (rate: number | null) => run(() => a.setPalledari({ data: { rate } })),
  signOutEverywhere: () => run(() => a.signOutEverywhere()),
  deleteMyAccount: () => run(() => a.deleteMyAccount({ data: { confirm: "DELETE" } })),
  getMyData: () => run(() => a.getMyData()),
  raiseDispute: (ratingId: string, reason: string) =>
    run(() => a.raiseDispute({ data: { ratingId, reason } })),
  adminVerify: (kind: "transporter" | "room", id: string, verified: boolean) =>
    run(() => a.adminVerify({ data: { kind, id, verified } })),
  adminResolveDispute: (id: string, uphold: boolean) =>
    run(() => a.adminResolveDispute({ data: { id, uphold } })),
  payBookingDues: (ids: string[], utr: string, method: string) =>
    run(() => s.payBookingDues({ data: { ids, utr, method } })),
};

/** Upload a crate photo straight to Cloudflare R2; returns the object key to store on the scan. */
export async function uploadScanPhoto(blob: Blob): Promise<string | null> {
  try {
    const type =
      blob.type === "image/png"
        ? "image/png"
        : blob.type === "image/webp"
          ? "image/webp"
          : "image/jpeg";
    const { key, url } = await s.getScanUploadUrl({ data: { contentType: type } });
    const r = await fetch(url, { method: "PUT", headers: { "Content-Type": type }, body: blob });
    return r.ok ? key : null;
  } catch {
    return null;
  }
}
