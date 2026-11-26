import { isPersonalAccountRequest, personalAccountSessionHeader } from "../../../../packages/student-community/account-access";
import type { StudentRequest, StudentSession } from "./contracts";

/** The host supplies a transport bound to the account's credentials and origin.
 * Keep that binding on every request, including retries and legacy HTTP handlers. */
export function bindStudentRequest(session: StudentSession, transport: StudentRequest): StudentRequest {
  return async (path, init) => {
    if (!path.startsWith("/api/") || /[\\#\u0000-\u001f]/.test(path)) throw new Error("Invalid Student API path");
    const segments = path.split("?", 1)[0].split("/").slice(1).map(decodeURIComponent);
    if (segments.some(segment => !segment || segment === "." || segment === ".." || /[/\\]/.test(segment))) {
      throw new Error("Invalid Student API path");
    }
    const url = new URL(path, session.origin);
    if (url.origin !== new URL(session.origin).origin || !url.pathname.startsWith("/api/")) {
      throw new Error("Invalid Student API path");
    }
    const headers = new Headers(init?.headers);
    const personal = isPersonalAccountRequest((init?.method ?? "GET").toUpperCase(), url.pathname);
    if (session.role !== "student" && (!personal || !session.sessionId)) throw new Error("Invalid account API request");
    if (personal && session.sessionId) headers.set(personalAccountSessionHeader, session.sessionId);
    headers.set("x-student-id", session.userId);
    headers.set("x-app-locale", session.locale);
    return transport(url.pathname + url.search, { ...init, headers, redirect: "error", cache: "no-store" });
  };
}
