// Server-only. The signed-in user comes from Clerk (clerkMiddleware in src/start.ts), never from the browser's input.
import { auth, clerkClient } from "@clerk/tanstack-react-start/server";
import { q1 } from "./db.server";

export async function requireUserId(): Promise<string> {
  const { isAuthenticated, userId } = await auth();
  if (!isAuthenticated || !userId) throw new Error("Please sign in again.");
  return userId;
}

/** Primary email of any user (used for notification emails). Returns null if it can't be found. */
export async function emailOf(userId: string): Promise<string | null> {
  try {
    const c = await clerkClient();
    const u = await c.users.getUser(userId);
    return u.primaryEmailAddress?.emailAddress ?? u.emailAddresses[0]?.emailAddress ?? null;
  } catch (e) {
    console.error("emailOf failed", e);
    return null;
  }
}

export type EmailTopic = "bookings" | "trips" | "payments" | "ratings" | "prices";
/** Email address for a notification, or null when the user turned email (or this topic) off in Settings. */
export async function emailFor(
  userId: string | null | undefined,
  topic: EmailTopic,
): Promise<string | null> {
  if (!userId) return null;
  const s = await q1<{ email: boolean | null; topic: boolean | null }>(
    `SELECT (settings->'notify'->>'email')::boolean AS email, (settings->'notify'->'topics'->>$2)::boolean AS topic FROM profiles WHERE id = $1`,
    [userId, topic],
  );
  if (s?.email === false || s?.topic === false) return null;
  return emailOf(userId);
}
