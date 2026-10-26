import { afterEach, describe, expect, it, vi } from "vitest";
import { onlineManager, type Query } from "@tanstack/react-query";

const createScan = vi.fn();
vi.mock("@/lib/app.functions", () => ({ createScan: (a: unknown) => createScan(a) }));
vi.mock("@/lib/account.functions", () => ({}));
vi.mock("@/lib/pay.functions", () => ({}));

const { api } = await import("@/lib/api");
const { isNetworkError, isOnline, markDown, markUp } = await import("@/lib/net");
const { shouldSave } = await import("@/lib/offline");

const scan = {
  batch_code: "#CC-1",
  crop: "strawberry",
  source: "self",
  grade: "A",
  harvested_at: new Date().toISOString(),
  cold_chain: false,
} as const;

afterEach(() => {
  markUp();
  createScan.mockReset();
});

describe("offline mode", () => {
  it("tells a dropped connection from an error the server sent", () => {
    expect(isNetworkError(new TypeError("Failed to fetch"))).toBe(true);
    expect(isNetworkError(new TypeError("Load failed"))).toBe(true);
    expect(isNetworkError(new Error("Not signed in"))).toBe(false);
  });

  it("goes offline on a failed request and back online on a success", () => {
    markDown();
    expect(isOnline()).toBe(false);
    expect(onlineManager.isOnline()).toBe(false);
    markUp();
    expect(isOnline()).toBe(true);
    expect(onlineManager.isOnline()).toBe(true);
  });

  it("does not call the server while offline", async () => {
    markDown();
    const r = await api.createScan(scan);
    expect(createScan).not.toHaveBeenCalled();
    expect(r.error?.offline).toBe(true);
  });

  it("turns a network failure into the offline message, other errors pass through", async () => {
    createScan.mockRejectedValueOnce(new TypeError("Failed to fetch"));
    const a = await api.createScan(scan);
    expect(a.error?.offline).toBe(true);
    expect(isOnline()).toBe(false);

    markUp();
    createScan.mockRejectedValueOnce(new Error("Harvest time must be within the last 14 days"));
    const b = await api.createScan(scan);
    expect(b.error).toEqual({ message: "Harvest time must be within the last 14 days" });
    expect(isOnline()).toBe(true);
  });

  it("saves loaded screens on the phone but never admin data", () => {
    const q = (key: string, status = "success") =>
      ({ queryKey: [key], state: { status } }) as unknown as Query;
    expect(shouldSave(q("scans"))).toBe(true);
    expect(shouldSave(q("scans", "error"))).toBe(false);
    expect(shouldSave(q("admin"))).toBe(false);
    expect(shouldSave(q("is-admin"))).toBe(false);
  });
});
