import { and, eq, gt } from "drizzle-orm";
import { db } from "@/db";
import { session as sessions, pengguna } from "@/db/schema";
import { getAuthSession } from "@/lib/auth-session";
import { resolveAuthBaseUrl } from "@/lib/auth-site-url";
import { hasAuthoringActor } from "@/lib/auth/authoring-actor";
import { isSameOriginAdminRequest } from "@/lib/admin-ops-ai/request-origin";
import { OFFLINE_HEADERS, OFFLINE_PROTOCOL_VERSION, type OfflineIdentity, type OfflineLocale } from "./sync-contract";

export class OfflineHttpError extends Error { constructor(readonly status: number, readonly code: string) { super(code); } }
export type OfflineActor = OfflineIdentity & { sessionExpiresAt: number };

/** Cookie sessions can be cached; every payload and 304 must check live authority. */
export async function assertOfflineActorCurrent(actor: Pick<OfflineActor, "accountId" | "sessionId" | "sessionExpiresAt">): Promise<void> {
  const [active] = await db.select({ id: sessions.id }).from(sessions).where(and(eq(sessions.id, actor.sessionId), eq(sessions.userId, actor.accountId), gt(sessions.expiresAt, new Date()))).limit(1);
  if (!active || actor.sessionExpiresAt <= Date.now()) throw new OfflineHttpError(401, "OFFLINE_SESSION_EXPIRED");
  const [identity] = await db.select({ status: pengguna.status }).from(pengguna).where(eq(pengguna.id, actor.accountId)).limit(1);
  if (identity?.status === "suspended") throw new OfflineHttpError(403, "OFFLINE_ACCESS_REVOKED");
}

export async function requireOfflineActor(request: Request, locale: OfflineLocale, admin = false): Promise<OfflineActor> {
  const auth = await getAuthSession();
  if (!auth?.user?.id || !auth.session?.id) throw new OfflineHttpError(401, "OFFLINE_SIGN_IN_REQUIRED");
  const accountId = auth.user.id;
  const expectedAccount = request.headers.get(OFFLINE_HEADERS.accountId) ?? request.headers.get("x-student-id");
  const expectedSession = request.headers.get(OFFLINE_HEADERS.sessionId);
  if ((expectedAccount && expectedAccount !== accountId) || (expectedSession && expectedSession !== auth.session.id)) throw new OfflineHttpError(409, "OFFLINE_ACCOUNT_CHANGED");
  const [session] = await db.select({ id: sessions.id, expiresAt: sessions.expiresAt }).from(sessions).where(and(eq(sessions.id, auth.session.id), eq(sessions.userId, accountId), gt(sessions.expiresAt, new Date()))).limit(1);
  if (!session) throw new OfflineHttpError(401, "OFFLINE_SESSION_EXPIRED");
  const [identity] = await db.select({ status: pengguna.status }).from(pengguna).where(eq(pengguna.id, accountId)).limit(1);
  if (identity?.status === "suspended") throw new OfflineHttpError(403, "OFFLINE_ACCESS_REVOKED");
  if (admin && !(await hasAuthoringActor(accountId, ["admin"]))) throw new OfflineHttpError(403, "OFFLINE_ADMIN_REQUIRED");
  return { protocolVersion: OFFLINE_PROTOCOL_VERSION, accountId, sessionId: session.id, environment: new URL(resolveAuthBaseUrl()).origin, locale, sessionExpiresAt: session.expiresAt.getTime() };
}

export function offlineIdentity(actor: OfflineActor): OfflineIdentity {
  return { protocolVersion: actor.protocolVersion, accountId: actor.accountId, sessionId: actor.sessionId, environment: actor.environment, locale: actor.locale };
}

export function requireOfflineSameOrigin(request: Request) {
  if (!isSameOriginAdminRequest(request)) throw new OfflineHttpError(403, "OFFLINE_ORIGIN_DENIED");
}

export function offlineHeaders(actor?: OfflineIdentity): Headers {
  const headers = new Headers({ "Cache-Control": "private, no-store", "Vary": "Cookie, x-offline-account-id, x-offline-session-id", "X-Content-Type-Options": "nosniff" });
  if (actor) {
    headers.set(OFFLINE_HEADERS.accountId, actor.accountId);
    headers.set(OFFLINE_HEADERS.sessionId, actor.sessionId);
    headers.set(OFFLINE_HEADERS.environment, actor.environment);
    headers.set(OFFLINE_HEADERS.locale, actor.locale);
  }
  return headers;
}

export function offlineError(error: unknown): Response {
  const status = error instanceof OfflineHttpError ? error.status : error instanceof Error && error.message === "OFFLINE_POLICY_CONFLICT" ? 409 : error instanceof Error && error.message === "OFFLINE_ADMIN_REQUIRED" ? 403 : 503;
  const code = error instanceof OfflineHttpError ? error.code : status === 409 ? "OFFLINE_POLICY_CONFLICT" : status === 403 ? "OFFLINE_ADMIN_REQUIRED" : "OFFLINE_TEMPORARILY_UNAVAILABLE";
  return Response.json({ error: status === 401 ? "Masuk kembali untuk memperbarui data." : status === 409 ? "Data berubah. Muat ulang lalu coba lagi." : "Data belum dapat diperbarui.", code }, { status, headers: offlineHeaders() });
}
