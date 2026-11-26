import type { NativeAccountContext } from "../../../packages/native-session/context";
import type { NativeSessionTransport } from "./transport";

export class NativeAccountAccessDenied extends Error {
  constructor() {
    super("Akses akun tidak tersedia.");
    this.name = "NativeAccountAccessDenied";
  }
}

function isAccountContext(data: unknown, session: NativeSessionTransport): data is NativeAccountContext {
  if (!data || typeof data !== "object") return false;
  if (!("accountId" in data) || data.accountId !== session.scope.accountId ||
      !("sessionId" in data) || data.sessionId !== session.scope.sessionId ||
      !("locale" in data) || (data.locale !== "id" && data.locale !== "en") ||
      !("roles" in data) || !Array.isArray(data.roles) || data.roles.length === 0 ||
      !data.roles.every(role => role === "admin" || role === "tutor" || role === "murid")) return false;
  if ("display" in data && (!data.display || typeof data.display !== "object" ||
    !("name" in data.display) || typeof data.display.name !== "string" ||
    !("email" in data.display) || typeof data.display.email !== "string")) return false;
  const dashboard = data.roles.includes("admin") ? "/admin" : data.roles.includes("tutor") ? "/tutor" : "/dashboard";
  return "dashboard" in data && data.dashboard === dashboard;
}

export async function loadNativeAccountContext(session: NativeSessionTransport, signal?: AbortSignal): Promise<NativeAccountContext> {
  const response = await session.request("/api/native/context", { signal, retry: "transient-read" });
  try {
    if (response.status === 401 || response.status === 403) throw new NativeAccountAccessDenied();
    if (!response.ok) throw new Error("Konteks akun belum tersedia.");
    const data = await response.json();
    session.assertCurrent();
    if (!isAccountContext(data, session)) throw new Error("Identitas akun tidak cocok.");
    return data;
  } finally {
    response.dispose();
  }
}
