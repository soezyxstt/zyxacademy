"use server";

import { cookies, headers } from "next/headers";
import { parseSetCookieHeader, toCookieOptions } from "better-auth/cookies";
import { and, eq, isNull, lt, or } from "drizzle-orm";
import { db } from "@/db";
import { googleCalendarSync } from "@/db/schema";
import { auth } from "@/lib/auth";
import { getPeranCodes } from "@/lib/auth/authorization";
import { inngest } from "@/jobs/client";
import { minutesFrom } from "@/lib/date-utils";
import { centralCalendarConfigured, personalCalendarAccount } from "@/lib/google-calendar/sync";
import { CALENDAR_SCOPE, type CalendarSyncStatus } from "@/lib/google-calendar/shared";

async function authorizedTarget(central: boolean) {
  const session = await auth.api.getSession({ headers: await headers() });
  if (!session) throw new Error("Unauthorized");
  const roles = await getPeranCodes(session.user.id);
  if (central ? !roles.includes("admin") : !roles.some(role => role === "murid" || role === "tutor")) throw new Error("Forbidden");
  return { target: central ? "central" : `user:${session.user.id}`, userId: session.user.id };
}
export async function getGoogleCalendarStatus(central = false): Promise<CalendarSyncStatus> {
  const { target, userId } = await authorizedTarget(central);
  const connected = central ? centralCalendarConfigured() : Boolean(await personalCalendarAccount(userId));
  const [row] = await db.select().from(googleCalendarSync).where(eq(googleCalendarSync.target, target));
  return { connected, configured: central ? centralCalendarConfigured() : true,
    pending: Boolean(row?.requestedAt && row.requestedAt > minutesFrom(-15)),
    lastSyncedAt: row?.lastSyncedAt?.toISOString() ?? null, error: row?.error ?? null };
}
export async function requestGoogleCalendarSync(central = false) {
  const { target, userId } = await authorizedTarget(central);
  if (central ? !centralCalendarConfigured() : !await personalCalendarAccount(userId)) return { ok: false };
  await db.insert(googleCalendarSync).values({ target, userId: central ? null : userId }).onConflictDoNothing();
  const requestedAt = new Date();
  const claimed = await db.update(googleCalendarSync).set({ requestedAt, error: null }).where(and(eq(googleCalendarSync.target, target),
    or(isNull(googleCalendarSync.requestedAt), lt(googleCalendarSync.requestedAt, minutesFrom(-15))))).returning({ target: googleCalendarSync.target });
  if (!claimed.length) return { ok: true };
  try {
    await inngest.send({ name: "google-calendar/sync.requested", data: { target } });
    return { ok: true };
  } catch {
    await db.update(googleCalendarSync).set({ requestedAt: null, error: "failed" })
      .where(and(eq(googleCalendarSync.target, target), eq(googleCalendarSync.requestedAt, requestedAt)));
    return { ok: false };
  }
}
export async function connectGoogleCalendar(callbackPath: string) {
  await authorizedTarget(false);
  // Keep OAuth callbacks on the existing schedule surfaces.
  const allowed = ["/dashboard/schedule", "/tutor/schedule", "/calendar"];
  const callbackURL = allowed.includes(callbackPath) ? callbackPath : "/dashboard/schedule";
  const result = await auth.api.linkSocialAccount({ returnHeaders: true, headers: await headers(), body: {
    provider: "google", scopes: [CALENDAR_SCOPE], callbackURL: `${callbackURL}?calendarSync=1`,
    errorCallbackURL: `${callbackURL}?calendarSync=error`, disableRedirect: true,
  } });
  const cookieStore = await cookies();
  for (const [name, cookie] of parseSetCookieHeader(result.headers.get("set-cookie") ?? "")) {
    cookieStore.set(name, cookie.value, toCookieOptions(cookie));
  }
  if (!result.response.url) return { url: null };
  // Better Auth owns state and PKCE. Request durable consent only for this flow.
  const url = new URL(result.response.url);
  url.searchParams.set("access_type", "offline");
  url.searchParams.set("include_granted_scopes", "true");
  url.searchParams.set("prompt", "consent");
  return { url: url.toString() };
}
