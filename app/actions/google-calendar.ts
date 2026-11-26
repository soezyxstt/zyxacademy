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
import { resolveAuthBaseUrl } from "@/lib/auth-site-url";
import { EXPO_STAGING_SCHEME, normalizeCalendarLinkScheme } from "@/lib/native/expo-auth-config";
import { studentCalendarPath } from "@/packages/student-community/calendar-link";
import {
  extractOAuthStateSetCookies,
  issueNativeGoogleLinkHandoff,
} from "@/lib/native/google-link-handoff";

async function authorizedTarget(central: boolean) {
  const session = await auth.api.getSession({ headers: await headers() });
  if (!session) throw new Error("Unauthorized");
  const roles = await getPeranCodes(session.user.id);
  if (central ? !roles.includes("admin") : !roles.some(role => role === "murid" || role === "tutor")) throw new Error("Forbidden");
  return {
    target: central ? "central" : `user:${session.user.id}`,
    userId: session.user.id,
    email: typeof session.user.email === "string" ? session.user.email.trim() : "",
  };
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
export async function connectGoogleCalendar(
  callbackPath: string,
  options?: { nativeScheme?: string | null; linkState?: string },
) {
  const { email } = await authorizedTarget(false);
  // Keep OAuth callbacks on the existing schedule surfaces.
  const allowed = ["/dashboard/schedule", "/tutor/schedule", "/calendar"];
  const callbackURL = allowed.includes(callbackPath) ? callbackPath : "/dashboard/schedule";
  const nativeScheme = normalizeCalendarLinkScheme(options?.nativeScheme, options?.linkState, new URL(resolveAuthBaseUrl()).origin);
  const expo = options?.nativeScheme === EXPO_STAGING_SCHEME;
  if (expo && (!nativeScheme || !studentCalendarPath(callbackURL))) throw new Error("Invalid calendar callback");
  const linkState: Record<string, string> = expo && options?.linkState ? { linkState: options.linkState } : {};

  const successCallbackURL = nativeScheme
    ? `/api/auth/native/google-link/complete?${new URLSearchParams({
        scheme: nativeScheme,
        next: callbackURL,
        param: "calendarSync",
        status: "ok",
        ...linkState,
      }).toString()}`
    : `${callbackURL}?calendarSync=1`;
  const errorCallbackURL = nativeScheme
    ? `/api/auth/native/google-link/complete?${new URLSearchParams({
        scheme: nativeScheme,
        next: callbackURL,
        param: "calendarSync",
        status: "error",
        ...linkState,
      }).toString()}`
    : `${callbackURL}?calendarSync=error`;

  const result = await auth.api.linkSocialAccount({ returnHeaders: true, headers: await headers(), body: {
    provider: "google", scopes: [CALENDAR_SCOPE], callbackURL: successCallbackURL,
    errorCallbackURL, disableRedirect: true,
  } });
  if (!result.response.url) return { url: null, nativeBrowser: false };

  // Better Auth owns state and PKCE. Request durable consent for the signed-in account.
  const url = new URL(result.response.url);
  url.searchParams.set("access_type", "offline");
  url.searchParams.set("include_granted_scopes", "true");
  url.searchParams.set("prompt", "consent");
  if (email) {
    url.searchParams.set("login_hint", email);
  }

  if (nativeScheme) {
    const token = await issueNativeGoogleLinkHandoff({
      googleUrl: url.toString(),
      setCookies: extractOAuthStateSetCookies(result.headers),
    });
    return {
      url: `/api/auth/native/google-link/start?token=${encodeURIComponent(token)}`,
      nativeBrowser: true,
    };
  }

  const rawSetCookies = typeof result.headers.getSetCookie === "function"
    ? result.headers.getSetCookie()
    : [];
  const webSetCookies = rawSetCookies.length > 0
    ? rawSetCookies
    : [result.headers.get("set-cookie") ?? ""].filter(Boolean);
  const cookieStore = await cookies();
  for (const rawCookie of webSetCookies) {
    for (const [name, cookie] of parseSetCookieHeader(rawCookie)) {
      cookieStore.set(name, cookie.value, toCookieOptions(cookie));
    }
  }
  return { url: url.toString(), nativeBrowser: false };
}
