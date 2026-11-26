import type { AcademicTransport } from "../../academic/client";
import { createTutorSupportClient } from "../../academic/tutor/support-client";
import type { NativeSessionTransport } from "../../../network/transport";

const sourcePath = "/api/native/academic/tutor-support/discussions";
const adminPath = "/api/native/operations/management/discussions";

function adminDiscussionPath(path: string) {
  const [pathname] = path.split("?", 1);
  if (pathname !== sourcePath && pathname !== sourcePath + "/workspace") throw new Error("Invalid discussion route");
  return adminPath + path.slice(sourcePath.length);
}

export function createAdminDiscussionClient(session: NativeSessionTransport, locale: "id" | "en") {
  const headers = {
    "x-native-operations-user-id": session.scope.accountId,
    "x-native-operations-session-id": session.scope.sessionId,
  };
  async function request(path: string, init: Parameters<NativeSessionTransport["request"]>[1]) {
    const response = await session.request(adminDiscussionPath(path), { ...init, requiredRole: "admin" });
    try {
      const data = await response.json();
      session.assertCurrent();
      return { ok: response.ok, status: response.status, json: async () => data };
    } finally {
      response.dispose();
    }
  }

  const transport: AcademicTransport = {
    accountId: session.scope.accountId, origin: session.scope.origin, locale,
    get: (path, signal) => request(path, { headers, signal, retry: "transient-read" }),
    command: (path, init, signal) => request(path, { method: init.method, signal, body: JSON.stringify(init.body),
      headers: { ...headers, Origin: session.scope.origin, "Idempotency-Key": init.requestId, "Content-Type": "application/json" } }),
  };
  return createTutorSupportClient(transport);
}
