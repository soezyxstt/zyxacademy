import type { NativeSessionTransport } from "../../network/transport";
import type { NativeAccountContext } from "../../../../packages/native-session/context";
import type { EvaluationRequest } from "../../../../packages/native-parity/operations/evaluation-contract";

/** The host remounts private screens when the authenticated scope or locale changes. */
export function operationsAccountKey(session: NativeSessionTransport, context: NativeAccountContext) {
  session.assertCurrent();
  if (session.scope.accountId !== context.accountId || session.scope.sessionId !== context.sessionId) {
    throw new Error("Identitas akun tidak cocok.");
  }
  return JSON.stringify([session.scope.origin, context.accountId, context.sessionId, context.locale]);
}

export function createEvaluationRequest(session: NativeSessionTransport): EvaluationRequest {
  return async <Data>(path: string, options: Parameters<EvaluationRequest>[1] = {}) => {
    const method = options.method ?? "GET";
    const response = await session.request(path, {
      method,
      signal: options.signal,
      headers: options.body === undefined ? { Accept: "application/json" } :
        { Accept: "application/json", "Content-Type": "application/json" },
      body: options.body === undefined ? undefined : JSON.stringify(options.body),
    });
    try {
      if (!response.ok) throw Object.assign(new Error("Permintaan evaluasi gagal."), { status: response.status });
      const data = response.status === 204 ? undefined : await response.json();
      session.assertCurrent();
      return data as Data;
    } finally {
      response.dispose();
    }
  };
}
