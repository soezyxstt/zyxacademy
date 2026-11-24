import { and, eq, sql } from "drizzle-orm";
import { createHash } from "node:crypto";
import { db } from "@/db";
import { account, googleCalendarSync } from "@/db/schema";
import { inngest } from "@/jobs/client";
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

async function refreshPersonalGoogleAccessToken(linked: typeof account.$inferSelect): Promise<string> {
  const refreshToken = linked.refreshToken?.trim();
  if (!refreshToken) {
    throw new CalendarApiError(401);
  }
  const clientId = process.env.GOOGLE_CLIENT_ID?.trim();
  const clientSecret = process.env.GOOGLE_CLIENT_SECRET?.trim();
  if (!clientId || !clientSecret) {
    throw new Error("Missing Google OAuth client credentials");
  }
  const response = await fetch("https://oauth2.googleapis.com/token", {
    method: "POST",
    redirect: "error",
    signal: AbortSignal.timeout(15000),
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      client_id: clientId,
      client_secret: clientSecret,
      refresh_token: refreshToken,
      grant_type: "refresh_token",
    }),
  });
  const payload = await response.json().catch(() => null) as {
    access_token?: string;
    expires_in?: number;
    refresh_token?: string;
    error?: string;
  } | null;
  if (!response.ok) {
    if (
      response.status === 400 || response.status === 401
      ? ["invalid_grant", "unauthorized_client", "invalid_token"].includes(payload?.error ?? "")
      : false
    ) {
      throw new CalendarApiError(401);
    }
    throw new Error(`Google token refresh failed (${response.status})`);
  }
  const accessToken = payload?.access_token?.trim();
  if (!accessToken) throw new Error("Missing refreshed token");
  const expiresAt = typeof payload?.expires_in === "number" && payload.expires_in > 0
    ? new Date(Date.now() + payload.expires_in * 1000)
    : undefined;
  await db.update(account).set({
    accessToken,
    ...(expiresAt ? { accessTokenExpiresAt: expiresAt } : {}),
    ...(payload?.refresh_token ? { refreshToken: payload.refresh_token } : {}),
  }).where(eq(account.id, linked.id));
  return accessToken;
}

export async function syncGoogleCalendar(target: string) {
  // Serialized per target by the active queue transport.
  const userId = target === "central" ? undefined : target.startsWith("user:") ? target.slice(5) : "";
  if (userId === "") throw new Error("Invalid calendar target");
  const syncStartedAt = new Date();
  await db.insert(googleCalendarSync).values({ target, userId }).onConflictDoNothing();
  await db.update(googleCalendarSync).set({ requestedAt: syncStartedAt, error: null }).where(eq(googleCalendarSync.target, target));
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
      } catch (error) {
        const code = (error as { body?: { code?: string } } | null)?.body?.code;
        if (["ACCOUNT_NOT_FOUND", "INVALID_REFRESH_TOKEN", "INVALID_GRANT"].includes(code ?? "")) throw new CalendarApiError(401);
        // Better Auth masks all refresh failures (including revoked/expired invalid_grant) as FAILED_TO_GET_ACCESS_TOKEN.
        // Probe Google's token endpoint directly so revoked grants trigger reconnect instead of endless retries.
        if (code === "FAILED_TO_GET_ACCESS_TOKEN") {
          token = await refreshPersonalGoogleAccessToken(linked);
        } else {
          // Unknown failures retry.
          throw error;
        }
      }
      calendarId = "primary";
    } else {
      if (!centralCalendarConfigured()) {
        await db.update(googleCalendarSync).set({ requestedAt: null, error: "failed" }).where(eq(googleCalendarSync.target, target));
        return;
      }
      try {
        token = await getGoogleMeetAccessToken();
      } catch (error) {
        const message = error instanceof Error ? error.message : String(error);
        if (/invalid_grant|unauthorized_client/i.test(message)) {
          throw new CalendarApiError(401);
        }
        throw error;
      }
      calendarId = CENTRAL_CALENDAR_ID;
    }
    const entries = await calendarSource(userId);
    const owner = createHash("sha256").update(`${resolveAuthBaseUrl()}:${target}`).digest("hex");
    await reconcileCalendar(token, calendarId, owner, entries);
    const [updated] = await db
      .update(googleCalendarSync)
      .set({
        lastSyncedAt: new Date(),
        error: null,
        requestedAt: sql`CASE WHEN ${googleCalendarSync.requestedAt} > ${sql.param(syncStartedAt, googleCalendarSync.requestedAt)} THEN ${googleCalendarSync.requestedAt} ELSE NULL END`,
      })
      .where(eq(googleCalendarSync.target, target))
      .returning({ requestedAt: googleCalendarSync.requestedAt });
    if (updated?.requestedAt) {
      await inngest.send({ name: "google-calendar/sync.requested", data: { target } }).catch((err) => {
        console.error("[GOOGLE_CALENDAR_SYNC] Follow-up sync enqueue failed:", target, err);
      });
    }
  } catch (error) {
    const reconnect = error instanceof CalendarApiError && error.requiresReconnect;
    await db.update(googleCalendarSync).set({ error: reconnect ? "reconnect" : "failed", requestedAt: null }).where(eq(googleCalendarSync.target, target));
    // Do not send provider messages or tokens to job logs.
    if (!reconnect) throw new Error("Google Calendar sync failed");
  }
}
