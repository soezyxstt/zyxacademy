import { calendarBrowserUrl, calendarLinkState, studentCalendarPath, type StudentCalendarPath } from "../../../../../packages/student-community/calendar-link";
import { NATIVE_BROWSER_SCHEME } from "../../../auth/browser-intent";
import type { NativeSessionTransport } from "../../../network/transport";

type Pending = { nonce: string; path: StudentCalendarPath; expiresAt: number };
type Outcome = "linked" | "cancelled";
const pending = new WeakMap<NativeSessionTransport, Pending>();

type Dependencies = {
  current(): boolean;
  nonce(): string;
  open(url: string): Promise<unknown>;
  now?: () => number;
};

export function bindCalendarLink(session: NativeSessionTransport, { current, nonce, open, now = Date.now }: Dependencies) {
  async function request(operation: "calendar-connect" | "calendar-status" | "calendar-sync", body?: object) {
    if (!current() || !session.isCurrent()) throw new Error("Calendar connection is unavailable");
    const response = await session.request(`/api/native/student/community/${operation}`, {
      method: body ? "POST" : "GET", requiredRole: "murid",
      headers: { Origin: session.scope.origin, ...(body && { "Content-Type": "application/json" }), "x-student-id": session.scope.accountId },
      body: body ? JSON.stringify(body) : undefined,
    });
    try {
      if (!response.ok) throw new Error("Calendar connection is unavailable");
      const value = await response.json();
      if (!current() || !session.isCurrent()) throw new Error("Calendar connection is unavailable");
      return value;
    } finally { response.dispose(); }
  }

  return {
    async connect(path: StudentCalendarPath) {
      if (!current() || !session.isCurrent() || !studentCalendarPath(path)) throw new Error("Calendar connection is unavailable");
      const state = nonce();
      if (!calendarLinkState(state)) throw new Error("Calendar connection is unavailable");
      const value = await request("calendar-connect", { path, scheme: NATIVE_BROWSER_SCHEME, linkState: state });
      const url = calendarBrowserUrl(session.scope.origin, value);
      if (!url || !current() || !session.isCurrent()) throw new Error("Calendar connection is unavailable");

      const attempt = { nonce: state, path, expiresAt: now() + 15 * 60_000 };
      pending.set(session, attempt);
      try { await open(url); }
      catch (failure) {
        if (pending.get(session) === attempt) pending.delete(session);
        throw failure;
      }
    },
    async confirmAndSync() {
      const status = await request("calendar-status");
      if (!status || typeof status !== "object" || !("connected" in status) || status.connected !== true) {
        throw new Error("Calendar connection is not confirmed");
      }
      const result = await request("calendar-sync", {});
      if (!result || typeof result !== "object" || !("ok" in result) || result.ok !== true) {
        throw new Error("Calendar sync is not confirmed");
      }
    },
    takeReturn(path: StudentCalendarPath, state: string | undefined, status: string | undefined): Outcome | null {
      if (!current() || !session.isCurrent() || !calendarLinkState(state) || (status !== "1" && status !== "error")) return null;
      const attempt = pending.get(session);
      if (!attempt || attempt.path !== path || attempt.nonce !== state || attempt.expiresAt <= now()) return null;
      pending.delete(session);
      return status === "1" ? "linked" : "cancelled";
    },
  };
}

export type StudentCalendarLink = ReturnType<typeof bindCalendarLink>;
