import type { NativeRequestInit, NativeSessionTransport } from "../../network/transport";
import type { AcademicResponse, AcademicTransport } from "./client";

// Transport identity includes the server session, account, origin and locale. Previously
// mounted routes may reuse their outstanding command receipts until this session ends.
const bindings = new WeakMap<NativeSessionTransport, Map<string, AcademicTransport>>();

export function bindAcademicSession(session: NativeSessionTransport, locale: string): AcademicTransport {
  session.assertCurrent();
  let locales = bindings.get(session);
  if (!locales) {
    locales = new Map();
    bindings.set(session, locales);
    session.signal.addEventListener("abort", () => bindings.delete(session), { once: true });
  }
  const bound = locales.get(locale);
  if (bound) return bound;
  async function request(path: string, init: NativeRequestInit): Promise<AcademicResponse> {
    const response = await session.request(path, init);
    try {
      const data: unknown = response.ok || response.headers.get("content-type")?.includes("json")
        ? await response.json() : null;
      session.assertCurrent();
      return {
        ok: response.ok, status: response.status,
        async json() {
          session.assertCurrent();
          return data;
        },
      };
    } finally {
      response.dispose();
    }
  }
  const boundTransport: AcademicTransport = {
    accountId: session.scope.accountId, origin: session.scope.origin, locale,
    get: (path, signal) => request(path, { signal }),
    command: (path, init, signal) => request(path, {
      method: init.method, signal, body: JSON.stringify(init.body),
      headers: {
        "Content-Type": "application/json",
        "Origin": session.scope.origin,
        "Idempotency-Key": init.requestId,
      },
    }),
  };
  locales.set(locale, boundTransport);
  return boundTransport;
}
