import { and, eq } from "drizzle-orm";
import { createHash } from "node:crypto";
import { db } from "@/db";
import { account, googleCalendarSync } from "@/db/schema";
import { getPeranCodes } from "@/lib/auth/authorization";
import { getGoogleMeetAccessToken } from "@/lib/google-meet";
import { resolveAuthBaseUrl } from "@/lib/auth-site-url";
import { hasCalendarScope } from "./shared";
import { calendarSource } from "./source";
import { CalendarApiError, reconcileCalendar } from "./transport";
import { CENTRAL_CALENDAR_ID, centralCalendarConfigured } from "./central";

export { centralCalendarConfigured } from "./central";
export async function personalCalendarAccount(userId: string) {
  const rows = await db.select().from(account).where(and(eq(account.userId, userId), eq(account.providerId, "google")));
  return rows.find(row => hasCalendarScope(row.scope) && row.refreshToken);
}
export async function syncGoogleCalendar(target: string) {
  // Serialized per target by the active queue transport.
  const userId = target === "central" ? undefined : target.startsWith("user:") ? target.slice(5) : "";
  if (userId === "") throw new Error("Invalid calendar target");
  await db.insert(googleCalendarSync).values({ target, userId }).onConflictDoNothing();
  await db.update(googleCalendarSync).set({ requestedAt: new Date(), error: null }).where(eq(googleCalendarSync.target, target));
  try {
    let token: string;
    let calendarId: string;
    if (userId) {
      const roles = await getPeranCodes(userId);
      const linked = await personalCalendarAccount(userId);
      if (!roles.some(role => role === "murid" || role === "tutor") || !linked) {
        await db.update(googleCalendarSync).set({ error: "reconnect", requestedAt: null }).where(eq(googleCalendarSync.target, target));
        return;
      }
      try {
        const { auth } = await import("@/lib/auth");
        const result = await auth.api.getAccessToken({ body: { providerId: "google", accountId: linked.accountId, userId } });
        if (!result.accessToken) throw new Error("Missing token");
        token = result.accessToken;
      } catch { throw new CalendarApiError(401); }
      calendarId = "primary";
    } else {
      if (!centralCalendarConfigured()) {
        await db.update(googleCalendarSync).set({ requestedAt: null, error: "failed" }).where(eq(googleCalendarSync.target, target));
        return;
      }
      token = await getGoogleMeetAccessToken();
      calendarId = CENTRAL_CALENDAR_ID;
    }
    const entries = await calendarSource(userId);
    const owner = createHash("sha256").update(`${resolveAuthBaseUrl()}:${target}`).digest("hex");
    await reconcileCalendar(token, calendarId, owner, entries);
    await db.update(googleCalendarSync).set({ lastSyncedAt: new Date(), error: null, requestedAt: null }).where(eq(googleCalendarSync.target, target));
  } catch (error) {
    const reconnect = error instanceof CalendarApiError && error.requiresReconnect;
    await db.update(googleCalendarSync).set({ error: reconnect ? "reconnect" : "failed", requestedAt: null }).where(eq(googleCalendarSync.target, target));
    // Do not send provider messages or tokens to job logs.
    if (!reconnect) throw new Error("Google Calendar sync failed");
  }
}
